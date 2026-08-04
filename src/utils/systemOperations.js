import { toISODate, daysBetweenISO } from './format'

// System Operations — the maths behind the Start of Day / End of Day / End of Month
// batches. Everything here is pure and reads state without changing it, so the modal can
// show the operator exactly what a batch will post *before* they commit to it, and the
// reducer posts that same computed payload. Preview and posting can't drift apart because
// they are the same numbers.

export const SOD = 'SOD'
export const EOD = 'EOD'
export const EOM = 'EOM'

// Postings are routed by the loan's own currency, the same rule cash movements follow —
// a riel loan's accrual belongs on the riel accounts, never the dollar ones.
const ACCRUAL_GL = {
  USD: { receivable: '1120', income: '5020' },
  KHR: { receivable: '1121', income: '5021' },
}
const PROVISION_GL = {
  USD: { allowance: '1132', expense: '6050' },
  KHR: { allowance: '1133', expense: '6051' },
}

// Interest is recognised on a 365-day basis — one day's worth per End of Day run.
const DAYS_IN_YEAR = 365

// NBC-style portfolio-at-risk bands. A loan's band comes from the age of its oldest
// unsettled installment, and the band's rate is the share of that loan's outstanding
// principal the allowance has to carry.
export const PAR_BANDS = [
  { id: 'current', label: 'Current',    min: 0,  max: 0,        rate: 1 },
  { id: 'par30',   label: 'PAR 1–30',   min: 1,  max: 30,       rate: 5 },
  { id: 'par60',   label: 'PAR 31–60',  min: 31, max: 60,       rate: 25 },
  { id: 'par90',   label: 'PAR 61–90',  min: 61, max: 90,       rate: 50 },
  { id: 'par90p',  label: 'PAR 90+',    min: 91, max: Infinity, rate: 100 },
]

const round2 = n => Math.round(n * 100) / 100

export function todayISO() {
  return toISODate(new Date())
}

export function monthKey(iso) {
  return (iso || '').slice(0, 7)
}

// Paid and Partial both count as settled — a partial payment leaves a principal remainder
// that RECORD_REPAYMENT already rolled onto the next installment, so the row itself is done.
function isSettled(row) {
  return row.status === 'Paid' || row.status === 'Partial'
}

function activeLoans(state) {
  return (state.loanApplications || []).filter(l => l.status === 'Active' && Array.isArray(l.schedule))
}

// Principal still out with the borrower: the balance left by the most recent settled
// installment, or the full amount if nothing has been collected yet. Same derivation
// RECORD_REPAYMENT uses for `balanceBefore`, so the two never disagree.
export function loanOutstanding(loan) {
  const schedule = loan.schedule || []
  let lastSettled = -1
  for (let i = 0; i < schedule.length; i++) {
    if (isSettled(schedule[i])) lastSettled = i
  }
  const balance = lastSettled >= 0 ? schedule[lastSettled].balance : loan.amount
  return round2(Math.max(0, balance ?? loan.amount ?? 0))
}

// Age of the oldest installment that is past due and still unsettled. 0 means the loan is
// current — either nothing is due yet or everything due has been collected.
export function loanDaysPastDue(loan, todayIso) {
  let worst = 0
  for (const row of loan.schedule || []) {
    if (isSettled(row) || !row.dueDateISO) continue
    const days = daysBetweenISO(row.dueDateISO, todayIso)
    if (days > worst) worst = days
  }
  return worst
}

export function parBandFor(daysPastDue) {
  return PAR_BANDS.find(b => daysPastDue >= b.min && daysPastDue <= b.max) || PAR_BANDS[PAR_BANDS.length - 1]
}

