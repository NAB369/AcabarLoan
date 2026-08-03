import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Per-card accent palettes, shaped like the Account Management CARDS entries
// (flat tinted icon tile, solid top strip, tinted hover border). Each variant is
// written out as complete class strings — never interpolated from a colour name —
// so Tailwind's content scanner keeps them in the production build.
const ACCENTS = {
  brand: {
    idle:  'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    bar:   'bg-blue-600',
    hover: 'hover:border-blue-300 dark:hover:border-blue-900/50',
  },
  // Matches the company logo — gold disc with royal-blue lettering.
  gold: {
    idle:  'bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-400',
    bar:   'bg-gold-500',
    hover: 'hover:border-gold-300 dark:hover:border-gold-900/50',
  },
  rose: {
    idle:  'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
    bar:   'bg-rose-600',
    hover: 'hover:border-rose-300 dark:hover:border-rose-900/50',
  },
  amber: {
    idle:  'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    bar:   'bg-amber-500',
    hover: 'hover:border-amber-300 dark:hover:border-amber-900/50',
  },
  emerald: {
    idle:  'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    bar:   'bg-emerald-600',
    hover: 'hover:border-emerald-300 dark:hover:border-emerald-900/50',
  },
  violet: {
    idle:  'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    bar:   'bg-purple-600',
    hover: 'hover:border-purple-300 dark:hover:border-purple-900/50',
  },
  sky: {
    idle:  'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
    bar:   'bg-sky-600',
    hover: 'hover:border-sky-300 dark:hover:border-sky-900/50',
  },
  slate: {
    idle:  'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300',
    bar:   'bg-slate-500',
    hover: 'hover:border-slate-300 dark:hover:border-slate-600',
  },
}

/**
 * Report entry card used by the Loan Report and Financial Report pickers.
 * Follows the Account Management card layout: accent strip on the top edge,
 * icon beside the title, and a bordered footer row ending in a chevron.
 */
export default function ReportCard({
  icon: Icon,
  title,
  description,
  onClick,
  accent = 'brand',
  cta = 'View report',
}) {
  const a = ACCENTS[accent] || ACCENTS.brand

  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={`group relative overflow-hidden flex flex-col items-start text-left h-auto p-5 pt-6 min-h-[200px] rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-white border-slate-200/60 dark:bg-slate-800 dark:border-slate-700 ${a.hover}`}
    >
      {/* Accent strip along the top edge — full colour on hover */}
      <span className={`absolute inset-x-0 top-0 h-1 ${a.bar} opacity-40 group-hover:opacity-100 transition-opacity`} />

      <div className="w-full flex items-start gap-3">
        <div className={`p-3 rounded-xl flex-shrink-0 transition-colors ${a.idle}`}>
          <Icon className="!w-6 !h-6" />
        </div>
        {/* Title and subtitle share one column so both start at the same edge */}
        <div className="min-w-0 text-left">
          <p className="text-base sm:text-lg font-bold leading-tight text-slate-800 dark:text-slate-100">
            {title}
          </p>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
            {description}
          </p>
        </div>
      </div>

      <div className="w-full mt-auto pt-4 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700/70">
        <p className="flex-1 min-w-0 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">
          {cta}
        </p>
        <ChevronRight className="!w-4 !h-4 flex-shrink-0 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Button>
  )
}
