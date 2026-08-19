// ── Getting the data out ─────────────────────────────────────────────────────
// Every register and report could be printed or saved as PDF, and nothing could be opened in a
// spreadsheet. A finance team handed a PDF of the loan book retypes it — which is both the
// largest recurring manual cost in the system and the place errors get introduced. This exports
// the same rows the operator is looking at, through the same column definitions the table
// renders from, so what lands in Excel is what was on screen.

// A cell may only exist as JSX (a badge, a coloured figure). Walking the element tree for its
// text is the last resort — it always matches the screen, but it also carries the formatting,
// so a raw value is preferred wherever a column offers one.
function nodeText(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (typeof node === 'object' && node.props) return nodeText(node.props.children)
  return ''
}

const isPrimitive = v => v === null || ['string', 'number', 'boolean'].includes(typeof v)

// What one cell contributes, in order of how faithful it is to the underlying data:
// an explicit csv() the column supplies, then the value it sorts on (already the raw number or
// ISO date, which is what a spreadsheet wants), then the plain field, and only then the
// rendered text. Sorting on a value and exporting a different one would be a bug in waiting,
// which is why sortValue is preferred over re-deriving anything here.
export function cellText(col, row, ctx) {
  if (typeof col.csv === 'function') return col.csv(row, ctx)
  if (typeof col.sortValue === 'function') {
    const v = col.sortValue(row)
    if (isPrimitive(v) && v !== '') return v
  }
  const key = col.id ?? col.key
  const raw = row?.[key]
  if (isPrimitive(raw) && raw !== '') return raw
  if (typeof col.render === 'function') return nodeText(col.render(row, ctx))
  return ''
}

// RFC 4180 quoting, plus one thing that standard does not cover: a cell beginning with = + - @
// is executed as a formula by Excel and Sheets when the file is opened. Customer names, memos
// and remarks are free text typed by users, so they are prefixed with an apostrophe to land as
// text. Numbers are left alone — a negative amount must stay a number, or the export cannot be
// summed, which is the whole reason for exporting it.
function escapeCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  let text = String(value)
  const numeric = text.trim() !== '' && Number.isFinite(Number(text))
  if (!numeric && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Columns holding buttons carry no data, so they are dropped rather than exported as an empty
// column the reader has to account for.
const isDataColumn = col => (col.id ?? col.key) !== 'actions'

export function buildCsv(columns, rows, ctx) {
  const cols = (columns || []).filter(isDataColumn)
  const header = cols.map(c => escapeCell(c.label ?? c.id ?? c.key)).join(',')
  const body = (rows || []).map(row => cols.map(col => escapeCell(cellText(col, row, ctx))).join(','))
  // CRLF, which is what Excel expects; a lone \n splits rows inconsistently across its versions.
  return [header, ...body].join('\r\n')
}

// The byte-order mark is not decoration: without it Excel reads the file as the system codepage
// and every Khmer name in it opens as mojibake. Half this app's customer names are Khmer.
export function downloadCsv(filename, csv) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Freed on the next tick rather than immediately — Safari has not started the download yet
  // when click() returns, and revoking synchronously cancels it.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// Dated, so a folder of exports taken over a week is self-describing and two downloads on
// different days never collide in the browser's download folder.
export function csvFilename(name) {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `acabar-${name}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`
}

export function exportTableCsv(name, columns, rows, ctx) {
  downloadCsv(csvFilename(name), buildCsv(columns, rows, ctx))
  return (rows || []).length
}
