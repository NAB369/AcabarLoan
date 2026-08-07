import { createContext, useContext, useReducer, useEffect, useCallback } from 'react'
import {
  INITIAL_CUSTOMERS, INITIAL_LOANS, INITIAL_EXPENSES, INITIAL_INCOMES,
  INITIAL_ACCOUNTS, INITIAL_SYSTEM_USERS, INITIAL_AUDIT_LOGS, INITIAL_ROLE_MATRIX, INITIAL_PERMISSION_LABELS,
  INITIAL_COMPANY_PROFILE, INITIAL_CHART_OF_ACCOUNTS, INITIAL_REAL_BANK_ACCOUNTS,
  INITIAL_JOURNAL_ENTRIES, INITIAL_CASH_TRANSFERS, INITIAL_EMPLOYEES,
  INITIAL_INTEGRATIONS,
  backfillStatementAnalysis
} from '../data/mockData'
import { formatDateDisplay, shiftISODate, daysBetweenISO, auditStamp } from '../utils/format'

// v5: chart-of-accounts replaced by Main Account + sub-accounts (accounts), expenses gained
// an approval status, incomes gained a source field
// v6: the seeded customers/loans gained the documents, collateral detail, party income
// and expense records, CBC report figures and repayment schedules the views read — a v5
// install would otherwise keep its old sparse copy and never show any of it. Bumping the
// key starts that install from the new seed data.
const STORAGE_KEY = 'acabar-state-v6'

// Built-in fee categories that now have their own dedicated rate field — a custom fee
// with one of these names is leftover from before that field existed and would otherwise
// double up with (or bypass the loan-type gating of) the built-in fee.
const BUILT_IN_FEE_NAMES = new Set([
  'interest fee', 'admin fee', 'insurance fee', 'lawyer fee', 'ministry fee',
  'ministry of public works and transport',
])

// Customer codes used to be stored as "CID-000001" — the CID column/register form now
// shows that prefix only in the UI, while the stored code is the plain zero-padded number.
// Scrub any old-format value (customer.code, loan.customerCode, co-borrower/guarantor
// customerCode, etc.) still sitting in a saved install's localStorage.
function stripCidPrefixes(value) {
  if (Array.isArray(value)) return value.map(stripCidPrefixes)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k in value) out[k] = stripCidPrefixes(value[k])
    return out
  }
  if (typeof value === 'string') {
    const m = value.match(/^CID-(\d+)$/)
    return m ? m[1] : value
  }
  return value
}

// Repayment postings used to credit the Repayment Account (5010) the gross amount collected
// while Account Receivable was *also* credited the principal portion, against a single bank
// debit — so every repayment wrote an entry whose credits exceeded its debits by exactly that
// principal, and overstated 5010 by the same amount. RECORD_REPAYMENT now credits 5010 only
// the income half, and RECORD_REMAINDER (pure principal) credits it nothing. An install that
// saved the old shape still holds those entries, so they are rebalanced on load and 5010 is
// walked back by the principal it double-counted — leaving the ledger self-consistent instead
// of carrying a permanent imbalance the System Operations verification would keep refusing.
// Only entries that actually carry a 5010 line are touched; anything else is left as found.
function repairRepaymentEntries(entries, chartOfAccounts) {
  if (!entries?.length) return { entries, chartOfAccounts }
  const AR_CODES = new Set(['1130', '1131'])
  const round2 = n => Math.round(n * 100) / 100
  let correction = 0
  const repaired = entries.map(e => {
    if (e.entryType !== 'Loan Repayment' || !Array.isArray(e.lines)) return e
    if (!e.lines.some(l => l.accountCode === '5010')) return e
    const debit = e.lines.reduce((s, l) => s + (l.debit || 0), 0)
    const credit = e.lines.reduce((s, l) => s + (l.credit || 0), 0)
    if (Math.abs(debit - credit) <= 0.005) return e
    const arCredit = e.lines
      .filter(l => AR_CODES.has(l.accountCode))
      .reduce((s, l) => s + (l.credit || 0), 0)
    // Whatever the payment covered beyond principal is the income half — nil on a remainder.
    const income = round2(debit - arCredit)
    const previous = e.lines
      .filter(l => l.accountCode === '5010')
      .reduce((s, l) => s + (l.credit || 0), 0)
    correction = round2(correction + (income - previous))
    return {
      ...e,
      lines: e.lines
        .map(l => l.accountCode === '5010' ? { ...l, credit: income } : l)
        .filter(l => (l.debit || 0) > 0.005 || (l.credit || 0) > 0.005),
    }
  })
  if (!chartOfAccounts?.length || Math.abs(correction) <= 0.005) {
    return { entries: repaired, chartOfAccounts }
  }
  return {
    entries: repaired,
    chartOfAccounts: chartOfAccounts.map(a =>
      a.code === '5010' ? { ...a, balance: round2((a.balance || 0) + correction) } : a
    ),
  }
}

function loadPersistedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return {}
    const p = stripCidPrefixes(JSON.parse(saved))
    const feeSettings = p.feeSettings
      ? { ...p.feeSettings, customFees: (p.feeSettings.customFees || []).filter(f => !BUILT_IN_FEE_NAMES.has((f.name || '').toLowerCase())) }
      : null
    // "Car Loan" was renamed to "Vehicle Loan" — carry the rename forward for installs that already saved the old name.
    // Vehicle Loan was also missing from the seed product list for a while, so backfill it into
    // any saved install that doesn't already have it (renamed or otherwise).
    const loanProducts = p.loanProducts
      ? (() => {
          const renamed = p.loanProducts.map(prod => prod.name === 'Car Loan' ? { ...prod, name: 'Vehicle Loan' } : prod)
          return renamed.some(prod => prod.name === 'Vehicle Loan')
            ? renamed
            : [...renamed, { name: 'Vehicle Loan', rate: 13, maxAmount: 30000 }]
        })()
      : null
    // Repayment income, its late fees, and the seed interest/fee/penalty demo rows used to
    // post to ACC-LOAN before ACC-REPAYMENT existed — ACC-LOAN is disbursement-only now.
    // RP-*/LF-* codes are unique to the repayment flow; INC-000001..007 are the fixed seed
    // demo codes. Reassign any still sitting on ACC-LOAN over to ACC-REPAYMENT and carry
    // their balance across.
    const SEED_REPAYMENT_INCOME_CODES = new Set([
      'INC-000001', 'INC-000002', 'INC-000003', 'INC-000004', 'INC-000005', 'INC-000006', 'INC-000007',
    ])
    const isRepaymentIncome = inc => /^(RP-|LF-)/.test(inc.code || '') || SEED_REPAYMENT_INCOME_CODES.has(inc.code)
    const repaymentMigrationAmount = (p.incomes || [])
      .filter(inc => inc.account === 'ACC-LOAN' && isRepaymentIncome(inc))
      .reduce((s, inc) => s + (inc.amount || 0), 0)
    const incomes = p.incomes
      ? p.incomes.map(inc => (inc.account === 'ACC-LOAN' && isRepaymentIncome(inc))
          ? { ...inc, account: 'ACC-REPAYMENT' }
          : inc)
      : null
    // Carry forward any new default sub-accounts (e.g. Repayment Account) that were added
    // after this install last saved its account list, so existing installs pick them up.
    const accounts = p.accounts
      ? [...p.accounts, ...INITIAL_ACCOUNTS.filter(a => !p.accounts.some(saved => saved.code === a.code))]
          .map(a => {
            if (repaymentMigrationAmount <= 0) return a
            if (a.code === 'ACC-LOAN') return { ...a, balance: (a.balance || 0) - repaymentMigrationAmount }
            if (a.code === 'ACC-REPAYMENT') return { ...a, balance: (a.balance || 0) + repaymentMigrationAmount }
            return a
          })
      : null
    // Bank accounts used to be one dual-currency record (numberUSD/numberKHR +
    // glCodeUSD/glCodeKHR). They are now one record per currency, so split any
    // legacy entry into its USD and KHR halves on load.
    const realBankAccounts = p.realBankAccounts
      ? p.realBankAccounts.flatMap(a => {
          if (a.currency) return [a]
          return ['USD', 'KHR'].map(cur => ({
            id: `${a.id}-${cur}`,
            name: a.name,
            currency: cur,
            number: (cur === 'KHR' ? a.numberKHR : a.numberUSD) || a.number || '',
            glCode: (cur === 'KHR' ? a.glCodeKHR : a.glCodeUSD) || a.glCode || '',
          }))
        })
      : null
    const repaired = repairRepaymentEntries(p.journalEntries, p.chartOfAccounts)
    const renumbered = renumberFeeIncome(repaired.chartOfAccounts, repaired.entries)
    return {
      customers: p.customers || null,
      // Income verification reads the monthly figures off the bank statement, which loans
      // saved before the reader existed carry nothing for — see backfillStatementAnalysis.
      loanApplications: p.loanApplications ? backfillStatementAnalysis(p.loanApplications) : null,
      incomes,
      expenses: p.expenses || null,
      notifications: p.notifications || null,
      cashTransfers: p.cashTransfers || null,
      accounts,
      feeSettings,
      loanProducts,
      activeStatement: p.activeStatement || null,
      chartOfAccounts: renumbered.chartOfAccounts || null,
      realBankAccounts,
      journalEntries: renumbered.journalEntries || null,
      employees: p.employees || null,
      payrollRuns: p.payrollRuns || null,
      auditLogs: p.auditLogs || null,
      systemUsers: p.systemUsers || null,
      integrations: p.integrations || null,
      customGeo: p.customGeo || null,
      // Column visibility per register. Additive — an install saved before the column picker
      // existed has neither, and falls back to showing every column.
      customerVisibleColumns: p.customerVisibleColumns || null,
      loanVisibleColumns: p.loanVisibleColumns || null,
      // Which business day is open (or was last closed) and the batch history behind it.
      // Both are additive — an install saved before System Operations existed has neither,
      // and falls back to a closed day with no history rather than needing a key bump.
      businessDay: p.businessDay || null,
      batchRuns: p.batchRuns || null,
    }
  } catch { return {} }
}

// v6 shipped loan fee income at 5030/5031, in the 5000 income band alongside interest. The
// chart now bands fee income at 4010/4011 so a fee-heavy book reads apart from an interest-heavy
// one in the P&L. An install that already posted a restructuring fee carries the old code on its
// saved accounts and on the journal lines that reference them, so both are rewritten together —
// renaming only the account would leave those lines pointing at a code no longer in the chart.
const FEE_CODE_MOVES = { '5030': '4010', '5031': '4011' }

function renumberFeeIncome(chartOfAccounts, journalEntries) {
  const moved = code => FEE_CODE_MOVES[code] || code
  const touchesChart = (chartOfAccounts || []).some(a => FEE_CODE_MOVES[a.code])
  const touchesEntries = (journalEntries || []).some(e => (e.lines || []).some(l => FEE_CODE_MOVES[l.accountCode]))
  if (!touchesChart && !touchesEntries) return { chartOfAccounts, journalEntries }

  return {
    // A saved 5030 becomes 4010 and keeps its balance. If the install somehow holds both, the
    // old row is dropped rather than duplicating the account under two codes.
    chartOfAccounts: chartOfAccounts && (() => {
      const seen = new Set()
      return chartOfAccounts
        .map(a => (FEE_CODE_MOVES[a.code] ? { ...a, code: moved(a.code) } : a))
        .filter(a => (seen.has(a.code) ? false : seen.add(a.code)))
    })(),
    journalEntries: journalEntries && journalEntries.map(e => (
      (e.lines || []).some(l => FEE_CODE_MOVES[l.accountCode])
        ? { ...e, lines: e.lines.map(l => ({ ...l, accountCode: moved(l.accountCode) })) }
        : e
    )),
  }
}

const persisted = loadPersistedState()

