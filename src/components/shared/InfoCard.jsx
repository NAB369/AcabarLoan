export function InfoRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex gap-2 py-1.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium w-36 flex-shrink-0">{label}</span>
      <span className="text-xs text-slate-700 dark:text-slate-200 font-medium flex-1">{value}</span>
    </div>
  )
}

import { Card } from '@/components/ui/card'

export function InfoCard({ icon: Icon, title, children, className = '', action = null }) {
  return (
    <Card className={`bg-slate-50 dark:bg-slate-700/30 border-slate-100 dark:border-slate-700 shadow-none p-4 space-y-0.5 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />}
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}
