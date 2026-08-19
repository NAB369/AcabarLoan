import { useState } from 'react'
import { SlidersHorizontal, BookmarkPlus, Check, Trash2, X, RotateCcw } from 'lucide-react'
import { DATE_PRESETS, ALL_DATES, isRangeActive, rangeLabel } from '../../utils/dateRange'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// ── One Filters panel per register ───────────────────────────────────────────
// Date range, saved filter sets and Reset are one idea — narrow the register, keep the way you
// narrowed it, put it back — so they are one control rather than three pills competing for the
// filter bar. Search and status stay outside on the bar: those are typed and picked constantly,
// while everything in here is set once and left alone.
//
// The panel owns no filter state. The page owns it all and passes it down, which is what lets
// one Reset clear every control and one saved set restore them together.

const menuRow = 'w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2'
const sectionLabel = 'text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500'

export function FilterMenu({
  // What the date range filters on, in the register's own words ('Created', 'Registered') —
  // the panel never says "date", which would leave the operator guessing which one.
  dateLabel = 'Date',
  dateRange,
  onDateRangeChange,
  saved = [],
  onApply,
  onSave,
  onDelete,
  // How many filters are narrowing the register — including the search and status that live
  // outside this panel, since Reset clears those too and the count has to match what it does.
  activeCount = 0,
  summary,
  onReset,
}) {
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const range = { ...ALL_DATES, ...(dateRange || {}) }

  const setCustom = patch => onDateRangeChange({ ...range, preset: 'custom', ...patch })

  function close(next) {
    setOpen(next)
    if (!next) { setNaming(false); setName('') }
  }

  function commitName(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
    setName('')
    setNaming(false)
    close(false)
  }

  return (
    <Popover open={open} onOpenChange={close}>
      <PopoverTrigger asChild>
        {/* Closed, the button is the only thing saying the list is narrowed — so it carries the
            count, takes the brand tint, and spells the filters out in its own tooltip and
            accessible name rather than leaving them to be discovered by opening the panel. */}
        <button
          type="button"
          title={summary || 'Filter this list'}
          aria-label={activeCount > 0 ? `Filters — ${summary}` : 'Filters'}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap ${
            activeCount > 0
              ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 flex-shrink-0" />
          Filters
          {activeCount > 0 && (
            <span className="px-1.5 rounded-full bg-brand-600 text-white text-[10px] font-bold leading-4">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 rounded-2xl p-3 space-y-3">
        {/* ── Date range ────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className={sectionLabel}>{dateLabel}</p>
            {isRangeActive(range) && (
              <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400 truncate max-w-[9rem]">
                {rangeLabel(range)}
              </span>
            )}
          </div>
          {/* Two columns: eight presets in one list would push the saved sets and Reset below
              the fold of a panel that is meant to hold all three at once. */}
          <div className="grid grid-cols-2 gap-1">
            {DATE_PRESETS.filter(p => p.value !== 'custom').map(preset => {
              const on = range.preset === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onDateRangeChange({ preset: preset.value, from: '', to: '' })}
                  aria-pressed={on}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-colors truncate ${
                    on
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          {/* Typing a date switches the preset to custom on its own — having to choose "Custom"
              first before the fields would accept a date is a step that serves the control. */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              aria-label={`${dateLabel} from`}
              value={range.from || ''}
              max={range.to || undefined}
              onChange={e => setCustom({ from: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <span className="text-slate-300 dark:text-slate-600 text-xs flex-shrink-0">→</span>
            <input
              type="date"
              aria-label={`${dateLabel} to`}
              value={range.to || ''}
              min={range.from || undefined}
              onChange={e => setCustom({ to: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700" />

        {/* ── Saved sets ────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className={sectionLabel}>Saved filters</p>
          {saved.length === 0 ? (
            <p className="text-[11px] leading-snug text-slate-400 dark:text-slate-500 px-0.5 py-1">
              Narrow the list, then save it here to come back to it.
            </p>
          ) : (
            <div className="max-h-36 overflow-y-auto -mx-0.5 px-0.5">
              {saved.map(entry => (
                // The row applies; the bin deletes. One is the everyday action and gets the
                // whole row, the other is small and to the side.
                <div key={entry.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { onApply(entry); close(false) }}
                    className={`${menuRow} flex-1 min-w-0 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5`}
                  >
                    <Check className="w-3.5 h-3.5 flex-shrink-0 text-slate-300 dark:text-slate-600" />
                    <span className="truncate">{entry.name}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    aria-label={`Delete saved filter ${entry.name}`}
                    className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {naming ? (
            <form onSubmit={commitName} className="space-y-1.5 pt-1">
              {/* What is about to be saved, spelled out — a name given to a filter set the
                  operator cannot see is a name given to nothing. */}
              {summary && (
                <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500 px-0.5">{summary}</p>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Name this filter"
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setNaming(false); setName('') }}
                  aria-label="Cancel naming this filter"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              disabled={activeCount === 0}
              title={activeCount > 0 ? undefined : 'Narrow the list first — there is nothing to save yet'}
              className={`${menuRow} ${activeCount > 0
                ? 'text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 font-semibold'
                : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}
            >
              <BookmarkPlus className="w-3.5 h-3.5 flex-shrink-0" />
              Save current filters
            </button>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700" />

        {/* ── Reset ─────────────────────────────────────────────────────── */}
        {/* Always in the same place, disabled rather than hidden when there is nothing to
            clear: a row that comes and goes moves everything above it as the panel is used. */}
        <button
          type="button"
          onClick={() => { onReset(); close(false) }}
          disabled={activeCount === 0}
          className={`${menuRow} ${activeCount > 0
            ? 'text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 font-semibold'
            : 'text-slate-300 dark:text-slate-600 cursor-not-allowed'}`}
        >
          <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
          Reset all filters
          {activeCount > 0 && <span className="text-[10px] font-bold ml-auto">{activeCount}</span>}
        </button>
      </PopoverContent>
    </Popover>
  )
}
