import { openPdf, readPdfRows, rowsText, labelledValue, labelledAmount } from './pdfText'
import { DOC_STATUS } from './statementIncome'

// How far a payslip may sit under the declared income and still confirm it.
//
// This used to borrow the bank statement's 15%, and that was wrong. The statement's tolerance
// exists because deposits swing month to month — takings differ, a transfer lands late, a month
// runs short — so demanding an exact figure off a statement would fail honest applications. A
// payslip has none of that variance: it prints one contractual figure, and the only legitimate
// gap between it and a correctly declared salary is rounding.
//
// Carrying the statement's allowance over meant a payslip stating 900 against 1,000 declared —
// an 11% overstatement of the borrower's capacity — cleared as "Verified" and never reached an
// officer. 2% absorbs rounding and nothing else.
const PAYSLIP_TOLERANCE_PCT = 2

// ── Reader for an uploaded payslip ─────────────────────────────────────────────
// A payslip is verified against the income the borrower declared, the same way a bank statement
// is — but where a statement has to be argued out of a table of transactions, a payslip states
// the figure outright. So the whole job here is finding which figure it states, and being
// honest about which one it is.
//
// Three things decide that, and they are separate questions:
//
//   net or gross — the take-home figure is the one to verify against, because that is what a
//   borrower actually has to repay out of. Gross pay is above it by whatever comes off in tax
//   and contributions, so a payslip that prints only a gross figure cannot confirm a declared
//   income on its own, however comfortably the gross clears it.
//
//   how often — a payslip covers a pay period, not necessarily a month. A fortnightly payslip
//   showing half the declared income has not found a shortfall, and reporting one would cap a
//   borrower's assessed capacity over an arithmetic mistake.
//
//   how much of the income it accounts for — a payslip evidences a salary. An entry that
//   declares a salary plus rent from a room plus a market stall is only partly evidenced by
//   one, and saying so is more useful than either passing it or failing it.

// The figure that actually reaches the employee. Checked before the gross labels, since
// "Net Salary" would answer to both.
const NET_LABELS = /\b(net\s*(?:pay|salary|income|amount|payable|paid)|take[\s-]*home(?:\s*pay)?|amount\s*(?:paid|payable)|salary\s*paid|paid\s*to\s*bank)\b/i
// The figure before deductions. Read only as a fallback, and never treated as take-home pay.
const GROSS_LABELS = /\b(gross\s*(?:pay|salary|income|earnings|amount)?|total\s*(?:earnings|gross|salary|income)|basic\s*(?:salary|pay)|base\s*salary|monthly\s*salary|salary|wage)\b/i

const EMPLOYEE_LABELS = [
  /\b(?:employee|staff)\s*(?:full\s*)?name\b/i,
  /^\s*(?:employee|staff|paid\s*to)\b/i,
  /^\s*(?:full\s*)?name\b/i,
]
const EMPLOYER_LABELS = [/\b(?:employer|company|organisation|organization)\s*name\b/i, /^\s*employer\b/i]
const PERIOD_LABELS = [
  /\b(?:pay(?:roll)?\s*period|pay\s*month|salary\s*(?:month|period)|period|for\s*the\s*month(?:\s*of)?)\b/i,
]

// How often the payslip is paid, and what that is per month. The compound spellings come first:
// "semi-monthly" and "bi-weekly" both contain a word that would otherwise answer to a plainer
// pattern. Anything not said is monthly, which is what a payslip is unless it says otherwise.
const FREQUENCIES = [
  ['semi-monthly', /\b(semi[\s-]*monthly|twice\s*(?:a\s*)?month|1st\s*half|2nd\s*half)\b/i, 2],
  ['fortnightly', /\b(bi[\s-]*weekly|fortnight(?:ly)?|every\s*two\s*weeks)\b/i, 26 / 12],
  ['weekly', /\bweek(?:ly)?\s*(?:pay|wage|salary)?\b/i, 52 / 12],
  ['daily', /\b(daily|per\s*day|day\s*rate)\b/i, 26],
]

const round = value => Math.round(value * 100) / 100

function detectFrequency(text) {
  const hit = FREQUENCIES.find(([, re]) => re.test(text))
  return hit ? { frequency: hit[0], multiplier: hit[2] } : { frequency: 'monthly', multiplier: 1 }
}