// An install that already saved a chart of accounts keeps every account and balance it
// has — but accounts added to the seed since then are appended, so a new control account
// (the loan payable/receivable pair, say) reaches existing installs instead of only
// appearing on a fresh one. Matched on code; a user-renamed account is left alone.
function mergeSeededAccounts(saved) {
  if (!saved?.length) return INITIAL_CHART_OF_ACCOUNTS
  const codes = new Set(saved.map(a => a.code))
  const missing = INITIAL_CHART_OF_ACCOUNTS.filter(a => !codes.has(a.code))
  const merged = missing.length ? [...saved, ...missing] : saved

  // The chart used to be flat: every account was filed at the root with no parentCode, so the
  // configuration tree drew one long run of codes with no band above them. The seed now files
  // each account under its band (1010 under 1000 Asset, and so on). An install that saved the
  // flat version keeps its own copies, which would still draw flat — so a saved account with
  // NO parent takes the seed's. One the operator has deliberately re-parented is left alone:
  // an empty parentCode is the only thing read as "never filed", not as a choice.
  const seededParent = new Map(INITIAL_CHART_OF_ACCOUNTS.map(a => [a.code, a.parentCode]))
  return merged.map(a => (
    (a.parentCode || '').trim() || !seededParent.get(a.code)
      ? a
      : { ...a, parentCode: seededParent.get(a.code) }
  ))
}

// Same idea for the real bank accounts: a saved install keeps the cards it has (renames,
// account numbers, GL links and all), and seeded accounts it has never seen — the
// receivable pair, say — are appended rather than only showing up on a fresh install.
// Matched on id, so a card the user deleted stays deleted only until the seed changes.
function mergeSeededBankAccounts(saved) {
  if (!saved?.length) return INITIAL_REAL_BANK_ACCOUNTS
  const ids = new Set(saved.map(a => a.id))
  const missing = INITIAL_REAL_BANK_ACCOUNTS.filter(a => !ids.has(a.id))
  return missing.length ? [...saved, ...missing] : saved
}

// Which connections exist, what they are called and what they are able to exchange comes
// from the build; the credentials, switches and history belong to the install. So the seed
// is walked (a provider the build dropped goes with it) and only the user-set fields are
// carried over from what was saved — a scope the build retired or renamed disappears
// instead of lingering beside its replacement, keeping whatever it was toggled to.
// A connection added from the catalogue (Integrations → Add Integration) has no seed to be
// walked against, so it is carried over whole — it *is* install data, definition included.
function mergeSeededIntegrations(saved) {
  if (!saved?.length) return INITIAL_INTEGRATIONS
  const added = saved.filter(s => s.fromCatalogue && !INITIAL_INTEGRATIONS.some(seed => seed.id === s.id))
  return [...INITIAL_INTEGRATIONS.map(seed => {
    const s = saved.find(i => i.id === seed.id)
    if (!s) return seed
    return {
      ...seed,
      status: s.status ?? seed.status,
      environment: s.environment ?? seed.environment,
      baseUrl: s.baseUrl ?? seed.baseUrl,
      account: s.account ?? seed.account,
      apiKey: s.apiKey ?? seed.apiKey,
      autoSync: s.autoSync ?? seed.autoSync,
      syncEvery: s.syncEvery ?? seed.syncEvery,
      lastSyncAt: s.lastSyncAt ?? seed.lastSyncAt,
      // Which provider account this install registered/signed in as — install data, like
      // the credentials beside it. A seeded provider that was signed out stays signed out.
      login: s.login ?? seed.login,
      // The uploaded KHQR and its on/off switch belong to the install, not the build — the
      // seed ships them empty/off, so without carrying them across every reload would drop
      // the merchant's own code back to nothing.
      khqrEnabled: s.khqrEnabled ?? seed.khqrEnabled,
      khqrImage: s.khqrImage ?? seed.khqrImage,
      khqrSource: s.khqrSource ?? seed.khqrSource,
      khqrCurrency: s.khqrCurrency ?? seed.khqrCurrency,
      logs: s.logs || seed.logs,
      scopes: seed.scopes.map(scope => {
        const savedScope = (s.scopes || []).find(x => x.id === scope.id)
        return savedScope ? { ...scope, enabled: savedScope.enabled } : scope
      }),
    }
  }), ...added]
}

const INITIAL_LOAN_PRODUCTS = [
  { name: 'Business Loan',     rate: 12, maxAmount: 50000 },
  { name: 'Agricultural Loan', rate: 10, maxAmount: 20000 },
  { name: 'Personal Loan',     rate: 15, maxAmount: 10000 },
  { name: 'SME Loan',          rate: 12, maxAmount: 50000 },
  { name: 'Housing Loan',      rate: 10, maxAmount: 100000 },
  { name: 'Land Loan',         rate: 11, maxAmount: 80000 },
  { name: 'Vehicle Loan',      rate: 13, maxAmount: 30000 },
]

const INITIAL_STATE = {
  // navigation
  activeTab: 'dashboard',
  activeSettingsMenu: 'user-management',
  activeUserMgmtSubMenu: 'user-accounts',
  settingsOpen: false,
  // ui
  currency: 'USD',
  darkMode: localStorage.getItem('acabar-dark-mode') === '1',
  language: localStorage.getItem('acabar-lang') || 'en',
  toasts: [],
  // customer modal
  customerWizardOpen: false,
  customerWizardStep: 1,
  editingCustomerCode: null,
  deletePendingCode: null,
  previewCustomerCode: null,
  customerPage: 1,
  customerPageSize: 12,
  customerSearch: '',
  customerDateFilter: '',
  // Which columns the operator left visible in the customer register. Persisted, and kept out
  // of SET_TAB's reset list, because a column hidden on purpose reappearing on the next visit
  // reads as the filter being broken. null = show every column.
  customerVisibleColumns: persisted.customerVisibleColumns || null,
  // loan
  loanWizardOpen: false,
  loanWizardStep: 1,
  activeLoan: null,
  loanReviewOpen: false,
  editingLoanRef: null,
  loanWizardPrefillCustomerCode: null,
  loanDetailIdx: null,
  loanOverviewOpen: false,
  loanOverviewTab: 'Overview',
  loanPreviewOpen: false,
  loanPreviewTab: 'Overview',
  loanQuickPreviewOpen: false,
  loanQuickPreviewTab: 'Repayment Reminder',
  // Same as customerVisibleColumns, for the loan application register.
  loanVisibleColumns: persisted.loanVisibleColumns || null,
  // accounting
  activeStatement: persisted.activeStatement || 'pl',
  // null = no section expanded; the Accounting page shows just its section cards
  accountingTab: null,
  transactionModalOpen: false,
  transactionModalType: 'Income',
  cashTransferModalOpen: false,
  accountHistoryCode: null,
  accountHistoryCurrency: null,
  glFilter: 'all',
  glAccountFilter: 'all',
  // reports
  reportTab: 'listing',
  // settings
  selectedRole: 'Credit Manager',
  currentRole: 'Admin',
  userStatusFilter: 'all',
  // data
  customers: persisted.customers || INITIAL_CUSTOMERS,
  loanApplications: persisted.loanApplications || INITIAL_LOANS,
  expenses: persisted.expenses || INITIAL_EXPENSES,
  incomes: persisted.incomes || INITIAL_INCOMES,
  notifications: persisted.notifications || [],
  // Same length check as journalEntries — an install that never made a transfer gets the
  // seeded ones, one that did keeps its own.
  cashTransfers: persisted.cashTransfers?.length ? persisted.cashTransfers : INITIAL_CASH_TRANSFERS,
  accounts: persisted.accounts || INITIAL_ACCOUNTS,
  // Sign-in accounts, editable in Settings → User Management → User Accounts. Kept across
  // reloads for the same reason the audit trail is: an account added here would otherwise be
  // gone on refresh. Length-checked so an install that once saved an empty list still gets
  // the seed back rather than a register with no admin in it.
  systemUsers: persisted.systemUsers?.length ? persisted.systemUsers : INITIAL_SYSTEM_USERS,
  // The system audit trail. Logged actions are written here as they happen (see
  // ADD_AUDIT_LOG) and read back by the module logs, so it is kept across reloads —
  // an audit trail that is forgotten on refresh audits nothing.
  auditLogs: persisted.auditLogs?.length ? persisted.auditLogs : INITIAL_AUDIT_LOGS,
  roleMatrix: INITIAL_ROLE_MATRIX,
  permissionLabels: INITIAL_PERMISSION_LABELS,
  // Fee rates (% of loan principal) used to auto-calculate the Benefit to the Bank tab
  feeSettings: persisted.feeSettings || {
    adminFeeRate: 1,
    insuranceFeeRate: 0.5,
    lawyerFeeRate: 0.25,
    ministryFeeRate: 0.1,
    transportMinistryFeeRate: 0.1,
    customFees: [],
  },
  // Loan products offered — configurable in System Settings, selectable when creating/editing a loan
  loanProducts: persisted.loanProducts || INITIAL_LOAN_PRODUCTS,
  // Company identity — configurable in System Settings, shown on the sidebar, receipts, and report/PDF headers
  companyProfile: persisted.companyProfile || INITIAL_COMPANY_PROFILE,
  // General ledger: NBC-style chart of accounts, real bank accounts (one record per
  // bank *per currency*, each linked to its own GL code), and posted journal/single-entry
  // adjustments
  chartOfAccounts: mergeSeededAccounts(persisted.chartOfAccounts),
  realBankAccounts: mergeSeededBankAccounts(persisted.realBankAccounts),
  // An install that has never posted a journal entry gets the seeded ones; anything it did
  // post is kept. Checked on length, not existence — earlier versions saved an empty array,
  // and `[] || seed` would keep that empty array forever.
  journalEntries: persisted.journalEntries?.length ? persisted.journalEntries : INITIAL_JOURNAL_ENTRIES,
  // Payroll staff register — the Employee Information page of Payroll Management. Checked
  // on length for the same reason as journalEntries: an install that saved an empty list
  // once would otherwise never see the seed again.
  employees: persisted.employees?.length ? persisted.employees : INITIAL_EMPLOYEES,
  // Payroll runs made so far, newest first. Each carries the lines behind its batch posting.
  payrollRuns: persisted.payrollRuns || [],
  // Third-party connections (WeBill365, WeUMS) — credentials, what each is allowed to
  // sync and its exchange history. See mergeSeededIntegrations.
  integrations: mergeSeededIntegrations(persisted.integrations),
  // Address values an operator added because the built-in Cambodian geo lists didn't carry
  // them. KH_DISTRICTS covers every province, but KH_COMMUNES only reaches the districts the
  // app's own records use and KH_VILLAGES is explicitly not a gazetteer — a customer living
  // outside that coverage still has to be registrable. Kept per install so a commune added
  // while registering one customer is on the list for the next.
  //
  // Scoped by parent rather than by name alone: district names repeat across provinces
  // (Samraong is in both Oddar Meanchey and Takéo, Memot in both Kampong Cham and Tboung
  // Khmum), so an unscoped key would surface a custom commune under the wrong province.
  customGeo: persisted.customGeo || { provinces: [], districts: {}, communes: {}, villages: {} },
  // ─── system operations ───────────────────────────────────────────────────
  systemOpsOpen: false,
  // The business-day gate. Start of Day opens a day, End of Day closes it, and End of Month
  // needs every day closed. A fresh install starts closed with no date — the header shows
  // "Day closed" until an operator opens one. Nothing else in the app is blocked by this;
  // it records and displays where the back office is in its daily cycle.
  businessDay: persisted.businessDay || { date: null, status: 'closed', openedAt: null, openedBy: null, closedAt: null, closedBy: null },
  // What each batch verified and posted, newest first — the audit trail behind the day.
  // End of Month reads it back to refuse closing a period it has already closed.
  batchRuns: persisted.batchRuns || [],
}

