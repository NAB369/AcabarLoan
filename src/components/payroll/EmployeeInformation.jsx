import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Search, User, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useTableColumns, ColumnPicker, SortHeader, ariaSortFor } from '../shared/DataTableTools'
import { EMPTY_ADDRESS } from '../../data/constants'
import Pagination from '../shared/Pagination'
import StatusBadge from '../shared/StatusBadge'
import {
  employeeName, employeePhone, employeeEmail, employeeAddress,
  nextEmployeeNo, splitFullName, splitPhone, splitEmail, isOnPayroll, periodBounds, periodLabel,
  employeeDeduction, employeeNetSalary,
} from '../../utils/employee'
import { formatDateDisplay, formatVal } from '../../utils/format'
import EmployeeForm from './EmployeeForm'
import EmployeePreview from './EmployeePreview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'

const PAGE_SIZE = 15

// Every field Add an Employee collects, in the order the form asks for it. `value` is the
// text the column sorts and searches on; `render` is what the cell draws when that differs
// (a formatted date, a currency amount, a mailto link). One list drives the header and the
// body together, so a column can't end up labelled one thing and filled with another.
//
// Office No. and Leave Date are deliberately absent: the form collects neither. A leave date
// still reaches the record and payroll still acts on it, so the Name cell flags it inline
// rather than the register spending a column on a field nobody can fill in.
const COLUMNS = [
  {
    id: 'name', label: 'Name', value: e => employeeName(e),
    render: (e) => (
      <>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {employeeName(e) || e.employeeNo}
        </span>
        {/* Flags someone off the payroll without spending a column on it */}
        {e.leaveDate && (
          <span className="ml-2 text-[10px] font-bold text-slate-400 dark:text-slate-500">left {e.leaveDate}</span>
        )}
      </>
    ),
    cellClass: 'whitespace-nowrap',
  },
  { id: 'employeeNo', label: 'Employee No.', value: e => e.employeeNo || '', cellClass: 'font-mono whitespace-nowrap' },
  { id: 'legalIdType', label: 'ID Type', value: e => e.legalIdType || '', cellClass: 'whitespace-nowrap' },
  { id: 'legalId', label: 'Legal ID', value: e => e.legalId || '', cellClass: 'font-mono whitespace-nowrap' },
  { id: 'gender', label: 'Gender', value: e => e.gender || '' },
  {
    id: 'dob', label: 'Date of Birth', value: e => e.dob || '',
    render: e => formatDateDisplay(e.dob), cellClass: 'whitespace-nowrap',
  },
  { id: 'nationality', label: 'Nationality', value: e => e.nationality || '', cellClass: 'whitespace-nowrap' },
  { id: 'position', label: 'Position', value: e => e.position || '' },
  {
    id: 'salary', label: 'Monthly Salary', value: e => e.salary || 0,
    // Sorted as a number — as text, $1,500.00 would fall before $600.00.
    numeric: true,
    render: (e, { currency }) => (e.salary ? formatVal(e.salary, currency) : ''),
    cellClass: 'text-right whitespace-nowrap font-semibold',
    align: 'right',
  },
  {
    id: 'deduction', label: 'Deduction', numeric: true,
    value: e => employeeDeduction(e),
    // Blank rather than a zero when nothing is held back — a column of $0.00 down the register
    // reads as a figure someone entered, when in fact nobody has one.
    render: (e, { currency }) => (employeeDeduction(e) ? formatVal(employeeDeduction(e), currency) : ''),
    cellClass: 'text-right whitespace-nowrap text-rose-600 dark:text-rose-400',
    align: 'right',
  },
  {
    id: 'netSalary', label: 'Net Salary', numeric: true,
    // Derived from the two columns beside it, so it can never disagree with them. This is the
    // figure payroll actually pays — see the run modal.
    value: e => employeeNetSalary(e),
    render: (e, { currency }) => (e.salary ? formatVal(employeeNetSalary(e), currency) : ''),
    cellClass: 'text-right whitespace-nowrap font-bold text-slate-800 dark:text-slate-100',
    align: 'right',
  },
  // ── What this employee is being paid for the period the register is filtered to ──
  // Approval used to be a tab of its own listing payroll runs. A run is a batch, but what an
  // operator checks before releasing it is per person — so the run's own lines are read back
  // onto the staff they pay, and the release happens from the header above.
  // All three read from the render context rather than the employee: the figures belong to the
  // selected period, not to the record.
  {
    id: 'payPeriod', label: 'Pay Period',
    value: (e, ctx) => (ctx?.paidLines?.has(e.id) ? (ctx.selectedPeriodLabel || '') : ''),
    cellClass: 'whitespace-nowrap',
  },
  {
    id: 'payAmount', label: 'Amount', numeric: true,
    value: (e, ctx) => ctx?.paidLines?.get(e.id) || 0,
    render: (e, ctx) => (ctx.paidLines.has(e.id) ? formatVal(ctx.paidLines.get(e.id), ctx.currency) : ''),
    cellClass: 'text-right whitespace-nowrap font-semibold',
    align: 'right',
  },
  {
    id: 'payStatus', label: 'Payment Status',
    // An employee outside the run is not "unpaid" — nothing was committed for them at all,
    // which is a different thing and worth saying rather than leaving blank.
    value: (e, ctx) => (ctx?.paidLines?.has(e.id) ? (ctx.payStatus || 'Pending Approval') : ''),
    render: (e, ctx) => (ctx.paidLines.has(e.id)
      ? <StatusBadge status={ctx.payStatus || 'Pending Approval'} size="xs" />
      : <span className="text-[10px] text-slate-400 dark:text-slate-500">Not in this run</span>),
    cellClass: 'whitespace-nowrap',
  },
  { id: 'accountNumber', label: 'Account Number', value: e => e.accountNumber || '', cellClass: 'font-mono whitespace-nowrap' },
  { id: 'mobile', label: 'Mobile No.', value: e => employeePhone(e.mobileCode, e.mobileNo), cellClass: 'whitespace-nowrap' },
  { id: 'emergency', label: 'Emergency No.', value: e => employeePhone(e.emergencyCode, e.emergencyNo), cellClass: 'whitespace-nowrap' },
  {
    id: 'email', label: 'Email', value: e => employeeEmail(e),
    render: e => employeeEmail(e) && (
      // Stops the click so the mailto fires instead of opening the row's preview
      <a href={`mailto:${employeeEmail(e)}`} onClick={ev => ev.stopPropagation()} className="hover:text-[#0047ab] dark:hover:text-blue-400 hover:underline">
        {employeeEmail(e)}
      </a>
    ),
  },
  {
    id: 'entryDate', label: 'Entry Date', value: e => e.entryDate || '',
    render: e => formatDateDisplay(e.entryDate), cellClass: 'whitespace-nowrap',
  },
  // The only column left free to wrap — an address is far too long for one line.
  { id: 'address', label: 'Home Address', value: e => employeeAddress(e), cellClass: 'min-w-[220px]' },
]