// ─── End of Day: interest accrual ────────────────────────────────────────────
// One day of interest on every active loan's outstanding principal. Per-loan amounts are
// rounded before they are summed so the currency total is exactly the sum of the lines the
// operator is shown — a total rounded separately could be a cent off what the preview adds up to.
export function computeAccrual(state, todayIso) {
  const lines = []
  const byCurrency = {}
  for (const loan of activeLoans(state)) {
    const currency = loan.currency || 'USD'
    if (!ACCRUAL_GL[currency]) continue
    const principal = loanOutstanding(loan)
    const rate = loan.interestRate || 0
    if (principal <= 0.005 || rate <= 0) continue
    const amount = round2(principal * (rate / 100) / DAYS_IN_YEAR)
    if (amount <= 0.005) continue
    lines.push({ ref: loan.ref, customerName: loan.customerName, currency, principal, rate, amount })
    byCurrency[currency] = round2((byCurrency[currency] || 0) + amount)
  }
  const movements = Object.entries(byCurrency).map(([currency, amount]) => ({
    currency,
    amount,
    ...ACCRUAL_GL[currency],
  }))
  return { date: todayIso, lines, movements }
}

// ─── End of Day: overdue detection ───────────────────────────────────────────
// Stamps the contract penalty on installments that have gone past due without one. A row
// that already carries a late fee is skipped, so re-running End of Day never charges the
// same installment twice. Nothing is posted to the ledger here: a late fee becomes income
// only when it is actually collected (RECORD_REPAYMENT), which is how ADJUST_LATE_FEE
// already treats it.
export function computeOverdue(state, todayIso) {
  const items = []
  for (const loan of activeLoans(state)) {
    const penaltyRate = loan.penaltyRate || 0
    if (penaltyRate <= 0) continue
    loan.schedule.forEach((row, idx) => {
      if (isSettled(row) || !row.dueDateISO) return
      if ((row.lateFee || 0) > 0) return
      const daysLate = daysBetweenISO(row.dueDateISO, todayIso)
      if (daysLate <= 0) return
      const fee = round2((row.totalDue || 0) * (penaltyRate / 100))
      if (fee <= 0.005) return
      items.push({
        ref: loan.ref,
        customerName: loan.customerName,
        currency: loan.currency || 'USD',
        idx,
        num: row.num,
        dueDate: row.dueDate,
        daysLate,
        fee,
        penaltyRate,
      })
    })
  }
  return items
}

// ─── End of Month: loan-loss provisioning ────────────────────────────────────
// Required allowance is rebuilt from scratch each month out of the PAR bands, then compared
// against what the allowance account already carries. Only the difference is posted, so
// running the month twice would post nothing the second time even without the period guard.
export function computeProvision(state, todayIso) {
  const buckets = PAR_BANDS.map(b => ({ ...b, count: 0, exposure: 0, required: 0 }))
  const required = {}
  for (const loan of activeLoans(state)) {
    const currency = loan.currency || 'USD'
    if (!PROVISION_GL[currency]) continue
    const principal = loanOutstanding(loan)
    if (principal <= 0.005) continue
    const band = parBandFor(loanDaysPastDue(loan, todayIso))
    const bucket = buckets.find(b => b.id === band.id)
    const amount = round2(principal * (band.rate / 100))
    bucket.count += 1
    bucket.exposure = round2(bucket.exposure + principal)
    bucket.required = round2(bucket.required + amount)
    required[currency] = round2((required[currency] || 0) + amount)
  }
  const movements = Object.entries(required)
    .map(([currency, amount]) => {
      const gl = PROVISION_GL[currency]
      const held = round2(state.chartOfAccounts.find(a => a.code === gl.allowance)?.balance || 0)
      return { currency, required: amount, held, delta: round2(amount - held), ...gl }
    })
    .filter(m => Math.abs(m.delta) > 0.005)
  return { period: monthKey(todayIso), buckets: buckets.filter(b => b.count > 0), movements }
}

// ─── Verification ────────────────────────────────────────────────────────────
// A 'fail' blocks the batch; a 'warn' is surfaced but does not. The split is deliberate:
// structural problems (a journal entry that doesn't balance, an overdrawn account, a
// missing posting account) mean the batch would write on top of a broken ledger, whereas
// control-account drift and pending approvals are things the operator should see and judge.

