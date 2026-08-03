import { combineStatementAnalyses } from './parseBankStatement'

// ── What a bank statement demonstrates about spending ──────────────────────────
// The expenses on an application are a stated household budget: a category list with a figure
// against each, all of it declared by the applicant. The statement is the only thing on file
// that says what actually left the account, and the process is deliberately plain:
//
//   six months of statements → total the money out → divide by six
//
// One month is a bad month or a quiet one. Six averages the school fees paid once a term, the
// festival spending and the month the motorbike needed repairs into a single figure the
// declared budget can be held against — what the borrower really spends.
//
// Unlike the income side, nothing here looks for a recurring pattern in the debits. Spending
// is not paid in equal instalments — it is many small unrelated payments — so the evidence is
// the total over the period, not the shape of it.

// Months of history the process asks for, and the divisor it fixes.
export const EXPENSE_MONTHS_REQUIRED = 6
// How far above the declared budget the statement may sit and still confirm it. Spending swings
// month to month, so an exact figure was never the test.
export const OVERSPEND_TOLERANCE_PCT = 15
// Share of transaction rows the reader has to have put a direction to. A layout it only partly
// followed leaves an unknown amount of money unaccounted for — including money out.
const MIN_COVERAGE_PCT = 70

export const EXPENSE_STATUS = {
  verified: 'Verified',
  higher: 'Verified Higher',
  partial: 'Partially Verified',
  unverified: 'Unverified',
}

const round = value => Math.round(value * 100) / 100

// The reading itself: the months on file, what went out in each, and what that comes to per
// month. Nothing about the declaration.
//
// The window is the six most recent months on the statement, part months included. The income
// side drops the outer months because a part month drags a monthly average down — but the
// divisor here is the six months the process asks to be collected, and trimming them would
// leave a statement gathered for exactly that period two months short of it. A statement that
// opens or closes mid-month therefore understates slightly, which is the safe direction for a
// figure the borrower's capacity is measured against.
export function deriveStatementExpense(analysis) {
  if (!analysis) return null

  const months = (analysis.months || []).slice(-EXPENSE_MONTHS_REQUIRED)
  const total = round(months.reduce((sum, m) => sum + (m.debits || 0), 0))
  const monthsCount = months.length

  return {
    months,
    monthsCount,
    total,
    // The total over the months on file, divided by how many there are. That divisor is six
    // once the six months asked for are all filed; before then it is what is actually there,
    // because dividing four months of spending by six would report a third less than the
    // statement plainly shows.
    monthlySpend: monthsCount ? round(total / monthsCount) : 0,
    debitCount: months.reduce((sum, m) => sum + (m.debitCount || 0), 0),
    coverage: typeof analysis.coverage === 'number' ? analysis.coverage : null,
    reconciliation: analysis.reconciliation || { checked: false },
  }
}

// The verdict on the statements filed against one expense record, against what was declared.
// Four states, and "the statement shows more spending than declared" is the one that matters
// most — a budget that understates the real outgoings overstates what is left to repay from:
//
//   Verified            — money out matches the declared budget over six months
//   Verified Higher     — the statement is readable and shows the borrower spends more than
//                         was declared; the higher figure is the one to assess against
//   Partially Verified  — readable but cannot carry the verdict on its own (short of six
//                         months, rows the reader could not follow, or figures that do not
//                         foot) and needs an officer to confirm it
//   Unverified          — nothing was read off it, or no money out was found in it
export function assessStatementExpense(analysis, declared) {
  const reading = deriveStatementExpense(analysis)
  const out = (state, reason, spent = null) => ({ state, reason, spent, reading })
  if (!reading) return out(EXPENSE_STATUS.unverified, 'No readable bank statement on file')

  const money = amount => amount.toFixed(2)

  if (!reading.total) {
    return out(
      EXPENSE_STATUS.unverified,
      reading.monthsCount === 0
        ? 'No transaction months could be read off the statement'
        : 'No money-out rows could be read off the statement — nothing in it reads as spending',
    )
  }

  const spent = reading.monthlySpend
  const found = `${money(reading.total)} out over ${reading.monthsCount} month${reading.monthsCount === 1 ? '' : 's'}`
    + ` — ${money(spent)}/month`

  const { reconciliation } = reading
  if (reconciliation.checked && !reconciliation.ok) {
    return out(
      EXPENSE_STATUS.partial,
      `${found}, but the statement does not foot against its ${reconciliation.basis}`
      + ` (off by ${money(Math.abs(reconciliation.difference))}) — confirm it by hand`,
      spent,
    )
  }
  if (reading.monthsCount < EXPENSE_MONTHS_REQUIRED) {
    return out(
      EXPENSE_STATUS.partial,
      `${found}, but only ${reading.monthsCount} of the ${EXPENSE_MONTHS_REQUIRED} months asked for`
      + ' — collect the rest before the spending stands on its own',
      spent,
    )
  }
  if (reading.coverage !== null && reading.coverage < MIN_COVERAGE_PCT) {
    return out(
      EXPENSE_STATUS.partial,
      `${found}, but only ${reading.coverage}% of the transaction rows could be classified`
      + ' — some of the account movement is unaccounted for',
      spent,
    )
  }
  if (!(declared > 0)) {
    return out(EXPENSE_STATUS.partial, `${found}, but no expense is declared to compare against`, spent)
  }

  if (spent <= declared * (1 + OVERSPEND_TOLERANCE_PCT / 100)) {
    return out(EXPENSE_STATUS.verified, `${found} against ${money(declared)} declared`, spent)
  }
  const overPct = Math.round((spent / declared - 1) * 100)
  return out(
    EXPENSE_STATUS.higher,
    `${found} — ${overPct}% above the ${money(declared)} declared; assess the capacity on the statement figure`,
    spent,
  )
}

// The verdict for an expense record, reading its own bank statements. One call for the panel,
// so nothing has to know that the statements are combined before they are assessed.
export function assessExpenseRecord(info) {
  return assessStatementExpense(
    combineStatementAnalyses(info?.documents),
    Number(info?.totalMonthlyExpense) || 0,
  )
}

// What a statement demonstrates an entry actually spends per month — the same "total ÷ 6"
// figure the verification panel labels "Really spent / month" — or null when there is nothing
// readable to spend it on.
function statementMonthlySpend(info) {
  const reading = deriveStatementExpense(combineStatementAnalyses(info?.documents))
  return reading ? reading.monthlySpend : null
}

// The expense an entry is assessed on: what the bank statements actually show going out per
// month, whenever there is a reading to go on — not a comparison against what was declared,
// just the reader's own figure. Only an entry with nothing readable off it falls back to the
// declared budget, since there is nothing else to assess it on.
export function assessableExpense(info) {
  const spend = statementMonthlySpend(info)
  return spend !== null ? spend : (Number(info?.totalMonthlyExpense) || 0)
}

// Declared and assessable across a set of expense entries, with whether the assessed figure
// came off the statements rather than the declared budget — the loan assessment shows both,
// so a swapped-in figure never appears without its reason.
export function expenseCapacity(entries) {
  const list = (entries || []).filter(Boolean)
  const declared = list.reduce((sum, info) => sum + (Number(info?.totalMonthlyExpense) || 0), 0)
  const assessable = list.reduce((sum, info) => sum + assessableExpense(info), 0)
  return {
    declared: round(declared),
    assessable: round(assessable),
    fromStatement: list.some(info => statementMonthlySpend(info) !== null),
  }
}
