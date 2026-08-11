import { buildAmortizationData, toISODate } from '../utils/format'

// A small worked book — customers, loans at every stage, and the ledger behind them — so a
// fresh install has something to demonstrate instead of six empty registers.
//
// It is NOT written out as static arrays. Loans, journal entries and chart-of-account
// balances have to agree with each other, and three hand-authored arrays that must stay in
// double-entry balance are three things to get wrong. Instead the book is *replayed*: the
// same actions an operator's clicks dispatch are folded through the real reducer, in order.
// The demo ledger is therefore produced by exactly the code that produces a real one, and
// cannot drift from it — if disbursement's posting changes tomorrow, this changes with it.
//
// Everything here is invented. Names, ID numbers, phone numbers and addresses are made up;
// the addresses use real Cambodian province/district/commune names so the geo dropdowns
// resolve, but no real person is described.

// Dates are relative to whenever the app is first opened, so the book always reads as a
// branch mid-year rather than one frozen on the day this file was written. Built from
// calendar parts (not month arithmetic on a Date) so a seed run on the 31st doesn't skid
// into the following month.
function monthsBack(months, day) {
  const now = new Date()
  return toISODate(new Date(now.getFullYear(), now.getMonth() - months, day))
}

const ADDRESSES = [
  { house: '24A', street: '271', village: 'Phum 3', commune: 'Toul Tumpung 1', district: 'Chamkar Mon', province: 'Phnom Penh' },
  { house: '112', street: '154', village: 'Phum 2', commune: 'Srah Chak', district: 'Doun Penh', province: 'Phnom Penh' },
  { house: '7',   street: '598', village: 'Phum 1', commune: 'Boeng Keng Kang 1', district: 'Boeng Keng Kang', province: 'Phnom Penh' },
  { house: '38B', street: '105', village: 'Phum 4', commune: 'Tonle Bassac', district: 'Chamkar Mon', province: 'Phnom Penh' },
  { house: '201', street: '371', village: 'Phum 1', commune: 'Chakto Mukh', district: 'Doun Penh', province: 'Phnom Penh' },
  { house: '56',  street: '217', village: 'Phum 2', commune: 'Olympic', district: 'Chamkar Mon', province: 'Phnom Penh' },
]

const CUSTOMERS = [
  {
    khName: 'សុខ តារា', enName: 'SOK DARA', gender: 'Male', maritalStatus: 'Married',
    dob: '1985-03-14', idNo: '010485321', phone: '012 884 210', email: 'sok.dara@example.com',
    occupation: 'Business Owner', employmentStatus: 'Self-Employed', monthlyIncome: '1800',
    accountNumber: '000 111 884 210', address: 0,
  },
  {
    khName: 'ចាន់ សុភា', enName: 'CHAN SOPHEA', gender: 'Female', maritalStatus: 'Married',
    dob: '1990-07-02', idNo: '010490117', phone: '011 402 668', email: 'chan.sophea@example.com',
    occupation: 'Farmer', employmentStatus: 'Self-Employed', monthlyIncome: '950',
    accountNumber: '000 111 402 668', address: 1,
  },
  {
    khName: 'គីម វិជ្ជា', enName: 'KIM VICHEA', gender: 'Male', maritalStatus: 'Single',
    dob: '1988-11-25', idNo: '010488904', phone: '017 336 921', email: 'kim.vichea@example.com',
    occupation: 'Mechanic', employmentStatus: 'Self-Employed', monthlyIncome: '1250',
    accountNumber: '000 111 336 921', address: 2,
  },
  {
    khName: 'លី ស្រីពៅ', enName: 'LY SREYPOV', gender: 'Female', maritalStatus: 'Single',
    dob: '1994-05-09', idNo: '010494552', phone: '096 771 405', email: 'ly.sreypov@example.com',
    occupation: 'Garment Factory Worker', employmentStatus: 'Employed', monthlyIncome: '620',
    accountNumber: '000 111 771 405', address: 3,
  },
  {
    khName: 'នូ ពិសិដ្ឋ', enName: 'NOU PISETH', gender: 'Male', maritalStatus: 'Married',
    dob: '1982-01-30', idNo: '010482078', phone: '015 209 833', email: 'nou.piseth@example.com',
    occupation: 'Government Officer', employmentStatus: 'Employed', monthlyIncome: '2100',
    accountNumber: '000 111 209 833', address: 4,
  },
  {
    // Deliberately has no disbursement account on file: this is what the derived 'Incomplete'
    // customer status is for, and why the loan below it cannot be released yet. A demo book
    // where every record is in good order never shows the states staff actually chase.
    khName: 'ហេង ចន្ថា', enName: 'HENG CHANTHA', gender: 'Female', maritalStatus: 'Single',
    dob: '1996-09-18', idNo: '010496631', phone: '070 158 447', email: 'heng.chantha@example.com',
    occupation: 'Hairdresser', employmentStatus: 'Self-Employed', monthlyIncome: '430',
    accountNumber: '', address: 5,
  },
]

