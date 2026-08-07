import { useEffect, useState } from 'react'
import { Plus, X, FileText, DollarSign, Calendar, User, ChevronLeft, Settings } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatVal } from '../../utils/format'
import StatusBadge from '../shared/StatusBadge'
import LoanList, { LOAN_COLUMNS } from './LoanList'
import { useTableColumns, ColumnPicker } from '../shared/DataTableTools'
import LoanWizard from './LoanWizard'
import LoanDetail from './LoanDetail'
import LoanOverview from './LoanOverview'
import LoanPreview from './LoanPreview'
import ApprovalTimeline from './ApprovalTimeline'
import RepaymentTracking from './RepaymentTracking'
import LoanQuickPreviewModal from './LoanQuickPreviewModal'
import LoanSettingsModal from './LoanSettingsModal'

export default function LoanPage() {
  const { state, dispatch, showToast, can } = useApp()
  const { loanReviewOpen, activeLoan, loanDetailIdx, loanOverviewOpen, loanPreviewOpen } = state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [loanSettingsOpen, setLoanSettingsOpen] = useState(false)
  // Above the early returns below — hooks cannot be called conditionally.
  const { visible, visibleIds, toggle } = useTableColumns(LOAN_COLUMNS, {
    value: state.loanVisibleColumns,
    onChange: ids => dispatch({ type: 'SET_LOAN_COLUMNS', ids }),
  })

  // Local component state, so App.jsx's global Escape handler can't reach it.
  useEffect(() => {
    if (!loanSettingsOpen) return
    const handleKey = (e) => { if (e.key === 'Escape') setLoanSettingsOpen(false) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [loanSettingsOpen])

  if (loanPreviewOpen && activeLoan) {
    return <LoanPreview />
  }

  if (loanOverviewOpen && activeLoan) {
    return <LoanOverview />
  }

  if (loanDetailIdx !== null && loanDetailIdx !== undefined) {
    return <LoanDetail />
  }

  function handleNewLoan() {
    if (!can('open_loan')) {
      showToast(`${state.currentRole} does not have permission to open a loan.`, 'error')
      return
    }
    dispatch({ type: 'OPEN_LOAN_WIZARD', ref: null })
  }

  function handleCloseReview() {
    dispatch({ type: 'SET_TAB', tab: 'open-loan' })
  }

  return (
    <>
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Loan Application</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
          {loanReviewOpen && activeLoan && (
            <button
              onClick={handleCloseReview}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Loan Applications
            </button>
          )}
        </div>
      </div>

      {/* Review panel — shown after submission */}
      {loanReviewOpen && activeLoan && (
        <div className="space-y-4">
          {/* Review header card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#0047ab]/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6 text-[#0047ab]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{activeLoan.ref}</h2>
                    <StatusBadge status={activeLoan.status} size="xs" />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5 font-medium">{activeLoan.product}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{activeLoan.customerName}
                    {activeLoan.customerKhName && ` · ${activeLoan.customerKhName}`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseReview}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl px-3 py-2.5">
                <DollarSign className="w-4 h-4 text-[#0047ab] dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Amount</p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatVal(activeLoan.amount, activeLoan.currency || state.currency, 1)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl px-3 py-2.5">
                <Calendar className="w-4 h-4 text-[#0047ab] dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">EMI</p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatVal(activeLoan.emi || 0, activeLoan.currency || state.currency, 1)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl px-3 py-2.5">
                <User className="w-4 h-4 text-[#0047ab] dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Installments</p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{activeLoan.installments} months</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl px-3 py-2.5">
                <Calendar className="w-4 h-4 text-[#0047ab] dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Interest Rate</p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{activeLoan.interestRate}% p.a.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Approval timeline */}
          <ApprovalTimeline />

          {/* Repayment tracking */}
          <RepaymentTracking />
        </div>
      )}

      {/* Loan list — always visible */}
      {/* Search + filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:w-64">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search ref, customer, product, status…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0047ab]/30 focus:border-[#0047ab] transition"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0047ab]/30 focus:border-[#0047ab] transition"
        >
          <option value="ALL">All Status</option>
          <option value="In Progress">In Progress</option>
          <option value="Pending Approval">Pending Approval</option>
          <option value="Waiting Disburse">Waiting Disburse</option>
          <option value="Active">Active</option>
          <option value="Rejected">Rejected</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <button
          onClick={() => setLoanSettingsOpen(true)}
          title="Loan Setting"
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          Loan Setting
        </button>
        {/* The column picker rides with the primary action at the far end of the row rather
            than sitting above the table, so every control on this bar is in one place. */}
        <div className="flex items-center gap-2 flex-shrink-0 sm:ml-auto">
          {/* Desktop only — the mobile view is a card list with no columns to hide. */}
          <div className="hidden md:block">
            <ColumnPicker columns={LOAN_COLUMNS} visibleIds={visibleIds} onToggle={toggle} iconOnly />
          </div>
          {/* The page's one primary action, so it sits on this row with the other controls but
              keeps the solid fill that separates it from them, so it does not read as another
              filter. */}
          <button
            onClick={handleNewLoan}
            title={can('open_loan') ? undefined : `${state.currentRole} cannot open loans`}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl text-white shadow-sm transition-colors flex-shrink-0 ${
              can('open_loan') ? 'bg-[#0047ab] hover:bg-blue-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            New Application
          </button>
        </div>
      </div>

      <LoanList search={search} statusFilter={statusFilter} visible={visible} />
    </div>

      {/* Modals */}
      <LoanWizard />
      <LoanQuickPreviewModal />
      <LoanSettingsModal open={loanSettingsOpen} onClose={() => setLoanSettingsOpen(false)} />
    </>
  )
}
