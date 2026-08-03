import { combineStatementAnalyses } from './parseBankStatement'

// ── What a bank statement demonstrates about income ────────────────────────────
// The question this answers is not "does some figure on the statement equal the declared
// income" — that invites a coincidence to pass as evidence. It is "what monthly income does
// this statement demonstrate", answered independently of the declaration, which is only then
// compared against it.
//
// The figure is the median of the RECURRING credits per month. Two things matter in that:
//
//   recurring — a deposit counts as income when the same amount comes in across separate
//   months. A single credit that happens to equal the declared figure is as often a
//   coincidence (a transfer, a refund, a loan drawdown) as it is a salary.
//
//   median — one unusually large deposit should not lift the verified figure. A statement
//   opening or closing mid-month is dropped for the same reason: a part month is not a month.

// Deposits within this of each other are treated as the same recurring stream — a salary is
// rarely paid to the cent twice running, and takings never are.
const AMOUNT_CLUSTER_PCT = 10
// Months a stream has to appear in before it counts as recurring rather than one-off.
const RECURRENCE_MONTHS = 2
// History needed before the reading stands on its own. Below this the statement still says
// something, but not enough to verify an income against.
const MIN_MONTHS = 3
// Share of transaction rows the reader has to have put a direction to. A layout it only partly
// followed leaves an unknown amount of money unaccounted for.
const MIN_COVERAGE_PCT = 70
// How far the demonstrated figure may sit under what was declared and still confirm it.
// Deposits swing month to month, so an exact figure is not the test.
export const SHORTFALL_TOLERANCE_PCT = 15

