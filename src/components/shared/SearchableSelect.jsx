import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

// A single-select dropdown a user can type into to filter, for any list long enough that
// scrolling a plain <select> to find one entry stops being practical (customers, and anywhere
// else a picker is drawn from a list that grows with the business rather than staying fixed).
// `options` is `{ value, label, sublabel? }[]`; filtering matches label and sublabel together
// so "code · name" both find the same row.
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Type to search…',
  emptyText = 'No matches found',
  triggerPlaceholder = 'Select…',
  triggerClassName,
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value) || null

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <CommandInput placeholder={placeholder} />
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
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
