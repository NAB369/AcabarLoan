import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { Users, DollarSign, Banknote, Activity, ArrowUpRight, ArrowDownRight, TrendingUp, Coins } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatVal, CONVERSION_RATE } from '../../utils/format'
import StatusBadge from '../shared/StatusBadge'
import { getCustomerStatus } from '../../utils/customerStatus'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

// ── Financial Overview chart config — fixed Income/Expense hues, matching the
// legend dots already used in this card (bg-emerald-500 / bg-rose-500) ────────
const financialChartConfig = {
  income:  { label: 'Income',  color: '#10b981' },
  expense: { label: 'Expense', color: '#f43f5e' },
}

// ── Bar Chart (shadcn/recharts) — grouped Income vs Expense bars per month ────
function FinancialBarChart({ data, currency }) {
  if (data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-slate-400">
        No income or expense records yet.
      </div>
    )
  }

  return (
    <ChartContainer config={financialChartConfig} className="aspect-auto h-44 w-full">
      <BarChart data={data} barGap={4}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              formatter={(value, name, item) => (
                <>
                  <div className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
                  <div className="flex flex-1 items-center justify-between leading-none">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">{formatVal(value, currency)}</span>
                  </div>
                </>
              )}
            />
          }
        />
        <Bar dataKey="income" name="Income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        <Bar dataKey="expense" name="Expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ChartContainer>
  )
}

