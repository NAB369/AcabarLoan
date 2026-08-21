// ---------------------------------------------------------------------------
// Seed data
//
// The demo book — customers, loans, their documents, incomes, expenses, journal entries,
// cash transfers, payroll staff and audit entries — was removed so a fresh install starts
// empty and the first record entered is a real one. What remains is configuration the app
// cannot run without: the chart of accounts, the real bank accounts they post through, the
// company profile, one administrator, the role/permission matrix and the integration
// catalogue. Every export AppContext imports still exists; the emptied ones are `[]`.
//
// The statement/payslip readers below are kept for backfillStatementAnalysis, which repairs
// installs still carrying seeded loans in localStorage from before this was stripped. The
// document, income, expense, CBC and schedule builders went with the records they built.
// ---------------------------------------------------------------------------
// The three calendar months a seeded bank statement covers, newest last.
const STATEMENT_MONTHS = ['2026-05', '2026-06', '2026-07']
// Month-to-month swing applied to the seeded credits. Real deposits are never identical
// three months running, and a statement average that matched the declared figure exactly
// would make the verification screen look like it wasn't reading anything.
const STATEMENT_SWING = [-0.06, 0.03, -0.01]

// A seeded bank statement's reading, in the shape utils/parseBankStatement produces for a
// real upload. Seeded scans are placeholder SVGs with no text layer, so nothing can be
// read out of them — the reading is generated from the same income sources the entry
// declares, and marked `source: 'seeded'` so the panel can say where the figures came from.
// `detectedFactor` scales what the statement shows against what was declared, and
// `statementEmployer` overrides the payer behind the salary credits — the two ways a
// verification actually goes wrong, so at least one seeded loan exercises each.
function seededStatementAnalysis({ sources, companyName, employmentStatus, bank, detectedFactor = 1, statementEmployer }) {
  const total = sources.reduce((sum, [, amount]) => sum + Number(amount), 0) * detectedFactor
  // Salaried and part-time parties are paid a fixed amount by an employer; a business
  // owner's takings are all variable, so no salary line is detected.
  const salaried = employmentStatus === 'Employed' || employmentStatus === 'Part-time'
  const salary = salaried ? Number(sources[0][1]) * detectedFactor : 0

  const months = STATEMENT_MONTHS.map((month, i) => {
    const variable = (total - salary) * (1 + STATEMENT_SWING[i])
    return {
      month,
      credits: Math.round((salary + variable) * 100) / 100,
      salary: Math.round(salary * 100) / 100,
      count: salaried ? 4 + i : 18 + i * 2,
    }
  })
  const mean = key => Math.round((months.reduce((s, m) => s + m[key], 0) / months.length) * 100) / 100
  // The money-in rows behind those totals — the salary on the 28th, everything else as one
  // deposit mid-month. The verification reads individual deposits as well as the averages, so a
  // seeded statement has to carry them or it would exercise only half of the check.
  const credits = months.flatMap(m => [
    ...(m.salary ? [{ date: `${m.month}-28`, description: 'SALARY CREDIT', amount: m.salary }] : []),
    ...(m.credits - m.salary > 0
      ? [{ date: `${m.month}-15`, description: 'DEPOSIT', amount: Math.round((m.credits - m.salary) * 100) / 100 }]
      : []),
  ])

  return {
    source: 'seeded',
    bank: bank || 'ABA Bank',
    accountName: '',
    accountNumber: '',
    periodFrom: STATEMENT_MONTHS[0],
    periodTo: STATEMENT_MONTHS[STATEMENT_MONTHS.length - 1],
    months,
    monthsUsed: STATEMENT_MONTHS,
    credits,
    transactionCount: months.reduce((s, m) => s + m.count, 0),
    creditCount: months.reduce((s, m) => s + m.count, 0),
    coverage: 100,
    method: 'balance',
    averageMonthlyCredits: mean('credits'),
    averageMonthlySalary: mean('salary'),
    // The text layer a real statement would carry. Verification looks for the declared
    // company name in here, so a seeded statement names the company it belongs to — except
    // where `statementEmployer` deliberately names someone else, to seed a mismatch.
    text: [
      bank || 'ABA Bank', 'Statement of Account',
      `Period ${STATEMENT_MONTHS[0]} to ${STATEMENT_MONTHS[STATEMENT_MONTHS.length - 1]}`,
      ...months.map(m => `${m.month}-28 ${salaried ? 'SALARY CREDIT' : 'DEPOSIT'} ${statementEmployer || companyName} ${m.credits.toFixed(2)}`),
    ].join(' \n '),
  }
}

// A seeded payslip's reading, in the shape utils/parsePayslip produces for a real upload. Same
// reasoning as the seeded statement: the placeholder scans carry no text layer, so the reading
// is generated from what the entry declares rather than read out of the file.
//
// A payslip states one figure — the salary — so that is all a seeded one evidences. Where an
// entry declares income from several sources, the payslip accounts for the first of them and
// nothing else, which is exactly the finding the payslip check exists to make rather than
// something to paper over by seeding the whole total onto it.
function seededPayslipAnalysis({ sources, companyName, detectedFactor = 1 }) {
  const net = Math.round(Number(sources[0]?.[1]) * detectedFactor * 100) / 100
  if (!(net > 0)) return null
  // Payslips print the figure before deductions as well, and a tenth over the net is the
  // ordinary shape of it once tax and the social-security contribution come off.
  const gross = Math.round(net * 1.1 * 100) / 100
  const period = STATEMENT_MONTHS[STATEMENT_MONTHS.length - 1]
  return {
    source: 'seeded',
    employee: '',
    employer: companyName || '',
    period,
    frequency: 'monthly',
    multiplier: 1,
    net,
    gross,
    text: [
      companyName || 'Employer', 'Payslip', `Pay Period ${period}`,
      `Gross Pay ${gross.toFixed(2)}`, `Net Pay ${net.toFixed(2)}`,
    ].join(' \n '),
  }
}

