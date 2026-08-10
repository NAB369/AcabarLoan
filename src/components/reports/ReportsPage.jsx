import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import {
  FileText, AlertTriangle, Clock, Landmark, ChevronLeft, Calendar, BarChart3, Activity,
  ChevronDown, Printer, Download,
  Users, Banknote, CheckCircle, ClipboardList, Percent, Wallet, ShieldAlert,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useApp } from '../../context/AppContext'
import { formatVal, buildAmortizationData, formatAddress, daysBetweenISO } from '../../utils/format'
import StatusBadge from '../shared/StatusBadge'
import { useTableColumns, ColumnPicker } from '../shared/DataTableTools'
import { companyLogoSrc } from '../../utils/companyLogo'
import FinancialReportSection from './FinancialReportSection'
import ReportCard from './ReportCard'

// One definition drives the report selector, the report listing table and the
// rendered body below — adding a report here puts it in all three at once.
const REPORT_TABS = [
  { id: 'listing',            label: 'Overview',                       icon: ClipboardList,     category: 'Overview',    description: 'Index of every loan report in this module' },
  { id: 'collection-sheet',   label: 'Collection Sheet — Due & Overdue', icon: Clock,           category: 'Operations',  description: 'Installments due and overdue, for field collection' },
  { id: 'transactions',       label: 'Transaction Report',             icon: Activity,          category: 'Operations',  description: 'Repayments and disbursements over a date range' },
  { id: 'arrears',            label: 'Arrears & Portfolio at Risk',    icon: AlertTriangle,     category: 'Credit Risk', description: 'PAR aging and classification, grouped as needed' },
  { id: 'provision',          label: 'Loan Loss Provision',            icon: ShieldAlert,       category: 'Credit Risk', description: 'Required provision by classification and reserve rate' },
  { id: 'portfolio-listing',  label: 'Loan Portfolio Listing',         icon: Users,             category: 'Portfolio',   description: 'Borrower-level loan detail or grouped summary' },
  { id: 'portfolio-summary',  label: 'Portfolio & Risk Summary',       icon: BarChart3,         category: 'Portfolio',   description: 'Accounts, outstanding and arrears by chosen grouping' },
  { id: 'schedule-maturity',  label: 'Repayment Schedule & Maturity',  icon: Calendar,          category: 'Portfolio',   description: 'Installment schedule and forward maturity projection' },
  { id: 'disbursement',       label: 'Disbursement Report',            icon: Banknote,          category: 'Lifecycle',   description: 'Disbursed and pending-disbursement loans' },
  { id: 'closed-loans',       label: 'Closed Loans',                   icon: CheckCircle,       category: 'Lifecycle',   description: 'Loans paid off in full or written off' },
]