// ── Donut Chart (SVG) ─────────────────────────────────────────────────────────
function DonutChart({ segments, total }) {
  const R = 54, cx = 72, cy = 72, sw = 16
  const circ = 2 * Math.PI * R
  let offset = 0

  return (
    <svg viewBox="0 0 144 144" className="w-32 h-32 flex-shrink-0">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
      {segments.map((seg, i) => {
        const dash = (seg.pct / 100) * circ
        const el = (
          <circle
            key={i} cx={cx} cy={cy} r={R} fill="none"
            stroke={seg.color} strokeWidth={sw}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
          />
        )
        offset += dash
        return el
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={21} fontWeight="700" fill="#1e293b">{total}</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={9} fill="#94a3b8">LOANS</text>
    </svg>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, iconBg, trend, trendUp, valueClass = 'text-2xl' }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${trendUp ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' : 'text-rose-500 bg-rose-50 dark:bg-rose-900/30'}`}>
            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className={`${valueClass} font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-none`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { state, dispatch } = useApp()
  const { customers, incomes, expenses, currency, loanApplications } = state

  const totalCustomers  = customers.length
  const activeCustomers = customers.filter(c => getCustomerStatus(c, loanApplications) === 'Active').length
  const totalIncome     = incomes.reduce((s, i) => s + i.amount, 0)
  const totalExpenses   = expenses.reduce((s, e) => s + e.amount, 0)
  const netProfit       = totalIncome - totalExpenses
  const totalPortfolio  = loanApplications
    .filter(a => a.status === 'Active')
    .reduce((s, a) => s + (a.amount || 0), 0)

  const recentLoans = [...loanApplications].reverse().slice(0, 10)

  // ── Financial Overview — monthly income vs. expense, last 6 months of data ──
  const financialTrend = useMemo(() => {
    const monthKey = (d) => d ? d.slice(0, 7) : null
    const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
    const byMonth = {}
    incomes.forEach(i => {
      const k = monthKey(i.date)
      if (!k) return
      byMonth[k] = byMonth[k] || { income: 0, expense: 0 }
      byMonth[k].income += i.amount
    })
    expenses.forEach(e => {
      const k = monthKey(e.date)
      if (!k) return
      byMonth[k] = byMonth[k] || { income: 0, expense: 0 }
      byMonth[k].expense += e.amount
    })
    return Object.keys(byMonth).sort().slice(-6).map(k => ({ month: monthLabel(k), ...byMonth[k] }))
  }, [incomes, expenses])

  const loanStatuses = [
    { label: 'Active',           color: '#0047ab', count: loanApplications.filter(a => a.status === 'Active').length },
    { label: 'Waiting Disburse', color: '#10b981', count: loanApplications.filter(a => a.status === 'Waiting Disburse').length },
    { label: 'In Progress',      color: '#8b5cf6', count: loanApplications.filter(a => a.status === 'In Progress').length },
    { label: 'Pending Approval', color: '#f59e0b', count: loanApplications.filter(a => a.status === 'Pending Approval').length },
    { label: 'Rejected',         color: '#f43f5e', count: loanApplications.filter(a => a.status === 'Rejected').length },
  ]
  const totalLoans = loanApplications.length
  const segments   = loanStatuses.map(s => ({ ...s, pct: totalLoans > 0 ? (s.count / totalLoans) * 100 : 0 }))

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          label="Loan Portfolio" value={formatVal(totalPortfolio, currency)}
          icon={Banknote} iconBg="bg-brand-50 text-brand-600"
          trend="+12.4%" trendUp
          sub={`${loanApplications.filter(a => a.status === 'Active').length} active loans`}
        />
        <KpiCard
          label="Total Customers" value={totalCustomers}
          icon={Users} iconBg="bg-violet-50 text-violet-600"
          trend="+3" trendUp
          sub={`${activeCustomers} active`}
        />
        <KpiCard
          label="Total Income" value={formatVal(totalIncome, currency)}
          icon={TrendingUp} iconBg="bg-emerald-50 text-emerald-600"
          trend="+8.1%" trendUp
        />
        {/* Riel view of the same figure — always in KHR, regardless of the global currency toggle */}
        <KpiCard
          label="Total Income (KHR)" value={formatVal(totalIncome, 'KHR')}
          icon={Coins} iconBg="bg-amber-50 text-amber-600" valueClass="text-xl"
          sub={`Converted at ${CONVERSION_RATE.toLocaleString('en-US')} ៛ / USD`}
        />
        <KpiCard
          label="Net Profit" value={formatVal(netProfit, currency)}
          icon={DollarSign}
          iconBg={netProfit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}
          trend={netProfit >= 0 ? '+5.2%' : '-2.1%'} trendUp={netProfit >= 0}
        />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* Donut Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Loan Portfolio</h3>
          <p className="text-[11px] text-slate-400 mt-0.5 mb-3">By application status</p>
          <div className="flex items-center gap-4">
            <DonutChart segments={segments} total={totalLoans} />
            <div className="space-y-2 flex-1">
              {loanStatuses.map(s => (
                <div key={s.label} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{s.label}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-shrink-0">{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Financial Overview */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Financial Overview</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Monthly income vs. expenses</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />Income
              </span>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" />Expense
              </span>
            </div>
          </div>
          <FinancialBarChart data={financialTrend} currency={currency} />
        </div>

      </div>

      {/* ── Recent Loan Applications ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-600" />
            Recent Loan Applications
          </h3>
          <button
            onClick={() => dispatch({ type: 'SET_TAB', tab: 'open-loan' })}
            className="text-xs text-brand-600 font-semibold hover:text-brand-700"
          >
            View all
          </button>
        </div>
        <div className="hidden md:block overflow-x-auto max-h-[270px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 dark:bg-slate-700/40">
                {['Ref #', 'Customer', 'Product', 'Amount', 'Status'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
              {recentLoans.length === 0
                ? <tr><td colSpan={5} className="py-8 text-center text-slate-400">No loan applications yet.</td></tr>
                : recentLoans.map(loan => (
                  <tr
                    key={loan.ref}
                    onClick={() => dispatch({ type: 'SET_TAB', tab: 'open-loan' })}
                    className="hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-mono font-bold text-brand-600 dark:text-brand-400">{loan.ref}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{loan.customerName}</p>
                      <p className="text-[10px] text-slate-400">{loan.customerCode}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">{loan.product}</td>
                    <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-200">{formatVal(loan.amount, currency)}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={loan.status} size="xs" />
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden max-h-[410px] overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700">
          {recentLoans.length === 0
            ? <p className="py-8 text-center text-slate-400 text-xs">No loan applications yet.</p>
            : recentLoans.map(loan => (
              <div
                key={loan.ref}
                onClick={() => dispatch({ type: 'SET_TAB', tab: 'open-loan' })}
                className="p-4 active:bg-slate-50 dark:active:bg-white/5 cursor-pointer transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-brand-600 dark:text-brand-400 text-xs">{loan.ref}</span>
                  <StatusBadge status={loan.status} size="xs" />
                </div>
                <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{loan.customerName}</p>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{loan.product}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{formatVal(loan.amount, currency)}</span>
                </div>
              </div>
            ))
          }
        </div>
      </div>

    </div>
  )
}
