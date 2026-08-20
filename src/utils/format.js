export const CONVERSION_RATE = 4000

export function formatVal(amount, currency = 'USD', rate = CONVERSION_RATE) {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }
  const converted = Math.round(amount * rate)
  return new Intl.NumberFormat('km-KH', { style: 'currency', currency: 'KHR', maximumFractionDigits: 0 }).format(converted)
}

export const CURRENCY_SYMBOLS = { USD: '$', KHR: '៛' }

// The riel has no subunit in day-to-day MFI practice — a KHR amount is entered and held in
// whole riel, so no decimal place is offered on one at all.
export function currencyDecimals(currency = 'USD') {
  return currency === 'KHR' ? 0 : 2
}

// Reduces whatever is in an amount field to something parseFloat can read back: digits and at
// most one decimal point, capped at the currency's decimals. A decimal point on a whole-riel
// currency truncates rather than being deleted — dropping the dot out of "1200.50" would
// silently read it as 120050, which matters when a USD amount is already in the field and the
// currency is switched to KHR under it.
export function sanitizeAmountInput(text, currency = 'USD') {
  const cleaned = String(text ?? '').replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, '')
  if (currencyDecimals(currency) === 0) return cleaned.split('.')[0]
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, currencyDecimals(currency))
}

// Thousand separators for an amount still being typed. Deliberately not formatVal: that one
// renders a finished figure with fixed decimals, which would fight the person entering it —
// a half-typed "1200." has to survive as typed, and "1.5" must not jump to "1.50" before the
// second decimal is pressed.
export function formatAmountInput(text, currency = 'USD') {
  const raw = sanitizeAmountInput(text, currency)
  if (!raw) return ''
  const dot = raw.indexOf('.')
  const whole = dot === -1 ? raw : raw.slice(0, dot)
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dot === -1 ? '' : raw.slice(dot))
}

// Loan product max amounts are configured in USD; convert to the loan's own
// currency before comparing against a native-currency entered amount.
export function getProductMaxAmount(product, currency, rate = CONVERSION_RATE) {
  if (!product?.maxAmount) return null
  return currency === 'KHR' ? Math.round(product.maxAmount * rate) : product.maxAmount
}

