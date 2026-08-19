import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import {
  FileText, AlertTriangle, Clock, Landmark, ChevronLeft, BarChart3, Activity,
  ChevronDown, Printer, Download,
  Users, Banknote, CheckCircle, ClipboardList, Percent, Wallet, ShieldAlert,
  Receipt, Coins, Sheet,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useApp } from '../../context/AppContext'
import { formatVal, buildAmortizationData, formatAddress, daysBetweenISO } from '../../utils/format'
import { cashGlAccounts, buildCashMovements } from '../../utils/cash'
import StatusBadge from '../shared/StatusBadge'
import MobileCardList, { MobileCardTotal } from '../shared/MobileCardList'
import { exportTableCsv } from '../../utils/exportCsv'
import { useTableColumns, ColumnPicker } from '../shared/DataTableTools'
import { companyLogoSrc } from '../../utils/companyLogo'
import FinancialReportSection from './FinancialReportSection'
import ReportCard from './ReportCard'

// One definition drives the report selector, the report listing table and the
// rendered body below — adding a report here puts it in all three at once.
const REPORT_TABS = [
  { id: 'portfolio',        label: 'Portfolio',            icon: Users,         description: 'Borrower-level loan detail, and accounts, outstanding and arrears by grouping' },
  { id: 'repayments',       label: 'Repayment',            icon: Receipt,       description: 'Every collection, how it was allocated and where it was paid in' },
  { id: 'collection-sheet', label: 'Collection',           icon: Clock,         description: 'Installments due and overdue, for field collection' },
  { id: 'arrears',          label: 'Arrears / PAR',        icon: AlertTriangle, description: 'PAR aging and classification, grouped as needed' },
  { id: 'provision',        label: 'Provision',            icon: ShieldAlert,   description: 'Required provision by classification and reserve rate' },
  { id: 'disbursement',     label: 'Disbursement',         icon: Banknote,      description: 'Disbursed and pending-disbursement loans' },
  { id: 'income-report',    label: 'Income',               icon: Percent,       description: 'Interest, penalty and fee income by repayment' },
  { id: 'closed-loans',     label: 'Write-Off / Recovery', icon: CheckCircle,   description: 'How loans left the book — paid off, refinanced or written off' },
]

// One tab per area the loan book is reported on, in that order. The strip is itself the index,
// so there is no separate overview tab listing the others and no grouping field restating a
// label. Portfolio carries two views behind one tab — the borrower listing and the risk summary
// are the same area, and giving them a tab each would spend two of the eight on it.
const PORTFOLIO_VIEWS = [
  { value: 'listing', label: 'Borrower Listing' },
  { value: 'summary', label: 'Risk Summary' },
]

const BREAKDOWN_SORTING_LABELS = {
  gender: 'Gender',
  business_type: 'Business Type',
  repayment_type: 'Repayment Type',
  product_type: 'Product Type',
  balance_band: 'Balance Band',
  loan_note: 'Loan Note',
  collateral: 'Collateral',
  provision: 'Loan Provision',
}

// Outstanding-balance bands. These are ordered, so grouping by band sorts by the
// band's position rather than alphabetically on its label.
const BALANCE_BANDS = ['$0 – $2,000', '$2,001 – $5,000', '$5,001 – $10,000', '$10,001 – $25,000', '$25,001+']

function balanceBand(value) {
  const v = Number(value || 0)
  if (v <= 2000)  return BALANCE_BANDS[0]
  if (v <= 5000)  return BALANCE_BANDS[1]
  if (v <= 10000) return BALANCE_BANDS[2]
  if (v <= 25000) return BALANCE_BANDS[3]
  return BALANCE_BANDS[4]
}

// Groupings offered by the Portfolio & Risk Summary report — one report replaces the
// former Company / CO / Repayment Type / Areas Base variants.
const SUMMARY_GROUPS = [
  { value: 'company',        label: 'Company (consolidated)', column: 'Company',        key: () => 'Company Total' },
  { value: 'officer',        label: 'Credit Officer',         column: 'CO Name',        key: l => l.creditOfficer || 'Unassigned' },
  { value: 'branch',         label: 'Branch / Area',          column: 'Branch / Area',  key: l => l.branch || 'Unassigned' },
  { value: 'repayment_type', label: 'Repayment Type',         column: 'Repayment Type', key: l => l.repaymentType || 'Unspecified' },
  { value: 'product',        label: 'Product Type',           column: 'Product Type',   key: l => l.product || 'Unspecified' },
]

// NBC-style arrears aging. A loan sits in the band its worst unsettled installment puts it in;
// `rateNum` is the reserve rate the Loan Loss Provision report multiplies against outstanding
// principal. These bands and rates are regulatory policy — unlike the figures they classify,
// they are not derived from the register.
const AGING_BANDS = [
  { bucket: 'Current (0 Days)',            classification: 'Normal',          rate: '1%',   rateNum: 1,   maxDaysLate: 0 },
  { bucket: '1–30 Days Arrears',           classification: 'Special Mention', rate: '3%',   rateNum: 3,   maxDaysLate: 30 },
  { bucket: '31–60 Days Arrears',          classification: 'Sub-Standard',    rate: '20%',  rateNum: 20,  maxDaysLate: 60 },
  { bucket: '61–90 Days Arrears',          classification: 'Doubtful',        rate: '50%',  rateNum: 50,  maxDaysLate: 90 },
  { bucket: '90+ Days Arrears (Default)',  classification: 'Loss/Write-off',  rate: '100%', rateNum: 100, maxDaysLate: Infinity },
]

// How the Arrears report can be grouped. Aging keeps the classification and reserve rate
// columns; the other two are plain accounts/outstanding/arrears breakdowns, keyed off a
// field of the loan itself.
const ARREARS_GROUPS = [
  { value: 'aging',   label: 'Aging Bucket',  column: 'Aging Bucket'   },
  { value: 'product', label: 'Loan Type',     column: 'Loan Type',     key: l => l.product || 'Unspecified' },
  { value: 'area',    label: 'Area / Branch', column: 'Area / Branch', key: l => l.branch || 'Unassigned' },
]

