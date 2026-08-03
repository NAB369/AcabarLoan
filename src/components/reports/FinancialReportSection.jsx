import { useMemo, useState } from 'react'
import { CalendarDays, Printer, Download, History, TrendingUp, Scale } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useApp } from '../../context/AppContext'
import { formatVal } from '../../utils/format'
import { companyLogoSrc } from '../../utils/companyLogo'
import { KH_PROVINCES } from '../../data/geoData'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from '@/components/ui/table'

const STATEMENT_TABS = [
  { id: 'gl-daily',       label: 'GL Daily Transfer',         icon: CalendarDays },
  { id: 'gl-history',     label: 'GL Histories Transfer',     icon: History },
  { id: 'pl',             label: 'Profit and Loss Statement',  icon: TrendingUp },
  { id: 'bs',             label: 'Balance Sheet',             icon: Scale },
]

const GL_BRANCHES = ['All Branches', ...KH_PROVINCES]

const INPUT_CLS = 'h-auto shadow-none border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500'
const ACTION_BTN_CLS = 'h-auto shadow-none flex items-center gap-1.5 border border-slate-200 dark:border-slate-600 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors'

const Th = ({ children, right }) => (
  <TableHead className={`h-auto px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
    {children}
  </TableHead>
)

const TypeBadge = ({ type }) => {
  const map = {
    Income:   'bg-emerald-50 text-emerald-700 border-emerald-200/50',
    Expense:  'bg-rose-50 text-rose-700 border-rose-200/50',
    Transfer: 'bg-brand-50 text-brand-700 border-brand-200/50',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[type] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {type}
    </span>
  )
}

const EmptyRow = ({ colSpan, message }) => (
  <TableRow><TableCell colSpan={colSpan} className="py-12 text-center text-sm text-slate-400">{message}</TableCell></TableRow>
)

// One card per statement with its toolbar inside it, matching the Chart of Accounts /
// General Ledger panels. Filters re-run the report as they change, so the table below is
// always live. The toolbar is print:hidden — a date picker or dropdown means nothing on
// paper, and printing already drops the buttons.
const ReportPanel = ({ filters, onPrint, onDownload, children }) => (
  <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden print:overflow-visible print:border-0 flex-1 min-h-0 flex flex-col">
    <div className="print:hidden flex-shrink-0 flex flex-wrap items-end gap-x-8 gap-y-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      {filters}
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="outline" onClick={onPrint} className={ACTION_BTN_CLS}>
          <Printer className="!w-3.5 !h-3.5" />
          Print
        </Button>
        <Button variant="outline" onClick={onDownload} className={ACTION_BTN_CLS}>
          <Download className="!w-3.5 !h-3.5" />
          Download
        </Button>
      </div>
    </div>
    {children}
  </div>
)

const Field = ({ label, gap = 'gap-2', children }) => (
  <div className="space-y-1.5">
    <Label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</Label>
    <div className={`flex items-center h-[34px] ${gap}`}>{children}</div>
  </div>
)

const Radio = ({ name, checked, onChange, children }) => (
  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap">
    <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-brand-600" />
    {children}
  </label>
)

const BranchField = ({ value, onChange }) => (
  <Field label="Branch">
    <select value={value} onChange={e => onChange(e.target.value)} className={`w-40 ${INPUT_CLS}`}>
      {GL_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
    </select>
  </Field>
)

const DateRangeField = ({ label, from, to, onFrom, onTo }) => (
  <Field label={label}>
    <Input type="date" value={from} onChange={e => onFrom(e.target.value)} className={`w-36 ${INPUT_CLS}`} />
    <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
    <Input type="date" value={to} onChange={e => onTo(e.target.value)} className={`w-36 ${INPUT_CLS}`} />
  </Field>
)

// Reporting currency + the rate used to convert into it — shared by P&L and Balance Sheet.
const CurrencyFields = ({ name, currency, onCurrency, rate, onRate }) => (
  <>
    <Field label="Consolidate To" gap="gap-5">
      <Radio name={name} checked={currency === 'USD'} onChange={() => onCurrency('USD')}>USD</Radio>
      <Radio name={name} checked={currency === 'KHR'} onChange={() => onCurrency('KHR')}>KHR</Radio>
    </Field>
    <Field label="Exchange Rate">
      <span className="text-xs text-slate-400 dark:text-slate-500">1 USD =</span>
      <Input
        type="number"
        min="0"
        step="1"
        value={rate}
        onChange={e => onRate(Number(e.target.value) || 0)}
        className={`w-28 ${INPUT_CLS}`}
      />
      <span className="text-xs text-slate-400 dark:text-slate-500">KHR</span>
    </Field>
  </>
)

// Shown only in the print output (see .print-only in globals.css). On screen the tab
// already says which report you're on and the filter bar shows how it's filtered, so
// none of this is repeated above the table — but a printed page carries neither, and
// `meta` is what tells the reader which date, currency and branch it was run for.
const PrintReportHeader = ({ title, meta }) => {
  const { state } = useApp()
  const { name } = state.companyProfile
  return (
    <div className="print-only text-center mb-3">
      <img src={companyLogoSrc(state.companyProfile)} alt={name} className="w-14 h-14 mx-auto object-contain mb-1" />
      <p className="text-base font-bold text-slate-900">{name.toUpperCase()}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{meta}</p>
    </div>
  )
}

export default function FinancialReportSection() {
  const { state, dispatch } = useApp()
  const { incomes, expenses, accounts, activeLoan, currency, companyProfile } = state
  // A persisted statement id may point at a tab that no longer exists (e.g. a saved
  // "Full Trial Balance" selection), which would render an empty panel — fall back.
  const activeStatement = STATEMENT_TABS.some(t => t.id === state.activeStatement)
    ? state.activeStatement
    : 'pl'

  const [dailyDate, setDailyDate] = useState(null)
  const [glBranch, setGlBranch] = useState('All Branches')

  // 'all' or an account code — the dropdown carries both the mode and the account.
  const [glHistAccount, setGlHistAccount] = useState('all')
  const [glHistDateFrom, setGlHistDateFrom] = useState(null)
  const [glHistDateTo, setGlHistDateTo] = useState(null)
  const [glHistBranch, setGlHistBranch] = useState('All Branches')

  const [plCurrency, setPlCurrency] = useState('USD')
  const [plExchangeRate, setPlExchangeRate] = useState(4000)
  const [plDateFrom, setPlDateFrom] = useState(null)
  const [plDateTo, setPlDateTo] = useState(null)
  const [plBranch, setPlBranch] = useState('All Branches')

  const [bsCurrency, setBsCurrency] = useState('USD')
  const [bsExchangeRate, setBsExchangeRate] = useState(4000)
  const [bsBranch, setBsBranch] = useState('All Branches')

  const approvedExpenses = useMemo(() => expenses.filter(e => e.status === 'Approved'), [expenses])
  // Loan disbursements move cash from an asset account to a loan receivable — they aren't
  // an operating expense, so P&L / Net Profit exclude them even once approved.
  const operatingExpenses = useMemo(() => approvedExpenses.filter(e => e.category !== 'Loan Disbursement'), [approvedExpenses])
  const totalIncome = useMemo(() => incomes.reduce((s, i) => s + i.amount, 0), [incomes])
  const totalOperatingExpense = useMemo(() => operatingExpenses.reduce((s, e) => s + e.amount, 0), [operatingExpenses])
  const netProfit = totalIncome - totalOperatingExpense
  const portfolioBase = 4850000
  const loanPortfolio = portfolioBase + (activeLoan ? activeLoan.amount : 0)
  // Grand total of every account — the company's total cash position, used for the
  // Balance Sheet's Cash & Cash Equivalents.
  const mainAccountBalance = useMemo(() => accounts.reduce((s, a) => s + (a.balance || 0), 0), [accounts])

  const accountName = (code) => accounts.find(a => a.code === code)?.name || code || '—'

  const plExpenses = useMemo(() => {
    const byCategory = (cat) => operatingExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
    const salaries = byCategory('Employment Salaries')
    const admin = byCategory('Office Administration')
    const tax = byCategory('Tax & Regulation')
    const provisions = byCategory('Provision Expense')
    const other = operatingExpenses.filter(e => !['Employment Salaries','Office Administration','Tax & Regulation','Provision Expense'].includes(e.category)).reduce((s,e)=>s+e.amount,0)
    return { salaries, admin, tax, provisions, other, total: salaries + admin + tax + provisions + other }
  }, [operatingExpenses])

  // ── Combined GL feed (income + approved expenses + transfers), newest first ──
  const glAll = useMemo(() => {
    const inc = incomes.map(i => ({ ...i, txType: 'Income', debit: 0, credit: i.amount }))
    const exp = approvedExpenses.map(e => ({ ...e, txType: 'Expense', debit: e.amount, credit: 0 }))
    const tr = (state.cashTransfers || []).map(t => ({
      date: t.date, code: t.ref, category: `${t.fromName} → ${t.toName}`,
      description: t.description, txType: 'Transfer',
      debit: t.amount, credit: t.amount,
      fromCode: t.fromCode, toCode: t.toCode,
    }))
    return [...inc, ...exp, ...tr].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [incomes, approvedExpenses, state.cashTransfers])

  const glAccountLabel = (e) => {
    if (e.txType === 'Transfer') return `${accountName(e.fromCode)} → ${accountName(e.toCode)}`
    return accountName(e.account)
  }

  // Transfers already show the account pair in the Account column (glAccountLabel) —
  // repeating it in the description would duplicate the same text on one row.
  const glDescription = (e) => {
    if (e.txType === 'Transfer') return e.description || 'Cash Transfer'
    return `${e.category || ''}${e.description ? ` — ${e.description}` : ''}`
  }

  // jsPDF's built-in fonts have no glyph for "→", so it prints as a garbled character —
  // swap it for an ASCII-safe separator only in text bound for PDF export.
  const pdfSafe = (str) => String(str ?? '').replace(/→/g, '->')

  const availableDates = useMemo(() => [...new Set(glAll.map(e => e.date).filter(Boolean))].sort().reverse(), [glAll])
  const effectiveDailyDate = dailyDate || availableDates[0] || new Date().toISOString().split('T')[0]
  const dailyEntries = useMemo(() => glAll.filter(e => e.date === effectiveDailyDate), [glAll, effectiveDailyDate])

  const glDailyRows = useMemo(() => {
    let running = 0
    return dailyEntries.map((e, i) => {
      running += (e.credit || 0) - (e.debit || 0)
      return {
        trnDate: e.date,
        trnNo: e.code,
        valueDate: e.date,
        recId: `REC-${String(i + 1).padStart(4, '0')}`,
        accCode: (e.txType === 'Transfer' ? e.fromCode : e.account) || '—',
        accName: glAccountLabel(e),
        memo: glDescription(e),
        debit: e.debit,
        credit: e.credit,
        bal: running,
      }
    })
  }, [dailyEntries])

  const earliestGlDate = availableDates[availableDates.length - 1] || new Date().toISOString().split('T')[0]
  const latestGlDate = availableDates[0] || new Date().toISOString().split('T')[0]
  const effectiveHistFrom = glHistDateFrom || earliestGlDate
  const effectiveHistTo = glHistDateTo || latestGlDate
  const histAccountLabel = glHistAccount === 'all' ? 'All Account' : accountName(glHistAccount)

  const historyEntries = useMemo(() => {
    let all = glAll.filter(e => e.date >= effectiveHistFrom && e.date <= effectiveHistTo)
    if (glHistAccount !== 'all') {
      all = all.filter(e => e.account === glHistAccount || e.fromCode === glHistAccount || e.toCode === glHistAccount)
    }
    return all
  }, [glAll, effectiveHistFrom, effectiveHistTo, glHistAccount])

  // ── P&L report period (scoped to this tab — doesn't affect the Balance Sheet) ──
  const effectivePlFrom = plDateFrom || earliestGlDate
  const effectivePlTo = plDateTo || latestGlDate

  const plFilteredIncomes = useMemo(
    () => incomes.filter(i => i.date >= effectivePlFrom && i.date <= effectivePlTo),
    [incomes, effectivePlFrom, effectivePlTo]
  )
  const plFilteredExpenses = useMemo(
    () => operatingExpenses.filter(e => e.date >= effectivePlFrom && e.date <= effectivePlTo),
    [operatingExpenses, effectivePlFrom, effectivePlTo]
  )

  const plRevenueFiltered = useMemo(() => {
    const byCategory = (cat) => plFilteredIncomes.filter(i => i.category === cat).reduce((s, i) => s + i.amount, 0)
    const interest = byCategory('Interest Income')
    const fees = byCategory('Repayment Fee Income')
    const penalties = byCategory('Penalty Fee')
    const other = plFilteredIncomes.filter(i => !['Interest Income','Repayment Fee Income','Penalty Fee'].includes(i.category)).reduce((s,i)=>s+i.amount,0)
    return { interest, fees, penalties, other, total: interest + fees + penalties + other }
  }, [plFilteredIncomes])

  const plExpensesFiltered = useMemo(() => {
    const byCategory = (cat) => plFilteredExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0)
    const salaries = byCategory('Employment Salaries')
    const admin = byCategory('Office Administration')
    const tax = byCategory('Tax & Regulation')
    const provisions = byCategory('Provision Expense')
    const other = plFilteredExpenses.filter(e => !['Employment Salaries','Office Administration','Tax & Regulation','Provision Expense'].includes(e.category)).reduce((s,e)=>s+e.amount,0)
    return { salaries, admin, tax, provisions, other, total: salaries + admin + tax + provisions + other }
  }, [plFilteredExpenses])

  const netProfitFiltered = plRevenueFiltered.total - plExpensesFiltered.total

  // GL Daily/History have too many columns to fit A4 portrait without clipping,
  // so those two print in landscape; the narrower statements print portrait.
  function handlePrint(orientation = 'portrait') {
    const styleId = 'print-orientation-override'
    let style = document.getElementById(styleId)
    if (!style) {
      style = document.createElement('style')
      style.id = styleId
      document.head.appendChild(style)
    }
    style.textContent = `@media print { @page { size: A4 ${orientation}; margin: 10mm 12mm; } }`
    const cleanup = () => { style.remove(); window.removeEventListener('afterprint', cleanup) }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  function addPdfHeader(doc, subtitle) {
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.text(subtitle, 14, 21)
    doc.setFontSize(8)
    doc.setFont(undefined, 'normal')
  }

  function handleDownloadGlDaily() {
    const doc = new jsPDF({ orientation: 'landscape' })
    addPdfHeader(doc, 'GL Daily Transaction Listing')
    doc.text(`${effectiveDailyDate} · ${glBranch}`, 14, 26)

    const totalDebit = glDailyRows.reduce((s, r) => s + r.debit, 0)
    const totalCredit = glDailyRows.reduce((s, r) => s + r.credit, 0)
    const lastBal = glDailyRows.length ? glDailyRows[glDailyRows.length - 1].bal : 0

    autoTable(doc, {
      startY: 31,
      head: [['Trn Date', 'Trn No', 'Value Date', 'RecID', 'Acc Code', 'Acc Name', 'Memo', 'Debit', 'Credit', 'Bal']],
      body: glDailyRows.map(r => [
        r.trnDate, r.trnNo, r.valueDate, r.recId, r.accCode, pdfSafe(r.accName), pdfSafe(r.memo),
        r.debit > 0 ? formatVal(r.debit, currency) : '—',
        r.credit > 0 ? formatVal(r.credit, currency) : '—',
        formatVal(r.bal, currency),
      ]),
      foot: [['Totals', '', '', '', '', '', '', formatVal(totalDebit, currency), formatVal(totalCredit, currency), formatVal(lastBal, currency)]],
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    })

    doc.save(`gl-daily-${effectiveDailyDate}.pdf`)
  }

  function handleDownloadGlHistory() {
    const doc = new jsPDF({ orientation: 'landscape' })
    addPdfHeader(doc, 'GL Histories Transaction Listing')
    doc.text(
      `${effectiveHistFrom} to ${effectiveHistTo} · ${histAccountLabel} · ${glHistBranch}`,
      14, 26
    )

    const totalDebit = historyEntries.reduce((s, e) => s + e.debit, 0)
    const totalCredit = historyEntries.reduce((s, e) => s + e.credit, 0)

    autoTable(doc, {
      startY: 31,
      head: [['Date', 'Ref', 'Description', 'Account', 'Type', 'Debit', 'Credit']],
      body: historyEntries.map(e => [
        e.date, e.code, pdfSafe(glDescription(e)), pdfSafe(glAccountLabel(e)), e.txType,
        e.debit > 0 ? formatVal(e.debit, currency) : '—',
        e.credit > 0 ? formatVal(e.credit, currency) : '—',
      ]),
      foot: [['Totals', '', '', '', '', formatVal(totalDebit, currency), formatVal(totalCredit, currency)]],
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    })

    doc.save(`gl-histories-${effectiveHistFrom}-to-${effectiveHistTo}.pdf`)
  }

  function handleDownloadPl() {
    const doc = new jsPDF()
    addPdfHeader(doc, 'Profit and Loss')
    doc.text(`${effectivePlFrom} to ${effectivePlTo} · ${plCurrency} · ${plBranch}`, 14, 26)

    autoTable(doc, {
      startY: 31,
      head: [['Revenue', 'Amount']],
      body: [
        ['Interest Income', formatVal(plRevenueFiltered.interest, plCurrency, plExchangeRate)],
        ['Fees & Charges', formatVal(plRevenueFiltered.fees, plCurrency, plExchangeRate)],
        ['Penalties', formatVal(plRevenueFiltered.penalties, plCurrency, plExchangeRate)],
        ['Other Income', formatVal(plRevenueFiltered.other, plCurrency, plExchangeRate)],
      ],
      foot: [['Total Revenue', formatVal(plRevenueFiltered.total, plCurrency, plExchangeRate)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Operating Expenses', 'Amount']],
      body: [
        ['Salaries & Benefits', formatVal(plExpensesFiltered.salaries, plCurrency, plExchangeRate)],
        ['Office & Administration', formatVal(plExpensesFiltered.admin, plCurrency, plExchangeRate)],
        ['Tax & Regulation', formatVal(plExpensesFiltered.tax, plCurrency, plExchangeRate)],
        ['Loan Loss Provisions', formatVal(plExpensesFiltered.provisions, plCurrency, plExchangeRate)],
        ['Other Expenses', formatVal(plExpensesFiltered.other, plCurrency, plExchangeRate)],
      ],
      foot: [['Total Expenses', formatVal(plExpensesFiltered.total, plCurrency, plExchangeRate)]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    })

    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.text(`Net Income / (Loss): ${formatVal(Math.abs(netProfitFiltered), plCurrency, plExchangeRate)}${netProfitFiltered < 0 ? ' (Loss)' : ''}`, 14, doc.lastAutoTable.finalY + 10)

    doc.save(`profit-and-loss-${effectivePlFrom}-to-${effectivePlTo}.pdf`)
  }

  // ── Balance Sheet rows (Description / Debit / Credit) ──────────────────────
  const bsAssetRows = useMemo(() => [
    { label: 'Cash & Cash Equivalents (Main Account)', debit: mainAccountBalance || 1250000, credit: 0 },
    { label: 'Loan Portfolio (Gross)', debit: loanPortfolio, credit: 0 },
    { label: 'Less: Provision for Loan Losses', debit: 0, credit: plExpenses.provisions },
  ], [mainAccountBalance, loanPortfolio, plExpenses])
  const bsLiabilityRows = [
    { label: 'Borrowings / Debt', debit: 0, credit: 2100000 },
    { label: 'Accounts Payable', debit: 0, credit: 45000 },
  ]
  const bsEquityRows = useMemo(() => [
    { label: 'Paid-in Capital', debit: 0, credit: 3500000 },
    { label: 'Retained Earnings', debit: netProfit < 0 ? -netProfit : 0, credit: netProfit >= 0 ? netProfit : 0 },
  ], [netProfit])
  const bsTotalAssets = bsAssetRows.reduce((s, r) => s + r.debit - r.credit, 0)
  const bsTotalLiabilities = bsLiabilityRows.reduce((s, r) => s + r.credit - r.debit, 0)
  const bsTotalEquity = bsEquityRows.reduce((s, r) => s + r.credit - r.debit, 0)

  function handleDownloadBs() {
    const doc = new jsPDF()
    addPdfHeader(doc, 'Balance Sheet')
    doc.text(`${bsCurrency}${bsCurrency === 'KHR' ? ` (1 USD = ${bsExchangeRate} KHR)` : ''} · ${bsBranch}`, 14, 26)

    const fmt = (v) => v > 0 ? formatVal(v, bsCurrency, bsExchangeRate) : '—'
    const tableOpts = {
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    }

    autoTable(doc, {
      startY: 31,
      head: [['Assets', 'Debit', 'Credit']],
      body: bsAssetRows.map(r => [r.label, fmt(r.debit), fmt(r.credit)]),
      foot: [['Total Assets', formatVal(bsTotalAssets, bsCurrency, bsExchangeRate), '—']],
      ...tableOpts,
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Liabilities', 'Debit', 'Credit']],
      body: bsLiabilityRows.map(r => [r.label, fmt(r.debit), fmt(r.credit)]),
      foot: [['Total Liabilities', '—', formatVal(bsTotalLiabilities, bsCurrency, bsExchangeRate)]],
      ...tableOpts,
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Equity', 'Debit', 'Credit']],
      body: bsEquityRows.map(r => [r.label, fmt(r.debit), fmt(r.credit)]),
      foot: [['Total Equity', '—', formatVal(bsTotalEquity, bsCurrency, bsExchangeRate)]],
      ...tableOpts,
    })

    doc.save(`balance-sheet.pdf`)
  }

  // The shell (Layout) already hands this page a definite height, so the section claims
  // what's left and passes it down — tab bar, panel, toolbar, then the table takes the
  // remainder. Every level needs min-h-0, or a flex child refuses to shrink below its
  // content and the overflow escapes to the page scroller instead of the table.
  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden flex-shrink-0">
        <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
          {STATEMENT_TABS.map(s => (
            <Button key={s.id}
              variant="ghost"
              onClick={() => dispatch({ type: 'SET_STATEMENT', stmt: s.id })}
              className={`h-auto flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${
                activeStatement === s.id
                  ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-[#0047ab] dark:hover:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <s.icon className="!w-3.5 !h-3.5" />
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl flex-1 min-h-0 flex flex-col">
      {/* ── GL Daily Transactions ─────────────────────────────────────────── */}
      {activeStatement === 'gl-daily' && (
        <div className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col">
          <div className="printable-area flex-1 min-h-0 flex flex-col">
            <PrintReportHeader
              title="GL Daily Transaction Listing"
              meta={`${effectiveDailyDate} · ${glBranch}`}
            />
            <ReportPanel
              onPrint={() => handlePrint('landscape')}
              onDownload={handleDownloadGlDaily}
              filters={<>
                <Field label="Date">
                  <Input
                    type="date"
                    value={effectiveDailyDate}
                    onChange={e => setDailyDate(e.target.value)}
                    className={`w-40 ${INPUT_CLS}`}
                  />
                </Field>

                <BranchField value={glBranch} onChange={setGlBranch} />
              </>}
            >
              {/* The table takes whatever height the panel has left. It stretches to fill
                  it and a filler row soaks up the slack, so Totals sits on the bottom edge
                  whether the day has 1 transaction or 200 (past that, this box scrolls). */}
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                <Table className="w-full h-full">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-0">
                      <Th>Trn Date</Th>
                      <Th>Trn No</Th>
                      <Th>Value Date</Th>
                      <Th>RecID</Th>
                      <Th>Acc Code</Th>
                      <Th>Acc Name</Th>
                      <Th>Memo</Th>
                      <Th right>Debit</Th>
                      <Th right>Credit</Th>
                      <Th right>Bal</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {glDailyRows.length === 0
                      ? <EmptyRow colSpan={10} message="No transactions recorded for this date." />
                      : glDailyRows.map((r, i) => (
                        <TableRow key={i} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.trnDate}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.trnNo}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.valueDate}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.recId}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{r.accCode}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.accName}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{r.memo}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.debit > 0 ? formatVal(r.debit, currency) : '—'}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.credit > 0 ? formatVal(r.credit, currency) : '—'}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right">{formatVal(r.bal, currency)}</TableCell>
                        </TableRow>
                      ))
                    }
                    {glDailyRows.length > 0 && (
                      <TableRow aria-hidden="true" className="border-0 hover:bg-transparent"><TableCell colSpan={10} className="h-full p-0" /></TableRow>
                    )}
                  </TableBody>
                  {glDailyRows.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-10">
                      <TableRow className="border-0 border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <TableCell colSpan={7} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Totals</TableCell>
                        <TableCell className="px-4 py-3 text-xs font-bold text-rose-600 text-right">{formatVal(glDailyRows.reduce((s,r)=>s+r.debit,0), currency)}</TableCell>
                        <TableCell className="px-4 py-3 text-xs font-bold text-emerald-600 text-right">{formatVal(glDailyRows.reduce((s,r)=>s+r.credit,0), currency)}</TableCell>
                        <TableCell className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right">{formatVal(glDailyRows[glDailyRows.length - 1].bal, currency)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </ReportPanel>
          </div>
        </div>
      )}

      {/* ── GL Histories Transactions ────────────────────────────────────── */}
      {activeStatement === 'gl-history' && (
        <div className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col">
          <div className="printable-area flex-1 min-h-0 flex flex-col">
            <PrintReportHeader
              title="GL Histories Transaction Listing"
              meta={`${effectiveHistFrom} to ${effectiveHistTo} · ${histAccountLabel} · ${glHistBranch}`}
            />
            <ReportPanel
              onPrint={() => handlePrint('landscape')}
              onDownload={handleDownloadGlHistory}
              filters={<>
                <Field label="Filter">
                  <select
                    value={glHistAccount}
                    onChange={e => setGlHistAccount(e.target.value)}
                    className={`w-52 ${INPUT_CLS}`}
                  >
                    <option value="all">All Account</option>
                    {accounts.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}
                  </select>
                </Field>

                <DateRangeField
                  label="Transaction Date"
                  from={effectiveHistFrom}
                  to={effectiveHistTo}
                  onFrom={setGlHistDateFrom}
                  onTo={setGlHistDateTo}
                />

                <BranchField value={glHistBranch} onChange={setGlHistBranch} />
              </>}
            >
              <div className="overflow-x-auto overflow-y-auto flex-1 min-h-0">
                <Table className="w-full">
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow className="border-0">
                      <Th>Date</Th>
                      <Th>Ref</Th>
                      <Th>Description</Th>
                      <Th>Account</Th>
                      <Th>Type</Th>
                      <Th right>Debit</Th>
                      <Th right>Credit</Th>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {historyEntries.length === 0
                      ? <EmptyRow colSpan={7} message="No ledger history found." />
                      : historyEntries.map((e, i) => (
                        <TableRow key={i} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{e.date}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">{e.code}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{glDescription(e)}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{glAccountLabel(e)}</TableCell>
                          <TableCell className="px-4 py-3"><TypeBadge type={e.txType} /></TableCell>
                          <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{e.debit > 0 ? formatVal(e.debit, currency) : '—'}</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{e.credit > 0 ? formatVal(e.credit, currency) : '—'}</TableCell>
                        </TableRow>
                      ))
                    }
                  </TableBody>
                  {historyEntries.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-10">
                      <TableRow className="border-0 border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <TableCell colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Totals</TableCell>
                        <TableCell className="px-4 py-3 text-xs font-bold text-rose-600 text-right">{formatVal(historyEntries.reduce((s,e)=>s+e.debit,0), currency)}</TableCell>
                        <TableCell className="px-4 py-3 text-xs font-bold text-emerald-600 text-right">{formatVal(historyEntries.reduce((s,e)=>s+e.credit,0), currency)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </ReportPanel>
          </div>
        </div>
      )}

      {/* ── Profit and Loss ──────────────────────────────────────────────── */}
      {activeStatement === 'pl' && (
        <div className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col">
          <div className="printable-area flex-1 min-h-0 flex flex-col">
            <PrintReportHeader
              title="Profit and Loss"
              meta={`${effectivePlFrom} to ${effectivePlTo} · ${plCurrency}${plCurrency === 'KHR' ? ` (1 USD = ${plExchangeRate} KHR)` : ''} · ${plBranch}`}
            />
            <ReportPanel
              onPrint={() => handlePrint()}
              onDownload={handleDownloadPl}
              filters={<>
                <CurrencyFields
                  name="plCurrency"
                  currency={plCurrency}
                  onCurrency={setPlCurrency}
                  rate={plExchangeRate}
                  onRate={setPlExchangeRate}
                />

                <DateRangeField
                  label="Period Condition"
                  from={effectivePlFrom}
                  to={effectivePlTo}
                  onFrom={setPlDateFrom}
                  onTo={setPlDateTo}
                />

                <BranchField value={plBranch} onChange={setPlBranch} />
              </>}
            >
              <div className="p-4 space-y-6 overflow-y-auto flex-1 min-h-0">
                {/* Revenue */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-3">Revenue</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                    <Table className="w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="border-0">
                          <Th>Category</Th>
                          <Th right>Amount</Th>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {[
                          { label: 'Interest Income', val: plRevenueFiltered.interest },
                          { label: 'Fees & Charges', val: plRevenueFiltered.fees },
                          { label: 'Penalties', val: plRevenueFiltered.penalties },
                          { label: 'Other Income', val: plRevenueFiltered.other },
                        ].map(row => (
                          <TableRow key={row.label} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{row.label}</TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{formatVal(row.val, plCurrency, plExchangeRate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter className="sticky bottom-0 z-10">
                        <TableRow className="border-0 border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <TableCell className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Total Revenue</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-bold text-emerald-600 text-right">{formatVal(plRevenueFiltered.total, plCurrency, plExchangeRate)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
                {/* Expenses */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-3">Operating Expenses</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                    <Table className="w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="border-0">
                          <Th>Category</Th>
                          <Th right>Amount</Th>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {[
                          { label: 'Salaries & Benefits', val: plExpensesFiltered.salaries },
                          { label: 'Office & Administration', val: plExpensesFiltered.admin },
                          { label: 'Tax & Regulation', val: plExpensesFiltered.tax },
                          { label: 'Loan Loss Provisions', val: plExpensesFiltered.provisions },
                          { label: 'Other Expenses', val: plExpensesFiltered.other },
                        ].map(row => (
                          <TableRow key={row.label} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{row.label}</TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{formatVal(row.val, plCurrency, plExchangeRate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter className="sticky bottom-0 z-10">
                        <TableRow className="border-0 border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <TableCell className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Total Expenses</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-bold text-rose-600 text-right">{formatVal(plExpensesFiltered.total, plCurrency, plExchangeRate)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
                {/* Net */}
                <div className={`rounded-xl p-4 ${netProfitFiltered >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Net Income / (Loss)</span>
                    <span className={`text-lg font-bold ${netProfitFiltered >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {netProfitFiltered >= 0 ? '' : '-'}{formatVal(Math.abs(netProfitFiltered), plCurrency, plExchangeRate)}
                    </span>
                  </div>
                </div>
              </div>
            </ReportPanel>
          </div>
        </div>
      )}

      {/* ── Balance Sheet ─────────────────────────────────────────────────── */}
      {activeStatement === 'bs' && (
        <div className="p-4 sm:p-6 flex-1 min-h-0 flex flex-col">
          <div className="printable-area flex-1 min-h-0 flex flex-col">
            <PrintReportHeader
              title="Balance Sheet"
              meta={`${bsCurrency}${bsCurrency === 'KHR' ? ` (1 USD = ${bsExchangeRate} KHR)` : ''} · ${bsBranch}`}
            />
            <ReportPanel
              onPrint={() => handlePrint()}
              onDownload={handleDownloadBs}
              filters={<>
                <CurrencyFields
                  name="bsCurrency"
                  currency={bsCurrency}
                  onCurrency={setBsCurrency}
                  rate={bsExchangeRate}
                  onRate={setBsExchangeRate}
                />

                <BranchField value={bsBranch} onChange={setBsBranch} />
              </>}
            >
              <div className="p-4 space-y-6 overflow-y-auto flex-1 min-h-0">
                {/* Assets */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-3">Assets</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                    <Table className="w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="border-0">
                          <Th>Description</Th>
                          <Th right>Debit</Th>
                          <Th right>Credit</Th>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {bsAssetRows.map(r => (
                          <TableRow key={r.label} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.label}</TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.debit > 0 ? formatVal(r.debit, bsCurrency, bsExchangeRate) : '—'}</TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.credit > 0 ? formatVal(r.credit, bsCurrency, bsExchangeRate) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="border-0 border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <TableCell className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Total Assets</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-bold text-brand-600 text-right">{formatVal(bsTotalAssets, bsCurrency, bsExchangeRate)}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-right">—</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
                {/* Liabilities */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-3">Liabilities</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                    <Table className="w-full">
                      <TableHeader className="sticky top-0 z-10">
                        <TableRow className="border-0">
                          <Th>Description</Th>
                          <Th right>Debit</Th>
                          <Th right>Credit</Th>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {bsLiabilityRows.map(r => (
                          <TableRow key={r.label} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <TableCell className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.label}</TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.debit > 0 ? formatVal(r.debit, bsCurrency, bsExchangeRate) : '—'}</TableCell>
                            <TableCell className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.credit > 0 ? formatVal(r.credit, bsCurrency, bsExchangeRate) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="border-0 border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <TableCell className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Total Liabilities</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-right">—</TableCell>
                          <TableCell className="px-4 py-3 text-xs font-bold text-rose-600 text-right">{formatVal(bsTotalLiabilities, bsCurrency, bsExchangeRate)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </div>
                {/* Equity */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-3">Equity</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <Th>Description</Th>
                          <Th right>Debit</Th>
                          <Th right>Credit</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {bsEquityRows.map(r => (
                          <tr key={r.label} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.label}</td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.debit > 0 ? formatVal(r.debit, bsCurrency, bsExchangeRate) : '—'}</td>
                            <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200 text-right">{r.credit > 0 ? formatVal(r.credit, bsCurrency, bsExchangeRate) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                          <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Total Equity</td>
                          <td className="px-4 py-3 text-xs text-right">—</td>
                          <td className="px-4 py-3 text-xs font-bold text-brand-600 text-right">{formatVal(bsTotalEquity, bsCurrency, bsExchangeRate)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </ReportPanel>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