// Cash moves through the real bank account held in the loan's currency AND branch —
// each branch can hold its own real-world account, so a loan's cash should land in
// its own branch's account rather than whichever one happens to be first on file.
// An account with no `branch` set is the shared/default one every branch without a
// dedicated account falls back to (this is also what every account looked like before
// branches existed, so an install that has never branch-tagged anything keeps behaving
// exactly as before). Only when accounts exist for this currency but none of them are
// usable for this branch (no branch match, no shared fallback) does this return null —
// the caller must refuse the transaction rather than silently fund it from the wrong
// branch's account. `fallbackCode` (the legacy ACC-* bucket) is used only when NO
// account at all exists yet for this currency, i.e. real bank accounts haven't been
// configured on this install.
function fundingGLCode(realBankAccounts, currency, branch, fallbackCode) {
  const list = (realBankAccounts || []).filter(a => a.currency === currency)
  if (!list.length) return fallbackCode
  const branchMatch = branch && list.find(a => a.branch === branch)
  const sharedMatch = list.find(a => !a.branch)
  return (branchMatch || sharedMatch)?.glCode || null
}

// UI-level mirror of fundingGLCode's refusal case, so a disburse/repayment button can
// warn and block *before* dispatching rather than relying solely on the reducer's
// silent backstop. Only false when accounts exist for this currency but none serve
// this branch — an install that hasn't configured any real bank account yet (or hasn't
// branch-tagged any of them) is never blocked by this.
export function hasFundingAccount(realBankAccounts, currency, branch) {
  const list = (realBankAccounts || []).filter(a => a.currency === currency)
  if (!list.length) return true
  return list.some(a => a.branch === branch || !a.branch)
}

// The two loan-book control accounts in the chart of accounts. Account Payable carries
// principal the company has approved but not yet handed over; Account Receivable carries
// principal already out with borrowers. Together they cover a loan's whole life: approval
// credits the payable, disbursement moves it to the receivable, and each repayment credits
// the receivable back down by whatever principal it retired.
const AP_LOAN_CODE = '2030'
const AR_LOAN_CODE = '1130'

// The account an expense is funded from lives in one of two places: the chart of accounts by
// GL code, or the legacy ACC-* sub-account list that older postings still name. Whichever
// holds the code is the one carrying the balance, so both are searched.
export function expenseFundingAccount(state, code) {
  if (!code) return null
  return state.chartOfAccounts.find(a => a.code === code)
      || state.accounts.find(a => a.code === code)
      || null
}

// Whether an account holds enough to release an expense. An expense naming an account that
// exists in neither list has no balance to check and so is not blocked — that is how postings
// against retired account codes behaved before, and blocking them would strand them as
// unapprovable. The cent of tolerance keeps float arithmetic from failing an exact match.
export function canFundExpense(state, exp) {
  const funding = expenseFundingAccount(state, exp?.account)
  if (!funding) return true
  return (funding.balance || 0) + 0.005 >= (exp?.amount || 0)
}

// Applies signed movements to chart-of-account balances in one pass. Amounts are added,
// so a debit against a payable is passed as a negative. Codes with a zero movement are
// skipped, which keeps callers from having to branch on "did anything change".
function applyGlMovements(chartOfAccounts, movements) {
  const deltas = new Map(Object.entries(movements).filter(([, v]) => Math.abs(v) > 0.005))
  if (!deltas.size) return chartOfAccounts
  return chartOfAccounts.map(a =>
    deltas.has(a.code) ? { ...a, balance: Math.round(((a.balance || 0) + deltas.get(a.code)) * 100) / 100 } : a
  )
}

// Approving a loan for release is the moment the company owes the borrower the money, so
// the principal is credited to Account Payable then and debited back out on disbursement.
// Keyed off the status *transition* rather than the status itself, so re-saving a loan
// that is already approved never posts the commitment twice — and a loan that is later
// rejected out of 'Waiting Disburse' takes its payable back with it.
function loanPayableDelta(prevStatus, nextStatus, amount) {
  const was = prevStatus === 'Waiting Disburse'
  const is = nextStatus === 'Waiting Disburse'
  if (was === is) return 0
  return is ? (amount || 0) : -(amount || 0)
}

