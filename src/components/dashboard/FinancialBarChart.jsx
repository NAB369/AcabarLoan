import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { formatVal } from '../../utils/format'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

// Split into its own module so App.jsx can lazy-load it: recharts is ~105 kB gzipped, more
// than half of what the dashboard costs to open, and it is needed for one card below the
// KPI tiles. Loading it after first paint gets the numbers on screen sooner; the chart
// arrives a moment later in the space kept for it.
// ── Financial Overview chart config — fixed Income/Expense hues, matching the
// legend dots already used in this card (bg-emerald-500 / bg-rose-500) ────────
const financialChartConfig = {
  income:  { label: 'Income',  color: '#10b981' },
  expense: { label: 'Expense', color: '#f43f5e' },
}

// ── Bar Chart (shadcn/recharts) — grouped Income vs Expense bars per month ────
export default function FinancialBarChart({ data, currency }) {
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
