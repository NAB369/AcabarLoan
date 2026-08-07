import { useState, useEffect } from 'react'
import { Plus, ChevronDown } from 'lucide-react'

// The Add control that sits beside a party tab bar, on every tab of the loan detail that has
// one. Options are what can be added there — a party, an income, an expense.
//
// With several options it is a menu: one "+ Add" that lists them, rather than one button per
// option filling the bar. With exactly one it is a plain "+ Add <that thing>" button, because
// a menu that opens to a single choice is a click that asks a question with one answer.
//
// { id, label, hint? } per option; `hint` is the second line in the menu and is dropped in the
// single-option form, where the label already says what it does.
// `iconOnly` reduces the trigger to a bare "+", for bars where the tabs beside it already say
// what is being added. It always opens the menu, even for a single option: "+" on its own does
// not say what it adds, so the list is what supplies the label the button no longer carries.
export default function AddMenu({ options, onSelect, label = 'Add', iconOnly = false }) {
  const [open, setOpen] = useState(false)

  // Escape closes it. The loan detail's global Escape handler only knows about its modals, and
  // a menu that can only be dismissed with the mouse is a trap for anyone on the keyboard.
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!options.length) return null

  const btnCls = 'flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap'

  if (options.length === 1 && !iconOnly) {
    return (
      <button type="button" onClick={() => onSelect(options[0].id)} className={`${btnCls} mb-2`}>
        <Plus className="w-3.5 h-3.5" /> {label} {options[0].label}
      </button>
    )
  }

  return (
    <div className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        className={iconOnly ? `${btnCls} px-2` : btnCls}
      >
        <Plus className="w-3.5 h-3.5" />
        {!iconOnly && (
          <>
            {label}
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>
      {open && (
        <>
          {/* Catches the outside click. Under the menu, over everything else. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute left-0 mt-1 z-30 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-1">
            {options.map(o => (
              <button
                key={o.id}
                role="menuitem"
                onClick={() => { setOpen(false); onSelect(o.id) }}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{o.label}</span>
                {o.hint && <span className="block text-[10px] text-slate-400 dark:text-slate-500">{o.hint}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