// The six calendar months a seeded expense statement covers, newest last. Expense verification
// asks for six because one month is a bad month or a quiet one — see utils/statementExpense.
const EXPENSE_STATEMENT_MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07']
// Month-to-month swing on the seeded spending. Household outgoings move about more than a salary
// does — the school-fee month, the festival month, the month nothing broke.
const EXPENSE_STATEMENT_SWING = [0.04, -0.07, 0.11, -0.03, 0.08, -0.02]

// A seeded expense statement's reading, in the shape utils/parseBankStatement produces for a real
// upload. Only the money-out side is filled in: an expense record declares no income, so inventing
// deposits for it would put figures on the page the record never claimed. `detectedFactor` scales
// what the statement shows against the declared budget — above 1 it seeds the finding that matters
// most, a borrower who really spends more than the application says.
function seededExpenseStatementAnalysis({ items, bank, detectedFactor = 1 }) {
  const round = n => Math.round(n * 100) / 100
  // One debit row per declared category per month, so the reader's total is built the same way a
  // real statement's is — out of the individual payments, not a monthly figure handed to it.
  const debits = EXPENSE_STATEMENT_MONTHS.flatMap((month, i) => items
    .filter(([, amount]) => Number(amount) > 0)
    .map(([category, amount], j) => ({
      date: `${month}-${String(4 + ((j * 5) % 22)).padStart(2, '0')}`,
      description: String(category).toUpperCase(),
      amount: round(Number(amount) * detectedFactor * (1 + EXPENSE_STATEMENT_SWING[i])),
    })))
  const months = EXPENSE_STATEMENT_MONTHS.map(month => {
    const rows = debits.filter(d => d.date.startsWith(month))
    return {
      month,
      credits: 0,
      salary: 0,
      debits: round(rows.reduce((s, d) => s + d.amount, 0)),
      count: 0,
      debitCount: rows.length,
    }
  })
  const totalDebits = round(months.reduce((s, m) => s + m.debits, 0))

  return {
    source: 'seeded',
    bank: bank || 'ABA Bank',
    accountName: '',
    accountNumber: '',
    periodFrom: EXPENSE_STATEMENT_MONTHS[0],
    periodTo: EXPENSE_STATEMENT_MONTHS[EXPENSE_STATEMENT_MONTHS.length - 1],
    months,
    monthsUsed: EXPENSE_STATEMENT_MONTHS,
    credits: [],
    debits,
    transactionCount: debits.length,
    creditCount: 0,
    totalCredits: 0,
    totalDebits,
    coverage: 100,
    method: 'balance',
    averageMonthlyCredits: 0,
    averageMonthlySalary: 0,
    text: [
      bank || 'ABA Bank', 'Statement of Account',
      `Period ${EXPENSE_STATEMENT_MONTHS[0]} to ${EXPENSE_STATEMENT_MONTHS[EXPENSE_STATEMENT_MONTHS.length - 1]}`,
      ...months.map(m => `${m.month} TOTAL MONEY OUT ${m.debits.toFixed(2)}`),
    ].join(' \n '),
    reconciliation: { checked: true, ok: true, basis: 'printed debit total', expected: totalDebits, actual: totalDebits, difference: 0 },
  }
}

// Seeded scans are the inline SVG placeholders from scanDataUrl — nothing a user uploaded
// ever looks like this, which is what makes it safe to generate a statement reading for one.
function isSeededScan(doc) {
  return typeof doc?.dataUrl === 'string' && doc.dataUrl.startsWith('data:image/svg+xml')
}

// Backfills the bank statement and payslip readings onto loans saved before the readers existed,
// so an install with data already in localStorage shows the same detection a fresh one does.
// Only seeded placeholder scans are touched: a real upload that could not be read must stay
// unread rather than acquire figures the document never contained.
export function backfillStatementAnalysis(loans) {
  const patchIncome = entry => {
    if (!entry?.sources?.length) return entry
    const documents = entry.documents || []
    const needsReading = type => documents.some(d => d.docType === type && !d.analysis && isSeededScan(d))
    if (!needsReading('Bank Statement') && !needsReading('Payslips')) return entry
    const sources = entry.sources.map(s => [s.label, Number(s.amount) || 0])
    const analysis = seededStatementAnalysis({
      sources,
      companyName: entry.companyName,
      employmentStatus: entry.employmentStatus,
      bank: documents.find(d => d.docType === 'Bank Statement' && d.bank)?.bank,
    })
    const payslip = seededPayslipAnalysis({ sources, companyName: entry.companyName })
    return {
      ...entry,
      documents: documents.map(d => {
        if (d.analysis || !isSeededScan(d)) return d
        if (d.docType === 'Bank Statement') return { ...d, bank: d.bank || analysis.bank, analysis }
        if (d.docType === 'Payslips' && payslip) return { ...d, analysis: payslip }
        return d
      }),
    }
  }

  // Expense verification reads the money out per month, which an install saved before the expense
  // statement reader existed carries nothing for. Receipts and invoices are no longer asked for —
  // any seeded placeholder of those types is dropped here, while a real upload is left alone.
  const patchExpense = entry => {
    if (!entry?.expenses?.length) return entry
    const kept = (entry.documents || []).filter(d => !(isSeededScan(d) && (d.docType === 'Receipt' || d.docType === 'Invoice')))
    const statements = kept.filter(d => d.docType === 'Bank Statement')
    const needsReading = d => d.docType === 'Bank Statement' && isSeededScan(d) && !d.analysis?.debits?.length
    if (kept.length === (entry.documents || []).length && !statements.some(needsReading)) return entry
    const analysis = seededExpenseStatementAnalysis({
      items: entry.expenses.map(e => [e.category, Number(e.amount) || 0]),
      bank: statements.find(d => d.bank)?.bank,
    })
    return {
      ...entry,
      documents: kept.map(d => (needsReading(d) ? { ...d, bank: d.bank || analysis.bank, analysis } : d)),
    }
  }

  return (loans || []).map(loan => {
    const patched = { ...loan }
    for (const target of ['borrower', 'coBorrower', 'guarantor']) {
      const listField = `${target}Incomes`
      const legacyField = `${target}IncomeInfo`
      const expenseField = `${target}ExpenseInfo`
      if (Array.isArray(loan[listField])) patched[listField] = loan[listField].map(patchIncome)
      if (loan[legacyField]) patched[legacyField] = patchIncome(loan[legacyField])
      if (loan[expenseField]) patched[expenseField] = patchExpense(loan[expenseField])
    }
    return patched
  })
}

