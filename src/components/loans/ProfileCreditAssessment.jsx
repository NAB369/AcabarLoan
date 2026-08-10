import { useMemo } from 'react'
import { formatVal } from '../../utils/format'
import { recommendCredit, DTI_LIMIT_PCT } from '../../utils/creditVerification'

// The Credit Assessment as it belongs on paper: the recommendation, what it rests on, and what
// is standing in its way. The screen version (CreditVerificationPanel) is built for working in
// — tabs, colour, a statement table. A loan profile is read once, often printed, and by someone
// who was not at the screen, so this states the same verdict in flat rows that survive a PDF.
//
// Both Loan Preview and Approval Review show it, which is why it lives here rather than being
// written twice.
export default function ProfileCreditAssessment({ loan, currency }) {
  const report = useMemo(() => recommendCredit(loan), [loan])
  const money = v => formatVal(v || 0, currency, 1)
  const ratio = v => (v === null || v === undefined ? '—' : `${v}%`)

  return (
    <div className="space-y-3">
      <div data-doc-field className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-2">
        <div>
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">Recommendation</p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{report.recommendation}</p>
        </div>
        <div className="flex items-center gap-4 text-right">
          {[['Overall', report.overall], ['Income', report.incomeScore], ['Expense', report.expenseScore]].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{value}%</p>
            </div>
          ))}
        </div>
      </div>

      <div data-doc-field className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['Debt-to-income', `${ratio(report.dti)}${report.dti !== null && report.dti > DTI_LIMIT_PCT ? ` (limit ${DTI_LIMIT_PCT}%)` : ''}`],
          ['Expense-to-income', ratio(report.expenseRatio)],
          ['Savings ratio', ratio(report.savingsRatio)],
          ['Net cash flow', money(report.net)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{value}</p>
          </div>
        ))}
      </div>

      {/* The derivation, not just the endpoints — a reader who was not at the screen cannot
          otherwise see why a healthy disposable income still leaves nothing. */}
      <div data-doc-field className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          ['Monthly income (assessed)', money(report.income)],
          ['Monthly expense (assessed)', money(report.expense)],
          ['Disposable income', money(report.disposable)],
          ['Existing debt service', money(report.existingDebt)],
          ['This instalment', money(report.newInstalment)],
          ['Net cash flow', money(report.net)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{value}</p>
          </div>
        ))}
      </div>

      {report.parties.map(p => (
        <div data-doc-field key={p.target} className="border-t border-slate-100 dark:border-slate-700 pt-2">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            {p.label}
            <span className="ml-2 font-medium text-slate-500 dark:text-slate-400">
              {p.status} · {p.risk} risk · {p.confidence}% confidence
            </span>
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            Income {money(p.income.assessable)} · Expense {money(p.expense.assessable)}
          </p>
          {p.findings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {p.findings.map((f, i) => (
                <li key={i} className="text-[11px] text-slate-500 dark:text-slate-400">— {f}</li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            <span className="font-semibold">Action:</span> {p.action}
          </p>
        </div>
      ))}

      {(report.blockers.length > 0 || report.cautions.length > 0) && (
        <div data-doc-field className="border-t border-slate-100 dark:border-slate-700 pt-2">
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Findings</p>
          <ul className="mt-1 space-y-0.5">
            {report.blockers.map((b, i) => (
              <li key={`b${i}`} className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">Blocking — {b}</li>
            ))}
            {report.cautions.map((c, i) => (
              <li key={`c${i}`} className="text-[11px] text-amber-600 dark:text-amber-400">Caution — {c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Printed on purpose: a profile that listed only what passed would read as a clean bill
          of health on work nobody has done yet. See MANUAL_REVIEW_CHECKS. */}
      <div data-doc-field className="border-t border-slate-100 dark:border-slate-700 pt-2">
        <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Not checked — manual review required</p>
        <ul className="mt-1 space-y-0.5">
          {report.manualChecks.map(c => (
            <li key={c.id} className="text-[11px] text-slate-500 dark:text-slate-400">— {c.label}: {c.why}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
