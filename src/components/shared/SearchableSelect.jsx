import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

// A single-select dropdown a user can type into to filter, for any list long enough that
// scrolling a plain <select> to find one entry stops being practical (customers, and anywhere
// else a picker is drawn from a list that grows with the business rather than staying fixed).
// `options` is `{ value, label, sublabel? }[]`; filtering matches label and sublabel together
// so "code · name" both find the same row.
//
// Pass `onCreate` where the list is a starting point rather than the whole world — reference
// data the app ships can always be missing an entry the operator in front of it needs (a
// commune outside the built-in gazetteer, say). Typing a name that isn't on the list then
// offers to add it, instead of leaving the user stuck at an empty menu.
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Type to search…',
  emptyText = 'No matches found',
  triggerPlaceholder = 'Select…',
  triggerClassName,
  disabled = false,
  onCreate = null,
  createLabel = query => `Add "${query}"`,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find(o => o.value === value) || null

  const typed = query.trim()
  // Only offered when what was typed isn't already on the list — an existing entry should be
  // picked, not duplicated under a second spelling.
  const canCreate = !!onCreate && typed.length > 0
    && !options.some(o => (o.label || '').toLowerCase() === typed.toLowerCase())

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed',
            triggerClassName,
          )}
        >
          <span className={cn('truncate', !selected && 'text-slate-400 dark:text-slate-500')}>
            {selected ? (selected.sublabel ? `${selected.label} · ${selected.sublabel}` : selected.label) : triggerPlaceholder}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>
      {/* Escape closes only the popover — stopped here so it doesn't also bubble to App.jsx's
          document-level handler and close the wizard/modal the picker sits inside. */}
      <PopoverContent
        align="start"
        onEscapeKeyDown={e => e.stopPropagation()}
        className="p-0 w-[var(--radix-popover-trigger-width)]"
      >
        <Command>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem
                  key={o.value}
                  value={o.sublabel ? `${o.label} ${o.sublabel}` : o.label}
                  onSelect={() => { onChange(o.value); setOpen(false) }}
                >
                  <Check className={cn('w-3.5 h-3.5 shrink-0', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0">
                    <p className="truncate">{o.label}</p>
                    {o.sublabel && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{o.sublabel}</p>}
                  </div>
                </CommandItem>
              ))}
              {/* Carries the typed text as its own cmdk value so the list's filter always
                  keeps it visible — it is the one row that should survive any query. */}
              {canCreate && (
                <CommandItem
                  value={typed}
                  onSelect={() => { onCreate(typed); setOpen(false); setQuery('') }}
                  className="text-brand-700 dark:text-brand-400"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <p className="truncate font-semibold">{createLabel(typed)}</p>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
