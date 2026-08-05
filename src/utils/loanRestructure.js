import { buildAmortizationData } from './format'
import { loanOutstanding } from './systemOperations'

// The maths behind rescheduling and refinancing an active loan. Pure, so the modal can show
// the operator exactly what will happen and the reducer can apply that same plan — the two
// cannot disagree about a figure the borrower is about to be held to.
//
// Reschedule and refinance are different operations and are kept apart deliberately:
//   • Reschedule re-amortizes what is already owed over new terms. No money moves, so nothing
//     is posted to the ledger — only the schedule changes.
//   • Refinance issues a NEW loan whose proceeds settle the old one. Money moves, and the
//     entry it posts is what makes it accounting-critical.

const round2 = n => Math.round(n * 100) / 100

// Paid and Partial both count as settled — a partial payment's principal remainder was already
// rolled onto the next installment, so the row itself is finished with.
function isSettled(row) {
  return row.status === 'Paid' || row.status === 'Partial'
}

export function settledRowsOf(loan) {
  return (loan?.schedule || []).filter(isSettled)
}

// What the borrower still owes in principal. Shared with the End of Day accrual rather than
// re-derived here, so "outstanding" means one thing across the app.
export function outstandingPrincipal(loan) {
  return loanOutstanding(loan || {})
}

// ─── Reschedule ──────────────────────────────────────────────────────────────
// Installments already collected are left exactly as they are; only the unpaid tail is
// rebuilt, from the outstanding principal over the new term. Regenerating the whole schedule
// would rewrite history — a row the borrower has a receipt for would change amount.
export function buildReschedulePlan(loan, { installments, interestRate, firstDueISO }) {
  const settled = settledRowsOf(loan)
  const principal = outstandingPrincipal(loan)
  const rate = Number(interestRate) > 0 ? Number(interestRate) : loan?.interestRate
  const term = Number(installments)
  if (!(principal > 0) || !(rate > 0) || !(term > 0) || !firstDueISO) return null

  const { emi, rows } = buildAmortizationData(principal, rate, term, firstDueISO)
  if (!rows.length) return null

  return {
    kind: 'reschedule',
    principal,
    interestRate: rate,
    installments: term,
    firstDueISO,
    emi: round2(emi),
    settledCount: settled.length,
    // Numbering continues from what was already collected, so installment #7 stays #7 on the
    // receipt the borrower is holding and the new tail carries on from there.
    schedule: [...settled, ...rows.map((r, i) => ({ ...r, num: settled.length + i + 1 }))],
    totalInterest: round2(rows.reduce((s, r) => s + (r.interest || 0), 0)),
  }
}

// ─── Refinance ───────────────────────────────────────────────────────────────
// The new loan's principal clears the old loan's outstanding balance and the refinance fee;
// the borrower receives what is left. Everything the reducer needs to post is derived here so
// the preview and the journal entry come from one calculation.
export function buildRefinancePlan(loan, { amount, interestRate, installments, firstDueISO, fee }) {
  const settlement = outstandingPrincipal(loan)
  const refinanceFee = round2(Math.max(0, Number(fee) || 0))
  const newAmount = round2(Number(amount) || 0)
  const rate = Number(interestRate)
  const term = Number(installments)
  if (!(newAmount > 0) || !(rate > 0) || !(term > 0) || !firstDueISO) return null

  const { emi, rows } = buildAmortizationData(newAmount, rate, term, firstDueISO)
  if (!rows.length) return null

  // What actually leaves the bank. Negative would mean the borrower has to pay *in* to
  // refinance, which is not a disbursement — the caller refuses it rather than clamping,
  // the same way an overdrawn expense is refused.
  const netToBorrower = round2(newAmount - settlement - refinanceFee)

  return {
    kind: 'refinance',
    settlement,
    refinanceFee,
    newAmount,
    netToBorrower,
    interestRate: rate,
    installments: term,
    firstDueISO,
    emi: round2(emi),
    schedule: rows,
    totalInterest: round2(rows.reduce((s, r) => s + (r.interest || 0), 0)),
  }
}

// A refinance has to at least cover what it is settling. The half-cent tolerance matches the
// rest of the app's monetary comparisons.
export function refinanceCoversSettlement(plan) {
  return !!plan && plan.netToBorrower > -0.005
}