// Human-readable size for an uploaded file, as shown on document cards.
export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Schedule ISO dates are built from local calendar parts (see buildAmortizationData),
// so date maths on them has to stay local too — going through UTC would slide an
// installment a day either side of the date shown to the user in east-of-UTC zones.
export function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Local 'YYYY-MM-DD HH:MM:SS' — the stamp format the audit trail stores (see
// INITIAL_AUDIT_LOGS). Built from local parts for the same reason toISODate is: going
// through toISOString() reports UTC, which would file a Phnom Penh morning under the
// previous evening.
export function auditStamp(date = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${toISODate(date)} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

export function shiftISODate(isoDate, days) {
  if (!isoDate) return isoDate
  const [y, m, d] = isoDate.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

export function daysBetweenISO(fromISO, toISO) {
  if (!fromISO || !toISO) return 0
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  return Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / 86400000)
}

// Splits an audit-log timestamp into date and time for the audit tables.
// Handles both formats in use: "26/07/2026, 14:30:05" from
// `toLocaleString('en-GB')` and "2026-06-24 08:15:32" from the seed data.
// A value with no time part stays whole under the date so nothing is dropped.
export function splitTimestamp(timestamp) {
  if (!timestamp) return { date: '—', time: '—' }
  const str = String(timestamp).trim()
  const match = str.match(/^(.*?)(?:,\s+|\s+)(\S+)$/)
  if (!match) return { date: str || '—', time: '—' }
  return { date: match[1].trim() || '—', time: match[2] }
}

export function formatAddress(addr) {
  if (!addr) return null
  if (typeof addr === 'string') return addr
  const parts = [
    addr.house   ? `#${addr.house}`   : null,
    addr.street  ? `St.${addr.street}` : null,
    addr.village, addr.commune, addr.district, addr.province
  ].filter(Boolean)
  return parts.join(', ') || null
}

// Computes a fresh declining-balance amortization over `n` periods for a
// given starting balance. Shared by initial schedule generation and by
// re-amortization after an underpaid/overpaid installment (e.g. a borrower
// who can only afford interest one month) shifts the real outstanding balance
// away from what the original schedule assumed.
// Every figure is rounded to the cent as it is produced, not just when it is displayed.
// Carrying full-precision floats here meant a row could show "Total Due $866.63" while
// really holding 866.6349 — a borrower who paid exactly what the screen told them to was
// left a fraction short, which surfaced later as a phantom $0.01 remainder they had to pay
// a second time. What the schedule stores is now exactly what it shows.
//
// Rounding each period independently would make the instalments drift away from the
// principal borrowed, so the final period is settled against whatever is actually left
// rather than being handed another rounded EMI. That keeps sum(principal) === the amount
// borrowed exactly, and the last instalment absorbs the accumulated half-cents.
//
// A BALLOON loan is partially amortizing: `balloonAmount` of the principal is deliberately left
// standing at the end of the term and falls due in one lump on the final instalment. The level
// payment is solved so the balance lands on the balloon instead of on zero — the same annuity
// with a residual value, which is why it is the one existing solve with the residual subtracted
// rather than a second schedule builder. A balloon equal to the whole principal is the
// interest-only/bullet loan a seasonal agricultural borrower services monthly and clears after
// harvest: the maths falls out of the same formula (payment = balance × rate), so it needs no
// case of its own. Zero is a fully amortizing loan and every figure is bit-for-bit what it was
// before this existed — subtracting a literal zero cannot move a float, which is what keeps a
// loan already on the books from re-pricing by a rounding cent when its schedule is rebuilt.
//
// A collection fee, when one is charged, is priced INTO the instalment rather than billed on top
// of it: the borrower pays one level figure every month covering principal, interest and the fee.
// Because the fee accrues on the same outstanding balance as interest, that is exactly an annuity
// at the combined rate — the periodic charge (balance × (interest + fee rate)) is then split into
// its two named parts. Principal still sums to the amount borrowed, so the loan closes on term;
// what changes against a fee-on-top schedule is that the instalment is level and the principal
// slices start smaller.
//
// How long each period actually is. The first one runs from the day the money left the bank to
// the first due date and counts BOTH ends — a loan released 13 Aug against a 12 Sep first
// repayment is charged 31 days, not 30, which is the difference between a first instalment
// charging 100.75 and one charging 97.50 on 6,500 at 18%. Every later period is the gap between
// consecutive due dates. A first due date on or before the disbursement day accrues nothing
// rather than accruing backwards.
export function scheduleDayCounts(accrualStartISO, dueISOs) {
  return dueISOs.map((iso, i) => i === 0
    ? Math.max(0, daysBetweenISO(accrualStartISO, iso) + 1)
    : daysBetweenISO(dueISOs[i - 1], iso))
}

// Interest and the collection fee accrue on ACTUAL DAYS over a 360-day year (ACT/360) whenever
// `dayCounts` says what each period spans — the convention a Cambodian MFI quotes against, where
// a 31-day month genuinely costs more than a 28-day one. Since `monthlyRate` is already the
// annual rate over twelve, balance × annual × days/360 is the same as balance × monthlyRate ×
// days/30, which is the factor applied below. Without `dayCounts` every figure is exactly what it
// was before — that is what keeps a loan written under the flat-twelfth convention priced the way
// it was signed.
//
// The instalment is solved against those same day counts rather than being taken from the
// textbook annuity formula, which assumes every period is the same length. Periods of unequal
// length need the general form — principal × ∏(1+cᵢ) ÷ Σₖ∏ⱼ>ₖ(1+cⱼ) — so that one level figure
// still lands the balance on zero at the final instalment. Charging the nominal payment instead
// would leave the 16 extra days the calendar carries over a 36-month term (1,096 against 1,080)
// to pile onto the last row as a balloon. On 6,500 / 36 months / 18% + 18% that is a level
// 299.73 rather than 297.72 for 35 months and 426.16 on the last.
export function amortizePeriods(balance, monthlyRate, n, feeMonthlyRate = 0, dayCounts = null, currency = 'USD', balloonAmount = 0, structure = 'Amortizing') {
  // Every figure is rounded to what the currency can actually be paid in — the cent in USD, the
  // nearest 100 riel in KHR (see roundAmount). Rounding a riel schedule to two decimals asked a
  // borrower for money that does not circulate. The last period still absorbs the accumulated
  // difference, so sum(principal) lands on the amount borrowed whichever currency it is in.
  const round2 = x => roundAmount(x, currency)
  const chargeRate = monthlyRate + feeMonthlyRate
  // A declining loan retires the principal in equal slices instead of solving a level instalment,
  // so there is nothing to solve and no residual to leave standing: the two are alternative
  // products an officer picks between, not settings that combine.
  const declining = structure === 'Decline'
  // Held to the principal it is carved out of: a balloon larger than the loan would solve a
  // negative instalment, i.e. the lender paying the borrower monthly to keep the loan open.
  const balloon = declining ? 0 : Math.min(Math.max(round2(balloonAmount) || 0, 0), round2(balance))
  // The balloon is the FINAL instalment, not an extra payment after it, so the level payment is
  // solved over the periods BEFORE it and has to leave exactly the balloon standing. Solving over
  // all n instead would leave the balloon standing after the last payment as well as billing that
  // payment — a quoted 30% residual then collected 32.5%, since the final row settles whatever is
  // left rather than a further instalment. A loan with no balloon still solves over all n against
  // a residual of zero, which is the original calculation untouched.
  const solveN = balloon > 0 ? n - 1 : n
  // The equal slice of principal a declining loan retires each period. Interest is charged on
  // whatever balance is still standing when the period is billed, exactly as it is on every other
  // structure — it is the principal side that differs, not the interest side.
  const levelPrincipal = declining ? round2(balance / n) : 0
  // Walked backwards from the final solved period: `compounded` accumulates ∏(1+cᵢ) and
  // `annuityFactor` the sum of the partial products, which is the same quantity ((1+c)ⁿ-1)/c stands
  // for when every period is equal. The flat-twelfth path keeps its closed form bit for bit rather
  // than being folded into this one — the two agree mathematically, but a loan already on the books
  // must not have its instalment shift by a rounding cent just because the schedule was rebuilt.
  let emi
  if (declining) {
    // Nothing to solve: no single figure is charged twice. What the loan is quoted at is read off
    // the finished schedule below.
    emi = 0
  } else if (dayCounts) {
    let compounded = 1
    let annuityFactor = 0
    for (let i = solveN - 1; i >= 0; i--) {
      annuityFactor += compounded
      compounded *= 1 + chargeRate * ((dayCounts[i] || 0) / 30)
    }
    emi = round2(annuityFactor > 0 ? (balance * compounded - balloon) / annuityFactor : (balance - balloon) / n)
  } else {
    emi = round2(chargeRate > 0 && solveN > 0
      ? (balance * chargeRate * Math.pow(1 + chargeRate, solveN) - balloon * chargeRate) / (Math.pow(1 + chargeRate, solveN) - 1)
      : (balance - balloon) / n)
  }

  let remainingBalance = round2(balance)
  const periods = []
  for (let i = 1; i <= n; i++) {
    const days = dayCounts ? (dayCounts[i - 1] || 0) : null
    const factor = days === null ? 1 : days / 30
    const interestPaid = round2(remainingBalance * monthlyRate * factor)
    const collectionFee = round2(remainingBalance * feeMonthlyRate * factor)
    // The last period clears the balance outright — on a balloon loan that final row IS the lump.
    // Earlier ones can retire no more than the balance ABOVE the balloon, which on a plain loan is
    // simply the balance (a balloon of zero) and matters on a short term where the EMI overshoots.
    // Holding the floor at the balloon is also what makes the residual exactly what was quoted:
    // ACT/360 periods are unequal, so a level payment lands slightly differently each month, and
    // the accumulated drift is absorbed by the LAST REGULAR instalment rather than eating into
    // the lump — the same way a plain loan's final row absorbs it, moved one row up so that the
    // balloon a borrower signed for is the figure they are actually billed. On an interest-only
    // loan the floor equals the balance from the outset, so no principal is retired until maturity
    // and each row bills its own true interest — which is what interest-only means, and why it
    // needs no case of its own. Nor can a period retire a NEGATIVE amount: one longer than the
    // 30-day average charges more interest than the level instalment covers, and letting that
    // through would grow the principal the borrower owes.
    const principalPaid = i === n
      ? remainingBalance
      : declining
        ? Math.min(levelPrincipal, remainingBalance)
        : Math.min(Math.max(round2(emi - interestPaid - collectionFee), 0), round2(remainingBalance - balloon))
    remainingBalance = round2(remainingBalance - principalPaid)
    periods.push({
      principal: principalPaid,
      interest: interestPaid,
      collectionFee,
      totalDue: round2(principalPaid + interestPaid + collectionFee),
      balance: i === n ? 0 : Math.max(0, remainingBalance),
      // Only on a day-counted row, so the figure an auditor is checking carries the day count it
      // was charged on. A flat-twelfth row has no such number to state.
      ...(days === null ? {} : { days }),
    })
  }
  // A declining loan is quoted at its LARGEST instalment, which is the figure affordability has to
  // be tested against: a borrower who cannot pay the peak row cannot carry the loan, whatever the
  // later rows fall to. Not simply row 1 — under ACT/360 the first period runs from disbursement to
  // the first due date, which is usually a short stub charging less than a full month, so the
  // second row can bill more than the first. Taking the maximum is right either way, and every
  // screen reading `emi` then shows a payment the borrower is actually billed rather than an
  // average nobody ever pays.
  if (declining) emi = periods.reduce((max, p) => Math.max(max, p.totalDue), 0)
  return { emi, periods }
}

// `accrualStartISO` is the day interest starts running — the disbursement date for a new loan.
// Supplying it prices the schedule on actual days (ACT/360, see amortizePeriods); omitting it
// keeps the flat-twelfth charge, which is what every schedule written before this existed was
// quoted at. It is deliberately not defaulted to the first installment date: guessing an accrual
// start would silently re-price a loan nobody asked to re-price.
//
// `balloonPercent` is the share of the ORIGINAL principal left standing at maturity, which is how
// a balloon is quoted to a borrower ("30% residual", "interest only") rather than as a cash
// figure they would have to work out themselves. 0 is the fully amortizing loan every schedule
// written before this existed was quoted at; 100 is interest-only with the whole principal due on
// the last instalment. See amortizePeriods for why one formula covers all three.
//
// `structure` is 'Amortizing' (the default every schedule written before structures existed was
// quoted at), 'Balloon' — which is what `balloonPercent` prices — or 'Decline', the equal-principal
// schedule whose instalment falls month by month. It must be passed at every place a saved loan's
// schedule is REBUILT, not just where one is first written: rebuilding a declining loan without it
// would quietly re-amortize it into a level one and show the borrower a payment they never agreed
// to, the same trap `balloonPercent` carries.
export function buildAmortizationData(amount, annualRate, termMonths, firstInstStr, collectionAnnualRate = 0, accrualStartISO = '', currency = 'USD', balloonPercent = 0, structure = 'Amortizing') {
  if (!amount || amount <= 0 || !annualRate || annualRate <= 0) return { emi: 0, rows: [] }

  const monthlyRate = (annualRate / 100) / 12
  const feeMonthlyRate = (Math.max(0, collectionAnnualRate) / 100) / 12
  const balloonShare = Math.min(Math.max(Number(balloonPercent) || 0, 0), 100)
  const balloonAmount = balloonShare > 0 ? roundAmount(amount * balloonShare / 100, currency) : 0

  // The due dates are worked out before the money is, not after: under ACT/360 they are what the
  // interest is priced on rather than labels attached to rows that were already priced.
  // Each date is derived from the first one rather than from the date before it, so a first
  // installment on the 31st doesn't walk forward through the short months.
  const startDate = firstInstStr ? new Date(firstInstStr + 'T00:00:00') : new Date()
  const dates = Array.from({ length: termMonths }, (_, idx) => {
    const d = new Date(startDate)
    d.setMonth(d.getMonth() + idx)
    return d
  })
  // Built from the local calendar parts, not toISOString() — east-of-UTC zones would
  // otherwise roll the ISO date back a day and print an installment as falling due
  // the day before the `dueDate` shown everywhere else.
  const isoDates = dates.map(toISODate)

  const dayCounts = accrualStartISO ? scheduleDayCounts(accrualStartISO, isoDates) : null
  const { emi, periods } = amortizePeriods(amount, monthlyRate, termMonths, feeMonthlyRate, dayCounts, currency, balloonAmount, structure)

  const rows = periods.map((period, idx) => ({
    num: idx + 1,
    dueDate: dates[idx].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    dueDateISO: isoDates[idx],
    principal: period.principal,
    interest: period.interest,
    collectionFee: period.collectionFee,
    ...(period.days === undefined ? {} : { days: period.days }),
    totalDue: period.totalDue,
    balance: period.balance,
    paid: 0,
    status: 'Upcoming',
  }))

  return { emi, rows }
}

export function getStatusBadgeClass(status) {
  const map = {
    'Active':          'bg-emerald-50 text-emerald-700 border-emerald-200/50  dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    'Approved':        'bg-emerald-50 text-emerald-700 border-emerald-200/50  dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    'Waiting Disburse':'bg-brand-50   text-brand-700   border-brand-200/50    dark:bg-brand-900/30   dark:text-brand-400   dark:border-brand-800',
    'Pending':         'bg-amber-50   text-amber-700   border-amber-200/50    dark:bg-amber-900/30   dark:text-amber-400   dark:border-amber-800',
    // Customer states (see utils/customerStatus.js). 'Registered' is neutral on purpose — it
    // records that the customer exists, not that anything was approved. 'Incomplete' is amber
    // because a missing disbursement account blocks any later disbursement.
    'Registered':      'bg-slate-100  text-slate-600   border-slate-200       dark:bg-slate-700/50    dark:text-slate-300   dark:border-slate-600',
    'Incomplete':      'bg-amber-50   text-amber-700   border-amber-200/50    dark:bg-amber-900/30   dark:text-amber-400   dark:border-amber-800',
    'Pending Approval':'bg-amber-50   text-amber-700   border-amber-200/60    dark:bg-amber-900/30   dark:text-amber-400   dark:border-amber-800',
    // Blue, not amber: a loan still being filled in is work in hand, not work waiting on
    // someone. Amber is kept for the states that need attention — Pending Approval, Incomplete.
    'In Progress':     'bg-brand-50   text-brand-700   border-brand-200/60    dark:bg-brand-900/30   dark:text-brand-400   dark:border-brand-800',
    'Disbursed':       'bg-brand-50   text-brand-700   border-brand-200/60    dark:bg-brand-900/30   dark:text-brand-400   dark:border-brand-800',
    'Rejected':        'bg-rose-50    text-rose-700    border-rose-200/60     dark:bg-rose-900/30    dark:text-rose-400    dark:border-rose-800',
    'Cancelled':       'bg-slate-100  text-slate-600   border-slate-200       dark:bg-slate-700/50    dark:text-slate-300   dark:border-slate-600',
    // Closed, but settled rather than abandoned — read as its own outcome, not as a rejection.
    'Refinanced':      'bg-violet-50  text-violet-700  border-violet-200/60   dark:bg-violet-900/30  dark:text-violet-400  dark:border-violet-800',
    'Inactive':        'bg-slate-100  text-slate-600   border-slate-200       dark:bg-slate-700/50    dark:text-slate-300   dark:border-slate-600',
    'Locked':          'bg-amber-50   text-amber-700   border-amber-200       dark:bg-amber-900/30   dark:text-amber-400   dark:border-amber-800',
    'Suspended':       'bg-rose-50    text-rose-700    border-rose-200        dark:bg-rose-900/30    dark:text-rose-400    dark:border-rose-800',
  }
  return map[status] || 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600'
}

// Money on the printed schedule: grouped thousands, always two decimals. toFixed alone prints
// "1105.38", which a loan officer reading a column of figures has to parse digit by digit.
export function num2(n) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Excel's ROUND(value, digits): a positive `digits` keeps decimals, a negative one rounds to a
// power of ten above the point — ROUND(x, -2) lands on the nearest 100. Excel rounds a half away
// from zero, which is not what Math.round does below zero, so the sign is taken out first.
export function excelRound(value, digits = 0) {
  const n = Number(value) || 0
  const f = Math.pow(10, digits)
  return (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * f) / f
}

// How many digits a currency's money is stated to. USD is quoted to the cent; the riel has no
// circulating subunit and Cambodian MFIs settle to the nearest 100 — a schedule asking for
// ៛100,750.63 is asking for money the borrower cannot hand over.
export function currencyRoundDigits(currency) {
  return currency === 'KHR' ? -2 : 2
}

// ROUND(amount, 2) for USD, ROUND(amount, -2) for KHR. Use this wherever a figure is what someone
// actually pays or is posted to the ledger, rather than rounding to two decimals by reflex.
export function roundAmount(value, currency) {
  return excelRound(value, currencyRoundDigits(currency))
}

// Cambodian schedules name the weekday a payment falls on, not just its date.
const KH_WEEKDAYS = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍']

export function formatKhDMY(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  const dmy = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  return `${KH_WEEKDAYS[d.getDay()]} ${dmy}`
}

// Two letters standing in for a person where a photo would be, in an avatar circle. Two, not one:
// "SC" tells two Sokhas apart in a list where "S" does not.
export const initials = name => String(name || '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(w => w[0].toUpperCase())
  .join('')
