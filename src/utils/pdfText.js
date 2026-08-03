import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// ── Getting text off an uploaded PDF ───────────────────────────────────────────
// Shared by the document readers. A bank statement and a payslip are read for completely
// different things, but both start here and both need the same thing from a PDF: its text
// items grouped back into the rows a person looking at the page would see. A PDF stores text
// as positioned runs with no notion of a line, so a label and the amount printed against it
// arrive as two unrelated items — only their shared baseline says they belong together.
//
// Nothing here interprets a document. A file with no text layer at all — a photo, a flat scan
// — yields no rows, and every caller treats that as "check it by hand", never as an error.

// A money token has to carry a decimal or a thousands separator. Bare integers are far more
// often reference numbers, cheque numbers or page counts than amounts.
export const MONEY = /^[+-]?(?:USD|KHR|\$|៛)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})\s*(?:USD|KHR|CR|DR)?[+-]?$/i

// The same shape found anywhere inside a longer string, for a cell that carries its label and
// its value together — "Net Pay: 850.00" is one text run as often as it is two.
const MONEY_INLINE = /[+-]?(?:USD|KHR|\$|៛)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})/gi

export function toNumber(text) {
  if (text === undefined || text === null) return null
  const n = parseFloat(String(text).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

// The amount a token is, or null when the whole token is not one.
export function moneyValue(token) {
  const m = MONEY.exec(String(token).trim())
  return m ? toNumber(m[1]) : null
}

// Every amount inside a string, in the order printed.
export function amountsIn(text) {
  return [...String(text).matchAll(MONEY_INLINE)].map(m => toNumber(m[1])).filter(v => v !== null)
}

// Items sharing a baseline are one row; rows run down the page.
function groupRows(cells) {
  const rows = []
  for (const cell of [...cells].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)) {
    const open = rows[rows.length - 1]
    if (open && open.page === cell.page && Math.abs(open.y - cell.y) <= 2.5) open.items.push(cell)
    else rows.push({ page: cell.page, y: cell.y, items: [cell] })
  }
  rows.forEach(r => r.items.sort((a, b) => a.x - b.x))
  return rows
}

export async function openPdf(file) {
  const buf = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data: buf }).promise
}

export async function readPdfRows(pdf) {
  const cells = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const { items } = await page.getTextContent()
    for (const item of items) {
      if (!item.str.trim()) continue
      // The width is kept as well as the position: it is what tells a gap between two words
      // apart from a gap between two columns — see rowCells.
      cells.push({ page: n, x: item.transform[4], y: item.transform[5], width: item.width || 0, text: item.str.trim() })
    }
  }
  return groupRows(cells)
}

// A row's items merged back into the cells a person would read as separate. Consecutive runs
// with only a word space between them are one cell; a wider gap is a column boundary. Without
// this a name comes back split down the middle ("SOK", "DARA") and a two-column layout reads
// as one long line, and label/value pairing needs to tell those two cases apart.
const COLUMN_GAP = 8
export function rowCells(row, gap = COLUMN_GAP) {
  const out = []
  let open = null
  for (const item of row.items) {
    if (open && item.x - open.end <= gap) {
      open.text += ` ${item.text}`
      open.end = item.x + item.width
    } else {
      open = { text: item.text, end: item.x + item.width }
      out.push(open)
    }
  }
  return out.map(c => c.text.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

// ── Reading a labelled field off a page ────────────────────────────────────────
// A payslip and an employment certificate are both laid out as label/value pairs across two or
// four columns, so a value is whatever follows its label: the rest of the same cell where the
// two were printed together, or the next cell along where they were not.
export function labelledValue(rows, patterns) {
  for (const row of rows) {
    const cells = rowCells(row)
    for (let i = 0; i < cells.length; i++) {
      const re = patterns.find(p => p.test(cells[i]))
      if (!re) continue
      const rest = cells[i].replace(re, '').replace(/^[\s:.\-–/]+/, '').trim()
      if (rest) return rest
      const next = cells.slice(i + 1).find(c => /[A-Za-z0-9]/.test(c))
      if (next) return next
    }
  }
  return ''
}

// The amount printed against a label. Taken from the label's own cell onwards, and the first
// one found rather than the last: a payslip that prints a year-to-date column puts it further
// right, and the figure being verified is this period's. `skip` drops a row a competing label
// has already claimed.
export function labelledAmount(rows, re, skip) {
  for (const row of rows) {
    const cells = rowCells(row)
    for (let i = 0; i < cells.length; i++) {
      if (!re.test(cells[i])) continue
      if (skip && skip.test(cells[i])) continue
      const found = amountsIn(cells.slice(i).join(' ')).filter(v => v > 0)
      if (found.length) return found[0]
    }
  }
  return null
}

// One line of text per visual row, whitespace collapsed and blank rows dropped.
export function rowLines(rows) {
  return rows.map(r => r.items.map(i => i.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
}

// The whole text layer as one string, rows separated by newlines. Kept independent of any
// table the reader may or may not have followed: a layout no row reader can make sense of
// still has perfectly readable names and figures printed on it.
const TEXT_LIMIT = 200000
export function rowsText(rows, limit = TEXT_LIMIT) {
  return rows
    .map(r => r.items.map(i => i.text).join(' '))
    .join(' \n ')
    .replace(/[ \t]+/g, ' ')
    .slice(0, limit)
}
