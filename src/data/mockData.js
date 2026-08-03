import { buildAmortizationData } from '../utils/format'

// ---------------------------------------------------------------------------
// Seed helpers
//
// The seed data has to look like data the app itself produced, otherwise views
// that read a field the seed never set render an empty state — that is what makes
// sections look "missing" on a fresh browser (e.g. a Vercel visit) while a browser
// with a saved localStorage install still shows whatever was typed in by hand.
// ---------------------------------------------------------------------------

// Uploads are stored as data URLs, so seeded documents carry a small inline SVG
// standing in for a scan. That keeps the document tables, the preview lightbox and
// the download links behaving exactly as they do for a real upload, without
// shipping binary fixtures.
function scanDataUrl(label) {
  const safe = String(label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Kept deliberately small — every seeded document carries a copy of this string into
  // localStorage, so extra decoration is paid for a few hundred times over.
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="820" fill="none">',
    '<rect width="600" height="820" fill="white" stroke="silver" stroke-width="6"/>',
    '<rect width="600" height="14" fill="navy"/>',
    '<g font-family="Arial" fill="gray">',
    '<text x="48" y="92" font-size="16" fill="navy" font-weight="bold">ACABAR PLC</text>',
    `<text x="48" y="152" font-size="25" fill="black" font-weight="bold">${safe}</text>`,
    '<g fill="gainsboro"><rect x="48" y="200" width="504" height="11"/><rect x="48" y="240" width="470" height="11"/><rect x="48" y="280" width="504" height="11"/><rect x="48" y="320" width="330" height="11"/></g>',
    '<rect x="48" y="380" width="250" height="180" fill="whitesmoke"/>',
    '<text x="112" y="478" font-size="14">SCANNED IMAGE</text>',
    '<rect x="374" y="620" width="178" height="86" fill="none" stroke="navy" stroke-width="3"/>',
    '<text x="398" y="672" font-size="16" fill="navy" font-weight="bold">VERIFIED COPY</text>',
    '<text x="48" y="762" font-size="13">Sample document — demonstration data only.</text>',
    '</g></svg>',
  ].join('')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// One uploaded file. The placeholder scan is keyed on the document type, so files of
// the same type share a single data URL instead of one copy per document.
function doc(name, docType, extra = {}) {
  return {
    name,
    docType,
    size: `${120 + ((name.length * 37) % 760)} KB`,
    mimeType: 'image/svg+xml',
    dataUrl: scanDataUrl(docType),
    ...extra,
  }
}

// The document tables list every applicable document type and show "No file uploaded"
// for the ones with nothing against them, so each seeded party carries a file for the
// full set its table renders.
function identityDocs(slug, { married = false, familyMemberCount = 4, withOther = false } = {}) {
  return [
    doc(`national-id-${slug}.svg`, 'National ID'),
    doc(`passport-${slug}.svg`, 'Passport'),
    doc(`family-book-${slug}.svg`, 'Family Book', { familyMemberCount }),
    doc(`residency-letter-${slug}.svg`, 'Residency Confirmation Letter'),
    doc(`birth-certificate-${slug}.svg`, 'Birth Certificate'),
    ...(married ? [doc(`marriage-certificate-${slug}.svg`, 'Marriage Certificate')] : []),
    ...(withOther ? [doc(`supporting-letter-${slug}.svg`, 'Other')] : []),
  ]
}

// Income proof types depend on employment status — see getIncomeProofDocTypes in
// LoanDetail: employed/part-time parties are asked for payslips and a bank statement,
// everyone else for the business set.
// Each document is verified against something specific — see DOC_CHECKS in
// IncomeVerification: the company documents against the company name, the business licence
// against the borrower's, the certificate of employment against both. A real upload is named
// however the bank or employer named it; a seeded one is named after what it has to be checked
// by, so the seeded loans demonstrate the checks passing. Payslips and bank statements are the
// exception — those are checked on their contents, so a seeded one carries a reading instead.
// 'Payslips' is plural to match the expected-type lists in utils/income — a file whose type
// is not one of those never appears in the document table.
function businessIncomeDocs(person, company) {
  return [
    doc(`transaction-record-${person}.svg`, 'Transaction Record'),
    doc(`payslips-${company}.svg`, 'Payslips'),
    doc(`bank-statement-${person}.svg`, 'Bank Statement'),
    doc(`employment-certificate-${company}-${person}.svg`, 'Certificate of Employment'),
    doc(`business-license-${person}.svg`, 'Business License'),
  ]
}

function employedIncomeDocs(person, company) {
  return [
    doc(`payslips-${company}.svg`, 'Payslips'),
    doc(`bank-statement-${person}.svg`, 'Bank Statement'),
  ]
}

function employedCompanyDocs(company, person) {
  return [
    doc(`employment-certificate-${company}-${person}.svg`, 'Certificate of Employment'),
    doc(`company-profile-${company}.svg`, 'Company Profile'),
    doc(`company-image-${company}.svg`, 'Company Image'),
  ]
}

// A bank statement is the only document an expense record asks for — see utils/expense.
function expenseDocs(slug) {
  return [doc(`expense-bank-statement-${slug}.svg`, 'Bank Statement')]
}

function landCollateralDocs(slug) {
  return [
    doc(`hard-title-${slug}.svg`, 'Hard Title Certificate'),
    doc(`land-title-copy-${slug}.svg`, 'Land Title Copy'),
    doc(`cadastral-map-${slug}.svg`, 'Cadastral Map'),
    doc(`land-valuation-${slug}.svg`, 'Land Valuation Report'),
    doc(`property-photos-${slug}.svg`, 'Property Photos'),
    doc(`sale-purchase-agreement-${slug}.svg`, 'Sale & Purchase Agreement'),
    doc(`property-tax-receipt-${slug}.svg`, 'Property Tax Receipt'),
    doc(`land-measurement-${slug}.svg`, 'Land Measurement Report'),
  ]
}

function vehicleCollateralDocs(slug) {
  return [
    doc(`vehicle-registration-${slug}.svg`, 'Vehicle Registration Card'),
    doc(`vehicle-ownership-${slug}.svg`, 'Vehicle Ownership Certificate'),
    doc(`vehicle-valuation-${slug}.svg`, 'Vehicle Valuation Report'),
    doc(`vehicle-insurance-${slug}.svg`, 'Vehicle Insurance Certificate'),
    doc(`vehicle-inspection-${slug}.svg`, 'Vehicle Inspection Certificate'),
    doc(`purchase-invoice-${slug}.svg`, 'Purchase Invoice / Sale Agreement'),
    doc(`road-tax-receipt-${slug}.svg`, 'Road Tax Receipt'),
    doc(`vehicle-photos-${slug}.svg`, 'Vehicle Photos'),
  ]
}

function houseCollateralDocs(slug) {
  return [
    doc(`house-ownership-${slug}.svg`, 'House Ownership Certificate'),
    doc(`land-title-${slug}.svg`, 'Land Title / Ownership Certificate'),
    doc(`construction-permit-${slug}.svg`, 'Construction Permit'),
    doc(`house-valuation-${slug}.svg`, 'House Valuation Report'),
    doc(`property-photos-${slug}.svg`, 'Property Photos'),
    doc(`property-tax-receipt-${slug}.svg`, 'Property Tax Receipt'),
    doc(`sale-purchase-agreement-${slug}.svg`, 'Sale & Purchase Agreement'),
    doc(`insurance-certificate-${slug}.svg`, 'Insurance Certificate'),
    doc(`floor-plan-${slug}.svg`, 'Floor Plan / Building Layout'),
  ]
}

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

// Income / expense totals are summed from the entered rows by the app, so they are
// summed here too rather than hardcoded alongside rows they could drift from.
// `sources` and `items` are [label, amount] / [category, amount, notes] tuples.
function income({ occupation, employmentStatus = '', companyName = '', companyAddress = '', sources, documents = [], companyDocuments = [], bank = 'ABA Bank', detectedFactor, statementEmployer }) {
  const analysis = seededStatementAnalysis({ sources, companyName, employmentStatus, bank, detectedFactor, statementEmployer })
  const payslip = seededPayslipAnalysis({ sources, companyName, detectedFactor })
  return {
    occupation,
    employmentStatus,
    companyName,
    companyAddress,
    sources: sources.map(([label, amount]) => ({ label, amount: String(amount) })),
    totalMonthlyIncome: sources.reduce((sum, [, amount]) => sum + Number(amount), 0),
    // Each reading rides on the document it was read from, exactly as it does after a real
    // upload — the statement's on the statement, the payslip's on the payslip.
    documents: documents.map(d => {
      if (d.docType === 'Bank Statement') return { ...d, bank, analysis }
      if (d.docType === 'Payslips' && payslip) return { ...d, analysis: payslip }
      return d
    }),
    companyDocuments,
  }
}

function expense(items, documents = [], { bank = 'ABA Bank', detectedFactor } = {}) {
  const analysis = seededExpenseStatementAnalysis({ items, bank, detectedFactor })
  return {
    expenses: items.map(([category, amount, notes = '']) => ({ category, notes, amount: String(amount) })),
    totalMonthlyExpense: items.reduce((sum, [, amount]) => sum + Number(amount), 0),
    // The statement reading rides on the document it was read from, exactly as it does after a
    // real upload.
    documents: documents.map(d => d.docType === 'Bank Statement' ? { ...d, bank, analysis } : d),
  }
}

// CBCReport draws its headline cards from activeAccounts / totalOutstanding /
// badAccounts / reportInquiries — the figures a parsed CBC report fills in — and holds
// every card at "—" until a report file is attached. Deriving them from the account
// rows keeps the cards, the account table and the risk assessment in agreement.
function cbc(personName, info) {
  const accounts = info.accounts || []
  const inquiries = info.inquiries || []
  return {
    ...info,
    activeAccounts: accounts.filter(a => a.status !== 'Closed').length,
    totalOutstanding: accounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0),
    totalOutstandingCurrency: 'USD',
    badAccounts: accounts.filter(a => a.status === 'Delinquent' || a.status === 'Write-off').length,
    reportInquiries: inquiries.length,
    documents: [doc(`cbc-report-${personName.toLowerCase().replace(/\s+/g, '-')}.svg`, 'CBC Report')],
  }
}

// The loan wizard stores a repayment schedule the moment an application is submitted,
// so every seeded loan carries one — the Repayment Schedule / Tracking / Reminder views
// and the arrears report all read off it. `paid` settles the earliest installments the
// same way RECORD_REPAYMENT does, `partial` leaves a principal remainder on one
// installment and rolls the shortfall onto the next (as the reducer does), and
// `lateFee` stamps a penalty on an installment that is already past due.
function seedSchedule(loan, { paid = 0, partial = null, lateFee = null } = {}) {
  const { emi, rows } = buildAmortizationData(loan.amount, loan.interestRate, loan.installments, loan.firstInstallment)
  const schedule = rows.map(r => ({ ...r }))
  const round = n => Math.round(n * 100) / 100

  // Collected a couple of days ahead of the due date, deterministically.
  const paidOn = (dueDateISO, daysEarly) => {
    const [y, m, d] = dueDateISO.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d - daysEarly)).toISOString().split('T')[0]
  }

  const settle = (idx, { principalPaid, interestPaid, status, method, bankName = '', memo = '' }) => {
    const row = schedule[idx]
    const balanceBefore = idx === 0 ? loan.amount : schedule[idx - 1].balance
    row.status = status
    row.paid = round(principalPaid + interestPaid)
    row.paidDate = paidOn(row.dueDateISO, (idx % 3) + 1)
    row.paymentMethod = method
    row.bankName = bankName
    row.receivedCurrency = null
    row.exchangeRate = null
    row.memo = memo
    row.principalPaid = round(principalPaid)
    row.interestPaid = round(interestPaid)
    row.lateFeePaid = 0
    row.balance = round(balanceBefore - principalPaid)
  }

  for (let i = 0; i < Math.min(paid, schedule.length); i++) {
    const row = schedule[i]
    const byTransfer = i % 2 === 1
    settle(i, {
      principalPaid: row.principal,
      interestPaid: row.interest,
      status: 'Paid',
      method: byTransfer ? 'Transfer' : 'Cash',
      bankName: byTransfer ? 'ABA Bank' : '',
      memo: byTransfer
        ? `Installment #${row.num} settled by bank transfer`
        : `Installment #${row.num} collected in cash at ${loan.branch}`,
    })
  }

  if (partial && schedule[partial.index]) {
    const row = schedule[partial.index]
    const scheduledPrincipal = row.principal
    settle(partial.index, {
      principalPaid: partial.principalPaid,
      interestPaid: row.interest,
      status: 'Partial',
      method: partial.method || 'Cash',
      memo: partial.memo || '',
    })
    const shortfall = round(scheduledPrincipal - partial.principalPaid)
    const next = schedule[partial.index + 1]
    if (next && shortfall > 0) {
      next.principal = round(next.principal + shortfall)
      next.totalDue = round(next.totalDue + shortfall)
      // Carried balance picks up a penalty at the contract rate (condition 2),
      // mirroring RECORD_REPAYMENT.
      const penaltyRate = loan.penaltyRate || 0
      if (penaltyRate > 0) {
        next.lateFee = round(shortfall * (penaltyRate / 100))
        next.lateFeeNote = `Penalty (${penaltyRate}%) on balance carried from installment #${row.num} interest-only payment`
      }
    }
  }

  if (lateFee && schedule[lateFee.index]) {
    const row = schedule[lateFee.index]
    row.lateFee = round((row.totalDue || 0) * ((loan.penaltyRate || 0) / 100))
    row.lateFeeNote = lateFee.note || ''
  }

  return { emi, schedule }
}

