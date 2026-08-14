import { useMemo, useState } from 'react'
import { X, Users, AlertTriangle } from 'lucide-react'
import { useApp, expenseFundingAccount } from '../../context/AppContext'
import { auditStamp, formatVal } from '../../utils/format'
import {
  employeeName, isOnPayroll, periodBounds, periodLabel, employeeDeduction, employeeNetSalary,
} from '../../utils/employee'

// A run pays one calendar month, so its period is a month and its posting date is the last
// day of it.
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Runs a month of payroll off the employee register: every employee on staff for that month
// with a salary set. The whole run posts as ONE expense against the payroll account — the
// per-employee lines are kept on the run itself, so the ledger carries a single salary
// posting per month while the breakdown behind it stays recoverable.
// `initialPeriod` and `initialEmployeeIds` carry through what the register was showing when
// Process Payroll was pressed: the month it was filtered to, and the names ticked in it. Both
// are starting points the operator can still change here — the modal remains the place the run
// is settled, not a confirmation of a decision already made.
export default function PayrollRunModal({ accountCode, accountLabel, initialPeriod, initialEmployeeIds, onClose }) {
  const { state, dispatch, showToast, can } = useApp()
  const { employees, payrollRuns, currency } = state

  const [month, setMonth] = useState(() => initialPeriod || currentMonth())
  // Who is being left out of this run, by employee id. Held as exclusions rather than
  // selections so the run defaults to paying everyone — the normal case is the whole payroll,
  // and someone added to the register mid-draft should be in it, not silently missed.
  // A selection made on the register inverts into exclusions here: ticking three names means
  // everyone else is left out, which is the same statement in this modal's terms.
  const [excluded, setExcluded] = useState(() => {
    const picked = new Set(initialEmployeeIds || [])
    if (!picked.size) return new Set()
    return new Set((employees || []).filter(e => !picked.has(e.id)).map(e => e.id))
  })
  const { start, end } = periodBounds(month)

  // A different month is a different set of staff, so nothing carries over from the last one.
  function pickMonth(value) {
    setMonth(value)
    setExcluded(new Set())
  }

  const eligible = useMemo(
    () => employees.filter(e => isOnPayroll(e, start, end)),
    [employees, start, end]
  )
  // Someone on staff without a salary can't be paid — reported rather than silently dropped.
  // Judged on the gross: an employee whose deduction happens to cancel their salary still has
  // a salary set, and belongs in the run at zero rather than being reported as unpayable.
  const payable = useMemo(() => eligible.filter(e => Number(e.salary) > 0), [eligible])
  const lines = useMemo(() => payable.filter(e => !excluded.has(e.id)), [payable, excluded])
  const missingSalary = eligible.length - payable.length
  // The run is worth what it pays out, which is net of deductions.
  const total = Math.round(lines.reduce((s, e) => s + employeeNetSalary(e), 0) * 100) / 100
  const totalGross = Math.round(lines.reduce((s, e) => s + Number(e.salary || 0), 0) * 100) / 100
  const totalDeducted = Math.round((totalGross - total) * 100) / 100
  const leftOut = payable.length - lines.length

  const allSelected = payable.length > 0 && leftOut === 0
  const noneSelected = lines.length === 0
  function toggleAll() {
    setExcluded(allSelected ? new Set(payable.map(e => e.id)) : new Set())
  }
  function toggleOne(id) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const alreadyRun = payrollRuns.find(r => r.period === month)
  const canSubmit = !!month && lines.length > 0 && !alreadyRun

  // What the account can actually cover, reported here rather than discovered at approval.
  // A short account does NOT block posting: a run is a commitment, and approving it is the
  // separate step that moves the money — so the normal order is post the run, transfer the
  // funds in, then approve. Saying so now is what stops the run stalling unexplained later.
  const fundingAccount = expenseFundingAccount(state, accountCode)
  const accountBalance = fundingAccount?.balance || 0
  const shortfall = Math.max(0, total - accountBalance)

  function handleSubmit() {
    if (!can('manage_accounting')) {
      showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')
      return
    }
    if (!canSubmit) return

    const code = `PR-${month.replace('-', '')}`
    const label = periodLabel(month)
    dispatch({
      type: 'ADD_PAYROLL_RUN',
      run: {
        code, period: month, date: end, total, account: accountCode,
        // Who ran it and when. `date` is the period end the posting is dated to, which is a
        // month's end rather than the moment the run was made — the audit log needs the
        // second one, so it is kept alongside instead of inferred from the first.
        createdBy: state.currentRole, createdAt: auditStamp(),
        lines: lines.map(e => ({
          employeeId: e.id, employeeNo: e.employeeNo, name: employeeName(e),
          position: e.position || '',
          // What the line pays, plus what it was worked out from — a payslip has to show
          // the gross and the deduction, and the run is the only record of what they were
          // on the day it was made. Editing the employee later must not restate a run.
          gross: Number(e.salary || 0), deduction: employeeDeduction(e), amount: employeeNetSalary(e),
        })),
      },
    })
    // Posts as Pending Approval like any other expense; approving it releases the funds.
    dispatch({
      type: 'ADD_EXPENSE',
      entry: {
        code, category: 'Employment Salaries', amount: total, date: end,
        description: `Staff payroll — ${label} · ${lines.length} employee${lines.length === 1 ? '' : 's'}`,
        account: accountCode,
      },
    })
    showToast(`Payroll for ${label} posted for approval — ${formatVal(total, currency)}`, 'success')
    onClose()
  }

  // Opaque, not slate-700/50 — this header is sticky, so rows scrolling beneath it were
  // showing through the translucent background in dark mode.
  const th = 'px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 text-left whitespace-nowrap'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Process Payroll</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Pay Period</label>
              <input
                type="month" value={month} onChange={e => pickMonth(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mb-1">Posts to</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{accountLabel}</p>
              {/* The balance beside the account, so the total on the right can be read
                  against what is there to pay it with */}
              <p className={`text-[11px] font-semibold mt-0.5 ${shortfall > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {formatVal(accountBalance, currency)} available
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mb-1">
                {lines.length} employee{lines.length === 1 ? '' : 's'}
              </p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatVal(total, currency)}</p>
            </div>
          </div>

          {alreadyRun && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {periodLabel(month)} has already been run as {alreadyRun.code}. Pick another period.
            </p>
          )}

          {/* Not an error — the run can be posted short and funded before approval. It says
              what has to happen between the two steps, and by how much. */}
          {shortfall > 0 && lines.length > 0 && !alreadyRun && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {accountLabel} holds {formatVal(accountBalance, currency)}, {formatVal(shortfall, currency)} short of
              this {formatVal(total, currency)} run. It can still be posted — transfer the shortfall into the
              account before approving it, or the approval will be refused.
            </p>
          )}

          {/* A period can only be run once (see alreadyRun), so anyone left out of this run
              cannot be paid for this month afterwards. Said before posting, not discovered
              when the second run is refused. */}
          {leftOut > 0 && !alreadyRun && (
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {leftOut} of {payable.length} employee{payable.length === 1 ? '' : 's'} {leftOut === 1 ? 'is' : 'are'} left
              out of this run. {periodLabel(month)} can only be run once, so {leftOut === 1 ? 'they' : 'they'} cannot be
              paid for this period afterwards.
            </p>
          )}

          {missingSalary > 0 && (
            <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
              {missingSalary} employee{missingSalary === 1 ? '' : 's'} on staff this period {missingSalary === 1 ? 'has' : 'have'} no
              salary set and {missingSalary === 1 ? 'is' : 'are'} left out of the run.
            </p>
          )}

          <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
            {/* The employee list is what the extra height is for — the cap is what actually
                decides how many rows are visible, not the modal's own max-height. */}
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className={`${th} w-16`}>
                      {/* Ticks or clears the whole list. Carries the word "All" because a bare
                          box among four text headings doesn't read as a control — the first
                          person to use this asked where select-all was. Indeterminate while
                          only some are in, so it reports a partial run rather than "none". */}
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected }}
                          onChange={toggleAll}
                          disabled={payable.length === 0}
                          aria-label="Include every employee in this run"
                          className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40"
                        />
                        All
                      </label>
                    </th>
                    <th className={th}>Employee No.</th>
                    <th className={th}>Name</th>
                    <th className={th}>Position</th>
                    <th className={`${th} !text-right`}>Salary</th>
                    <th className={`${th} !text-right`}>Deduction</th>
                    <th className={`${th} !text-right`}>Net Pay</th>
                  </tr>
                </thead>
                {/* Every payable employee is listed, ticked or not — an unticked row has to
                    stay visible or there is no way to put it back into the run. */}
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {payable.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                        No employee is on payroll for this period.
                      </td>
                    </tr>
                  ) : payable.map(e => {
                    const included = !excluded.has(e.id)
                    return (
                      <tr key={e.id} className={included ? '' : 'opacity-45'}>
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={() => toggleOne(e.id)}
                            aria-label={`Include ${employeeName(e) || e.employeeNo} in this run`}
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40 align-middle"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400">{e.employeeNo}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{employeeName(e)}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">{e.position || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 text-right whitespace-nowrap">
                          {formatVal(Number(e.salary || 0), currency)}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-right whitespace-nowrap text-rose-600 dark:text-rose-400">
                          {employeeDeduction(e) ? formatVal(employeeDeduction(e), currency) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">
                          {formatVal(employeeNetSalary(e), currency)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {payable.length > 0 && (
                  // Pinned to the bottom of the scroll area, so the total stays readable while
                  // paging through the list rather than only at the end of it. The background
                  // is fully opaque here — a translucent one lets the rows it overlaps show
                  // through, which the scrolled-under header already did in dark mode.
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700">
                      <td colSpan={4} className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                        Total Payroll{leftOut > 0 ? ` — ${lines.length} of ${payable.length} selected` : ''}
                      </td>
                      {/* Gross and deductions total under their own columns, so the net reads
                          as the arithmetic of the two above it rather than as a bare figure. */}
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 text-right whitespace-nowrap">
                        {formatVal(totalGross, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-right whitespace-nowrap text-rose-600 dark:text-rose-400">
                        {totalDeducted ? formatVal(totalDeducted, currency) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 text-right whitespace-nowrap">
                        {formatVal(total, currency)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex items-center gap-1.5 px-6 py-2 text-sm font-bold rounded-xl transition-colors ${
              canSubmit
                ? 'text-white bg-brand-600 hover:bg-brand-700'
                : 'text-slate-400 bg-slate-100 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Post for Approval
          </button>
        </div>
      </div>
    </div>
  )
}
