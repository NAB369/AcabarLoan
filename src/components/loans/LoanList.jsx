import { useState, useEffect } from 'react'
import { Bell, Wallet, Calendar } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatVal } from '../../utils/format'
import Pagination from '../shared/Pagination'
import StatusBadge from '../shared/StatusBadge'
import { useTableSort, sortRows, SortHeader, ariaSortFor } from '../shared/DataTableTools'

const PAGE_SIZE = 10

function formatDateDMY(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Sorted on the value behind the cell, not on what it prints: Amount sorts numerically rather
// than on a formatted "$1,200.00" string, and the date sorts on its ISO form.
export const LOAN_COLUMNS = [
  {
    id: 'ref', label: 'Ref #', sortable: true, sortValue: l => l.ref || '',
    render: l => <span className="font-mono font-semibold text-[#0047ab] dark:text-blue-400">{l.ref}</span>,
  },
  {
    id: 'customer', label: 'Customer', sortable: true, sortValue: l => l.customerName || '',
    render: l => (
      <div>
        <p className="font-semibold text-slate-700 dark:text-slate-200">{l.customerName}</p>
        {l.customerKhName && <p className="text-slate-400 dark:text-slate-500 text-[11px]">{l.customerKhName}</p>}
      </div>
    ),
  },
  {
    id: 'product', label: 'Product', sortable: true, sortValue: l => l.product || '',
    cellClass: 'text-slate-600 dark:text-slate-300', render: l => l.product,
  },
  {
    id: 'amount', label: 'Amount', align: 'right', sortable: true, sortValue: l => Number(l.amount) || 0,
    cellClass: 'text-right font-semibold text-slate-700 dark:text-slate-200',
    render: (l, ctx) => formatVal(l.amount, l.currency || ctx.currency, 1),
  },
  {
    id: 'created', label: 'Created Date', sortable: true,
    sortValue: l => l.submittedAt || l.disbursementDate || '',
    cellClass: 'text-slate-500 dark:text-slate-400',
    render: l => formatDateDMY(l.submittedAt || l.disbursementDate),
  },
  {
    id: 'status', label: 'Status', align: 'center', sortable: true, sortValue: l => l.status || '',
    cellClass: 'text-center', render: l => <StatusBadge status={l.status} size="xs" />,
  },
  { id: 'actions', label: 'Actions', align: 'center' },
]

// `visible` is owned by the page, not the table, so the column picker can sit in the page's
// toolbar next to New Application rather than in a bar of its own above the table.
export default function LoanList({ search = '', statusFilter = 'ALL', visible = LOAN_COLUMNS }) {
  const { state, dispatch } = useApp()
  const [page, setPage] = useState(1)
  const { sort, toggleSort } = useTableSort()

  const filtered = state.loanApplications.filter(loan => {
    const matchStatus = statusFilter === 'ALL' || loan.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !search.trim() || (
      loan.ref?.toLowerCase().includes(q) ||
      loan.customerName?.toLowerCase().includes(q) ||
      loan.customerKhName?.toLowerCase().includes(q) ||
      loan.product?.toLowerCase().includes(q) ||
      loan.status?.toLowerCase().includes(q)
    )
    return matchStatus && matchSearch
  })

  // Back to page 1 on a re-sort too — the rows that moved to the top are the point of sorting,
  // and staying on page 3 hides them.
  useEffect(() => { setPage(1) }, [search, statusFilter, sort])

  // Sorted before the page is cut, so the order runs across every matching application rather
  // than rearranging the ten rows currently on screen. Against the visible columns only: hiding
  // the sorted column drops back to natural order rather than leaving the register in an order
  // nothing on screen explains.
  const ordered = sortRows(filtered, visible, sort)

  const total = ordered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const to = Math.min(safePage * PAGE_SIZE, total)
  const rows = ordered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleRowClick(loan) {
    if (loan.status === 'Active' || loan.status === 'Waiting Disburse') {
      dispatch({ type: 'OPEN_LOAN_PREVIEW', loan, tab: 'Overview' })
      return
    }
    if (loan.status === 'Pending Approval') {
      dispatch({ type: 'OPEN_LOAN_OVERVIEW', loan, tab: 'Overview' })
      return
    }
    const globalIdx = state.loanApplications.findIndex(l => l.ref === loan.ref)
    if (globalIdx >= 0) dispatch({ type: 'OPEN_LOAN_DETAIL', idx: globalIdx })
  }

  function handleOpenQuickPreview(e, loan, tab) {
    e.stopPropagation()
    dispatch({ type: 'OPEN_LOAN_QUICK_PREVIEW', loan, tab })
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Table — the mobile card list below is a fixed summary and is deliberately not driven
          by the column picker. */}
      <div className="hidden md:block overflow-x-auto min-h-[60vh] max-h-[60vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              {visible.map(col => (
                <th
                  key={col.id}
                  aria-sort={ariaSortFor(col, sort)}
                  className={`px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap ${
                    col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  <SortHeader column={col} sort={sort} onSort={toggleSort}>{col.label}</SortHeader>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visible.length} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10 text-slate-200 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
                    </svg>
                    <p className="text-sm font-medium text-slate-400 dark:text-slate-500">No loan applications found</p>
                    {search && <p className="text-xs text-slate-400 dark:text-slate-500">Try a different search term</p>}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((loan) => (
                <tr
                  key={loan.ref}
                  onClick={() => handleRowClick(loan)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer transition-colors"
                >
                  {visible.map(col => (
                    // Actions stop the click reaching the row, which would open the loan behind
                    // whichever button was pressed.
                    <td
                      key={col.id}
                      onClick={col.id === 'actions' ? (e => e.stopPropagation()) : undefined}
                      className={`px-4 py-3 ${col.cellClass || ''}`}
                    >
                      {col.id === 'actions' ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={e => handleOpenQuickPreview(e, loan, 'Repayment Schedule')}
                            disabled={loan.status !== 'Active' && loan.status !== 'Waiting Disburse'}
                            title={loan.status === 'Active' || loan.status === 'Waiting Disburse' ? 'View repayment schedule' : 'Available once loan is disbursed'}
                            className="p-1.5 text-slate-400 hover:text-[#0047ab] hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => handleOpenQuickPreview(e, loan, 'Repayment Reminder')}
                            disabled={loan.status !== 'Active' && loan.status !== 'Waiting Disburse'}
                            title={loan.status === 'Active' || loan.status === 'Waiting Disburse' ? 'Repayment reminder' : 'Available once loan is disbursed'}
                            className="p-1.5 text-slate-400 hover:text-[#0047ab] hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => handleOpenQuickPreview(e, loan, 'Repayment Tracking')}
                            disabled={loan.status !== 'Active' && loan.status !== 'Waiting Disburse'}
                            title={loan.status === 'Active' || loan.status === 'Waiting Disburse' ? 'Repayment Tracking' : 'Available once loan is disbursed'}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : col.render(loan, { currency: state.currency })}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden min-h-[60vh] max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-slate-400 dark:text-slate-500">
            <svg className="w-10 h-10 text-slate-200 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
            </svg>
            <p className="text-sm font-medium text-slate-400 dark:text-slate-500">No loan applications found</p>
            {search && <p className="text-xs text-slate-400 dark:text-slate-500">Try a different search term</p>}
          </div>
        ) : rows.map(loan => (
          <div
            key={loan.ref}
            onClick={() => handleRowClick(loan)}
            className="p-4 active:bg-slate-50 dark:active:bg-slate-700/30 cursor-pointer transition-colors space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-[#0047ab] dark:text-blue-400 text-xs">{loan.ref}</span>
              <StatusBadge status={loan.status} size="xs" />
            </div>
            <div>
              <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{loan.customerName}</p>
              {loan.customerKhName && (
                <p className="text-slate-400 dark:text-slate-500 text-[11px]">{loan.customerKhName}</p>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{loan.product}</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {formatVal(loan.amount, loan.currency || state.currency, 1)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{formatDateDMY(loan.submittedAt || loan.disbursementDate)}</span>
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={e => handleOpenQuickPreview(e, loan, 'Repayment Schedule')}
                  disabled={loan.status !== 'Active' && loan.status !== 'Waiting Disburse'}
                  title={loan.status === 'Active' || loan.status === 'Waiting Disburse' ? 'View repayment schedule' : 'Available once loan is disbursed'}
                  className="p-1.5 text-slate-400 hover:text-[#0047ab] hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Calendar className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => handleOpenQuickPreview(e, loan, 'Repayment Reminder')}
                  disabled={loan.status !== 'Active' && loan.status !== 'Waiting Disburse'}
                  title={loan.status === 'Active' || loan.status === 'Waiting Disburse' ? 'Repayment reminder' : 'Available once loan is disbursed'}
                  className="p-1.5 text-slate-400 hover:text-[#0047ab] hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Bell className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => handleOpenQuickPreview(e, loan, 'Repayment Tracking')}
                  disabled={loan.status !== 'Active' && loan.status !== 'Waiting Disburse'}
                  title={loan.status === 'Active' || loan.status === 'Waiting Disburse' ? 'Repayment Tracking' : 'Available once loan is disbursed'}
                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Wallet className="w-3.5 h-3.5" />
                </button>
              </div>
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
            onPage={setPage}
          />
        </div>
      )}
    </div>
  )
}
