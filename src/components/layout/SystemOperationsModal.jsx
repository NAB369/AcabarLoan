import { useMemo, useState } from 'react'
import {
  Sunrise, Moon, CalendarCheck, CheckCircle2, AlertTriangle, XCircle,
  ShieldCheck, History, ChevronRight,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { formatVal } from '../../utils/format'
import { buildBatchPlan, todayISO, SOD, EOD, EOM } from '../../utils/systemOperations'

// Batch amounts are already in the loan's own currency, so formatVal is called with a
// conversion rate of 1 — its default rate is for showing a USD figure in riel, which would
// multiply a KHR amount that is already in riel by 4000.
const money = (amount, currency) => formatVal(amount || 0, currency || 'USD', 1)

const OPERATIONS = [
  {
    kind: SOD,
    icon: Sunrise,
    title: 'Start of Day (SOD) Batch',
    description: 'Verifies the ledger is sound and the previous day was closed, then opens the business day for transactions.',
    action: 'Open Business Day',
  },
  {
    kind: EOD,
    icon: Moon,
    title: 'End of Day (EOD) Batch',
    description: 'Applies the contract penalty to installments that went past due, recognises one day of interest on every active loan, and closes the business day.',
    action: 'Post & Close Day',
  },
  {
    kind: EOM,
    icon: CalendarCheck,
    title: 'End of Month (EOM) Batch',
    description: 'Re-runs PAR aging across the loan book, posts the movement in the required loan-loss provision, and closes the accounting period.',
    action: 'Post & Close Period',
  },
]

const CHECK_STYLE = {
  pass: { Icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', label: 'Pass' },
  warn: { Icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', label: 'Warning' },
  fail: { Icon: XCircle, cls: 'text-rose-600 dark:text-rose-400', label: 'Failed' },
}

function CheckRow({ check }) {
  const { Icon, cls, label } = CHECK_STYLE[check.status] || CHECK_STYLE.warn
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cls}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {check.label}
          <span className={`ml-2 font-bold uppercase tracking-wide text-[10px] ${cls}`}>{label}</span>
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{check.detail}</p>
      </div>
    </li>
  )
}

// What the batch will write, shown before it is committed — the operator approves these exact
// figures and the reducer posts the same plan object.
function PostingPreview({ plan }) {
  const box = 'rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/40'

  if (plan.kind === SOD) {
    return (
      <div className={box}>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          No ledger entries are posted. The business day <span className="font-bold">{plan.date}</span> will be
          marked open and recorded in the batch history.
        </p>
      </div>
    )
  }

  if (plan.kind === EOD) {
    const movements = plan.accrual?.movements || []
    const overdue = plan.overdue || []
    return (
      <div className={`${box} space-y-3`}>
        <div>
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Interest accrual</p>
          {movements.length === 0 ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              No active loan accrues interest today — nothing will be posted.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {movements.map(m => (
                <li key={m.currency} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between gap-3">
                  <span>Debit {m.receivable} · Credit {m.income} ({m.currency})</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{money(m.amount, m.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            Across {plan.accrual?.lines?.length || 0} active loan{(plan.accrual?.lines?.length || 0) === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Overdue penalties</p>
          {overdue.length === 0 ? (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              No installment is past due without a penalty already applied.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1 max-h-28 overflow-y-auto">
              {overdue.map(o => (
                <li key={`${o.ref}-${o.idx}`} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between gap-3">
                  <span className="truncate">{o.ref} · #{o.num} · {o.daysLate}d late</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">{money(o.fee, o.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            Penalties are stamped on the repayment schedule. They become income only when collected.
          </p>
        </div>
      </div>
    )
  }

  const buckets = plan.provision?.buckets || []
  const movements = plan.provision?.movements || []
  return (
    <div className={`${box} space-y-3`}>
      <div>
        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
          PAR aging — period {plan.period}
        </p>
        {buckets.length === 0 ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">No active loans to provision against.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {buckets.map(b => (
              <li key={b.id} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between gap-3">
                <span>{b.label} · {b.count} loan{b.count === 1 ? '' : 's'} @ {b.rate}%</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{money(b.required, 'USD')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5">
        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Provision movement</p>
        {movements.length === 0 ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            The allowance already carries the required amount — nothing will be posted.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {movements.map(m => (
              <li key={m.currency} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between gap-3">
                <span>
                  {m.delta > 0 ? `Debit ${m.expense} · Credit ${m.allowance}` : `Debit ${m.allowance} · Credit ${m.expense}`} ({m.currency})
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{money(Math.abs(m.delta), m.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default function SystemOperationsModal() {
  const { state, dispatch, showToast } = useApp()
  const [selected, setSelected] = useState(null)

  const today = todayISO()
  // Recomputed on every state change, so the figures shown are the figures dispatched —
  // a plan can never go stale between opening the panel and confirming it.
  const plan = useMemo(
    () => (selected ? buildBatchPlan(state, selected, today) : null),
    [state, selected, today]
  )

  const day = state.businessDay || {}
  const dayOpen = day.status === 'open'

  function close() {
    setSelected(null)
    dispatch({ type: 'CLOSE_SYSTEM_OPS' })
  }

  function run(kind) {
    if (!plan || plan.blocked) return
    dispatch({ type: `RUN_${kind}`, plan })
    dispatch({
      type: 'ADD_AUDIT_LOG',
      log: { action: `${kind} batch completed`, module: 'Periodic', reference: kind === EOM ? plan.period : plan.date },
    })
    showToast(
      kind === SOD ? `Business day ${plan.date} opened`
        : kind === EOD ? `End of Day complete — business day ${plan.date} closed`
        : `End of Month complete — period ${plan.period} closed`,
      'success'
    )
    setSelected(null)
    dispatch({ type: 'CLOSE_SYSTEM_OPS' })
  }

  const failures = (plan?.checks || []).filter(c => c.status === 'fail')

  return (
    <Dialog open={state.systemOpsOpen} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl dark:bg-slate-800 dark:border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-800 dark:text-slate-100">System Operations</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Each batch verifies the ledger against live data before it posts anything. Review the checks and the
            entries below, then commit.
          </DialogDescription>
        </DialogHeader>

        {/* Business day state — the gate the batches move between */}
        <div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${
          dayOpen
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
            : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
        }`}>
          {dayOpen
            ? <Sunrise className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
            : <Moon className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" aria-hidden="true" />}
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {dayOpen ? `Business day open — ${day.date}` : day.date ? `Business day closed — last ${day.date}` : 'No business day opened yet'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {dayOpen
                ? `Opened ${day.openedAt} by ${day.openedBy}`
                : day.closedAt ? `Closed ${day.closedAt} by ${day.closedBy}` : 'Run Start of Day to begin the cycle.'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {OPERATIONS.map(op => {
            const isSelected = selected === op.kind
            const Icon = op.icon
            return (
              <div
                key={op.kind}
                className={`rounded-xl border p-3.5 transition-colors ${
                  isSelected
                    ? 'border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-900/10'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-4 h-4 mt-0.5 text-slate-500 dark:text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{op.title}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{op.description}</p>
                  </div>
                  {!isSelected && (
                    <Button
                      variant="outline"
                      onClick={() => setSelected(op.kind)}
                      className="flex-shrink-0 h-auto px-3 py-1.5 rounded-xl text-[11px] font-bold gap-1.5 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verify
                    </Button>
                  )}
                </div>

                {isSelected && plan && (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                        Verification — {plan.checks.length} checks against live data
                      </p>
                      <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-700/60">
                        {plan.checks.map(c => <CheckRow key={c.id} check={c} />)}
                      </ul>
                    </div>

                    <PostingPreview plan={plan} />

                    {plan.blocked && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20 p-3">
                        <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
                          Blocked — {failures.length} check{failures.length === 1 ? '' : 's'} failed
                        </p>
                        <p className="text-[10px] text-rose-600 dark:text-rose-400/90 mt-1 leading-relaxed">
                          Resolve the failures above and verify again. Nothing has been posted.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => setSelected(null)}
                        className="h-auto px-3 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => run(op.kind)}
                        disabled={plan.blocked}
                        className="h-auto px-4 py-2 rounded-xl text-[11px] font-bold gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {op.action}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Batch history */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            Recent batch runs
          </p>
          {state.batchRuns.length === 0 ? (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              No batch has been run on this install yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {state.batchRuns.slice(0, 5).map(runRecord => (
                <li key={runRecord.id} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">{runRecord.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{runRecord.summary}</span>
                  <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">{runRecord.runAt}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 leading-relaxed">
            Note: Batch postings are irreversible. Ensure all daily transactions have been posted before running EOD.
            Contact your system administrator before running EOM.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
