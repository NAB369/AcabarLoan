import { useMemo } from 'react'
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { formatVal } from '../../utils/format'
import { recommendCredit, VERIFICATION, RISK, RECOMMENDATION, DTI_LIMIT_PCT } from '../../utils/creditVerification'

// The credit committee's view: one status, confidence, risk and recommended action per party,
// the household's affordability ratios, and — deliberately — the list of checks the system did
// not perform. A report that showed only what passed would read as a clean bill of health on
// work nobody has done yet.

const STATUS_STYLE = {
  [VERIFICATION.verified]: { Icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-400 dark:border-emerald-800' },
  [VERIFICATION.partial]: { Icon: AlertTriangle, cls: 'text-amber-600 dark:text-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/25 dark:text-amber-400 dark:border-amber-800' },
  [VERIFICATION.unverified]: { Icon: XCircle, cls: 'text-rose-600 dark:text-rose-400', chip: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/25 dark:text-rose-400 dark:border-rose-800' },
}

const RISK_CHIP = {
  [RISK.low]: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-400 dark:border-emerald-800',
  [RISK.medium]: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/25 dark:text-amber-400 dark:border-amber-800',
  [RISK.high]: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/25 dark:text-rose-400 dark:border-rose-800',
}

const RECOMMENDATION_STYLE = {
  [RECOMMENDATION.approve]: { Icon: ShieldCheck, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' },
  [RECOMMENDATION.review]: { Icon: ShieldAlert, cls: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300' },
  [RECOMMENDATION.reject]: { Icon: XCircle, cls: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300' },
}

export default function CreditVerificationPanel({ loan, currency }) {
  const report = useMemo(() => recommendCredit(loan), [loan])
  const money = v => formatVal(v || 0, currency, 1)
  const ratio = v => (v === null || v === undefined ? '—' : `${v}%`)
  const rec = RECOMMENDATION_STYLE[report.recommendation]

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <div className={`rounded-2xl border p-4 ${rec.cls}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <rec.Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold">{report.recommendation}</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                {report.blockers.length
                  ? `${report.blockers.length} blocking finding${report.blockers.length === 1 ? '' : 's'}`
                  : report.cautions.length
                    ? `${report.cautions.length} item${report.cautions.length === 1 ? '' : 's'} to clear before approval`
                    : 'Evidence supports the declared position'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <Score label="Overall" value={report.overall} />
            <Score label="Income" value={report.incomeScore} />
            <Score label="Expense" value={report.expenseScore} />
          </div>
        </div>

        {(report.blockers.length > 0 || report.cautions.length > 0) && (
          <ul className="mt-3 space-y-1 border-t border-current/15 pt-3">
            {report.blockers.map((b, i) => (
              <li key={`b${i}`} className="text-[11px] font-semibold flex items-start gap-1.5">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />{b}
              </li>
            ))}
            {report.cautions.map((c, i) => (
              <li key={`c${i}`} className="text-[11px] flex items-start gap-1.5 opacity-90">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />{c}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Affordability — assessable figures, not declared ones */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Affordability</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 mb-3">
          Measured on what the documents demonstrate, not on the declared figures.
          {report.declaredIncome !== report.income && (
            <> Declared income {money(report.declaredIncome)} was capped to {money(report.income)}.</>
          )}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric
            label="Debt-to-income"
            value={ratio(report.dti)}
            tone={report.dti === null ? undefined : report.dti > DTI_LIMIT_PCT ? 'bad' : report.dti > 40 ? 'warn' : 'good'}
          />
          <Metric label="Expense-to-income" value={ratio(report.expenseRatio)} />
          <Metric label="Savings ratio" value={ratio(report.savingsRatio)} />
          <Metric
            label="Net cash flow"
            value={money(report.net)}
            tone={report.net < 0 ? 'bad' : 'good'}
          />
        </div>

        {/* The derivation, not just the endpoints. Disposable income and net cash flow are two
            different subtotals — the first is what is left after living costs, the second is
            what is left after debt as well — and showing them as two tiles among eight left no
            way to see that the gap between them is the debt service. Laid out as a statement,
            each line either adds or subtracts and the two subtotals fall out of it. */}
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              <StatementRow label="Monthly income" value={money(report.income)} />
              <StatementRow label="Monthly expense" value={money(report.expense)} negative />
              <StatementRow label="Disposable income" value={money(report.disposable)} subtotal />
              <StatementRow label="Existing debt service" value={money(report.existingDebt)} negative />
              <StatementRow label="This instalment" value={money(report.newInstalment)} negative />
              <StatementRow
                label="Net cash flow"
                value={money(report.net)}
                subtotal
                tone={report.net < 0 ? 'bad' : 'good'}
              />
            </tbody>
          </table>
        </div>

        {/* Where the two subtotals differ, say so in words — the number alone does not explain
            that a healthy disposable income can still leave nothing once existing borrowing is
            counted, which is the question this panel gets asked most. */}
        {report.debtService > 0 && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            {money(report.disposable)} is left after living costs, but {money(report.debtService)} a month
            goes on debt — {money(report.existingDebt)} on borrowing already on the bureau and{' '}
            {money(report.newInstalment)} on this loan — leaving {money(report.net)}.
          </p>
        )}

        {/* The one way these figures can overstate the burden. Worth saying rather than silently
            adjusting: the conservative reading is the safe one for a credit decision, but the
            officer should know it may be counting the same money twice. */}
        {report.expenseFromStatement && report.existingDebt > 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 leading-relaxed">
            The expense figure came off the bank statements, which already include any loan
            repayments that left the account — so existing debt service may be counted twice here.
            Treat the net as the cautious end of the range.
          </p>
        )}
      </div>

      {/* Per party */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {report.parties.map(p => {
          const style = STATUS_STYLE[p.status] || STATUS_STYLE[VERIFICATION.unverified]
          return (
            <div key={p.target} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <style.Icon className={`w-4 h-4 flex-shrink-0 ${style.cls}`} aria-hidden="true" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.label}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${style.chip}`}>{p.status}</span>
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${RISK_CHIP[p.risk]}`}>{p.risk} risk</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">{p.confidence}%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <Metric label="Income (assessed)" value={money(p.income.assessable)} />
                <Metric label="Expense (assessed)" value={money(p.expense.assessable)} />
              </div>

              {/* Every declared source, with what its own documents demonstrate */}
              {p.income.sources.length > 0 && (
                <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Income sources</p>
                  <ul className="space-y-1">
                    {p.income.sources.map(s => (
                      <li key={s.index} className="text-[11px] flex items-start justify-between gap-2">
                        <span className="text-slate-600 dark:text-slate-300 min-w-0 truncate">{s.label}</span>
                        <span className="flex-shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                          {money(s.declared)}
                          <span className="ml-1.5 font-medium text-slate-400 dark:text-slate-500">{s.state}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {p.findings.length > 0 && (
                <div className="mt-3 border-t border-slate-100 dark:border-slate-700 pt-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">Findings</p>
                  <ul className="space-y-1">
                    {p.findings.map((f, i) => (
                      <li key={i} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-3 text-[11px] font-semibold text-slate-700 dark:text-slate-200 border-t border-slate-100 dark:border-slate-700 pt-2.5">
                Recommended action: <span className="font-medium text-slate-600 dark:text-slate-300">{p.action}</span>
              </p>
            </div>
          )
        })}
      </div>

      {/* What was NOT checked. Present on purpose — see MANUAL_REVIEW_CHECKS. */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
          Not checked — manual review required
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 mb-2.5">
          These cannot be established from the files on record and are excluded from every score above.
          A clean report does not mean they passed.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {report.manualChecks.map(c => (
            <li key={c.id} className="text-[11px] flex items-start gap-1.5">
              <HelpCircle className="w-3 h-3 flex-shrink-0 mt-0.5 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{c.label}</span>
                <span className="block text-slate-500 dark:text-slate-400">{c.why}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Score({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold leading-none">{value}%</p>
      <p className="text-[10px] opacity-80 mt-0.5">{label}</p>
    </div>
  )
}

// One line of the affordability statement. `negative` prints the figure as a deduction so the
// arithmetic reads without the operator having to infer which lines subtract.
function StatementRow({ label, value, negative, subtotal, tone }) {
  const toneCls = tone === 'bad' ? 'text-rose-600 dark:text-rose-400'
    : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-800 dark:text-slate-100'
  return (
    <tr className={subtotal
      ? 'bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-700'
      : 'border-t border-slate-100 dark:border-slate-800 first:border-t-0'}>
      <td className={`px-3 py-2 ${subtotal ? 'font-bold text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>
        {label}
      </td>
      <td className={`px-3 py-2 text-right whitespace-nowrap font-mono ${subtotal ? `font-bold ${toneCls}` : 'text-slate-700 dark:text-slate-200'}`}>
        {negative ? `− ${value}` : value}
      </td>
    </tr>
  )
}

function Metric({ label, value, tone }) {
  const toneCls = tone === 'bad' ? 'text-rose-600 dark:text-rose-400'
    : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
    : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-slate-800 dark:text-slate-100'
  return (
    <div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{label}</p>
      <p className={`text-sm font-bold ${toneCls}`}>{value}</p>
    </div>
  )
}