export const DOC_STATUS = {
  verified: 'Verified',
  lower: 'Verified Lower',
  partial: 'Partially Verified',
  unverified: 'Unverified',
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const round = value => Math.round(value * 100) / 100

// Credits of a similar amount, grouped. Grouping is on the amount rather than the narration
// because narration is the noisiest thing on a statement — "SALARY JUL", "PAYROLL 07/26" and
// "TRF FR ABC CO" can all be the same monthly payment. The narration is kept as a label only.
function clusterCredits(credits) {
  const streams = []
  for (const credit of [...credits].sort((a, b) => b.amount - a.amount)) {
    if (!(credit.amount > 0)) continue
    const stream = streams.find(s => Math.abs(s.amount - credit.amount) <= s.amount * (AMOUNT_CLUSTER_PCT / 100))
    if (stream) {
      stream.items.push(credit)
      stream.amount = median(stream.items.map(c => c.amount))
    } else {
      streams.push({ amount: credit.amount, items: [credit] })
    }
  }
  // Each stream keeps the deposits that formed it. The monthly totals are then summed from
  // those rows and never by re-matching on amount: as a stream's median drifts while it takes
  // in deposits, two streams' amount windows can end up overlapping, and one deposit falling in
  // both would otherwise be counted twice.
  return streams.map(s => ({
    ...s,
    months: [...new Set(s.items.map(c => (c.date || '').slice(0, 7)).filter(Boolean))].sort(),
  }))
}

// A stream as the UI and the reasons see it — without the rows behind it.
function describeStream(stream) {
  return {
    amount: round(stream.amount),
    occurrences: stream.items.length,
    months: stream.months,
    label: stream.items.map(c => c.description).find(d => d && d.trim()) || '',
  }
}

// The reading itself: which streams recur, what they come to each month, and how much history
// and coverage stand behind that. Everything a verdict needs, and nothing about the declaration.
export function deriveStatementIncome(analysis) {
  if (!analysis) return null

  const credits = analysis.credits || []
  const monthsOnFile = (analysis.months || []).map(m => m.month)
  // A statement that opens and closes mid-month has two part months in it, and the reader
  // already works out which months are whole — reuse that rather than guess again here.
  const monthsUsed = (analysis.monthsUsed?.length ? analysis.monthsUsed : monthsOnFile)
  const streams = clusterCredits(credits)
  const recurring = streams.filter(s => s.months.length >= RECURRENCE_MONTHS)

  // Per month, what the recurring streams brought in — summed from the deposits each stream is
  // actually made of, so no deposit is counted twice and none is counted that never recurred.
  const perMonth = monthsUsed.map(month => round(
    recurring.reduce(
      (sum, stream) => sum + stream.items
        .filter(c => (c.date || '').slice(0, 7) === month)
        .reduce((total, c) => total + c.amount, 0),
      0,
    ),
  ))

  return {
    monthsCount: monthsUsed.length,
    monthsUsed,
    coverage: typeof analysis.coverage === 'number' ? analysis.coverage : null,
    reconciliation: analysis.reconciliation || { checked: false },
    streams: recurring.map(describeStream),
    perMonth,
    recurringMonthly: round(median(perMonth.filter(v => v > 0))),
    // Kept for context in the reasons below: the whole picture, recurring or not.
    averageMonthlyCredits: analysis.averageMonthlyCredits || 0,
  }
}

// The verdict on one statement (or on every statement filed against an income entry), against
// what the borrower declared. Four states rather than two, because "the statement shows less
// than declared" is a usable finding and "unverified" throws it away:
//
//   Verified            — recurring deposits confirm the declared figure
//   Verified Lower      — recurring deposits are real but demonstrate less than was declared;
//                         the assessment is capped to what they show
//   Partially Verified  — the statement is readable but cannot carry the verdict on its own
//                         (too little history, rows the reader could not follow, or figures
//                         that do not foot) and needs an officer to confirm it
//   Unverified          — nothing was read off it, or nothing in it recurs
//
// Integrity and sufficiency are settled before the comparison: a figure derived from a
// statement that does not add up should not be able to confirm anything.
export function assessStatementIncome(analysis, declared) {
  const reading = deriveStatementIncome(analysis)
  const out = (state, reason, verified = null) => ({ state, reason, verified, reading })
  if (!reading) return out(DOC_STATUS.unverified, 'No readable bank statement on file')

  const money = amount => amount.toFixed(2)

  // The transaction table is the fragile half of the reader — there is no common layout across
  // Cambodian banks — so a statement it could not follow says which half failed. "No deposits"
  // on its own reads as an empty account, which is a different and much worse thing to tell an
  // officer about a statement that plainly shows a salary.
  if ((analysis.credits || []).length === 0) {
    // Money out read but no money in is not a layout failure: the reader followed the table and
    // there were no deposits in the period. Only a table it could follow in neither direction is.
    if ((analysis.debits || []).length) {
      return out(
        DOC_STATUS.unverified,
        'The statement shows money out but no deposits at all — there is no income on it to verify',
      )
    }
    const rows = analysis.transactionCount || 0
    return out(
      DOC_STATUS.unverified,
      rows
        ? `${rows} dated row${rows === 1 ? '' : 's'} were found, but none could be read as money in or out`
          + ' — the columns are laid out in a way the reader cannot follow, so enter the income by hand'
        : 'No dated transaction rows could be found on the statement — enter the income by hand',
    )
  }
  // Recurrence cannot be seen at all inside a single month, so too little history is reported
  // as too little history — not as an income that fails to recur.
  if (reading.monthsCount < RECURRENCE_MONTHS) {
    return out(
      DOC_STATUS.partial,
      `Deposits were read, but only ${reading.monthsCount} month${reading.monthsCount === 1 ? '' : 's'} of history`
      + ` — a deposit has to appear across ${RECURRENCE_MONTHS}+ months before it reads as regular income`,
    )
  }
  if (!reading.recurringMonthly) {
    return out(
      DOC_STATUS.unverified,
      `No deposit recurs across ${RECURRENCE_MONTHS}+ months — nothing in the statement reads as regular income`,
    )
  }

  const recurring = reading.recurringMonthly
  const found = `recurring deposits of ${money(recurring)}/month`

  const { reconciliation } = reading
  if (reconciliation.checked && !reconciliation.ok) {
    return out(
      DOC_STATUS.partial,
      `${found}, but the statement does not foot against its ${reconciliation.basis}`
      + ` (off by ${money(Math.abs(reconciliation.difference))}) — confirm it by hand`,
      recurring,
    )
  }
  if (reading.monthsCount < MIN_MONTHS) {
    return out(
      DOC_STATUS.partial,
      `${found}, but only ${reading.monthsCount} full month${reading.monthsCount === 1 ? '' : 's'} of history`
      + ` — ${MIN_MONTHS} are needed to verify an income`,
      recurring,
    )
  }
  if (reading.coverage !== null && reading.coverage < MIN_COVERAGE_PCT) {
    return out(
      DOC_STATUS.partial,
      `${found}, but only ${reading.coverage}% of the transaction rows could be classified`
      + ' — some of the account movement is unaccounted for',
      recurring,
    )
  }
  if (!(declared > 0)) {
    return out(DOC_STATUS.partial, `${found}, but no income is declared to compare against`, recurring)
  }

  if (recurring >= declared * (1 - SHORTFALL_TOLERANCE_PCT / 100)) {
    return out(DOC_STATUS.verified, `${found} against ${money(declared)} declared`, recurring)
  }
  const shortPct = Math.round((1 - recurring / declared) * 100)
  return out(
    DOC_STATUS.lower,
    `${found} — ${shortPct}% below the ${money(declared)} declared; capacity is assessed on the statement figure`,
    recurring,
  )
}

// The income an entry may be assessed on. Never more than the statements demonstrate: where a
// statement shows a real but smaller income, that figure is what the repayment capacity is
// measured against — min(declared, verified). A statement that could not be read, or one the
// reader cannot fully account for, does not cap anything: the finding there is "check it",
// not "the income is smaller", and silently halving a borrower's capacity on an unreadable
// scan would be its own kind of wrong.
export function assessableIncome(info) {
  const declared = Number(info?.totalMonthlyIncome) || 0
  const verdict = assessStatementIncome(combineStatementAnalyses(info?.documents), declared)
  if (verdict.state !== DOC_STATUS.lower || !verdict.verified) return declared
  return Math.min(declared, verdict.verified)
}

// Declared and assessable across a set of income entries, with the shortfall between them —
// the loan assessment shows both, so a capped figure never appears without its reason.
export function incomeCapacity(entries) {
  const list = (entries || []).filter(Boolean)
  const declared = list.reduce((sum, info) => sum + (Number(info?.totalMonthlyIncome) || 0), 0)
  const assessable = list.reduce((sum, info) => sum + assessableIncome(info), 0)
  return { declared: round(declared), assessable: round(assessable), capped: round(declared - assessable) > 0 }
}
