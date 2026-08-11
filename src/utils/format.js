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
export function amortizePeriods(balance, monthlyRate, n) {
  const round2 = x => Math.round(x * 100) / 100
  const emi = round2(monthlyRate > 0
    ? (balance * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1)
    : balance / n)

  let remainingBalance = round2(balance)
  const periods = []
  for (let i = 1; i <= n; i++) {
    const interestPaid = round2(remainingBalance * monthlyRate)
    // The last period clears the balance outright; earlier ones can't retire more principal
    // than is left either, which matters on a short term where the EMI overshoots.
    const principalPaid = i === n
      ? remainingBalance
      : Math.min(round2(emi - interestPaid), remainingBalance)
    remainingBalance = round2(remainingBalance - principalPaid)
    periods.push({
      principal: principalPaid,
      interest: interestPaid,
      totalDue: round2(principalPaid + interestPaid),
      balance: i === n ? 0 : Math.max(0, remainingBalance),
    })
  }
  return { emi, periods }
}

export function buildAmortizationData(amount, annualRate, termMonths, firstInstStr) {
  if (!amount || amount <= 0 || !annualRate || annualRate <= 0) return { emi: 0, rows: [] }

  const monthlyRate = (annualRate / 100) / 12
  const { emi, periods } = amortizePeriods(amount, monthlyRate, termMonths)

  let startDate = firstInstStr ? new Date(firstInstStr + 'T00:00:00') : new Date()
  const rows = periods.map((period, idx) => {
    const i = idx + 1
    const installmentDate = new Date(startDate)
    installmentDate.setMonth(installmentDate.getMonth() + (i - 1))
    const formattedDate = installmentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    // Built from the local calendar parts, not toISOString() — east-of-UTC zones would
    // otherwise roll the ISO date back a day and print an installment as falling due
    // the day before the `dueDate` shown everywhere else.
    const isoDate = `${installmentDate.getFullYear()}-${String(installmentDate.getMonth() + 1).padStart(2, '0')}-${String(installmentDate.getDate()).padStart(2, '0')}`

    return {
      num: i,
      dueDate: formattedDate,
      dueDateISO: isoDate,
      principal: period.principal,
      interest: period.interest,
      totalDue: period.totalDue,
      balance: period.balance,
      paid: 0,
      status: 'Upcoming',
    }
  })

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