// Demo customers and loans were removed so a fresh install starts on an empty book.
// The exports stay, because AppContext imports them by name and falls back to them
// whenever nothing is persisted yet.
export const INITIAL_CUSTOMERS = []

export const INITIAL_LOANS = []

export const INITIAL_EXPENSES = []

export const INITIAL_INCOMES = []

// ACC-MAIN is the central reserve — funds not yet allocated to any operational sub-account.
// It's transferred out to top up a sub-account (e.g. Loan Release) when that runs low; it
// never receives income directly itself. The other rows are the operational sub-accounts.
export const INITIAL_ACCOUNTS = [
  { code:'ACC-MAIN',      name:'Main Account',          balance:0 },
  { code:'ACC-LOAN',      name:'Loan Release Account', balance:0 },
  { code:'ACC-REPAYMENT', name:'Repayment Account',    balance:0 },
  { code:'ACC-PAYROLL',   name:'Payroll Account',       balance:0 },
  { code:'ACC-UTILITY',   name:'Utility Account',       balance:0 },
  { code:'ACC-EXPENSE',   name:'Expense Account',       balance:0 },
]

// NBC-style Chart of Accounts, banded:
//
//   1000  Asset      — cash, bank, loan portfolio, receivables
//   2000  Liability  — payables, tax, accumulated depreciation
//   3000  Equity     — capital and retained earnings
//   4000  Loan fees  — what the loan itself earns in fees, kept apart from interest
//   5000  Income     — repayment and interest income
//   6000  Expense    — disbursement, payroll, provision, and running costs
//
// 5010 (Income) and 6010/6020/6030/6040 (Expense) mirror the operational
// ACC-REPAYMENT/ACC-LOAN/ACC-PAYROLL/ACC-UTILITY/ACC-EXPENSE sub-accounts above so loan
// disbursement/repayment postings have somewhere to land in the GL — that mirror is why
// 6030 and 6040 stay even though no code names them: an expense booked to ACC-UTILITY has
// nowhere else to sit. The named utilities below hang off 6030 rather than replacing it.
//
// An account carrying KHR takes its USD sibling's code + 1 (1010/1011, 5020/5021). Keep that
// convention: fundingGLCode and the accrual postings pick the pair by currency.
export const INITIAL_CHART_OF_ACCOUNTS = [
  // The six bands. Every account below hangs off one of them, so the chart reads as a tree
  // rather than a run of codes whose grouping the reader has to infer from the first digit.
  { code:'1000', type:'Asset', name:'Asset', nameKhmer:'', normalBalance:'DEBIT', parentCode:'', description:'Everything the branch owns: cash, bank balances, the loan book and what is owed to it. Rolls up both USD and KHR accounts; each account below states its own currency.', status:'ACTIVE', currency:'USD', balance:0, level:'HEADER' },
  { code:'2000', type:'Liability', name:'Liability', nameKhmer:'', normalBalance:'CREDIT', parentCode:'', description:'Everything the branch owes: payables, tax, and depreciation accumulated against its assets. Rolls up both USD and KHR accounts; each account below states its own currency.', status:'ACTIVE', currency:'USD', balance:0, level:'HEADER' },
  { code:'3000', type:'Equity', name:'Equity', nameKhmer:'', normalBalance:'CREDIT', parentCode:'', description:'Capital put in and profit kept back. Rolls up both USD and KHR accounts; each account below states its own currency.', status:'ACTIVE', currency:'USD', balance:0, level:'HEADER' },
  { code:'4000', type:'Income', name:'Loan Fee', nameKhmer:'', normalBalance:'CREDIT', parentCode:'', description:'What the loan earns in fees, kept apart from interest. Rolls up both USD and KHR accounts; each account below states its own currency.', status:'ACTIVE', currency:'USD', balance:0, level:'HEADER' },
  { code:'5000', type:'Income', name:'Income', nameKhmer:'', normalBalance:'CREDIT', parentCode:'', description:'What the loan book earns: repayment and interest income. Rolls up both USD and KHR accounts; each account below states its own currency.', status:'ACTIVE', currency:'USD', balance:0, level:'HEADER' },
  { code:'6000', type:'Expense', name:'Expense', nameKhmer:'', normalBalance:'DEBIT', parentCode:'', description:'What it costs to run the book and the branch. Rolls up both USD and KHR accounts; each account below states its own currency.', status:'ACTIVE', currency:'USD', balance:0, level:'HEADER' },
  { code:'1010', type:'Asset',     name:'Cash on Hand',                nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000',     description:'USD. Notes and coins held in the branch, in US dollars. Paired with 1011 for Khmer Riel.',            status:'ACTIVE', currency:'USD', balance:0 },
  // The riel side of the cash float. A till holds both currencies physically, and a transfer
  // between them is exactly the exchange the Cash Transfer screen is for — without this there
  // was only a dollar cash account, so riel cash had nowhere to sit.
  { code:'1011', type:'Asset',     name:'Cash on Hand (KHR)',          nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000',     description:'KHR. Notes and coins held in the branch, in Khmer Riel. Paired with 1010 for US dollars.',            status:'ACTIVE', currency:'KHR', balance:0 },
  { code:'1020', type:'Asset',     name:'Bank Account (USD)',          nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000',     description:'USD. Bank balance held in US dollars. Cash out on a USD loan disbursement and cash in on a USD repayment both route here. Paired with 1021 for Khmer Riel.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1021', type:'Asset',     name:'Bank Account (KHR)',          nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000',     description:'KHR. Bank balance held in Khmer Riel. Cash out and cash in on riel-funded transactions route here. Paired with 1020 for US dollars.',                     status:'ACTIVE', currency:'KHR', balance:0 },
  { code:'1100', type:'Asset',     name:'Loans Receivable',            nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000',     description:'USD. Roll-up of all outstanding loan principal across products, in US dollars.',  status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1101', type:'Asset',     name:'Device Installment Loans',    nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000', description:'USD. Outstanding principal on device installment lending, in US dollars. Sub-account of the 1100 roll-up.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1102', type:'Asset',     name:'Auto Loans',                  nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000', description:'USD. Outstanding principal on vehicle lending, in US dollars. Sub-account of the 1100 roll-up.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1103', type:'Asset',     name:'Land Purchase Loans',         nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1000', description:'USD. Outstanding principal on land purchase lending, in US dollars. Sub-account of the 1100 roll-up.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1110', type:'Asset',     name:'Allowance for Loan Losses',   nameKhmer:'', normalBalance:'CREDIT', parentCode:'1000',     description:'USD. Contra-asset offsetting 1100 Loans Receivable for expected credit losses, in US dollars.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1111', type:'Asset',     name:'Stage 1 Allowance',           nameKhmer:'', normalBalance:'CREDIT', parentCode:'1110', description:'USD. Allowance held against performing loans (Stage 1), in US dollars. Sub-account of 1110.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1112', type:'Asset',     name:'Stage 2 Allowance',           nameKhmer:'', normalBalance:'CREDIT', parentCode:'1110', description:'USD. Allowance held against loans whose credit risk has risen significantly (Stage 2), in US dollars. Sub-account of 1110.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1113', type:'Asset',     name:'Stage 3 Allowance',           nameKhmer:'', normalBalance:'CREDIT', parentCode:'1110', description:'USD. Allowance held against credit-impaired loans (Stage 3), in US dollars. Sub-account of 1110.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1120', type:'Asset',     name:'Interest Receivable (Accrued)', nameKhmer:'', normalBalance:'DEBIT', parentCode:'1000',    description:'USD. Interest earned on US dollar loans but not yet collected. Debited by the End of Day accrual, cleared as repayments come in. Paired with 1121 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  // The riel side of the accrued-interest pair, so a KHR loan's daily accrual posts against
  // an account of its own currency instead of landing in the USD one. Nothing in the loan
  // seed is booked in riel, so it starts at zero — same as 1131/6021.
  { code:'1121', type:'Asset',     name:'Interest Receivable (Accrued) (KHR)', nameKhmer:'', normalBalance:'DEBIT', parentCode:'1000', description:'KHR. Interest earned on Khmer Riel loans but not yet collected. Debited by the End of Day accrual. Paired with 1120 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  // The two loan-book control accounts. Account Receivable is principal released and not
  // yet collected back, Account Payable is principal approved and not yet released. The seeds below are the totals of
  // INITIAL_LOANS — 1130 is the sum of every active loan's outstanding balance, 2030 the
  // sum of every loan still sitting in 'Waiting Disburse'.
  { code:'1130', type:'Asset',     name:'Account Receivable — Loan Repayment', nameKhmer:'', normalBalance:'DEBIT', parentCode:'1000', description:'USD. Principal out with borrowers on US dollar loans. Debited when a loan is disbursed, credited by the principal portion each repayment retires. Paired with 1131 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  // The KHR side of the receivable, so the KHR receivable account below has a GL of its own
  // currency to link to. Nothing in the loan seed is booked in riel, so it starts at zero.
  { code:'1131', type:'Asset',     name:'Account Receivable — Loan Repayment (KHR)', nameKhmer:'', normalBalance:'DEBIT', parentCode:'1000', description:'KHR. Principal out with borrowers on Khmer Riel loans. Debited on disbursement, credited by the principal portion each repayment retires. Paired with 1130 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  // The allowance the End of Month batch provisions against, paired with 1130/1131 rather
  // than the 1110 block above. 1110 and its stage children are a static demo figure for the
  // 1100 "Loans Receivable" roll-up (a 4.85M book) — provisioning the handful of loans this
  // app actually tracks against it would post a six-figure release on the first EOM run.
  // These start at zero so the allowance grows with the book the app really carries.
  { code:'1132', type:'Asset',     name:'Allowance for Loan Losses — Loan Repayment', nameKhmer:'', normalBalance:'CREDIT', parentCode:'1000', description:'USD. Contra-asset offsetting 1130, in US dollars. Credited by the End of Month provisioning run as the required allowance rises. Paired with 1133 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'1133', type:'Asset',     name:'Allowance for Loan Losses — Loan Repayment (KHR)', nameKhmer:'', normalBalance:'CREDIT', parentCode:'1000', description:'KHR. Contra-asset offsetting 1131, in Khmer Riel, provisioned at End of Month. Paired with 1132 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  { code:'2010', type:'Liability', name:'Customer Deposits Payable',   nameKhmer:'', normalBalance:'CREDIT', parentCode:'2000',     description:'USD. Customer deposits the branch holds and must repay, in US dollars.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'2020', type:'Liability', name:'Borrowings',                  nameKhmer:'', normalBalance:'CREDIT', parentCode:'2000',     description:'USD. Funds borrowed by the branch and not yet repaid, in US dollars.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'2030', type:'Liability', name:'Account Payable — Loan Disbursement', nameKhmer:'', normalBalance:'CREDIT', parentCode:'2000', description:'USD. Approved loan principal the company still owes borrowers, in US dollars. Credited on final approval, debited when the loan is disbursed.', status:'ACTIVE', currency:'USD', balance:0 },
  // Tax withheld or assessed and not yet paid over. Credit-normal, like the payables above it.
  { code:'2040', type:'Liability', name:'Tax Payable',                 nameKhmer:'', normalBalance:'CREDIT', parentCode:'2000',     description:'USD. Tax assessed or withheld and not yet paid to the authority, in US dollars. Paired with 2041 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'2041', type:'Liability', name:'Tax Payable (KHR)',           nameKhmer:'', normalBalance:'CREDIT', parentCode:'2000',     description:'KHR. Tax assessed or withheld and not yet paid to the authority, in Khmer Riel. Paired with 2040 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  // Depreciation accumulated against fixed assets. A contra-asset by nature, but credit-normal,
  // so it is carried with the other credit-normal accounts rather than netted into 1000.
  { code:'2050', type:'Liability', name:'Accumulated Depreciation',    nameKhmer:'', normalBalance:'CREDIT', parentCode:'2000',     description:'USD. Depreciation accumulated to date against fixed assets, in US dollars.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'3010', type:'Equity',    name:'Share Capital',                nameKhmer:'', normalBalance:'CREDIT', parentCode:'3000',     description:'USD. Capital paid into the branch by its shareholders, in US dollars.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  { code:'3020', type:'Equity',    name:'Retained Earnings',            nameKhmer:'', normalBalance:'CREDIT', parentCode:'3000',     description:'USD. Profit kept in the business rather than distributed, in US dollars.',                                                              status:'ACTIVE', currency:'USD', balance:0 },
  // What the loan earns in fees, banded away from interest so a fee-heavy book is visible at a
  // glance in the P&L. Moved here from 5030/5031 — see renumberFeeIncome in AppContext.jsx.
  { code:'4010', type:'Income',    name:'Loan Fee Income',              nameKhmer:'', normalBalance:'CREDIT', parentCode:'4000',     description:'USD. Fees earned on refinancing and other restructuring of US dollar loans. Paired with 4011 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'4011', type:'Income',    name:'Loan Fee Income (KHR)',        nameKhmer:'', normalBalance:'CREDIT', parentCode:'4000',     description:'KHR. Fees earned on refinancing and other restructuring of Khmer Riel loans. Paired with 4010 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  { code:'5010', type:'Income',    name:'Repayment Account',            nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000',     description:'USD. Interest collected from borrowers on US dollar loans — cash actually received, as opposed to the 5020 accrual of what has been earned. Penalties and fees collected with a repayment are banded separately (5040, 4010) so the three read apart. Paired with 5011 for Khmer Riel.',                       status:'ACTIVE', currency:'USD', balance:0 },
  // The riel side of collected interest. A repayment credits the income account of the loan's
  // own currency, so without this a riel collection would have recognised its interest in a
  // dollar account and overstated it by the exchange rate.
  { code:'5011', type:'Income',    name:'Repayment Account (KHR)',      nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000',     description:'KHR. Interest collected from borrowers on Khmer Riel loans. Paired with 5010 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  // What overdue borrowers pay in penalties, kept apart from the interest they were always
  // going to owe — a book earning heavily from penalties is a different book from one earning
  // from interest, and folding the two together hides that.
  { code:'5040', type:'Income',    name:'Penalty Income',               nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000',     description:'USD. Late-payment penalties collected on US dollar loans. Paired with 5041 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'5041', type:'Income',    name:'Penalty Income (KHR)',         nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000',     description:'KHR. Late-payment penalties collected on Khmer Riel loans. Paired with 5040 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  // Money collected on a loan already written off. It is income rather than a reversal of the
  // write-off: the receivable was removed when the loan left the book, so a later payment has no
  // asset left to credit back. Kept in its own account because recoveries measure how well the
  // institution chases bad debt, and folding them into interest would flatter both figures.
  { code:'5050', type:'Income',    name:'Recovery of Written-Off Loans', nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000',    description:'USD. Collected on US dollar loans already written off. Paired with 5051 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'5051', type:'Income',    name:'Recovery of Written-Off Loans (KHR)', nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000', description:'KHR. Collected on Khmer Riel loans already written off. Paired with 5050 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  // Interest the loan book has earned but not yet been paid. Kept apart from 5010 on
  // purpose: 5010 is cash actually collected, this is the accrual the End of Day batch
  // recognises against it. Merging them would make collected and earned indistinguishable.
  { code:'5020', type:'Income',    name:'Interest Income (Accrued)',    nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000',     description:'USD. Interest earned on outstanding US dollar principal, recognised daily by the End of Day batch. Paired with 5021 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'5021', type:'Income',    name:'Interest Income (Accrued) (KHR)', nameKhmer:'', normalBalance:'CREDIT', parentCode:'5000',  description:'KHR. Interest earned on outstanding Khmer Riel principal, recognised daily by the End of Day batch. Paired with 5020 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
  // Fees charged on restructuring rather than on lending — the refinance fee lands here, kept
  // out of 5010 because that account is borrower repayments and a fee is not one.
  { code:'6010', type:'Expense',   name:'Loan Release Account',         nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6000',     description:'USD. Funds loan principal on disbursement, in US dollars.',                        status:'ACTIVE', currency:'USD', balance:0 },
  { code:'6020', type:'Expense',   name:'Payroll Account',              nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6000',     description:'USD. Funds staff salaries paid in US dollars. Paired with 6021 for Khmer Riel.',                                        status:'ACTIVE', currency:'USD', balance:0 },
  // The KHR side of the payroll account, so the KHR payroll card has a GL of its own
  // currency to link to. Nothing in the seed pays a riel salary, so it starts at zero.
  { code:'6021', type:'Expense',   name:'Payroll Account (KHR)',        nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6000',     description:'KHR. Funds staff salaries paid in Khmer Riel. Paired with 6020 for US dollars.',                    status:'ACTIVE', currency:'KHR', balance:0 },
  { code:'6030', type:'Expense',   name:'Utility Account',              nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6000',     description:'USD. Funds utility bills, in US dollars. Water, electricity and fuel sit under it as sub-accounts.',                                         status:'ACTIVE', currency:'USD', balance:0 },
  { code:'6031', type:'Expense',   name:'Water',                        nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6030', description:'USD. Water supply charges for the branch, in US dollars. Sub-account of 6030.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'6032', type:'Expense',   name:'Electricity',                  nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6030', description:'USD. Electricity charges for the branch, in US dollars. Sub-account of 6030.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'6033', type:'Expense',   name:'Fuel & Gasoline',              nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6030', description:'USD. Fuel for branch vehicles and field visits, in US dollars. Sub-account of 6030.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'6040', type:'Expense',   name:'Expense Account',              nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6000',     description:'USD. Funds general operating expenses, in US dollars.',                           status:'ACTIVE', currency:'USD', balance:0 },
  // The charge side of loan-loss provisioning. The End of Month batch debits this by
  // whatever the required allowance moved, crediting 1132 (USD) / 1133 (KHR).
  { code:'6050', type:'Expense',   name:'Loan Loss Provision Expense',  nameKhmer:'', normalBalance:'DEBIT',  parentCode:'6000',     description:'USD. Charge recognised when the required loan-loss allowance on US dollar loans rises at End of Month. Paired with 6051 for Khmer Riel.', status:'ACTIVE', currency:'USD', balance:0 },
  { code:'6051', type:'Expense',   name:'Loan Loss Provision Expense (KHR)', nameKhmer:'', normalBalance:'DEBIT', parentCode:'6000', description:'KHR. Charge recognised when the required loan-loss allowance on Khmer Riel loans rises at End of Month. Paired with 6050 for US dollars.', status:'ACTIVE', currency:'KHR', balance:0 },
]

// Real-world bank accounts, each linked to a USD and a KHR GL code from the chart above.
// One card per bank *per currency* — a USD account and a KHR account are separate
// real-world accounts with their own account number and GL code, so they are stored
// (and shown) separately rather than crammed into a single dual-currency record.
// `group` decides which collapsible group the card sits under on the Real Bank Accounts
// tab — 'payable', 'receivable', 'general' or 'payroll'. Omitting it falls back to payable.
//
// The General Account cards below deliberately share ABA Bank's own GL codes
// (1020/1021) rather than getting new ones — it's the same physical bank account in
// the real world, just a different lens on it: Payable surfaces only what that
// account disbursed, General surfaces everything else that lands there (expenses,
// transfers, repayment income) — see the group === 'general' filter in
// AccountingPage's selectedBankEntries. The Payroll cards are different: staff salary
// runs post against their own GL (6020 USD / 6021 KHR, the "Payroll Account" rows in
// the chart above), never against 1020/1021 directly, so they need no such exclusion
// filter — buildAccountEntries already scopes to that GL alone.
export const INITIAL_REAL_BANK_ACCOUNTS = [
  { id:'BANK-001-USD', name:'ABA Bank', currency:'USD', number:'000-111-222', glCode:'1020', group:'payable' },
  { id:'BANK-001-KHR', name:'ABA Bank', currency:'KHR', number:'000-111-333', glCode:'1021', group:'payable' },
  { id:'BANK-AR-USD',  name:'Account Receivable', currency:'USD', number:'000-222-444', glCode:'1130', group:'receivable' },
  { id:'BANK-AR-KHR',  name:'Account Receivable', currency:'KHR', number:'000-222-555', glCode:'1131', group:'receivable' },
  { id:'BANK-GEN-USD', name:'General Account', currency:'USD', number:'000-111-222', glCode:'1020', group:'general' },
  { id:'BANK-GEN-KHR', name:'General Account', currency:'KHR', number:'000-111-333', glCode:'1021', group:'general' },
  { id:'BANK-PAYROLL-USD', name:'Payroll Account', currency:'USD', number:'000-333-666', glCode:'6020', group:'payroll' },
  { id:'BANK-PAYROLL-KHR', name:'Payroll Account', currency:'KHR', number:'000-333-777', glCode:'6021', group:'payroll' },
]

// Cash moved between the company's own GL accounts. `fromCode`/`toCode` are chart-of-account
// codes (the transfer form picks from that list), and the names are stored alongside so an
// old transfer still reads correctly if an account is later renamed.
export const INITIAL_CASH_TRANSFERS = []

// Ledger postings made by hand, as opposed to the ones the app writes itself on
// disbursement and repayment (those carry entryType 'Loan Disbursement'/'Loan Repayment').
// Journal entries balance across their lines; a single entry has one line and one side.
// Account codes here all exist in INITIAL_CHART_OF_ACCOUNTS above.
export const INITIAL_JOURNAL_ENTRIES = []

export const INITIAL_COMPANY_PROFILE = {
  name: 'Acabar Plc',
  nameKh: 'អាខាបារ ម.ក',
  licenseNo: 'NBC-MFI-2024-00042',
  address: '#12, St. 271, Tuol Kouk, Phnom Penh, Cambodia',
  phone: '+855 23 456 789',
  email: 'info@acabar.com.kh',
  currency: 'USD / KHR',
  fiscalYearStart: 'January 1',
}

// The demo staff were removed, but the register is deliberately NOT empty: AppContext falls
// back to this seed whenever the saved list has no length, and an install that came up with no
// accounts at all would have no Admin to sign in as and no way to add one. The single
// administrator is the minimum a usable install needs; every other user is created in
// Settings → User Management.
// The install's two governing accounts. The Admin is the one that was always here and keeps doing
// the day-to-day work; the Super Admin sits above it and governs it (see utils/governance.js).
//
// Neither ships with a password — `needsPassword` sends the first sign-in through choosing one.
// That matters most for the Super Admin: a known starting credential on the account that governs
// every other account is the single worst thing this file could contain.
export const INITIAL_SYSTEM_USERS = [
  { username:'superadmin', email:'superadmin@acabar.com.kh', fullName:'Super Administrator', role:'Super Admin', branch:'Phnom Penh HQ', department:'IT', lastLogin:'', status:'Active', statusChanged:'' },
  { username:'admin', email:'admin@acabar.com.kh', fullName:'System Administrator', role:'Admin', branch:'Phnom Penh HQ', department:'IT', lastLogin:'', status:'Active', statusChanged:'' },
]

// Payroll staff register — the Employee Information page. A name is stored split into
// family/given in both scripts (Khmer HR forms are filled that way), and phone/email are
// stored in the same pieces the form collects so a saved record round-trips into it
// unchanged.
export const INITIAL_EMPLOYEES = []

// ─── third-party integrations ────────────────────────────────────────────────
// One record per external system the loan book exchanges data with. `scopes` is what
// that connection is allowed to move, each toggleable on its own, and `logs` is the
// newest-first exchange history the Activity Log tab reads (see ADD_INTEGRATION_LOG,
// which caps it). Credentials are demo values — nothing here reaches a real endpoint.
export const INITIAL_INTEGRATIONS = [
  {
    id: 'webill365',
    name: 'WeBill365',
    // What the provider is, shown beside its name on the Integrations card. Kept separate from
    // `name` so the plain brand name is what appears in toasts and dialog headings, where the
    // full descriptor would read as a mouthful ("WeBill365 (Auto Reconciliation System) is not
    // connected — …").
    subtitle: 'Auto Reconciliation System',
    category: 'Billing & Collection',
    tagline: 'Present installments as payable bills and collect them through the WeBill365 network',
    // The connection's own identifier field — named per provider, since one calls it a
    // merchant and the other a sender.
    accountLabel: 'Merchant ID',
    account: '',
    // WeBill365 accounts are keyed by the phone number registered with the network, not
    // an arbitrary username — the sign-in/register form asks for that instead of the
    // generic "ID" other providers use.
    loginLabel: 'Phone Number',
    loginPlaceholder: 'e.g. 012 345 678',
    loginAutoComplete: 'tel',
    // What one exchanged item is called, for log details and the sync toast — a billing
    // connection moves records, a messaging one sends messages.
    unit: 'record',
    // Every provider ships unconnected: the install registers or signs in on Connect,
    // then saves the credentials the provider issued it. No `login` here means the sign-in
    // gate opens on the register form.
    status: 'disconnected',
    environment: 'sandbox',
    baseUrl: 'https://sandbox.webill365.com/v1',
    apiKey: '',
    autoSync: false,
    syncEvery: 30,
    lastSyncAt: '',
    // Two settlement accounts already through WeBill365's review, so the account card shows
    // what a Trusted one looks like beside the Reviewing status every newly added account
    // carries — and, being two, what switching a loan's KHQR between accounts looks like.
    // One holds dollars and one riel, which is the reason a book running both currencies
    // would keep two: a riel loan's code has to resolve to a riel account.
    // Invented — Trusted is WeBill365's to grant and nothing in this app can award it, so
    // without these the status has no way of appearing at all. Delete the entries to start on
    // an empty list; an install that has added accounts of its own keeps those instead.
    bankAccounts: [
      {
        bankName: 'PPCBank',
        accountNumber: '1-120-00024176-5',
        accountName: 'Krong Kampuchea',
        branchName: 'Sen Sok',
        currency: 'USD',
        memo: 'VIP',
        linkDeposits: true,
        status: 'Trusted',
        // Trusted, so a loan's KHQR can be generated from it out of the box. An account added
        // through the card arrives Reviewing and cannot be offered until it is not.
        useForKhqr: true,
      },
      {
        bankName: 'ABA Bank',
        accountNumber: '1-120-00024176-1',
        accountName: 'Krong Kampuchea',
        branchName: 'Toul Kork',
        currency: 'KHR',
        memo: 'Riel collections',
        linkDeposits: false,
        status: 'Trusted',
        useForKhqr: true,
      },
      // Still with WeBill365, so the table shows a Reviewing row beside the Trusted ones and
      // the rule that a KHQR can only come from a Trusted account is visible without adding
      // an account by hand. Not offered for KHQR, and cannot be until that status changes.
      {
        bankName: 'Wing Bank',
        accountNumber: '1-120-00024176-3',
        accountName: 'Krong Kampuchea',
        branchName: 'Chamkarmon',
        currency: 'USD',
        memo: '',
        linkDeposits: false,
        status: 'Reviewing',
        useForKhqr: false,
      },
    ],
    // The merchant's KHQR, shown on the repayment schedule so a borrower can scan and pay
    // from any Bakong-member app. The code is issued against the WeBill365 merchant account,
    // so it is uploaded from that connection's Connect tab once it is connected, and the
    // switch decides whether the schedule carries it at all. Empty until one is uploaded.
    khqrEnabled: false,
    khqrImage: '',
    // Whether the held code was generated from the connection or uploaded by hand, and the
    // currency a generated one is built for (a static KHQR carries exactly one).
    khqrSource: '',
    khqrCurrency: 'USD',
    scopes: [
      { id: 'push-bills',    direction: 'Outbound', label: 'Publish due installments as bills', desc: 'Every installment falling due is pushed as a payable bill under the borrower’s loan reference', enabled: true },
      { id: 'pull-payments', direction: 'Inbound',  label: 'Import settled payments',           desc: 'Payments collected at WeBill365 agents come back in and post against the matching installment', enabled: true },
      { id: 'push-payers',   direction: 'Outbound', label: 'Register borrowers as payers',      desc: 'New borrowers are registered so they can be found by phone number at any collection point', enabled: true },
      { id: 'reconcile',     direction: 'Inbound',  label: 'Daily settlement reconciliation',   desc: 'End-of-day settlement file is pulled and matched against posted repayments', enabled: false },
    ],
    // Nothing has been exchanged yet — a history would contradict an unconnected provider
    logs: [],
  },
  {
    id: 'weums',
    name: 'WeUMS',
    category: 'Messaging',
    tagline: 'Send borrower SMS — repayment reminders, overdue notices, receipts and OTP',
    accountLabel: 'Sender ID',
    account: '',
    unit: 'message',
    status: 'disconnected',
    environment: 'sandbox',
    baseUrl: 'https://sandbox.weums.com.kh/api/v2',
    apiKey: '',
    autoSync: false,
    // Reminders go out as one daily batch rather than trickling through the day — a
    // borrower should get one message about an installment, at a predictable hour.
    syncEvery: 1440,
    lastSyncAt: '',
    scopes: [
      { id: 'due-reminders',    direction: 'Outbound', label: 'Repayment reminders',      desc: 'Reminder SMS three days before an installment falls due, and again on the due date', enabled: true },
      { id: 'overdue-notices',  direction: 'Outbound', label: 'Overdue notices',          desc: 'Notice sent once an installment passes its due date, repeated with the arrears aging', enabled: true },
      { id: 'payment-receipts', direction: 'Outbound', label: 'Payment receipts',         desc: 'Confirmation SMS with the amount received and the balance left, sent as each repayment posts', enabled: true },
      { id: 'disbursement',     direction: 'Outbound', label: 'Disbursement alerts',      desc: 'Message on release telling the borrower the amount paid out and the account it went to', enabled: true },
      { id: 'otp',              direction: 'Outbound', label: 'Customer OTP',             desc: 'One-time codes for verifying a borrower’s phone number at registration', enabled: false },
      { id: 'delivery-reports', direction: 'Inbound',  label: 'Delivery reports',         desc: 'Delivery status comes back per message, so an unreachable borrower can be followed up by phone', enabled: true },
    ],
    logs: [],
  },
  {
    id: 'weinvoice365',
    name: 'WeInvoice',
    category: 'Invoicing',
    tagline: 'Issue and send invoices for disbursement fees and loan charges, and track what has been settled',
    accountLabel: 'Issuer ID',
    account: '',
    unit: 'invoice',
    status: 'disconnected',
    environment: 'sandbox',
    baseUrl: 'https://sandbox.weinvoice365.com/v1',
    apiKey: '',
    autoSync: false,
    // Fee invoices are raised off disbursements, which happen through the day rather than
    // in a batch — hourly is close enough without polling constantly.
    syncEvery: 60,
    lastSyncAt: '',
    scopes: [
      { id: 'push-invoices',  direction: 'Outbound', label: 'Issue fee invoices',      desc: 'Admin, insurance and lawyer fees charged on a disbursement are issued as invoices under the loan reference', enabled: true },
      { id: 'pull-settled',   direction: 'Inbound',  label: 'Import settled invoices', desc: 'Invoices marked paid come back in and close the matching fee charge', enabled: true },
      { id: 'push-customers', direction: 'Outbound', label: 'Sync billing contacts',   desc: 'Borrower name, phone and address are kept current as the invoice recipient', enabled: false },
    ],
    logs: [],
  },
]

export const INITIAL_AUDIT_LOGS = []

export const INITIAL_PERMISSION_LABELS = {
  add_customer:      'Create Customer',
  open_loan:         'Open Loan & Submit',
  review_loan:       'Review, Confirm & Approve/Reject Loan',
  disburse_loan:     'Disburse Loan',
  manage_accounting: 'Manage Income & Expense',
  write_off:         'Write Off Loan',
  request_restructure: 'Request Loan Restructure',
  run_operations:    'Run EOD/EOM Operations',
  view_accounting:   'View Accounting Module',
  // Added with the Super Admin level. Everything the modules could already DO was gated; what
  // could be SEEN and EXPORTED was not, so "control the Admin's access scope" had nothing to
  // switch off. These are the keys the Admin Control permission grid drives — see
  // utils/governance.js, which maps each one to its cell in the module x action table.
  view_customers:    'View Customer Module',
  edit_customer:     'Edit Customer',
  delete_customer:   'Delete Customer',
  export_customers:  'Export Customer Data',
  view_loans:        'View Loan Module',
  export_loans:      'Export Loan Data',
  view_reports:      'View Report Module',
  export_reports:    'Export Reports',
  view_users:        'View User Accounts',
  create_user:       'Create User Account',
  edit_user:         'Edit User Account',
  activate_user:     'Activate / Deactivate User',
  view_settings:     'Open System Settings',
  manage_settings:   'Change System Settings',
  // The level itself, not a module capability: it is what the Admin Control console requires.
  // Only a Super Admin holds it, and only a Super Admin can hand it out — see the reducer guards.
  govern_admins:     'Govern Admin Accounts (Super Admin)',
}

// Every role's column. The seeded defaults for the keys added with the Super Admin level are
// deliberately generous on the view/export side — an install that has been running without them
// must not lose sight of a module the day this ships — and closed on the ones that change who can
// do what. `mergeSeededPermissions` in AppContext applies these defaults to a saved matrix.
export const INITIAL_ROLE_MATRIX = {
  // request_restructure rewrites a live loan's contract terms, so it sits with the other
  // decisions on an existing loan (review, write-off) rather than with origination: the
  // manager who owns the credit decision, and Admin. Toggle it per role in
  // Settings > Roles & Permissions — this matrix is the seed, not a lock.
  // The level above Admin. Holds everything, including govern_admins, which no other role may be
  // given: the guards in the reducer refuse it from anyone who is not already a Super Admin.
  'Super Admin':    { add_customer:true,  open_loan:true,  review_loan:true,  disburse_loan:true,  manage_accounting:true,  write_off:true,  request_restructure:true,  run_operations:true,  view_accounting:true,
                      view_customers:true, edit_customer:true,  delete_customer:true,  export_customers:true,  view_loans:true, export_loans:true, view_reports:true, export_reports:true,
                      view_users:true,     create_user:true,    edit_user:true,        activate_user:true,     view_settings:true,  manage_settings:true,  govern_admins:true },
  'Admin':          { add_customer:true,  open_loan:true,  review_loan:true,  disburse_loan:true,  manage_accounting:true,  write_off:true,  request_restructure:true,  run_operations:true,  view_accounting:true,
                      view_customers:true, edit_customer:true,  delete_customer:true,  export_customers:true,  view_loans:true, export_loans:true, view_reports:true, export_reports:true,
                      view_users:true,     create_user:true,    edit_user:true,        activate_user:true,     view_settings:true,  manage_settings:true,  govern_admins:false },
  'Credit Officer': { add_customer:true,  open_loan:true,  review_loan:false, disburse_loan:false, manage_accounting:false, write_off:false, request_restructure:false, run_operations:false, view_accounting:false,
                      view_customers:true, edit_customer:true,  delete_customer:false, export_customers:true,  view_loans:true, export_loans:true, view_reports:true, export_reports:true,
                      view_users:false,    create_user:false,   edit_user:false,       activate_user:false,    view_settings:false, manage_settings:false, govern_admins:false },
  'Credit Manager': { add_customer:false, open_loan:false, review_loan:true,  disburse_loan:false, manage_accounting:false, write_off:true,  request_restructure:true,  run_operations:true,  view_accounting:true,
                      view_customers:true, edit_customer:false, delete_customer:false, export_customers:true,  view_loans:true, export_loans:true, view_reports:true, export_reports:true,
                      view_users:false,    create_user:false,   edit_user:false,       activate_user:false,    view_settings:false, manage_settings:false, govern_admins:false },
  'Accountant':     { add_customer:false, open_loan:false, review_loan:false, disburse_loan:true,  manage_accounting:true,  write_off:false, request_restructure:false, run_operations:true,  view_accounting:true,
                      view_customers:true, edit_customer:false, delete_customer:false, export_customers:false, view_loans:true, export_loans:true, view_reports:true, export_reports:true,
                      view_users:false,    create_user:false,   edit_user:false,       activate_user:false,    view_settings:false, manage_settings:false, govern_admins:false },
}
