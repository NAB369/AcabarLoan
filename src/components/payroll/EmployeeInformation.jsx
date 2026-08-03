import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Search, User, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { EMPTY_ADDRESS } from '../../data/constants'
import Pagination from '../shared/Pagination'
import {
  employeeName, employeePhone, employeeEmail, employeeAddress,
  nextEmployeeNo, splitFullName, splitPhone, splitEmail,
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

export default function EmployeeInformation() {
  const { state, dispatch, showToast } = useApp()
  const { employees, currency } = state
  const uploadRef = useRef(null)

  // null = no form open; otherwise the record being edited, or 'new' for a blank one. The
  // form is a modal over this list rather than a page of its own.
  const [formFor, setFormFor] = useState(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState(null)
  // The record a row click opened for viewing — read-only until Edit is pressed.
  const [previewing, setPreviewing] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees
    // Every column the table now shows is searchable, plus the Khmer name, which the
    // register displays only in its Latin form.
    return employees.filter(e => [
      employeeName(e, 'khmer'),
      ...COLUMNS.map(col => String(col.value(e) ?? '')),
    ].some(v => (v || '').toLowerCase().includes(q)))
  }, [employees, search])

  const sorted = useMemo(() => {
    const col = COLUMNS.find(c => c.id === sort.key)
    if (!col) return filtered
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = col.value(a) || (col.numeric ? 0 : '')
      const bv = col.value(b) || (col.numeric ? 0 : '')
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
  }, [filtered, sort])

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const from = (safePage - 1) * PAGE_SIZE + 1
  const to = Math.min(safePage * PAGE_SIZE, total)
  const rows = sorted.slice(from - 1, to)

  // Any change to what is being listed returns to the first page — otherwise a filter that
  // shrinks the list leaves the table on a page that no longer exists.
  useEffect(() => { setPage(1) }, [search, sort])

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
          the table itself: search at the left, Upload and Add at the right. */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <Input
              type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search"
              className="w-full h-auto border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus-visible:ring-0 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-2 sm:ml-auto">
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
                <TableHead className={`${th} w-14`}><span className="sr-only">Photo</span></TableHead>
                {/* Headers still sort on click — no arrow markers on them */}
                {COLUMNS.map(col => (
                  <TableHead key={col.id} className={`${th} ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                    <Button
                      variant="ghost"
                      onClick={() => toggleSort(col.id)}
                      className="h-auto w-auto p-0 font-semibold hover:bg-transparent hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      title={`Sort by ${col.label}`}
                    >
                      {col.label}
                    </Button>
                  </TableHead>
                ))}
                <TableHead className={`${th} w-16`}><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100 dark:divide-slate-700 [&_tr]:border-b-0">
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={COLUMNS.length + 2} className="py-12 text-center text-sm text-slate-400">
                    {employees.length === 0
                      ? 'No employees on the register yet — add one to get started.'
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
                  <TableCell className="px-4 py-2.5">
                    {emp.photo
                      ? <img src={emp.photo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      : <EmptyAvatar />}
                  </TableCell>
                  {/* Cells come off the same COLUMNS list as the headers, so the two stay in
                      step. A column with no render shows its sort text; an empty one a dash. */}
                  {COLUMNS.map(col => {
                    const content = col.render ? col.render(emp, { currency }) : col.value(emp)
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
