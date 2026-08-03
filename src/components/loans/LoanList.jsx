import { useState, useEffect } from 'react'
import { Bell, Wallet, Calendar } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatVal } from '../../utils/format'
import Pagination from '../shared/Pagination'
import StatusBadge from '../shared/StatusBadge'

const PAGE_SIZE = 10

function formatDateDMY(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function LoanList({ search = '', statusFilter = 'ALL' }) {
  const { state, dispatch } = useApp()
  const [page, setPage] = useState(1)

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

  useEffect(() => { setPage(1) }, [search, statusFilter])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const to = Math.min(safePage * PAGE_SIZE, total)
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

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
      {/* Table */}
      <div className="hidden md:block overflow-x-auto min-h-[60vh] max-h-[60vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ref #</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Customer</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Product</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Amount</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Created Date</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
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
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-[#0047ab] dark:text-blue-400">{loan.ref}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{loan.customerName}</p>
                      {loan.customerKhName && (
                        <p className="text-slate-400 dark:text-slate-500 text-[11px]">{loan.customerKhName}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{loan.product}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">
                    {formatVal(loan.amount, loan.currency || state.currency, 1)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {formatDateDMY(loan.submittedAt || loan.disbursementDate)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={loan.status} size="xs" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2" onClick={e => e.stopPropagation()}>
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
                  </td>
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