const MONTHS = [
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
].map(value => ({
  value,
  label: new Date(2000, Number(value) - 1, 1).toLocaleDateString('en-GB', { month: 'long' }),
}))

// Payroll is run a month at a time, so the register opens on the month being paid rather than
// on everyone who has ever been on staff. Both filters carry an "All" so the full register is
// still one click away — someone who has left is otherwise unreachable from here.
const thisYear = () => String(new Date().getFullYear())
const thisMonth = () => String(new Date().getMonth() + 1).padStart(2, '0')

// The span a year/month choice covers, as ISO bounds. An empty start means no period filter.
function filterBounds(year, month) {
  if (year === 'all') return { start: '', end: '' }
  if (month === 'all') return { start: `${year}-01-01`, end: `${year}-12-31` }
  return periodBounds(`${year}-${month}`)
}

// Minimal CSV row reader — enough for the quoted, comma-separated exports HR hands over.
function parseCsvRow(line) {
  const out = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cell); cell = '' }
    else cell += ch
  }
  out.push(cell)
  return out.map(c => c.trim())
}

// Columns are matched by what their header contains rather than by position, so a file that
// carries extra columns or lists them in another order still imports.
function columnIndexes(header) {
  const find = (...needles) => header.findIndex(h => needles.some(n => h.includes(n)))
  return {
    name: find('name'),
    position: find('position', 'rank', 'title'),
    mobile: find('mobile', 'phone'),
    office: find('office'),
    email: find('email'),
  }
}

function EmptyAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
      <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
    </div>
  )
}

export default function EmployeeInformation({ onProcessPayroll, onApproveRun, onRejectRun }) {
  const { state, dispatch, showToast } = useApp()
  const { employees, currency } = state
  const uploadRef = useRef(null)

  // null = no form open; otherwise the record being edited, or 'new' for a blank one. The
  // form is a modal over this list rather than a page of its own.
  const [formFor, setFormFor] = useState(null)
  const [search, setSearch] = useState('')
  // Opens on the month being paid — see filterBounds. 'all' on either widens it back out.
  const [year, setYear] = useState(thisYear)
  const [month, setMonth] = useState(thisMonth)
  // Which columns the register shows. Persisted, so the view an operator sets is the one they
  // get back — the register carries fourteen columns and few people want all of them at once.
  const { visible: visibleColumns, visibleIds, toggle: toggleColumn } = useTableColumns(COLUMNS, {
    value: state.payrollColumns?.employees,
    onChange: ids => dispatch({ type: 'SET_PAYROLL_COLUMNS', table: 'employees', ids }),
  })
  // ── The payroll run covering the period the register is filtered to ──
  // Only meaningful with one year and one month selected: 'all' on either widens the register
  // past any single run, and there is then no one period to report a status for.
  const period = year !== 'all' && month !== 'all' ? `${year}-${month}` : null
  const selectedPeriodLabel = period
    ? new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : ''
  const periodRun = useMemo(
    () => (period ? (state.payrollRuns || []).find(r => r.period === period) : null),
    [state.payrollRuns, period]
  )
  // The posting the run raised is what actually gets approved — the run itself carries no
  // status, so the release state is read off the expense it created.
  const periodPosting = useMemo(
    () => (periodRun ? (state.expenses || []).find(e => e.code === periodRun.code) : null),
    [state.expenses, periodRun]
  )
  const paidLines = useMemo(() => {
    const map = new Map()
    for (const line of periodRun?.lines || []) map.set(line.employeeId, line.amount)
    return map
  }, [periodRun])
  const payStatus = periodPosting?.status || null
  const awaitingApproval = !!periodPosting && payStatus !== 'Approved'

  // Every salary posting still waiting to be released, whichever month it belongs to. Payroll
  // is normally run for the month just gone while the register opens on the current one, so a
  // release tied only to the selected period sat invisible on the wrong filter and there was
  // nowhere to approve it from. Newest first — the run just made is the one being looked for.
  const outstandingRuns = useMemo(() => {
    const postings = new Map((state.expenses || []).map(e => [e.code, e]))
    return (state.payrollRuns || [])
      .map(run => ({ run, posting: postings.get(run.code) }))
      .filter(x => x.posting && x.posting.status !== 'Approved')
      .sort((a, b) => (b.run.period || '').localeCompare(a.run.period || ''))
  }, [state.payrollRuns, state.expenses])
  // Only surfaced when the selected period has nothing outstanding of its own, so the two
  // controls never both appear and compete.
  const outstandingElsewhere = awaitingApproval ? null : outstandingRuns[0] || null
  // Everything a cell or a sort comparison needs that isn't on the employee record.
  const cellCtx = { currency, paidLines, selectedPeriodLabel, payStatus }

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState(null)
  // The record a row click opened for viewing — read-only until Edit is pressed.
  const [previewing, setPreviewing] = useState(null)

  // Every year the register touches, plus the current one so a book with no staff yet still
  // opens on something real. Newest first — payroll is run for the month just gone.
  const years = useMemo(() => {
    const seen = new Set([thisYear()])
    employees.forEach(e => {
      if (e.entryDate) seen.add(e.entryDate.slice(0, 4))
      if (e.leaveDate) seen.add(e.leaveDate.slice(0, 4))
    })
    return [...seen].sort().reverse()
  }, [employees])

  const inPeriod = useMemo(() => {
    const { start, end } = filterBounds(year, month)
    // A record with no entry date can't be placed in any period. It stays listed rather than
    // disappearing from every month — the register is also where a half-filled record is fixed.
    return e => (!start || !e.entryDate) ? true : isOnPayroll(e, start, end)
  }, [year, month])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const inMonth = employees.filter(inPeriod)
    if (!q) return inMonth
    // Every column the table now shows is searchable, plus the Khmer name, which the
    // register displays only in its Latin form.
    return inMonth.filter(e => [
      employeeName(e, 'khmer'),
      ...COLUMNS.map(col => String(col.value(e) ?? '')),
    ].some(v => (v || '').toLowerCase().includes(q)))
  }, [employees, search, inPeriod])

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.id === sort.key)
    if (!col) return filtered
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = col.value(a, cellCtx) || (col.numeric ? 0 : '')
      const bv = col.value(b, cellCtx) || (col.numeric ? 0 : '')
      // Blank cells sort last either way — an employee with no emergency number shouldn't
      // head the list just because the column is empty. A zero amount is a real value,
      // not a blank, so numeric columns skip this.
      if (!col.numeric) {
        if (!av && bv) return 1
        if (av && !bv) return -1
        return av.localeCompare(bv, undefined, { numeric: true }) * dir
      }
      return (av - bv) * dir
    })
  }, [filtered, sort, cellCtx])

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const from = (safePage - 1) * PAGE_SIZE + 1
  const to = Math.min(safePage * PAGE_SIZE, total)
  const rows = sorted.slice(from - 1, to)

  // ── Who the next payroll run pays ──
  // Ticked rows, by employee id. Cleared whenever the period or the search changes: a run pays
  // one month, and a selection made against a different month or a wider search is not a
  // statement about the rows now on screen — carrying it silently would pay people the
  // operator can no longer see.
  const toggleOne = id => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  // Select-all covers everything the current filter matches, not just the page in view — the
  // register pages at 15 and a payroll of 40 would otherwise need ticking three times.
  const shownIds = useMemo(() => sorted.map(e => e.id), [sorted])
  const selectedShown = shownIds.filter(id => selectedIds.has(id))
  const allShownSelected = shownIds.length > 0 && selectedShown.length === shownIds.length
  const someShownSelected = selectedShown.length > 0
  const toggleAllShown = () => setSelectedIds(prev => {
    if (allShownSelected) {
      const next = new Set(prev)
      shownIds.forEach(id => next.delete(id))
      return next
    }
    return new Set([...prev, ...shownIds])
  })

  // Any change to what is being listed returns to the first page — otherwise a filter that
  // shrinks the list leaves the table on a page that no longer exists.
  useEffect(() => { setPage(1) }, [search, sort, year, month])
  // A tick is a statement about the rows on screen, so changing which rows those are drops it.
  // Sorting is left out: it reorders the same people rather than changing who they are.
  useEffect(() => { setSelectedIds(new Set()) }, [search, year, month])

  // These modals are local component state, so App.jsx's global Escape handler (which only
  // knows about reducer state) can't reach them.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      if (formFor !== null) setFormFor(null)
      else if (deleting) setDeleting(null)
      else if (previewing) setPreviewing(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [formFor, deleting, previewing])

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  function handleUpload(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      const lines = String(e.target.result).split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { showToast('That file has no employee rows to import', 'error'); return }
      const header = parseCsvRow(lines[0]).map(h => h.toLowerCase())
      const idx = columnIndexes(header)
      if (idx.name === -1) { showToast('The file needs a Name column', 'error'); return }

      const imported = []
      let skipped = 0
      lines.slice(1).forEach(line => {
        const cells = parseCsvRow(line)
        const full = cells[idx.name] || ''
        if (!full) { skipped++; return }
        const mobile = splitPhone(idx.mobile === -1 ? '' : cells[idx.mobile])
        const office = splitPhone(idx.office === -1 ? '' : cells[idx.office])
        const email = splitEmail(idx.email === -1 ? '' : cells[idx.email])
        const entryDate = new Date().toISOString().split('T')[0]
        imported.push({
          // Number against the rows already accepted in this batch as well as the register,
          // so a multi-row file doesn't hand every new employee the same number.
          id: `EMP-${Date.now().toString(36).toUpperCase()}-${imported.length}`,
          employeeNo: nextEmployeeNo([...employees, ...imported], entryDate),
          photo: '',
          nameKhmer: { first: '', last: '' },
          nameEnglish: splitFullName(full),
          legalIdType: 'National ID', legalId: '',
          gender: '', dob: '', nationality: 'Cambodian',
          position: idx.position === -1 ? '' : (cells[idx.position] || ''),
          officeCode: office.code, officeNo: office.number,
          mobileCode: mobile.code, mobileNo: mobile.number,
          emergencyCode: '+855', emergencyNo: '',
          emailLocal: email.local, emailDomain: email.domain,
          entryDate, leaveDate: '',
          // A CSV carries no structured address, so it is left blank for the form to fill in.
          address: { ...EMPTY_ADDRESS },
        })
      })

      if (imported.length === 0) { showToast('No employee rows could be read from that file', 'error'); return }
      dispatch({ type: 'ADD_EMPLOYEES', employees: imported })
      // One line for the batch rather than one per row — a file of eighty employees is a
      // single act, and the rows it added are all in the register to read.
      dispatch({
        type: 'ADD_AUDIT_LOG',
        log: {
          module: 'Payroll',
          action: `${imported.length} employee${imported.length === 1 ? '' : 's'} imported${skipped ? ` · ${skipped} row${skipped === 1 ? '' : 's'} skipped` : ''}`,
          reference: 'CSV',
        },
      })
      showToast(
        `${imported.length} employee${imported.length === 1 ? '' : 's'} imported${skipped ? ` · ${skipped} row${skipped === 1 ? '' : 's'} skipped` : ''}`,
        'success'
      )
    }
    reader.readAsText(file)
  }

  function handleDelete() {
    dispatch({ type: 'DELETE_EMPLOYEE', id: deleting.id })
    // The one event nothing else can evidence: once the record is gone, the register holds
    // no trace that the employee was ever on it. The salary rides along as the amount so the
    // log says what pay left the payroll with them.
    dispatch({
      type: 'ADD_AUDIT_LOG',
      log: {
        module: 'Payroll',
        action: `Employee removed — ${employeeName(deleting) || deleting.employeeNo}`,
        reference: deleting.employeeNo,
        amount: deleting.salary || null,
      },
    })
    showToast(`${employeeName(deleting) || deleting.employeeNo} removed from the register`, 'success')
    setDeleting(null)
  }

  // Alignment is kept out of the base string so a right-aligned column can set its own:
  // Tailwind emits text-right after text-left regardless of the order they appear in the
  // class attribute, so a `text-left` here would be relying on that rather than saying it.
  const th = 'px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50 whitespace-nowrap'

  return (
    <div className="space-y-4">
      {/* No heading — the active payroll tab already names this page. The toolbar lives on
          the table itself: search and pay period at the left, Upload and Add at the right. */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <Input
              type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
              className="w-full h-auto border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus-visible:ring-0 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Pay period. Two selects rather than a month input: payroll is discussed as a
              month and a year, and a year on its own is a legitimate view. */}
          <select
            value={year}
            onChange={e => setYear(e.target.value)}
            aria-label="Filter by year"
            className="h-auto border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            disabled={year === 'all'}
            aria-label="Filter by month"
            className="h-auto border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <option value="all">All Months</option>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>

          {/* The period's release, beside the filter that chose the period. Approval is per
              run, not per employee — a batch is committed and released whole — so it is one
              control over the table rather than a button repeated down every row. It appears
              only when the selected period actually has something outstanding. */}
          {awaitingApproval && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                {selectedPeriodLabel} · {formatVal(periodPosting.amount, currency)} awaiting approval
              </span>
              <Button
                onClick={() => onApproveRun?.(periodPosting.code)}
                className="h-auto px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
              >
                Approve
              </Button>
              {/* Outline, not solid: approving is the expected outcome and carries the one
                  filled button, so refusing does not compete with it for the eye. */}
              <Button
                variant="outline"
                onClick={() => onRejectRun?.(periodPosting.code)}
                className="h-auto shadow-none px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
              >
                Reject
              </Button>
            </div>
          )}

          {/* A run waiting on another month. Naming the month is the point — the operator has
              just processed payroll and is looking for where to release it, and it is not on
              the month they are filtered to. Pressing it moves the register there as well as
              approving, so the rows they end up looking at are the ones just released. */}
          {outstandingElsewhere && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-200/60 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400 whitespace-nowrap">
                {periodLabel(outstandingElsewhere.run.period)} · {formatVal(outstandingElsewhere.posting.amount, currency)} awaiting approval
              </span>
              <Button
                onClick={() => {
                  const [y, m] = String(outstandingElsewhere.run.period || '').split('-')
                  if (y && m) { setYear(y); setMonth(m) }
                  onApproveRun?.(outstandingElsewhere.posting.code)
                }}
                className="h-auto px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors"
              >
                Approve {periodLabel(outstandingElsewhere.run.period)}
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 sm:ml-auto">
            <ColumnPicker columns={COLUMNS} visibleIds={visibleIds} onToggle={toggleColumn} iconOnly />
            {/* Runs a period rather than adding a row, so it carries no plus icon. It pays the
                ticked names and opens on the month the register is filtered to, so the run
                matches what was just being looked at. With nothing ticked it falls back to
                everyone on payroll that month — the normal case is the whole staff, and an
                operator who ticked nothing meant "run it", not "run it for nobody". */}
            <Button
              variant="outline"
              onClick={() => onProcessPayroll?.({
                employeeIds: selectedShown,
                period: period || undefined,
              })}
              className="h-auto shadow-none px-4 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Process Payroll{selectedShown.length ? ` (${selectedShown.length})` : ''}
            </Button>
            <Button
              variant="outline"
              onClick={() => uploadRef.current?.click()}
              title="Import employees from a CSV file"
              className="h-auto shadow-none flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Upload
            </Button>
            {/* Named for what it adds, so the two buttons read as separate actions rather
                than a bare "Add" beside "Upload" */}
            <Button
              onClick={() => setFormFor('new')}
              className="h-auto px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors"
            >
              Add Employee
            </Button>
            <input
              ref={uploadRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { handleUpload(e.target.files?.[0]); e.target.value = '' }}
            />
          </div>
        </div>

        {/* Scrolls both ways with the header pinned — same panel height as the customer
            register, so the footer stays put as rows are paged through. */}
        {/* Kept as a plain <table> rather than the <Table> wrapper: shadcn's Table hardcodes
            its own `overflow-auto` div with no way to opt out, which would nest inside this
            panel's own dual-axis scroll container and break the sticky header below. */}
        <div className="overflow-x-auto min-h-[60vh] max-h-[60vh] overflow-y-auto">
          <table className="w-full">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="border-b-0 hover:bg-transparent">
                {/* Who this run pays. Ticking is what Process Payroll acts on, so the header
                    box covers everyone the current filter shows — select-all means "all of
                    these", not every employee on the register. Indeterminate when only some
                    are ticked, so a partial selection is visible without counting rows. */}
                <TableHead className={`${th} w-10`}>
                  <input
                    type="checkbox"
                    aria-label="Select all employees in this view"
                    checked={allShownSelected}
                    ref={el => { if (el) el.indeterminate = someShownSelected && !allShownSelected }}
                    onChange={toggleAllShown}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 accent-brand-600 cursor-pointer"
                  />
                </TableHead>
                <TableHead className={`${th} w-14`}><span className="sr-only">Photo</span></TableHead>
                {/* Every header sorts, and now says so: an arrow on each, filled in on the
                    column actually in use. Before this the click worked but nothing on screen
                    showed the table was sortable, or which column it was ordered by.
                    The register keys its sort state on `key`; SortHeader — shared with the
                    customer, loan and payroll tables — reads `id`, so it is handed that shape
                    rather than the sort engine being rewritten around it. */}
                {visibleColumns.map(col => {
                  const sortState = sort ? { id: sort.key, dir: sort.dir } : null
                  const sortable = { ...col, sortable: true }
                  return (
                    <TableHead
                      key={col.id}
                      aria-sort={ariaSortFor(sortable, sortState)}
                      className={`${th} ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      <SortHeader column={sortable} sort={sortState} onSort={toggleSort}>
                        {col.label}
                      </SortHeader>
                    </TableHead>
                  )
                })}
                <TableHead className={`${th} w-16`}><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 dark:divide-slate-700 [&_tr]:border-b-0">
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={visibleColumns.length + 2} className="py-12 text-center text-sm text-slate-400">
                    {employees.length === 0
                      ? 'No employees on the register yet — add one to get started.'
                      /* Names the period, so an empty month doesn't read as an empty register */
                      : (!search.trim() && year !== 'all' && month !== 'all')
                        ? `Nobody was on payroll in ${periodLabel(`${year}-${month}`)}.`
                        : 'No employee matches this filter.'}
                  </TableCell>
                </TableRow>
              ) : rows.map(emp => (
                // The whole row opens the read-only view; the email link and the row
                // actions stop the click so they still do their own job.
                <TableRow
                  key={emp.id}
                  onClick={() => setPreviewing(emp)}
                  className="group cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  {/* Stops the click so ticking a row doesn't also open its preview */}
                  <TableCell className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${employeeName(emp) || emp.employeeNo}`}
                      checked={selectedIds.has(emp.id)}
                      onChange={() => toggleOne(emp.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 accent-brand-600 cursor-pointer"
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    {emp.photo
                      ? <img src={emp.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <EmptyAvatar />}
                  </TableCell>
                  {/* Cells come off the same COLUMNS list as the headers, so the two stay in
                      step. A column with no render shows its sort text; an empty one a dash. */}
                  {visibleColumns.map(col => {
                    const content = col.render ? col.render(emp, cellCtx) : col.value(emp, cellCtx)
                    return (
                      <TableCell key={col.id} className={`px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 ${col.cellClass || ''}`}>
                        {content || '—'}
                      </TableCell>
                    )
                  })}
                  <TableCell className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="ghost" size="icon"
                        onClick={e => { e.stopPropagation(); setFormFor(emp) }} title="Edit employee"
                        className="h-auto w-auto p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={e => { e.stopPropagation(); setDeleting(emp) }} title="Remove employee"
                        className="h-auto w-auto p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </table>
        </div>

        {/* Same footer the customer and loan registers use */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
            <Pagination page={safePage} totalPages={totalPages} from={from} to={to} total={total} onPage={setPage} />
          </div>
        )}
      </div>

      {deleting && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDeleting(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">Remove employee</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {employeeName(deleting) || deleting.employeeNo} will be taken off the employee register. Salary postings already
              made against payroll are kept.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee info — opened by a row click. Edit hands the record to the form. */}
      {previewing && (
        <EmployeePreview
          employee={previewing}
          onClose={() => setPreviewing(null)}
          onEdit={() => { setFormFor(previewing); setPreviewing(null) }}
        />
      )}

      {/* Add / Edit — a modal over the register, so the list stays where it was */}
      {formFor !== null && (
        <EmployeeForm
          employee={formFor === 'new' ? null : formFor}
          onDone={() => setFormFor(null)}
        />
      )}
    </div>
  )
}