// The categories above run Overview → Operations → Credit Risk → Portfolio → Lifecycle, and
// REPORT_TABS is listed in that order. The tab strip renders it as-is, so keep new reports
// next to their category rather than appending to the end.

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
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 border border-brand-100 dark:border-brand-800 text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 hover:bg-brand-100 dark:hover:bg-brand-900/50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </div>
      <div className="printable-area">
      <PrintReportHeader title={reportTitle} meta={meta} />
      <div className="overflow-x-auto max-h-[460px] overflow-y-auto rounded-b-2xl">
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
// kept there) falls back to the amortization its own terms imply.
function loanSchedule(loan) {
  if (loan.schedule?.length) return loan.schedule
  if (!loan.amount || !loan.interestRate) return []
  return buildAmortizationData(loan.amount, loan.interestRate, loan.installments || 12, loan.firstInstallment).rows
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

// A loan leaves the book one of two ways: paid to the last cent, or refinanced into a
// replacement. There is no write-off action in the app, so nothing can close that way yet.
function buildClosedLoanRows(loanApplications) {
  const rows = []
  loanApplications.forEach(loan => {
    const schedule = loanSchedule(loan)
    const settled = schedule.filter(isSettled)
    const paidOff = isLive(loan) && schedule.length > 0 && settled.length === schedule.length
    if (!paidOff && loan.status !== 'Refinanced') return
    const last = settled[settled.length - 1]
    const closureISO = paidOff ? last?.paidDate : (loan.closedDate || loan.disbursementDate)
    // Amount at closure is what was cleared to close it: the payment that settled the last
    // installment, or — for a refinance — the principal the replacement loan took over.
    const principalPaid = schedule.reduce((s, r) => s + (r.principalPaid || 0), 0)
    rows.push({
      key: loan.ref,
      ref: loan.ref,
      customer: loan.customerName || loan.customerCode || '—',
      product: loan.product || '—',
      originalAmount: loan.amount || null,
      closureISO: closureISO || '',
      closureDate: dmy(closureISO),
      amount: paidOff ? round2(last?.paid) : Math.max(round2((loan.amount || 0) - principalPaid), 0),
      closure: paidOff ? 'Paid Off' : 'Refinanced',
      detail: paidOff
        ? (last?.paymentMethod || '—')
        : `Refinanced into ${loan.refinancedToRef || 'a replacement loan'}`,
      approvedBy: loan.approvedBy || '—',
    })
  })
  return rows.sort((a, b) => (b.closureISO || '').localeCompare(a.closureISO || ''))
}

// Forward liquidity view: installments still to fall due, totalled by month.
function buildMaturityProjection(schedule, todayISO) {
  const byMonth = new Map()
  schedule.filter(r => r.dueDateISO >= todayISO).forEach(r => {
    const key = r.dueDateISO.slice(0, 7)
    const entry = byMonth.get(key) || { key, installments: 0, principal: 0, interest: 0, totalDue: 0 }
    entry.installments += 1
    entry.principal += r.principal
    entry.interest += r.interest
    entry.totalDue += r.totalDue
    byMonth.set(key, entry)
  })
  return Array.from(byMonth.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(e => ({ ...e, month: new Date(`${e.key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) }))
}

const BREAKDOWN_SORT_KEY = {
  gender: r => r.gender,
  business_type: r => r.businessType,
  repayment_type: r => r.repaymentType,
  product_type: r => r.product,
  // Balance band absorbs the former standalone Repayment Range report.
  balance_band: r => balanceBand(r.bal),
  // These sort dimensions aren't captured as discrete fields on a loan/customer
  // record yet, so fall back to a stable, human-readable order by name.
  loan_note: r => r.name,
  collateral: r => r.name,
  provision: r => r.name,
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
function buildLoanBreakdownDetailRows(loanApplications, customers, { sorting, from, to }) {
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
        intAccr: 0,
        colFeeAccr: 0,
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

function buildCombinedSchedule(loanApplications) {
  const rows = []
  loanApplications.filter(isLive).forEach(loan => {
    loanSchedule(loan).forEach(row => {
      rows.push({ ...row, ref: loan.ref, customer: loan.customerName, product: loan.product })
    })
  })
  return rows.sort((a, b) => a.dueDateISO.localeCompare(b.dueDateISO))
}

export default function ReportsPage() {
  const { state, dispatch } = useApp()
  const { reportTab, reportView, loanApplications, currency, customers } = state
  // null | 'loan' | 'financial' — see reportView in AppContext: reducer state so the sidebar
  // returning to this module drops back to the picker rather than leaving it where it was.
  const view = reportView
  const setView = v => dispatch({ type: 'SET_REPORT_VIEW', view: v })

  // ── Per-report filter state ───────────────────────────────────────────────
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

  const todayISO = new Date().toISOString().split('T')[0]
  const todayLabel = new Date().toLocaleDateString('en-GB')

  const combinedSchedule = useMemo(() => buildCombinedSchedule(loanApplications), [loanApplications])
  const disbursementRows = useMemo(() => buildDisbursementRows(loanApplications), [loanApplications])
  const transactionRows = useMemo(() => buildTransactionRows(loanApplications), [loanApplications])
  const maturityRows = useMemo(() => buildMaturityProjection(combinedSchedule, todayISO), [combinedSchedule, todayISO])

  const summaryRows = useMemo(
    () => buildPortfolioSummaryRows(loanApplications, { groupBy: summaryGroup, from: summaryFrom, to: summaryTo }),
    [loanApplications, summaryGroup, summaryFrom, summaryTo]
  )
  const activeSummaryGroup = SUMMARY_GROUPS.find(g => g.value === summaryGroup) || SUMMARY_GROUPS[1]

  const breakdownDetailRows = useMemo(
    () => buildLoanBreakdownDetailRows(loanApplications, customers, { sorting: listingSort, from: listingFrom, to: listingTo }),
    [loanApplications, customers, listingSort, listingFrom, listingTo]
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
    selectTab('listing')
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
          {reportTab === 'listing' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              label="Active Accounts" value={loanKpis.accounts}
              icon={Users} iconBg="bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400"
              sub="Disbursed loans currently running"
            />
            <KpiCard
              label="Total Outstanding" value={formatVal(loanKpis.outstanding, currency)}
              icon={Wallet} iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              valueClass="text-xl"
              sub="Gross loan portfolio"
            />
            <KpiCard
              label="Due Today" value={formatVal(loanKpis.dueTodayAmount, currency)}
              icon={Clock} iconBg="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              valueClass="text-xl"
              sub={`${loanKpis.dueTodayCount} installment${loanKpis.dueTodayCount === 1 ? '' : 's'} falling due`}
            />
            <KpiCard
              label="Total Arrears" value={formatVal(loanKpis.arrears, currency)}
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

          {/* Collection Sheet — Due & Overdue */}
          {reportTab === 'collection-sheet' && (
            <SimpleReportTable
              tableId="collection-sheet"
              reportTitle="Collection Sheet - Due & Overdue"
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
                { key: 'amount', label: 'Amount Due', right: true, render: r => formatVal(r.amount, currency) },
                { key: 'branch', label: 'Branch' },
                { key: 'creditOfficer', label: 'Credit Officer' },
                { key: 'status', label: 'Status', render: r => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.status === 'Due Today' ? 'bg-amber-50 text-amber-700 border-amber-200/50' : 'bg-rose-50 text-rose-700 border-rose-200/50'}`}>
                    {r.status}
                  </span>
                ) },
              ]}
              rows={collectionRows.map(r => ({ ...r, key: r.ref }))}
              totals={{ amount: formatVal(collectionRows.reduce((s, r) => s + r.amount, 0), currency) }}
              emptyMessage="Nothing to collect for the selected filters."
            />
          )}

          {/* Transaction Report */}
          {reportTab === 'transactions' && (
            <SimpleReportTable
              tableId="transactions"
              reportTitle="Transaction Report"
              meta={`${effectiveTxFrom} to ${effectiveTxTo} · Type: ${txType === 'all' ? 'All' : txType}`}
              count={filteredTransactions.length}
              toolbar={<>
                <FilterSelect
                  label="Type" value={txType} onChange={setTxType} width="w-36"
                  options={[
                    { value: 'all', label: 'All Types' },
                    { value: 'Repayment', label: 'Repayment' },
                    { value: 'Disbursement', label: 'Disbursement' },
                  ]}
                />
                <DateRangeFilter label="Date" from={effectiveTxFrom} to={effectiveTxTo} onFrom={setTxFrom} onTo={setTxTo} />
              </>}
              columns={[
                { key: 'date', label: 'Date' },
                { key: 'time', label: 'Time' },
                { key: 'ref', label: 'Ref #', className: 'font-mono font-bold text-brand-600' },
                { key: 'customer', label: 'Customer', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'type', label: 'Type', render: r => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.type === 'Disbursement' ? 'bg-brand-50 text-brand-700 border-brand-200/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200/50'}`}>
                    {r.type}
                  </span>
                ) },
                { key: 'amount', label: 'Amount', right: true, render: r => formatVal(r.amount, currency) },
                { key: 'method', label: 'Method' },
                { key: 'balanceAfter', label: 'Balance After', right: true, render: r => r.balanceAfter != null ? formatVal(r.balanceAfter, currency) : '—' },
                { key: 'officer', label: 'Teller / Officer' },
              ]}
              rows={filteredTransactions}
              totals={{ amount: formatVal(filteredTransactions.reduce((s, r) => s + r.amount, 0), currency) }}
              emptyMessage="No transactions in the selected range."
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
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, currency) },
                { key: 'arrears', label: 'Arrears', right: true, render: r => formatVal(r.arrears, currency) },
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
                outstanding: formatVal(arrearsTotals.outstanding, currency),
                arrears: formatVal(arrearsTotals.arrears, currency),
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
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, currency) },
                { key: 'rate', label: 'Reserve Rate', right: true, className: 'font-semibold text-slate-700 dark:text-slate-200' },
                { key: 'provision', label: 'Required Provision', right: true, render: r => formatVal(r.provision, currency), className: 'font-bold text-slate-800 dark:text-slate-100' },
              ]}
              rows={provisionRows}
              totals={{
                label: 'Total Required',
                accounts: provisionRows.reduce((s, r) => s + r.accounts, 0),
                outstanding: formatVal(provisionRows.reduce((s, r) => s + r.outstanding, 0), currency),
                provision: formatVal(loanKpis.provision, currency),
              }}
            />
          )}

          {/* Loan Portfolio Listing — borrower detail or grouped summary. The two modes share a
              tab but not a column set (three grouped columns against twelve borrower-level ones,
              overlapping only on the name), so each remembers its own view — stored under one id,
              a view saved in Detail would leave Summary showing that single shared column. */}
          {reportTab === 'portfolio-listing' && (
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
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, currency) },
              ] : [
                { key: 'cid', label: 'CID', className: 'font-mono' },
                { key: 'accNo', label: 'AccNo', className: 'font-mono font-bold text-brand-600' },
                { key: 'name', label: 'Name', className: 'font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap' },
                { key: 'sex', label: 'Sex' },
                { key: 'address', label: 'Address', className: 'max-w-[200px] truncate' },
                { key: 'disbAmt', label: 'Disb Amt', right: true, render: r => formatVal(r.disbAmt, currency) },
                { key: 'bal', label: 'Balance', right: true, render: r => formatVal(r.bal, currency) },
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
          {reportTab === 'portfolio-summary' && (
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
                { key: 'outstanding', label: 'Outstanding', right: true, render: r => formatVal(r.outstanding, currency) },
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

          {/* Repayment Schedule & Maturity Projection */}
          {reportTab === 'schedule-maturity' && (
            <div className="space-y-4">
              <SimpleReportTable
                tableId="maturity"
                reportTitle="Maturity Projection"
                meta={`Installments falling due from ${todayLabel}`}
                count={maturityRows.length}
                  columns={[
                  { key: 'month', label: 'Month', className: 'font-semibold text-slate-700 dark:text-slate-200' },
                  { key: 'installments', label: '# Installments', right: true },
                  { key: 'principal', label: 'Principal', right: true, render: r => formatVal(r.principal, currency) },
                  { key: 'interest', label: 'Interest', right: true, render: r => formatVal(r.interest, currency) },
                  { key: 'totalDue', label: 'Total Due', right: true, render: r => formatVal(r.totalDue, currency), className: 'font-bold text-slate-800 dark:text-slate-100' },
                ]}
                rows={maturityRows}
                totals={{
                  installments: maturityRows.reduce((s, r) => s + r.installments, 0),
                  principal: formatVal(maturityRows.reduce((s, r) => s + r.principal, 0), currency),
                  interest: formatVal(maturityRows.reduce((s, r) => s + r.interest, 0), currency),
                  totalDue: formatVal(maturityRows.reduce((s, r) => s + r.totalDue, 0), currency),
                }}
                emptyMessage="No future installments scheduled."
              />
              <SimpleReportTable
                tableId="installment-schedule"
                reportTitle="Installment Schedule"
                meta="Combined installment schedule across active loan accounts"
                count={combinedSchedule.length}
                columns={[
                  { key: 'ref', label: 'Ref #', className: 'font-mono font-bold text-brand-600' },
                  { key: 'customer', label: 'Customer', className: 'font-medium text-slate-700 dark:text-slate-200' },
                  { key: 'num', label: 'Inst. #', right: true },
                  { key: 'dueDate', label: 'Due Date' },
                  { key: 'principal', label: 'Principal', right: true, render: r => formatVal(r.principal, currency) },
                  { key: 'interest', label: 'Interest', right: true, render: r => formatVal(r.interest, currency) },
                  { key: 'totalDue', label: 'Total Due', right: true, render: r => formatVal(r.totalDue, currency) },
                  { key: 'status', label: 'Status', render: r => <StatusBadge status={r.status} size="xs" /> },
                ]}
                rows={combinedSchedule}
                emptyMessage="No active loans with a repayment schedule yet."
              />
            </div>
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
                { key: 'amount', label: 'Amount', right: true, render: r => formatVal(r.amount, currency) },
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
                ]}
              /></>}
              columns={[
                { key: 'ref', label: 'Ref #', className: 'font-mono font-bold text-brand-600' },
                { key: 'customer', label: 'Customer', className: 'font-medium text-slate-700 dark:text-slate-200' },
                { key: 'product', label: 'Product' },
                { key: 'originalAmount', label: 'Original Amount', right: true, render: r => r.originalAmount != null ? formatVal(r.originalAmount, currency) : '—' },
                { key: 'closureDate', label: 'Closure Date' },
                { key: 'amount', label: 'Amount at Closure', right: true, render: r => formatVal(r.amount, currency) },
                { key: 'closure', label: 'Closure Type', render: r => (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.closure === 'Paid Off' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
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
