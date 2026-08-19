import { toISODate } from './format'

// ── Date-range filtering ─────────────────────────────────────────────────────
// A register is nearly always read for a period — this month's disbursements, last quarter's
// registrations — and the only date control the app had was an exact-day match on the customer
// list, which answers a question nobody asks. A range is held as a preset plus, for the custom
// case, two ISO dates; the preset is stored rather than the dates it resolves to, so a saved
// filter for "this month" still means this month next month (see savedFilters in AppContext).

export const DATE_PRESETS = [
  { value: 'all',        label: 'All time' },
  { value: 'today',      label: 'Today' },
  { value: 'last7',      label: 'Last 7 days' },
  { value: 'last30',     label: 'Last 30 days' },
  { value: 'month',      label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'quarter',    label: 'This quarter' },
  { value: 'year',       label: 'This year' },
  { value: 'custom',     label: 'Custom range' },
]

export const ALL_DATES = { preset: 'all', from: '', to: '' }

const startOfMonth = (d, shift = 0) => new Date(d.getFullYear(), d.getMonth() + shift, 1)
const endOfMonth = (d, shift = 0) => new Date(d.getFullYear(), d.getMonth() + shift + 1, 0)
const daysBack = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)

// The two ends of the range as inclusive ISO dates, or null for an open end. Built from local
// calendar parts rather than UTC — east of UTC, toISOString() would roll "today" back a day and
// silently drop everything registered this morning.
export function resolveRange(range, today = new Date()) {
  const { preset, from, to } = { ...ALL_DATES, ...(range || {}) }
  switch (preset) {
    case 'today':      return { from: toISODate(today), to: toISODate(today) }
    case 'last7':      return { from: toISODate(daysBack(today, 6)), to: toISODate(today) }
    case 'last30':     return { from: toISODate(daysBack(today, 29)), to: toISODate(today) }
    case 'month':      return { from: toISODate(startOfMonth(today)), to: toISODate(endOfMonth(today)) }
    case 'last-month': return { from: toISODate(startOfMonth(today, -1)), to: toISODate(endOfMonth(today, -1)) }
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3) * 3
      return {
        from: toISODate(new Date(today.getFullYear(), q, 1)),
        to: toISODate(new Date(today.getFullYear(), q + 3, 0)),
      }
    }
    case 'year': return {
      from: toISODate(new Date(today.getFullYear(), 0, 1)),
      to: toISODate(new Date(today.getFullYear(), 11, 31)),
    }
    // A custom range with only one end filled is a valid half-open range: "since 1 June" is a
    // question people ask, and refusing it until an end date is typed would be pedantry.
    case 'custom': return { from: from || null, to: to || null }
    default: return { from: null, to: null }
  }
}

// Whether a range actually narrows anything — what the Reset button and the "filters active"
// dot both key off. A custom preset with neither end filled narrows nothing.
export function isRangeActive(range) {
  const { from, to } = resolveRange(range)
  return !!(from || to)
}

// `value` may be an ISO date or a full ISO timestamp (submittedAt carries one); only the date
// part is compared, so a loan submitted at 23:30 counts as that day and not the next.
export function withinRange(value, range) {
  if (!isRangeActive(range)) return true
  if (!value) return false
  const day = String(value).slice(0, 10)
  const { from, to } = resolveRange(range)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

// What the control reads as when closed, and what a saved filter's summary line shows.
export function rangeLabel(range) {
  const { preset, from, to } = { ...ALL_DATES, ...(range || {}) }
  if (preset !== 'custom') {
    return DATE_PRESETS.find(p => p.value === preset)?.label || 'All time'
  }
  if (from && to) return `${from} → ${to}`
  if (from) return `From ${from}`
  if (to) return `Until ${to}`
  return 'Custom range'
}
