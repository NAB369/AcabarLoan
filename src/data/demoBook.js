import { buildAmortizationData, toISODate } from '../utils/format'
import {
  employeeDeduction, employeeGross, employeeName, employeeNetSalary,
  isOnPayroll, nextEmployeeNo, periodBounds, periodLabel,
} from '../utils/employee'

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

// The same idea as monthsBack for a whole period: 'YYYY-MM', which is the shape a payroll
// run stores its period in.
function monthKeyBack(months) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Where payroll is paid from. Modelled as a GL account money leaves (see the chart of
// accounts), which is why the float below has to be funded before a run can be approved.
const PAYROLL_GL_CODE = '6020'

// Which period the seeded payroll run covers. Last month rather than this one: a run is made
// once the month it pays has closed.
const PAYROLL_PERIOD_MONTHS_BACK = 1

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
  {
    // The borrower behind the written-off loan below. A book where nothing has ever gone bad
    // cannot show write-off, recovery, or the Write-Off / Recovery report — three of the
    // states a credit manager spends the most time in.
    khName: 'ទេព សំណាង', enName: 'TEP SAMNANG', gender: 'Male', maritalStatus: 'Married',
    dob: '1979-04-22', idNo: '010479145', phone: '092 640 317', email: 'tep.samnang@example.com',
    occupation: 'Market Vendor', employmentStatus: 'Self-Employed', monthlyIncome: '540',
    accountNumber: '000 111 640 317', address: 1,
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
    // Cash routing is currency-aware (fundingGLCode picks 1021 for a riel loan, and a cash
    // collection lands in the riel till), and repayment income now follows the loan's currency
    // too — interest to 5010/5011, penalties to 5040/5041. The loan *control* accounts still
    // do not: DISBURSE_LOAN and RECORD_REPAYMENT post principal to AR_LOAN_CODE '1130' and
    // approvals to '2030' whatever the currency, even though the chart carries 1131 for the
    // riel receivable. A disbursed riel loan would therefore add 20,000,000 to the same balance
    // holding dollars, and Account Receivable would read as a number in no currency at all.
    // That is a reducer defect, not a seeding one, and fixing it is an accounting change with a
    // migration behind it (both sides of the payable/receivable pair have to move together) —
    // so the demo book shows riel origination without walking into it. Once the control
    // accounts are routed by currency this can carry `stage: 'active'`.
    customer: 2, product: 'SME Loan', rate: 12, currency: 'KHR', amount: 20000000,
    installments: 12, firstInstallmentMonthsBack: -1, officer: 'Meas Bopha', stage: 'reviewed',
  },
  {
    customer: 5, product: 'Personal Loan', rate: 15, currency: 'USD', amount: 1500,
    installments: 6, firstInstallmentMonthsBack: -1, officer: 'Meas Bopha', stage: 'submitted',
  },
  {
    // Walked all the way through and then off the book. `writeOff` runs after the collections:
    // WRITE_OFF_LOAN clears the receivable against the allowance and the provision expense, and
    // RECORD_RECOVERY books what came back afterwards against recovery income. Both post
    // balanced entries of their own, so the closed loan costs the ledger nothing in accuracy.
    customer: 6, product: 'Personal Loan', rate: 15, currency: 'USD', amount: 3000,
    installments: 6, firstInstallmentMonthsBack: 5, officer: 'Meas Bopha', stage: 'active', paid: 1,
    writeOff: { reason: 'Borrower left the province, unreachable for 90 days', recover: 400 },
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
  {
    // Payroll is paid out of 6020, and APPROVE_EXPENSE refuses a run the account cannot cover
    // rather than clamping it to zero. Funding the float here is what lets the seeded run below
    // actually be approved in a demo, instead of being refused for want of money.
    glCode: PAYROLL_GL_CODE, counterCode: '1020', amount: 5000, currency: 'USD',
    memo: 'Payroll float funded from the operating bank account (USD)',
  },
]

// The branch's own staff. Payroll runs from whoever is on this register, so an empty register
// leaves the whole module with nothing to show. The two credit officers are the same two named
// on the loans above, so the staff list and the loan book agree with each other.
const EMPLOYEES = [
  { first:'Sok',    last:'Veasna', khFirst:'សុខ',  khLast:'វាសនា',   position:'Branch Manager',  salary:1200, deduction:60,   gender:'Male',   dob:'1980-06-11', legalId:'010480226', mobileNo:'012 700 118', accountNumber:'000 333 700 118', entryMonthsBack:26, address:0 },
  { first:'Pich',   last:'Rithy',  khFirst:'ពេជ្រ', khLast:'ឫទ្ធី',    position:'Accountant',      salary:850,  deduction:42.5, gender:'Male',   dob:'1986-02-19', legalId:'010486703', mobileNo:'077 415 260', accountNumber:'000 333 415 260', entryMonthsBack:22, address:1 },
  { first:'Chea',   last:'Sokun',  khFirst:'ជា',   khLast:'សុគន្ធ',    position:'Credit Officer',  salary:650,  deduction:32.5, gender:'Male',   dob:'1991-08-05', legalId:'010491338', mobileNo:'016 823 907', accountNumber:'000 333 823 907', entryMonthsBack:18, address:2 },
  { first:'Meas',   last:'Bopha',  khFirst:'មាស',  khLast:'បុប្ផា',    position:'Credit Officer',  salary:650,  deduction:32.5, gender:'Female', dob:'1993-12-01', legalId:'010493812', mobileNo:'088 340 175', accountNumber:'000 333 340 175', entryMonthsBack:14, address:3 },
  { first:'Chhoun', last:'Maly',   khFirst:'ឆួន',  khLast:'ម៉ាលី',     position:'Teller',          salary:480,  deduction:24,   gender:'Female', dob:'1997-03-27', legalId:'010497459', mobileNo:'071 962 508', accountNumber:'000 333 962 508', entryMonthsBack:9,  address:4 },
]

// What it costs to keep the branch open, over the last three months so the dashboard's income
// and expense trend has more than one point to draw. Every one is paid out of the operating bank
// account, which is how the expense form fills that field in — the category is what says where
// the cost belongs, not the account the money left from.
const OPERATING_EXPENSES = [
  { monthsBack:2, day:3,  code:'EXP-001', category:'Office Administration', amount:850,   account:'1020', description:'Branch office rent' },
  { monthsBack:2, day:8,  code:'EXP-002', category:'Operating',             amount:142.5, account:'1020', description:'Electricity — branch' },
  { monthsBack:1, day:3,  code:'EXP-003', category:'Office Administration', amount:850,   account:'1020', description:'Branch office rent' },
  { monthsBack:1, day:9,  code:'EXP-004', category:'Operating',             amount:96.75, account:'1020', description:'Fuel — field collection' },
  { monthsBack:1, day:24, code:'EXP-005', category:'Office Administration', amount:63.4,  account:'1020', description:'Stationery and printing' },
  { monthsBack:0, day:3,  code:'EXP-006', category:'Office Administration', amount:850,   account:'1020', description:'Branch office rent' },
  { monthsBack:0, day:6,  code:'EXP-007', category:'Tax & Regulation',      amount:210,   account:'1020', description:'Quarterly patent tax instalment' },
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
    const { emi, rows } = buildAmortizationData(l.amount, l.rate, l.installments, first, 0, disbursed, l.currency)

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
      // Off the book, and then what came back afterwards. Both read the loan by ref rather than
      // through activeLoan, so they sit here rather than needing the overview left open.
      if (l.writeOff) {
        run({
          type: 'WRITE_OFF_LOAN',
          ref, reason: l.writeOff.reason, by: 'Credit Manager', date: monthsBack(1, 20),
        })
        if (l.writeOff.recover) {
          run({
            type: 'RECORD_RECOVERY',
            // glCode is stated rather than left to default: without it the recovery routes to
            // the branch bank account, which would read as a cash collection sitting in the bank.
            ref, amount: l.writeOff.recover, date: monthsBack(0, 8), method: 'Cash', glCode: '1010',
            memo: 'Partial recovery collected at the branch',
          })
        }
      }
    }
    run({ type: 'CLOSE_LOAN_OVERVIEW' })
  })

  // Staff register. Employee numbers run per entry date, so each is read off the register as it
  // stands rather than assumed — the same way the employee form issues one.
  EMPLOYEES.forEach((e, i) => {
    const entryDate = monthsBack(e.entryMonthsBack, 1)
    const employee = {
      id: `EMP-DEMO-${i + 1}`,
      employeeNo: nextEmployeeNo(state.employees, entryDate),
      photo: '',
      nameEnglish: { first: e.first, last: e.last },
      nameKhmer: { first: e.khFirst, last: e.khLast },
      legalIdType: 'National ID', legalId: e.legalId,
      gender: e.gender, dob: e.dob, nationality: 'Cambodian',
      position: e.position,
      salary: e.salary, deduction: e.deduction,
      accountNumber: e.accountNumber,
      officeCode: '+855', officeNo: '',
      mobileCode: '+855', mobileNo: e.mobileNo,
      emergencyCode: '+855', emergencyNo: '',
      emailLocal: `${e.first}.${e.last}`.toLowerCase(), emailDomain: 'example.com',
      entryDate, leaveDate: '',
      address: ADDRESSES[e.address],
    }
    run({ type: 'ADD_EMPLOYEE', employee })
    run({
      type: 'ADD_AUDIT_LOG',
      log: {
        module: 'Payroll',
        action: `Employee added — ${employeeName(employee)} · ${employee.position}`,
        reference: employee.employeeNo,
        amount: employee.salary,
        user: 'Admin',
      },
    })
  })

  // Running costs, and one payroll period below. Both go in as expenses, which ADD_EXPENSE files
  // as 'Pending Approval' — it records the commitment and moves no money until someone approves
  // it. That is what makes them safe to seed and useful to demonstrate at the same time: the
  // ledger is left exactly as the loan book made it, and the approval queue has real work in it.
  OPERATING_EXPENSES.forEach(e => {
    run({
      type: 'ADD_EXPENSE',
      entry: {
        code: e.code, category: e.category, amount: e.amount,
        date: monthsBack(e.monthsBack, e.day),
        description: e.description, account: e.account,
      },
    })
  })

  // Payroll for last month, left awaiting approval. Making a run and releasing it are two
  // decisions by two people, so seeding it un-approved is what lets a demo show the second one
  // happen rather than describe it. Every figure comes from the app's own payroll helpers, so a
  // run seeded here cannot disagree with what the payroll screen would have worked out.
  const period = monthKeyBack(PAYROLL_PERIOD_MONTHS_BACK)
  const { start: periodStart, end: periodEnd } = periodBounds(period)
  const onPayroll = state.employees.filter(e => isOnPayroll(e, periodStart, periodEnd) && employeeNetSalary(e) > 0)
  if (onPayroll.length) {
    const payrollCode = `PR-${period.replace('-', '')}`
    const payrollTotal = Math.round(onPayroll.reduce((sum, e) => sum + employeeNetSalary(e), 0) * 100) / 100
    run({
      type: 'ADD_PAYROLL_RUN',
      run: {
        code: payrollCode, period, date: periodEnd, total: payrollTotal, account: PAYROLL_GL_CODE,
        createdBy: 'Accountant',
        createdAt: new Date(`${periodEnd}T16:40:00`).toLocaleString('en-GB'),
        lines: onPayroll.map(e => ({
          employeeId: e.id, employeeNo: e.employeeNo, name: employeeName(e), position: e.position || '',
          gross: employeeGross(e), deduction: employeeDeduction(e), amount: employeeNetSalary(e),
        })),
      },
    })
    run({
      type: 'ADD_EXPENSE',
      entry: {
        code: payrollCode, category: 'Employment Salaries', amount: payrollTotal, date: periodEnd,
        description: `Staff payroll — ${periodLabel(period)} · ${onPayroll.length} employee${onPayroll.length === 1 ? '' : 's'}`,
        account: PAYROLL_GL_CODE,
      },
    })
  }

  return { ...state, demoSeeded: true }
}
