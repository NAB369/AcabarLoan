import { Pencil, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Pagination from '../shared/Pagination'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  useTableSort, sortRows, SortHeader, ariaSortFor,
} from '../shared/DataTableTools'

function formatDateDMY(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function shortAddress(addr) {
  if (!addr) return '—'
  if (typeof addr === 'string') return addr || '—'
  return [addr.district, addr.province].filter(Boolean).join(', ') || '—'
}

// Each column carries what it shows and what it sorts on, which are rarely the same value —
// the dates render dd/mm/yyyy and sort on the ISO string behind them, so the order is
// chronological rather than alphabetical by day-of-month.
export const CUSTOMER_COLUMNS = [
  {
    id: 'code', label: 'CID', sortable: true, sortValue: c => c.code || '',
    cellClass: 'font-mono font-semibold text-brand-600 dark:text-brand-400 whitespace-nowrap',
    render: c => c.code,
  },
  {
    id: 'name', label: 'Name', sortable: true, sortValue: c => c.enName || '',
    cellClass: 'whitespace-nowrap',
    render: c => (
      <>
        <p className="font-bold text-slate-800 dark:text-slate-100">{c.enName}</p>
        <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">{c.khName}</p>
      </>
    ),
  },
  { id: 'gender', label: 'Gender', sortable: true, sortValue: c => c.gender || '', render: c => c.gender || '—' },
  { id: 'dob', label: 'Date of Birth', sortable: true, sortValue: c => c.dob || '', render: c => formatDateDMY(c.dob) },
  {
    id: 'idNo', label: 'National ID', sortable: true, sortValue: c => c.idNo || '',
    cellClass: 'font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap', render: c => c.idNo,
  },
  { id: 'phone', label: 'Phone Number', sortable: true, sortValue: c => c.phone || '', render: c => c.phone },
  { id: 'email', label: 'Email', sortable: true, sortValue: c => c.email || '', render: c => c.email },
  {
    id: 'address', label: 'Address', sortable: true,
    sortValue: c => shortAddress(c.currentAddress), render: c => shortAddress(c.currentAddress),
  },
  {
    id: 'createdAt', label: 'Created Date', sortable: true, sortValue: c => c.createdAt || '',
    render: c => formatDateDMY(c.createdAt),
  },
  { id: 'actions', label: 'Actions', align: 'center' },
]

// `visible` is owned by the page, not the table, so the column picker can sit in the page's
// toolbar next to Open New Customer rather than in a bar of its own above the table.
export default function CustomerTable({ visible = CUSTOMER_COLUMNS }) {
  const { state, dispatch } = useApp()
  const { customers, customerSearch, customerDateFilter, customerPage, customerPageSize } = state
  const { sort, toggleSort } = useTableSort()

  const q = customerSearch.trim().toLowerCase()

  const filtered = customers.filter(c => {
    const matchesSearch = !q || (
      c.code.toLowerCase().includes(q) ||
      (c.enName || '').toLowerCase().includes(q) ||
      (c.khName || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.idNo || '').toLowerCase().includes(q)
    )
    const created = c.createdAt ? c.createdAt.slice(0, 10) : ''
    const matchesDate = !customerDateFilter || created === customerDateFilter
    return matchesSearch && matchesDate
  })

  // Sorted before the page is cut, so the order runs across the whole register rather than
  // rearranging the ten rows that happen to be on screen. Against the visible columns only:
  // hiding the sorted column drops back to natural order rather than leaving the register in
  // an order nothing on screen explains.
  const ordered = sortRows(filtered, visible, sort)

  const total = ordered.length
  const totalPages = Math.max(1, Math.ceil(total / customerPageSize))
  const safePage = Math.min(customerPage, totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * customerPageSize + 1
  const to = Math.min(safePage * customerPageSize, total)
  const rows = ordered.slice((safePage - 1) * customerPageSize, safePage * customerPageSize)

  // Back to page 1 on a re-sort — the rows that moved to the top are the point of sorting, and
  // staying on page 3 hides them.
  function handleSort(id) {
    toggleSort(id)
    if (customerPage !== 1) dispatch({ type: 'SET_CUSTOMER_PAGE', page: 1 })
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
      {/* The mobile card list below is a fixed summary and is deliberately not driven by the
          column picker. */}
      <div className="hidden md:block overflow-x-auto min-h-[60vh] max-h-[60vh] overflow-y-auto">
        <Table className="w-full text-xs">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
              {visible.map(col => (
                <TableHead
                  key={col.id}
                  aria-sort={ariaSortFor(col, sort)}
                  className={`h-auto px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${
                    col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <SortHeader column={col} sort={sort} onSort={handleSort}>{col.label}</SortHeader>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={visible.length} className="text-center py-16 text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20H7a2 2 0 01-2-2V7a2 2 0 012-2h3m4 0h3a2 2 0 012 2v3M9 12h6m-3-3v6" />
                    </svg>
                    <span className="text-sm font-medium">No customers found</span>
                    <span className="text-xs">Try adjusting your search or filter.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.map(c => (
              <TableRow
                key={c.code}
                onClick={() => dispatch({ type: 'OPEN_CUSTOMER_PREVIEW', code: c.code })}
                className="border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors group"
              >
                {visible.map(col => (
                  // Actions stop the click reaching the row, which would open the preview
                  // behind whichever button was pressed.
                  <TableCell
                    key={col.id}
                    onClick={col.id === 'actions' ? (e => e.stopPropagation()) : undefined}
                    className={`px-4 py-3 ${col.cellClass || 'text-slate-600 dark:text-slate-300 whitespace-nowrap'}`}
                  >
                    {col.id === 'actions' ? (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          title="Edit Customer"
                          onClick={() => dispatch({ type: 'OPEN_CUSTOMER_WIZARD', code: c.code })}
                          className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:hover:text-amber-400 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          title="Delete Customer"
                          onClick={() => dispatch({ type: 'CONFIRM_DELETE_CUSTOMER', code: c.code })}
                          className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : col.render(c)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden min-h-[60vh] max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400 dark:text-slate-500">
            <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20H7a2 2 0 01-2-2V7a2 2 0 012-2h3m4 0h3a2 2 0 012 2v3M9 12h6m-3-3v6" />
            </svg>
            <span className="text-sm font-medium">No customers found</span>
            <span className="text-xs">Try adjusting your search or filter.</span>
          </div>
        ) : rows.map(c => (
          <div
            key={c.code}
            onClick={() => dispatch({ type: 'OPEN_CUSTOMER_PREVIEW', code: c.code })}
            className="p-4 active:bg-slate-50 dark:active:bg-slate-700/40 cursor-pointer transition-colors space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-brand-600 dark:text-brand-400 text-xs">{c.code}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{c.gender || '—'}</span>
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{c.enName}</p>
              <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">{c.khName}</p>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{c.idNo}</span>
              <span>{c.phone}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{c.email}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{shortAddress(c.currentAddress)}</div>
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>DOB: {formatDateDMY(c.dob)}</span>
              <span>Created: {formatDateDMY(c.createdAt)}</span>
            </div>
            <div className="flex items-center justify-end gap-1 pt-1" onClick={e => e.stopPropagation()}>
              <Button
                variant="ghost"
                title="Edit Customer"
                onClick={() => dispatch({ type: 'OPEN_CUSTOMER_WIZARD', code: c.code })}
                className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:hover:text-amber-400 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                title="Delete Customer"
                onClick={() => dispatch({ type: 'CONFIRM_DELETE_CUSTOMER', code: c.code })}
                className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            from={from}
            to={to}
            total={total}
            onPage={p => dispatch({ type: 'SET_CUSTOMER_PAGE', page: p })}
          />
        </div>
      )}
    </div>
  )
}
