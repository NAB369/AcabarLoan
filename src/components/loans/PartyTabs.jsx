import { useRef } from 'react'

// The party tab bar, first built for the CBC tab and now shared by every place on a loan that
// is read one party at a time — Customer, CBC, Income Verification, Expense Verification.
// Same markup in all four, so a loan officer learns the control once.
//
// Each tab carries three things, and each earns its place:
//   label    — Borrower / Co-Borrower / Guarantor
//   subtitle — whose record this is. "Borrower" alone means looking somewhere else to find out
//              which person is on screen.
//   pill     — what is on file for that party. A count, or a node (a status badge). A bare "0"
//              reads as a score or an amount, so nothing on file is said in words instead.
//
// It is marked up as a real tablist: arrow keys move between the tabs, Home/End jump to the
// ends, and a roving tabindex keeps the bar to one stop in the Tab order. Without the key
// handler every tab but the active one would be unreachable from the keyboard.
// `showMeta={false}` drops the subtitle line and the pill, leaving the label alone. That is for
// a bar whose tabs are sections rather than people — there is no "whose record is this" to
// answer and no count to show, and a row of "Not on file / None" under section names would be
// noise. The shape, colours and keyboard behaviour stay identical either way.
export default function PartyTabs({
  items, activeId, onSelect, idPrefix, ariaLabel, actions = null, showMeta = true,
}) {
  const tabRefs = useRef({})
  const ids = items.map(t => t.id)

  function handleKey(e) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    let next = null
    if (e.key === 'Home') next = ids[0]
    else if (e.key === 'End') next = ids[ids.length - 1]
    else if (step) {
      const i = ids.indexOf(activeId)
      next = ids[(i + step + ids.length) % ids.length]
    }
    if (!next) return
    e.preventDefault()
    onSelect(next)
    tabRefs.current[next]?.focus()
  }

  return (
    // `actions` sits immediately after the last tab rather than pushed to the far edge: what it
    // adds is another tab, so it belongs with them — across the bar it read as an unrelated
    // toolbar button.
    <div className="flex items-end gap-3 flex-wrap border-b border-slate-200 dark:border-slate-700">
      <div role="tablist" aria-label={ariaLabel} onKeyDown={handleKey} className="flex items-end gap-1 flex-wrap">
        {items.map(t => {
          const active = t.id === activeId
          return (
            <button
              key={t.id}
              id={`${idPrefix}-tab-${t.id}`}
              role="tab"
              aria-selected={active}
              aria-controls={`${idPrefix}-panel-${t.id}`}
              tabIndex={active ? 0 : -1}
              ref={el => { tabRefs.current[t.id] = el }}
              onClick={() => onSelect(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-t-xl border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-[#0047ab] dark:border-blue-400 bg-blue-50/60 dark:bg-blue-900/20'
                  : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <div className="text-left min-w-0">
                <span className={`block text-xs font-bold leading-tight ${
                  active ? 'text-[#0047ab] dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
                }`}>
                  {t.label}
                </span>
                {showMeta && (
                  <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate max-w-[9rem] leading-tight">
                    {t.subtitle || 'Not on file'}
                  </span>
                )}
              </div>
              {!showMeta ? null : t.pill !== undefined && t.pill !== null ? (
                t.pill
              ) : t.count > 0 ? (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                  active
                    ? 'bg-[#0047ab] text-white dark:bg-blue-400 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {t.count}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 flex-shrink-0">None</span>
              )}
            </button>
          )
        })}
      </div>
      {actions}
    </div>
  )
}
