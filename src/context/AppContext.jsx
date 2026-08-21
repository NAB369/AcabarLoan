import { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react'
import {
  INITIAL_CUSTOMERS, INITIAL_LOANS, INITIAL_EXPENSES, INITIAL_INCOMES,
  INITIAL_ACCOUNTS, INITIAL_SYSTEM_USERS, INITIAL_AUDIT_LOGS, INITIAL_ROLE_MATRIX, INITIAL_PERMISSION_LABELS,
  INITIAL_COMPANY_PROFILE, INITIAL_CHART_OF_ACCOUNTS, INITIAL_REAL_BANK_ACCOUNTS,
  INITIAL_JOURNAL_ENTRIES, INITIAL_CASH_TRANSFERS, INITIAL_EMPLOYEES,
  INITIAL_INTEGRATIONS,
  backfillStatementAnalysis
} from '../data/mockData'
import { formatDateDisplay, shiftISODate, daysBetweenISO, auditStamp } from '../utils/format'
import { ALL_DATES } from '../utils/dateRange'
import { seedDemoBook } from '../data/demoBook'
import {
  SUPER_ADMIN_ROLE, ADMIN_ROLE, GOVERN_PERMISSION, TAB_PERMISSION, isSuperAdmin,
  effectivePermission, withPermission, emptyOverrides, emptyScope, defaultSecurity,
  chainEntry, deviceLabel, signInBlock, inScope, PLATFORM_NAME_DEFAULT,
} from '../utils/governance'

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

// Signing in now requires status 'Active' exactly, rather than merely "not Inactive", because a
// third status exists: an account requested at the sign-in screen sits at 'Pending' until an Admin
// grants it a role (see SignUpScreen). Accounts created before the User Accounts panel started
// writing a status carry none at all, and under the old rule they could sign in — tightening the
// rule without this would have locked those installs out of their own accounts. Absent only: a
// status that is already set says what it says.
// The Super Admin level added a column to the role matrix and fourteen rows to it. A saved matrix
// predates all of them, and until now the matrix was not even persisted — so an install carries
// either nothing or a matrix with none of the new keys, and `can('view_reports')` on it would read
// undefined and hide the Report module from everybody.
//
// Reconciled the same way the seeded accounts are: the install's own answer wins for every key it
// already has an answer for, and the seed fills in the rest. A role the install invented gets the
// view/export keys (so nothing it could already see disappears) and nothing else — a permission
// nobody deliberately granted must not arrive switched on.
function mergeSeededPermissions(saved) {
  if (!saved) return null
  const merged = {}
  for (const [role, seeded] of Object.entries(INITIAL_ROLE_MATRIX)) {
    merged[role] = { ...seeded, ...(saved[role] || {}) }
  }
  for (const [role, cols] of Object.entries(saved)) {
    if (merged[role]) continue
    const defaults = Object.fromEntries(
      Object.keys(INITIAL_ROLE_MATRIX[ADMIN_ROLE]).map(k => [k, k.startsWith('view_') || k.startsWith('export_') ? true : false]),
    )
    merged[role] = { ...defaults, ...cols, govern_admins: false }
  }
  // govern_admins is the level itself. However a saved matrix came to hold it, only Super Admin
  // may: a matrix edited by hand in devtools must not be a way up.
  for (const role of Object.keys(merged)) {
    merged[role] = { ...merged[role], govern_admins: role === SUPER_ADMIN_ROLE }
  }
  return merged
}

function withUserStatus(saved) {
  if (!saved) return null
  return saved.map(u => (u.status ? u : { ...u, status: 'Active' }))
}

// An install that has been running since before the Super Admin level has its own saved account
// list, which contains no Super Admin — so the level would exist in the code and be held by
// nobody, Admin Control would be invisible, and the governance in this build would be
// unreachable on every install that already had data. That is not an upgrade, it is a no-op.
//
// Reconciled on username, the same way the seeded chart of accounts and bank accounts are: the
// install's own copy of an account wins, and anything the seed has since added is appended. The
// seeded Super Admin ships with no credential, so it arrives needing one to be chosen at its
// first sign-in rather than with a password somebody would have to be told.
function mergeSeededUsers(saved) {
  const withStatus = withUserStatus(saved)
  if (!withStatus?.length) return null
  const missing = INITIAL_SYSTEM_USERS.filter(
    seed => !withStatus.some(u => (u.username || '').toLowerCase() === seed.username.toLowerCase()),
  )
  return missing.length ? [...missing, ...withStatus] : withStatus
}

// Backfills the Schedule column into a column list saved before it existed. Only ever adds it,
// and only when the list already names some columns — an install that had deliberately hidden
// everything else keeps its choice for those.
function withLoanScheduleColumn(saved) {
  if (!Array.isArray(saved) || !saved.length) return saved || null
  if (saved.includes('structure')) return saved
  const at = saved.indexOf('product')
  const next = [...saved]
  next.splice(at >= 0 ? at + 1 : next.length, 0, 'structure')
  return next
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
    // The late penalty became a per-product setting; before that every new loan was written with a
    // fixed 5%. A saved product carries no penaltyRate, and reading that as 0 would quietly stop
    // charging penalties on new loans — so it is backfilled with the rate they were actually getting.
    const loanProducts = p.loanProducts
      ? (() => {
          const renamed = p.loanProducts.map(prod => prod.name === 'Car Loan' ? { ...prod, name: 'Vehicle Loan' } : prod)
          const withPenalty = renamed.map(prod => prod.penaltyRate == null ? { ...prod, penaltyRate: 5 } : prod)
          return withPenalty.some(prod => prod.name === 'Vehicle Loan')
            ? withPenalty
            : [...withPenalty, { name: 'Vehicle Loan', rate: 13, maxAmount: 30000, penaltyRate: 5 }]
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
      // The collections themselves and the till lines/counts behind them. Purely additive —
      // an install saved before repayments were recorded as their own transaction has none
      // of the three and starts them empty, which is why this needed no STORAGE_KEY bump:
      // nothing already saved changed shape. What such an install already collected still
      // reads back off each loan's schedule (see the Repayment Report's schedule fallback).
      repayments: p.repayments || null,
      cashSheet: p.cashSheet || null,
      cashCounts: p.cashCounts || null,
      recoveries: p.recoveries || null,
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
      systemUsers: mergeSeededUsers(p.systemUsers),
      // The role matrix was not persisted at all before the Super Admin level: every permission
      // edit was lost on refresh, which is untenable once a Super Admin governs the Admin through
      // it. Merged against the seed rather than taken as-is — see mergeSeededPermissions.
      roleMatrix: mergeSeededPermissions(p.roleMatrix),
      permissionLabels: p.permissionLabels ? { ...INITIAL_PERMISSION_LABELS, ...p.permissionLabels } : null,
      // Append-only governance trail and the maker-checker queue.
      adminAuditLogs: p.adminAuditLogs || null,
      adminRequests: p.adminRequests || null,
      platformName: p.platformName || null,
      adminAuditSeq: p.adminAuditSeq || null,
      adminRequestSeq: p.adminRequestSeq || null,
      integrations: p.integrations || null,
      customGeo: p.customGeo || null,
      // Column visibility per register. Additive — an install saved before the column picker
      // existed has neither, and falls back to showing every column.
      customerVisibleColumns: p.customerVisibleColumns || null,
      // A saved column list is filtered against the live definitions but never gains one added
      // since (see useTableColumns), so a column introduced after an install last saved would
      // stay invisible on it forever. 'structure' — the loan's repayment schedule — is inserted
      // after 'product', where it is declared, rather than appended to the end of the row.
      loanVisibleColumns: withLoanScheduleColumn(p.loanVisibleColumns),
      payrollColumns: p.payrollColumns || null,
      bankGroupLabels: p.bankGroupLabels || null,
      accountingColumns: p.accountingColumns || null,
      reportColumns: p.reportColumns || null,
      // Which business day is open (or was last closed) and the batch history behind it.
      // Both are additive — an install saved before System Operations existed has neither,
      // and falls back to a closed day with no history rather than needing a key bump.
      businessDay: p.businessDay || null,
      batchRuns: p.batchRuns || null,
      // Whether the demo book has already been offered to this install. Checked rather than
      // "are the registers empty" so that deleting the demo records sticks — an emptiness
      // test would seed them again on the next reload.
      demoSeeded: p.demoSeeded === true,
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

const SESSION_KEY = 'acabar-session'

// Two stores, because "Keep me signed in" is a real choice rather than a decoration:
// unticked the session lives in sessionStorage and dies with the tab, ticked it lives in
// localStorage and survives the browser closing. Read from either, so whichever the last
// sign-in chose is the one that comes back.
function readSession() {
  try { return localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || null } catch { return null }
}

// Which store held it, so the choice survives a refresh and the mirror effect keeps writing
// to the same place rather than quietly downgrading a remembered session.
function readRemembered() {
  try { return !!localStorage.getItem(SESSION_KEY) } catch { return false }
}

// ── Who is acting, and what that lets them do ────────────────────────────────
// Every governance case answers the same three questions before it changes anything: who is
// dispatching this, does their account hold the permission for it, and is the target something
// their level is allowed to touch. Kept as functions rather than repeated inline so a new case
// cannot quietly skip one.
const actorOf = state => state.systemUsers.find(u => u.username === state.currentUser) || null
const userOf = (state, username) => state.systemUsers.find(u => u.username === username) || null
const actorCan = (state, perm) => effectivePermission(actorOf(state), state.roleMatrix, perm)
const actorGoverns = state => actorCan(state, GOVERN_PERMISSION)
const activeSupers = users => users.filter(u => u.role === SUPER_ADMIN_ROLE && u.status === 'Active')

// Rules 2 and 5: a Super Admin's record is not the Admin's to edit, and rule 14 — it is not
// anybody's to delete or deactivate by accident either. Only an account that itself governs may
// touch one, and even then rule 15 keeps the last active one standing.
const targetOffLimits = (state, username) => {
  const target = userOf(state, username)
  return !!target && isSuperAdmin(target) && !actorGoverns(state)
}

// Rule 15. Applied to the last ACTIVE Super Admin whoever is asking, including a Super Admin
// acting on their own account: an install with no way back in is not a state to allow.
const wouldStrandInstall = (state, username, { role, status } = {}) => {
  const target = userOf(state, username)
  if (!target || !isSuperAdmin(target) || target.status !== 'Active') return false
  const losingIt = (role !== undefined && role !== SUPER_ADMIN_ROLE) || (status !== undefined && status !== 'Active')
  return losingIt && activeSupers(state.systemUsers).length <= 1
}

// One state change and the line in the trail that records it, written together — an audited action
// whose audit is a separate dispatch is an audited action somebody can forget to audit. Rule 9 is
// satisfied structurally rather than by discipline.
//
// Trimmed at 5000 entries. The chain stays verifiable from the oldest entry retained (verifyChain
// takes the first entry's own prevHash as given), and 5000 governance events is far beyond what an
// install of this size produces — but it is a trim, and it is stated rather than hidden.
function withAudit(state, patch, audit) {
  const seq = (state.adminAuditSeq || 0) + 1
  const entry = chainEntry({
    id: `AUD-${String(seq).padStart(6, '0')}`,
    timestamp: auditStamp(),
    actor: state.currentUser || 'system',
    actorRole: state.currentRole || '',
    module: '',
    action: '',
    object: '',
    previousValue: '',
    newValue: '',
    device: deviceLabel(),
    result: 'Applied',
    ...audit,
  }, state.adminAuditLogs[0] || null)
  return {
    ...state,
    ...patch,
    adminAuditLogs: [entry, ...state.adminAuditLogs].slice(0, 5000),
    adminAuditSeq: seq,
  }
}

// Maker-checker (rule 10, section 9). The Admin's attempt is recorded as a request and applied
// only by APPROVE_ADMIN_REQUEST — which is what makes "Admin cannot grant itself permissions"
// true of the mechanism rather than merely of the UI.
function fileRequest(state, kind, payload, audit) {
  const seq = (state.adminRequestSeq || 0) + 1
  const request = {
    id: `REQ-${String(seq).padStart(4, '0')}`,
    kind,
    payload,
    status: 'Pending Super Admin Approval',
    requestedBy: state.currentUser,
    requestedByRole: state.currentRole,
    requestedAt: auditStamp(),
    decidedBy: '',
    decidedAt: '',
    reason: '',
  }
  return withAudit(state, {
    adminRequests: [request, ...state.adminRequests],
    adminRequestSeq: seq,
  }, { result: 'Pending approval', ...audit })
}

// What an approved request actually does. Returns the state patch, or null if the request can no
// longer be applied — a role deleted since, or a payload that would breach the hierarchy. Rule 4
// lives here as well as at the point of request: an approval must not be a second way in.
function applyRequest(state, req) {
  const p = req.payload || {}
  if (p.role === SUPER_ADMIN_ROLE || p.to === SUPER_ADMIN_ROLE || p.permission === GOVERN_PERMISSION) return null
  switch (req.kind) {
    case 'ROLE_PERMISSION': {
      if (!state.roleMatrix[p.role]) return null
      return { roleMatrix: { ...state.roleMatrix, [p.role]: { ...state.roleMatrix[p.role], [p.permission]: !!p.on } } }
    }
    case 'USER_ROLE': {
      if (!userOf(state, p.username) || !state.roleMatrix[p.to]) return null
      return { systemUsers: state.systemUsers.map(u => (u.username === p.username ? { ...u, role: p.to } : u)) }
    }
    case 'USER_STATUS': {
      if (!userOf(state, p.username)) return null
      return {
        systemUsers: state.systemUsers.map(u => (u.username === p.username
          ? { ...u, status: p.to, statusChanged: auditStamp(), role: p.to === 'Active' ? (u.role || u.requestedRole || '') : u.role }
          : u)),
      }
    }
    case 'USER_PASSWORD_RESET': {
      if (!userOf(state, p.username)) return null
      return {
        systemUsers: state.systemUsers.map(u => (u.username === p.username
          ? { ...u, passwordSalt: '', passwordHash: '', forcePasswordChange: true }
          : u)),
      }
    }
    case 'ROLE_CREATE': {
      if (state.roleMatrix[p.role]) return null
      const blank = Object.fromEntries(Object.keys(INITIAL_ROLE_MATRIX[ADMIN_ROLE]).map(k => [k, false]))
      return { roleMatrix: { ...state.roleMatrix, [p.role]: blank } }
    }
    default:
      return null
  }
}

const persisted = loadPersistedState()

// A restored session is only as good as the account it names. Resolved here so both the username
// and the ROLE come back from the record: an account since deleted, deactivated, locked or
// suspended must not walk back in on a stale storage key, and the role must not be guessed.
const sessionUser = (() => {
  const name = readSession()
  if (!name) return null
  const users = persisted.systemUsers?.length ? persisted.systemUsers : INITIAL_SYSTEM_USERS
  const found = users.find(u => u.username === name)
  return found && !signInBlock(found) ? found : null
})()

// The remarks the chart of accounts shipped with before every account was made to name its own
// currency. A USD account and its KHR sibling were told apart only by a "(KHR)" suffix on the
// name — and half the USD accounts carried no remark at all — so an operator reading the
// Description column could not tell which of a pair a posting would land in.
//
// Only saved rows still holding one of these exact strings (or nothing) are refreshed. A remark
// the operator has written themselves matches none of them and is left alone, which is the
// point: this backfills the seed's own text without overwriting anyone's edit.
const PREVIOUS_SEED_DESCRIPTIONS = {
  '1000': 'Everything the branch owns: cash, bank balances, the loan book and what is owed to it.',
  '1010': 'Notes and coins held in the branch, in US dollars.',
  '1011': 'Notes and coins held in the branch, in Khmer Riel.',
  '1021': 'Bank account balance held in Khmer Riel.',
  '1100': 'Roll-up of all outstanding loan principal across products.',
  '1110': 'Contra-asset — offsets Loans Receivable for expected credit losses.',
  '1120': 'Interest earned but not yet collected. Debited by the End of Day accrual, cleared as repayments come in.',
  '1121': 'Interest earned but not yet collected on riel loans. Debited by the End of Day accrual.',
  '1130': 'Principal out with borrowers. Debited when a loan is disbursed, credited by the principal each repayment retires.',
  '1131': 'Principal out with borrowers on riel loans. Debited on disbursement, credited by the principal each repayment retires.',
  '1132': 'Contra-asset offsetting 1130. Credited by the End of Month provisioning run as the required allowance rises.',
  '1133': 'Contra-asset offsetting 1131, provisioned at End of Month.',
  '2000': 'Everything the branch owes: payables, tax, and depreciation accumulated against its assets.',
  '2030': 'Approved loan principal the company still owes borrowers. Credited on final approval, debited when the loan is disbursed.',
  '2040': 'Tax assessed or withheld and not yet paid to the authority.',
  '2041': 'Tax assessed or withheld and not yet paid, in Khmer Riel.',
  '2050': 'Depreciation accumulated to date against fixed assets.',
  '3000': 'Capital put in and profit kept back.',
  '4000': 'What the loan earns in fees, kept apart from interest.',
  '4010': 'Fees earned on refinancing and other restructuring.',
  '4011': 'Restructuring fees earned on riel loans.',
  '5000': 'What the loan book earns: repayment and interest income.',
  // An account whose seed text has been rewritten more than once lists every previous
  // version: an install that saved the second one is just as much "still holding the seed's
  // own words" as one that saved the first, and only the operator's own wording should win.
  '5010': [
    'Receives all borrower loan repayments.',
    'USD. Interest and fees collected from borrowers, in US dollars. Cash actually received, as opposed to the 5020 accrual of what has been earned.',
  ],
  '5020': 'Interest earned on outstanding principal, recognised daily by the End of Day batch.',
  '5021': 'Interest earned on outstanding riel principal, recognised daily by the End of Day batch.',
  '6000': 'What it costs to run the book and the branch.',
  '6010': 'Funds loan principal on disbursement.',
  '6020': 'Funds staff salaries.',
  '6021': 'Funds staff salaries paid in Khmer Riel.',
  '6030': 'Funds utility bills.',
  '6031': 'Water supply charges for the branch.',
  '6032': 'Electricity charges for the branch.',
  '6033': 'Fuel for branch vehicles and field visits.',
  '6040': 'Funds general operating expenses.',
  '6050': 'Charge recognised when the required loan-loss allowance rises at End of Month.',
  '6051': 'Provision charge on riel loans, recognised at End of Month.',
}

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
  const seededDescription = new Map(INITIAL_CHART_OF_ACCOUNTS.map(a => [a.code, a.description]))
  return merged.map(a => {
    const next = (a.parentCode || '').trim() || !seededParent.get(a.code)
      ? a
      : { ...a, parentCode: seededParent.get(a.code) }
    // See PREVIOUS_SEED_DESCRIPTIONS: a remark the install never had, or still holds exactly as
    // the seed last wrote it, takes the current seed text so existing installs get the
    // currency-naming remarks too. Anything else is the operator's own wording and stays.
    const savedText = (next.description || '').trim()
    const previous = PREVIOUS_SEED_DESCRIPTIONS[next.code]
    const stale = !savedText || (Array.isArray(previous) ? previous.includes(savedText) : savedText === previous)
    const seedText = seededDescription.get(next.code)
    return stale && seedText && seedText !== next.description
      ? { ...next, description: seedText }
      : next
  })
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
// A provider's bank accounts: everything the install saved, plus any seeded account it has
// not been offered before — matched on the account number, so an edited one is never
// duplicated and an install that already had accounts of its own still sees one the build
// added afterwards.
//
// Offered once, not every load. `seededBankAccounts` records which seeded numbers this install
// has already been given, so deleting one makes it stay deleted; without that record, "never
// held" and "deliberately removed" look identical and a deleted row would return on the next
// reload. Adding a new entry to INITIAL_INTEGRATIONS still reaches every install, once.
function mergeSeededBankList(saved, seeded, alreadyOffered) {
  const list = Array.isArray(saved) ? saved : []
  const held = new Set(list.map(a => a.accountNumber))
  const offered = new Set(alreadyOffered || [])
  const fresh = (seeded || []).filter(a => !held.has(a.accountNumber) && !offered.has(a.accountNumber))
  return {
    bankAccounts: [...list, ...fresh],
    seededBankAccounts: [...new Set([...offered, ...(seeded || []).map(a => a.accountNumber)])],
  }
}

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
      // The bank accounts collected payments settle into (WeBill365's account card). Install
      // data, so what was saved is kept — including an install saved when this held a single
      // `bankAccount`, which is folded into the list rather than losing the account it had
      // already activated. Seeded accounts the install has never seen are appended, matched on
      // the account number, the same way mergeSeededAccounts reconciles the chart of accounts:
      // an install that already had accounts of its own would otherwise never see an account
      // the build added afterwards.
      ...mergeSeededBankList(
        s.bankAccounts ?? (s.bankAccount ? [s.bankAccount] : null),
        seed.bankAccounts,
        s.seededBankAccounts,
      ),
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
  // penaltyRate is the late penalty charged once on an overdue instalment (see systemOperations'
  // End of Day); 0 sells the product without one.
  { name: 'Business Loan',     rate: 12, maxAmount: 50000,  penaltyRate: 5 },
  { name: 'Agricultural Loan', rate: 10, maxAmount: 20000,  penaltyRate: 5 },
  { name: 'Personal Loan',     rate: 15, maxAmount: 10000,  penaltyRate: 5 },
  { name: 'SME Loan',          rate: 12, maxAmount: 50000,  penaltyRate: 5 },
  { name: 'Housing Loan',      rate: 10, maxAmount: 100000, penaltyRate: 5 },
  { name: 'Land Loan',         rate: 11, maxAmount: 80000,  penaltyRate: 5 },
  { name: 'Vehicle Loan',      rate: 13, maxAmount: 30000,  penaltyRate: 5 },
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
  // Was an exact-day match, which answered a question nobody asks — a register is read for a
  // period. See utils/dateRange: the preset is held rather than the two dates it resolves to,
  // so "This month" keeps meaning this month. Not persisted: which slice of the register was
  // last on screen is transient, and reopening the app on yesterday's filter reads as data
  // having gone missing. A slice worth keeping is kept deliberately — see savedFilters.
  customerDateRange: ALL_DATES,
  // Which columns the operator left visible in the customer register. Persisted, and kept out
  // of SET_TAB's reset list, because a column hidden on purpose reappearing on the next visit
  // reads as the filter being broken. null = show every column.
  customerVisibleColumns: persisted.customerVisibleColumns || null,
  // Named filter sets, keyed by which register they belong to ('loans', 'customers'). What a
  // set restores is decided by the page that saved it and stored verbatim, so a register can
  // add a filter later without this shape changing. Persisted — a saved view the operator
  // named and lost on refresh would be worse than not offering to save it at all.
  savedFilters: persisted.savedFilters || {},
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
  // The payroll tables' visible columns, keyed by table ('approval', 'audit'). One field
  // rather than one per table: payroll has two lists today and adding a third should not mean
  // another state field, another persisted key and another migration. null = show everything.
  payrollColumns: persisted.payrollColumns || null,
  // accounting
  // Which Account Management card is open as its own page ('general' | 'payroll' | null).
  // Reducer state rather than the component's own, because SET_TAB resets accountingTab: held
  // locally it outlived that reset and left the module on a card page with its tab bar showing
  // and no tab selected. Transient, so not persisted.
  accountingCard: null,
  // Bank account group labels the operator has renamed, keyed by the group's fixed id
  // ({ payable: 'Disbursement Bank' }). Only the label moves: every bank account stores the
  // id, and the loan/payroll filtering downstream keys off it, so the id must never change.
  // Persisted — a renamed group that reverted on reload would be worse than not renaming.
  bankGroupLabels: persisted.bankGroupLabels || {},
  // Which columns each General Account Management table shows, keyed by table id ('gl', 'je',
  // 'se', 'ct', 'inc', 'exp'). One field for six tables, as payrollColumns is for payroll:
  // the choice was local component state, so a view an operator set was gone on reload.
  accountingColumns: persisted.accountingColumns || {},
  // Same idea for the report tables, keyed by report id ('collection-sheet', 'gl-daily', …).
  // Loan Report and Financial Report share the one field — the two modules sit on the same
  // Reports page and their ids don't collide.
  reportColumns: persisted.reportColumns || {},
  activeStatement: persisted.activeStatement || 'pl',
  // null = no section expanded; the Accounting page shows just its section cards
  accountingTab: null,
  transactionModalOpen: false,
  transactionModalType: 'Income',
  cashTransferModalOpen: false,
  cashCountModalOpen: false,
  accountHistoryCode: null,
  accountHistoryCurrency: null,
  glFilter: 'all',
  glAccountFilter: 'all',
  // reports
  reportTab: 'portfolio',
  // Which report module is open ('loan' | 'financial' | null = the picker). In the reducer
  // for the same reason accountingCard is: held in the component, it outlived SET_TAB, so
  // clicking Report in the sidebar left the user inside whichever module they were already in
  // and appeared to do nothing. Transient, so not persisted.
  reportView: null,
  // settings
  selectedRole: 'Credit Manager',
  // ── Who is signed in ──────────────────────────────────────────────────────
  // The username of the signed-in account, or null. Held in sessionStorage rather than
  // localStorage on purpose: a session should end with the browser tab, so reopening the app
  // tomorrow asks who you are, while a refresh mid-task does not. Only the username is kept —
  // the credential is never held anywhere but the user record's PBKDF2 digest.
  currentUser: sessionUser?.username || null,
  // Whether this session was asked to outlive the tab — see readSession above.
  rememberSession: readRemembered(),
  // Which pre-session screen is showing: 'sign-in', 'sign-up', or 'console' — the operator's own
  // door, which accepts only the accounts that govern Admins. In the reducer rather than in
  // the component because it carries a URL (see navigation.js) — a request-access link has to be
  // something a new joiner can be sent. Transient, so deliberately not persisted: a saved
  // 'sign-up' would greet a returning install with the wrong screen.
  authView: 'sign-in',
  // The role permissions are read through. It is no longer a free choice: SIGN_IN sets it from
  // the account's own role, which is what turns the roleMatrix from a description into a rule.
  // Restored from the account, not defaulted: SIGN_IN is the only case that sets it, and a
  // refresh never re-runs it — so a reloaded session used to read as Admin whatever role the
  // account actually held, handing every permission to whoever pressed F5. The pre-sign-in
  // value is irrelevant (nothing renders until a session exists, see App.jsx) but has to be
  // something, so it stays Admin.
  currentRole: sessionUser?.role || ADMIN_ROLE,
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
  // One record per collection — what was paid, through which till or bank account, and how
  // it was allocated across principal and each kind of income. The loan's schedule says what
  // an installment owes; this says what actually came in against it, which is what the
  // repayment/cash/income/bank reports are built from.
  repayments: persisted.repayments || [],
  // Physical cash movements through the branch tills, each carrying the repayment it came
  // from, and the denomination counts a cashier takes against them. A count never moves
  // money: it records what was in the drawer next to what the books say should be.
  cashSheet: persisted.cashSheet || [],
  cashCounts: persisted.cashCounts || [],
  // Money collected on loans already written off — see RECORD_RECOVERY.
  recoveries: persisted.recoveries || [],
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
  roleMatrix: persisted.roleMatrix || INITIAL_ROLE_MATRIX,
  permissionLabels: persisted.permissionLabels || INITIAL_PERMISSION_LABELS,
  // ── Super Admin governance ────────────────────────────────────────────────
  // The trail of everything done to or by an Admin account, newest first, each entry carrying a
  // checksum over the one before it (see utils/governance.js on what that does and does not
  // prove). Nothing in the app edits or deletes an entry — the only case that touches this
  // collection prepends to it.
  adminAuditLogs: persisted.adminAuditLogs || [],
  // Maker-checker. An Admin's own attempt to change identity or permissions lands here as a
  // request instead of being applied, and a Super Admin approves or rejects it.
  adminRequests: persisted.adminRequests || [],
  // Which pane of the Admin Control console is open, and which account it is governing.
  // Transient: a console tab is not something to restore days later.
  // The console opens on its dashboard — every governed account at once — rather than on one
  // account's profile: what needs a decision is a property of the fleet, not of whichever
  // account happened to be first in the list.
  // ── Who the operator is ───────────────────────────────────────────────────
  // NOT the company in companyProfile. That is the BUSINESS this install serves — Acabar Plc, its
  // loan book, its staff, its letterhead. The Super Admin sits above it and belongs to whoever
  // operates the platform, which is a different organisation entirely: wearing the business's logo
  // and name in the console said the opposite, that the Super Admin was one of Acabar's own.
  //
  // Defaults to the operator's own name rather than to the business's — borrowing the tenant's
  // brand for the console that governs it is what this field exists to avoid.
  platformName: persisted.platformName || PLATFORM_NAME_DEFAULT,
  adminControlTab: 'overview',
  adminControlUser: null,
  // Monotonic, so an audit id or a request id is never reused even after the trail is trimmed.
  // A length-derived id would start repeating the moment the oldest entries were dropped, and a
  // trail with two AUD-000001 lines in it is not a trail.
  adminAuditSeq: persisted.adminAuditSeq || 0,
  adminRequestSeq: persisted.adminRequestSeq || 0,
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
  demoSeeded: persisted.demoSeeded,
  // ── Screen lock ───────────────────────────────────────────────────────────
  // This app has no login, so it has no session to time out, and the Settings panel that used
  // to offer "Session Timeout" and "Max Login Attempts" saved neither and enforced neither.
  // What CAN honestly be done in a browser with no server is blank the screen when a terminal
  // is left unattended — a branch counter showing a customer's national ID, balances and
  // address to whoever walks past is a real exposure, and this is the control that addresses
  // it. It is a screen lock, named as one; it does not authenticate anybody and does not
  // protect the data at rest. 0 = off.
  screenLockMinutes: persisted.screenLockMinutes ?? 15,
  // Transient: never persisted. A reload is a deliberate act at the keyboard, so coming back
  // to a locked screen after one would be theatre rather than protection.
  screenLocked: false,
  // Set when a write to localStorage fails — the quota is the usual cause. Surfaced in the UI
  // because the alternative is the operator working on for an hour against a store that has
  // silently stopped accepting anything.
  storageFailed: false,
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

// Cash collected over the counter never touches a bank: it sits in the branch till until
// someone banks it. 1010 holds the dollar float and 1011 the riel one — the chart's
// "KHR sibling takes the USD code + 1" convention. A branch running more than one till
// files each cashier as a sub-account of those ("Cashier A — USD", parentCode 1010), so
// a sub-account is a cash account too and can be paid into directly.
const CASH_GL_ROOT = { USD: '1010', KHR: '1011' }

export function cashAccountOptions(chartOfAccounts, currency) {
  const root = CASH_GL_ROOT[currency] || CASH_GL_ROOT.USD
  return (chartOfAccounts || []).filter(a =>
    (a.code === root || a.parentCode === root) && a.status !== 'INACTIVE'
  )
}

// Real bank accounts a borrower's transfer can actually be received into. The Receivable
// and Payroll cards are lenses on the loan control account and the salary GL rather than
// accounts money arrives in, so they are not offered as a repayment destination — see
// BANK_CARD_GROUPS in AccountingPage. A card tagged to another branch is left out for the
// same reason fundingGLCode refuses it.
export function repaymentBankOptions(realBankAccounts, currency, branch) {
  return (realBankAccounts || []).filter(a =>
    a.currency === currency &&
    a.glCode &&
    a.group !== 'receivable' && a.group !== 'payroll' &&
    (!a.branch || !branch || a.branch === branch)
  )
}

// A repayment method is either cash over the counter or money that arrived in a bank
// account. Callers have spelled the bank side several ways over time ('Transfer',
// 'Bank Transfer', 'Bank', 'KHQR'), so cash is what is matched and everything else is
// treated as a bank receipt rather than the other way round.
export function isCashMethod(method) {
  return /cash/i.test(method || '')
}

// The two loan-book control accounts in the chart of accounts. Account Payable carries
// principal the company has approved but not yet handed over; Account Receivable carries
// principal already out with borrowers. Together they cover a loan's whole life: approval
// credits the payable, disbursement moves it to the receivable, and each repayment credits
// the receivable back down by whatever principal it retired.
const AP_LOAN_CODE = '2030'
const AR_LOAN_CODE = '1130'

// Where each half of a repayment's *allocation* is recognised. Principal retires the
// receivable above; everything else the borrower hands over is income, and each kind of
// income keeps its own account so a book heavy on penalties reads apart from one heavy on
// interest. Keyed by the loan's currency — a riel collection must not credit a dollar
// income account (5010/5011, 5040/5041, 4010/4011 are the same USD/KHR pairs the rest of
// the chart uses).
const INTEREST_INCOME_CODE = { USD: '5010', KHR: '5011' }
const PENALTY_INCOME_CODE = { USD: '5040', KHR: '5041' }
const FEE_INCOME_CODE = { USD: '4010', KHR: '4011' }
// Collected on a loan already written off. Income rather than a reversal: the receivable went
// when the loan left the book, so there is no asset left for a later payment to credit back.
const RECOVERY_INCOME_CODE = { USD: '5050', KHR: '5051' }
// The status a written-off loan carries. Reports read the same string — see ReportsPage.
const WRITTEN_OFF_STATUS = 'Written Off'
// Principal still owed: what was disbursed less the principal each instalment has actually
// retired. Read off the schedule rather than the running `balance` column so a loan part-way
// through a partial payment is measured on money received, not on what the row expected.
function outstandingPrincipal(loan) {
  const paid = (loan.schedule || []).reduce((sum, r) => sum + (r.principalPaid || 0), 0)
  return Math.max(0, Math.round(((loan.amount || 0) - paid) * 100) / 100)
}
// The allowance a write-off consumes, and the expense any uncovered part falls to — the same
// pair End of Month provisioning builds up (see PROVISION_GL in utils/systemOperations).
const LOAN_LOSS_ALLOWANCE_CODE = { USD: '1132', KHR: '1133' }
const LOAN_LOSS_EXPENSE_CODE = { USD: '6050', KHR: '6051' }
const incomeCodeFor = (map, currency) => map[currency] || map.USD

// Record numbers for the collections themselves and the cash-sheet/count lines they
// produce. Read off the highest number already issued rather than the list length, so
// deleting a record can never hand its number out a second time.
function nextRecordId(list, prefix) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  const highest = (list || []).reduce((max, r) => {
    const m = pattern.exec(r?.id || '')
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `${prefix}-${String(highest + 1).padStart(6, '0')}`
}

// The payment side of a repayment: where the money physically arrived, as opposed to what
// it was used for. One collection can arrive through more than one door (part cash at the
// counter, part transferred), so this always resolves to a list — a caller naming only a
// paymentMethod (the demo book, or any older screen) gets a single part covering the whole
// amount, routed the way that method would have been routed before.
//
// Returns null — and the caller refuses the whole repayment — when an account can't be
// resolved or the parts don't add up to what was collected. Refusing rather than falling
// back to "whatever account is first on file" is the same rule fundingGLCode follows: money
// landing in the wrong account is worse than a payment that has to be re-entered.
function resolvePaymentParts(state, loan, total, action) {
  const raw = Array.isArray(action.payments) && action.payments.length
    ? action.payments
    : [{
        method: action.paymentMethod || 'Cash',
        amount: total,
        cashAccountCode: action.cashAccountCode,
        bankAccountId: action.bankAccountId,
      }]
  const currency = loan.currency
  const parts = []
  for (const p of raw) {
    const amount = Math.round((Number(p.amount) || 0) * 100) / 100
    if (amount <= 0.005) continue
    const method = p.method || 'Cash'
    if (isCashMethod(method)) {
      const tills = cashAccountOptions(state.chartOfAccounts, currency)
      const till = tills.find(a => a.code === p.cashAccountCode) || tills[0]
      if (!till) return null
      parts.push({
        kind: 'Cash', method, amount,
        glCode: till.code, accountLabel: till.name, bankAccountId: null,
      })
    } else {
      const banks = repaymentBankOptions(state.realBankAccounts, currency, loan.branch)
      const bank = banks.find(a => a.id === p.bankAccountId) || null
      const glCode = bank?.glCode || fundingGLCode(state.realBankAccounts, currency, loan.branch, 'ACC-REPAYMENT')
      if (!glCode) return null
      const label = bank
        ? `${bank.name} — ${bank.currency}`
        : (state.chartOfAccounts.find(a => a.code === glCode)?.name || glCode)
      parts.push({
        kind: 'Bank', method, amount,
        glCode, accountLabel: label,
        bankAccountId: bank?.id || (state.realBankAccounts || []).find(a => a.glCode === glCode && a.currency === currency)?.id || null,
      })
    }
  }
  if (!parts.length) return null
  const collected = Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100
  if (Math.abs(collected - total) > 0.005) return null
  return parts
}

// Posts one collection. The payment side debits wherever the money landed — a till for
// cash, the real bank account for a transfer — and the allocation side credits what it was
// used for: principal off the receivable, interest/penalty/fee to their own income
// accounts. The two sides are built from one decomposition of the same total, which is what
// keeps every entry balanced however the payment was split.
//
// Everything it produces (the repayment record, its cash-sheet lines, its income rows and
// its journal entry) carries the repayment id, so a later reversal can find every posting a
// collection caused instead of guessing at it.
function buildRepaymentPosting(state, { loan, parts, allocation, date, memo, installmentNum, kind, receipt }) {
  const round2 = n => Math.round((n || 0) * 100) / 100
  const { principal, interest, penalty, fee } = allocation
  const total = round2(parts.reduce((s, p) => s + p.amount, 0))
  const currency = loan.currency
  const interestCode = incomeCodeFor(INTEREST_INCOME_CODE, currency)
  const penaltyCode = incomeCodeFor(PENALTY_INCOME_CODE, currency)
  const feeCode = incomeCodeFor(FEE_INCOME_CODE, currency)
  const repaymentId = nextRecordId(state.repayments, 'RPY')
  const methodSummary = parts.length > 1
    ? `Split (${parts.map(p => p.kind).join(' + ')})`
    : parts[0].method

  const repayment = {
    id: repaymentId,
    date,
    loanRef: loan.ref,
    customerCode: loan.customerCode,
    customerName: loan.customerName,
    currency,
    branch: loan.branch || '',
    installmentNum,
    kind,
    total,
    allocation: { principal, interest, penalty, fee },
    payments: parts.map(p => ({
      method: p.kind, methodLabel: p.method, amount: p.amount,
      accountCode: p.glCode, accountLabel: p.accountLabel, bankAccountId: p.bankAccountId,
    })),
    paymentMethod: methodSummary,
    memo,
    ...receipt,
    createdAt: new Date().toISOString(),
  }

  // One cash-sheet line per cash part, never more: the till only moves for the money
  // actually handed over the counter, and a bank transfer moves no physical cash at all.
  let cashSheetSoFar = state.cashSheet
  const cashSheetLines = parts.filter(p => p.kind === 'Cash').map(p => {
    const line = {
      id: nextRecordId(cashSheetSoFar, 'CS'),
      date,
      direction: 'IN',
      amount: p.amount,
      currency,
      cashAccountCode: p.glCode,
      cashAccountName: p.accountLabel,
      source: 'Loan Repayment',
      repaymentId,
      reference: loan.ref,
      installmentNum,
      customerCode: loan.customerCode,
      customerName: loan.customerName,
      memo: memo || `${kind === 'remainder' ? 'Remaining balance of installment' : 'Installment'} #${installmentNum} collected in cash`,
      createdAt: new Date().toISOString(),
    }
    cashSheetSoFar = [line, ...cashSheetSoFar]
    return line
  })

  // The income register records what was *earned*, so principal is absent from it — the
  // borrower handing back money they were lent is not income. `account` stays the account
  // the cash landed in (the till, or the bank) so the account-history panels keep reading
  // as before; `incomeAccount` is what the ledger credited, which is what the Income
  // Report reports on.
  const primaryAccount = parts.reduce((a, b) => (b.amount > a.amount ? b : a), parts[0])
  const incomeRow = (amount, category, incomeType, code, glCode, description) => ({
    category, incomeType, amount, code,
    date, description,
    account: primaryAccount.glCode,
    incomeAccount: glCode,
    source: `${description} via ${methodSummary}`,
    customerCode: loan.customerCode, customerName: loan.customerName,
    paymentMethod: methodSummary, currency, repaymentId, loanRef: loan.ref,
  })
  const newIncomes = [
    ...(interest > 0.005 ? [incomeRow(interest, 'Repayment Income', 'Interest Income', `RP-${loan.ref}`, interestCode, `Interest collected on installment #${installmentNum}`)] : []),
    ...(penalty > 0.005 ? [incomeRow(penalty, 'Late Penalty Fees', 'Penalty Income', `LF-${loan.ref}-${installmentNum}`, penaltyCode, `Late penalty on installment #${installmentNum}`)] : []),
    ...(fee > 0.005 ? [incomeRow(fee, 'Loan Fee Income', 'Fee Income', `FE-${loan.ref}-${installmentNum}`, feeCode, `Fee collected with installment #${installmentNum}`)] : []),
  ]

  const entryMemo = `Loan repayment ${repaymentId} — ${loan.customerName || loan.ref} (${kind === 'remainder' ? `remaining balance of installment #${installmentNum}` : `installment #${installmentNum}`}, via ${methodSummary})${memo ? ` — ${memo}` : ''}`
  const journalEntry = {
    id: `rp-${repaymentId}`,
    entryType: 'Loan Repayment',
    date,
    transactionNo: repaymentId,
    trnRef: loan.ref,
    repaymentId,
    memo: entryMemo,
    amount: total,
    lines: [
      ...parts.map(p => ({
        accountCode: p.glCode, debit: p.amount, credit: 0,
        memo: `${p.kind === 'Cash' ? 'Cash received' : 'Bank receipt'} — ${p.accountLabel}`,
      })),
      ...(principal > 0.005 ? [{ accountCode: AR_LOAN_CODE, debit: 0, credit: principal, memo: `Principal collected — installment #${installmentNum}` }] : []),
      ...(interest > 0.005 ? [{ accountCode: interestCode, debit: 0, credit: interest, memo: `Interest income — installment #${installmentNum}` }] : []),
      ...(penalty > 0.005 ? [{ accountCode: penaltyCode, debit: 0, credit: penalty, memo: `Penalty income — installment #${installmentNum}` }] : []),
      ...(fee > 0.005 ? [{ accountCode: feeCode, debit: 0, credit: fee, memo: `Fee income — installment #${installmentNum}` }] : []),
    ],
    createdAt: new Date().toISOString(),
  }

  // Balances move exactly as the entry's lines say they do. Debit-normal accounts (the
  // tills, the bank accounts) rise by what they were debited; the credit-normal income
  // accounts rise by what they were credited, and the receivable — debit-normal — falls by
  // the principal credited against it.
  const movements = {}
  const add = (code, delta) => { movements[code] = round2((movements[code] || 0) + delta) }
  parts.forEach(p => add(p.glCode, p.amount))
  add(AR_LOAN_CODE, -principal)
  add(interestCode, interest)
  add(penaltyCode, penalty)
  add(feeCode, fee)

  return { repayment, cashSheetLines, newIncomes, journalEntry, movements }
}

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
    // A tab the account may not open is refused here as well as hidden in the sidebar: the tab is
    // in the URL (see utils/navigation), so a pasted or bookmarked link is a second way in and has
    // to meet the same permission the menu does.
    case 'SET_TAB': {
      // Only checked once somebody is signed in. With no session the tab is being adopted from the
      // URL while the sign-in gate is up (see App.jsx) — refusing it there would throw away the
      // deep link the visitor arrived on, and nothing is rendered to protect yet. SIGN_IN below
      // re-checks the adopted tab against the account that actually signs in.
      const needed = TAB_PERMISSION[action.tab]
      if (state.currentUser && needed && !actorCan(state, needed)) return state
      return {
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
      accountingCard: null,
      // Back to the report picker, and to that module's first report — the same rule the
      // accounting cards follow: a sidebar entry returns its module to its landing view.
      reportView: null,
      reportTab: 'portfolio',
      accountHistoryCode: null,
      cashTransferModalOpen: false,
      cashCountModalOpen: false,
      transactionModalOpen: false,
      customerWizardOpen: false,
      previewCustomerCode: null,
      deletePendingCode: null,
      editingCustomerCode: null,
      }
    }
    case 'SET_CURRENCY': return { ...state, currency: action.currency }
    case 'TOGGLE_DARK_MODE': return { ...state, darkMode: !state.darkMode }
    // Clamped to something a person would actually choose: under a minute locks mid-sentence,
    // and beyond two hours it is off in all but name — which 0 already says plainly.
    case 'SET_SCREEN_LOCK_MINUTES': return {
      ...state,
      screenLockMinutes: Math.max(0, Math.min(120, Math.round(Number(action.minutes) || 0))),
    }
    case 'LOCK_SCREEN': return state.screenLocked ? state : { ...state, screenLocked: true }
    case 'UNLOCK_SCREEN': return state.screenLocked ? { ...state, screenLocked: false } : state
    case 'STORAGE_FAILED': return state.storageFailed ? state : { ...state, storageFailed: true }
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
    // Signing in is what decides the role, so the two move together and can never disagree.
    // The account's last-login stamp is written here because this is the only place a sign-in
    // happens — a screen unlock is not a new session and deliberately does not touch it.
    case 'SIGN_IN': {
      const user = userOf(state, action.username)
      // Every reason an account may not open a session, in one place and applied on both sides:
      // the sign-in screen explains it, this refuses it. Status (Pending / Inactive / Locked /
      // Suspended) and the account's own login-time window all live in signInBlock — so no
      // dispatch can open a session the form would have turned away.
      if (!user || signInBlock(user)) return state
      const session = {
        id: `SES-${String((state.adminAuditSeq || 0) + 1).padStart(6, '0')}`,
        startedAt: auditStamp(),
        device: deviceLabel(),
        remembered: !!action.remember,
      }
      // The tab adopted from the URL before sign-in may be one this account may not open. Sent to
      // the dashboard rather than to a page it would immediately be refused — the deep link is a
      // convenience, and it does not outrank the permission.
      const wanted = TAB_PERMISSION[state.activeTab]
      const mayOpen = !wanted || effectivePermission(user, state.roleMatrix, wanted)
      // An account that governs Admins lands in its own console rather than on the business
      // dashboard — that is the work it signs in to do. A deep link it may open still wins, so a
      // Super Admin following a link to a loan gets the loan.
      const governs = effectivePermission(user, state.roleMatrix, GOVERN_PERMISSION)
      const landing = governs && state.activeTab === 'dashboard' ? 'admin-control' : state.activeTab
      return withAudit(state, {
        currentUser: user.username,
        currentRole: user.role,
        activeTab: mayOpen ? landing : 'dashboard',
        rememberSession: !!action.remember,
        screenLocked: false,
        systemUsers: state.systemUsers.map(u => (u.username === user.username
          // failedLogins back to zero and any force-logout stamp cleared: both describe the
          // previous session, and carrying them into this one would end it immediately.
          ? { ...u, lastLogin: auditStamp(), failedLogins: 0, forceLogoutAt: '', activeSession: session }
          : u)),
      }, {
        actor: user.username, actorRole: user.role,
        module: 'Session', action: 'Login', object: user.username, result: 'Success',
      })
    }

    // A refused attempt is worth as much to the trail as a successful one, and it is what the
    // maximum-failed-attempts policy counts. Locking happens here rather than at the screen: the
    // screen can be reloaded to forget what it knew, the record cannot.
    case 'RECORD_FAILED_LOGIN': {
      const user = userOf(state, action.username)
      if (!user) return state
      const sec = { ...defaultSecurity(), ...(user.security || {}) }
      const failed = (user.failedLogins || 0) + 1
      const lock = sec.maxFailedAttempts > 0 && failed >= sec.maxFailedAttempts && user.status === 'Active'
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === user.username
          ? {
            ...u,
            failedLogins: failed,
            ...(lock ? { status: 'Locked', statusChanged: auditStamp(), lockedReason: `${failed} failed sign-in attempts` } : {}),
          }
          : u)),
      }, {
        actor: user.username, actorRole: user.role, module: 'Session',
        action: lock ? 'Account locked' : 'Failed sign-in', object: user.username,
        previousValue: String(user.failedLogins || 0), newValue: String(failed),
        result: lock ? 'Locked' : 'Refused',
      })
    }
    // "Forgot password?" with no mail server behind it. It cannot send a link, so it does the one
    // honest thing left: puts the ask where the person who can act on it will see it — beside the
    // account, in the panel they already use to clear a credential.
    //
    // Filed from the sign-in screen, so there is no session and nothing here can be trusted to name
    // a real account. An unknown name is a silent no-op, and the screen's confirmation reads the
    // same either way (see LoginScreen) — otherwise this becomes a way to find out which accounts
    // exist. An Inactive account is ignored for the same reason: it has no reset to wait for.
    case 'REQUEST_PASSWORD_RESET': {
      const user = userOf(state, action.username)
      if (!user || user.status === 'Inactive') return state
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === user.username
          ? { ...u, resetRequestedAt: auditStamp() }
          : u)),
      }, {
        actor: user.username,
        actorRole: user.role,
        module: 'Security',
        action: 'Password reset requested',
        object: user.username,
        result: 'Waiting on an administrator',
      })
    }
    case 'SET_AUTH_VIEW': return {
      ...state,
      authView: ['sign-up', 'console'].includes(action.view) ? action.view : 'sign-in',
    }
    // Ends the session and returns to the sign-in screen. Everything the operator had open goes
    // with it — a half-filled wizard left on screen for the next person to read is exactly what
    // signing out is for. The book itself stays saved; only the view is cleared.
    case 'SIGN_OUT': return withAudit(state, {
      // The session that is ending moves to that account's history, which is what makes the
      // Sessions pane able to show anything at all after the fact.
      systemUsers: state.systemUsers.map(u => (u.username === state.currentUser && u.activeSession
        ? {
          ...u,
          activeSession: null,
          sessionHistory: [{ ...u.activeSession, endedAt: auditStamp(), endedBy: action.by || 'self' }, ...(u.sessionHistory || [])].slice(0, 50),
        }
        : u)),
      currentUser: null,
      rememberSession: false,
      screenLocked: false,
      // Signing out lands on the sign-in form, never on the request-access form the last visitor
      // happened to leave open.
      authView: 'sign-in',
      activeTab: 'dashboard',
      loanDetailIdx: null,
      loanOverviewOpen: false,
      loanPreviewOpen: false,
      loanQuickPreviewOpen: false,
      loanWizardOpen: false,
      customerWizardOpen: false,
      previewCustomerCode: null,
      activeLoan: null,
      settingsOpen: false,
      systemOpsOpen: false,
    }, {
      module: 'Session',
      action: action.by ? `Signed out by ${action.by}` : 'Logout',
      object: state.currentUser || '',
      result: 'Success',
    })
    // Written by the first sign-in of an account that has no credential yet, and by an admin
    // resetting one. The plain password never reaches the reducer — only the salt and digest.
    case 'SET_USER_PASSWORD': {
      // Rule 2: an Admin clearing a Super Admin's credential would be a way to take the level
      // over — the target sets a new password at next sign-in, and whoever gets there first owns
      // it. Refused unless the actor governs, or is the account itself.
      //
      // Only ever applied to a THIRD PARTY, though: with no session open the dispatch is the
      // sign-in screen setting a password for an account whose password it has just verified, or
      // one that has none at all yet. Guarding that too would leave the seeded Super Admin — which
      // deliberately ships without a credential — unable to ever set one, and the level unusable.
      if (state.currentUser && action.username !== state.currentUser && targetOffLimits(state, action.username)) return state
      const setting = !!action.hash
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === action.username
          ? {
            ...u,
            passwordSalt: action.salt,
            passwordHash: action.hash,
            passwordSetAt: setting ? auditStamp() : u.passwordSetAt,
            // A cleared credential is a forced change; one just chosen clears the flag.
            forcePasswordChange: !setting,
            // Either way the ask has been answered, so it stops being outstanding.
            resetRequestedAt: '',
          }
          : u)),
      }, {
        module: 'Security',
        action: setting ? 'Password set' : 'Password reset — must be chosen at next sign-in',
        object: action.username,
        result: 'Applied',
      })
    }
    // ── The permission matrix, under the hierarchy ───────────────────────────
    // Three rules meet on this one control and all three are enforced here rather than by hiding
    // the checkbox, because a checkbox is not a rule:
    //   · rule 3 — nobody edits their OWN role's column. That is the definition of granting
    //     yourself a permission, and it is refused even for a Super Admin, whose column is
    //     already complete and has nothing to gain.
    //   · rules 2 and 6 — the Super Admin column is not editable by anyone below the level, and
    //     govern_admins is not editable at all. The level is not a permission to be handed round.
    //   · rule 3 again, as a workflow — an Admin's edit to any other column is FILED for approval
    //     instead of applied (section 9). It reaches the matrix when a Super Admin approves it.
    case 'TOGGLE_ROLE_PERMISSION': {
      const { role, perm } = action
      if (!state.roleMatrix[role]) return state
      if (perm === GOVERN_PERMISSION || role === SUPER_ADMIN_ROLE) return state
      if (role === state.currentRole) return state
      const next = !state.roleMatrix[role][perm]
      const audit = {
        module: 'Permissions', action: next ? 'Role permission granted' : 'Role permission revoked',
        object: `${role} / ${perm}`, previousValue: next ? 'denied' : 'allowed', newValue: next ? 'allowed' : 'denied',
      }
      if (!actorGoverns(state)) {
        return fileRequest(state, 'ROLE_PERMISSION', { role, permission: perm, on: next },
          { ...audit, action: `Requested ${next ? 'grant' : 'revoke'} of ${perm} for ${role}` })
      }
      return withAudit(state, {
        roleMatrix: { ...state.roleMatrix, [role]: { ...state.roleMatrix[role], [perm]: next } },
      }, audit)
    }
    // A whole role's column at once — what the preset menu on the permission matrix applies.
    // Only keys the build knows about are written, so a stale preset cannot introduce one. Same
    // three rules as the single toggle; a preset is not a way around them.
    case 'SET_ROLE_PERMISSIONS': {
      if (!state.roleMatrix[action.role]) return state
      if (action.role === SUPER_ADMIN_ROLE || action.role === state.currentRole) return state
      if (!actorGoverns(state)) return state
      const perms = Object.fromEntries(
        Object.keys(state.permissionLabels).map(key => [key, key === GOVERN_PERMISSION ? false : !!action.permissions[key]])
      )
      return withAudit(state, {
        roleMatrix: { ...state.roleMatrix, [action.role]: perms },
      }, {
        module: 'Permissions', action: 'Role column replaced', object: action.role,
        previousValue: Object.entries(state.roleMatrix[action.role]).filter(([, v]) => v).map(([k]) => k).join(' '),
        newValue: Object.entries(perms).filter(([, v]) => v).map(([k]) => k).join(' '),
      })
    }
    case 'ADD_ROLE': {
      const role = action.role.trim()
      if (!role || state.roleMatrix[role]) return state
      // Rule 4, at its most direct: a new role named "Super Admin" would be a second one.
      if (role === SUPER_ADMIN_ROLE) return state
      if (!actorGoverns(state)) {
        return fileRequest(state, 'ROLE_CREATE', { role }, {
          module: 'Permissions', action: 'Requested new role', object: role, newValue: role,
        })
      }
      const blankPerms = Object.fromEntries(Object.keys(state.permissionLabels).map(key => [key, false]))
      return withAudit(state, {
        roleMatrix: { ...state.roleMatrix, [role]: blankPerms },
        selectedRole: role,
      }, { module: 'Permissions', action: 'Role created', object: role, newValue: role })
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
    case 'ADD_SYSTEM_USER': {
      if (state.systemUsers.some(u => (u.username || '').toLowerCase() === (action.user.username || '').toLowerCase())) return state
      // Rule 4. The only Super Admin an install ever gets is the seeded one; another can be made
      // only by a Super Admin changing an existing account's role, never by creating one — and
      // never at all from the sign-in screen, which is where an unauthenticated request arrives
      // from (see SignUpScreen).
      const role = action.user.role === SUPER_ADMIN_ROLE && !actorGoverns(state) ? '' : action.user.role
      return { ...state, systemUsers: [...state.systemUsers, { ...action.user, role }] }
    }
    // Profile edits. The hierarchy is enforced here rather than only in the panel that calls it:
    // rule 2 (an Admin may not edit a Super Admin), rule 4 (nobody below the level may hand the
    // level out) and rule 15 (the last active Super Admin keeps the level).
    case 'UPDATE_SYSTEM_USER': {
      const target = userOf(state, action.username)
      if (!target) return state
      if (targetOffLimits(state, action.username)) return state
      const updates = { ...action.updates }
      if (updates.role !== undefined && updates.role !== target.role) {
        if (updates.role === SUPER_ADMIN_ROLE && !actorGoverns(state)) delete updates.role
        else if (wouldStrandInstall(state, action.username, { role: updates.role })) delete updates.role
        // Rule 3 and section 9: an account that does not govern cannot re-role anybody on its own
        // authority — the change is filed for a Super Admin to approve instead. Its own profile
        // fields still save immediately; it is the ROLE that waits.
        else if (!actorGoverns(state)) {
          const filed = fileRequest(state, 'USER_ROLE',
            { username: action.username, from: target.role, to: updates.role }, {
              module: 'Users', action: 'Requested role change', object: action.username,
              previousValue: target.role, newValue: updates.role,
            })
          delete updates.role
          return {
            ...filed,
            systemUsers: filed.systemUsers.map(u => (u.username === action.username ? { ...u, ...updates } : u)),
          }
        }
      }
      // Status is not editable through here at all — SET_USER_STATUS owns it, so every status
      // change goes past the same guards and lands in the trail.
      delete updates.status
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === action.username ? { ...u, ...updates } : u)),
      }, {
        module: 'Users', action: 'Edited account', object: action.username,
        previousValue: Object.keys(updates).map(k => `${k}=${target[k] ?? ''}`).join(' '),
        newValue: Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(' '),
      })
    }

    // ─── Super Admin governance ───────────────────────────────────────────────
    // Activate / Deactivate / Suspend / Lock / Unlock, and the Pending → Active grant that an
    // access request needs (see SignUpScreen). One case for all of them because they share every
    // guard: who may act, whether the target is above them, and whether the install would be left
    // without a Super Admin.
    case 'SET_USER_STATUS': {
      const target = userOf(state, action.username)
      if (!target || target.status === action.status) return state
      if (targetOffLimits(state, action.username)) return state
      if (wouldStrandInstall(state, action.username, { status: action.status })) return state
      // Nobody switches their own access off: the session would continue while the record said it
      // should not, and unlocking it again needs the very account that was just disabled.
      if (action.username === state.currentUser) return state
      if (!actorCan(state, 'activate_user')) return state

      const grantedRole = action.status === 'Active' ? (target.role || target.requestedRole || '') : target.role
      const patch = {
        systemUsers: state.systemUsers.map(u => (u.username === action.username
          ? {
            ...u,
            status: action.status,
            role: grantedRole,
            statusChanged: auditStamp(),
            statusReason: action.reason || '',
            suspendedUntil: action.status === 'Suspended' ? (action.until || '') : '',
            lockedReason: action.status === 'Locked' ? (action.reason || 'Locked by Super Admin') : '',
            failedLogins: action.status === 'Active' ? 0 : u.failedLogins || 0,
            // Losing Active ends the session with it — an account that may not sign in must not
            // be left with one open (rules 8 and 12).
            activeSession: action.status === 'Active' ? u.activeSession : null,
            forceLogoutAt: action.status === 'Active' ? u.forceLogoutAt : auditStamp(),
            sessionHistory: action.status !== 'Active' && u.activeSession
              ? [{ ...u.activeSession, endedAt: auditStamp(), endedBy: state.currentUser || 'system' }, ...(u.sessionHistory || [])].slice(0, 50)
              : u.sessionHistory,
          }
          : u)),
      }
      const audit = {
        module: 'Users', action: `Status → ${action.status}`, object: action.username,
        previousValue: target.status || '', newValue: action.status,
      }
      // An Admin activating a normal user is ordinary work and applies at once. An Admin acting on
      // ANOTHER Admin is a change of who governs what, so it waits for a Super Admin.
      if (!actorGoverns(state) && (target.role === ADMIN_ROLE || isSuperAdmin(target))) {
        return fileRequest(state, 'USER_STATUS',
          { username: action.username, from: target.status, to: action.status, reason: action.reason || '' },
          { ...audit, action: `Requested status → ${action.status}` })
      }
      return withAudit(state, patch, audit)
    }

    // The permission grid in Admin Control. Writes the account's own override rather than the
    // role's column, so one Admin can be narrowed without touching every other account that
    // shares the role — and rule 13 holds: `can()` reads the override, so the change bites on the
    // very next render, with no sign-out in between.
    case 'SET_ADMIN_PERMISSION': {
      if (!actorGoverns(state)) return state
      const target = userOf(state, action.username)
      if (!target || isSuperAdmin(target)) return state
      if (action.permission === GOVERN_PERMISSION) return state
      const roleGrants = state.roleMatrix[target.role] || {}
      const before = effectivePermission(target, state.roleMatrix, action.permission)
      const overrides = withPermission(target.permissionOverrides || emptyOverrides(), action.permission, !!action.on, roleGrants)
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === action.username
          ? { ...u, permissionOverrides: overrides }
          : u)),
      }, {
        module: 'Permissions',
        action: action.on ? 'Permission granted' : 'Permission revoked',
        object: `${action.username} / ${action.permission}`,
        previousValue: before ? 'allowed' : 'denied',
        newValue: action.on ? 'allowed' : 'denied',
      })
    }

    case 'SET_ADMIN_SCOPE': {
      if (!actorGoverns(state)) return state
      const target = userOf(state, action.username)
      if (!target || isSuperAdmin(target)) return state
      const scope = { ...emptyScope(), ...(action.scope || {}) }
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === action.username ? { ...u, scope } : u)),
      }, {
        module: 'Access Scope', action: 'Scope changed', object: action.username,
        previousValue: JSON.stringify(target.scope || emptyScope()),
        newValue: JSON.stringify(scope),
      })
    }

    case 'SET_ADMIN_SECURITY': {
      if (!actorGoverns(state)) return state
      const target = userOf(state, action.username)
      if (!target || isSuperAdmin(target)) return state
      const security = { ...defaultSecurity(), ...(target.security || {}), ...(action.security || {}) }
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === action.username ? { ...u, security } : u)),
      }, {
        module: 'Security', action: 'Security policy changed', object: action.username,
        previousValue: JSON.stringify({ ...defaultSecurity(), ...(target.security || {}) }),
        newValue: JSON.stringify(security),
      })
    }

    // Rule 12. What this can and cannot do is worth being exact about: it ends the session on the
    // ACCOUNT RECORD and stamps the moment it did. The browser holding that session drops it the
    // next time it reads state — immediately in this install, and never for a browser sitting
    // closed on another machine, because there is no server here to push anything to.
    case 'FORCE_LOGOUT_USER': {
      if (!actorGoverns(state)) return state
      const target = userOf(state, action.username)
      if (!target) return state
      return withAudit(state, {
        systemUsers: state.systemUsers.map(u => (u.username === action.username
          ? {
            ...u,
            activeSession: null,
            forceLogoutAt: auditStamp(),
            sessionHistory: u.activeSession
              ? [{ ...u.activeSession, endedAt: auditStamp(), endedBy: state.currentUser || 'system' }, ...(u.sessionHistory || [])].slice(0, 50)
              : u.sessionHistory,
          }
          : u)),
      }, {
        module: 'Sessions', action: 'Sessions terminated', object: action.username,
        previousValue: target.activeSession ? 'session open' : 'no session', newValue: 'terminated',
      })
    }

    // ─── Maker → checker ──────────────────────────────────────────────────────
    case 'APPROVE_ADMIN_REQUEST': {
      if (!actorGoverns(state)) return state
      const req = state.adminRequests.find(r => r.id === action.id)
      if (!req || req.status !== 'Pending Super Admin Approval') return state
      const patch = applyRequest(state, req)
      const decided = {
        ...req,
        status: patch ? 'Applied' : 'Rejected',
        decidedBy: state.currentUser,
        decidedAt: auditStamp(),
        // A request that can no longer be applied is closed with the reason, not left pending for
        // someone to keep trying: the role or account it named is gone or would breach the level.
        reason: patch ? '' : 'No longer applicable — the role or account it names has changed',
      }
      return withAudit(state, {
        ...(patch || {}),
        adminRequests: state.adminRequests.map(r => (r.id === req.id ? decided : r)),
      }, {
        module: 'Approvals', action: patch ? 'Request approved' : 'Request could not be applied',
        object: `${req.id} ${req.kind}`, previousValue: 'Pending Super Admin Approval',
        newValue: decided.status, result: patch ? 'Applied' : 'Refused',
      })
    }

    case 'REJECT_ADMIN_REQUEST': {
      if (!actorGoverns(state)) return state
      const req = state.adminRequests.find(r => r.id === action.id)
      if (!req || req.status !== 'Pending Super Admin Approval') return state
      return withAudit(state, {
        adminRequests: state.adminRequests.map(r => (r.id === req.id
          ? { ...r, status: 'Rejected', decidedBy: state.currentUser, decidedAt: auditStamp(), reason: action.reason || '' }
          : r)),
      }, {
        module: 'Approvals', action: 'Request rejected', object: `${req.id} ${req.kind}`,
        previousValue: 'Pending Super Admin Approval', newValue: 'Rejected',
        result: action.reason || 'Rejected',
      })
    }

    // The operator's own name, set by the operator. Guarded like every other governance change:
    // the business's Admin does not get to rename the party that governs it.
    case 'SET_PLATFORM_NAME': {
      if (!actorGoverns(state)) return state
      const name = String(action.name || '').trim().slice(0, 60)
      if (name === state.platformName) return state
      return withAudit(state, { platformName: name }, {
        module: 'Console', action: 'Operator name changed', object: 'platform',
        previousValue: state.platformName || '(unnamed)', newValue: name || '(unnamed)',
      })
    }
    case 'SET_ADMIN_CONTROL_TAB': return { ...state, adminControlTab: action.tab }
    case 'SET_ADMIN_CONTROL_USER': return { ...state, adminControlUser: action.username, adminControlTab: action.tab || 'profile' }
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
    case 'SET_CUSTOMER_DATE_RANGE': return { ...state, customerDateRange: action.range || ALL_DATES, customerPage: 1 }
    // Back to page 1 with the filters: the rows that survive a reset are a different list, and
    // staying on page 4 of it shows the operator a page that may no longer exist.
    case 'RESET_CUSTOMER_FILTERS': return {
      ...state, customerSearch: '', customerDateRange: ALL_DATES, customerPage: 1,
    }

    // Saved filters. `filter` is stored exactly as the page handed it over — this reducer never
    // reads inside it, which is what lets a register change what it saves without a migration.
    case 'SAVE_TABLE_FILTER': {
      const existing = state.savedFilters[action.tableId] || []
      const name = action.name.trim()
      if (!name) return state
      const entry = { id: `${action.tableId}-${Date.now()}`, name, filter: action.filter }
      // Saving over a name that is already taken replaces it rather than leaving two entries
      // the operator cannot tell apart.
      const kept = existing.filter(f => f.name.toLowerCase() !== name.toLowerCase())
      return {
        ...state,
        savedFilters: { ...state.savedFilters, [action.tableId]: [...kept, entry] },
      }
    }
    case 'DELETE_TABLE_FILTER': return {
      ...state,
      savedFilters: {
        ...state.savedFilters,
        [action.tableId]: (state.savedFilters[action.tableId] || []).filter(f => f.id !== action.id),
      },
    }

    // Loans
    case 'SET_LOAN_COLUMNS': return { ...state, loanVisibleColumns: action.ids }
    case 'SET_ACCOUNTING_COLUMNS': return {
      ...state,
      accountingColumns: { ...(state.accountingColumns || {}), [action.table]: action.ids },
    }
    case 'SET_PAYROLL_COLUMNS': return {
      ...state,
      payrollColumns: { ...(state.payrollColumns || {}), [action.table]: action.ids },
    }
    case 'SET_REPORT_COLUMNS': return {
      ...state,
      reportColumns: { ...(state.reportColumns || {}), [action.table]: action.ids },
    }
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
    // A loan judged uncollectable leaves the book. The receivable is removed against the
    // allowance End of Month has been building for exactly this, and anything the allowance does
    // not cover falls straight to provision expense — the shortfall is recognised, never absorbed
    // by flooring the allowance at zero and losing it.
    //
    //   Dr  Loan loss allowance   (up to what is held)
    //   Dr  Provision expense     (whatever is left)
    //   Cr  Account receivable    (the principal still outstanding)
    //
    // Branching on the status transition, not the status: re-dispatching against a loan already
    // written off must not remove the same receivable twice.
    case 'WRITE_OFF_LOAN': {
      const loan = state.loanApplications.find(l => l.ref === action.ref)
      if (!loan || loan.status === WRITTEN_OFF_STATUS) return state
      // Only a disbursed loan has a receivable to remove; anything earlier never opened one.
      if (loan.status !== 'Active') return state

      const round2 = n => Math.round((n || 0) * 100) / 100
      const outstanding = round2(outstandingPrincipal(loan))
      if (outstanding <= 0.005) return state

      const currency = loan.currency || 'USD'
      const allowanceCode = incomeCodeFor(LOAN_LOSS_ALLOWANCE_CODE, currency)
      const expenseCode = incomeCodeFor(LOAN_LOSS_EXPENSE_CODE, currency)
      const held = round2(state.chartOfAccounts.find(a => a.code === allowanceCode)?.balance || 0)
      const fromAllowance = round2(Math.min(Math.max(held, 0), outstanding))
      const fromExpense = round2(outstanding - fromAllowance)

      const date = action.date || new Date().toISOString().split('T')[0]
      const writtenOffLoan = {
        ...loan,
        status: WRITTEN_OFF_STATUS,
        writeOffReason: action.reason || '',
        writtenOffBy: action.by || state.currentRole,
        writtenOffDate: date,
        writtenOffAmount: outstanding,
      }
      const chartOfAccounts = applyGlMovements(state.chartOfAccounts, {
        [allowanceCode]: -fromAllowance,
        [expenseCode]: fromExpense,
        [AR_LOAN_CODE]: -outstanding,
      })
      const entry = {
        id: `wof-${loan.ref}`,
        entryType: 'Loan Write-Off',
        date,
        transactionNo: loan.ref,
        memo: `Written off — ${loan.ref} · ${loan.customerName}${action.reason ? ` · ${action.reason}` : ''}`,
        amount: outstanding,
        lines: [
          ...(fromAllowance > 0.005
            ? [{ accountCode: allowanceCode, debit: fromAllowance, credit: 0, memo: `Allowance applied — ${loan.ref}` }]
            : []),
          ...(fromExpense > 0.005
            ? [{ accountCode: expenseCode, debit: fromExpense, credit: 0, memo: `Uncovered by allowance — ${loan.ref}` }]
            : []),
          { accountCode: AR_LOAN_CODE, debit: 0, credit: outstanding, memo: `Receivable written off — ${loan.ref}` },
        ],
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        loanApplications: state.loanApplications.map(l => l.ref === loan.ref ? writtenOffLoan : l),
        activeLoan: state.activeLoan?.ref === loan.ref ? writtenOffLoan : state.activeLoan,
        chartOfAccounts,
        journalEntries: [entry, ...state.journalEntries],
      }
    }

    // Money that comes in after a loan was written off.
    //
    //   Dr  Cash float / bank account   (where it physically landed)
    //   Cr  Recovery income             (5050/5051)
    //
    // It does not touch AR: that receivable was removed at write-off, and crediting it again
    // would recreate an asset the institution has already said it does not expect to collect.
    case 'RECORD_RECOVERY': {
      const loan = state.loanApplications.find(l => l.ref === action.ref)
      if (!loan || loan.status !== WRITTEN_OFF_STATUS) return state
      const amount = Math.round((Number(action.amount) || 0) * 100) / 100
      if (amount <= 0.005) return state

      const currency = loan.currency || 'USD'
      const landedCode = action.glCode || fundingGLCode(state.realBankAccounts, currency, loan.branch, CASH_GL_ROOT[currency] || CASH_GL_ROOT.USD)
      if (!landedCode) return state
      const recoveryCode = incomeCodeFor(RECOVERY_INCOME_CODE, currency)
      const date = action.date || new Date().toISOString().split('T')[0]

      const recovery = {
        id: nextRecordId(state.recoveries, 'RCV'),
        date,
        loanRef: loan.ref,
        customerCode: loan.customerCode,
        customerName: loan.customerName,
        currency,
        branch: loan.branch || '',
        amount,
        method: action.method || 'Cash',
        accountCode: landedCode,
        memo: action.memo || '',
        recordedBy: action.by || state.currentRole,
        createdAt: new Date().toISOString(),
      }
      const chartOfAccounts = applyGlMovements(state.chartOfAccounts, {
        [landedCode]: amount,
        [recoveryCode]: amount,
      })
      const entry = {
        id: `rcv-${recovery.id}`,
        entryType: 'Write-Off Recovery',
        date,
        transactionNo: recovery.id,
        memo: `Recovered on written-off loan ${loan.ref} · ${loan.customerName}`,
        amount,
        lines: [
          { accountCode: landedCode, debit: amount, credit: 0, memo: `Recovery collected — ${loan.ref}` },
          { accountCode: recoveryCode, debit: 0, credit: amount, memo: `Recovery income — ${loan.ref}` },
        ],
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        recoveries: [recovery, ...(state.recoveries || [])],
        chartOfAccounts,
        journalEntries: [entry, ...state.journalEntries],
      }
    }

    case 'RECORD_REPAYMENT': {
      if (!state.activeLoan) return state
      const loan = state.activeLoan
      const idx = action.idx
      const row = loan.schedule[idx]
      const lateFee = row.lateFee || 0
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

      // How the collection is allocated. Penalty and any fee collected are settled first and
      // can never exceed what was actually handed over — a borrower paying $5 against a $20
      // penalty has paid $5 of penalty, not $20 of it — so that principal + interest +
      // penalty + fee always adds back up to the payment, whatever it covered.
      const penaltyPaid = Math.round(Math.min(lateFee, amt) * 100) / 100
      const enteredFeePaid = Math.round(Math.min(Math.max(action.fee || 0, 0), Math.max(amt - penaltyPaid, 0)) * 100) / 100
      // A collection fee priced into the instalment is settled here too, alongside the penalty and
      // any fee keyed in by hand — it is fee income, so it must not be left to fall through into
      // the principal/interest split below, where it would pay down AR as though it were principal.
      const scheduledCollectionFee = Math.round((row.collectionFee || 0) * 100) / 100
      const collectionFeePaid = Math.round(
        Math.min(scheduledCollectionFee, Math.max(amt - penaltyPaid - enteredFeePaid, 0)) * 100) / 100
      const feePaid = Math.round((enteredFeePaid + collectionFeePaid) * 100) / 100
      // Principal actually retired this period may differ from what the original
      // schedule assumed (e.g. borrower could only afford the interest this month).
      // Interest is settled first; whatever is left over pays down principal.
      const balanceBefore = idx === 0 ? loan.amount : (loan.schedule[idx - 1].balance ?? loan.amount)
      const installmentPayment = Math.max(amt - penaltyPaid - feePaid, 0)
      const principalPaid = Math.min(Math.max(installmentPayment - row.interest, 0), balanceBefore)
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
      // Taken off the rounded principal, not the raw one, so the four allocations add back
      // up to the payment exactly — the journal entry below balances on that identity.
      const interestPaid = Math.round((installmentPayment - principalPaidRounded) * 100) / 100
      const status = principalPaidRounded < scheduledPrincipal - SETTLED_TOLERANCE ? 'Partial' : 'Paid'

      // Where the money came in. Refused outright — nothing is written — when an account
      // can't be resolved or a split doesn't add up to what was collected; see
      // resolvePaymentParts.
      const parts = resolvePaymentParts(state, loan, Math.round(amt * 100) / 100, action)
      if (!parts) return state
      const paymentSummary = parts.length > 1
        ? `Split (${parts.map(p => p.kind).join(' + ')})`
        : parts[0].method

      // principalPaid/interestPaid capture what THIS payment actually covered (e.g. interest-only),
      // as distinct from row.principal/row.interest which is what the schedule originally called for —
      // the receipt needs the former to tell a borrower an interest-only payment from a full one.
      let schedule = loan.schedule.map((r, i) =>
        i === idx
          ? {
              ...r, paid: amt, status, paidDate: paymentDate, paymentMethod: paymentSummary, balance: newBalance, memo, bankName, receivedCurrency, exchangeRate,
              principalPaid: principalPaidRounded, interestPaid, lateFeePaid: penaltyPaid, feePaid,
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
      // The payment side (which till or bank account took the money) and the allocation
      // side (what it settled) are posted together — see buildRepaymentPosting.
      const posting = buildRepaymentPosting(state, {
        loan,
        parts,
        allocation: {
          principal: principalPaidRounded,
          interest: interestPaid,
          penalty: penaltyPaid,
          fee: feePaid,
        },
        date: paymentDate,
        memo: `${memo}${exchangeNote}`.trim(),
        installmentNum: row.num,
        kind: 'installment',
        receipt: { bankName, receivedCurrency, exchangeRate, trxId, referenceNo, payerName, outlet, remark, toAccount, txnHash },
      })
      // ACC-REPAYMENT is the legacy operational bucket mirroring what has been collected in
      // total; it is not part of the double entry above and takes the gross payment as before.
      const accounts = state.accounts.map(a => a.code === 'ACC-REPAYMENT' ? { ...a, balance: (a.balance || 0) + amt } : a)
      return {
        ...state,
        activeLoan: { ...state.activeLoan, schedule },
        loanApplications: state.loanApplications.map(a => a.ref === state.activeLoan.ref ? { ...a, schedule } : a),
        repayments: [posting.repayment, ...state.repayments],
        cashSheet: [...posting.cashSheetLines, ...state.cashSheet],
        incomes: [...posting.newIncomes, ...state.incomes],
        accounts,
        chartOfAccounts: applyGlMovements(state.chartOfAccounts, posting.movements),
        journalEntries: [posting.journalEntry, ...state.journalEntries],
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
      const amt = Math.round(Math.min(action.amount != null ? action.amount : outstanding, outstanding) * 100) / 100
      // Where the money came in, same as an installment collection — refused outright if it
      // can't be resolved or a split doesn't add up. See resolvePaymentParts.
      const parts = resolvePaymentParts(state, loan, amt, action)
      if (!parts) return state
      const paymentSummary = parts.length > 1
        ? `Split (${parts.map(p => p.kind).join(' + ')})`
        : parts[0].method
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
              remainderPaymentMethod: paymentSummary,
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

      // A remainder payment is principal and nothing else, so the whole amount comes off
      // Account Receivable and none of it is recognised as income — allocating it to an
      // income account would recognise money the borrower is handing back, not earning us.
      const posting = buildRepaymentPosting(state, {
        loan,
        parts,
        allocation: { principal: amt, interest: 0, penalty: 0, fee: 0 },
        date: paymentDate,
        memo: `${memo}${exchangeNote}`.trim(),
        installmentNum: row.num,
        kind: 'remainder',
        receipt: { bankName, receivedCurrency, exchangeRate, trxId, referenceNo, payerName, outlet, remark, toAccount, txnHash },
      })
      const accounts = state.accounts.map(a => a.code === 'ACC-REPAYMENT' ? { ...a, balance: (a.balance || 0) + amt } : a)
      return {
        ...state,
        activeLoan: { ...state.activeLoan, schedule },
        loanApplications: state.loanApplications.map(a => a.ref === state.activeLoan.ref ? { ...a, schedule } : a),
        repayments: [posting.repayment, ...state.repayments],
        cashSheet: [...posting.cashSheetLines, ...state.cashSheet],
        incomes: [...posting.newIncomes, ...state.incomes],
        accounts,
        chartOfAccounts: applyGlMovements(state.chartOfAccounts, posting.movements),
        journalEntries: [posting.journalEntry, ...state.journalEntries],
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
    case 'SET_ACCOUNTING_CARD': return { ...state, accountingCard: action.card }
    // A blank name falls back to the built-in label rather than leaving a group unnamed.
    case 'SET_BANK_GROUP_LABEL': {
      const label = (action.label || '').trim()
      const next = { ...state.bankGroupLabels }
      if (label) next[action.id] = label
      else delete next[action.id]
      return { ...state, bankGroupLabels: next }
    }

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
    // The other answer to a posting awaiting approval. Deliberately moves no money and touches
    // no account: rejecting is a decision not to pay, so there is nothing to post — the
    // commitment simply never becomes a payment. Only the status and the reason change.
    //
    // Guarded against re-rejecting and against overturning an approval: once funds have been
    // released, marking the posting rejected would leave the money gone with the record saying
    // it never went. Reversing a payment is a fresh entry, not an edit of this one.
    case 'REJECT_EXPENSE': {
      const exp = state.expenses.find(e => e.code === action.code)
      if (!exp || exp.status === 'Approved' || exp.status === 'Rejected') return state
      return {
        ...state,
        expenses: state.expenses.map(e => e.code === action.code
          ? {
              ...e,
              status: 'Rejected',
              // Why is required by the UI that dispatches this — a rejection nobody explained
              // leaves whoever raised the run with nothing to correct.
              rejectionReason: action.reason || '',
              rejectedBy: action.by || state.currentRole,
              rejectedDate: new Date().toISOString().split('T')[0],
            }
          : e),
      }
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

    case 'OPEN_CASH_COUNT_MODAL': return { ...state, cashCountModalOpen: true }
    case 'CLOSE_CASH_COUNT_MODAL': return { ...state, cashCountModalOpen: false }
    // A count is a statement of what was physically in the drawer against what the books say
    // should be. It deliberately posts nothing: a drawer that is short is an incident to
    // investigate, and writing the difference into the ledger would erase the evidence of it.
    // Correcting the cash itself is a cash transfer or an expense, entered on its own.
    case 'ADD_CASH_COUNT': {
      if (!action.count) return state
      return {
        ...state,
        cashCounts: [{ ...action.count, id: nextRecordId(state.cashCounts, 'CC') }, ...state.cashCounts],
        cashCountModalOpen: false,
      }
    }

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
    case 'SET_REPORT_VIEW': return { ...state, reportView: action.view }

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

// The demo book is folded through the reducer above, so it has to be built down here: the
// reducer closes over AP_LOAN_CODE and friends, which are `const`s declared after
// INITIAL_STATE and would still be in their temporal dead zone if this ran up there.
//
// Offered once per install, and only whole: an install that has already been offered it keeps
// exactly what it has, so demo records the operator deleted stay deleted and their own
// customers and loans are never touched. See seedDemoBook for why it is replayed rather than
// written out as static arrays.
const BOOT_STATE = INITIAL_STATE.demoSeeded ? INITIAL_STATE : seedDemoBook(INITIAL_STATE, reducer)

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, BOOT_STATE)

  // Persist key data.
  //
  // Coalesced rather than written on every change: `JSON.stringify` over the whole book — every
  // customer, loan, schedule row and journal line — ran synchronously on the main thread for
  // each keystroke that reached the reducer, and it grows with the install. Waiting for a pause
  // collapses a burst of edits into one write. The delay is short enough that a refresh a
  // moment later still finds the data, and `beforeunload` below covers a tab closed inside the
  // window, so nothing is traded away for the saving.
  useEffect(() => {
    const write = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        customers: state.customers,
        loanApplications: state.loanApplications,
        incomes: state.incomes,
        expenses: state.expenses,
        notifications: state.notifications,
        cashTransfers: state.cashTransfers,
        repayments: state.repayments,
        cashSheet: state.cashSheet,
        cashCounts: state.cashCounts,
        recoveries: state.recoveries,
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
        payrollColumns: state.payrollColumns,
        bankGroupLabels: state.bankGroupLabels,
        accountingColumns: state.accountingColumns,
        reportColumns: state.reportColumns,
        demoSeeded: state.demoSeeded,
        savedFilters: state.savedFilters,
        screenLockMinutes: state.screenLockMinutes,
        // The matrix has to survive a refresh now that a Super Admin governs the Admin through
        // it — before this, every permission edit was lost on reload.
        roleMatrix: state.roleMatrix,
        permissionLabels: state.permissionLabels,
        adminAuditLogs: state.adminAuditLogs,
        adminRequests: state.adminRequests,
        platformName: state.platformName,
        adminAuditSeq: state.adminAuditSeq,
        adminRequestSeq: state.adminRequestSeq,
      }))
    } catch {
      // Reported once, not per write: the write retries on every change, and a toast a
      // keystroke would bury the message the operator has to act on.
      if (!state.storageFailed) dispatch({ type: 'STORAGE_FAILED' })
    }
    }

    const timer = setTimeout(write, 400)
    // A tab closed or reloaded inside the 400ms window would otherwise lose the last edit, so
    // the pending write is forced through first.
    const flush = () => { clearTimeout(timer); write() }
    window.addEventListener('beforeunload', flush)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeunload', flush)
    }
  }, [state.customerVisibleColumns, state.loanVisibleColumns, state.payrollColumns, state.bankGroupLabels, state.accountingColumns, state.reportColumns, state.systemUsers, state.auditLogs, state.integrations, state.payrollRuns, state.customers, state.loanApplications, state.incomes, state.expenses, state.notifications, state.cashTransfers, state.repayments, state.cashSheet, state.cashCounts, state.recoveries, state.accounts, state.feeSettings, state.loanProducts, state.activeStatement, state.chartOfAccounts, state.realBankAccounts, state.journalEntries, state.companyProfile, state.employees, state.businessDay, state.batchRuns, state.customGeo, state.demoSeeded, state.savedFilters, state.screenLockMinutes, state.roleMatrix, state.permissionLabels, state.adminAuditLogs, state.adminRequests])

  // The session follows the reducer rather than the reverse, so a sign-out in one place cannot
  // leave a stale username behind in storage.
  useEffect(() => {
    try {
      const keep = state.rememberSession ? localStorage : sessionStorage
      const drop = state.rememberSession ? sessionStorage : localStorage
      drop.removeItem(SESSION_KEY)
      if (state.currentUser) keep.setItem(SESSION_KEY, state.currentUser)
      else keep.removeItem(SESSION_KEY)
    } catch {}
  }, [state.currentUser, state.rememberSession])

  // ── The record has the last word on this session ─────────────────────────
  // Rule 12, and the honest limit of it. A Super Admin terminating the Admin's sessions, locking
  // or deactivating the account writes that to the account record; this is the browser reading
  // its own record and standing down. It is immediate for a session in this install and can never
  // reach a browser closed on another machine — there is no server here to push to. Session
  // timeout is enforced in the same place because it is the same question: is this session still
  // one the record allows?
  useEffect(() => {
    if (!state.currentUser) return undefined
    const me = state.systemUsers.find(u => u.username === state.currentUser)
    if (!me) return undefined

    // Status only, deliberately not the whole of signInBlock: the sign-in window is a rule about
    // starting a session, and applying it here would sign an operator out mid-sentence the minute
    // the window closed. Lock, Suspend and Deactivate are the controls meant to land at once.
    const blocked = me.status !== 'Active' ? signInBlock(me) : ''
    // A force-logout stamp with no session left open is somebody else having ended it. Deliberately
    // NOT "no session record at all": an install signed in before this feature existed has no
    // session record, and reading that as a termination would sign every one of them out on the
    // first load after upgrading.
    const terminated = !!me.forceLogoutAt && !me.activeSession
    if (blocked || terminated) {
      dispatch({ type: 'SIGN_OUT', by: terminated && !blocked ? 'Super Admin' : 'policy' })
      return undefined
    }

    const minutes = Number(me.security?.sessionTimeoutMinutes) || 0
    // Same reason: a session from before this feature has nothing to measure from.
    if (!minutes || !me.activeSession) return undefined
    // Absolute, not idle: the screen lock already covers idle (see App.jsx). A session timeout is
    // a limit on how long one sign-in may last however busy the operator is.
    const started = new Date(me.activeSession.startedAt).getTime()
    const due = Number.isFinite(started) ? started + minutes * 60000 : NaN
    if (!Number.isFinite(due)) return undefined
    if (due <= Date.now()) {
      dispatch({ type: 'SIGN_OUT', by: 'session timeout' })
      return undefined
    }
    const timer = setTimeout(() => dispatch({ type: 'SIGN_OUT', by: 'session timeout' }), due - Date.now())
    return () => clearTimeout(timer)
  }, [state.currentUser, state.systemUsers, dispatch])

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
  // Nothing is permitted without a session. The app does not render its pages before sign-in
  // (see App.jsx), so this is a floor rather than the gate — but a permission helper that
  // answered "yes" with nobody signed in would be the wrong thing to leave lying around.
  const can = useCallback((permKey) => {
    if (!state.currentUser) return false
    // The role grants and the account's own overrides adjust — which is what makes a Super Admin
    // revoking one permission from one Admin take effect on the next render, without touching
    // every other account that shares the role (rule 13). Read off the record rather than
    // `currentRole`, so a refreshed session is governed by the same rules as a fresh sign-in.
    const user = state.systemUsers.find(u => u.username === state.currentUser)
    return effectivePermission(user, state.roleMatrix, permKey)
  }, [state.roleMatrix, state.systemUsers, state.currentUser])

  // ── Access scope ─────────────────────────────────────────────────────────
  // The loan book as the signed-in account is allowed to see it. Loans carry a branch and a
  // product, which is what makes an access scope a filter rather than a note: the register, the
  // reminders, the dashboard figures and every report read this list, so an Admin scoped to Siem
  // Reap does not see a Phnom Penh loan anywhere — including in a total.
  //
  // An account with no scope set sees everything, which is what every account carries until a
  // Super Admin narrows it (see governance.js on why the default cannot be "nothing").
  const myScope = state.systemUsers.find(u => u.username === state.currentUser)?.scope || null
  const visibleLoans = useMemo(
    () => (state.loanApplications || []).filter(loan => inScope(myScope, loan)),
    [state.loanApplications, myScope],
  )
  // For one record at a time — a loan reached by URL rather than off a list.
  const inMyScope = useCallback(record => inScope(myScope, record), [myScope])

  // Who to record against a posting, an approval or an audit line. The account's own name, so
  // the trail says which person did it rather than which role was selected at the time.
  const currentUserName = useCallback(() => {
    const user = state.systemUsers.find(u => u.username === state.currentUser)
    return user?.fullName || user?.username || 'Unknown user'
  }, [state.systemUsers, state.currentUser])

  return (
    <AppContext.Provider value={{ state, dispatch, showToast, can, currentUserName, visibleLoans, inMyScope }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  return useContext(AppContext)
}