// `stage` is how far each loan is walked: 'submitted' stops at In Progress, 'reviewed' at
// Pending Approval, 'approved' at Waiting Disburse (which recognises the payable), and
// 'active' disburses and then collects `paid` installments. Between them the six cover every
// status a loan register shows, in both currencies.
const LOANS = [
  {
    customer: 0, product: 'Business Loan', rate: 12, currency: 'USD', amount: 12000,
    installments: 12, firstInstallmentMonthsBack: 4, officer: 'Chea Sokun', stage: 'active', paid: 3,
  },
  {
    customer: 1, product: 'Agricultural Loan', rate: 10, currency: 'USD', amount: 6500,
    installments: 12, firstInstallmentMonthsBack: 2, officer: 'Chea Sokun', stage: 'active', paid: 2,
  },
  {
    customer: 3, product: 'Personal Loan', rate: 15, currency: 'USD', amount: 4000,
    installments: 10, firstInstallmentMonthsBack: -1, officer: 'Meas Bopha', stage: 'approved',
  },
  {
    customer: 4, product: 'Housing Loan', rate: 10, currency: 'USD', amount: 25000,
    installments: 24, firstInstallmentMonthsBack: -1, officer: 'Chea Sokun', stage: 'reviewed',
  },
  {
    // The riel side of the register, and deliberately stopped before disbursement.
    //
    // Cash routing is currency-aware (fundingGLCode picks 1021 for a riel loan), but the loan
    // control accounts are not: DISBURSE_LOAN and RECORD_REPAYMENT post to AR_LOAN_CODE '1130'
    // and income to '5010' whatever the loan's currency, even though the chart carries 1131
    // and 5021 for the riel side. A disbursed riel loan therefore adds 20,000,000 to the same
    // balance holding dollars, and Account Receivable reads as a number in no currency at all.
    // That is a reducer defect, not a seeding one, and fixing it is an accounting change with
    // a migration behind it — so the demo book shows riel origination without walking into it.
    // Once the control accounts are routed by currency this can carry `stage: 'active'`.
    customer: 2, product: 'SME Loan', rate: 12, currency: 'KHR', amount: 20000000,
    installments: 12, firstInstallmentMonthsBack: -1, officer: 'Meas Bopha', stage: 'reviewed',
  },
  {
    customer: 5, product: 'Personal Loan', rate: 15, currency: 'USD', amount: 1500,
    installments: 6, firstInstallmentMonthsBack: -1, officer: 'Meas Bopha', stage: 'submitted',
  },
]

// Enough on each bank account to cover what the book disburses. Without this the branch
// starts with nothing and DISBURSE_LOAN floors the funding balance at zero — the loans would
// still look disbursed while the bank they came from never moved.
const CAPITAL = [
  {
    glCode: '1020', counterCode: '3010', amount: 150000, currency: 'USD',
    memo: 'Opening share capital — branch working funds (USD)',
  },
  {
    // Riel working funds come in as a borrowing rather than more share capital: Share Capital
    // is a USD account, and crediting riel into it would leave one balance holding two
    // currencies — the very thing that keeps the riel loan above out of the ledger.
    glCode: '1021', counterCode: '2020', amount: 40000000, currency: 'KHR',
    memo: 'Opening credit line drawn against the riel book (KHR)',
  },
]

function nextNumericCode(existing, width) {
  const max = existing.reduce((top, value) => {
    const n = parseInt(String(value).replace(/\D/g, ''), 10)
    return Number.isFinite(n) ? Math.max(top, n) : top
  }, 0)
  return i => String(max + 1 + i).padStart(width, '0')
}

