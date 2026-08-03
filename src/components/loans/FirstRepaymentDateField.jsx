import { CalendarClock } from 'lucide-react'
import { daysBetweenISO } from '../../utils/format'

const inputCls = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition'

// The collection day is one agreement for the whole loan, not a per-month decision:
// only the first installment is editable and every later one shifts with it, keeping
// the monthly cadence. It is settled at release rather than on the schedule tab — the
// officer confirms the date in the same dialog that authorises the payout, and the
// change is committed together with the disbursement (see handleDisburse), so a
// cancelled dialog leaves the agreed schedule untouched.
export default function FirstRepaymentDateField({ schedule = [], value, onChange }) {
  const first = schedule[0]
  if (!first) return null

  const laterCount = schedule.length - 1
  const delta = value ? daysBetweenISO(first.dueDateISO, value) : 0

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
          First Repayment Date
        </label>
        <input
          type="date"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
        />
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          Currently due {first.dueDate}
          {delta !== 0 && ` · ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'} ${delta > 0 ? 'later' : 'earlier'}`}
        </p>
      </div>
      {laterCount > 0 && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <CalendarClock className="w-4 h-4 text-[#0047ab] dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-blue-800 dark:text-blue-300">
            Changing this shifts the remaining {laterCount} installment{laterCount === 1 ? '' : 's'} by the same number of days, keeping the monthly cadence. The repayment schedule and repayment tracking both follow the new dates. Repayment dates cannot be set month by month.
          </p>
        </div>
      )}
    </div>
  )
}
