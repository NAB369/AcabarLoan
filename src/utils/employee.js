// Employee record helpers. A staff record stores its name split into family/given in both
// scripts and its phone/email in the pieces the Add-an-Employee form collects, so every
// screen that shows a joined value derives it here rather than storing a second copy that
// could drift out of step.
import { formatAddress } from './format'

// First name then last name, the order the form collects them in. Records saved before the
// fields were renamed carry family/given, so those are read as the same pair.
function joinName(n) {
  if (!n) return ''
  return [n.first ?? n.given, n.last ?? n.family].filter(Boolean).join(' ').trim()
}

export function employeeName(emp, script = 'english') {
  const joined = joinName(script === 'khmer' ? emp?.nameKhmer : emp?.nameEnglish)
  // Fall back to the other script rather than showing an empty Name cell.
  return joined || joinName(script === 'khmer' ? emp?.nameEnglish : emp?.nameKhmer)
}

// One employee's home address as a line of text. Structured addresses go through the same
// formatter a customer's does; the flat address1/city fields are what records saved before
// the switch to the picker carry, so those are joined as they were rather than reading blank.
export function employeeAddress(emp) {
  if (emp?.address) return formatAddress(emp.address) || ''
  return [emp?.address1, emp?.address2, emp?.city, emp?.country].filter(Boolean).join(', ')
}

// On the payroll for a period: started on or before it ended, and hadn't left before it
// began. Someone who joins or leaves mid-month is still paid for that month.
export function isOnPayroll(emp, periodStart, periodEnd) {
  if (!emp?.entryDate || emp.entryDate > periodEnd) return false
  return !emp.leaveDate || emp.leaveDate >= periodStart
}

// First and last day of a YYYY-MM period, as ISO dates.
export function periodBounds(month) {
  const [y, m] = (month || '').split('-').map(Number)
  if (!y || !m) return { start: '', end: '' }
  const last = new Date(y, m, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` }
}

export function periodLabel(month) {
  const { start } = periodBounds(month)
  if (!start) return ''
  return new Date(`${start}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export function employeePhone(code, number) {
  if (!number) return ''
  return `${code || ''} ${number}`.trim()
}

export function employeeEmail(emp) {
  if (!emp?.emailLocal || !emp?.emailDomain) return ''
  return `${emp.emailLocal}@${emp.emailDomain}`
}

// Employee numbers are YYYYMMDD_NNN, the sequence running per entry date. Auto mode reads
// the highest sequence already issued for that date so re-adding after a deletion cannot
// reissue a number that is still on another record.
export function nextEmployeeNo(employees, dateISO) {
  const day = (dateISO || '').replaceAll('-', '')
  if (!day) return ''
  const used = (employees || [])
    .map(e => {
      const m = /^(\d{8})_(\d+)$/.exec(e.employeeNo || '')
      return m && m[1] === day ? Number(m[2]) : 0
    })
  const next = Math.max(0, ...used) + 1
  return `${day}_${String(next).padStart(3, '0')}`
}

// Split a single free-text name (a CSV import, where names arrive joined) the same way the
// table reads them back out: first word is the first name, the rest is the last name.
export function splitFullName(full) {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

// Split "+855 12345678" / "012345678" into the dial-code + number pair the form holds.
export function splitPhone(raw, fallbackCode = '+855') {
  const text = (raw || '').trim()
  if (!text) return { code: fallbackCode, number: '' }
  const m = /^(\+\d{1,3})[\s-]*(.*)$/.exec(text)
  if (m) return { code: m[1], number: m[2].replace(/\s+/g, '') }
  return { code: fallbackCode, number: text.replace(/\s+/g, '') }
}

export function splitEmail(raw) {
  const [local = '', domain = ''] = (raw || '').trim().split('@')
  return { local, domain }
}