// Folds the demo actions through `reducer` and returns the state they produce. The reducer is
// passed in rather than imported because it isn't exported — and shouldn't be, since nothing
// outside AppContext has any business dispatching straight into it.
export function seedDemoBook(baseState, reducer) {
  let state = baseState
  const run = action => { state = reducer(state, action) }
  const loanOf = ref => state.loanApplications.find(l => l.ref === ref)

  // Codes continue from whatever the install already holds. An install that has registered
  // its own customers must not have one of them overwritten by a demo record landing on the
  // same code — SUBMIT_LOAN in particular replaces on a matching ref rather than refusing.
  const customerCode = nextNumericCode(baseState.customers.map(c => c.code), 6)
  const loanNumber = nextNumericCode(baseState.loanApplications.map(l => l.ref), 6)

  CUSTOMERS.forEach((c, i) => {
    run({
      type: 'ADD_CUSTOMER',
      customer: {
        code: customerCode(i),
        khName: c.khName, enName: c.enName, gender: c.gender, maritalStatus: c.maritalStatus,
        dob: c.dob, idType: 'National ID', idNo: c.idNo, phone: c.phone, email: c.email,
        currentAddress: ADDRESSES[c.address], permanentAddress: ADDRESSES[c.address],
        occupation: c.occupation, employmentStatus: c.employmentStatus, monthlyIncome: c.monthlyIncome,
        documents: [],
        accountNumber: c.accountNumber,
        createdAt: new Date(`${monthsBack(6, 12)}T09:00:00`).toISOString(),
      },
    })
  })

  CAPITAL.forEach((c, i) => {
    run({
      type: 'ADD_JOURNAL_ENTRY',
      entry: {
        id: `demo-capital-${i + 1}`,
        entryType: 'Journal Entry',
        date: monthsBack(6, 1),
        transactionNo: `JE-DEMO-${String(i + 1).padStart(3, '0')}`,
        memo: c.memo,
        amount: c.amount,
        currency: c.currency,
        lines: [
          { accountCode: c.glCode, debit: c.amount, credit: 0, memo: c.memo },
          { accountCode: c.counterCode, debit: 0, credit: c.amount, memo: c.memo },
        ],
        createdAt: new Date(`${monthsBack(6, 1)}T09:00:00`).toISOString(),
      },
    })
  })

  LOANS.forEach((l, i) => {
    const ref = `AC-L-${loanNumber(i)}`
    const customer = state.customers.find(c => c.code === customerCode(l.customer))
    const first = monthsBack(l.firstInstallmentMonthsBack, 5)
    const disbursed = monthsBack(l.firstInstallmentMonthsBack + 1, 5)
    const { emi, rows } = buildAmortizationData(l.amount, l.rate, l.installments, first)

    run({
      type: 'SUBMIT_LOAN',
      loan: {
        ref,
        customerCode: customer.code,
        customerName: customer.enName,
        customerKhName: customer.khName,
        customerGender: customer.gender,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        product: l.product,
        currency: l.currency,
        amount: l.amount,
        disbursementDate: disbursed,
        repaymentType: 'Monthly',
        firstInstallment: first,
        installments: l.installments,
        interestRate: l.rate,
        penaltyRate: 2,
        creditOfficer: l.officer,
        loanCycle: 1,
        branch: 'Phnom Penh HQ',
        coBorrowers: [],
        guarantors: [],
        collateral: null,
        emi,
        schedule: rows,
        status: 'In Progress',
        submittedAt: new Date(`${monthsBack(l.firstInstallmentMonthsBack + 2, 8)}T10:30:00`).toISOString(),
        approvalState: 1,
        approvalHistory: [
          { stage: 1, action: 'Application submitted', user: 'Admin', timestamp: new Date(`${monthsBack(l.firstInstallmentMonthsBack + 2, 8)}T10:30:00`).toLocaleString('en-GB') },
        ],
      },
    })

    if (l.stage === 'submitted') return

    // ADVANCE_APPROVAL, DISBURSE_LOAN and RECORD_REPAYMENT all read state.activeLoan, so the
    // loan is opened the way the loan overview screen opens it and closed again at the end —
    // otherwise the app would boot straight into a loan detail page.
    run({ type: 'OPEN_LOAN_OVERVIEW', loan: loanOf(ref) })
    run({ type: 'ADVANCE_APPROVAL' })                       // → Pending Approval
    if (l.stage !== 'reviewed') run({ type: 'ADVANCE_APPROVAL' })  // → Waiting Disburse, credits the payable

    if (l.stage === 'active') {
      run({ type: 'DISBURSE_LOAN', remarks: 'Released to borrower’s account' })
      for (let n = 0; n < (l.paid || 0); n++) {
        const row = loanOf(ref).schedule[n]
        run({
          type: 'RECORD_REPAYMENT',
          idx: n,
          date: row.dueDateISO,
          paymentMethod: n % 2 === 0 ? 'Cash' : 'Bank Transfer',
          memo: `Installment #${row.num} collected`,
        })
      }
    }
    run({ type: 'CLOSE_LOAN_OVERVIEW' })
  })

  return { ...state, demoSeeded: true }
}