function sumLines(entry) {
  return (entry.lines || []).reduce(
    (acc, l) => ({ debit: acc.debit + (l.debit || 0), credit: acc.credit + (l.credit || 0) }),
    { debit: 0, credit: 0 }
  )
}

export function runChecks(state, kind, todayIso) {
  const checks = []
  const add = (id, label, status, detail) => checks.push({ id, label, status, detail })
  const day = state.businessDay || {}

  // 1. The day gate — which batch is legal right now.
  if (kind === SOD) {
    if (day.status === 'open') {
      add('day-gate', 'No business day already open', 'fail',
        `${day.date} is still open. Run End of Day to close it before opening another.`)
    } else {
      add('day-gate', 'No business day already open', 'pass',
        day.date ? `Last closed day: ${day.date}.` : 'No day has been opened on this install yet.')
    }
    // Reopening a day End of Day has already closed would let that day accrue interest a
    // second time — the accrual entry is keyed by date, so the second run would collide with
    // the first entry's id as well as double-count the income.
    const alreadyClosed = (state.batchRuns || []).some(r => r.kind === EOD && r.date === todayIso)
    add('day-not-closed', 'Today has not already been closed', alreadyClosed ? 'fail' : 'pass',
      alreadyClosed
        ? `End of Day has already run for ${todayIso}. The next business day can be opened tomorrow.`
        : `${todayIso} has not been closed yet.`)
  }
  if (kind === EOD) {
    if (day.status !== 'open') {
      add('day-gate', 'A business day is open', 'fail', 'No day is open — run Start of Day first.')
    } else {
      add('day-gate', 'A business day is open', 'pass', `${day.date}, opened by ${day.openedBy || 'unknown'}.`)
    }
  }
  if (kind === EOM) {
    if (day.status === 'open') {
      add('day-gate', 'No business day left open', 'fail',
        `${day.date} is still open. Close the day with End of Day before closing the month.`)
    } else {
      add('day-gate', 'No business day left open', 'pass', 'All days are closed.')
    }
    const period = monthKey(todayIso)
    const alreadyClosed = (state.batchRuns || []).some(r => r.kind === EOM && r.period === period)
    add('period-open', 'Accounting period not already closed', alreadyClosed ? 'fail' : 'pass',
      alreadyClosed ? `${period} has already been closed.` : `Closing ${period}.`)
  }

  // 2. Every double-entry posting balances. This is the one check that says whether the
  //    ledger itself is sound, so nothing may post on top of a failure here.
  //    Single Entry postings are excluded on purpose: they are this app's one-sided
  //    adjustment (own tab, own form, one line by construction — see the SINGLE_ENTRY case
  //    in AppContext), so holding them to debits = credits would fail every one of them.
  const entries = (state.journalEntries || []).filter(e => e.entryType !== 'Single Entry')
  const unbalanced = entries.filter(e => {
    const { debit, credit } = sumLines(e)
    return Math.abs(debit - credit) > 0.005
  })
  add('journal-balanced', 'Every journal entry balances', unbalanced.length ? 'fail' : 'pass',
    unbalanced.length
      ? `${unbalanced.length} of ${entries.length} double-entry postings have debits ≠ credits (${[...new Set(unbalanced.slice(0, 3).map(e => e.transactionNo || e.id))].join(', ')}${unbalanced.length > 3 ? '…' : ''}).`
      : `${entries.length} double-entry postings checked — debits equal credits on all of them. Single Entry adjustments are one-sided by design and not counted.`)

  // 3. No account has been taken negative. Money-out paths refuse overdrafts rather than
  //    clamping them, so a negative balance means something bypassed that rule.
  const overdrawn = (state.chartOfAccounts || []).filter(a => (a.balance || 0) < -0.005)
  add('no-overdraft', 'No account is overdrawn', overdrawn.length ? 'fail' : 'pass',
    overdrawn.length
      ? `${overdrawn.map(a => `${a.code} ${a.name}`).join(', ')} carries a negative balance.`
      : `${(state.chartOfAccounts || []).length} accounts checked, none below zero.`)

  // 4. The accounts this batch is about to post to actually exist in the chart. A currency
  //    with no mapping at all is caught here too, rather than silently accruing nothing.
  const needed = kind === EOD ? ACCRUAL_GL : kind === EOM ? PROVISION_GL : null
  if (needed) {
    const currencies = [...new Set(activeLoans(state).map(l => l.currency || 'USD'))]
    const missing = []
    for (const currency of currencies) {
      const gl = needed[currency]
      if (!gl) { missing.push(`${currency} (no posting accounts defined)`); continue }
      for (const code of Object.values(gl)) {
        if (!(state.chartOfAccounts || []).some(a => a.code === code)) missing.push(`${code} (${currency})`)
      }
    }
    add('gl-accounts', 'Posting accounts exist for every loan currency', missing.length ? 'fail' : 'pass',
      missing.length
        ? `Missing: ${missing.join(', ')}.`
        : `${currencies.join(', ') || 'No active loans'} — all posting accounts present.`)
  }

  // 5. Control-account reconciliation. Drift is worth showing but is not a reason to refuse
  //    the batch: the seeded opening balances were never derived from these loans.
  const waitingDisburse = round2((state.loanApplications || [])
    .filter(l => l.status === 'Waiting Disburse' && (l.currency || 'USD') === 'USD')
    .reduce((s, l) => s + (l.amount || 0), 0))
  const apHeld = round2((state.chartOfAccounts || []).find(a => a.code === '2030')?.balance || 0)
  add('ap-control', 'Account Payable matches approved-not-disbursed principal',
    Math.abs(apHeld - waitingDisburse) > 0.005 ? 'warn' : 'pass',
    `2030 carries ${apHeld.toFixed(2)}; loans awaiting disbursement total ${waitingDisburse.toFixed(2)}.`)

  const outstandingUsd = round2(activeLoans(state)
    .filter(l => (l.currency || 'USD') === 'USD')
    .reduce((s, l) => s + loanOutstanding(l), 0))
  const arHeld = round2((state.chartOfAccounts || []).find(a => a.code === '1130')?.balance || 0)
  add('ar-control', 'Account Receivable matches outstanding principal',
    Math.abs(arHeld - outstandingUsd) > 0.005 ? 'warn' : 'pass',
    `1130 carries ${arHeld.toFixed(2)}; active loans have ${outstandingUsd.toFixed(2)} outstanding.`)

  // 6. Unposted work the operator should clear first. The note on the batch panel tells them
  //    to post the day's transactions before running End of Day — this is that, checked.
  const pending = (state.expenses || []).filter(e => e.status === 'Pending Approval')
  add('pending-expenses', 'No expenses awaiting approval', pending.length ? 'warn' : 'pass',
    pending.length
      ? `${pending.length} expense${pending.length === 1 ? '' : 's'} still pending — they will not be in this batch.`
      : 'All expenses are approved or rejected.')

  if (kind === EOD) {
    const overdue = computeOverdue(state, todayIso)
    add('overdue-scan', 'Overdue installments detected', overdue.length ? 'warn' : 'pass',
      overdue.length
        ? `${overdue.length} installment${overdue.length === 1 ? '' : 's'} past due will have the contract penalty applied.`
        : 'No installment is past due without a penalty already applied.')
  }

  return checks
}

export function hasBlockingFailure(checks) {
  return checks.some(c => c.status === 'fail')
}

// What a batch would do, in one call — the modal previews this and hands the same object to
// the reducer, so what the operator approved is exactly what posts.
export function buildBatchPlan(state, kind, todayIso = todayISO()) {
  const checks = runChecks(state, kind, todayIso)
  const plan = { kind, date: todayIso, checks, blocked: hasBlockingFailure(checks) }
  if (kind === EOD) {
    plan.accrual = computeAccrual(state, todayIso)
    plan.overdue = computeOverdue(state, todayIso)
  }
  if (kind === EOM) {
    plan.provision = computeProvision(state, todayIso)
    plan.period = monthKey(todayIso)
  }
  return plan
}