// Mirrors the Dashboard KPI card so the two modules read as one system.
function KpiCard({ label, value, sub, icon: Icon, iconBg, valueClass = 'text-2xl' }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={`${valueClass} font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-none`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// Report Type — one horizontal row of tabs, with whatever does not fit behind a More menu
// rather than a sideways scroll. A scrolling strip hides reports off the edge with nothing to
// say they are there; a More button says how many are hidden and opens them in one click.
//
// How many fit is measured, not guessed: a hidden copy of the row is laid out at natural width
// and its tabs are added up against the space available, reserving room for More itself. Until
// that measurement lands (and where there is no layout to measure, as on a server render) every
// tab renders, so nothing is ever unreachable.
const TAB_GAP_PX = 4
const MORE_WIDTH_PX = 116

// The Financial Report's tab, to the letter — the two report modules sit behind the same
// Reports entry, and a tab that looked and highlighted differently in each read as two
// different controls. See STATEMENT_TABS in FinancialReportSection.jsx.
const tabCls = (active) => `h-auto flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${
  active
    ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-[#0047ab] dark:hover:text-blue-400'
    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
}`

// Which tabs go on the row and which go behind More. The open report is always on the row,
// never buried in the menu — the one tab that has to be visible is the one saying where you
// are. It takes the last inline slot, and the tab it displaces drops into More in its declared
// position rather than at the front, so the menu's order never shuffles as you move around.
export function splitReportTabs(tabs, fitCount, activeId) {
  const n = Math.max(1, Math.min(fitCount, tabs.length))
  const head = tabs.slice(0, n)
  const tail = tabs.slice(n)
  if (!tail.some(t => t.id === activeId)) return { visible: head, overflow: tail }

  const active = tail.find(t => t.id === activeId)
  const displaced = head[head.length - 1]
  const inTail = new Set(tail)
  return {
    visible: [...head.slice(0, -1), active],
    overflow: tabs.filter(t => t.id !== activeId && (t === displaced || inTail.has(t))),
  }
}

function ReportTypeTabs({ value, onChange }) {
  const rowRef = useRef(null)
  const measureRef = useRef(null)
  const tabRefs = useRef({})
  const [fitCount, setFitCount] = useState(REPORT_TABS.length)
  const [moreOpen, setMoreOpen] = useState(false)
  const ids = REPORT_TABS.map(t => t.id)

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return

    function compute() {
      const available = row.clientWidth
      const widths = Array.from(measure.children).map(el => el.offsetWidth + TAB_GAP_PX)
      let used = 0
      let n = 0
      for (let i = 0; i < widths.length; i++) {
        // The last tab needs no room for More — if it fits, there is nothing to overflow.
        const reserve = i === widths.length - 1 ? 0 : MORE_WIDTH_PX
        if (used + widths[i] > available - reserve) break
        used += widths[i]
        n += 1
      }
      setFitCount(Math.max(1, n))
    }

    compute()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [])

  const { visible, overflow } = splitReportTabs(REPORT_TABS, fitCount, value)

  function handleKey(e) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    let next = null
    if (e.key === 'Home') next = ids[0]
    else if (e.key === 'End') next = ids[ids.length - 1]
    else if (step) next = ids[(ids.indexOf(value) + step + ids.length) % ids.length]
    if (!next) return
    e.preventDefault()
    onChange(next)
    tabRefs.current[next]?.focus()
  }

  function pick(id) {
    setMoreOpen(false)
    onChange(id)
  }

  return (
    <div className="relative bg-white dark:bg-slate-800 rounded-2xl overflow-visible px-4 py-3">
      {/* Measured, never seen: the same tabs at natural width, so the row above knows what fits. */}
      <div ref={measureRef} aria-hidden="true" className="absolute invisible pointer-events-none flex gap-1 whitespace-nowrap">
        {REPORT_TABS.map(t => (
          <span key={t.id} className={tabCls(false)}><t.icon className="w-3.5 h-3.5" />{t.label}</span>
        ))}
      </div>

      <div ref={rowRef} className="flex items-center gap-1 min-w-0">
        <div role="tablist" aria-label="Report type" onKeyDown={handleKey} className="flex items-center gap-1 min-w-0">
          {visible.map(t => {
            const active = t.id === value
            return (
              <button
                key={t.id}
                id={`report-tab-${t.id}`}
                role="tab"
                aria-selected={active}
                aria-controls="report-panel"
                tabIndex={active ? 0 : -1}
                ref={el => { tabRefs.current[t.id] = el }}
                onClick={() => onChange(t.id)}
                title={t.description}
                className={tabCls(active)}
              >
                <t.icon className="w-3.5 h-3.5 flex-shrink-0" />
                {t.label}
              </button>
            )
          })}
        </div>

        {overflow.length > 0 && (
          <div className="relative ml-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => setMoreOpen(o => !o)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={`flex items-center gap-1 ${tabCls(false)}`}
            >
              More
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                {overflow.length}
              </span>
              <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && (
              <>
                {/* Catches the outside click. Under the menu, over everything else. */}
                <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                <div role="menu" className="absolute right-0 mt-1 z-30 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-1 max-h-80 overflow-y-auto">
                  {overflow.map(t => (
                    <button
                      key={t.id}
                      role="menuitem"
                      onClick={() => pick(t.id)}
                      title={t.description}
                      className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <t.icon className="w-3.5 h-3.5 flex-shrink-0" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inline report filters ───────────────────────────────────────────────────
// The consolidated reports differ from each other only by a grouping, a status or
// a date range, so each carries its filters in the table header rather than on a
// separate criteria screen.
const FilterSelect = ({ label, value, onChange, options, width = 'w-44' }) => (
  <div className="flex items-center gap-2">
    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{label}</label>
    <div className={`relative ${width}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
    </div>
  </div>
)

const DateRangeFilter = ({ label, from, to, onFrom, onTo }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{label}</label>
    <input
      type="date" value={from} onChange={e => onFrom(e.target.value)}
      className="w-36 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
    <span className="text-[11px] text-slate-400 dark:text-slate-500">to</span>
    <input
      type="date" value={to} onChange={e => onTo(e.target.value)}
      className="w-36 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  </div>
)

const Th = ({ children, right }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 first:rounded-tl-xl last:rounded-tr-xl ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </th>
)

// Loan Portfolio (accounts + outstanding) is drawn from real, disbursed loans grouped
// by whichever dimension the filter selected. Arrears figures require per-loan
// repayment schedules that aren't persisted on the loan record, so they stay 0 until
// that data is available.
function buildPortfolioSummaryRows(loanApplications, { groupBy, from, to }) {
  const group = SUMMARY_GROUPS.find(g => g.value === groupBy) || SUMMARY_GROUPS[1]

  const byGroup = new Map()
  loanApplications
    .filter(l => l.status === 'Active' && inDisbursedRange(l, from, to))
    .forEach(loan => {
      const name = group.key(loan)
      const entry = byGroup.get(name) || { key: name, name, accounts: 0, outstanding: 0 }
      entry.accounts += 1
      entry.outstanding += loan.amount || 0
      byGroup.set(name, entry)
    })

  return Array.from(byGroup.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// An empty bound means "unbounded", so a blank pair covers every disbursement date.
function inDisbursedRange(loan, from, to) {
  const d = loan.disbursementDate || ''
  if (from && (!d || d < from)) return false
  if (to && (!d || d > to)) return false
  return true
}

// jsPDF's built-in fonts have no glyph for "→", so it prints as a garbled character —
// swap it for an ASCII-safe separator only in text bound for PDF export.
const pdfSafe = (str) => String(str ?? '').replace(/→/g, '->')

const fmt2 = n => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Only primitives can go into a PDF cell. A column whose `render` returns an element
// (a status badge, say) falls back to the row's raw value for that key; a column can
// also state its PDF text outright with `text`.
function cellText(col, row) {
  if (col.text) return String(col.text(row) ?? '')
  const rendered = col.render ? col.render(row) : row[col.key]
  if (rendered == null) return ''
  if (typeof rendered === 'object') return String(row[col.key] ?? '')
  return String(rendered)
}

const fileSlug = (str) => String(str)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

// Shown only in the print output (see .print-only in globals.css) — on screen the report's
// name is the page heading, but paper needs the company and report named on the sheet.
function PrintReportHeader({ title, meta }) {
  const { state } = useApp()
  return (
    <div className="print-only text-center mb-3">
      <img src={companyLogoSrc(state.companyProfile)} alt={state.companyProfile.name} className="w-14 h-14 mx-auto object-contain mb-1" />
      <p className="text-base font-bold text-slate-900">{state.companyProfile.name.toUpperCase()}</p>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {meta && <p className="text-xs text-slate-600">{meta}</p>}
    </div>
  )
}

// The report's name is already the page heading, so the card carries no title or
// subtitle of its own — its header is the filter row (`toolbar`, which leads with the
// Report Type selector) on the left, then the record count and the Print / Download
// actions. `totals` renders a sticky footer row, keyed by column so money columns line
// up with the data. `reportTitle` names the sheet on paper and in the PDF; `meta` is the
// one-line filter summary printed under it.
function SimpleReportTable({ tableId, reportTitle, meta, count, columns: allColumns, rows, toolbar, totals, emptyMessage = 'No records found.' }) {
  const { state, dispatch, showToast } = useApp()
  const { companyProfile } = state

  // These reports run wide — ten columns on the collection sheet — and an officer working one
  // question ("who is overdue and by how much") wants four of them. The choice is kept per
  // report in the reducer, so the view an operator sets is the view they get back tomorrow.
  // `key` is this table's column identifier; the picker's is `id`.
  const pickerColumns = useMemo(() => allColumns.map(c => ({ id: c.key, label: c.label })), [allColumns])
  const { visibleIds, toggle } = useTableColumns(pickerColumns, {
    value: tableId ? state.reportColumns?.[tableId] : null,
    onChange: tableId ? (ids => dispatch({ type: 'SET_REPORT_COLUMNS', table: tableId, ids })) : null,
  })
  // Hiding a column narrows print and PDF export too — the point of hiding it is usually to
  // get the sheet down to what fits on paper.
  const columns = useMemo(
    () => (tableId ? allColumns.filter(c => visibleIds.includes(c.key)) : allColumns),
    [tableId, allColumns, visibleIds]
  )

  // Wide reports would clip on portrait A4 — those print and export landscape.
  const landscape = columns.length > 6

  function handlePrint() {
    const styleId = 'print-orientation-override'
    let style = document.getElementById(styleId)
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    style.textContent = `@media print { @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm 12mm; } }`
    const cleanup = () => { style.remove(); window.removeEventListener('afterprint', cleanup) }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  function handleDownload() {
    const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text(reportTitle, 14, 21)
    if (meta) doc.text(pdfSafe(meta), 14, 26)

    autoTable(doc, {
      startY: meta ? 31 : 27,
      head: [columns.map(c => c.label)],
      body: rows.map(row => columns.map(c => pdfSafe(cellText(c, row)))),
      foot: totals
        ? [columns.map((c, i) => i === 0 ? (totals.label ?? 'Total') : pdfSafe(totals[c.key] ?? ''))]
        : undefined,
      styles: { fontSize: landscape ? 7 : 8 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [239, 246, 255], textColor: [30, 58, 138], fontStyle: 'bold' },
      columnStyles: Object.fromEntries(
        columns.map((c, i) => [i, { halign: c.right ? 'right' : 'left' }])
      ),
    })

    doc.save(`${fileSlug(reportTitle)}.pdf`)
    // A download is otherwise silent — the file lands in the browser's downloads with nothing
    // on screen to say it worked.
    showToast(`${reportTitle} downloaded`, 'success')
  }

  // The card can't clip its own overflow any more: the column picker's panel drops out of the
  // header row, and on a short report (or one filtered down to no rows) a clipping card would
  // cut the list off with no way to scroll to the rest. The scroll box below rounds its own
  // bottom corners instead, which is all the clipping was doing.
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {toolbar && <div className="flex items-center gap-x-4 gap-y-2 flex-wrap min-w-0">{toolbar}</div>}
        <div className="flex items-center gap-2 flex-shrink-0 lg:ml-auto">
          {count != null && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mr-1">{count} records</p>
          )}
          {tableId && (
            <div className="print:hidden">
              <ColumnPicker
                columns={pickerColumns}
                visibleIds={visibleIds}
                onToggle={toggle}
                iconOnly
                className="py-1.5 rounded-lg"
              />
            </div>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          {/* Two formats, each named for what it produces — the old single "Download" button
              said nothing about which. CSV is what a finance team can actually work with: the
              same rows and the same visible columns, opened in a spreadsheet instead of
              retyped out of a PDF. */}
          <button
            onClick={() => {
              const n = exportTableCsv(reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'), columns, rows)
              showToast(`${n} row${n === 1 ? '' : 's'} exported to CSV`, 'success')
            }}
            disabled={rows.length === 0}
            title={rows.length ? 'Open this report in a spreadsheet' : 'Nothing to export'}
            className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sheet className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 border border-brand-100 dark:border-brand-800 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
        </div>
      </div>
      <div className="printable-area">
      <PrintReportHeader title={reportTitle} meta={meta} />
      {/* From md the report is a table — a report is read by comparing rows down a column,
          and that is what a table is for. Below md there is no width to compare across: the
          same rows are stacked as cards (see below), each one a record with its columns as
          labelled lines. Printing always takes the table, whatever the screen it was
          triggered from — a printed report is A4, not 375px. */}
      <div className="hidden md:block print:block overflow-x-auto max-h-[460px] overflow-y-auto rounded-b-2xl">
        <table className="w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map(col => <Th key={col.key} right={col.right}>{col.label}</Th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-sm text-slate-400">{emptyMessage}</td>
              </tr>
            ) : rows.map((row, i) => (
              <tr key={row.key ?? i} className={`hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${row.rowClass || ''}`}>
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-3 text-xs text-slate-600 dark:text-slate-300 ${col.right ? 'text-right' : ''} ${col.className || ''}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10">
              <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                {columns.map((col, i) => (
                  <td key={col.key} className={`px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 ${col.right ? 'text-right' : ''}`}>
                    {i === 0 ? (totals.label ?? 'Total') : (totals[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Mobile: the same rows as cards. Every report on every tab goes through this one
          renderer, so they all read the same way on a phone. */}
      <MobileCardList
        className="max-h-[460px] rounded-b-2xl"
        columns={columns}
        rows={rows}
        rowKey={(row, i) => row.key ?? i}
        renderCell={(col, row) => (col.render ? col.render(row) : row[col.key])}
        emptyMessage={emptyMessage}
        footer={totals && (
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{totals.label ?? 'Total'}</p>
            {/* Only the columns a total was computed for — a blank line against every other
                column would bury the two or three figures that are the point of the row. */}
            {columns.slice(1).filter(col => totals[col.key] != null && totals[col.key] !== '').map(col => (
              <MobileCardTotal key={col.key} label={col.label} value={totals[col.key]} />
            ))}
          </div>
        )}
      />
      </div>
    </div>
  )
}

const PENDING_DISBURSE_STATUSES = ['In Progress', 'Pending Approval', 'Waiting Disburse']

// Disbursed and not-yet-disbursed loans are the same lifecycle report — one row set,
// tagged so the report can filter to either side.
function buildDisbursementRows(loanApplications) {
  return loanApplications
    .filter(l => l.status === 'Active' || PENDING_DISBURSE_STATUSES.includes(l.status))
    .map(l => ({ ...l, key: l.ref, stage: l.status === 'Active' ? 'Disbursed' : 'Pending Disbursement' }))
}

const round2 = n => Math.round((n || 0) * 100) / 100
const dmy = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB') : '—')

// A disbursed loan carries its schedule on the record — RECORD_REPAYMENT writes what was
// actually collected back onto it — so the operational reports read that rather than deriving
// their own. A loan with no stored schedule (never disbursed, or saved before schedules were
// kept there) falls back to the amortization its own terms imply — its balloon residual included,
// or the fallback would report a balloon loan as a level one and understate the lump the borrower
// owes at maturity. Its structure travels with it for the same reason — a declining loan reported
// as a level one would misstate every instalment in the report.
function loanSchedule(loan) {
  if (loan.schedule?.length) return loan.schedule
  if (!loan.amount || !loan.interestRate) return []
  return buildAmortizationData(loan.amount, loan.interestRate, loan.installments || 12, loan.firstInstallment, 0, loan.disbursementDate, loan.currency, loan.balloonPercent || 0, loan.structure || 'Amortizing').rows
}

const isLive = loan => loan.status === 'Active'
const isSettled = row => row.status === 'Paid'
// What an installment still owes. A partial payment settles part of it, so the rest stays
// collectable rather than the whole installment dropping off the sheet or staying on it whole.
const stillOwed = row => Math.max(round2((row.totalDue || 0) + (row.lateFee || 0) - (row.paid || 0)), 0)

// Installments already due on a live loan and not yet settled — the round to collect today.
function buildCollectionRows(loanApplications, todayISO) {
  const rows = []
  loanApplications.filter(isLive).forEach(loan => {
    loanSchedule(loan).forEach((row, i) => {
      if (isSettled(row) || !row.dueDateISO || row.dueDateISO > todayISO) return
      const daysLate = Math.max(daysBetweenISO(row.dueDateISO, todayISO), 0)
      rows.push({
        key: `${loan.ref}-${row.num ?? i + 1}`,
        ref: loan.ref,
        // Each row states the money it is in, so a report holding both prints every figure in
        // its own currency instead of one global guess.
        currency: loan.currency || 'USD',
        customer: loan.customerName || loan.customerCode || '—',
        product: loan.product || '—',
        installment: row.num ?? i + 1,
        dueDate: daysLate === 0 ? 'Today' : (row.dueDate || dmy(row.dueDateISO)),
        daysLate,
        amount: stillOwed(row),
        branch: loan.branch || '—',
        creditOfficer: loan.creditOfficer || '—',
        status: daysLate === 0 ? 'Due Today' : 'Overdue',
      })
    })
  })
  // Longest overdue first — that is the order the arrears are worked in.
  return rows.sort((a, b) => b.daysLate - a.daysLate || String(a.ref).localeCompare(String(b.ref)))
}

// Per-loan arrears state — outstanding principal, how much is overdue, and how late the worst
// unsettled installment is. Both the Arrears and the Provision report are built on this.
function buildLoanArrears(loanApplications, todayISO) {
  return loanApplications.filter(isLive).map(loan => {
    const schedule = loanSchedule(loan)
    // Outstanding is principal still owed, not the remaining total due: future interest has
    // not been earned yet and is not part of what is at risk.
    const principalPaid = schedule.reduce((s, r) => s + (r.principalPaid || 0), 0)
    let arrears = 0
    let daysLate = 0
    schedule.forEach(row => {
      if (isSettled(row) || !row.dueDateISO || row.dueDateISO >= todayISO) return
      arrears += stillOwed(row)
      daysLate = Math.max(daysLate, daysBetweenISO(row.dueDateISO, todayISO))
    })
    return {
      loan,
      currency: loan.currency || 'USD',
      outstanding: Math.max(round2((loan.amount || 0) - principalPaid), 0),
      arrears: round2(arrears),
      daysLate,
    }
  })
}

const agingBandFor = daysLate =>
  AGING_BANDS.find(b => daysLate <= b.maxDaysLate) || AGING_BANDS[AGING_BANDS.length - 1]

function buildArrearsRows(loanArrears, group) {
  const tally = rows => ({
    accounts: rows.length,
    outstanding: round2(rows.reduce((s, a) => s + a.outstanding, 0)),
    arrears: round2(rows.reduce((s, a) => s + a.arrears, 0)),
  })
  if (!group.key) {
    // Every band is listed even at zero: a classification that vanishes when empty reads as
    // "nothing in default" when it should read as "nothing in default yet".
    return AGING_BANDS.map(band => ({
      key: band.bucket, name: band.bucket, bucket: band.bucket,
      classification: band.classification, rate: band.rate, rateNum: band.rateNum,
      ...tally(loanArrears.filter(a => agingBandFor(a.daysLate).bucket === band.bucket)),
    }))
  }
  const byGroup = new Map()
  loanArrears.forEach(a => {
    const name = group.key(a.loan)
    byGroup.set(name, [...(byGroup.get(name) || []), a])
  })
  return Array.from(byGroup.entries())
    .map(([name, rows]) => ({ key: name, name, ...tally(rows) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Money that actually moved: every disbursement released and every repayment collected.
// Neither carries a clock time on the record, so the time column reads '—'.
function buildTransactionRows(loanApplications) {
  const rows = []
  loanApplications.forEach(loan => {
    const who = {
      ref: loan.ref,
      customer: loan.customerName || loan.customerCode || '—',
      officer: loan.creditOfficer || '—',
    }
    if (loan.disbursementDate && (isLive(loan) || loan.status === 'Refinanced')) {
      rows.push({ ...who, dateISO: loan.disbursementDate, time: '—', type: 'Disbursement',
        amount: loan.amount || 0, method: loan.disbursementMethod || '—', balanceAfter: null })
    }
    loanSchedule(loan).forEach(row => {
      if (!row.paidDate || !(row.paid > 0)) return
      rows.push({ ...who, dateISO: row.paidDate, time: '—', type: 'Repayment',
        amount: row.paid, method: row.paymentMethod || '—', balanceAfter: row.balance ?? null })
    })
  })
  return rows
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO))
    .map((r, i) => ({ ...r, date: dmy(r.dateISO), key: `${r.ref}-${r.dateISO}-${i}` }))
}

// ── Repayment / cash / income / bank ────────────────────────────────────────
// One row per collection: what came in, how it was allocated across principal and each kind
// of income, and which account it was paid into. Collections made before repayments were
// recorded as transactions of their own live only on the loan's schedule, so those are
// rebuilt from it — matched on loan/installment so a collection is never listed twice.
// A rebuilt row can't name a payment account: nothing recorded one at the time.
function buildRepaymentReportRows(repayments, loanApplications) {
  const recorded = (repayments || []).map(r => ({
    key: r.id,
    id: r.id,
    dateISO: r.date,
    customer: r.customerName || r.customerCode || '—',
    loanRef: r.loanRef,
    installment: r.installmentNum,
    total: r.total || 0,
    principal: r.allocation?.principal || 0,
    interest: r.allocation?.interest || 0,
    penalty: r.allocation?.penalty || 0,
    fee: r.allocation?.fee || 0,
    method: r.paymentMethod || '—',
    account: (r.payments || []).map(p => `${p.accountLabel}${(r.payments.length > 1) ? ` (${fmt2(p.amount)})` : ''}`).join(' + ') || '—',
    currency: r.currency,
  }))

  const alreadyRecorded = new Set((repayments || []).map(r => `${r.loanRef}#${r.installmentNum}#${r.kind}`))
  const rebuilt = []
  for (const loan of loanApplications) {
    for (const row of loanSchedule(loan)) {
      if (!isSettled(row) && row.status !== 'Partial') continue
      const remainder = round2(row.remainderPaid)
      const collected = round2((row.paid || 0) - remainder)
      const base = {
        dateISO: row.paidDate, customer: loan.customerName || loan.customerCode || '—',
        loanRef: loan.ref, installment: row.num, currency: loan.currency,
        method: row.paymentMethod || '—', account: '—', fee: 0,
      }
      if (collected > 0.005 && !alreadyRecorded.has(`${loan.ref}#${row.num}#installment`)) {
        const penalty = round2(row.lateFeePaid ?? row.lateFee)
        const principal = round2((row.principalPaid ?? row.principal) - remainder)
        rebuilt.push({
          ...base, key: `${loan.ref}-${row.num}`, id: '—', total: collected,
          principal, penalty, interest: round2(collected - principal - penalty),
        })
      }
      if (remainder > 0.005 && !alreadyRecorded.has(`${loan.ref}#${row.num}#remainder`)) {
        rebuilt.push({
          ...base, key: `${loan.ref}-${row.num}-r`, id: '—',
          dateISO: row.remainderPaidDate || row.paidDate,
          method: row.remainderPaymentMethod || '—',
          total: remainder, principal: remainder, interest: 0, penalty: 0,
        })
      }
    }
  }
  return [...recorded, ...rebuilt]
    .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''))
    .map(r => ({ ...r, date: dmy(r.dateISO) }))
}

// A cashier's day, per till: what moved through it and how the drawer counted against the
// books at the end of it. A day with movements but no count is still listed — "nobody counted
// this drawer" is exactly what a cash report should surface — and a count taken on a quiet day
// is listed too, so a count can never go missing from the report that exists to show it.
function buildCashReportRows(state, cashAccounts) {
  const byDay = new Map()
  const dayKey = (code, date) => `${code}|${date}`
  for (const account of cashAccounts) {
    const movements = buildCashMovements(state, account)
    for (const m of movements) {
      const key = dayKey(account.code, m.date)
      const day = byDay.get(key) || {
        key, dateISO: m.date, account, cashIn: 0, cashOut: 0, balance: 0,
      }
      day.cashIn = round2(day.cashIn + m.cashIn)
      day.cashOut = round2(day.cashOut + m.cashOut)
      // Movements arrive oldest first, so the last one seen for a day closes it.
      day.balance = m.balance
      byDay.set(key, day)
    }
  }
  for (const count of state.cashCounts || []) {
    const account = cashAccounts.find(a => a.code === count.cashAccountCode)
    if (!account) continue
    const key = dayKey(count.cashAccountCode, count.date)
    const day = byDay.get(key) || { key, dateISO: count.date, account, cashIn: 0, cashOut: 0, balance: count.systemBalance }
    byDay.set(key, { ...day, count })
  }
  return [...byDay.values()]
    .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''))
    .map(day => ({
      key: day.key,
      date: dmy(day.dateISO),
      dateISO: day.dateISO,
      cashier: day.count?.cashier || '—',
      accountCode: day.account.code,
      accountLabel: `${day.account.name} (${day.account.currency || 'USD'})`,
      currency: day.account.currency || 'USD',
      cashIn: day.cashIn,
      cashOut: day.cashOut,
      // What the books say the drawer holds. The count's own figure is used where one was
      // taken, so the report shows the comparison the cashier actually made.
      systemBalance: day.count ? day.count.systemBalance : day.balance,
      physical: day.count ? day.count.physical : null,
      difference: day.count ? day.count.difference : null,
      status: day.count ? day.count.status : 'NOT COUNTED',
    }))
}

// What the book earned, by kind. Rows written before repayment income was split by type carry
// no `incomeType`, so it is read off the category they were filed under.
const INCOME_TYPE_BY_CATEGORY = {
  'Repayment Income': 'Interest Income',
  'Late Penalty Fees': 'Penalty Income',
  'Loan Fee Income': 'Fee Income',
  'Refinance Fee': 'Fee Income',
}
const incomeTypeOf = i => i.incomeType || INCOME_TYPE_BY_CATEGORY[i.category] || i.category || 'Other Income'

function buildIncomeReportRows(incomes) {
  return (incomes || [])
    .map((i, idx) => ({
      key: `${i.code}-${i.date}-${idx}`,
      dateISO: i.date,
      date: dmy(i.date),
      repaymentId: i.repaymentId || '—',
      client: i.customerName || i.source || '—',
      incomeType: incomeTypeOf(i),
      amount: i.amount || 0,
      currency: i.currency || 'USD',
    }))
    .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''))
}

// A real bank account's own statement, one row per movement with the balance it left. Bank
// repayments are read off the collections themselves (the whole amount received, not the
// income half of it), which is why the income rows those collections wrote are skipped —
// counting both would report the interest twice.
function buildBankReportRows(state, account) {
  const code = account.glCode
  const nameOf = c => state.chartOfAccounts.find(a => a.code === c)?.name || c || '—'
  const rows = [
    ...(state.repayments || []).flatMap(r => (r.payments || [])
      .filter(p => p.accountCode === code && p.method === 'Bank')
      .map(p => ({
        key: `${r.id}-${p.accountCode}`, dateISO: r.date,
        reference: r.id, source: `Loan Repayment — ${r.customerName || r.loanRef}`,
        bankIn: p.amount, bankOut: 0,
      }))),
    ...(state.incomes || []).filter(i => i.account === code && !i.repaymentId).map((i, idx) => ({
      key: `inc-${i.code}-${idx}`, dateISO: i.date,
      reference: i.code, source: i.category || 'Income',
      bankIn: i.amount || 0, bankOut: 0,
    })),
    ...(state.expenses || []).filter(e => e.status === 'Approved' && e.account === code).map(e => ({
      key: `exp-${e.code}`, dateISO: e.date,
      reference: e.code, source: e.category || 'Expense',
      bankIn: 0, bankOut: e.amount || 0,
    })),
    ...(state.cashTransfers || []).filter(t => t.fromCode === code || t.toCode === code).map(t => {
      const isOut = t.fromCode === code
      const credited = t.creditedAmount ?? round2((t.amount || 0) * (Number(t.exchangeRate) > 0 ? Number(t.exchangeRate) : 1))
      return {
        key: `ct-${t.ref}`, dateISO: t.date, reference: t.ref,
        source: isOut ? `Transfer to ${nameOf(t.toCode)}` : `Transfer from ${nameOf(t.fromCode)}`,
        bankIn: isOut ? 0 : credited, bankOut: isOut ? (t.amount || 0) : 0,
      }
    }),
  ].sort((a, b) => (a.dateISO || '').localeCompare(b.dateISO || ''))

  // Walked forward from the opening balance these movements imply, so the last row lands on
  // the balance the chart of accounts holds — see buildCashMovements for the same reasoning.
  const glBalance = state.chartOfAccounts.find(a => a.code === code)?.balance || 0
  const net = rows.reduce((s, r) => s + r.bankIn - r.bankOut, 0)
  let running = round2(glBalance - net)
  return rows
    .map(r => {
      running = round2(running + r.bankIn - r.bankOut)
      return { ...r, balance: running, date: dmy(r.dateISO) }
    })
    .reverse()
}

// Totals for a report whose rows each state their own currency. Dollars and riel are
// different money and are never added together (see architecture.md), so a mixed result set
// gets no footer at all rather than one summing two currencies into a meaningless number —
// filter the report to one currency to total it.
// A figure summed over rows that may be in different currencies. Dollars and riel are never
// added: each currency is totalled on its own and they are printed side by side, so a book
// holding both reads "$4,200.00 · ៛20,000,000" rather than one number that is neither.
function perCurrencyTotal(rows, pick) {
  const totals = new Map()
  for (const r of rows || []) {
    const c = r.currency || 'USD'
    totals.set(c, (totals.get(c) || 0) + (pick(r) || 0))
  }
  const parts = [...totals.entries()].filter(([, v]) => Math.abs(v) > 0.005)
  if (!parts.length) return formatVal(0, 'USD', 1)
  return parts.map(([c, v]) => formatVal(v, c, 1)).join(' · ')
}

function singleCurrencyTotals(rows, columns) {
  const currencies = new Set(rows.map(r => r.currency || 'USD'))
  if (currencies.size !== 1) return null
  const currency = [...currencies][0]
  return Object.fromEntries(
    columns.map(key => [key, formatVal(rows.reduce((s, r) => s + (r[key] || 0), 0), currency, 1)])
  )
}

// A loan leaves the book one of three ways: paid to the last cent, refinanced into a
// replacement, or written off as uncollectable.
//
// A write-off is recognised off `status === 'Written Off'`. Nothing in the app sets that yet —
// there is a `write_off` permission in the role matrix but no action behind it — so the
// category reports nothing until one exists. It is handled here rather than left out because
// a write-off is the closure a loan book is actually judged on: a report that can only show
// the two happy endings overstates how the portfolio ended.
const WRITTEN_OFF = 'Written Off'

function buildClosedLoanRows(loanApplications) {
  const rows = []
  loanApplications.forEach(loan => {
    const schedule = loanSchedule(loan)
    const settled = schedule.filter(isSettled)
    const paidOff = isLive(loan) && schedule.length > 0 && settled.length === schedule.length
    const writtenOff = loan.status === WRITTEN_OFF
    if (!paidOff && !writtenOff && loan.status !== 'Refinanced') return
    const last = settled[settled.length - 1]
    const closureISO = paidOff ? last?.paidDate : (loan.closedDate || loan.disbursementDate)
    // Amount at closure is what left the book to close it: the payment that settled the last
    // installment, the principal a replacement loan took over, or — for a write-off — the
    // principal still outstanding, since that is the loss recognised.
    const principalPaid = schedule.reduce((s, r) => s + (r.principalPaid || 0), 0)
    const outstanding = Math.max(round2((loan.amount || 0) - principalPaid), 0)
    rows.push({
      key: loan.ref,
      ref: loan.ref,
      customer: loan.customerName || loan.customerCode || '—',
      product: loan.product || '—',
      originalAmount: loan.amount || null,
      closureISO: closureISO || '',
      closureDate: dmy(closureISO),
      amount: paidOff ? round2(last?.paid) : outstanding,
      closure: paidOff ? 'Paid Off' : writtenOff ? WRITTEN_OFF : 'Refinanced',
      detail: paidOff
        ? (last?.paymentMethod || '—')
        : writtenOff
          ? (loan.writeOffReason || 'Written off as uncollectable')
          : `Refinanced into ${loan.refinancedToRef || 'a replacement loan'}`,
      approvedBy: (writtenOff ? loan.writtenOffBy : loan.approvedBy) || loan.approvedBy || '—',
    })
  })
  return rows.sort((a, b) => (b.closureISO || '').localeCompare(a.closureISO || ''))
}


const BREAKDOWN_SORT_KEY = {
  gender: r => r.gender,
  business_type: r => r.businessType,
  repayment_type: r => r.repaymentType,
  product_type: r => r.product,
  // Balance band absorbs the former standalone Repayment Range report.
  balance_band: r => balanceBand(r.bal),
  // What the loan is secured on, read off its own collateral records. This used to fall back to
  // the borrower's name like the two below, which is why grouping by Collateral listed people.
  collateral: r => r.collateral,
  // These sort dimensions aren't captured as discrete fields on a loan/customer
  // record yet, so fall back to a stable, human-readable order by name.
  loan_note: r => r.name,
  provision: r => r.name,
}

// The kinds of security behind a loan, as one label: 'Land', 'Land + Vehicle', or 'Unsecured'
// when nothing is pledged. Types rather than individual items — a report grouping by collateral
// is asking what class of security the book is lent against, not which particular title deed.
function collateralLabel(loan) {
  const list = loan.collaterals || (loan.collateral ? [loan.collateral] : [])
  const types = [...new Set(list.map(c => (c && c.type) || '').filter(Boolean))].sort()
  return types.length ? types.join(' + ') : 'Unsecured'
}

// Band labels don't sort alphabetically into their numeric order ("$10,001" before
// "$2,001"), so grouping by band compares band position instead.
function breakdownKeyCompare(sorting) {
  if (sorting === 'balance_band') {
    return (a, b) => BALANCE_BANDS.indexOf(a) - BALANCE_BANDS.indexOf(b)
  }
  return (a, b) => String(a).localeCompare(String(b))
}

// Outstanding balance mirrors the other portfolio reports (see buildPortfolioSummaryRows
// above): per-loan repayment schedules aren't persisted on the loan record, so accrued
// interest/fees stay 0 and the balance is the disbursed amount until that data exists.
// What an instalment column has earned up to today — the rows already due, summed. A schedule
// priced with a collection fee carries it per row; one priced without simply sums to nothing.
function accruedToDate(loan, todayISO, pick) {
  return round2(loanSchedule(loan).reduce(
    (sum, row) => (row.dueDateISO && row.dueDateISO <= todayISO ? sum + (pick(row) || 0) : sum), 0))
}

function buildLoanBreakdownDetailRows(loanApplications, customers, { sorting, from, to, todayISO }) {
  const rows = loanApplications
    .filter(l => l.status === 'Active' && inDisbursedRange(l, from, to))
    .map(loan => {
      const customer = customers.find(c => c.code === loan.customerCode)
      const address = customer?.currentAddress ? formatAddress(customer.currentAddress) : null
      return {
        key: loan.ref,
        cid: loan.customerCode,
        accNo: (loan.ref || '').replace(/^AC-L-/, ''),
        name: loan.customerName,
        sex: loan.customerGender || '—',
        address: address || '-',
        disbAmt: loan.amount || 0,
        bal: loan.amount || 0,
        // Interest and collection fee earned so far: the instalments already fallen due, read off
        // the loan's own schedule. Both were hardcoded 0 from before schedules were kept on the
        // record — the columns printed for every loan and never carried a figure.
        intAccr: accruedToDate(loan, todayISO, r => r.interest),
        colFeeAccr: accruedToDate(loan, todayISO, r => r.collectionFee),
        collateral: collateralLabel(loan),
        currency: loan.currency || 'USD',
        intRate: loan.interestRate || 0,
        period: loan.installments || 0,
        businessType: loan.borrowerIncomeInfo?.occupation || customer?.occupation || '—',
        gender: loan.customerGender || 'Unspecified',
        product: loan.product || 'Unspecified',
        repaymentType: loan.repaymentType || 'Unspecified',
      }
    })

  const keyFn = BREAKDOWN_SORT_KEY[sorting] || BREAKDOWN_SORT_KEY.business_type
  const cmp = breakdownKeyCompare(sorting)
  return rows.sort((a, b) => cmp(keyFn(a), keyFn(b)) || a.name.localeCompare(b.name))
}

function buildLoanBreakdownSummaryRows(detailRows, sorting) {
  const keyFn = BREAKDOWN_SORT_KEY[sorting] || BREAKDOWN_SORT_KEY.business_type
  const cmp = breakdownKeyCompare(sorting)
  const byGroup = new Map()
  detailRows.forEach(r => {
    const name = keyFn(r) || 'Unspecified'
    const entry = byGroup.get(name) || { key: name, name, accounts: 0, outstanding: 0 }
    entry.accounts += 1
    entry.outstanding += r.disbAmt
    byGroup.set(name, entry)
  })
  return Array.from(byGroup.values()).sort((a, b) => cmp(a.name, b.name))
}


export default function ReportsPage() {
  const { state, dispatch } = useApp()
  const { reportTab, reportView, loanApplications: allLoanApplications, currency, customers } = state

  // A loan report is always run in ONE currency. Dollars and riel are different money and cannot
  // be added, so a module that mixed them either printed a total of two currencies or, where it
  // refused to, printed no total at all — and the figures it did print were run through
  // formatVal's USD→KHR conversion on top of amounts already in their own currency.
  //
  // So the reports show every loan and print each figure in the money it is actually in: rows
  // carry their own currency and are formatted from it at rate 1, never converted. Filtering to
  // one currency instead would hide the other — a riel loan disbursed today simply would not
  // appear — and there is no currency control in the app to switch with.
  //
  // Totals are the one thing that cannot be mixed: singleCurrencyTotals gives a footer only when
  // every row agrees, rather than adding dollars to riel (see architecture.md).
  const loanApplications = allLoanApplications
  // Which currencies the book actually holds — a figure that cannot be split by currency is
  // stated only when there is one of them.
  const bookCurrencies = useMemo(
    () => [...new Set(allLoanApplications.map(l => l.currency || 'USD'))],
    [allLoanApplications]
  )
  // null | 'loan' | 'financial' — see reportView in AppContext: reducer state so the sidebar
  // returning to this module drops back to the picker rather than leaving it where it was.
  const view = reportView
  const setView = v => dispatch({ type: 'SET_REPORT_VIEW', view: v })

  // ── Per-report filter state ───────────────────────────────────────────────
  // Which of the Portfolio tab's two views is showing. Local because nothing outside this page
  // reads it — unlike reportTab, which the Report launcher sets when it opens a module.
  const [portfolioView, setPortfolioView] = useState('listing')
  const [collectionStatus, setCollectionStatus] = useState('all')
  const [collectionOfficer, setCollectionOfficer] = useState('all')
  const [collectionBranch, setCollectionBranch] = useState('all')
  const [txType, setTxType] = useState('all')
  const [txFrom, setTxFrom] = useState(null)
  const [txTo, setTxTo] = useState(null)
  const [arrearsGroup, setArrearsGroup] = useState('aging')
  const [disburseStage, setDisburseStage] = useState('all')
  const [closureType, setClosureType] = useState('all')
  // Portfolio Listing / Portfolio & Risk Summary: a blank date bound means all dates,
  // so both open on their full result set like every other report.
  const [listingSort, setListingSort] = useState('business_type')
  const [listingShow, setListingShow] = useState('detail')
  const [listingFrom, setListingFrom] = useState('')
  const [listingTo, setListingTo] = useState('')
  const [summaryGroup, setSummaryGroup] = useState('officer')
  const [summaryFrom, setSummaryFrom] = useState('')
  const [summaryTo, setSummaryTo] = useState('')
  // Repayment / cash / income / bank filters. Each opens on everything, like every other
  // report here, so the first thing an operator sees is the whole picture.
  const [repayMethod, setRepayMethod] = useState('all')
  const [repayFrom, setRepayFrom] = useState('')
  const [repayTo, setRepayTo] = useState('')
  const [cashAccount, setCashAccount] = useState('all')
  const [cashStatus, setCashStatus] = useState('all')
  const [incomeType, setIncomeType] = useState('all')
  const [bankAccountId, setBankAccountId] = useState('')

  const todayISO = new Date().toISOString().split('T')[0]
  const todayLabel = new Date().toLocaleDateString('en-GB')

  const disbursementRows = useMemo(() => buildDisbursementRows(loanApplications), [loanApplications])
  const transactionRows = useMemo(() => buildTransactionRows(loanApplications), [loanApplications])

  const summaryRows = useMemo(
    () => buildPortfolioSummaryRows(loanApplications, { groupBy: summaryGroup, from: summaryFrom, to: summaryTo }),
    [loanApplications, summaryGroup, summaryFrom, summaryTo]
  )
  const activeSummaryGroup = SUMMARY_GROUPS.find(g => g.value === summaryGroup) || SUMMARY_GROUPS[1]

  const breakdownDetailRows = useMemo(
    () => buildLoanBreakdownDetailRows(loanApplications, customers, { sorting: listingSort, from: listingFrom, to: listingTo, todayISO }),
    [loanApplications, customers, listingSort, listingFrom, listingTo, todayISO]
  )
  const breakdownSummaryRows = useMemo(
    () => buildLoanBreakdownSummaryRows(breakdownDetailRows, listingSort),
    [breakdownDetailRows, listingSort]
  )
  const listingLabel = BREAKDOWN_SORTING_LABELS[listingSort] || 'Business Type'
  const isListingSummary = listingShow === 'summarize'
  const companyBaseRow = useMemo(() => {
    const active = loanApplications.filter(l => l.status === 'Active')
    return { accounts: active.length, outstanding: active.reduce((sum, l) => sum + (l.amount || 0), 0) }
  }, [loanApplications])

  // ── Repayment, cash, income and bank rows ─────────────────────────────────
  const repaymentReportRows = useMemo(
    () => buildRepaymentReportRows(state.repayments, loanApplications),
    [state.repayments, loanApplications]
  )
  const filteredRepayments = useMemo(() => repaymentReportRows.filter(r =>
    (repayMethod === 'all'
      || (repayMethod === 'Split' && /split/i.test(r.method))
      || (repayMethod === 'Cash' && /^cash$/i.test(r.method))
      || (repayMethod === 'Bank' && !/split/i.test(r.method) && !/^cash$/i.test(r.method))) &&
    (!repayFrom || (r.dateISO || '') >= repayFrom) &&
    (!repayTo || (r.dateISO || '') <= repayTo)
  ), [repaymentReportRows, repayMethod, repayFrom, repayTo])

  const cashAccounts = useMemo(() => cashGlAccounts(state.chartOfAccounts), [state.chartOfAccounts])
  const cashReportRows = useMemo(() => buildCashReportRows(state, cashAccounts), [state, cashAccounts])
  const filteredCashRows = useMemo(() => cashReportRows.filter(r =>
    (cashAccount === 'all' || r.accountCode === cashAccount) &&
    (cashStatus === 'all' || r.status === cashStatus)
  ), [cashReportRows, cashAccount, cashStatus])

  const incomeReportRows = useMemo(() => buildIncomeReportRows(state.incomes), [state.incomes])
  const incomeTypes = useMemo(
    () => [...new Set(incomeReportRows.map(r => r.incomeType))].sort(),
    [incomeReportRows]
  )
  const filteredIncomeRows = useMemo(
    () => incomeReportRows.filter(r => incomeType === 'all' || r.incomeType === incomeType),
    [incomeReportRows, incomeType]
  )

  // Every real bank account is reported on its own — a USD account and its KHR sibling are
  // separate accounts holding separate money and must never be added together.
  const reportBankAccounts = state.realBankAccounts || []
  const selectedReportBank = reportBankAccounts.find(a => a.id === bankAccountId) || reportBankAccounts[0] || null
  const bankReportRows = useMemo(
    () => (selectedReportBank ? buildBankReportRows(state, selectedReportBank) : []),
    [state, selectedReportBank]
  )

  // ── Rows derived from the loan register ───────────────────────────────────
  const allCollectionRows = useMemo(() => buildCollectionRows(loanApplications, todayISO), [loanApplications, todayISO])
  const loanArrears = useMemo(() => buildLoanArrears(loanApplications, todayISO), [loanApplications, todayISO])
  const closedLoanRows = useMemo(() => buildClosedLoanRows(loanApplications), [loanApplications])

  // ── Filtered report rows ──────────────────────────────────────────────────
  const collectionRows = useMemo(() => allCollectionRows.filter(r =>
    (collectionStatus === 'all' || r.status === collectionStatus) &&
    (collectionOfficer === 'all' || r.creditOfficer === collectionOfficer) &&
    (collectionBranch === 'all' || r.branch === collectionBranch)
  ), [allCollectionRows, collectionStatus, collectionOfficer, collectionBranch])

  const txEarliest = transactionRows.length
    ? transactionRows[transactionRows.length - 1].dateISO
    : todayISO
  const effectiveTxFrom = txFrom || txEarliest
  const effectiveTxTo = txTo || todayISO

  const filteredTransactions = useMemo(() => transactionRows.filter(r =>
    r.dateISO >= effectiveTxFrom && r.dateISO <= effectiveTxTo &&
    (txType === 'all' || r.type === txType)
  ), [transactionRows, effectiveTxFrom, effectiveTxTo, txType])

  const filteredDisbursements = useMemo(() => disbursementRows.filter(r =>
    disburseStage === 'all' || r.stage === disburseStage
  ), [disbursementRows, disburseStage])

  const filteredClosures = useMemo(() => closedLoanRows.filter(r =>
    closureType === 'all' || r.closure === closureType
  ), [closedLoanRows, closureType])

  // Arrears grouping. Aging rows are keyed on `bucket`, the breakdowns on `name` —
  // normalise to `name` so one column definition serves all three groupings.
  const activeArrearsGroup = ARREARS_GROUPS.find(g => g.value === arrearsGroup) || ARREARS_GROUPS[0]
  const groupedArrears = useMemo(
    () => buildArrearsRows(loanArrears, activeArrearsGroup),
    [loanArrears, activeArrearsGroup]
  )
  const arrearsRows = useMemo(() => groupedArrears.map((r, i) => ({
    ...r,
    // The current (never-late) bucket reads as the healthy baseline, so tint it.
    rowClass: arrearsGroup === 'aging' && i === 0 ? 'bg-emerald-50/30 dark:bg-emerald-900/10' : '',
  })), [groupedArrears, arrearsGroup])

  const arrearsTotals = useMemo(() => ({
    accounts: groupedArrears.reduce((s, r) => s + r.accounts, 0),
    outstanding: groupedArrears.reduce((s, r) => s + r.outstanding, 0),
    arrears: groupedArrears.reduce((s, r) => s + r.arrears, 0),
  }), [groupedArrears])

  // Required provision per classification — the regulatory output of the aging above.
  const agingRows = useMemo(() => buildArrearsRows(loanArrears, ARREARS_GROUPS[0]), [loanArrears])
  const provisionRows = useMemo(
    () => agingRows.map(r => ({ ...r, provision: round2((r.outstanding * r.rateNum) / 100) })),
    [agingRows]
  )

  // Only the officers and branches that actually have something to collect — a filter listing
  // names with no rows behind them sends an officer looking for work that isn't there.
  const collectionOfficers = useMemo(
    () => [...new Set(allCollectionRows.map(r => r.creditOfficer))].sort(), [allCollectionRows])
  const collectionBranches = useMemo(
    () => [...new Set(allCollectionRows.map(r => r.branch))].sort(), [allCollectionRows])

  function selectTab(tabId) {
    dispatch({ type: 'SET_REPORT_TAB', tab: tabId })
  }

  // Every figure on the header cards is the same number the report below it prints, read off
  // the loan register — so a card and its report can never disagree.
  const loanKpis = useMemo(() => {
    const totalOutstanding = agingRows.reduce((s, r) => s + r.outstanding, 0)
    const totalArrears = agingRows.reduce((s, r) => s + r.arrears, 0)
    const dueToday = allCollectionRows.filter(r => r.status === 'Due Today')
    return {
      accounts: companyBaseRow.accounts,
      outstanding: companyBaseRow.outstanding,
      dueTodayCount: dueToday.length,
      dueTodayAmount: round2(dueToday.reduce((s, r) => s + r.amount, 0)),
      // Every band but the first — an account is only in arrears once it is actually late.
      arrearsAccounts: agingRows.slice(1).reduce((s, r) => s + r.accounts, 0),
      arrears: totalArrears,
      par: totalOutstanding > 0 ? (totalArrears / totalOutstanding) * 100 : 0,
      provision: round2(agingRows.reduce((s, r) => s + (r.outstanding * r.rateNum) / 100, 0)),
    }
  }, [companyBaseRow, agingRows, allCollectionRows])

  function openLoanReports() {
    // Opens on Portfolio — the first of the eight areas, and the one carrying the headline figures.
    selectTab('portfolio')
    setView('loan')
  }



  return (
    // The Financial Report scrolls inside its own table rather than moving the page, so
    // that view is pinned to the shell's height; the other views keep growing as usual.
    <div className={`p-4 sm:p-6 space-y-6 ${view === 'financial' ? 'h-full flex flex-col min-h-0' : ''}`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {view && (
            <button
              onClick={() => setView(null)}
              title="Back to Reports"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          {/* The module name, and only that — picking a report switches the panel under the
              tabs, exactly as the Financial Report's statements do. It used to open each report
              as its own page with a "Loan Report › Collection Sheet" crumb, which made a tab
              click read as navigation and put the way back somewhere different from the tabs. */}
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {view === 'loan' ? 'Loan Report' : view === 'financial' ? 'Financial Report' : 'Report'}
          </h1>
        </div>
      </div>

      {/* ── Report picker ──────────────────────────────────────────────────── */}
      {!view && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            accent="brand"
            icon={FileText}
            title="Loan Report"
            description="Portfolio, repayments, due dates, arrears & write-offs"
            cta="Open loan reports"
            onClick={openLoanReports}
          />
          <ReportCard
            accent="gold"
            icon={Landmark}
            title="Financial Report"
            description="GL, P&L, balance sheet & trial balance"
            cta="Open financial reports"
            onClick={() => setView('financial')}
          />
        </div>
      )}

      {/* ── Loan Report ────────────────────────────────────────────────────── */}
      {view === 'loan' && (
        // The tab row across the top, the open report underneath.
        <div className="space-y-4">
          <ReportTypeTabs value={reportTab} onChange={selectTab} />

          <div
            id="report-panel"
            role="tabpanel"
            aria-labelledby={`report-tab-${reportTab}`}
            className="min-w-0 space-y-6"
          >
          {/* The KPI row is the Overview tab's content — the index table came out, so these
              are what that tab shows. */}
          {/* The headline figures belong with the portfolio they describe — accounts,
              outstanding, what falls due, arrears and PAR are all read off the same register the
              report beneath them prints. */}
          {reportTab === 'portfolio' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              label="Active Accounts" value={loanKpis.accounts}
              icon={Users} iconBg="bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400"
              sub="Disbursed loans currently running"
            />
            <KpiCard
              label="Total Outstanding" value={perCurrencyTotal(loanArrears, r => r.outstanding)}
              icon={Wallet} iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              valueClass="text-xl"
              sub="Gross loan portfolio"
            />
            <KpiCard
              label="Due Today" value={perCurrencyTotal(allCollectionRows.filter(r => r.status === 'Due Today'), r => r.amount)}
              icon={Clock} iconBg="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              valueClass="text-xl"
              sub={`${loanKpis.dueTodayCount} installment${loanKpis.dueTodayCount === 1 ? '' : 's'} falling due`}
            />
            <KpiCard
              label="Total Arrears" value={perCurrencyTotal(loanArrears, r => r.arrears)}
              icon={AlertTriangle} iconBg="bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
              valueClass="text-xl"
              sub={`${loanKpis.arrearsAccounts} accounts past due`}
            />
            <KpiCard
              label="Portfolio at Risk" value={`${loanKpis.par.toFixed(2)}%`}
              icon={Percent} iconBg="bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
              sub="Arrears as a share of outstanding"
            />
          </div>
          )}

          {/* Portfolio's two views. One area, one tab — the borrower listing and the risk summary
              answer the same question at different altitudes, so they switch here rather than
              spending two of the eight tabs between them. */}
          {reportTab === 'portfolio' && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PORTFOLIO_VIEWS.map(v => (
              <button
                key={v.value}
                onClick={() => setPortfolioView(v.value)}
                aria-pressed={portfolioView === v.value}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  portfolioView === v.value
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          )}

          {/* Due & Overdue */}
          {reportTab === 'collection-sheet' && (
            <SimpleReportTable
              tableId="collection-sheet"
              reportTitle="Due & Overdue"
              meta={`Status: ${collectionStatus === 'all' ? 'All' : collectionStatus} · Officer: ${collectionOfficer === 'all' ? 'All' : collectionOfficer} · Branch: ${collectionBranch === 'all' ? 'All' : collectionBranch}`}
              count={collectionRows.length}
              toolbar={<>
                <FilterSelect
                  label="Status" value={collectionStatus} onChange={setCollectionStatus} width="w-32"
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'Due Today', label: 'Due Today' },
                    { value: 'Overdue', label: 'Overdue' },
                  ]}
                />
                <FilterSelect
                  label="Officer" value={collectionOfficer} onChange={setCollectionOfficer} width="w-36"
                  options={[{ value: 'all', label: 'All Officers' }, ...collectionOfficers.map(o => ({ value: o, label: o }))]}
                />
                <FilterSelect
                  label="Branch" value={collectionBranch} onChange={setCollectionBranch} width="w-44"
                  options={[{ value: 'all', label: 'All Branches' }, ...collectionBranches.map(b => ({ value: b, label: b }))]}
                />
              </>}
              columns={[
                { key: 'ref', label: 'Ref #', className: 'font-mono font-bold text-brand-600' },
                { key: 'customer', label: 'Customer', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'product', label: 'Product' },
                { key: 'installment', label: 'Inst. #', right: true },
                { key: 'dueDate', label: 'Due Date' },
                { key: 'daysLate', label: 'Days Late', right: true, render: r => r.daysLate > 0
                  ? <span className="font-bold text-rose-600">{r.daysLate}</span>
                  : '—' },
                { key: 'amount', label: 'Amount Due', right: true, render: r => formatVal(r.amount, r.currency || 'USD', 1) },
                { key: 'branch', label: 'Branch' },
                { key: 'creditOfficer', label: 'Credit Officer' },
                { key: 'status', label: 'Status', render: r => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.status === 'Due Today' ? 'bg-amber-50 text-amber-700 border-amber-200/50' : 'bg-rose-50 text-rose-700 border-rose-200/50'}`}>
                    {r.status}
                  </span>
                ) },
              ]}
              rows={
                // Passed straight through, keeping the key buildCollectionRows assigned
                // (`ref-installment`). This used to re-key each row to the loan ref alone, so
                // every installment of one loan shared a React key — and with duplicate keys
                // React cannot tell the rows apart when the list changes. Filtering by officer
                // then left the previous officer's rows on screen and repeated installments,
                // while the record count and total beside them stayed right, being read off
                // the data rather than the DOM.
                collectionRows
              }
              totals={{ amount: formatVal(collectionRows.reduce((s, r) => s + r.amount, 0), currency) }}
              emptyMessage="Nothing to collect for the selected filters."
            />
          )}
          {/* Repayment Report — the collection, its allocation and where it was paid in */}
          {reportTab === 'repayments' && (
            <SimpleReportTable
              tableId="repayments"
              reportTitle="Repayment Report"
              meta={`${repayFrom || 'earliest'} to ${repayTo || 'today'} · Method: ${repayMethod === 'all' ? 'All' : repayMethod}`}
              count={filteredRepayments.length}
              toolbar={<>
                <FilterSelect
                  label="Method" value={repayMethod} onChange={setRepayMethod} width="w-36"
                  options={[
                    { value: 'all', label: 'All Methods' },
                    { value: 'Cash', label: 'Cash' },
                    { value: 'Bank', label: 'Bank' },
                    { value: 'Split', label: 'Split' },
                  ]}
                />
                <DateRangeFilter label="Date" from={repayFrom} to={repayTo} onFrom={setRepayFrom} onTo={setRepayTo} />
              </>}
              columns={[
                { key: 'id', label: 'Repayment ID', className: 'font-mono font-bold text-brand-600' },
                { key: 'date', label: 'Date' },
                { key: 'customer', label: 'Client', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'loanRef', label: 'Loan ID', className: 'font-mono' },
                { key: 'total', label: 'Total', right: true, render: r => formatVal(r.total, r.currency, 1) },
                { key: 'principal', label: 'Principal', right: true, render: r => formatVal(r.principal, r.currency, 1) },
                { key: 'interest', label: 'Interest', right: true, render: r => formatVal(r.interest, r.currency, 1) },
                { key: 'penalty', label: 'Penalty', right: true, render: r => (r.penalty > 0.005 ? formatVal(r.penalty, r.currency, 1) : '—') },
                { key: 'fee', label: 'Fee', right: true, render: r => (r.fee > 0.005 ? formatVal(r.fee, r.currency, 1) : '—') },
                { key: 'method', label: 'Payment Method' },
                { key: 'account', label: 'Payment Account' },
              ]}
              rows={filteredRepayments}
              totals={singleCurrencyTotals(filteredRepayments, ['total', 'principal', 'interest', 'penalty', 'fee'])}
              emptyMessage="No repayments collected in the selected range."
            />
          )}
          {/* Income Report — what the book earned, by kind */}
          {reportTab === 'income-report' && (
            <SimpleReportTable
              tableId="income-report"
              reportTitle="Income Report"
              meta={`Type: ${incomeType === 'all' ? 'All income types' : incomeType}`}
              count={filteredIncomeRows.length}
              toolbar={
                <FilterSelect
                  label="Income Type" value={incomeType} onChange={setIncomeType} width="w-52"
                  options={[
                    { value: 'all', label: 'All Income Types' },
                    ...incomeTypes.map(t => ({ value: t, label: t })),
                  ]}
                />
              }
              columns={[
                { key: 'date', label: 'Date' },
                { key: 'repaymentId', label: 'Repayment ID', className: 'font-mono text-slate-500' },
                { key: 'client', label: 'Client', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'incomeType', label: 'Income Type' },
                { key: 'amount', label: 'Amount', right: true, render: r => formatVal(r.amount, r.currency, 1) },
                { key: 'currency', label: 'Currency' },
              ]}
              rows={filteredIncomeRows}
              totals={singleCurrencyTotals(filteredIncomeRows, ['amount'])}
              emptyMessage="No income recorded yet."
            />
          )}
          {/* Arrears & Portfolio at Risk */}
          {reportTab === 'arrears' && (
            <SimpleReportTable
              tableId="arrears"
              reportTitle="Arrears & Portfolio at Risk"
              meta={`Grouped by ${activeArrearsGroup.label}`}
              count={arrearsRows.length}
              toolbar={<><FilterSelect
                label="Group by" value={arrearsGroup} onChange={setArrearsGroup} width="w-40"
                options={ARREARS_GROUPS.map(g => ({ value: g.value, label: g.label }))}
              /></>}
              columns={[
                { key: 'name', label: activeArrearsGroup.column, className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'accounts', label: '# Accounts', right: true },
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, r.currency || 'USD', 1) },
                { key: 'arrears', label: 'Arrears', right: true, render: r => formatVal(r.arrears, r.currency || 'USD', 1) },
                { key: 'par', label: 'PAR (%)', right: true, render: r => `${r.outstanding > 0 ? ((r.arrears / r.outstanding) * 100).toFixed(2) : '0.00'}%` },
                ...(arrearsGroup === 'aging' ? [
                  { key: 'classification', label: 'Classification', render: r => (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      r.classification === 'Normal'          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                      r.classification === 'Special Mention' ? 'bg-amber-50 text-amber-700 border-amber-200/50' :
                      r.classification === 'Sub-Standard'    ? 'bg-orange-50 text-orange-700 border-orange-200/50' :
                      r.classification === 'Doubtful'        ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                                                               'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {r.classification}
                    </span>
                  ) },
                  { key: 'rate', label: 'Reserve Rate', right: true, className: 'font-semibold text-slate-700 dark:text-slate-200' },
                ] : []),
              ]}
              rows={arrearsRows}
              totals={{
                label: 'Total Portfolio',
                accounts: arrearsTotals.accounts,
                outstanding: perCurrencyTotal(loanArrears, r => r.outstanding),
                arrears: perCurrencyTotal(loanArrears, r => r.arrears),
                par: `${arrearsTotals.outstanding > 0 ? ((arrearsTotals.arrears / arrearsTotals.outstanding) * 100).toFixed(2) : '0.00'}%`,
              }}
            />
          )}

          {/* Loan Loss Provision */}
          {reportTab === 'provision' && (
            <SimpleReportTable
              tableId="provision"
              reportTitle="Loan Loss Provision"
              meta={`As of ${todayLabel}`}
              count={provisionRows.length}
              columns={[
                { key: 'classification', label: 'Classification', render: r => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    r.classification === 'Normal'          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' :
                    r.classification === 'Special Mention' ? 'bg-amber-50 text-amber-700 border-amber-200/50' :
                    r.classification === 'Sub-Standard'    ? 'bg-orange-50 text-orange-700 border-orange-200/50' :
                    r.classification === 'Doubtful'        ? 'bg-rose-50 text-rose-700 border-rose-200/50' :
                                                             'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {r.classification}
                  </span>
                ) },
                { key: 'bucket', label: 'Aging Bucket', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'accounts', label: '# Accounts', right: true },
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, r.currency || 'USD', 1) },
                { key: 'rate', label: 'Reserve Rate', right: true, className: 'font-semibold text-slate-700 dark:text-slate-200' },
                { key: 'provision', label: 'Required Provision', right: true, render: r => formatVal(r.provision, r.currency || 'USD', 1), className: 'font-bold text-slate-800 dark:text-slate-100' },
              ]}
              rows={provisionRows}
              totals={{
                label: 'Total Required',
                accounts: provisionRows.reduce((s, r) => s + r.accounts, 0),
                outstanding: formatVal(provisionRows.reduce((s, r) => s + r.outstanding, 0), currency),
                // The aging bands this is derived from group by lateness, not by currency, so a
                // book holding both has no single provision figure to state — it is suppressed
                // rather than printed as a sum of dollars and riel. The bands themselves still
                // show, and a single-currency book still gets its total.
                provision: bookCurrencies.length === 1
                  ? formatVal(loanKpis.provision, bookCurrencies[0], 1)
                  : '—',
              }}
            />
          )}

          {/* Loan Portfolio Listing — borrower detail or grouped summary. The two modes share a
              tab but not a column set (three grouped columns against twelve borrower-level ones,
              overlapping only on the name), so each remembers its own view — stored under one id,
              a view saved in Detail would leave Summary showing that single shared column. */}
          {reportTab === 'portfolio' && portfolioView === 'listing' && (
            <SimpleReportTable
              tableId={isListingSummary ? 'portfolio-listing-summary' : 'portfolio-listing-detail'}
              reportTitle="Loan Portfolio Listing"
              meta={`${isListingSummary ? 'Summary' : 'Detail'} by ${listingLabel}${listingFrom || listingTo ? ` · Disbursed ${listingFrom || 'start'} to ${listingTo || todayLabel}` : ''}`}
              count={isListingSummary ? breakdownSummaryRows.length : breakdownDetailRows.length}
              toolbar={<>
                <FilterSelect
                  label="Group by" value={listingSort} onChange={setListingSort} width="w-40"
                  options={Object.entries(BREAKDOWN_SORTING_LABELS).map(([value, label]) => ({ value, label }))}
                />
                <FilterSelect
                  label="Show" value={listingShow} onChange={setListingShow} width="w-32"
                  options={[{ value: 'detail', label: 'Detail' }, { value: 'summarize', label: 'Summary' }]}
                />
                <DateRangeFilter label="Disbursed" from={listingFrom} to={listingTo} onFrom={setListingFrom} onTo={setListingTo} />
              </>}
              columns={isListingSummary ? [
                { key: 'name', label: listingLabel, className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'accounts', label: '# Accounts', right: true },
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, r.currency || 'USD', 1) },
              ] : [
                { key: 'cid', label: 'CID', className: 'font-mono' },
                { key: 'accNo', label: 'AccNo', className: 'font-mono font-bold text-brand-600' },
                { key: 'name', label: 'Name', className: 'font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap' },
                { key: 'sex', label: 'Sex' },
                { key: 'address', label: 'Address', className: 'max-w-[200px] truncate' },
                { key: 'disbAmt', label: 'Disb Amt', right: true, render: r => formatVal(r.disbAmt, r.currency || 'USD', 1) },
                { key: 'bal', label: 'Balance', right: true, render: r => formatVal(r.bal, r.currency || 'USD', 1) },
                { key: 'intAccr', label: 'Int Accr', right: true, render: r => fmt2(r.intAccr) },
                { key: 'colFeeAccr', label: 'ColFee Accr', right: true, render: r => fmt2(r.colFeeAccr) },
                { key: 'intRate', label: 'Int Rate', right: true, render: r => `${fmt2(r.intRate)}%` },
                { key: 'period', label: 'Period', right: true },
                { key: 'group', label: listingLabel, className: 'font-medium', render: r => (BREAKDOWN_SORT_KEY[listingSort] || BREAKDOWN_SORT_KEY.business_type)(r) },
              ]}
              rows={isListingSummary ? breakdownSummaryRows : breakdownDetailRows}
              totals={isListingSummary ? {
                accounts: breakdownSummaryRows.reduce((s, r) => s + r.accounts, 0),
                outstanding: formatVal(breakdownSummaryRows.reduce((s, r) => s + r.outstanding, 0), currency),
              } : {
                disbAmt: formatVal(breakdownDetailRows.reduce((s, r) => s + r.disbAmt, 0), currency),
                bal: formatVal(breakdownDetailRows.reduce((s, r) => s + r.bal, 0), currency),
              }}
              emptyMessage="No active loans found for the selected filters."
            />
          )}

          {/* Portfolio & Risk Summary — one report, five groupings */}
          {reportTab === 'portfolio' && portfolioView === 'summary' && (
            <SimpleReportTable
              tableId="portfolio-summary"
              reportTitle="Portfolio & Risk Summary"
              meta={`Grouped by ${activeSummaryGroup.label}${summaryFrom || summaryTo ? ` · Disbursed ${summaryFrom || 'start'} to ${summaryTo || todayLabel}` : ''}`}
              count={summaryRows.length}
              toolbar={<>
                <FilterSelect
                  label="Group by" value={summaryGroup} onChange={setSummaryGroup} width="w-44"
                  options={SUMMARY_GROUPS.map(g => ({ value: g.value, label: g.label }))}
                />
                <DateRangeFilter label="Disbursed" from={summaryFrom} to={summaryTo} onFrom={setSummaryFrom} onTo={setSummaryTo} />
              </>}
              columns={[
                { key: 'name', label: activeSummaryGroup.column, className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'accounts', label: '# Accounts', right: true },
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, r.currency || 'USD', 1) },
                // Arrears needs per-loan repayment schedules, which aren't persisted on the
                // loan record yet — these hold their place at zero until that data exists.
                { key: 'arrAccounts', label: 'Arr. Accounts', right: true, render: () => 0 },
                { key: 'arrearsBal', label: 'Arrears Bal', right: true, render: () => 0 },
                { key: 'latePri', label: 'Late Pri', right: true, render: () => 0 },
                { key: 'lateInt', label: 'Late Int', right: true, render: () => 0 },
                { key: 'latePen', label: 'Late Pen', right: true, render: () => 0 },
                { key: 'totalArrears', label: 'Total Arrears', right: true, className: 'font-semibold text-slate-800 dark:text-slate-100', render: () => 0 },
                { key: 'par', label: 'PAR (%)', right: true, render: () => '0.00%' },
              ]}
              rows={summaryRows}
              totals={{
                accounts: summaryRows.reduce((s, r) => s + r.accounts, 0),
                outstanding: formatVal(summaryRows.reduce((s, r) => s + r.outstanding, 0), currency),
                arrAccounts: 0, arrearsBal: 0, latePri: 0, lateInt: 0, latePen: 0, totalArrears: 0, par: '0.00%',
              }}
              emptyMessage="No active loan portfolio found for the selected filters."
            />
          )}


          {/* Disbursement Report — disbursed and pending in one list */}
          {reportTab === 'disbursement' && (
            <SimpleReportTable
              tableId="disbursement"
              reportTitle="Disbursement Report"
              meta={`Stage: ${disburseStage === 'all' ? 'All' : disburseStage}`}
              count={filteredDisbursements.length}
              toolbar={<><FilterSelect
                label="Stage" value={disburseStage} onChange={setDisburseStage} width="w-52"
                options={[
                  { value: 'all', label: 'All Stages' },
                  { value: 'Disbursed', label: 'Disbursed' },
                  { value: 'Pending Disbursement', label: 'Pending Disbursement' },
                ]}
              /></>}
              columns={[
                { key: 'ref', label: 'Ref #', className: 'font-mono font-bold text-brand-600' },
                { key: 'customerName', label: 'Customer', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'product', label: 'Product' },
                { key: 'amount', label: 'Amount', right: true, render: r => formatVal(r.amount, r.currency || 'USD', 1) },
                { key: 'disbursementDate', label: 'Disbursement Date', render: r => r.disbursementDate || '—' },
                { key: 'branch', label: 'Branch' },
                { key: 'creditOfficer', label: 'Credit Officer' },
                { key: 'stage', label: 'Stage', render: r => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.stage === 'Disbursed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' : 'bg-amber-50 text-amber-700 border-amber-200/50'}`}>
                    {r.stage}
                  </span>
                ) },
                { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} size="xs" /> },
              ]}
              rows={filteredDisbursements}
              totals={{ amount: formatVal(filteredDisbursements.reduce((s, r) => s + (r.amount || 0), 0), currency) }}
              emptyMessage="No loans found for the selected stage."
            />
          )}

          {/* Closed Loans — settled in full, or closed by being refinanced */}
          {reportTab === 'closed-loans' && (
            <SimpleReportTable
              tableId="closed-loans"
              reportTitle="Closed Loans"
              meta={`Closure: ${closureType === 'all' ? 'All' : closureType}`}
              count={filteredClosures.length}
              toolbar={<><FilterSelect
                label="Closure" value={closureType} onChange={setClosureType} width="w-40"
                options={[
                  { value: 'all', label: 'All Closures' },
                  { value: 'Paid Off', label: 'Paid Off' },
                  { value: 'Refinanced', label: 'Refinanced' },
                  { value: 'Written Off', label: 'Written Off' },
                ]}
              /></>}
              columns={[
                { key: 'ref', label: 'Ref #', className: 'font-mono font-bold text-brand-600' },
                { key: 'customer', label: 'Customer', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'product', label: 'Product' },
                { key: 'originalAmount', label: 'Original Amount', right: true, render: r => r.originalAmount != null ? formatVal(r.originalAmount, r.currency || 'USD', 1) : '—' },
                { key: 'closureDate', label: 'Closure Date' },
                { key: 'amount', label: 'Amount at Closure', right: true, render: r => formatVal(r.amount, r.currency || 'USD', 1) },
                // Paid Off reads as the good outcome, a write-off as the loss it is, and a
                // refinance as neither. The wording carries it as well as the colour — these
                // print to PDF and are read by people who cannot rely on hue.
                { key: 'closure', label: 'Closure Type', render: r => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    r.closure === 'Paid Off' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50'
                      : r.closure === 'Written Off' ? 'bg-rose-50 text-rose-700 border-rose-200/50'
                        : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {r.closure}
                  </span>
                ) },
                { key: 'detail', label: 'Method / Reason' },
                { key: 'approvedBy', label: 'Approved By' },
              ]}
              rows={filteredClosures.map(r => ({ ...r, key: r.ref }))}
              totals={{ amount: formatVal(filteredClosures.reduce((s, r) => s + r.amount, 0), currency) }}
              emptyMessage="No closed loans for the selected filter."
            />
          )}
          </div>
        </div>
      )}

      {/* ── Financial Report ──────────────────────────────────────────────── */}
      {view === 'financial' && <FinancialReportSection />}
    </div>
  )
}
