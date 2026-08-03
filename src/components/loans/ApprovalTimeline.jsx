import { Check, Clock, AlertCircle } from 'lucide-react'
import { useApp, hasFundingAccount } from '../../context/AppContext'

const STAGES = [
  { label: 'Submitted', key: 1 },
  { label: 'Credit Review', key: 2 },
  { label: 'Final Approval', key: 3 },
]

export default function ApprovalTimeline() {
  const { state, dispatch, showToast, can } = useApp()
  const loan = state.activeLoan
  const customer = state.customers.find(c => c.code === loan?.customerCode)
  if (!loan) return null

  const approvalState = loan.approvalState || 1
  const isDisbursed = loan.status === 'Active'
  const hasAccountNumber = !!customer?.accountNumber

  function handleAdvance() {
    if (!can('review_loan')) {
      showToast(`${state.currentRole} does not have permission to advance loan approval.`, 'error')
      return
    }
    dispatch({ type: 'ADVANCE_APPROVAL' })
    const nextStage = approvalState + 1
    const labels = { 2: 'Credit review passed', 3: 'Final approval granted' }
    showToast(labels[nextStage] || 'Approval advanced', 'success')
  }

  function handleDisburse() {
    if (!hasAccountNumber) {
      showToast('Customer has no disbursement account number on file', 'error')
      return
    }
    if (!can('disburse_loan')) {
      showToast(`${state.currentRole} does not have permission to disburse loans.`, 'error')
      return
    }
    if (!hasFundingAccount(state.realBankAccounts, loan.currency, loan.branch)) {
      showToast(`No ${loan.currency} bank account configured for ${loan.branch}. Add one in Real Bank Accounts before disbursing.`, 'error')
      return
    }
    dispatch({ type: 'DISBURSE_LOAN' })
    showToast('Loan disbursed — funds released, loan is now Active', 'success')
    dispatch({ type: 'OPEN_LOAN_PREVIEW', tab: 'Overview' })
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-6">Approval Timeline</h3>

      {/* Stage indicators */}
      <div className="flex items-center mb-6">
        {STAGES.map((stage, idx) => {
          const isCompleted = approvalState > stage.key || (isDisbursed && stage.key <= 3)
          const isCurrent = approvalState === stage.key && !isDisbursed
          const isFuture = approvalState < stage.key && !isDisbursed

          return (
            <div key={stage.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={[
                    'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors',
                    isCompleted
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-[#0047ab] border-[#0047ab] text-white'
                        : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400',
                  ].join(' ')}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : isCurrent ? (
                    <Clock className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-bold">{stage.key}</span>
                  )}
                </div>
                <span
                  className={[
                    'text-xs mt-2 font-medium text-center whitespace-nowrap',
                    isCompleted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : isCurrent
                        ? 'text-[#0047ab] dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500',
                  ].join(' ')}
                >
                  {stage.label}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div
                  className={[
                    'flex-1 h-0.5 mx-2 mb-5 rounded transition-colors',
                    approvalState > stage.key || isDisbursed
                      ? 'bg-emerald-400'
                      : 'bg-slate-200 dark:bg-slate-600',
                  ].join(' ')}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Approval history */}
      {loan.approvalHistory && loan.approvalHistory.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">History</p>
          {loan.approvalHistory.map((h, i) => (
            <div key={i} className="flex items-start gap-3 text-xs">
              <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-emerald-600" />
              </div>
              <div>
                <p className="text-slate-700 dark:text-slate-200 font-medium">{h.action}</p>
                <p className="text-slate-400 dark:text-slate-500">By {h.user} · {h.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        {approvalState < 3 && !isDisbursed && (
          <button
            onClick={handleAdvance}
            title={can('review_loan') ? undefined : `${state.currentRole} cannot advance loan approval`}
            className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors ${
              can('review_loan') ? 'bg-[#0047ab] hover:bg-blue-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4" />
            Advance Approval
          </button>
        )}
        {approvalState === 3 && (loan.status === 'Waiting Disburse' || loan.status === 'In Progress') && !isDisbursed && (
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                Disbursement Account: <span className="font-semibold">{customer?.accountNumber || '—'}</span>
              </div>
              <button
                onClick={handleDisburse}
                disabled={!hasAccountNumber || !can('disburse_loan')}
                title={!hasAccountNumber ? 'Customer has no disbursement account number on file' : can('disburse_loan') ? undefined : `${state.currentRole} cannot disburse loans`}
                className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors ${
                  hasAccountNumber && can('disburse_loan') ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Check className="w-4 h-4" />
                Disburse Loan
              </button>
            </div>
            {!hasAccountNumber && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                Add a disbursement account number to this customer's profile before disbursing.
              </div>
            )}
          </div>
        )}
        {isDisbursed && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold rounded-xl border border-emerald-200 dark:border-emerald-700">
            <Check className="w-4 h-4" />
            Loan Active
          </div>
        )}
      </div>
    </div>
  )
}