export const INITIAL_CUSTOMERS = [
  {
    code: '000001', khName: 'ចាន់ សុភ័គ', enName: 'CHAN SOPHEAK',
    gender: 'Male', maritalStatus: 'Married', dob: '1988-05-12',
    idType: 'National ID', idNo: '018805121234', phone: '012 456 789',
    email: 'chan.sopheak@gmail.com',
    currentAddress: { province:'Phnom Penh', district:'Doun Penh', commune:'Wat Phnom', village:'Phsar Thmei', house:'24', street:'92' },
    permanentAddress: { province:'Kandal', district:'Ta Khmau', commune:'Ta Khmau', village:'Preaek Ho', house:'08', street:'01' },
    occupation:'Business Owner', employmentStatus:'Self-Employed', monthlyIncome:'3500', otherIncome:'800',
    documents: identityDocs('chan-sopheak', { married: true, familyMemberCount: 4, withOther: true }),
    accountNumber:'ACB-0011002233', createdAt:'2026-01-08T09:15:00.000Z'
  },
  {
    code: '000002', khName: 'កែវ សុភា', enName: 'KEO SOPHEA',
    gender: 'Female', maritalStatus: 'Married', dob: '1992-07-18',
    idType: 'National ID', idNo: '019207182345', phone: '015 678 901',
    email: 'keo.sophea@gmail.com',
    currentAddress: { province:'Siem Reap', district:'Siem Reap', commune:'Svay Dangkum', village:'Sala Kamreuk', house:'12', street:'07' },
    permanentAddress: { province:'Siem Reap', district:'Angkor Chum', commune:'Kouk Doung', village:'Thlok', house:'03', street:'' },
    occupation:'Shop Owner', employmentStatus:'Self-Employed', monthlyIncome:'2200', otherIncome:'400',
    documents: identityDocs('keo-sophea', { married: true, familyMemberCount: 5, withOther: true }),
    accountNumber:'ACB-0022113344', createdAt:'2026-01-22T10:30:00.000Z'
  },
  {
    code: '000003', khName: 'សេង ហុង', enName: 'SENG HONG',
    gender: 'Male', maritalStatus: 'Single', dob: '1995-03-25',
    idType: 'National ID', idNo: '019503251567', phone: '098 234 567',
    email: 'seng.hong@yahoo.com',
    currentAddress: { province:'Battambang', district:'Battambang', commune:'Svay Por', village:'Sdao', house:'45', street:'03' },
    permanentAddress: { province:'Battambang', district:'Battambang', commune:'Svay Por', village:'Sdao', house:'45', street:'03' },
    occupation:'Farmer', employmentStatus:'Self-Employed', monthlyIncome:'1200', otherIncome:'300',
    documents: identityDocs('seng-hong', { familyMemberCount: 6, withOther: true }),
    accountNumber:'ACB-0033224455', createdAt:'2026-02-14T08:45:00.000Z'
  },
  {
    code: '000004', khName: 'មុន្នី រតនា', enName: 'MUNNY ROTHANA',
    gender: 'Female', maritalStatus: 'Married', dob: '1989-12-05',
    idType: 'Passport', idNo: 'A2345678', phone: '012 987 654',
    email: 'munny.rothana@gmail.com',
    currentAddress: { province:'Phnom Penh', district:'Tuol Kouk', commune:'Tuek L\'ak 1', village:'Boeng Kak', house:'78', street:'271' },
    permanentAddress: { province:'Kampong Cham', district:'Kampong Cham', commune:'Kampong Cham', village:'Prey Chhor', house:'12', street:'' },
    occupation:'Accountant', employmentStatus:'Employed', monthlyIncome:'2800', otherIncome:'',
    documents: identityDocs('munny-rothana', { married: true, familyMemberCount: 3, withOther: true }),
    accountNumber:'ACB-0044335566', createdAt:'2026-03-02T11:00:00.000Z'
  },
  {
    code: '000005', khName: 'លីម គីមហ័រ', enName: 'LIM KIMHOUR',
    gender: 'Male', maritalStatus: 'Married', dob: '1983-08-14',
    idType: 'National ID', idNo: '018308141890', phone: '016 345 678',
    email: 'lim.kimhour@business.com',
    currentAddress: { province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Boeung Keng Kang', house:'22A', street:'310' },
    permanentAddress: { province:'Takéo', district:'Tram Kak', commune:'Rou Ssei', village:'Roup Sour', house:'06', street:'' },
    occupation:'Restaurant Owner', employmentStatus:'Self-Employed', monthlyIncome:'6000', otherIncome:'1500',
    documents: identityDocs('lim-kimhour', { married: true, familyMemberCount: 5, withOther: true }),
    accountNumber:'ACB-0055446677', createdAt:'2026-04-18T13:20:00.000Z'
  },
  {
    code: '000006', khName: 'ចាន់ ធារី', enName: 'CHAN THEARY',
    gender: 'Female', maritalStatus: 'Single', dob: '1998-02-28',
    idType: 'National ID', idNo: '019802285678', phone: '089 112 334',
    email: 'chan.theary@student.edu.kh',
    currentAddress: { province:'Phnom Penh', district:'Mean Chey', commune:'Chak Angrae Leu', village:'Phum 7', house:'33', street:'369' },
    permanentAddress: { province:'Kampot', district:'Kampot', commune:'Andoung Khmer', village:'Chrey', house:'08', street:'' },
    occupation:'Small Business Trader', employmentStatus:'Self-Employed', monthlyIncome:'900', otherIncome:'',
    documents: identityDocs('chan-theary', { familyMemberCount: 4, withOther: true }),
    accountNumber:'', createdAt:'2026-06-05T14:10:00.000Z'
  },
  {
    code: '000007', khName: 'ហេង សុភ័គ', enName: 'HENG SOPHEAK',
    gender: 'Male', maritalStatus: 'Married', dob: '1980-10-10',
    idType: 'National ID', idNo: '018010101234', phone: '011 567 890',
    email: 'heng.sopheak@gmail.com',
    currentAddress: { province:'Kampong Speu', district:'Chbar Mon', commune:'Chbar Mon', village:'Khum Leu', house:'14', street:'02' },
    permanentAddress: { province:'Kampong Speu', district:'Chbar Mon', commune:'Chbar Mon', village:'Khum Leu', house:'14', street:'02' },
    occupation:'Carpenter', employmentStatus:'Self-Employed', monthlyIncome:'1800', otherIncome:'200',
    documents: identityDocs('heng-sopheak', { married: true, familyMemberCount: 5, withOther: true }),
    // No status field here — it's derived (getCustomerStatus): this customer reads as
    // 'Active' because AC-L-001006 already reached 'Waiting Disburse'.
    accountNumber:'ACB-0077889900', createdAt:'2026-07-01T09:50:00.000Z'
  },
  {
    code: '000008', khName: 'ខាលេន ឌូឡា', enName: 'CALEN DULA',
    gender: 'Male', maritalStatus: 'Single', dob: '1994-06-15',
    idType: 'National ID', idNo: '019406151122', phone: '017 223 344',
    email: 'calen.dula@gmail.com',
    currentAddress: { province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Boeung Keng Kang', house:'15', street:'302' },
    permanentAddress: { province:'Kandal', district:'Ta Khmau', commune:'Ta Khmau', village:'Preaek Ho', house:'19', street:'' },
    occupation:'Software Developer', employmentStatus:'Employed', monthlyIncome:'2500', otherIncome:'',
    documents: identityDocs('calen-dula', { familyMemberCount: 3, withOther: true }),
    accountNumber:'ACB-0088990011', createdAt:'2026-08-03T09:00:00.000Z'
  },
]

// `repayments` is stripped off below and fed to seedSchedule — it is not part of the
// stored loan. Everything else is the loan record itself.
const LOAN_SEEDS = [
  {
    ref:'AC-L-001001', customerCode:'000001', customerName:'CHAN SOPHEAK', customerKhName:'ចាន់ សុភ័គ',
    customerGender:'Male', customerPhone:'012 456 789', customerEmail:'chan.sopheak@gmail.com',
    product:'Business Loan', currency:'USD', amount:15000, disbursementDate:'2026-08-03',
    repaymentType:'Monthly', firstInstallment:'2026-09-03', installments:24, interestRate:18, penaltyRate:5,
    creditOfficer:'Vuthy Sok', loanCycle:'2', branch:'Phnom Penh HQ', termSelected:true,
    collateral:{
      type:'Land', value:'32000', appraisedValue:'30500', forcedSaleValue:'24400',
      docNo:'LT-2024-00178', registrationStatus:'Registered',
      description:'Land plot 400 sqm at Preaek Ho, Ta Khmau, Kandal',
      landInfo:{
        titleType:'Hard Title', titleNumber:'LT-2024-00178', plotNumber:'12-04-0178', area:'400',
        landUse:'Residential', ownerName:'CHAN SOPHEAK',
        location:{ province:'Kandal', district:'Ta Khmau', commune:'Preaek Ho', village:'Preaek Ho Muoy' },
        issueDate:'2024-03-18', encumbranceStatus:'Clear / Unencumbered',
      },
      documents: landCollateralDocs('preaek-ho-400sqm'),
    },
    coBorrower:{
      khName:'ចាន់ ច័ន្ទនី', enName:'CHAN CHANTNY', dob:'1991-09-20', gender:'Female',
      idType:'National ID', idNo:'019109208765', relation:'Spouse', phone:'011 334 556',
      email:'chan.chantny@gmail.com', maritalStatus:'Married', customerCode:null,
      currentAddress:{ province:'Phnom Penh', district:'Doun Penh', commune:'Wat Phnom', village:'Phsar Thmei', house:'24', street:'92' },
      permanentAddress:{ province:'Kandal', district:'Ta Khmau', commune:'Preaek Ho', village:'Preaek Ho Muoy', house:'08', street:'01' },
      occupation:'Teacher', employmentStatus:'Employed', monthlyIncome:'900', otherIncome:'',
      documents: identityDocs('chan-chantny', { married: true, familyMemberCount: 4 }),
    },
    guarantor:null,
    creditHistoryInfo: cbc('CHAN SOPHEAK', {
      kScore:685, activeTradelines:2, paymentRecord:'Good (rare late payments)', delinquencies:0, publicRecords:'None', enquiries6Months:2,
      accountStatus:'Normal', paymentHistory24:'000003000000000000000000',
      idExpiryDate:'2030-03-14', placeOfBirth:'Phnom Penh', nationality:'Cambodian', reportDate:'2026-07-06',
      accounts:[
        { institution:'ABA Bank', loanType:'Personal Loan', role:'Borrower', status:'Normal', creditLimit:5000, loanDuration:24, currentBalance:3200,
          cycles:['ontime','ontime','ontime','ontime','ontime','30','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime'] },
        { institution:'Wing Bank', loanType:'Motor Loan', role:'Borrower', status:'Closed', creditLimit:8000, loanDuration:36, currentBalance:0,
          cycles:Array(24).fill('ontime') },
      ],
      inquiries:[
        { institution:'Acabar Plc', loanType:'Business Loan', role:'Borrower', date:'2026-07-06', amount:15000 },
        { institution:'ABA Bank', loanType:'Personal Loan', role:'Borrower', date:'2025-02-02', amount:5000 },
      ],
    }),
    coBorrowerCreditHistoryInfo: cbc('CHAN CHANTNY', {
      kScore:702, activeTradelines:1, paymentRecord:'Excellent (no missed payments)', delinquencies:0, publicRecords:'None', enquiries6Months:1,
      accountStatus:'Normal', paymentHistory24:'000000000000000000000000',
      idExpiryDate:'2029-11-05', placeOfBirth:'Kandal', nationality:'Cambodian', reportDate:'2026-07-06',
      accounts:[
        { institution:'Prince Bank', loanType:'Staff Salary Loan', role:'Co-Borrower', status:'Normal', creditLimit:2000, loanDuration:12, currentBalance:800,
          cycles:Array(24).fill('ontime') },
      ],
      inquiries:[
        { institution:'Prince Bank', loanType:'Staff Salary Loan', role:'Co-Borrower', date:'2025-06-10', amount:2000 },
      ],
    }),
    borrowerIncomeInfo: income({
      occupation:'Shop Owner', employmentStatus:'Retail',
      companyName:'Sopheak Mini Mart', companyAddress:'#24, St. 92, Phsar Thmei, Doun Penh, Phnom Penh',
      sources:[['Shop daily sales', 1100], ['Market stall rental income', 350]],
      documents: businessIncomeDocs('chan-sopheak', 'sopheak-mini-mart'), bank:'ACLEDA Bank',
    }),
    coBorrowerIncomeInfo: income({
      occupation:'Teacher', employmentStatus:'Employed',
      companyName:'Hun Sen Wat Phnom Primary School', companyAddress:'St. 92, Wat Phnom, Doun Penh, Phnom Penh',
      sources:[['Teaching salary', 750], ['Private tutoring', 150]],
      documents: employedIncomeDocs('chan-chantny', 'wat-phnom-school'), bank:'Wing Bank',
      companyDocuments: employedCompanyDocs('wat-phnom-school', 'chan-chantny'),
    }),
    borrowerExpenseInfo: expense([
      ['Food', 320, 'Household groceries'],
      ['Utilities', 85, 'Electricity, water, internet'],
      ['Transportation', 70, 'Fuel and moto maintenance'],
      ['Education', 120, 'School fees — two children'],
      ['Debt Repayment', 150, 'ABA personal loan installment'],
    ], expenseDocs('chan-sopheak'), { bank: 'ACLEDA Bank' }),
    coBorrowerExpenseInfo: expense([
      ['Food', 140, 'Weekday meals'],
      ['Transportation', 60, 'Commute to school'],
      ['Healthcare', 60, 'Family clinic visits'],
    ], expenseDocs('chan-chantny')),
    reasonCredit:'Expand retail shop inventory and renovate shopfront',
    memoReason:'Good repayment history. Collateral verified.',
    approvalReason:'Collateral and income verified. Second-cycle borrower with clean internal record.',
    manualRiskFactors:{
      positives:['Hard title verified at the Ta Khmau district cadastral office on 08/07/2026'],
      negatives:[],
    },
    status:'Waiting Disburse', submittedAt:'2026-07-06T08:30:00.000Z', approvalState:3,
    approvalHistory:[
      { stage:1, action:'Application submitted', user:'Vuthy Sok', timestamp:'06/07/2026, 08:30:00' },
      { stage:2, action:'Credit review passed', user:'Srey Neang', timestamp:'08/07/2026, 10:15:00' },
      { stage:3, action:'Final approval granted', user:'Admin', timestamp:'10/07/2026, 14:00:00' },
    ],
    repayments:{},
  },
  {
    ref:'AC-L-001002', customerCode:'000002', customerName:'KEO SOPHEA', customerKhName:'កែវ សុភា',
    customerGender:'Female', customerPhone:'015 678 901', customerEmail:'keo.sophea@gmail.com',
    product:'Agricultural Loan', currency:'USD', amount:5000, disbursementDate:'2026-08-10',
    repaymentType:'Monthly', firstInstallment:'2026-09-10', installments:12, interestRate:16, penaltyRate:4,
    creditOfficer:'Vuthy Sok', loanCycle:'1', branch:'Siem Reap Branch', termSelected:true,
    collateral:{
      type:'Vehicle', value:'8000', appraisedValue:'7600', forcedSaleValue:'6100',
      docNo:'VH-2024-00456', registrationStatus:'Registered',
      description:'Toyota Camry 2019, Plate PP-3456',
      vehicleInfo:{
        make:'Toyota', model:'Camry LE', year:'2019', plateNumber:'PP 2AB-3456',
        chassisNumber:'4T1B11HK9KU123456', engineNumber:'2AR-1234567', color:'Silver',
        ownerName:'KEO SOPHEA', issueDate:'2024-05-06', encumbranceStatus:'Clear / Unencumbered',
      },
      documents: vehicleCollateralDocs('camry-pp-3456'),
    },
    coBorrower:{
      khName:'កែវ វិសាល', enName:'KEO VISAL', dob:'1989-04-11', gender:'Male',
      idType:'National ID', idNo:'018904113322', relation:'Spouse', phone:'015 220 447',
      email:'keo.visal@gmail.com', maritalStatus:'Married', customerCode:null,
      currentAddress:{ province:'Siem Reap', district:'Siem Reap', commune:'Svay Dangkum', village:'Sala Kamreuk', house:'12', street:'07' },
      permanentAddress:{ province:'Siem Reap', district:'Angkor Chum', commune:'Kouk Doung', village:'Thlok', house:'03', street:'' },
      occupation:'Tour Guide', employmentStatus:'Employed', monthlyIncome:'620', otherIncome:'',
      documents: identityDocs('keo-visal', { married: true, familyMemberCount: 5 }),
    },
    guarantor:null,
    creditHistoryInfo: cbc('KEO SOPHEA', {
      kScore:640, activeTradelines:1, paymentRecord:'Good (rare late payments)', delinquencies:0, publicRecords:'None', enquiries6Months:1,
      accountStatus:'Normal', paymentHistory24:'000000000000000000000000',
      idExpiryDate:'2029-05-19', placeOfBirth:'Siem Reap', nationality:'Cambodian', reportDate:'2026-07-13',
      accounts:[
        { institution:'AMK Microfinance', loanType:'Agricultural Loan', role:'Borrower', status:'Normal', creditLimit:2000, loanDuration:12, currentBalance:600,
          cycles:Array(24).fill('ontime') },
      ],
      inquiries:[
        { institution:'Acabar Plc', loanType:'Agricultural Loan', role:'Borrower', date:'2026-07-13', amount:5000 },
      ],
    }),
    coBorrowerCreditHistoryInfo: cbc('KEO VISAL', {
      kScore:668, activeTradelines:1, paymentRecord:'Good (rare late payments)', delinquencies:0, publicRecords:'None', enquiries6Months:1,
      accountStatus:'Normal', paymentHistory24:'000000300000000000000000',
      idExpiryDate:'2028-08-30', placeOfBirth:'Siem Reap', nationality:'Cambodian', reportDate:'2026-07-13',
      accounts:[
        { institution:'Hattha Bank', loanType:'Motor Loan', role:'Co-Borrower', status:'Normal', creditLimit:1800, loanDuration:18, currentBalance:540,
          cycles:['ontime','ontime','ontime','ontime','ontime','ontime','30','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime'] },
      ],
      inquiries:[
        { institution:'Hattha Bank', loanType:'Motor Loan', role:'Co-Borrower', date:'2025-03-19', amount:1800 },
      ],
    }),
    borrowerIncomeInfo: income({
      occupation:'Shop Owner', employmentStatus:'Retail',
      companyName:'Sophea Agricultural Supplies', companyAddress:'#12, St. 07, Sala Kamreuk, Siem Reap',
      sources:[['Farm supply shop sales', 780], ['Seasonal crop sales', 200]],
      documents: businessIncomeDocs('keo-sophea', 'sophea-agricultural-supplies'), bank:'Canadia Bank',
    }),
    coBorrowerIncomeInfo: income({
      occupation:'Tour Guide', employmentStatus:'Employed',
      companyName:'Angkor Heritage Tours Co., Ltd.', companyAddress:'#88, Charles de Gaulle Rd, Svay Dangkum, Siem Reap',
      sources:[['Guide salary', 480], ['Tour commissions', 140]],
      documents: employedIncomeDocs('keo-visal', 'angkor-heritage-tours'), bank:'ABA Bank', statementEmployer:'Mekong Payroll Services',
      companyDocuments: employedCompanyDocs('angkor-heritage-tours', 'keo-visal'),
    }),
    borrowerExpenseInfo: expense([
      ['Food', 210, 'Household groceries'],
      ['Utilities', 70, 'Electricity and water'],
      ['Transportation', 55, 'Delivery fuel'],
      ['Debt Repayment', 75, 'AMK microloan installment'],
    ], expenseDocs('keo-sophea')),
    coBorrowerExpenseInfo: expense([
      ['Food', 120, 'Meals on tour days'],
      ['Transportation', 65, 'Motorbike fuel and servicing'],
      ['Healthcare', 45, 'Family clinic'],
    ], expenseDocs('keo-visal')),
    reasonCredit:'Purchase of farming equipment and seasonal seeds',
    memoReason:'First-time customer with stable shop income.',
    approvalReason:'Vehicle collateral inspected and valued. Household income covers the installment comfortably.',
    manualRiskFactors:{
      positives:['Shop turnover confirmed against 6 months of Wing transaction records'],
      negatives:['First loan cycle with Acabar — no internal repayment history yet'],
    },
    status:'Waiting Disburse', submittedAt:'2026-07-13T09:00:00.000Z', approvalState:3,
    approvalHistory:[
      { stage:1, action:'Application submitted', user:'Vuthy Sok', timestamp:'13/07/2026, 09:00:00' },
      { stage:2, action:'Credit review passed', user:'Srey Neang', timestamp:'15/07/2026, 11:00:00' },
      { stage:3, action:'Final approval granted', user:'Admin', timestamp:'17/07/2026, 15:30:00' },
    ],
    repayments:{},
  },
  {
    ref:'AC-L-001003', customerCode:'000003', customerName:'SENG HONG', customerKhName:'សេង ហុង',
    customerGender:'Male', customerPhone:'098 234 567', customerEmail:'seng.hong@yahoo.com',
    product:'Agricultural Loan', currency:'USD', amount:3000, disbursementDate:'2026-03-01',
    repaymentType:'Monthly', firstInstallment:'2026-04-01', installments:12, interestRate:16, penaltyRate:4,
    creditOfficer:'Vuthy Sok', loanCycle:'1', branch:'Battambang Branch', termSelected:true,
    collateral:{
      type:'Land', value:'15000', appraisedValue:'14200', forcedSaleValue:'11400',
      docNo:'LT-2023-00789', registrationStatus:'Registered',
      description:'Rice paddy 2 hectares, Svay Por commune, Battambang',
      landInfo:{
        titleType:'Hard Title', titleNumber:'LT-2023-00789', plotNumber:'02-11-0789', area:'20000',
        landUse:'Agricultural', ownerName:'SENG HONG',
        location:{ province:'Battambang', district:'Battambang', commune:'Svay Por', village:'Sdao' },
        issueDate:'2023-06-22', encumbranceStatus:'Clear / Unencumbered',
      },
      documents: landCollateralDocs('svay-por-paddy'),
    },
    coBorrower:null,
    guarantor:{
      khName:'សេង ស្រីម៉ៅ', enName:'SENG SREYMAO', dob:'1965-11-01', gender:'Female',
      idType:'National ID', idNo:'016511011234', relation:'Parent', phone:'017 456 789',
      email:'', maritalStatus:'Widowed', customerCode:null,
      currentAddress:{ province:'Battambang', district:'Battambang', commune:'Svay Por', village:'Sdao', house:'45', street:'03' },
      permanentAddress:{ province:'Battambang', district:'Battambang', commune:'Svay Por', village:'Sdao', house:'45', street:'03' },
      occupation:'Farmer', employmentStatus:'Self-Employed', monthlyIncome:'420', otherIncome:'',
      documents: identityDocs('seng-sreymao', { familyMemberCount: 6 }),
    },
    creditHistoryInfo: cbc('SENG HONG', {
      kScore:655, activeTradelines:0, paymentRecord:'Good (rare late payments)', delinquencies:0, publicRecords:'None', enquiries6Months:1,
      accountStatus:'Normal', paymentHistory24:'000000000000000000000000',
      idExpiryDate:'2028-07-11', placeOfBirth:'Battambang', nationality:'Cambodian', reportDate:'2026-02-25',
      accounts:[
        { institution:'Hattha Bank', loanType:'Agricultural Loan', role:'Borrower', status:'Closed', creditLimit:1500, loanDuration:12, currentBalance:0,
          cycles:Array(24).fill('ontime') },
      ],
      inquiries:[
        { institution:'Acabar Plc', loanType:'Agricultural Loan', role:'Borrower', date:'2026-02-25', amount:3000 },
      ],
    }),
    guarantorCreditHistoryInfo: cbc('SENG SREYMAO', {
      kScore:580, activeTradelines:1, paymentRecord:'Poor (frequent delinquency)', delinquencies:2, publicRecords:'Court judgment 2021 — unpaid vendor loan', enquiries6Months:4,
      accountStatus:'Write-off', paymentHistory24:'003369900000000000000000',
      idExpiryDate:'2026-12-01', placeOfBirth:'Battambang', nationality:'Cambodian', reportDate:'2026-02-25',
      accounts:[
        { institution:'PRASAC MFI', loanType:'Micro Loan', role:'Guarantor', status:'Write-off', creditLimit:800, loanDuration:12, currentBalance:800,
          cycles:['ontime','ontime','30','30','60','90','90','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime'] },
      ],
      inquiries:[
        { institution:'PRASAC MFI', loanType:'Micro Loan', role:'Guarantor', date:'2024-08-01', amount:800 },
        { institution:'Wing Bank', loanType:'Personal Loan', role:'Guarantor', date:'2025-09-14', amount:500 },
      ],
    }),
    borrowerIncomeInfo: income({
      occupation:'Farmer', employmentStatus:'Self-Employed',
      companyName:'Own rice farm — Sdao, Svay Por', companyAddress:'Sdao village, Svay Por commune, Battambang',
      sources:[['Rice harvest sales', 560], ['Vegetable plot sales', 190]],
      documents: businessIncomeDocs('seng-hong', 'sdao-rice-farm'), bank:'Hattha Bank',
    }),
    guarantorIncomeInfo: income({
      occupation:'Farmer', employmentStatus:'Self-Employed',
      companyName:'Family smallholding — Sdao', companyAddress:'Sdao village, Svay Por commune, Battambang',
      sources:[['Crop sales', 300], ['Livestock sales', 120]],
      documents: businessIncomeDocs('seng-sreymao', 'sdao-smallholding'), bank:'Sathapana Bank',
    }),
    borrowerExpenseInfo: expense([
      ['Food', 180, 'Household groceries'],
      ['Utilities', 45, 'Electricity and water pump'],
      ['Transportation', 60, 'Fuel for farm transport'],
      ['Healthcare', 35, 'Village health post'],
    ], expenseDocs('seng-hong')),
    guarantorExpenseInfo: expense([
      ['Food', 130, 'Household groceries'],
      ['Healthcare', 70, 'Chronic medication'],
      ['Utilities', 30, 'Electricity'],
    ], expenseDocs('seng-sreymao')),
    reasonCredit:'Seasonal farming inputs — fertilizer, seeds, labour',
    memoReason:'Collateral valued at $15,000. Low risk profile.',
    approvalReason:'Land title clear and harvest income verified. Guarantor accepted despite historic write-off, collateral covers exposure 5×.',
    manualRiskFactors:{
      positives:['Land title clear of encumbrance; forced-sale value covers 3.8× the loan amount'],
      negatives:['Guarantor carries a written-off PRASAC micro loan — recovery relies on the collateral, not the guarantee'],
    },
    status:'Active', submittedAt:'2026-02-25T10:00:00.000Z', approvalState:3,
    approvalHistory:[
      { stage:1, action:'Application submitted', user:'Vuthy Sok', timestamp:'25/02/2026, 10:00:00' },
      { stage:2, action:'Credit review passed', user:'Srey Neang', timestamp:'27/02/2026, 13:00:00' },
      { stage:3, action:'Disbursed', user:'Admin', timestamp:'01/03/2026, 08:00:00' },
    ],
    reminderHistory:[
      { method:'Message', recipient:'SENG HONG', role:'Borrower', destination:'098 234 567', message:'Dear SENG HONG, this is a reminder that your payment of $272.30 is due on 01/04/2026. Please settle on time to avoid late fees. - Acabar Finance', timestamp:'28/03/2026, 09:15:00' },
      { method:'Telegram', recipient:'SENG HONG', role:'Borrower', destination:'098 234 567', message:'🔔 Payment Reminder\nDear SENG HONG, your installment of $272.30 for loan AC-L-001003 is due on 01/05/2026. Please make your payment on time. Thank you - Acabar Finance', timestamp:'28/04/2026, 09:00:00' },
      { method:'Message', recipient:'SENG SREYMAO', role:'Guarantor', destination:'017 456 789', message:'Dear SENG SREYMAO, this is a reminder that the payment of $272.30 on loan AC-L-001003 is due on 01/07/2026. Please settle on time to avoid late fees. - Acabar Finance', timestamp:'27/06/2026, 10:05:00' },
    ],
    // Disbursed in March, collected on time every month since.
    repayments:{ paid: 4 },
  },
  {
    ref:'AC-L-001004', customerCode:'000005', customerName:'LIM KIMHOUR', customerKhName:'លីម គីមហ័រ',
    customerGender:'Male', customerPhone:'016 345 678', customerEmail:'lim.kimhour@business.com',
    product:'SME Loan', currency:'USD', amount:25000, disbursementDate:'2025-12-01',
    repaymentType:'Monthly', firstInstallment:'2026-01-01', installments:36, interestRate:15, penaltyRate:5,
    creditOfficer:'Srey Neang', loanCycle:'3', branch:'Phnom Penh HQ', termSelected:true,
    collateral:{
      type:'House', value:'65000', appraisedValue:'62000', forcedSaleValue:'49600',
      docNo:'CP-2022-00334', registrationStatus:'Registered',
      description:'3-storey shophouse, 4.5m x 20m, Chamkar Mon, Phnom Penh',
      houseInfo:{
        houseType:'Townhouse', constructionType:'Concrete', floors:'3', floorArea:'270', landArea:'90',
        yearBuilt:'2016', ownerName:'LIM KIMHOUR',
        location:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Boeung Keng Kang' },
        issueDate:'2022-09-14', encumbranceStatus:'Clear / Unencumbered',
      },
      documents: houseCollateralDocs('bkk-shophouse'),
    },
    coBorrower:{
      khName:'លីម ចន្ទ្រា', enName:'LIM CHANTREA', dob:'1986-04-22', gender:'Female',
      idType:'National ID', idNo:'018604221445', relation:'Spouse', phone:'016 890 123',
      email:'lim.chantrea@gmail.com', maritalStatus:'Married', customerCode:null,
      currentAddress:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Boeung Keng Kang', house:'22A', street:'310' },
      permanentAddress:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Boeung Keng Kang', house:'22A', street:'310' },
      occupation:'Homemaker', employmentStatus:'Self-Employed', monthlyIncome:'450', otherIncome:'',
      documents: identityDocs('lim-chantrea', { married: true, familyMemberCount: 5 }),
    },
    guarantor:{
      khName:'លីម វណ្ណា', enName:'LIM VANNA', dob:'1958-06-12', gender:'Male',
      idType:'National ID', idNo:'015806121678', relation:'Sibling', phone:'012 445 990',
      email:'lim.vanna@gmail.com', maritalStatus:'Married', customerCode:null,
      currentAddress:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Boeung Keng Kang', house:'22A', street:'310' },
      permanentAddress:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Boeung Keng Kang', house:'22A', street:'310' },
      occupation:'Retired', employmentStatus:'Self-Employed', monthlyIncome:'800', otherIncome:'',
      documents: identityDocs('lim-vanna', { married: true, familyMemberCount: 3 }),
    },
    creditHistoryInfo: cbc('LIM KIMHOUR', {
      kScore:731, activeTradelines:3, paymentRecord:'Excellent (no missed payments)', delinquencies:0, publicRecords:'None', enquiries6Months:1,
      accountStatus:'Normal', paymentHistory24:'000000000000000000000000',
      idExpiryDate:'2028-09-30', placeOfBirth:'Phnom Penh', nationality:'Cambodian', reportDate:'2025-11-20',
      accounts:[
        { institution:'Canadia Bank', loanType:'Business Loan', role:'Borrower', status:'Normal', creditLimit:20000, loanDuration:36, currentBalance:12500,
          cycles:Array(24).fill('ontime') },
        { institution:'ACLEDA Bank', loanType:'Overdraft', role:'Borrower', status:'Normal', creditLimit:5000, loanDuration:12, currentBalance:1200,
          cycles:['ontime','ontime','ontime','ontime','ontime','ontime','ontime','30','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime'] },
        { institution:'Sathapana Bank', loanType:'SME Loan', role:'Borrower', status:'Closed', creditLimit:15000, loanDuration:24, currentBalance:0,
          cycles:Array(24).fill('ontime') },
      ],
      inquiries:[
        { institution:'Acabar Plc', loanType:'SME Loan', role:'Borrower', date:'2025-11-20', amount:25000 },
        { institution:'Canadia Bank', loanType:'Business Loan', role:'Borrower', date:'2024-10-02', amount:20000 },
      ],
    }),
    coBorrowerCreditHistoryInfo: cbc('LIM CHANTREA', {
      kScore:610, activeTradelines:0, paymentRecord:'Fair (occasional delinquency)', delinquencies:1, publicRecords:'None', enquiries6Months:0,
      accountStatus:'Delinquent', paymentHistory24:'000360000000000000000000',
      idExpiryDate:'2027-04-18', placeOfBirth:'Phnom Penh', nationality:'Cambodian', reportDate:'2025-11-20',
      accounts:[
        { institution:'Wing Bank', loanType:'Personal Loan', role:'Co-Borrower', status:'Delinquent', creditLimit:1500, loanDuration:12, currentBalance:900,
          cycles:['ontime','ontime','ontime','30','60','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime'] },
      ],
      inquiries:[
        { institution:'Wing Bank', loanType:'Personal Loan', role:'Co-Borrower', date:'2024-12-05', amount:1500 },
      ],
    }),
    guarantorCreditHistoryInfo: cbc('LIM VANNA', {
      kScore:745, activeTradelines:1, paymentRecord:'Excellent (no missed payments)', delinquencies:0, publicRecords:'None', enquiries6Months:0,
      accountStatus:'Normal', paymentHistory24:'000000000000000000000000',
      idExpiryDate:'2031-01-22', placeOfBirth:'Phnom Penh', nationality:'Cambodian', reportDate:'2025-11-20',
      accounts:[
        { institution:'ABA Bank', loanType:'Mortgage', role:'Guarantor', status:'Normal', creditLimit:40000, loanDuration:60, currentBalance:22000,
          cycles:Array(24).fill('ontime') },
      ],
      inquiries:[
        { institution:'ABA Bank', loanType:'Mortgage', role:'Guarantor', date:'2022-03-15', amount:40000 },
      ],
    }),
    borrowerIncomeInfo: income({
      occupation:'Restaurant Owner', employmentStatus:'Service',
      companyName:'Kimhour Kitchen & Cafe', companyAddress:'#22A, St. 310, Boeung Keng Kang, Chamkar Mon, Phnom Penh',
      sources:[['Restaurant takings', 2400], ['Catering contracts', 550], ['Shophouse floor rental', 250]],
      documents: businessIncomeDocs('lim-kimhour', 'kimhour-kitchen-cafe'), bank:'Vattanac Bank',
    }),
    coBorrowerIncomeInfo: income({
      occupation:'Homemaker', employmentStatus:'Self-Employed',
      companyName:'Home tailoring — Boeung Keng Kang', companyAddress:'#22A, St. 310, Boeung Keng Kang, Chamkar Mon, Phnom Penh',
      sources:[['Tailoring orders', 450]],
      documents: businessIncomeDocs('lim-chantrea', 'boeung-keng-kang-tailoring'), bank:'Wing Bank',
    }),
    guarantorIncomeInfo: income({
      occupation:'Retired', employmentStatus:'Self-Employed',
      companyName:'Rental property — St. 310', companyAddress:'St. 310, Boeung Keng Kang, Chamkar Mon, Phnom Penh',
      sources:[['Room rental income', 800]],
      documents: businessIncomeDocs('lim-vanna', 'rental-property-st-310'), bank:'ABA Bank',
    }),
    borrowerExpenseInfo: expense([
      ['Food', 620, 'Household and staff meals'],
      ['Utilities', 340, 'Restaurant electricity, gas, water'],
      ['Rent', 250, 'Second-branch deposit rent'],
      ['Transportation', 140, 'Delivery van fuel'],
      ['Debt Repayment', 480, 'Canadia business loan installment'],
      // The one seeded record where the statement disagrees with the budget: six months of money
      // out come to a third more than declared, which is the finding the tab exists to surface.
    ], expenseDocs('lim-kimhour'), { bank: 'Vattanac Bank', detectedFactor: 1.32 }),
    coBorrowerExpenseInfo: expense([
      ['Food', 180, 'Household groceries'],
      ['Education', 220, 'School fees — three children'],
      ['Healthcare', 80, 'Family clinic'],
    ], expenseDocs('lim-chantrea')),
    guarantorExpenseInfo: expense([
      ['Food', 150, 'Household groceries'],
      ['Healthcare', 120, 'Regular medication'],
      ['Utilities', 60, 'Electricity and water'],
    ], expenseDocs('lim-vanna')),
    reasonCredit:'Restaurant expansion — kitchen equipment and fit-out of second branch',
    memoReason:'Strong financial profile. Third loan cycle. Excellent track record.',
    approvalReason:'Third-cycle borrower with an excellent internal record. Shophouse collateral covers 2.6× the exposure.',
    manualRiskFactors:{
      positives:['Restaurant takings confirmed against 12 months of ACLEDA statements'],
      negatives:['Co-borrower carries a delinquent Wing personal loan — repayment relies on the borrower\'s business income'],
    },
    status:'Active', submittedAt:'2025-11-20T07:30:00.000Z', approvalState:3,
    approvalHistory:[
      { stage:1, action:'Application submitted', user:'Srey Neang', timestamp:'20/11/2025, 07:30:00' },
      { stage:2, action:'Credit review passed', user:'Srey Neang', timestamp:'24/11/2025, 10:00:00' },
      { stage:3, action:'Disbursed', user:'Admin', timestamp:'01/12/2025, 09:00:00' },
    ],
    reminderHistory:[
      { method:'Email', recipient:'LIM KIMHOUR', role:'Borrower', destination:'lim.kimhour@business.com', message:'Subject: Payment Reminder - Loan AC-L-001004\n\nDear LIM KIMHOUR,\n\nThis is a friendly reminder that your installment payment of $866.19 for loan AC-L-001004 is due on 01/05/2026. Please make your payment on or before the due date to avoid any late fees.\n\nThank you,\nAcabar Finance', timestamp:'27/04/2026, 14:20:00' },
      { method:'Message', recipient:'LIM CHANTREA', role:'Co-Borrower', destination:'016 890 123', message:'Dear LIM CHANTREA, this is a reminder that your payment of $866.19 is due on 01/06/2026. Please settle on time to avoid late fees. - Acabar Finance', timestamp:'28/05/2026, 11:05:00' },
      { method:'Telegram', recipient:'LIM KIMHOUR', role:'Borrower', destination:'016 345 678', message:'🔔 Payment Reminder\nDear LIM KIMHOUR, your installment for loan AC-L-001004 was due on 01/07/2026 and is now overdue. Please settle the balance and the late fee. Thank you - Acabar Finance', timestamp:'06/07/2026, 08:40:00' },
    ],
    // Five installments collected, June paid interest-only (the principal remainder rolls
    // onto July, which picks up the contract-rate penalty automatically), and the July
    // installment is now past due — so it shows both the carried penalty and Overdue.
    repayments:{
      paid: 5,
      partial:{ index: 5, principalPaid: 300, method:'Cash', memo:'Interest-only payment agreed — seasonal cash-flow dip at the restaurant' },
    },
  },
  {
    ref:'AC-L-001005', customerCode:'000006', customerName:'CHAN THEARY', customerKhName:'ចាន់ ធារី',
    customerGender:'Female', customerPhone:'089 112 334', customerEmail:'chan.theary@student.edu.kh',
    product:'Personal Loan', currency:'USD', amount:2000, disbursementDate:'2026-08-15',
    repaymentType:'Monthly', firstInstallment:'2026-09-15', installments:12, interestRate:20, penaltyRate:6,
    creditOfficer:'Vuthy Sok', loanCycle:'1', branch:'Phnom Penh HQ', termSelected:true,
    collateral:{
      type:'Vehicle', value:'4500', appraisedValue:'4200', forcedSaleValue:'3400',
      docNo:'VH-2024-00789', registrationStatus:'Registered',
      description:'Honda Dream motorcycle 2022, Plate SR-6677',
      vehicleInfo:{
        make:'Honda', model:'Dream 125', year:'2022', plateNumber:'SR 1BB-6677',
        chassisNumber:'MLHJC7610N5012345', engineNumber:'JC76E-1234567', color:'Black',
        ownerName:'CHAN THEARY', issueDate:'2024-02-19', encumbranceStatus:'Clear / Unencumbered',
      },
      documents: vehicleCollateralDocs('honda-dream-sr-6677'),
    },
    coBorrower:null, guarantor:null,
    creditHistoryInfo: cbc('CHAN THEARY', {
      kScore:590, activeTradelines:1, paymentRecord:'Fair (occasional delinquency)', delinquencies:1, publicRecords:'None', enquiries6Months:5,
      accountStatus:'Delinquent', paymentHistory24:'033600000000000000000000',
      idExpiryDate:'2030-02-08', placeOfBirth:'Phnom Penh', nationality:'Cambodian', reportDate:'2026-06-20',
      accounts:[
        { institution:'Wing Bank', loanType:'Personal Loan', role:'Borrower', status:'Delinquent', creditLimit:300, loanDuration:6, currentBalance:150,
          cycles:['ontime','30','30','60','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime'] },
      ],
      inquiries:[
        { institution:'Acabar Plc', loanType:'Personal Loan', role:'Borrower', date:'2026-06-20', amount:2000 },
        { institution:'Wing Bank', loanType:'Personal Loan', role:'Borrower', date:'2025-12-10', amount:300 },
        { institution:'Chip Mong Bank', loanType:'Personal Loan', role:'Borrower', date:'2025-10-02', amount:500 },
      ],
    }),
    borrowerIncomeInfo: income({
      occupation:'Small Business Trader', employmentStatus:'Retail',
      companyName:'Theary market stall — Chak Angrae Leu', companyAddress:'Phum 7, Chak Angrae Leu, Mean Chey, Phnom Penh',
      sources:[['Market stall sales', 480], ['Online resale', 140]],
      documents: businessIncomeDocs('chan-theary', 'theary-market-stall'), bank:'Wing Bank', detectedFactor:0.68,
    }),
    borrowerExpenseInfo: expense([
      ['Food', 140, 'Daily meals'],
      ['Transportation', 55, 'Moto fuel to market'],
      ['Utilities', 40, 'Electricity and phone'],
      ['Debt Repayment', 45, 'Wing personal loan arrears'],
    ], expenseDocs('chan-theary')),
    reasonCredit:'Working capital for market stall restocking',
    memoReason:'First-time applicant. Collateral assessed.',
    manualRiskFactors:{
      positives:['Motorcycle collateral registered in the applicant\'s own name and inspected on 22/06/2026'],
      negatives:['Wing personal loan still delinquent at application — clearance required before disbursement'],
    },
    status:'In Progress', submittedAt:'2026-06-20T14:00:00.000Z', approvalState:1,
    approvalHistory:[
      { stage:1, action:'Application submitted', user:'Vuthy Sok', timestamp:'20/06/2026, 14:00:00' },
    ],
    repayments:{},
  },
  {
    ref:'AC-L-001006', customerCode:'000007', customerName:'HENG SOPHEAK', customerKhName:'ហេង សុភ័គ',
    customerGender:'Male', customerPhone:'011 567 890', customerEmail:'heng.sopheak@gmail.com',
    product:'Business Loan', currency:'USD', amount:8000, disbursementDate:'2026-08-05',
    repaymentType:'Monthly', firstInstallment:'2026-09-05', installments:18, interestRate:17, penaltyRate:5,
    creditOfficer:'Srey Neang', loanCycle:'2', branch:'Phnom Penh HQ', termSelected:true,
    collateral:{
      type:'Land', value:'22000', appraisedValue:'21000', forcedSaleValue:'16800',
      docNo:'LT-2023-00456', registrationStatus:'Registered',
      description:'Residential land plot 300 sqm, Chbar Mon, Kampong Speu',
      landInfo:{
        titleType:'Hard Title', titleNumber:'LT-2023-00456', plotNumber:'05-01-0456', area:'300',
        landUse:'Residential', ownerName:'HENG SOPHEAK',
        location:{ province:'Kampong Speu', district:'Chbar Mon', commune:'Chbar Mon', village:'Khum Leu' },
        issueDate:'2023-11-08', encumbranceStatus:'Clear / Unencumbered',
      },
      documents: landCollateralDocs('chbar-mon-300sqm'),
    },
    coBorrower:{
      khName:'ហេង ស្រីនិច', enName:'HENG SREYNICH', dob:'1984-01-27', gender:'Female',
      idType:'National ID', idNo:'018401277781', relation:'Spouse', phone:'011 903 224',
      email:'heng.sreynich@gmail.com', maritalStatus:'Married', customerCode:null,
      currentAddress:{ province:'Kampong Speu', district:'Chbar Mon', commune:'Chbar Mon', village:'Khum Leu', house:'14', street:'02' },
      permanentAddress:{ province:'Kampong Speu', district:'Chbar Mon', commune:'Chbar Mon', village:'Khum Leu', house:'14', street:'02' },
      occupation:'Shop Owner', employmentStatus:'Self-Employed', monthlyIncome:'520', otherIncome:'',
      documents: identityDocs('heng-sreynich', { married: true, familyMemberCount: 5 }),
    },
    guarantor:null,
    creditHistoryInfo: cbc('HENG SOPHEAK', {
      kScore:710, activeTradelines:2, paymentRecord:'Excellent (no missed payments)', delinquencies:0, publicRecords:'None', enquiries6Months:1,
      accountStatus:'Normal', paymentHistory24:'000000000000000000000000',
      idExpiryDate:'2029-08-25', placeOfBirth:'Kampong Speu', nationality:'Cambodian', reportDate:'2026-07-08',
      accounts:[
        { institution:'ACLEDA Bank', loanType:'Business Loan', role:'Borrower', status:'Normal', creditLimit:6000, loanDuration:18, currentBalance:2400,
          cycles:Array(24).fill('ontime') },
        { institution:'PRASAC MFI', loanType:'Equipment Loan', role:'Borrower', status:'Closed', creditLimit:4000, loanDuration:12, currentBalance:0,
          cycles:Array(24).fill('ontime') },
      ],
      inquiries:[
        { institution:'Acabar Plc', loanType:'Business Loan', role:'Borrower', date:'2026-07-08', amount:8000 },
      ],
    }),
    coBorrowerCreditHistoryInfo: cbc('HENG SREYNICH', {
      kScore:694, activeTradelines:1, paymentRecord:'Good (rare late payments)', delinquencies:0, publicRecords:'None', enquiries6Months:1,
      accountStatus:'Normal', paymentHistory24:'000000000030000000000000',
      idExpiryDate:'2029-02-14', placeOfBirth:'Kampong Speu', nationality:'Cambodian', reportDate:'2026-07-08',
      accounts:[
        { institution:'AMK Microfinance', loanType:'Micro Business Loan', role:'Co-Borrower', status:'Normal', creditLimit:1200, loanDuration:12, currentBalance:300,
          cycles:['ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','30','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime','ontime'] },
      ],
      inquiries:[
        { institution:'AMK Microfinance', loanType:'Micro Business Loan', role:'Co-Borrower', date:'2025-08-21', amount:1200 },
      ],
    }),
    borrowerIncomeInfo: income({
      occupation:'Business Owner', employmentStatus:'Service',
      companyName:'Sopheak Woodworking Workshop', companyAddress:'#14, St. 02, Khum Leu, Chbar Mon, Kampong Speu',
      sources:[['Furniture orders', 820], ['Repair and fitting jobs', 280]],
      documents: businessIncomeDocs('heng-sopheak', 'sopheak-woodworking-workshop'), bank:'ACLEDA Bank',
    }),
    coBorrowerIncomeInfo: income({
      occupation:'Shop Owner', employmentStatus:'Retail',
      companyName:'Sreynich Grocery', companyAddress:'#14, St. 02, Khum Leu, Chbar Mon, Kampong Speu',
      sources:[['Grocery sales', 520]],
      documents: businessIncomeDocs('heng-sreynich', 'sreynich-grocery'), bank:'Chip Mong Bank',
    }),
    borrowerExpenseInfo: expense([
      ['Food', 240, 'Household groceries'],
      ['Utilities', 110, 'Workshop and household electricity'],
      ['Transportation', 90, 'Delivery truck fuel'],
      ['Education', 130, 'School fees — two children'],
      ['Debt Repayment', 160, 'ACLEDA business loan installment'],
    ], expenseDocs('heng-sopheak')),
    coBorrowerExpenseInfo: expense([
      ['Food', 130, 'Shop and household meals'],
      ['Utilities', 45, 'Shop electricity'],
      ['Debt Repayment', 55, 'AMK micro loan installment'],
    ], expenseDocs('heng-sreynich')),
    reasonCredit:'Purchase of woodworking machinery and tools',
    memoReason:'Stable self-employed income. Second cycle borrower.',
    approvalReason:'Second-cycle borrower, ACLEDA loan repaid on time throughout. Land collateral covers 2.6× the exposure.',
    manualRiskFactors:{
      positives:['Workshop order book for the next two quarters sighted and confirmed with two commercial buyers'],
      negatives:[],
    },
    status:'Waiting Disburse', submittedAt:'2026-07-08T11:00:00.000Z', approvalState:3,
    approvalHistory:[
      { stage:1, action:'Application submitted', user:'Srey Neang', timestamp:'08/07/2026, 11:00:00' },
      { stage:2, action:'Credit review passed', user:'Srey Neang', timestamp:'10/07/2026, 09:30:00' },
      { stage:3, action:'Final approval granted', user:'Admin', timestamp:'13/07/2026, 16:00:00' },
    ],
    repayments:{},
  },
]

// EMI, the repayment schedule and the collateral loan-to-value ratio are all derived by
// the app from the loan's own figures — derive them here too so a seeded loan can't carry
// a total that disagrees with the rows it was calculated from.
export const INITIAL_LOANS = LOAN_SEEDS.map(({ repayments, ...loan }) => {
  const { emi, schedule } = seedSchedule(loan, repayments)
  const collateralValue = parseFloat(loan.collateral?.value) || 0
  return {
    ...loan,
    collateral: loan.collateral
      ? { ...loan.collateral, ltvRatio: collateralValue > 0 ? (loan.amount / collateralValue) * 100 : undefined }
      : null,
    emi: Math.round(emi * 100) / 100,
    schedule,
  }
})

export const INITIAL_EXPENSES = [
  { code:'EXP-000001', category:'Staff Salaries',    amount:4200, date:'2026-06-01', description:'Monthly staff payroll — June 2026', account:'ACC-PAYROLL', status:'Approved' },
  { code:'EXP-000002', category:'Office Rent',       amount:1500, date:'2026-06-01', description:'Phnom Penh HQ monthly rent',         account:'ACC-EXPENSE', status:'Approved' },
  { code:'EXP-000003', category:'Utilities',         amount:380,  date:'2026-06-05', description:'Electricity & internet — June',       account:'ACC-UTILITY', status:'Approved' },
  { code:'EXP-000004', category:'Staff Salaries',    amount:2100, date:'2026-05-01', description:'Monthly staff payroll — May 2026',    account:'ACC-PAYROLL', status:'Approved' },
  { code:'EXP-000005', category:'Office Supplies',   amount:215,  date:'2026-05-10', description:'Stationery and print cartridges',     account:'ACC-EXPENSE', status:'Approved' },
  { code:'EXP-000006', category:'Travel & Transport',amount:340,  date:'2026-05-18', description:'Field visit — Battambang Branch',     account:'ACC-EXPENSE', status:'Approved' },
  { code:'EXP-000007', category:'Office Rent',       amount:1500, date:'2026-05-01', description:'Phnom Penh HQ monthly rent — May',    account:'ACC-EXPENSE', status:'Approved' },
  { code:'EXP-000008', category:'Utilities',         amount:410,  date:'2026-04-05', description:'Electricity & internet — April',      account:'ACC-UTILITY', status:'Approved' },
]

export const INITIAL_INCOMES = [
  { code:'INC-000001', category:'Interest Income',   amount:3840, date:'2026-06-15', description:'Monthly interest collected — June 2026',  account:'ACC-REPAYMENT', source:'Borrower loan repayments' },
  { code:'INC-000002', category:'Loan Fees',         amount:1250, date:'2026-06-10', description:'Processing fees — 3 new disbursements',    account:'ACC-REPAYMENT', source:'Loan processing fees' },
  { code:'INC-000003', category:'Late Penalty Fees', amount:185,  date:'2026-06-20', description:'Penalty collected from 2 overdue loans',   account:'ACC-REPAYMENT', source:'Overdue borrower penalties' },
  { code:'INC-000004', category:'Interest Income',   amount:3650, date:'2026-05-15', description:'Monthly interest collected — May 2026',    account:'ACC-REPAYMENT', source:'Borrower loan repayments' },
  { code:'INC-000005', category:'Loan Fees',         amount:800,  date:'2026-05-05', description:'Processing fees — 2 new disbursements',    account:'ACC-REPAYMENT', source:'Loan processing fees' },
  { code:'INC-000006', category:'Interest Income',   amount:3500, date:'2026-04-15', description:'Monthly interest collected — April 2026',  account:'ACC-REPAYMENT', source:'Borrower loan repayments' },
  { code:'INC-000007', category:'Late Penalty Fees', amount:95,   date:'2026-04-22', description:'Penalty collected — 1 overdue account',    account:'ACC-REPAYMENT', source:'Overdue borrower penalties' },
]

// ACC-MAIN is the central reserve — funds not yet allocated to any operational sub-account.
// It's transferred out to top up a sub-account (e.g. Loan Release) when that runs low; it
// never receives income directly itself. The other rows are the operational sub-accounts.
export const INITIAL_ACCOUNTS = [
  { code:'ACC-MAIN',      name:'Main Account',          balance:50000 },
  { code:'ACC-LOAN',      name:'Loan Release Account', balance:6680 },
  { code:'ACC-REPAYMENT', name:'Repayment Account',    balance:13320 },
  { code:'ACC-PAYROLL',   name:'Payroll Account',       balance:6300 },
  { code:'ACC-UTILITY',   name:'Utility Account',       balance:790 },
  { code:'ACC-EXPENSE',   name:'Expense Account',       balance:3555 },
]

// NBC-style Chart of Accounts — Asset/Liability/Equity/Income/Expense with parent/child
// grouping. 5010 (Income) and 6010/6020/6030/6040 (Expense) mirror the operational
// ACC-REPAYMENT/ACC-LOAN/ACC-PAYROLL/ACC-UTILITY/ACC-EXPENSE sub-accounts above so loan
// disbursement/repayment postings have somewhere to land in the GL.
export const INITIAL_CHART_OF_ACCOUNTS = [
  { code:'1010', type:'Asset',     name:'Cash on Hand',                nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'',                                                              status:'ACTIVE', currency:'USD', balance:18250 },
  { code:'1020', type:'Asset',     name:'Bank Account (USD)',          nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'',                                                              status:'ACTIVE', currency:'USD', balance:462800 },
  { code:'1021', type:'Asset',     name:'Bank Account (KHR)',          nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'Bank account balance held in Khmer Riel.',                     status:'ACTIVE', currency:'KHR', balance:50000 },
  { code:'1100', type:'Asset',     name:'Loans Receivable',            nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'Roll-up of all outstanding loan principal across products.',  status:'ACTIVE', currency:'USD', balance:4850000 },
  { code:'1101', type:'Asset',     name:'Device Installment Loans',    nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1100', description:'',                                                              status:'ACTIVE', currency:'USD', balance:1120000 },
  { code:'1102', type:'Asset',     name:'Auto Loans',                  nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1100', description:'',                                                              status:'ACTIVE', currency:'USD', balance:1890000 },
  { code:'1103', type:'Asset',     name:'Land Purchase Loans',         nameKhmer:'', normalBalance:'DEBIT',  parentCode:'1100', description:'',                                                              status:'ACTIVE', currency:'USD', balance:1840000 },
  { code:'1110', type:'Asset',     name:'Allowance for Loan Losses',   nameKhmer:'', normalBalance:'CREDIT', parentCode:'',     description:'Contra-asset — offsets Loans Receivable for expected credit losses.', status:'ACTIVE', currency:'USD', balance:145500 },
  { code:'1111', type:'Asset',     name:'Stage 1 Allowance',           nameKhmer:'', normalBalance:'CREDIT', parentCode:'1110', description:'',                                                              status:'ACTIVE', currency:'USD', balance:48500 },
  { code:'1112', type:'Asset',     name:'Stage 2 Allowance',           nameKhmer:'', normalBalance:'CREDIT', parentCode:'1110', description:'',                                                              status:'ACTIVE', currency:'USD', balance:52000 },
  { code:'1113', type:'Asset',     name:'Stage 3 Allowance',           nameKhmer:'', normalBalance:'CREDIT', parentCode:'1110', description:'',                                                              status:'ACTIVE', currency:'USD', balance:45000 },
  { code:'1120', type:'Asset',     name:'Interest Receivable (Accrued)', nameKhmer:'', normalBalance:'DEBIT', parentCode:'',    description:'',                                                              status:'ACTIVE', currency:'USD', balance:32400 },
  // The two loan-book control accounts. Their balances mirror the Loan Account Management
  // cards: Account Receivable is principal released and not yet collected back, Account
  // Payable is principal approved and not yet released. The seeds below are the totals of
  // INITIAL_LOANS — 1130 is the sum of every active loan's outstanding balance, 2030 the
  // sum of every loan still sitting in 'Waiting Disburse'.
  { code:'1130', type:'Asset',     name:'Account Receivable — Loan Repayment', nameKhmer:'', normalBalance:'DEBIT', parentCode:'', description:'Principal out with borrowers. Debited when a loan is disbursed, credited by the principal each repayment retires.', status:'ACTIVE', currency:'USD', balance:23911.70 },
  // The KHR side of the receivable, so the KHR receivable account below has a GL of its own
  // currency to link to. Nothing in the loan seed is booked in riel, so it starts at zero.
  { code:'1131', type:'Asset',     name:'Account Receivable — Loan Repayment (KHR)', nameKhmer:'', normalBalance:'DEBIT', parentCode:'', description:'Principal out with borrowers on riel loans. Debited on disbursement, credited by the principal each repayment retires.', status:'ACTIVE', currency:'KHR', balance:0 },
  { code:'2010', type:'Liability', name:'Customer Deposits Payable',   nameKhmer:'', normalBalance:'CREDIT', parentCode:'',     description:'',                                                              status:'ACTIVE', currency:'USD', balance:26800 },
  { code:'2020', type:'Liability', name:'Borrowings',                  nameKhmer:'', normalBalance:'CREDIT', parentCode:'',     description:'',                                                              status:'ACTIVE', currency:'USD', balance:1250000 },
  { code:'2030', type:'Liability', name:'Account Payable — Loan Disbursement', nameKhmer:'', normalBalance:'CREDIT', parentCode:'', description:'Approved loan principal the company still owes borrowers. Credited on final approval, debited when the loan is disbursed.', status:'ACTIVE', currency:'USD', balance:28000 },
  { code:'3010', type:'Equity',    name:'Share Capital',                nameKhmer:'', normalBalance:'CREDIT', parentCode:'',     description:'',                                                              status:'ACTIVE', currency:'USD', balance:2000000 },
  { code:'3020', type:'Equity',    name:'Retained Earnings',            nameKhmer:'', normalBalance:'CREDIT', parentCode:'',     description:'',                                                              status:'ACTIVE', currency:'USD', balance:685400 },
  { code:'5010', type:'Income',    name:'Repayment Account',            nameKhmer:'', normalBalance:'CREDIT', parentCode:'',     description:'Receives all borrower loan repayments.',                       status:'ACTIVE', currency:'USD', balance:13320 },
  { code:'6010', type:'Expense',   name:'Loan Release Account',         nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'Funds loan principal on disbursement.',                        status:'ACTIVE', currency:'USD', balance:6680 },
  { code:'6020', type:'Expense',   name:'Payroll Account',              nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'Funds staff salaries.',                                        status:'ACTIVE', currency:'USD', balance:6300 },
  // The KHR side of the payroll account, so the KHR payroll card has a GL of its own
  // currency to link to. Nothing in the seed pays a riel salary, so it starts at zero.
  { code:'6021', type:'Expense',   name:'Payroll Account (KHR)',        nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'Funds staff salaries paid in Khmer Riel.',                    status:'ACTIVE', currency:'KHR', balance:0 },
  { code:'6030', type:'Expense',   name:'Utility Account',              nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'Funds utility bills.',                                         status:'ACTIVE', currency:'USD', balance:790 },
  { code:'6040', type:'Expense',   name:'Expense Account',              nameKhmer:'', normalBalance:'DEBIT',  parentCode:'',     description:'Funds general operating expenses.',                           status:'ACTIVE', currency:'USD', balance:3555 },
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
export const INITIAL_CASH_TRANSFERS = [
  { ref:'CT-000101', date:'2026-06-25', fromCode:'1020', fromName:'Bank Account (USD)', toCode:'6010', toName:'Loan Release Account', amount:10000, description:'Top up loan release account for June disbursements' },
  { ref:'CT-000102', date:'2026-06-18', fromCode:'1020', fromName:'Bank Account (USD)', toCode:'6020', toName:'Payroll Account',      amount:4500,  description:'Fund June staff payroll' },
  { ref:'CT-000103', date:'2026-06-05', fromCode:'1010', fromName:'Cash on Hand',       toCode:'6030', toName:'Utility Account',      amount:800,   description:'Cover electricity and internet bills' },
  { ref:'CT-000104', date:'2026-05-22', fromCode:'1020', fromName:'Bank Account (USD)', toCode:'1010', toName:'Cash on Hand',         amount:3000,  description:'Replenish branch cash float' },
]

// Ledger postings made by hand, as opposed to the ones the app writes itself on
// disbursement and repayment (those carry entryType 'Loan Disbursement'/'Loan Repayment').
// Journal entries balance across their lines; a single entry has one line and one side.
// Account codes here all exist in INITIAL_CHART_OF_ACCOUNTS above.
export const INITIAL_JOURNAL_ENTRIES = [
  {
    id:'je-000001', entryType:'Journal Entry', date:'2026-06-30', transactionNo:'JE-000001',
    memo:'Monthly loan loss provision — June 2026', amount:12500,
    lines:[
      { accountCode:'1110', debit:0,     credit:12500, memo:'Allowance for loan losses' },
      { accountCode:'6040', debit:12500, credit:0,     memo:'Provision expense' },
    ],
    createdAt:'2026-06-30T09:15:00.000Z',
  },
  {
    id:'je-000002', entryType:'Journal Entry', date:'2026-06-28', transactionNo:'JE-000002',
    memo:'Accrue interest receivable on active loans', amount:3200,
    lines:[
      { accountCode:'1120', debit:3200, credit:0,    memo:'Interest receivable' },
      { accountCode:'5010', debit:0,    credit:3200, memo:'Interest income accrued' },
    ],
    createdAt:'2026-06-28T16:40:00.000Z',
  },
  {
    id:'je-000003', entryType:'Journal Entry', date:'2026-06-15', transactionNo:'JE-000003',
    memo:'Top up cash on hand from ABA USD account', amount:8000,
    lines:[
      { accountCode:'1010', debit:8000, credit:0,    memo:'Cash on hand' },
      { accountCode:'1020', debit:0,    credit:8000, memo:'Bank account (USD)' },
    ],
    createdAt:'2026-06-15T08:05:00.000Z',
  },
  {
    id:'je-000004', entryType:'Journal Entry', date:'2026-05-31', transactionNo:'JE-000004',
    memo:'Transfer retained earnings from May result', amount:15400,
    lines:[
      { accountCode:'3020', debit:0,     credit:15400, memo:'Retained earnings' },
      { accountCode:'5010', debit:15400, credit:0,     memo:'Close revenue to equity' },
    ],
    createdAt:'2026-05-31T17:20:00.000Z',
  },
  {
    id:'single-000001', entryType:'Single Entry', date:'2026-06-27', transactionNo:'SE-000001',
    memo:'Bank charge — June account maintenance', amount:45,
    lines:[{ accountCode:'6040', debit:45, credit:0, memo:'Bank charge — June account maintenance' }],
    createdAt:'2026-06-27T10:30:00.000Z',
  },
  {
    id:'single-000002', entryType:'Single Entry', date:'2026-06-20', transactionNo:'SE-000002',
    memo:'Correct overstated utility accrual', amount:120,
    lines:[{ accountCode:'6030', debit:0, credit:120, memo:'Correct overstated utility accrual' }],
    createdAt:'2026-06-20T14:00:00.000Z',
  },
  {
    id:'single-000003', entryType:'Single Entry', date:'2026-06-08', transactionNo:'SE-000003',
    memo:'Petty cash count adjustment', amount:18,
    lines:[{ accountCode:'1010', debit:0, credit:18, memo:'Petty cash count adjustment' }],
    createdAt:'2026-06-08T11:45:00.000Z',
  },
  {
    id:'single-000004', entryType:'Single Entry', date:'2026-05-18', transactionNo:'SE-000004',
    memo:'Staff advance recovered into payroll account', amount:250,
    lines:[{ accountCode:'6020', debit:250, credit:0, memo:'Staff advance recovered' }],
    createdAt:'2026-05-18T09:00:00.000Z',
  },
]

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

export const INITIAL_SYSTEM_USERS = [
  { username:'admin',    fullName:'System Administrator', role:'Admin',          branch:'Phnom Penh HQ',    department:'IT',          lastLogin:'2026-06-24 08:15', status:'Active',   statusChanged:'2026-01-10' },
  { username:'sreyneang',fullName:'Srey Neang',           role:'Credit Manager', branch:'Phnom Penh HQ',    department:'Credit',      lastLogin:'2026-06-24 07:42', status:'Active',   statusChanged:'2026-03-15' },
  { username:'vuthy',    fullName:'Vuthy Sok',            role:'Credit Officer', branch:'Siem Reap Branch', department:'Operations',   lastLogin:'2026-06-23 17:30', status:'Active',   statusChanged:'2026-02-20' },
  { username:'dara',     fullName:'Dara Kim',             role:'Credit Officer', branch:'Battambang Branch',department:'Operations',   lastLogin:'2026-06-20 09:00', status:'Inactive', statusChanged:'2026-06-18' },
  { username:'chantha',  fullName:'Chantha Meas',         role:'Credit Officer', branch:'Phnom Penh HQ',    department:'Collections',  lastLogin:'2026-06-22 14:22', status:'Locked',   statusChanged:'2026-06-22' },
]

// Payroll staff register — the Employee Information page. A name is stored split into
// family/given in both scripts (Khmer HR forms are filled that way), and phone/email are
// stored in the same pieces the form collects so a saved record round-trips into it
// unchanged.
export const INITIAL_EMPLOYEES = [
  {
    id:'EMP-0001', employeeNo:'20240115_001', photo:'',
    nameKhmer:{ first:'យុវិតា', last:'ចាន់' }, nameEnglish:{ first:'Youvita', last:'Chan' },
    legalIdType:'National ID', legalId:'012345678', gender:'Female', dob:'1994-03-12', nationality:'Cambodian',
    position:'Senior Software Engineer I', salary:1500,
    officeCode:'+855', officeNo:'23900530', mobileCode:'+855', mobileNo:'81386945', emergencyCode:'+855', emergencyNo:'12445566',
    emailLocal:'paochinda79', emailDomain:'gmail.com',
    entryDate:'2024-01-15', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Toul Tumpung 1', village:'Phum 3', house:'12', street:'271' },
  },
  {
    id:'EMP-0002', employeeNo:'20240115_002', photo:'',
    nameKhmer:{ first:'រតនមុនីតា', last:'ជា' }, nameEnglish:{ first:'Ratmonita', last:'Chea' },
    legalIdType:'National ID', legalId:'012987654', gender:'Female', dob:'1996-07-02', nationality:'Cambodian',
    position:'Senior QA Engineer I', salary:1200,
    officeCode:'+855', officeNo:'23900534', mobileCode:'+855', mobileNo:'87322208', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'chea.monita22', emailDomain:'gmail.com',
    entryDate:'2024-01-15', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Prampir Meakkakra', commune:'Veal Vong', village:'Phum 2', house:'45', street:'105' },
  },
  {
    id:'EMP-0003', employeeNo:'20240201_001', photo:'',
    nameKhmer:{ first:'វុទ្ធី', last:'សុខ' }, nameEnglish:{ first:'Vuthy', last:'Sok' },
    legalIdType:'National ID', legalId:'011223344', gender:'Male', dob:'1990-11-23', nationality:'Cambodian',
    position:'Credit Officer', salary:600,
    officeCode:'+855', officeNo:'23900531', mobileCode:'+855', mobileNo:'12778899', emergencyCode:'+855', emergencyNo:'97445511',
    emailLocal:'sok.vuthy', emailDomain:'acabar.com.kh',
    entryDate:'2024-02-01', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Toul Tumpung 2', village:'Phum 4', house:'88', street:'271' },
  },
  {
    id:'EMP-0004', employeeNo:'20240201_002', photo:'',
    nameKhmer:{ first:'ដារា', last:'គីម' }, nameEnglish:{ first:'Dara', last:'Kim' },
    legalIdType:'National ID', legalId:'014556677', gender:'Male', dob:'1988-05-30', nationality:'Cambodian',
    position:'Credit Officer', salary:600,
    officeCode:'+855', officeNo:'', mobileCode:'+855', mobileNo:'92334455', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'kim.dara', emailDomain:'acabar.com.kh',
    entryDate:'2024-02-01', leaveDate:'',
    address:{ province:'Battambang', district:'Battambang', commune:'Svay Por', village:'Phum Romchek', house:'3', street:'5' },
  },
  {
    id:'EMP-0005', employeeNo:'20240304_001', photo:'',
    nameKhmer:{ first:'ចន្ថា', last:'ម៉ាស' }, nameEnglish:{ first:'Chantha', last:'Meas' },
    legalIdType:'National ID', legalId:'015667788', gender:'Female', dob:'1993-09-14', nationality:'Cambodian',
    position:'Collections Officer', salary:550,
    officeCode:'+855', officeNo:'23900532', mobileCode:'+855', mobileNo:'96112233', emergencyCode:'+855', emergencyNo:'11224488',
    emailLocal:'meas.chantha', emailDomain:'acabar.com.kh',
    entryDate:'2024-03-04', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Boeng Keng Kang', commune:'Boeng Keng Kang 1', village:'Phum 2', house:'210', street:'63' },
  },
  {
    id:'EMP-0006', employeeNo:'20240304_002', photo:'',
    nameKhmer:{ first:'ស្រីនាង', last:'នៅ' }, nameEnglish:{ first:'Sreyneang', last:'Nov' },
    legalIdType:'National ID', legalId:'016778899', gender:'Female', dob:'1987-02-08', nationality:'Cambodian',
    position:'Credit Manager', salary:1600,
    officeCode:'+855', officeNo:'23900533', mobileCode:'+855', mobileNo:'77889900', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'nov.sreyneang', emailDomain:'acabar.com.kh',
    entryDate:'2024-03-04', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Tonle Bassac', village:'Phum 3', house:'17', street:'310' },
  },
  {
    id:'EMP-0007', employeeNo:'20240612_001', photo:'',
    nameKhmer:{ first:'ពិសី', last:'ហេង' }, nameEnglish:{ first:'Piseth', last:'Heng' },
    legalIdType:'National ID', legalId:'017889900', gender:'Male', dob:'1995-12-19', nationality:'Cambodian',
    position:'Accountant', salary:800,
    officeCode:'+855', officeNo:'23900535', mobileCode:'+855', mobileNo:'70445566', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'heng.piseth', emailDomain:'acabar.com.kh',
    entryDate:'2024-06-12', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Doun Penh', commune:'Chakto Mukh', village:'Phum 2', house:'9', street:'178' },
  },
  {
    id:'EMP-0008', employeeNo:'20240612_002', photo:'',
    nameKhmer:{ first:'សុភា', last:'លី' }, nameEnglish:{ first:'Sopha', last:'Ly' },
    legalIdType:'Passport', legalId:'N0123456', gender:'Female', dob:'1997-04-25', nationality:'Cambodian',
    position:'HR Officer', salary:650,
    officeCode:'+855', officeNo:'', mobileCode:'+855', mobileNo:'89556677', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'ly.sopha', emailDomain:'acabar.com.kh',
    entryDate:'2024-06-12', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Doun Penh', commune:'Srah Chak', village:'Phum 3', house:'54', street:'51' },
  },
  {
    id:'EMP-0009', employeeNo:'20250109_001', photo:'',
    nameKhmer:{ first:'ចិន្តា', last:'ពៅ' }, nameEnglish:{ first:'Chinda', last:'Pov' },
    legalIdType:'National ID', legalId:'018990011', gender:'Male', dob:'1991-08-03', nationality:'Cambodian',
    position:'IT Support', salary:600,
    officeCode:'+855', officeNo:'23900536', mobileCode:'+855', mobileNo:'16778899', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'pov.chinda', emailDomain:'acabar.com.kh',
    entryDate:'2025-01-09', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Tuol Kouk', commune:'Phsar Depou 2', village:'Phum 4', house:'101', street:'217' },
  },
  {
    id:'EMP-0010', employeeNo:'20250109_002', photo:'',
    nameKhmer:{ first:'ណារី', last:'សេង' }, nameEnglish:{ first:'Nary', last:'Seng' },
    legalIdType:'National ID', legalId:'019001122', gender:'Female', dob:'1998-10-11', nationality:'Cambodian',
    position:'Teller', salary:450,
    officeCode:'+855', officeNo:'', mobileCode:'+855', mobileNo:'93221144', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'seng.nary', emailDomain:'acabar.com.kh',
    entryDate:'2025-01-09', leaveDate:'',
    address:{ province:'Siem Reap', district:'Siem Reap', commune:'Svay Dangkum', village:'Phum Wat Bo', house:'7', street:'6' },
  },
  {
    id:'EMP-0011', employeeNo:'20250203_001', photo:'',
    nameKhmer:{ first:'សម្បត្តិ', last:'ជឿន' }, nameEnglish:{ first:'Sambath', last:'Chhoeun' },
    legalIdType:'National ID', legalId:'020112233', gender:'Male', dob:'1986-01-27', nationality:'Cambodian',
    position:'Branch Manager', salary:1400,
    officeCode:'+855', officeNo:'63900540', mobileCode:'+855', mobileNo:'12009988', emergencyCode:'+855', emergencyNo:'88001122',
    emailLocal:'chhoeun.sambath', emailDomain:'acabar.com.kh',
    entryDate:'2025-02-03', leaveDate:'',
    address:{ province:'Siem Reap', district:'Siem Reap', commune:'Sala Kamraeuk', village:'Phum Wat Bo', house:'22', street:'' },
  },
  {
    id:'EMP-0012', employeeNo:'20250203_002', photo:'',
    nameKhmer:{ first:'សុគន្ធា', last:'ទូច' }, nameEnglish:{ first:'Sokuntha', last:'Touch' },
    legalIdType:'National ID', legalId:'021223344', gender:'Female', dob:'1999-06-16', nationality:'Cambodian',
    position:'Teller', salary:450,
    officeCode:'+855', officeNo:'', mobileCode:'+855', mobileNo:'98334455', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'touch.sokuntha', emailDomain:'acabar.com.kh',
    entryDate:'2025-02-03', leaveDate:'',
    address:{ province:'Battambang', district:'Battambang', commune:'Ratanak', village:'Phum Ou Char', house:'3A', street:'2' },
  },
  {
    id:'EMP-0013', employeeNo:'20250715_001', photo:'',
    nameKhmer:{ first:'វិចិត្រ', last:'អ៊ុក' }, nameEnglish:{ first:'Vichet', last:'Ouk' },
    legalIdType:'National ID', legalId:'022334455', gender:'Male', dob:'1992-03-05', nationality:'Cambodian',
    position:'Loan Recovery Officer', salary:600,
    officeCode:'+855', officeNo:'23900537', mobileCode:'+855', mobileNo:'10556677', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'ouk.vichet', emailDomain:'acabar.com.kh',
    entryDate:'2025-07-15', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Mean Chey', commune:'Stung Meanchey 1', village:'Phum 4', house:'66', street:'371' },
  },
  {
    id:'EMP-0014', employeeNo:'20250715_002', photo:'',
    nameKhmer:{ first:'ស្រីមុំ', last:'ម៉ៅ' }, nameEnglish:{ first:'Sreymom', last:'Mao' },
    legalIdType:'National ID', legalId:'023445566', gender:'Female', dob:'2000-12-01', nationality:'Cambodian',
    position:'Administrative Assistant', salary:400,
    officeCode:'+855', officeNo:'', mobileCode:'+855', mobileNo:'15667788', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'mao.sreymom', emailDomain:'acabar.com.kh',
    entryDate:'2025-07-15', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Doun Penh', commune:'Wat Phnom', village:'Phum 2', house:'12', street:'154' },
  },
  {
    id:'EMP-0015', employeeNo:'20260112_001', photo:'',
    nameKhmer:{ first:'ធារ៉ា', last:'យិន' }, nameEnglish:{ first:'Theara', last:'Yin' },
    legalIdType:'National ID', legalId:'024556677', gender:'Male', dob:'1994-09-09', nationality:'Cambodian',
    position:'Risk Analyst', salary:900,
    officeCode:'+855', officeNo:'23900538', mobileCode:'+855', mobileNo:'11778899', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'yin.theara', emailDomain:'acabar.com.kh',
    entryDate:'2026-01-12', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Chamkar Mon', commune:'Olympic', village:'Phum 3', house:'5', street:'288' },
  },
  {
    id:'EMP-0016', employeeNo:'20260112_002', photo:'',
    nameKhmer:{ first:'បុប្ផា', last:'ខៀវ' }, nameEnglish:{ first:'Bopha', last:'Khiev' },
    legalIdType:'National ID', legalId:'025667788', gender:'Female', dob:'1996-02-21', nationality:'Cambodian',
    position:'Compliance Officer', salary:850,
    officeCode:'+855', officeNo:'23900539', mobileCode:'+855', mobileNo:'17889900', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'khiev.bopha', emailDomain:'acabar.com.kh',
    entryDate:'2026-01-12', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Prampir Meakkakra', commune:'Mittapheap', village:'Phum 2', house:'90', street:'128' },
  },
  {
    id:'EMP-0017', employeeNo:'20260302_001', photo:'',
    nameKhmer:{ first:'សុវណ្ណ', last:'ណុប' }, nameEnglish:{ first:'Sovann', last:'Nop' },
    legalIdType:'National ID', legalId:'026778899', gender:'Male', dob:'1989-07-18', nationality:'Cambodian',
    position:'Driver', salary:300,
    officeCode:'+855', officeNo:'', mobileCode:'+855', mobileNo:'88990011', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'nop.sovann', emailDomain:'acabar.com.kh',
    entryDate:'2026-03-02', leaveDate:'',
    address:{ province:'Phnom Penh', district:'Boeng Keng Kang', commune:'Boeng Keng Kang 3', village:'Phum 2', house:'31', street:'99' },
  },
  {
    id:'EMP-0018', employeeNo:'20260302_002', photo:'',
    nameKhmer:{ first:'សិរីមន្ត', last:'វង្ស' }, nameEnglish:{ first:'Sereymon', last:'Vong' },
    legalIdType:'National ID', legalId:'027889900', gender:'Male', dob:'1985-04-04', nationality:'Cambodian',
    position:'Security Guard', salary:280,
    officeCode:'+855', officeNo:'', mobileCode:'+855', mobileNo:'69112233', emergencyCode:'+855', emergencyNo:'',
    emailLocal:'vong.sereymon', emailDomain:'acabar.com.kh',
    entryDate:'2026-03-02', leaveDate:'2026-06-30',
    address:{ province:'Phnom Penh', district:'Tuol Kouk', commune:'Boeng Kak 1', village:'Phum 5', house:'14', street:'60' },
  },
]

// ─── third-party integrations ────────────────────────────────────────────────
// One record per external system the loan book exchanges data with. `scopes` is what
// that connection is allowed to move, each toggleable on its own, and `logs` is the
// newest-first exchange history the Activity Log tab reads (see ADD_INTEGRATION_LOG,
// which caps it). Credentials are demo values — nothing here reaches a real endpoint.
export const INITIAL_INTEGRATIONS = [
  {
    id: 'webill365',
    name: 'WeBill365',
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
    // Every provider ships unconnected: the install registers or signs in on Configure,
    // then saves the credentials the provider issued it. No `login` here means the sign-in
    // gate opens on the register form.
    status: 'disconnected',
    environment: 'sandbox',
    baseUrl: 'https://sandbox.webill365.com/v1',
    apiKey: '',
    autoSync: false,
    syncEvery: 30,
    lastSyncAt: '',
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

export const INITIAL_AUDIT_LOGS = [
  { timestamp:'2026-06-24 08:15:32', user:'admin',      action:'Login successful',                          module:'Authentication',  ip:'192.168.1.10' },
  { timestamp:'2026-06-24 07:42:18', user:'sreyneang',  action:'Approved loan AC-L-0892',                   module:'Loan Management', ip:'192.168.1.25' },
  { timestamp:'2026-06-23 16:55:04', user:'admin',      action:'Updated role permissions for Credit Officer', module:'User Management', ip:'192.168.1.10' },
  { timestamp:'2026-06-23 14:30:11', user:'vuthy',      action:'Registered customer 000006',            module:'Customers',       ip:'10.0.2.45' },
  { timestamp:'2026-06-22 18:00:00', user:'system',     action:'EOD batch completed',                       module:'Periodic',        ip:'127.0.0.1' },
  { timestamp:'2026-06-22 14:22:55', user:'chantha',    action:'Account locked after 5 failed logins',      module:'Authentication',  ip:'192.168.1.88' },
]

export const INITIAL_PERMISSION_LABELS = {
  add_customer:      'Create Customer',
  open_loan:         'Open Loan & Submit',
  review_loan:       'Review, Confirm & Approve/Reject Loan',
  disburse_loan:     'Disburse Loan',
  manage_accounting: 'Manage Income & Expense',
  write_off:         'Write Off Loan',
  run_operations:    'Run EOD/EOM Operations',
  view_accounting:   'View Accounting Module',
}

export const INITIAL_ROLE_MATRIX = {
  'Admin':          { add_customer:true,  open_loan:true,  review_loan:true,  disburse_loan:true,  manage_accounting:true,  write_off:true,  run_operations:true,  view_accounting:true  },
  'Credit Officer': { add_customer:true,  open_loan:true,  review_loan:false, disburse_loan:false, manage_accounting:false, write_off:false, run_operations:false, view_accounting:false },
  'Credit Manager': { add_customer:false, open_loan:false, review_loan:true,  disburse_loan:false, manage_accounting:false, write_off:true,  run_operations:true,  view_accounting:true  },
  'Accountant':     { add_customer:false, open_loan:false, review_loan:false, disburse_loan:true,  manage_accounting:true,  write_off:false, run_operations:true,  view_accounting:true  },
}