function reducer(state, action) {
  switch (action.type) {
    // Switching sidebar modules always returns to that module's landing view —
    // leaving a loan's detail/overview/quick-preview open and coming back via the
    // sidebar shouldn't drop the user back into the sub-view they left. Account
    // Management works the same way: its landing view is the section cards with
    // nothing expanded, so the open section and its modals close too.
    case 'SET_TAB': return {
      ...state,
      activeTab: action.tab,
      loanReviewOpen: false,
      loanDetailIdx: null,
      loanOverviewOpen: false,
      loanPreviewOpen: false,
      loanQuickPreviewOpen: false,
      loanWizardPrefillCustomerCode: null,
      activeLoan: null,
      accountingTab: null,
      accountHistoryCode: null,
      cashTransferModalOpen: false,
      transactionModalOpen: false,
      customerWizardOpen: false,
      previewCustomerCode: null,
      deletePendingCode: null,
      editingCustomerCode: null,
    }
    case 'SET_CURRENCY': return { ...state, currency: action.currency }
    case 'TOGGLE_DARK_MODE': return { ...state, darkMode: !state.darkMode }
    case 'TOGGLE_LANGUAGE': return { ...state, language: state.language === 'en' ? 'kh' : 'en' }

    // Toasts
    case 'ADD_TOAST': return { ...state, toasts: [...state.toasts, action.toast] }
    case 'REMOVE_TOAST': return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) }

    // Settings
    case 'OPEN_SETTINGS': return { ...state, settingsOpen: true }
    case 'CLOSE_SETTINGS': return { ...state, settingsOpen: false }
    case 'SET_SETTINGS_MENU': return { ...state, activeSettingsMenu: action.menu }
    case 'SET_USER_MGMT_SUBMENU': return { ...state, activeUserMgmtSubMenu: action.sub, activeSettingsMenu: 'user-management' }
    case 'SET_SELECTED_ROLE': return { ...state, selectedRole: action.role }
    case 'SET_CURRENT_ROLE': return { ...state, currentRole: action.role }
    case 'TOGGLE_ROLE_PERMISSION': {
      const matrix = { ...state.roleMatrix }
      matrix[action.role] = { ...matrix[action.role], [action.perm]: !matrix[action.role][action.perm] }
      return { ...state, roleMatrix: matrix }
    }
    // A whole role's column at once — what the preset menu on the permission matrix applies.
    // Only keys the build knows about are written, so a stale preset cannot introduce one.
    case 'SET_ROLE_PERMISSIONS': {
      if (!state.roleMatrix[action.role]) return state
      const perms = Object.fromEntries(
        Object.keys(state.permissionLabels).map(key => [key, !!action.permissions[key]])
      )
      return { ...state, roleMatrix: { ...state.roleMatrix, [action.role]: perms } }
    }
    case 'ADD_ROLE': {
      const role = action.role.trim()
      if (!role || state.roleMatrix[role]) return state
      const blankPerms = Object.fromEntries(Object.keys(state.permissionLabels).map(key => [key, false]))
      return {
        ...state,
        roleMatrix: { ...state.roleMatrix, [role]: blankPerms },
        selectedRole: role,
      }
    }
    case 'ADD_PERMISSION': {
      const key = action.key.trim()
      const label = action.label.trim()
      if (!key || !label || state.permissionLabels[key]) return state
      const roleMatrix = Object.fromEntries(
        Object.entries(state.roleMatrix).map(([role, perms]) => [role, { ...perms, [key]: false }])
      )
      return {
        ...state,
        permissionLabels: { ...state.permissionLabels, [key]: label },
        roleMatrix,
      }
    }
    case 'SET_USER_STATUS_FILTER': return { ...state, userStatusFilter: action.filter }
    case 'UPDATE_FEE_SETTINGS': return { ...state, feeSettings: { ...state.feeSettings, ...action.feeSettings } }
    case 'ADD_CUSTOM_FEE': return {
      ...state,
      feeSettings: { ...state.feeSettings, customFees: [...(state.feeSettings.customFees || []), action.fee] }
    }
    case 'UPDATE_CUSTOM_FEE': return {
      ...state,
      feeSettings: {
        ...state.feeSettings,
        customFees: (state.feeSettings.customFees || []).map((f, i) => i === action.index ? action.fee : f)
      }
    }
    case 'DELETE_CUSTOM_FEE': return {
      ...state,
      feeSettings: {
        ...state.feeSettings,
        customFees: (state.feeSettings.customFees || []).filter((_, i) => i !== action.index)
      }
    }
    case 'UPDATE_COMPANY_PROFILE': return {
      ...state,
      companyProfile: { ...state.companyProfile, ...action.profile }
    }
    // Appended rather than prepended — the register reads as the order accounts were opened
    // in, with the seeded admin still at the top. The panel refuses a username already in
    // use; this guards the same rule so no path can produce two accounts with one name.
    case 'ADD_SYSTEM_USER': return state.systemUsers.some(u => (u.username || '').toLowerCase() === (action.user.username || '').toLowerCase())
      ? state
      : { ...state, systemUsers: [...state.systemUsers, action.user] }
    case 'UPDATE_SYSTEM_USER': return {
      ...state,
      systemUsers: state.systemUsers.map(u => u.username === action.username ? { ...u, ...action.updates } : u)
    }
    case 'ADD_LOAN_PRODUCT': return { ...state, loanProducts: [...state.loanProducts, action.product] }
    case 'UPDATE_LOAN_PRODUCT': return {
      ...state,
      loanProducts: state.loanProducts.map((p, i) => i === action.index ? action.product : p)
    }
    case 'DELETE_LOAN_PRODUCT': return {
      ...state,
      loanProducts: state.loanProducts.filter((_, i) => i !== action.index)
    }

    // Customer wizard
    case 'OPEN_CUSTOMER_WIZARD': return { ...state, customerWizardOpen: true, customerWizardStep: 1, editingCustomerCode: action.code || null }
    case 'CLOSE_CUSTOMER_WIZARD': return { ...state, customerWizardOpen: false, editingCustomerCode: null }
    case 'SET_CUSTOMER_WIZARD_STEP': return { ...state, customerWizardStep: action.step }
    case 'ADD_CUSTOMER': return { ...state, customers: [action.customer, ...state.customers] }
    case 'UPDATE_CUSTOMER': return {
      ...state,
      customers: state.customers.map(c => c.code === action.customer.code ? action.customer : c)
    }
    case 'CONFIRM_DELETE_CUSTOMER': return { ...state, deletePendingCode: action.code }
    case 'CANCEL_DELETE_CUSTOMER': return { ...state, deletePendingCode: null }
    case 'DELETE_CUSTOMER': return {
      ...state,
      customers: state.customers.filter(c => c.code !== action.code),
      deletePendingCode: null
    }
    case 'OPEN_CUSTOMER_PREVIEW': return { ...state, previewCustomerCode: action.code }
    case 'CLOSE_CUSTOMER_PREVIEW': return { ...state, previewCustomerCode: null }
    case 'SET_CUSTOMER_COLUMNS': return { ...state, customerVisibleColumns: action.ids }
    case 'SET_CUSTOMER_PAGE': return { ...state, customerPage: action.page }
    case 'SET_CUSTOMER_SEARCH': return { ...state, customerSearch: action.q, customerPage: 1 }
    case 'SET_CUSTOMER_DATE_FILTER': return { ...state, customerDateFilter: action.date, customerPage: 1 }

    // Loans
    case 'SET_LOAN_COLUMNS': return { ...state, loanVisibleColumns: action.ids }
    case 'OPEN_LOAN_WIZARD': return { ...state, loanWizardOpen: true, loanWizardStep: 1, editingLoanRef: action.ref || null, loanWizardPrefillCustomerCode: action.customerCode || null }
    case 'CLOSE_LOAN_WIZARD': return { ...state, loanWizardOpen: false, editingLoanRef: null, loanWizardPrefillCustomerCode: null }
    case 'SET_LOAN_WIZARD_STEP': return { ...state, loanWizardStep: action.step }
    case 'SUBMIT_LOAN': {
      const exists = state.loanApplications.findIndex(a => a.ref === action.loan.ref)
      const apps = exists >= 0
        ? state.loanApplications.map(a => a.ref === action.loan.ref ? action.loan : a)
        : [action.loan, ...state.loanApplications]
      return { ...state, loanApplications: apps, activeLoan: action.loan, loanWizardOpen: false, loanReviewOpen: false }
    }
    case 'OPEN_LOAN_DETAIL': return { ...state, loanDetailIdx: action.idx }
    case 'CLOSE_LOAN_DETAIL': return { ...state, loanDetailIdx: null }
    case 'OPEN_LOAN_OVERVIEW': return { ...state, loanOverviewOpen: true, activeLoan: action.loan, loanDetailIdx: null, loanOverviewTab: action.tab || 'Overview' }
    case 'CLOSE_LOAN_OVERVIEW': return { ...state, loanOverviewOpen: false, activeLoan: null, loanDetailIdx: null, loanOverviewTab: 'Overview' }
    case 'OPEN_LOAN_PREVIEW': return { ...state, loanPreviewOpen: true, activeLoan: action.loan || state.activeLoan, loanDetailIdx: null, loanPreviewTab: action.tab || 'Overview' }
    case 'CLOSE_LOAN_PREVIEW': return { ...state, loanPreviewOpen: false, activeLoan: null, loanDetailIdx: null, loanPreviewTab: 'Overview' }
    case 'OPEN_LOAN_QUICK_PREVIEW': return { ...state, loanQuickPreviewOpen: true, activeLoan: action.loan, loanQuickPreviewTab: action.tab }
    case 'CLOSE_LOAN_QUICK_PREVIEW': return { ...state, loanQuickPreviewOpen: false, activeLoan: null }
    case 'UPDATE_LOAN': {
      // Final approval is dispatched through here (LoanOverview writes the whole loan
      // back with status 'Waiting Disburse'), so the Account Payable commitment is
      // recognised on the transition rather than in the approval screen.
      const prev = state.loanApplications.find(a => a.ref === action.loan.ref)
      const payable = loanPayableDelta(prev?.status, action.loan.status, action.loan.amount)
      return {
        ...state,
        loanApplications: state.loanApplications.map(a => a.ref === action.loan.ref ? action.loan : a),
        chartOfAccounts: applyGlMovements(state.chartOfAccounts, { [AP_LOAN_CODE]: payable }),
      }
    }
    // Merges `patch` into `loan[field]` against the current state rather than a
    // snapshot the caller might be holding stale (e.g. across an async gap) — avoids
    // clobbering a concurrent UPDATE_LOAN dispatched from the same stale closure.
    case 'PATCH_LOAN_FIELD': return {
      ...state,
      loanApplications: state.loanApplications.map(a =>
        a.ref === action.ref ? { ...a, [action.field]: { ...(a[action.field] || {}), ...action.patch } } : a
      )
    }
    case 'ADVANCE_APPROVAL': {
      if (!state.activeLoan) return state
      const newState = Math.min(3, state.activeLoan.approvalState + 1)
      const actionMap = { 2: 'Credit review passed', 3: 'Final approval granted' }
      const statusMap = { 2: 'Pending Approval', 3: 'Waiting Disburse' }
      const newLoan = {
        ...state.activeLoan,
        approvalState: newState,
        status: statusMap[newState] || state.activeLoan.status,
        approvalHistory: [
          ...state.activeLoan.approvalHistory,
          { stage: newState, action: actionMap[newState] || 'Reviewed', user: 'Admin', timestamp: new Date().toLocaleString('en-GB') }
        ]
      }
      return {
        ...state,
        activeLoan: newLoan,
        loanApplications: state.loanApplications.map(a => a.ref === newLoan.ref ? newLoan : a),
        // Reaching stage 3 puts the loan in 'Waiting Disburse' — the same commitment
        // UPDATE_LOAN posts when approval comes through the loan overview instead.
        chartOfAccounts: applyGlMovements(state.chartOfAccounts, {
          [AP_LOAN_CODE]: loanPayableDelta(state.activeLoan.status, newLoan.status, newLoan.amount),
        }),
      }
    }
    case 'DISBURSE_LOAN': {
      if (!state.activeLoan || state.activeLoan.status === 'Active') return state
      // Money-out gate: the customer's disbursement account (set on their profile at
      // registration) must be on file before any loan can be released to it.
      const customer = state.customers.find(c => c.code === state.activeLoan.customerCode)
      if (!customer?.accountNumber) return state
      const disbursedLoan = {
        ...state.activeLoan,
        status: 'Active',
        approvalState: 3,
        ...(action.remarks ? { approvalReason: action.remarks, rejectionReason: '' } : {}),
        approvalHistory: [
          ...(state.activeLoan.approvalHistory || []),
          { stage: 3, action: action.remarks ? `Loan disbursed: ${action.remarks}` : 'Loan disbursed', user: 'Admin', timestamp: new Date().toLocaleString('en-GB') },
        ],
      }
      // Cash physically leaves a real bank account the moment a loan is disbursed, so
      // the payout is funded from (and posted against) that account's linked GL code —
      // not the internal ACC-LOAN bucket — and lands Approved immediately, so it shows
      // up in that bank's transaction history and "Cash Out" right away instead of
      // waiting on a manual expense approval that never reflects the real-world event.
      // Routed by the loan's own branch — see fundingGLCode — and refused outright (not
      // silently posted to the wrong branch's account) if that branch has no usable one.
      const fundingBankGL = fundingGLCode(state.realBankAccounts, disbursedLoan.currency, disbursedLoan.branch, 'ACC-LOAN')
      if (!fundingBankGL) return state
      const disbursementExpense = {
        code: `DSB-${disbursedLoan.ref}`,
        category: 'Loan Disbursement',
        amount: disbursedLoan.amount,
        date: new Date().toISOString().split('T')[0],
        description: `Loan disbursed to ${disbursedLoan.customerName || disbursedLoan.ref} (Account: ${customer.accountNumber})`,
        account: fundingBankGL,
        status: 'Approved',
        approvedBy: 'System',
        approvedDate: new Date().toISOString().split('T')[0],
        customerCode: disbursedLoan.customerCode,
        customerName: disbursedLoan.customerName,
      }
      // Chart of Accounts' Loan Release Account (6010) tracks total disbursed principal
      // internally, and the funding bank's own GL is debited too so its balance/history
      // reflect the payout — both update immediately, not gated behind approval.
      let chartOfAccounts = state.chartOfAccounts.map(a => {
        if (a.code === '6010') return { ...a, balance: Math.max(0, (a.balance || 0) - disbursedLoan.amount) }
        if (a.code === fundingBankGL) return { ...a, balance: Math.max(0, (a.balance || 0) - disbursedLoan.amount) }
        return a
      })
      // Releasing the cash settles the obligation the approval recognised and turns it
      // into money owed the other way, so the principal moves out of Account Payable and
      // into Account Receivable in the same step.
      chartOfAccounts = applyGlMovements(chartOfAccounts, {
        [AP_LOAN_CODE]: loanPayableDelta(state.activeLoan.status, disbursedLoan.status, disbursedLoan.amount),
        [AR_LOAN_CODE]: disbursedLoan.amount,
      })
      const disbursementJournalEntry = {
        id: `dsb-${disbursedLoan.ref}`,
        entryType: 'Loan Disbursement',
        date: new Date().toISOString().split('T')[0],
        transactionNo: disbursementExpense.code,
        memo: disbursementExpense.description,
        amount: disbursedLoan.amount,
        lines: [
          { accountCode: AR_LOAN_CODE, debit: disbursedLoan.amount, credit: 0, memo: `Loan receivable opened — ${disbursedLoan.ref}` },
          { accountCode: AP_LOAN_CODE, debit: disbursedLoan.amount, credit: 0, memo: `Loan payable settled on release — ${disbursedLoan.ref}` },
          { accountCode: '6010', debit: 0, credit: disbursedLoan.amount, memo: disbursementExpense.description },
          { accountCode: fundingBankGL, debit: 0, credit: disbursedLoan.amount, memo: disbursementExpense.description },
        ],
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        activeLoan: disbursedLoan,
        loanApplications: state.loanApplications.map(a => a.ref === disbursedLoan.ref ? disbursedLoan : a),
        expenses: [disbursementExpense, ...state.expenses],
        chartOfAccounts,
        journalEntries: [disbursementJournalEntry, ...state.journalEntries],
      }
    }
    case 'RECORD_REPAYMENT': {
      if (!state.activeLoan) return state
      const loan = state.activeLoan
      const idx = action.idx
      const row = loan.schedule[idx]
      const lateFee = row.lateFee || 0
      const paymentMethod = action.paymentMethod || 'Cash'
      const paymentDate = action.date || new Date().toISOString().split('T')[0]
      const amt = action.amount != null ? action.amount : row.totalDue + lateFee
      const memo = action.memo || ''
      const bankName = action.bankName || ''
      const receivedCurrency = action.receivedCurrency || null
      const exchangeRate = action.exchangeRate || null
      // Optional bank-transfer receipt fields — purely descriptive, recorded alongside
      // the payment for the account history to display; they never affect balances or
      // journal amounts.
      const trxId = action.trxId || ''
      const referenceNo = action.referenceNo || ''
      const payerName = action.payerName || ''
      const outlet = action.outlet || ''
      const remark = action.remark || ''
      const toAccount = action.toAccount || ''
      const txnHash = action.txnHash || ''
      const exchangeNote = receivedCurrency && exchangeRate
        ? ` — received ${new Intl.NumberFormat('km-KH', { style: 'currency', currency: 'KHR', maximumFractionDigits: 0 }).format(Math.round(amt * exchangeRate))} cash @ ${exchangeRate} KHR/USD`
        : ''

      // Principal actually retired this period may differ from what the original
      // schedule assumed (e.g. borrower could only afford the interest this month).
      // Interest is settled first; whatever is left over pays down principal.
      const balanceBefore = idx === 0 ? loan.amount : (loan.schedule[idx - 1].balance ?? loan.amount)
      const installmentPayment = Math.max(amt - lateFee, 0)
      const principalPaid = Math.min(Math.max(installmentPayment - row.interest, 0), balanceBefore)
      const interestPaid = Math.round((installmentPayment - principalPaid) * 100) / 100
      const newBalance = Math.round((balanceBefore - principalPaid) * 100) / 100
      // What was collected is compared against the scheduled principal with both sides
      // rounded to the cent, and a residual of a cent or less counts as settled. Schedules
      // written before amortizePeriods rounded still hold full-precision figures, so a
      // borrower paying exactly the total the screen asked for came up a fraction short —
      // which marked the instalment 'Partial' and rolled a phantom cent onto the next one.
      // Schedules generated now land on zero, so this tolerance only absorbs legacy rows.
      const SETTLED_TOLERANCE = 0.015
      const scheduledPrincipal = Math.round((row.principal || 0) * 100) / 100
      const principalPaidRounded = Math.round(principalPaid * 100) / 100
      const status = principalPaidRounded < scheduledPrincipal - SETTLED_TOLERANCE ? 'Partial' : 'Paid'

      // principalPaid/interestPaid capture what THIS payment actually covered (e.g. interest-only),
      // as distinct from row.principal/row.interest which is what the schedule originally called for —
      // the receipt needs the former to tell a borrower an interest-only payment from a full one.
      let schedule = loan.schedule.map((r, i) =>
        i === idx
          ? {
              ...r, paid: amt, status, paidDate: paymentDate, paymentMethod, balance: newBalance, memo, bankName, receivedCurrency, exchangeRate,
              principalPaid: principalPaidRounded, interestPaid, lateFeePaid: lateFee,
              trxId, referenceNo, payerName, outlet, remark, toAccount, txnHash,
            }
          : r
      )

      // Any principal shortfall (e.g. an interest-only payment) rolls onto the
      // very next unpaid installment only — later installments are untouched,
      // since a full payment there brings the balance back onto the original schedule.
      // The carried balance also picks up a penalty at the loan's contract rate
      // (condition 2); paying the remainder directly before it comes due unrolls
      // both the balance and this penalty (see RECORD_REMAINDER).
      const shortfall = Math.round((scheduledPrincipal - principalPaidRounded) * 100) / 100
      const penaltyRate = loan.penaltyRate || 0
      if (Math.abs(shortfall) > SETTLED_TOLERANCE && schedule[idx + 1] && schedule[idx + 1].status !== 'Paid' && schedule[idx + 1].status !== 'Partial') {
        const carryPenalty = shortfall > 0.005 ? Math.round(shortfall * (penaltyRate / 100) * 100) / 100 : 0
        schedule = schedule.map((r, i) =>
          i === idx + 1
            ? {
                ...r,
                principal: Math.round((r.principal + shortfall) * 100) / 100,
                totalDue: Math.round((r.totalDue + shortfall) * 100) / 100,
                ...(carryPenalty > 0
                  ? { lateFee: carryPenalty, lateFeeNote: `Penalty (${penaltyRate}%) on balance carried from installment #${row.num} interest-only payment` }
                  : {}),
              }
            : r
        )
      }
      const repaymentIncomeAmount = Math.max(amt - lateFee, 0)
      // Cash physically lands in a real bank account the moment a repayment is
      // recorded, so the income is posted against that account's linked GL code —
      // not just the internal ACC-REPAYMENT bucket — so it shows up as Cash In and
      // in that bank's transaction history right away. Routed by the loan's own branch
      // — see fundingGLCode — and refused outright if that branch has no usable account.
      const fundingBankGL = fundingGLCode(state.realBankAccounts, loan.currency, loan.branch, 'ACC-REPAYMENT')
      if (!fundingBankGL) return state
      const newIncomes = [
        {
          category:'Repayment Income', amount: repaymentIncomeAmount, code:`RP-${state.activeLoan.ref}`,
          date: paymentDate, description: memo, account: fundingBankGL, source:`Borrower loan repayment via ${paymentMethod}${exchangeNote}`,
          customerCode: state.activeLoan.customerCode, customerName: state.activeLoan.customerName, paymentMethod,
        },
        ...(lateFee > 0 ? [{
          category:'Late Penalty Fees', amount: lateFee, code:`LF-${state.activeLoan.ref}-${row.num}`,
          date: paymentDate, description:`Late fee — installment #${row.num}`, account: fundingBankGL, source:'Overdue borrower penalty',
          customerCode: state.activeLoan.customerCode, customerName: state.activeLoan.customerName, paymentMethod,
        }] : []),
      ]
      const accounts = state.accounts.map(a => a.code === 'ACC-REPAYMENT' ? { ...a, balance: (a.balance || 0) + amt } : a)
      // Chart of Accounts' Repayment Account (5010) tracks total repayments received
      // internally, and the funding bank's own GL is credited too so its balance/history
      // reflect the money in — both update immediately, same as disbursement (6010).
      // Only the principal portion comes off Account Receivable — interest and late fees
      // are income the borrower never owed as principal, so they leave the receivable
      // untouched and land in 5010 with the rest of the payment.
      const principalRetired = Math.round(principalPaid * 100) / 100
      // 5010 takes the income half of the payment only. It used to take the gross amount
      // while Account Receivable was *also* credited the principal, which made every
      // repayment entry's credits exceed its debits by exactly that principal — the payment
      // was being recognised twice, once as income and once as principal recovered. The
      // bank still receives the full amount; that is the one real cash movement.
      const repaymentIncomeGl = Math.round((amt - principalRetired) * 100) / 100
      const chartOfAccounts = applyGlMovements(
        state.chartOfAccounts.map(a => {
          if (a.code === '5010') return { ...a, balance: (a.balance || 0) + repaymentIncomeGl }
          if (a.code === fundingBankGL) return { ...a, balance: (a.balance || 0) + amt }
          return a
        }),
        { [AR_LOAN_CODE]: -principalRetired }
      )
      const repaymentMemo = `Loan repayment — ${state.activeLoan.customerName || state.activeLoan.ref} (installment #${row.num}, via ${paymentMethod})${exchangeNote}${memo ? ` — ${memo}` : ''}`
      const repaymentJournalEntry = {
        id: `rp-${state.activeLoan.ref}-${row.num}-${Date.now()}`,
        entryType: 'Loan Repayment',
        date: paymentDate,
        transactionNo: `RP-${state.activeLoan.ref}`,
        memo: repaymentMemo,
        amount: amt,
        lines: [
          ...(repaymentIncomeGl > 0.005
            ? [{ accountCode: '5010', debit: 0, credit: repaymentIncomeGl, memo: repaymentMemo }]
            : []),
          { accountCode: fundingBankGL, debit: amt, credit: 0, memo: repaymentMemo },
          ...(principalRetired > 0.005
            ? [{ accountCode: AR_LOAN_CODE, debit: 0, credit: principalRetired, memo: `Principal collected — installment #${row.num}` }]
            : []),
        ],
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        activeLoan: { ...state.activeLoan, schedule },
        loanApplications: state.loanApplications.map(a => a.ref === state.activeLoan.ref ? { ...a, schedule } : a),
        incomes: [...newIncomes, ...state.incomes],
        accounts,
        chartOfAccounts,
        journalEntries: [repaymentJournalEntry, ...state.journalEntries],
      }
    }
    // Settles the principal remainder an underpaid installment left behind (e.g.
    // an interest-only month) as its own payment, instead of waiting for it to be
    // collected with the next installment. The remainder RECORD_REPAYMENT rolled
    // onto the next installment is unrolled by whatever is paid here, so the
    // borrower is never asked for it twice.
    case 'RECORD_REMAINDER': {
      if (!state.activeLoan) return state
      const loan = state.activeLoan
      const idx = action.idx
      const row = loan.schedule[idx]
      const paymentMethod = action.paymentMethod || 'Cash'
      const paymentDate = action.date || new Date().toISOString().split('T')[0]
      const memo = action.memo || ''
      const bankName = action.bankName || ''
      const receivedCurrency = action.receivedCurrency || null
      const exchangeRate = action.exchangeRate || null
      // Optional bank-transfer receipt fields — purely descriptive, see RECORD_REPAYMENT.
      const trxId = action.trxId || ''
      const referenceNo = action.referenceNo || ''
      const payerName = action.payerName || ''
      const outlet = action.outlet || ''
      const remark = action.remark || ''
      const toAccount = action.toAccount || ''
      const txnHash = action.txnHash || ''
      const exchangeNote = receivedCurrency && exchangeRate
        ? ` — received ${new Intl.NumberFormat('km-KH', { style: 'currency', currency: 'KHR', maximumFractionDigits: 0 }).format(Math.round(action.amount * exchangeRate))} cash @ ${exchangeRate} KHR/USD`
        : ''

      const outstanding = Math.round(((row.principal || 0) - (row.principalPaid || 0)) * 100) / 100
      if (outstanding <= 0.005) return state
      const amt = Math.min(action.amount != null ? action.amount : outstanding, outstanding)
      const balanceBefore = idx === 0 ? loan.amount : (loan.schedule[idx - 1].balance ?? loan.amount)
      const newPrincipalPaid = Math.round(((row.principalPaid || 0) + amt) * 100) / 100
      const newBalance = Math.round((balanceBefore - newPrincipalPaid) * 100) / 100
      const status = newPrincipalPaid < (row.principal || 0) - 0.005 ? 'Partial' : 'Paid'

      let schedule = loan.schedule.map((r, i) =>
        i === idx
          ? {
              ...r, status, balance: newBalance,
              paid: Math.round(((r.paid || 0) + amt) * 100) / 100,
              principalPaid: newPrincipalPaid,
              remainderPaid: Math.round(((r.remainderPaid || 0) + amt) * 100) / 100,
              remainderPaidDate: paymentDate,
              remainderPaymentMethod: paymentMethod,
              remainderMemo: memo,
              remainderBankName: bankName,
              remainderReceivedCurrency: receivedCurrency,
              remainderExchangeRate: exchangeRate,
              remainderTrxId: trxId, remainderReferenceNo: referenceNo, remainderPayerName: payerName,
              remainderOutlet: outlet, remainderRemark: remark, remainderToAccount: toAccount, remainderTxnHash: txnHash,
            }
          : r
      )
      // Take back out of the next installment whatever was just collected here,
      // and recompute the carried penalty (condition 2) against whatever remainder
      // is still outstanding — settling the remainder directly clears the penalty
      // on the portion no longer being carried forward.
      const penaltyRate = loan.penaltyRate || 0
      const remainderAfter = Math.round((outstanding - amt) * 100) / 100
      if (schedule[idx + 1] && schedule[idx + 1].status !== 'Paid' && schedule[idx + 1].status !== 'Partial') {
        const carryPenalty = remainderAfter > 0.005 ? Math.round(remainderAfter * (penaltyRate / 100) * 100) / 100 : 0
        schedule = schedule.map((r, i) =>
          i === idx + 1
            ? {
                ...r,
                principal: Math.round((r.principal - amt) * 100) / 100,
                totalDue: Math.round((r.totalDue - amt) * 100) / 100,
                lateFee: carryPenalty,
                lateFeeNote: carryPenalty > 0 ? r.lateFeeNote : '',
              }
            : r
        )
      }

      // Routed by the loan's own branch — see fundingGLCode — and refused outright if
      // that branch has no usable account.
      const fundingBankGL = fundingGLCode(state.realBankAccounts, loan.currency, loan.branch, 'ACC-REPAYMENT')
      if (!fundingBankGL) return state
      const newIncomes = [{
        category: 'Repayment Income', amount: amt, code: `RP-${loan.ref}`,
        date: paymentDate, description: memo, account: fundingBankGL,
        source: `Borrower principal remainder for installment #${row.num} via ${paymentMethod}${exchangeNote}`,
        customerCode: loan.customerCode, customerName: loan.customerName, paymentMethod,
      }]
      const accounts = state.accounts.map(a => a.code === 'ACC-REPAYMENT' ? { ...a, balance: (a.balance || 0) + amt } : a)
      // A remainder payment is principal and nothing else, so the whole amount comes
      // off Account Receivable — and none of it is income. 5010 is deliberately left alone
      // here: crediting it the gross amount alongside the full receivable credit was what
      // made these entries carry twice the credit of their debit.
      const chartOfAccounts = applyGlMovements(
        state.chartOfAccounts.map(a => {
          if (a.code === fundingBankGL) return { ...a, balance: (a.balance || 0) + amt }
          return a
        }),
        { [AR_LOAN_CODE]: -amt }
      )
      const remainderMemo = `Loan repayment — ${loan.customerName || loan.ref} (remaining balance of installment #${row.num}, via ${paymentMethod})${exchangeNote}${memo ? ` — ${memo}` : ''}`
      const remainderJournalEntry = {
        id: `rpr-${loan.ref}-${row.num}-${Date.now()}`,
        entryType: 'Loan Repayment',
        date: paymentDate,
        transactionNo: `RP-${loan.ref}`,
        memo: remainderMemo,
        amount: amt,
        lines: [
          { accountCode: fundingBankGL, debit: amt, credit: 0, memo: remainderMemo },
          { accountCode: AR_LOAN_CODE, debit: 0, credit: amt, memo: `Principal remainder collected — installment #${row.num}` },
        ],
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        activeLoan: { ...state.activeLoan, schedule },
        loanApplications: state.loanApplications.map(a => a.ref === state.activeLoan.ref ? { ...a, schedule } : a),
        incomes: [...newIncomes, ...state.incomes],
        accounts,
        chartOfAccounts,
        journalEntries: [remainderJournalEntry, ...state.journalEntries],
      }
    }
    // ─── restructuring an active loan ────────────────────────────────────
    // Re-amortizes what is still owed over new terms. Nothing is posted: no money moves, the
    // principal outstanding is the same principal outstanding, and the receivable it sits in
    // has not changed. Only the schedule the borrower pays against does — which is exactly
    // why this is separate from REFINANCE_LOAN below rather than a variant of it.
    case 'RESCHEDULE_LOAN': {
      const plan = action.plan
      if (!plan || plan.kind !== 'reschedule' || !action.ref) return state
      const target = state.loanApplications.find(l => l.ref === action.ref)
      // Only a live loan can be rescheduled — there is nothing to re-amortize on one that was
      // never disbursed, and a closed one must not sprout a new schedule.
      if (!target || target.status !== 'Active') return state
      const runAt = auditStamp()
      const apply = l => l.ref !== action.ref ? l : {
        ...l,
        schedule: plan.schedule,
        installments: plan.schedule.length,
        interestRate: plan.interestRate,
        emi: plan.emi,
        firstInstallment: plan.firstDueISO,
        rescheduleHistory: [{
          at: runAt,
          by: state.currentRole,
          reason: action.reason || '',
          principal: plan.principal,
          interestRate: plan.interestRate,
          installments: plan.installments,
          firstDueISO: plan.firstDueISO,
          emi: plan.emi,
        }, ...(l.rescheduleHistory || [])],
        activityLog: [{
          timestamp: runAt,
          user: state.currentRole,
          section: 'Reschedule',
          action: 'Loan rescheduled',
          detail: `${plan.principal.toFixed(2)} over ${plan.installments} months at ${plan.interestRate}% from ${plan.firstDueISO}${action.reason ? ` — ${action.reason}` : ''}`,
        }, ...(l.activityLog || [])].slice(0, 300),
      }
      return {
        ...state,
        loanApplications: state.loanApplications.map(apply),
        activeLoan: state.activeLoan?.ref === action.ref ? apply(state.activeLoan) : state.activeLoan,
      }
    }

    // Issues a new loan whose principal settles the old one. The borrower walks away with the
    // difference, so this is a real money-out event and posts one balanced entry:
    //
    //   Dr  Account Receivable        new principal        (the new loan the borrower now owes)
    //   Cr  Account Receivable        settled principal    (the old loan, cleared)
    //   Cr  Loan Fee Income           refinance fee        (earned on the restructure)
    //   Cr  Bank                      net paid out         (what actually leaves)
    //
    // The credits sum to the debit because the net is defined as new − settled − fee, so the
    // entry balances by construction rather than by a figure someone typed. A refinance that
    // would not cover what it settles is refused outright, not clamped — the same rule that
    // stops an expense overdrawing its account.
    case 'REFINANCE_LOAN': {
      const plan = action.plan
      if (!plan || plan.kind !== 'refinance' || !action.ref) return state
      const previous = state.loanApplications.find(l => l.ref === action.ref)
      if (!previous || previous.status !== 'Active') return state
      if (plan.netToBorrower < -0.005) return state
      // Money-out gate, same as disbursement: the account the cash is going to must be on file.
      const customer = state.customers.find(c => c.code === previous.customerCode)
      if (!customer?.accountNumber) return state
      const currency = previous.currency || 'USD'
      const fundingBankGL = fundingGLCode(state.realBankAccounts, currency, previous.branch, 'ACC-LOAN')
      if (!fundingBankGL) return state

      const round2 = n => Math.round(n * 100) / 100
      const runAt = auditStamp()
      const today = new Date().toISOString().split('T')[0]
      const feeGL = currency === 'KHR' ? '4011' : '4010'

      // Same rule as the loan wizard's own getNextLoanRef — highest number on file, plus one.
      const nextNum = state.loanApplications.reduce((max, l) => {
        const m = /^AC-L-(\d+)$/.exec(l.ref || '')
        return m ? Math.max(max, parseInt(m[1], 10)) : max
      }, 0) + 1
      const newRef = `AC-L-${String(nextNum).padStart(6, '0')}`

      const cycle = String((parseInt(previous.loanCycle, 10) || 1) + 1)
      const newLoan = {
        ...previous,
        ref: newRef,
        loanCycle: cycle,
        amount: plan.newAmount,
        interestRate: plan.interestRate,
        installments: plan.installments,
        firstInstallment: plan.firstDueISO,
        emi: plan.emi,
        schedule: plan.schedule,
        refinanceFee: plan.refinanceFee,
        status: 'Active',
        approvalState: 3,
        termSelected: true,
        disbursementDate: today,
        // Where this loan came from, and what the old one became. Kept on both records so the
        // chain reads in either direction without searching the whole book.
        refinancedFromRef: previous.ref,
        refinancedFromAmount: plan.settlement,
        refinancedToRef: undefined,
        rescheduleHistory: [],
        approvalHistory: [
          ...(previous.approvalHistory || []),
          { stage: 3, action: `Opened by refinancing ${previous.ref} — ${plan.settlement.toFixed(2)} settled, ${plan.netToBorrower.toFixed(2)} released`, user: state.currentRole, timestamp: new Date().toLocaleString('en-GB') },
        ],
        activityLog: [{
          timestamp: runAt, user: state.currentRole, section: 'Refinance',
          action: 'Loan opened by refinance',
          detail: `From ${previous.ref} · settled ${plan.settlement.toFixed(2)} · fee ${plan.refinanceFee.toFixed(2)} · released ${plan.netToBorrower.toFixed(2)}`,
        }],
      }

      const closedPrevious = {
        ...previous,
        status: 'Refinanced',
        refinancedToRef: newRef,
        closedDate: today,
        approvalHistory: [
          ...(previous.approvalHistory || []),
          { stage: previous.approvalState || 3, action: `Refinanced into ${newRef}${action.reason ? `: ${action.reason}` : ''}`, user: state.currentRole, timestamp: new Date().toLocaleString('en-GB') },
        ],
        activityLog: [{
          timestamp: runAt, user: state.currentRole, section: 'Refinance',
          action: 'Loan refinanced and closed',
          detail: `Into ${newRef} · ${plan.settlement.toFixed(2)} outstanding settled${action.reason ? ` — ${action.reason}` : ''}`,
        }, ...(previous.activityLog || [])].slice(0, 300),
      }

      const memo = `Refinance ${previous.ref} → ${newRef} — ${customer.enName || previous.customerName || ''}`.trim()
      const journalEntry = {
        id: `rfn-${newRef}`,
        entryType: 'Loan Refinance',
        date: today,
        transactionNo: `RFN-${newRef}`,
        memo,
        amount: plan.newAmount,
        currency,
        lines: [
          { accountCode: AR_LOAN_CODE, debit: plan.newAmount, credit: 0, memo: `Loan receivable opened — ${newRef}` },
          { accountCode: AR_LOAN_CODE, debit: 0, credit: plan.settlement, memo: `Loan receivable settled by refinance — ${previous.ref}` },
          ...(plan.refinanceFee > 0.005
            ? [{ accountCode: feeGL, debit: 0, credit: plan.refinanceFee, memo: `Refinance fee — ${newRef}` }]
            : []),
          ...(plan.netToBorrower > 0.005
            ? [{ accountCode: fundingBankGL, debit: 0, credit: plan.netToBorrower, memo: `Net released to borrower — ${newRef}` }]
            : []),
        ],
        createdAt: new Date().toISOString(),
      }

      // The receivable moves by the difference, not by either leg on its own — the old balance
      // never leaves the book as cash, it is rolled straight into the new loan.
      const chartOfAccounts = applyGlMovements(state.chartOfAccounts, {
        [AR_LOAN_CODE]: round2(plan.newAmount - plan.settlement),
        [feeGL]: plan.refinanceFee,
        [fundingBankGL]: -plan.netToBorrower,
      })

      // Mirrors what disbursement records, so the refinance shows up in Cash Out and in the
      // bank's own history rather than only in the journal.
      const releaseExpense = plan.netToBorrower > 0.005 ? [{
        code: `RFN-${newRef}`,
        category: 'Loan Refinance',
        amount: plan.netToBorrower,
        date: today,
        description: `${memo} (Account: ${customer.accountNumber})`,
        account: fundingBankGL,
        status: 'Approved',
        approvedBy: state.currentRole,
        approvedDate: today,
        customerCode: previous.customerCode,
        customerName: previous.customerName,
      }] : []

      const feeIncome = plan.refinanceFee > 0.005 ? [{
        category: 'Refinance Fee', amount: plan.refinanceFee, code: `RFF-${newRef}`,
        date: today, description: `Refinance fee — ${newRef}`, account: feeGL,
        source: `Fee earned refinancing ${previous.ref}`,
        customerCode: previous.customerCode, customerName: previous.customerName,
      }] : []

      return {
        ...state,
        loanApplications: [newLoan, ...state.loanApplications.map(l => l.ref === action.ref ? closedPrevious : l)],
        activeLoan: state.activeLoan?.ref === action.ref ? closedPrevious : state.activeLoan,
        expenses: [...releaseExpense, ...state.expenses],
        incomes: [...feeIncome, ...state.incomes],
        chartOfAccounts,
        journalEntries: [journalEntry, ...state.journalEntries],
      }
    }

    // Everything an officer does to a loan outside the approval workflow — editing its terms,
    // adding a guarantor, uploading a CBC report, dropping a collateral. It is kept separate
    // from `approvalHistory` because that list is also what ApprovalTimeline walks to draw the
    // stages; folding edits into it would put "Collateral added" on the approval track. The
    // Audit Log tab reads both together, so the record stays whole while the timeline stays
    // about approval. Newest first and capped, like the system-wide trail it mirrors.
    case 'ADD_LOAN_ACTIVITY': {
      if (!action.ref || !action.entry?.action) return state
      const entry = { timestamp: auditStamp(), user: state.currentRole, ...action.entry }
      const apply = l => l.ref === action.ref
        ? { ...l, activityLog: [entry, ...(l.activityLog || [])].slice(0, 300) }
        : l
      return {
        ...state,
        loanApplications: state.loanApplications.map(apply),
        activeLoan: state.activeLoan?.ref === action.ref ? apply(state.activeLoan) : state.activeLoan,
      }
    }

    // The borrower's own KHQR, held on the loan rather than on the WeBill365 connection: a
    // single company-wide code would collect payments nobody could attribute, so each loan
    // carries the code issued for it (see utils/khqr.js, which rides the loan reference in as
    // the bill number). activeLoan mirrors whichever loan is open, so it moves with the list
    // or the schedule view would keep showing the code it was opened with.
    case 'SET_LOAN_KHQR': {
      const ref = action.ref
      if (!ref) return state
      const apply = loan => loan.ref === ref ? { ...loan, ...action.khqr } : loan
      return {
        ...state,
        loanApplications: state.loanApplications.map(apply),
        activeLoan: state.activeLoan?.ref === ref ? apply(state.activeLoan) : state.activeLoan,
      }
    }
    case 'ADJUST_LATE_FEE': {
      if (!state.activeLoan) return state
      const schedule = state.activeLoan.schedule.map((r, i) =>
        i === action.idx ? { ...r, lateFee: action.amount, lateFeeNote: action.note || '' } : r
      )
      return {
        ...state,
        activeLoan: { ...state.activeLoan, schedule },
        loanApplications: state.loanApplications.map(a => a.ref === state.activeLoan.ref ? { ...a, schedule } : a),
      }
    }
    case 'ADJUST_DUE_DATE': {
      if (!state.activeLoan) return state
      const target = state.activeLoan.schedule[action.idx]
      if (!target || !action.dateISO) return state
      const delta = daysBetweenISO(target.dueDateISO, action.dateISO)
      if (delta === 0) return state
      const schedule = state.activeLoan.schedule.map((r, i) => {
        // `dueDate` is the display string every table renders and `dueDateISO` is what
        // the overdue/late-fee logic compares against — they have to move together or
        // a row prints one date while behaving as if it were due on another. The
        // original is kept on first change so a rescheduled row can be flagged.
        if (i === action.idx) {
          return {
            ...r,
            dueDate: formatDateDisplay(action.dateISO),
            dueDateISO: action.dateISO,
            dueDateOriginalISO: r.dueDateOriginalISO || r.dueDateISO,
            dueDateNote: action.note || '',
          }
        }
        // Later installments move only when the whole remaining plan is being pushed
        // back; otherwise this is a one-off change to a single due date.
        if (action.shiftFollowing && i > action.idx) {
          const iso = shiftISODate(r.dueDateISO, delta)
          return {
            ...r,
            dueDate: formatDateDisplay(iso),
            dueDateISO: iso,
            dueDateOriginalISO: r.dueDateOriginalISO || r.dueDateISO,
          }
        }
        return r
      })
      return {
        ...state,
        activeLoan: { ...state.activeLoan, schedule },
        loanApplications: state.loanApplications.map(a => a.ref === state.activeLoan.ref ? { ...a, schedule } : a),
      }
    }
    case 'OPEN_LOAN_REVIEW': return { ...state, loanReviewOpen: true }

    // Accounting
    case 'SET_STATEMENT': return { ...state, activeStatement: action.stmt }
    case 'SET_ACCOUNTING_TAB': return { ...state, accountingTab: action.tab }

    case 'ADD_INCOME': {
      const chartOfAccounts = state.chartOfAccounts.map(a =>
        a.code === action.entry.account ? { ...a, balance: (a.balance || 0) + action.entry.amount } : a
      )
      return { ...state, incomes: [action.entry, ...state.incomes], chartOfAccounts }
    }
    case 'ADD_EXPENSE': return { ...state, expenses: [{ ...action.entry, status: 'Pending Approval' }, ...state.expenses] }
    case 'APPROVE_EXPENSE': {
      const exp = state.expenses.find(e => e.code === action.code)
      if (!exp || exp.status === 'Approved') return state
      // Refused rather than clamped. This used to subtract with Math.max(0, balance - amount),
      // which floored an overdraft at zero: approving more than the account held reported the
      // expense as paid, showed a $0 balance and lost the shortfall with no record it existed.
      // The UI checks the same rule first and says how short the account is; this is the
      // backstop, so no path can overdraw whatever calls it.
      if (!canFundExpense(state, exp)) return state
      // Rounded to the cent like applyGlMovements does, so the cent of tolerance in the funds
      // check can't leave a balance of -0.004 sitting in the books.
      const debit = a => ({ ...a, balance: Math.round(((a.balance || 0) - exp.amount) * 100) / 100 })
      const accounts = state.accounts.map(a => a.code === exp.account ? debit(a) : a)
      const chartOfAccounts = state.chartOfAccounts.map(a => a.code === exp.account ? debit(a) : a)
      const expenses = state.expenses.map(e =>
        e.code === action.code
          ? { ...e, status: 'Approved', approvedBy: 'Admin', approvedDate: new Date().toISOString().split('T')[0] }
          : e
      )
      return { ...state, expenses, accounts, chartOfAccounts }
    }
    // The Income / Expense tabs record entries through the same modal, so it needs an
    // opener that carries which of the two is being recorded.
    case 'OPEN_TRANSACTION_MODAL': return {
      ...state,
      transactionModalOpen: true,
      transactionModalType: action.transactionType || 'Income',
    }
    case 'CLOSE_TRANSACTION_MODAL': return { ...state, transactionModalOpen: false }

    case 'ADD_CASH_TRANSFER': {
      const { transfer } = action
      // The amount is stated in the source account's currency. Where the two accounts are held
      // in different currencies the destination receives the converted figure, not the same
      // number — moving 100 out of a dollar account used to put 100 into a riel one, which is
      // out by a factor of the exchange rate. A rate of 1 (same currency) leaves this alone.
      const rate = Number(transfer.exchangeRate) > 0 ? Number(transfer.exchangeRate) : 1
      const credited = Math.round(transfer.amount * rate * 100) / 100
      const chartOfAccounts = state.chartOfAccounts.map(a => {
        if (a.code === transfer.fromCode) return { ...a, balance: Math.max(0, (a.balance || 0) - transfer.amount) }
        if (a.code === transfer.toCode)   return { ...a, balance: (a.balance || 0) + credited }
        return a
      })
      return { ...state, cashTransfers: [...state.cashTransfers, transfer], chartOfAccounts }
    }
    case 'OPEN_CASH_TRANSFER_MODAL': return { ...state, cashTransferModalOpen: true }
    case 'CLOSE_CASH_TRANSFER_MODAL': return { ...state, cashTransferModalOpen: false }

    case 'OPEN_ACCOUNT_HISTORY': return { ...state, accountHistoryCode: action.code, accountHistoryCurrency: action.currency || null }
    case 'CLOSE_ACCOUNT_HISTORY': return { ...state, accountHistoryCode: null, accountHistoryCurrency: null }

    case 'SET_GL_FILTER': return { ...state, glFilter: action.filter }
    case 'SET_GL_ACCOUNT_FILTER': return { ...state, glAccountFilter: action.filter }

    // General ledger — Chart of Accounts / Real Bank Accounts
    case 'ADD_CHART_OF_ACCOUNT': return { ...state, chartOfAccounts: [...state.chartOfAccounts, { ...action.account, balance: action.account.balance || 0 }] }
    case 'UPDATE_CHART_OF_ACCOUNT': return {
      ...state,
      chartOfAccounts: state.chartOfAccounts.map(a => a.code === action.account.code ? { ...a, ...action.account } : a)
    }
    // Deleting a GL account also drops its sub-accounts — an orphaned child would no
    // longer roll up to anything. The page blocks deletion of accounts with postings,
    // so no journal history is silently detached here.
    case 'DELETE_CHART_OF_ACCOUNT': return {
      ...state,
      chartOfAccounts: state.chartOfAccounts.filter(a => a.code !== action.code && a.parentCode !== action.code)
    }
    case 'ADD_BANK_ACCOUNT': return { ...state, realBankAccounts: [...state.realBankAccounts, action.account] }
    case 'UPDATE_BANK_ACCOUNT': return {
      ...state,
      realBankAccounts: state.realBankAccounts.map(a => a.id === action.account.id ? action.account : a)
    }
    case 'DELETE_BANK_ACCOUNT': return { ...state, realBankAccounts: state.realBankAccounts.filter(a => a.id !== action.id) }

    case 'ADD_JOURNAL_ENTRY': {
      const chartOfAccounts = state.chartOfAccounts.map(a => {
        const line = action.entry.lines.find(l => l.accountCode === a.code)
        if (!line) return a
        const delta = a.normalBalance === 'DEBIT' ? (line.debit - line.credit) : (line.credit - line.debit)
        return { ...a, balance: (a.balance || 0) + delta }
      })
      return { ...state, chartOfAccounts, journalEntries: [action.entry, ...state.journalEntries] }
    }
    case 'ADD_SINGLE_ENTRY': {
      const { entry } = action
      const chartOfAccounts = state.chartOfAccounts.map(a => {
        if (a.code !== entry.accountCode) return a
        const signedAmount = entry.entryType === 'Debit' ? entry.amount : -entry.amount
        const delta = a.normalBalance === 'DEBIT' ? signedAmount : -signedAmount
        return { ...a, balance: (a.balance || 0) + delta }
      })
      return {
        ...state,
        chartOfAccounts,
        journalEntries: [{
          id: `single-${Date.now()}`,
          entryType: 'Single Entry',
          date: entry.date,
          transactionNo: `SE-${Date.now()}`,
          memo: entry.memo || '',
          amount: entry.amount,
          lines: [{ accountCode: entry.accountCode, debit: entry.entryType === 'Debit' ? entry.amount : 0, credit: entry.entryType === 'Credit' ? entry.amount : 0, memo: entry.memo || '' }],
          createdAt: new Date().toISOString(),
        }, ...state.journalEntries],
      }
    }
    // A sales invoice books the income immediately (Accounts Receivable, not cash-in-hand
    // yet) — unlike Income Entries/Cash Transfer it isn't tied to a bank GL code, so no
    // chartOfAccounts balance moves until the invoice is actually collected.
    case 'ADD_SALES_INVOICE': {
      const { invoice } = action
      const income = {
        code: `INV-${Date.now()}`,
        category: 'Sales Invoice',
        amount: invoice.amount,
        date: invoice.date,
        description: invoice.description,
        account: '',
        source: 'Sales invoice',
        customerCode: invoice.customerCode,
        customerName: invoice.customerName,
      }
      return { ...state, incomes: [income, ...state.incomes] }
    }
    case 'ADD_BILL': {
      const { bill } = action
      const expense = {
        code: `BILL-${Date.now()}`,
        category: bill.category || 'Bill',
        amount: bill.amount,
        date: bill.date,
        description: bill.description,
        account: bill.account,
        status: 'Pending Approval',
      }
      return { ...state, expenses: [expense, ...state.expenses] }
    }

    // ─── audit trail ─────────────────────────────────────────────────────
    // One action recorded. When and by whom are stamped here rather than by the caller, so
    // every log line carries them in the same format: `currentRole` is the only identity the
    // app holds (the same one APPROVE_EXPENSE writes as approvedBy), and it stands in for a
    // username until sign-in exists. `log` carries { action, module } and, where the action
    // has them, a `reference` and an `amount` for the module logs to show.
    // Newest first and capped like the integration log — this rides along in localStorage.
    case 'ADD_AUDIT_LOG': return {
      ...state,
      auditLogs: [{ timestamp: auditStamp(), user: state.currentRole, ...action.log }, ...state.auditLogs].slice(0, 500),
    }

    // Reports
    // ─── payroll: employees ──────────────────────────────────────────────
    // A payroll run posts one batch expense; the run keeps the per-employee breakdown that
    // batch is made of, so the ledger stays clean and the detail is still recoverable.
    case 'ADD_PAYROLL_RUN': return { ...state, payrollRuns: [action.run, ...state.payrollRuns] }

    case 'ADD_EMPLOYEE': return { ...state, employees: [action.employee, ...state.employees] }
    case 'ADD_EMPLOYEES': return { ...state, employees: [...action.employees, ...state.employees] }
    case 'UPDATE_EMPLOYEE': return {
      ...state,
      employees: state.employees.map(e => e.id === action.employee.id ? { ...e, ...action.employee } : e)
    }
    case 'DELETE_EMPLOYEE': return { ...state, employees: state.employees.filter(e => e.id !== action.id) }

    case 'SET_REPORT_TAB': return { ...state, reportTab: action.tab }

    // ─── integrations ────────────────────────────────────────────────────
    // Added from the provider catalogue. Guarded on id so adding twice can't produce two
    // rows for one provider — the catalogue dialog shows an already-added provider as added.
    case 'ADD_INTEGRATION': return state.integrations.some(i => i.id === action.integration.id)
      ? state
      : { ...state, integrations: [...state.integrations, action.integration] }
    case 'DELETE_INTEGRATION': return {
      ...state,
      integrations: state.integrations.filter(i => i.id !== action.id)
    }
    case 'UPDATE_INTEGRATION': return {
      ...state,
      integrations: state.integrations.map(i => i.id === action.id ? { ...i, ...action.updates } : i)
    }
    case 'TOGGLE_INTEGRATION_SCOPE': return {
      ...state,
      integrations: state.integrations.map(i => i.id === action.id
        ? { ...i, scopes: i.scopes.map(s => s.id === action.scopeId ? { ...s, enabled: !s.enabled } : s) }
        : i)
    }
    // Newest first, and capped — the log is a rolling record of recent exchanges, not an
    // archive, and it rides along in localStorage with everything else.
    case 'ADD_INTEGRATION_LOG': return {
      ...state,
      integrations: state.integrations.map(i => i.id === action.id
        ? { ...i, logs: [action.log, ...(i.logs || [])].slice(0, 50) }
        : i)
    }

    // A province/district/commune/village the built-in geo lists don't carry, added from the
    // address form. Guarded on the value already being present so adding twice can't produce
    // two identical entries, and scoped by `key` (its parent path) so a custom commune shows
    // up only under the district it was added for — see customGeo in INITIAL_STATE.
    case 'ADD_GEO_VALUE': {
      const name = (action.value || '').trim()
      const geo = state.customGeo
      if (!name || !geo[action.level]) return state
      if (action.level === 'provinces') {
        if (geo.provinces.includes(name)) return state
        return { ...state, customGeo: { ...geo, provinces: [...geo.provinces, name] } }
      }
      if (!action.key) return state
      const existing = geo[action.level][action.key] || []
      if (existing.includes(name)) return state
      return {
        ...state,
        customGeo: {
          ...geo,
          [action.level]: { ...geo[action.level], [action.key]: [...existing, name] },
        },
      }
    }

    // ─── system operations: SOD / EOD / EOM batches ──────────────────────
    // Each batch is handed the plan the operator approved (see utils/systemOperations.js —
    // the modal previews it and passes that same object here), so what posts is exactly what
    // was shown. The reducer still owns the gates: a blocked plan and an out-of-sequence run
    // are both refused here regardless of what the UI thought.
    case 'OPEN_SYSTEM_OPS': return { ...state, systemOpsOpen: true }
    case 'CLOSE_SYSTEM_OPS': return { ...state, systemOpsOpen: false }

    // Opening the day posts nothing — it sets the gate the other two batches branch on.
    // Refused while a day is already open, so a second dispatch can't overwrite the running
    // day's openedAt or strand the day it replaced.
    case 'RUN_SOD': {
      const plan = action.plan
      if (!plan || plan.blocked || plan.kind !== 'SOD') return state
      if (state.businessDay?.status === 'open') return state
      // A day End of Day has already closed cannot be reopened — reopening it would let the
      // same date accrue interest twice, under a journal id keyed by that date.
      if (state.batchRuns.some(r => r.kind === 'EOD' && r.date === plan.date)) return state
      const runAt = auditStamp()
      return {
        ...state,
        businessDay: {
          date: plan.date,
          status: 'open',
          openedAt: runAt,
          openedBy: state.currentRole,
          closedAt: null,
          closedBy: null,
        },
        batchRuns: [{
          id: `sod-${plan.date}-${Date.now()}`,
          kind: 'SOD',
          date: plan.date,
          period: plan.date.slice(0, 7),
          runAt,
          runBy: state.currentRole,
          checks: plan.checks,
          summary: `Business day ${plan.date} opened`,
          postings: [],
        }, ...state.batchRuns].slice(0, 200),
      }
    }

    // Closing the day is where the day's accounting happens: the contract penalty is stamped
    // on installments that went past due, and one day of interest is recognised on every
    // active loan. Branches on the day being *open* rather than on the plan alone — the same
    // transition guard loanPayableDelta uses — so a re-dispatch after the day has closed
    // posts neither the accrual nor the penalties a second time.
    case 'RUN_EOD': {
      const plan = action.plan
      if (!plan || plan.blocked || plan.kind !== 'EOD') return state
      if (state.businessDay?.status !== 'open') return state
      // Belt and braces beside the open-day guard: the accrual entry's id is keyed by date,
      // so a second close of the same date must never post regardless of how the day reopened.
      if (state.batchRuns.some(r => r.kind === 'EOD' && r.date === plan.date)) return state
      const runAt = auditStamp()
      const round2 = n => Math.round(n * 100) / 100

      // A late fee lives on the schedule row, not in the ledger — a penalty becomes income
      // only when it is actually collected (RECORD_REPAYMENT), which is how ADJUST_LATE_FEE
      // already treats it. Grouped by loan so a loan with several overdue installments has
      // its schedule rebuilt once. A row that somehow picked up a fee between preview and
      // confirm is left alone, so no installment is ever charged twice.
      const overdueByRef = new Map()
      for (const item of plan.overdue || []) {
        if (!overdueByRef.has(item.ref)) overdueByRef.set(item.ref, [])
        overdueByRef.get(item.ref).push(item)
      }
      const loanApplications = overdueByRef.size
        ? state.loanApplications.map(loan => {
            const items = overdueByRef.get(loan.ref)
            if (!items) return loan
            return {
              ...loan,
              schedule: loan.schedule.map((row, idx) => {
                const hit = items.find(i => i.idx === idx)
                if (!hit || (row.lateFee || 0) > 0) return row
                return {
                  ...row,
                  lateFee: hit.fee,
                  lateFeeNote: `Penalty (${hit.penaltyRate}%) applied by End of Day ${plan.date} — ${hit.daysLate} day${hit.daysLate === 1 ? '' : 's'} past due`,
                }
              }),
            }
          })
        : state.loanApplications

      // activeLoan mirrors whichever loan the detail view has open; it has to pick up the
      // same schedule or that view would keep showing pre-batch late fees until reopened.
      const activeLoan = state.activeLoan
        ? loanApplications.find(l => l.ref === state.activeLoan.ref) || state.activeLoan
        : state.activeLoan

      // One balanced entry per currency. Interest earned but not yet collected is an asset,
      // so the accrued receivable is debited and accrued interest income credited by the
      // same amount — posted against the accounts of the loan's own currency, never a
      // hardcoded pair.
      const movements = (plan.accrual?.movements || []).filter(m => m.amount > 0.005)
      const glMovements = {}
      const accrualEntries = movements.map(m => {
        glMovements[m.receivable] = round2((glMovements[m.receivable] || 0) + m.amount)
        glMovements[m.income] = round2((glMovements[m.income] || 0) + m.amount)
        const memo = `End of Day interest accrual — ${plan.date} (${m.currency})`
        return {
          id: `eod-accrual-${plan.date}-${m.currency}`,
          entryType: 'EOD Interest Accrual',
          date: plan.date,
          transactionNo: `EOD-${plan.date}-${m.currency}`,
          memo,
          amount: m.amount,
          currency: m.currency,
          lines: [
            { accountCode: m.receivable, debit: m.amount, credit: 0, memo: `Interest receivable accrued — ${m.currency}` },
            { accountCode: m.income, debit: 0, credit: m.amount, memo },
          ],
          createdAt: new Date().toISOString(),
        }
      })

      const accruedTotal = movements.map(m => `${m.currency} ${m.amount.toFixed(2)}`).join(', ')
      return {
        ...state,
        loanApplications,
        activeLoan,
        chartOfAccounts: applyGlMovements(state.chartOfAccounts, glMovements),
        journalEntries: [...accrualEntries, ...state.journalEntries],
        businessDay: {
          ...state.businessDay,
          status: 'closed',
          closedAt: runAt,
          closedBy: state.currentRole,
        },
        batchRuns: [{
          id: `eod-${plan.date}-${Date.now()}`,
          kind: 'EOD',
          date: plan.date,
          period: plan.date.slice(0, 7),
          runAt,
          runBy: state.currentRole,
          checks: plan.checks,
          summary: `Day closed — ${(plan.overdue || []).length} overdue installment${(plan.overdue || []).length === 1 ? '' : 's'} penalised, interest accrued ${accruedTotal || 'nil'}`,
          postings: accrualEntries.map(e => ({ transactionNo: e.transactionNo, amount: e.amount, currency: e.currency })),
        }, ...state.batchRuns].slice(0, 200),
      }
    }

    // Month close rebuilds the required loan-loss allowance from the PAR bands and posts only
    // the difference against what the allowance already carries, so the charge reflects how
    // the book actually moved. Refused for a period already closed — the batch history is the
    // guard, which is why it is persisted alongside the ledger it describes.
    case 'RUN_EOM': {
      const plan = action.plan
      if (!plan || plan.blocked || plan.kind !== 'EOM') return state
      if (state.businessDay?.status === 'open') return state
      if (state.batchRuns.some(r => r.kind === 'EOM' && r.period === plan.period)) return state
      const runAt = auditStamp()
      const round2 = n => Math.round(n * 100) / 100

      // A rising allowance is a charge (debit the provision expense, credit the allowance);
      // a falling one releases it back the other way. Either way the two lines carry the same
      // absolute amount, so the entry balances whichever direction the book moved.
      const movements = (plan.provision?.movements || []).filter(m => Math.abs(m.delta) > 0.005)
      const glMovements = {}
      const provisionEntries = movements.map(m => {
        glMovements[m.allowance] = round2((glMovements[m.allowance] || 0) + m.delta)
        glMovements[m.expense] = round2((glMovements[m.expense] || 0) + m.delta)
        const amount = round2(Math.abs(m.delta))
        const raising = m.delta > 0
        const memo = `End of Month loan-loss provision — ${plan.period} (${m.currency}), required ${m.required.toFixed(2)} against ${m.held.toFixed(2)} held`
        return {
          id: `eom-provision-${plan.period}-${m.currency}`,
          entryType: 'EOM Loan Loss Provision',
          date: plan.date,
          transactionNo: `EOM-${plan.period}-${m.currency}`,
          memo,
          amount,
          currency: m.currency,
          lines: raising
            ? [
                { accountCode: m.expense, debit: amount, credit: 0, memo: `Provision charge — ${m.currency}` },
                { accountCode: m.allowance, debit: 0, credit: amount, memo },
              ]
            : [
                { accountCode: m.allowance, debit: amount, credit: 0, memo: `Provision released — ${m.currency}` },
                { accountCode: m.expense, debit: 0, credit: amount, memo },
              ],
          createdAt: new Date().toISOString(),
        }
      })

      const provisionTotal = movements.map(m => `${m.currency} ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(2)}`).join(', ')
      return {
        ...state,
        chartOfAccounts: applyGlMovements(state.chartOfAccounts, glMovements),
        journalEntries: [...provisionEntries, ...state.journalEntries],
        batchRuns: [{
          id: `eom-${plan.period}-${Date.now()}`,
          kind: 'EOM',
          date: plan.date,
          period: plan.period,
          runAt,
          runBy: state.currentRole,
          checks: plan.checks,
          summary: `Period ${plan.period} closed — provision movement ${provisionTotal || 'nil'}`,
          postings: provisionEntries.map(e => ({ transactionNo: e.transactionNo, amount: e.amount, currency: e.currency })),
        }, ...state.batchRuns].slice(0, 200),
      }
    }

    // Notifications
    case 'ADD_NOTIFICATION': return { ...state, notifications: [action.notification, ...state.notifications] }
    case 'MARK_NOTIFICATIONS_READ': return {
      ...state,
      notifications: state.notifications.map(n => ({ ...n, read: true }))
    }

    default: return state
  }
}

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  // Persist key data
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        customers: state.customers,
        loanApplications: state.loanApplications,
        incomes: state.incomes,
        expenses: state.expenses,
        notifications: state.notifications,
        cashTransfers: state.cashTransfers,
        accounts: state.accounts,
        feeSettings: state.feeSettings,
        loanProducts: state.loanProducts,
        activeStatement: state.activeStatement,
        chartOfAccounts: state.chartOfAccounts,
        realBankAccounts: state.realBankAccounts,
        journalEntries: state.journalEntries,
        companyProfile: state.companyProfile,
        employees: state.employees,
        payrollRuns: state.payrollRuns,
        integrations: state.integrations,
        auditLogs: state.auditLogs,
        systemUsers: state.systemUsers,
        businessDay: state.businessDay,
        batchRuns: state.batchRuns,
        customGeo: state.customGeo,
        customerVisibleColumns: state.customerVisibleColumns,
        loanVisibleColumns: state.loanVisibleColumns,
      }))
    } catch {}
  }, [state.customerVisibleColumns, state.loanVisibleColumns, state.systemUsers, state.auditLogs, state.integrations, state.payrollRuns, state.customers, state.loanApplications, state.incomes, state.expenses, state.notifications, state.cashTransfers, state.accounts, state.feeSettings, state.loanProducts, state.activeStatement, state.chartOfAccounts, state.realBankAccounts, state.journalEntries, state.companyProfile, state.employees, state.businessDay, state.batchRuns, state.customGeo])

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.darkMode)
    document.documentElement.style.backgroundColor = state.darkMode ? '#0f172a' : ''
    try { localStorage.setItem('acabar-dark-mode', state.darkMode ? '1' : '0') } catch {}
  }, [state.darkMode])

  // Language
  useEffect(() => {
    document.body.style.fontFamily = state.language === 'kh'
      ? '"Kantumruy Pro", "Outfit", sans-serif'
      : '"Outfit", "Kantumruy Pro", sans-serif'
    try { localStorage.setItem('acabar-lang', state.language) } catch {}
  }, [state.language])

  const showToast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random()
    dispatch({ type: 'ADD_TOAST', toast: { id, msg, toastType: type } })
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), 4000)
  }, [])

  // Whether the currently "logged in as" role has a given permission — driven
  // live by the roleMatrix so toggling a checkbox in Settings > Roles instantly
  // changes what that role can do elsewhere in the app.
  const can = useCallback((permKey) => {
    return !!state.roleMatrix[state.currentRole]?.[permKey]
  }, [state.roleMatrix, state.currentRole])

  return (
    <AppContext.Provider value={{ state, dispatch, showToast, can }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}
