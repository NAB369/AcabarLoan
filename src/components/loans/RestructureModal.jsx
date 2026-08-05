import { useMemo, useState } from 'react'
import { X, CalendarClock, RefreshCw, AlertTriangle } from 'lucide-react'
import { formatVal, formatDateDisplay } from '../../utils/format'
import { buildReschedulePlan, buildRefinancePlan, outstandingPrincipal, refinanceCoversSettlement } from '../../utils/loanRestructure'

// Reschedule and refinance share this dialog because the operator's job is the same in both:
// enter the new terms, read what it will do to the borrower, commit. What differs is the
// arithmetic underneath and whether anything reaches the ledger, and that difference is stated
// on screen rather than left for the officer to remember.
//
// The plan is recomputed from the form on every keystroke and is what gets dispatched, so the
// figures approved here are the figures applied — a stale preview cannot be committed.
export default function RestructureModal({ mode, loan, currency, onClose, onConfirm }) {
  const isRefinance = mode === 'refinance'
  const settlement = outstandingPrincipal(loan)

  const [form, setForm] = useState({
    amount: isRefinance ? '' : '',
    interestRate: loan.interestRate?.toString() || '',
    installments: '',
    firstDueISO: '',
    fee: '0',
    reason: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const plan = useMemo(() => (
    isRefinance
      ? buildRefinancePlan(loan, {
          amount: form.amount, interestRate: form.interestRate,
          installments: form.installments, firstDueISO: form.firstDueISO, fee: form.fee,
        })
      : buildReschedulePlan(loan, {
          installments: form.installments, interestRate: form.interestRate, firstDueISO: form.firstDueISO,
        })
  ), [isRefinance, loan, form])

  const shortfall = isRefinance && plan && !refinanceCoversSettlement(plan)
  const canCommit = !!plan && !shortfall

  const money = v => formatVal(v || 0, currency, 1)
  const fieldCls = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition'
  const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1'

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              {isRefinance ? <RefreshCw className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
              {isRefinance ? 'Refinance Loan' : 'Reschedule Loan'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {loan.ref} · {loan.customerName} · {money(settlement)} outstanding
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Says up front whether this touches the books, because the two operations look
              almost identical on screen and only one of them moves money. */}
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {isRefinance
              ? 'A new loan is opened at the next cycle. Its principal settles this loan, the fee is charged, and the borrower receives the balance. This posts to the ledger and closes this loan.'
              : 'The principal still outstanding is spread over new terms. Installments already collected are left untouched, and nothing is posted to the ledger — only the schedule changes.'}
          </p>

          {isRefinance && (
            <div>
              <label className={labelCls} htmlFor="rs-amount">New loan amount</label>
              <input
                id="rs-amount" type="number" min="0" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder={`Must cover ${money(settlement)}`}
                className={fieldCls}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="rs-rate">Interest rate (% p.a.)</label>
              <input id="rs-rate" type="number" min="0" step="0.01" value={form.interestRate}
                onChange={e => set('interestRate', e.target.value)} className={fieldCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rs-term">Installments (months)</label>
              <input id="rs-term" type="number" min="1" step="1" value={form.installments}
                onChange={e => set('installments', e.target.value)} className={fieldCls} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="rs-first">First repayment date</label>
              <input id="rs-first" type="date" value={form.firstDueISO}
                onChange={e => set('firstDueISO', e.target.value)} className={fieldCls} />
            </div>
            {isRefinance && (
              <div>
                <label className={labelCls} htmlFor="rs-fee">Refinance fee</label>
                <input id="rs-fee" type="number" min="0" step="0.01" value={form.fee}
                  onChange={e => set('fee', e.target.value)} className={fieldCls} />
              </div>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor="rs-reason">Reason</label>
            <textarea id="rs-reason" rows={2} value={form.reason}
              onChange={e => set('reason', e.target.value)}
              placeholder={isRefinance ? 'Why is this loan being refinanced?' : 'Why is this loan being rescheduled?'}
              className={fieldCls} />
          </div>

          {/* What will happen, in the borrower's terms */}
          {plan ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-3 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {isRefinance ? 'Settlement' : 'New schedule'}
              </p>
              {isRefinance ? (
                <>
                  <Row label="New loan principal" value={money(plan.newAmount)} />
                  <Row label={`Settles ${loan.ref}`} value={`− ${money(plan.settlement)}`} />
                  <Row label="Refinance fee" value={`− ${money(plan.refinanceFee)}`} />
                  <Row label="Released to borrower" value={money(plan.netToBorrower)} strong />
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-1.5" />
                  <Row label="Installment (EMI)" value={money(plan.emi)} />
                  <Row label="Total interest" value={money(plan.totalInterest)} />
                  <Row label="First repayment" value={formatDateDisplay(plan.firstDueISO)} />
                </>
              ) : (
                <>
                  <Row label="Principal re-amortized" value={money(plan.principal)} />
                  <Row label="Installments kept as paid" value={`${plan.settledCount}`} />
                  <Row label="New installments" value={`${plan.installments} months`} />
                  <Row label="Installment (EMI)" value={money(plan.emi)} strong />
                  <Row label="Total interest" value={money(plan.totalInterest)} />
                  <Row label="First repayment" value={formatDateDisplay(plan.firstDueISO)} />
                </>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Fill in the terms above to see what this will do.
            </p>
          )}

          {shortfall && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-700 dark:text-rose-400 leading-relaxed">
                The new loan does not cover what it settles. It needs at least{' '}
                <span className="font-bold">{money(plan.settlement + plan.refinanceFee)}</span> to clear
                the outstanding balance and the fee.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(plan, form.reason.trim())}
            disabled={!canCommit}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl text-white shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              isRefinance ? 'bg-violet-600 hover:bg-violet-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {isRefinance ? <RefreshCw className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
            {isRefinance ? 'Refinance & Release' : 'Apply New Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[11px]">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={strong
        ? 'font-bold text-slate-800 dark:text-slate-100'
        : 'font-semibold text-slate-700 dark:text-slate-200'}>{value}</span>
    </div>
  )
}