// Reads an uploaded payslip. Returns the figures it states, or `null` when the file has no text
// layer to state them in — a photo or a flat scan, which the caller treats as "confirm it by
// hand" and never as a payslip that failed.
export async function parsePayslip(file) {
  try {
    if (!file || !/\.pdf$/i.test(file.name || '')) return null
    const pdf = await openPdf(file)
    const rows = await readPdfRows(pdf)

    const text = rowsText(rows)
    if (text.trim().length < 20) return null

    // Gross is looked for on rows the net labels do not claim, so a single "Net Salary" row
    // cannot answer both questions with the same figure.
    const net = labelledAmount(rows, NET_LABELS)
    const gross = labelledAmount(rows, GROSS_LABELS, NET_LABELS)
    if (net === null && gross === null) return null

    const analysis = {
      source: 'parsed',
      text,
      net,
      gross,
      employee: labelledValue(rows, EMPLOYEE_LABELS),
      employer: labelledValue(rows, EMPLOYER_LABELS),
      period: labelledValue(rows, PERIOD_LABELS),
      ...detectFrequency(text),
    }

    if (import.meta.env?.DEV) {
      console.debug('[payslip reader]', { file: file.name, ...analysis, text: undefined })
    }

    return analysis
  } catch {
    return null
  }
}

// What the payslip states, normalised to a month. Net pay is preferred over gross, and the
// basis is carried through rather than smoothed over — the verdict below turns on it.
export function derivePayslipIncome(analysis) {
  if (!analysis) return null
  const basis = analysis.net > 0 ? 'net' : 'gross'
  const amount = Number(basis === 'net' ? analysis.net : analysis.gross)
  if (!(amount > 0)) return null
  const multiplier = Number(analysis.multiplier) > 0 ? Number(analysis.multiplier) : 1
  return {
    basis,
    periodAmount: round(amount),
    frequency: analysis.frequency || 'monthly',
    multiplier,
    monthly: round(amount * multiplier),
    employee: analysis.employee || '',
    employer: analysis.employer || '',
    period: analysis.period || '',
  }
}

// The verdict on one payslip against what the entry declared. The same four states the bank
// statement uses, for the same reason — "the payslip shows less than declared" is a usable
// finding and "Unverified" throws it away:
//
//   Verified            — the stated pay accounts for the declared income
//   Verified Lower      — the stated pay is real but falls short of what was declared
//   Partially Verified  — the payslip is readable but cannot carry the verdict on its own: it
//                         prints only a gross figure, or it evidences the salary of an entry
//                         that declares income from more than one source
//   Unverified          — nothing could be read off it, or no pay figure is on it
//
// `sourceCount` is how many income sources the entry declares. It is what separates a genuine
// shortfall from a payslip that was only ever going to account for part of the total.
export function assessPayslipIncome(analysis, declared, sourceCount = 1) {
  const reading = derivePayslipIncome(analysis)
  const out = (state, reason, verified = null) => ({ state, reason, verified, reading })
  if (!analysis) {
    return out(
      DOC_STATUS.unverified,
      'The payslip has no text layer to read — it is a scan or photo, so confirm the salary by hand',
    )
  }
  if (!reading) return out(DOC_STATUS.unverified, 'No pay figure could be read off the payslip')

  const money = amount => amount.toFixed(2)
  const stated = `${reading.basis === 'net' ? 'Net pay' : 'Gross pay'} of ${money(reading.periodAmount)}`
  // A pay period other than a month is stated in full, since the monthly figure everything else
  // turns on was arrived at rather than printed.
  const found = reading.multiplier === 1
    ? `${stated}/month`
    : `${stated} ${reading.frequency} — ${money(reading.monthly)}/month`

  if (reading.basis === 'gross') {
    return out(
      DOC_STATUS.partial,
      `${found}, but the payslip prints no net pay — what is taken home is lower by whatever is`
      + ' deducted, so this cannot confirm the declared income on its own',
      reading.monthly,
    )
  }
  if (!(declared > 0)) {
    return out(DOC_STATUS.partial, `${found}, but no income is declared to compare against`, reading.monthly)
  }

  if (reading.monthly >= declared * (1 - PAYSLIP_TOLERANCE_PCT / 100)) {
    return out(DOC_STATUS.verified, `${found} against ${money(declared)} declared`, reading.monthly)
  }
  // Short of the declared total, but a payslip only ever states a salary. Where the entry
  // declares other income beside it, the gap is the other sources — not a shortfall.
  if (sourceCount > 1) {
    return out(
      DOC_STATUS.partial,
      `${found}, against ${money(declared)} declared across ${sourceCount} sources — the payslip`
      + ' evidences the salary, and the rest needs its own proof',
      reading.monthly,
    )
  }
  const shortPct = Math.round((1 - reading.monthly / declared) * 100)
  return out(
    DOC_STATUS.lower,
    `${found} — ${shortPct}% below the ${money(declared)} declared`,
    reading.monthly,
  )
}
