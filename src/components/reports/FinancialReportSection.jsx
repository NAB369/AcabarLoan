import { useCallback, useMemo, useState } from 'react'
import { CalendarDays, Printer, Download, History, TrendingUp, Scale } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useApp } from '../../context/AppContext'
import { formatVal } from '../../utils/format'
import { companyLogoSrc } from '../../utils/companyLogo'
import { KH_PROVINCES } from '../../data/geoData'
import { useTableColumns, ColumnPicker } from '../shared/DataTableTools'
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
const ReportPanel = ({ filters, columnPicker, onPrint, onDownload, children }) => (
  <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden print:overflow-visible print:border-0 flex-1 min-h-0 flex flex-col">
    <div className="print:hidden flex-shrink-0 flex flex-wrap items-end gap-x-8 gap-y-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      {filters}
      <div className="flex items-center gap-2 ml-auto">
        {columnPicker}
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

// Column visibility for one statement, kept in the reducer under the statement's tab id so the
// view an accountant sets on GL Daily is still there next week. A column is
// { id, label, right?, cellCls?, text(row), render?(row) } — `text` is what prints and exports,
// `render` the on-screen cell when it isn't plain text (a badge). The statements each call this
// once, unconditionally, so the hook order holds however the tabs are switched.
function useStatementColumns(tableId, columns) {
  const { state, dispatch } = useApp()
  const { visibleIds, toggle } = useTableColumns(columns, {
    value: state.reportColumns?.[tableId] || null,
    onChange: ids => dispatch({ type: 'SET_REPORT_COLUMNS', table: tableId, ids }),
  })
  const visible = useMemo(() => columns.filter(c => visibleIds.includes(c.id)), [columns, visibleIds])
  const picker = (
    <ColumnPicker
      columns={columns}
      visibleIds={visibleIds}
      onToggle={toggle}
      iconOnly
      className="py-1.5 rounded-lg"
    />
  )
  return { visible, picker }
}

// Header, body and totals for a statement table, driven by whichever columns are visible.
const ColumnHead = ({ columns }) => (
  <TableHeader className="sticky top-0 z-10">
    <TableRow className="border-0">
      {columns.map(c => <Th key={c.id} right={c.right}>{c.label}</Th>)}
    </TableRow>
  </TableHeader>
)

const ColumnCells = ({ columns, row }) => columns.map(c => (
  <TableCell key={c.id} className={`px-4 py-3 text-xs ${c.right ? 'text-right' : ''} ${c.cellCls || ''}`}>
    {c.render ? c.render(row) : c.text(row)}
  </TableCell>
))

// `totals` is keyed by column id. The label cell spans the columns ahead of the first total, so
// hiding a column narrows the span instead of leaving the totals misaligned under the wrong
// headings. `cls` colours a total (debits rose, credits emerald) the way each statement wants.
const TotalsRow = ({ columns, label, totals, cls = {} }) => {
  const first = columns.findIndex(c => totals[c.id] != null)
  // Every column hidden but the money ones: drop the label rather than let it take the cell a
  // total belongs in — the footer's own styling still marks it as the totals row.
  const span = first < 0 ? columns.length : first
  return (
    <TableRow className="border-0 border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
      {span > 0 && (
        <TableCell colSpan={span} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">{label}</TableCell>
      )}
      {columns.slice(span).map(c => (
        <TableCell key={c.id} className={`px-4 py-3 text-xs font-bold text-right ${cls[c.id] || 'text-slate-700 dark:text-slate-200'}`}>
          {totals[c.id] ?? ''}
        </TableCell>
      ))}
    </TableRow>
  )
}

// One Balance Sheet block — Assets, Liabilities and Equity are the same three columns with
// their own rows and total, so they render from one definition rather than three copies.
const StatementSection = ({ title, columns, rows, totalLabel, totals, cls }) => (
  <div>
    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-3">{title}</h4>
    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
      <Table className="w-full">
        <ColumnHead columns={columns} />
        <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
          {rows.map(r => (
            <TableRow key={r.label} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <ColumnCells columns={columns} row={r} />
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TotalsRow columns={columns} label={totalLabel} totals={totals} cls={cls} />
        </TableFooter>
      </Table>
    </div>
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
  const { incomes, expenses, accounts, chartOfAccounts, loanApplications, currency, companyProfile } = state
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
  // Principal actually out with borrowers: what was disbursed on live loans, less the principal
  // repayments collected against it. A loan with no schedule yet has had no repayments, so its
  // full amount is still outstanding.
  const loanPortfolio = useMemo(() => loanApplications
    .filter(l => l.status === 'Active')
    .reduce((sum, l) => {
      const principalPaid = (l.schedule || []).reduce((s, r) => s + (r.principalPaid || 0), 0)
      return sum + Math.max(Math.round(((l.amount || 0) - principalPaid) * 100) / 100, 0)
    }, 0), [loanApplications])
  // Grand total of every account — the company's total cash position, used for the
  // Balance Sheet's Cash & Cash Equivalents.
  const mainAccountBalance = useMemo(() => accounts.reduce((s, a) => s + (a.balance || 0), 0), [accounts])

  // Balance-sheet figures the loan book doesn't produce come off the chart of accounts, by
  // code. Only the USD accounts are summed: every figure in this statement is held in dollars
  // and converted on the way out (see formatVal), so folding a riel balance in as-is would
  // overstate it by the exchange rate.
  const glBalance = useCallback((...codes) => codes.reduce((sum, code) => {
    const account = chartOfAccounts.find(a => a.code === code)
    return sum + (account && account.currency === 'USD' ? (account.balance || 0) : 0)
  }, 0), [chartOfAccounts])

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

  // head/body/foot for autoTable, built from whichever columns are on screen — a column hidden
  // in the table is hidden in the exported PDF too, which is usually why it was hidden.
  // `firstHeader` renames the leading column for the statements that head it with the section
  // name ("Revenue" over the category column) instead of the column's own label.
  const columnTable = (columns, rows, totals = null, label = 'Totals', firstHeader = null) => ({
    head: [columns.map((c, i) => (i === 0 && firstHeader ? firstHeader : c.label))],
    body: rows.map(row => columns.map(c => pdfSafe(c.text(row)))),
    foot: totals
      ? [columns.map((c, i) => (totals[c.id] != null ? pdfSafe(totals[c.id]) : (i === 0 ? label : '')))]
      : undefined,
    columnStyles: Object.fromEntries(columns.map((c, i) => [i, { halign: c.right ? 'right' : 'left' }])),
  })

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

  // The two P&L sections as rows, so the table on screen and the PDF read off one list.
  const plRevenueRows = useMemo(() => [
    { label: 'Interest Income', val: plRevenueFiltered.interest },
    { label: 'Fees & Charges', val: plRevenueFiltered.fees },
    { label: 'Penalties', val: plRevenueFiltered.penalties },
    { label: 'Other Income', val: plRevenueFiltered.other },
  ], [plRevenueFiltered])
  const plExpenseRows = useMemo(() => [
    { label: 'Salaries & Benefits', val: plExpensesFiltered.salaries },
    { label: 'Office & Administration', val: plExpensesFiltered.admin },
    { label: 'Tax & Regulation', val: plExpensesFiltered.tax },
    { label: 'Loan Loss Provisions', val: plExpensesFiltered.provisions },
    { label: 'Other Expenses', val: plExpensesFiltered.other },
  ], [plExpensesFiltered])

  // ── Statement columns ──────────────────────────────────────────────────────
  const MONO = 'font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap'
  const PLAIN = 'text-slate-600 dark:text-slate-300'
  const MONEY = 'font-medium text-slate-700 dark:text-slate-200'
  const money = (v, cur = currency, rate) => (v > 0 ? formatVal(v, cur, rate) : '—')

  const glDailyColumns = useMemo(() => [
    { id: 'trnDate',   label: 'Trn Date',   cellCls: `${PLAIN} whitespace-nowrap`, text: r => r.trnDate },
    { id: 'trnNo',     label: 'Trn No',     cellCls: MONO,  text: r => r.trnNo },
    { id: 'valueDate', label: 'Value Date', cellCls: `${PLAIN} whitespace-nowrap`, text: r => r.valueDate },
    { id: 'recId',     label: 'RecID',      cellCls: MONO,  text: r => r.recId },
    { id: 'accCode',   label: 'Acc Code',   cellCls: MONO,  text: r => r.accCode },
    { id: 'accName',   label: 'Acc Name',   cellCls: PLAIN, text: r => r.accName },
    { id: 'memo',      label: 'Memo',       cellCls: 'text-slate-700 dark:text-slate-200', text: r => r.memo },
    { id: 'debit',     label: 'Debit',  right: true, cellCls: MONEY, text: r => money(r.debit) },
    { id: 'credit',    label: 'Credit', right: true, cellCls: MONEY, text: r => money(r.credit) },
    { id: 'bal',       label: 'Bal',    right: true, cellCls: 'font-bold text-slate-700 dark:text-slate-200', text: r => formatVal(r.bal, currency) },
  ], [currency])

  const glHistoryColumns = useMemo(() => [
    { id: 'date',        label: 'Date',        cellCls: PLAIN, text: e => e.date },
    { id: 'ref',         label: 'Ref',         cellCls: 'font-mono text-slate-500 dark:text-slate-400', text: e => e.code },
    { id: 'description', label: 'Description', cellCls: 'text-slate-700 dark:text-slate-200', text: e => glDescription(e) },
    { id: 'account',     label: 'Account',     cellCls: PLAIN, text: e => glAccountLabel(e) },
    { id: 'type',        label: 'Type',        cellCls: '', text: e => e.txType, render: e => <TypeBadge type={e.txType} /> },
    { id: 'debit',       label: 'Debit',  right: true, cellCls: MONEY, text: e => money(e.debit) },
    { id: 'credit',      label: 'Credit', right: true, cellCls: MONEY, text: e => money(e.credit) },
  ], [currency, accounts])

  // Both P&L sections share one column set — hiding a column there hides it on Revenue and on
  // Operating Expenses together, which is what an accountant reading one statement expects.
  const plColumns = useMemo(() => [
    { id: 'category', label: 'Category', cellCls: PLAIN, text: r => r.label },
    { id: 'amount',   label: 'Amount', right: true, cellCls: MONEY, text: r => formatVal(r.val, plCurrency, plExchangeRate) },
  ], [plCurrency, plExchangeRate])

  const bsColumns = useMemo(() => [
    { id: 'description', label: 'Description', cellCls: PLAIN, text: r => r.label },
    { id: 'debit',       label: 'Debit',  right: true, cellCls: MONEY, text: r => money(r.debit, bsCurrency, bsExchangeRate) },
    { id: 'credit',      label: 'Credit', right: true, cellCls: MONEY, text: r => money(r.credit, bsCurrency, bsExchangeRate) },
  ], [bsCurrency, bsExchangeRate])

  const glDaily = useStatementColumns('gl-daily', glDailyColumns)
  const glHistory = useStatementColumns('gl-history', glHistoryColumns)
  const pl = useStatementColumns('pl', plColumns)
  const bs = useStatementColumns('bs', bsColumns)

  const glDailyTotals = {
    debit: formatVal(glDailyRows.reduce((s, r) => s + r.debit, 0), currency),
    credit: formatVal(glDailyRows.reduce((s, r) => s + r.credit, 0), currency),
    bal: glDailyRows.length ? formatVal(glDailyRows[glDailyRows.length - 1].bal, currency) : formatVal(0, currency),
  }
  const glHistoryTotals = {
    debit: formatVal(historyEntries.reduce((s, e) => s + e.debit, 0), currency),
    credit: formatVal(historyEntries.reduce((s, e) => s + e.credit, 0), currency),
  }
  const DEBIT_CREDIT_CLS = { debit: 'text-rose-600', credit: 'text-emerald-600' }

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

    autoTable(doc, {
      startY: 31,
      ...columnTable(glDaily.visible, glDailyRows, glDailyTotals),
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

    autoTable(doc, {
      startY: 31,
      ...columnTable(glHistory.visible, historyEntries, glHistoryTotals),
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
      ...columnTable(
        pl.visible, plRevenueRows,
        { amount: formatVal(plRevenueFiltered.total, plCurrency, plExchangeRate) },
        'Total Revenue', 'Revenue',
      ),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      ...columnTable(
        pl.visible, plExpenseRows,
        { amount: formatVal(plExpensesFiltered.total, plCurrency, plExchangeRate) },
        'Total Expenses', 'Operating Expenses',
      ),
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
    { label: 'Cash & Cash Equivalents (Main Account)', debit: mainAccountBalance, credit: 0 },
    { label: 'Loan Portfolio (Gross)', debit: loanPortfolio, credit: 0 },
    { label: 'Less: Provision for Loan Losses', debit: 0, credit: plExpenses.provisions },
  ], [mainAccountBalance, loanPortfolio, plExpenses])
  // 2010 customer deposits and 2030 loan principal approved but not yet released are both
  // money owed out, so they read as one Accounts Payable line the way an accountant states it.
  const bsLiabilityRows = useMemo(() => [
    { label: 'Borrowings / Debt', debit: 0, credit: glBalance('2020') },
    { label: 'Accounts Payable', debit: 0, credit: glBalance('2010', '2030') },
    { label: 'Tax Payable', debit: 0, credit: glBalance('2040') },
    { label: 'Accumulated Depreciation', debit: 0, credit: glBalance('2050') },
  ], [glBalance])
  // Retained earnings carries what the chart holds plus the result this period has thrown off
  // and not yet closed into it.
  const bsEquityRows = useMemo(() => {
    const retained = glBalance('3020') + netProfit
    return [
      { label: 'Paid-in Capital', debit: 0, credit: glBalance('3010') },
      { label: 'Retained Earnings', debit: retained < 0 ? -retained : 0, credit: retained >= 0 ? retained : 0 },
    ]
  }, [glBalance, netProfit])
  const bsTotalAssets = bsAssetRows.reduce((s, r) => s + r.debit - r.credit, 0)
  const bsTotalLiabilities = bsLiabilityRows.reduce((s, r) => s + r.credit - r.debit, 0)
  const bsTotalEquity = bsEquityRows.reduce((s, r) => s + r.credit - r.debit, 0)

  function handleDownloadBs() {
    const doc = new jsPDF()
    addPdfHeader(doc, 'Balance Sheet')
    doc.text(`${bsCurrency}${bsCurrency === 'KHR' ? ` (1 USD = ${bsExchangeRate} KHR)` : ''} · ${bsBranch}`, 14, 26)

    const bsTotal = (v) => formatVal(v, bsCurrency, bsExchangeRate)
    const tableOpts = {
      styles: { fontSize: 9 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    }

    autoTable(doc, {
      startY: 31,
      ...tableOpts,
      ...columnTable(bs.visible, bsAssetRows, { debit: bsTotal(bsTotalAssets), credit: '—' }, 'Total Assets', 'Assets'),
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      ...tableOpts,
      ...columnTable(bs.visible, bsLiabilityRows, { debit: '—', credit: bsTotal(bsTotalLiabilities) }, 'Total Liabilities', 'Liabilities'),
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      ...tableOpts,
      ...columnTable(bs.visible, bsEquityRows, { debit: '—', credit: bsTotal(bsTotalEquity) }, 'Total Equity', 'Equity'),
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
              columnPicker={glDaily.picker}
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
                  <ColumnHead columns={glDaily.visible} />
                  <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {glDailyRows.length === 0
                      ? <EmptyRow colSpan={glDaily.visible.length} message="No transactions recorded for this date." />
                      : glDailyRows.map((r, i) => (
                        <TableRow key={i} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <ColumnCells columns={glDaily.visible} row={r} />
                        </TableRow>
                      ))
                    }
                    {glDailyRows.length > 0 && (
                      <TableRow aria-hidden="true" className="border-0 hover:bg-transparent"><TableCell colSpan={glDaily.visible.length} className="h-full p-0" /></TableRow>
                    )}
                  </TableBody>
                  {glDailyRows.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-10">
                      <TotalsRow columns={glDaily.visible} label="Totals" totals={glDailyTotals} cls={DEBIT_CREDIT_CLS} />
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
              columnPicker={glHistory.picker}
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
                  <ColumnHead columns={glHistory.visible} />
                  <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                    {historyEntries.length === 0
                      ? <EmptyRow colSpan={glHistory.visible.length} message="No ledger history found." />
                      : historyEntries.map((e, i) => (
                        <TableRow key={i} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <ColumnCells columns={glHistory.visible} row={e} />
                        </TableRow>
                      ))
                    }
                  </TableBody>
                  {historyEntries.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-10">
                      <TotalsRow columns={glHistory.visible} label="Totals" totals={glHistoryTotals} cls={DEBIT_CREDIT_CLS} />
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
              columnPicker={pl.picker}
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
                      <ColumnHead columns={pl.visible} />
                      <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {plRevenueRows.map(row => (
                          <TableRow key={row.label} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <ColumnCells columns={pl.visible} row={row} />
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter className="sticky bottom-0 z-10">
                        <TotalsRow
                          columns={pl.visible}
                          label="Total Revenue"
                          totals={{ amount: formatVal(plRevenueFiltered.total, plCurrency, plExchangeRate) }}
                          cls={{ amount: 'text-emerald-600' }}
                        />
                      </TableFooter>
                    </Table>
                  </div>
                </div>
                {/* Expenses */}
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest mb-3">Operating Expenses</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                    <Table className="w-full">
                      <ColumnHead columns={pl.visible} />
                      <TableBody className="divide-y divide-slate-50 dark:divide-slate-700">
                        {plExpenseRows.map(row => (
                          <TableRow key={row.label} className="border-0 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                            <ColumnCells columns={pl.visible} row={row} />
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter className="sticky bottom-0 z-10">
                        <TotalsRow
                          columns={pl.visible}
                          label="Total Expenses"
                          totals={{ amount: formatVal(plExpensesFiltered.total, plCurrency, plExchangeRate) }}
                          cls={{ amount: 'text-rose-600' }}
                        />
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
              columnPicker={bs.picker}
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
                <StatementSection
                  title="Assets"
                  columns={bs.visible}
                  rows={bsAssetRows}
                  totalLabel="Total Assets"
                  totals={{ debit: formatVal(bsTotalAssets, bsCurrency, bsExchangeRate), credit: '—' }}
                  cls={{ debit: 'text-brand-600', credit: 'font-normal text-slate-500' }}
                />
                <StatementSection
                  title="Liabilities"
                  columns={bs.visible}
                  rows={bsLiabilityRows}
                  totalLabel="Total Liabilities"
                  totals={{ debit: '—', credit: formatVal(bsTotalLiabilities, bsCurrency, bsExchangeRate) }}
                  cls={{ debit: 'font-normal text-slate-500', credit: 'text-rose-600' }}
                />
                <StatementSection
                  title="Equity"
                  columns={bs.visible}
                  rows={bsEquityRows}
                  totalLabel="Total Equity"
                  totals={{ debit: '—', credit: formatVal(bsTotalEquity, bsCurrency, bsExchangeRate) }}
                  cls={{ debit: 'font-normal text-slate-500', credit: 'text-brand-600' }}
                />
              </div>
            </ReportPanel>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
