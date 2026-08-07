import { useMemo, useState } from 'react'
import { Columns3, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// Sorting and column visibility for the register tables. Both were wanted on Customers and on
// Loan Applications at once, so they live here rather than being written twice — see the
// accounting tables for the column-definition shape this follows.
//
// A column is: { id, label, align?, cellClass?, headClass?, sortable?, sortValue?, render(row) }
// `sortValue` returns what the column sorts on, which is rarely what it renders: a date column
// shows "04/08/2026" and sorts on the ISO string behind it, an amount shows a formatted currency
// string and sorts on the number.

// Pass `value` + `onChange` to keep the choice somewhere that outlives this component — the
// reducer, which persists it. Without that the state dies with the page and a column hidden on
// purpose comes back on the next visit. Omit both for a table whose columns needn't be
// remembered and the hook keeps the ids locally.
export function useTableColumns(columns, { hidden = [], value = null, onChange = null } = {}) {
  const controlled = !!onChange
  const [localIds, setLocalIds] = useState(() => columns.filter(c => !hidden.includes(c.id)).map(c => c.id))

  // A stored list can name columns this table no longer has (renamed or dropped since it was
  // saved), so it is filtered against the live definitions; if nothing survives, fall back to
  // showing everything rather than rendering a table with no columns.
  const storedIds = useMemo(() => {
    if (!controlled || !Array.isArray(value)) return null
    const kept = value.filter(id => columns.some(c => c.id === id))
    return kept.length ? kept : null
  }, [controlled, value, columns])

  const visibleIds = controlled
    ? (storedIds || columns.filter(c => !hidden.includes(c.id)).map(c => c.id))
    : localIds

  // Re-derived from the column list rather than stored as objects, so a toggled column comes
  // back in its declared position instead of at the end of the row.
  const visible = useMemo(() => columns.filter(c => visibleIds.includes(c.id)), [columns, visibleIds])

  function toggle(id) {
    const next = visibleIds.includes(id)
      ? visibleIds.filter(x => x !== id)
      : columns.filter(c => visibleIds.includes(c.id) || c.id === id).map(c => c.id)
    if (controlled) onChange(next)
    else setLocalIds(next)
  }

  return { visible, visibleIds, toggle }
}

// `iconOnly` drops the text label for placement in a toolbar beside other icon-sized controls.
// The button keeps its accessible name via aria-label — an icon alone announces as nothing.
export function ColumnPicker({ columns, visibleIds, onToggle, label = 'View', iconOnly = false }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={iconOnly ? 'Show or hide columns' : undefined}
        title={iconOnly ? 'Show or hide columns' : undefined}
        className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-shrink-0 ${
          iconOnly ? 'px-2.5' : 'px-3'
        }`}
      >
        <Columns3 className="w-3.5 h-3.5" />
        {!iconOnly && label}
      </button>
      {open && (
        <>
          {/* Catches the outside click. Sits under the panel but over everything else. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2 max-h-72 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
            {columns.map(col => {
              const shown = visibleIds.includes(col.id)
              // The last visible column cannot be hidden — an empty table has no rows to read
              // and no header to bring one back from.
              const lastOne = shown && visibleIds.length === 1
              return (
                <label
                  key={col.id}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${
                    lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={shown}
                    disabled={lastOne}
                    onChange={() => onToggle(col.id)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40"
                  />
                  {col.label}
                </label>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function useTableSort(initial = null) {
  const [sort, setSort] = useState(initial)
  // Three states per column: ascending, descending, then back to the table's natural order.
  // Without the third the operator can never get back to the order the register was built in.
  function toggleSort(id) {
    setSort(s => (!s || s.id !== id
      ? { id, dir: 'asc' }
      : s.dir === 'asc' ? { id, dir: 'desc' } : null))
  }
  return { sort, toggleSort, setSort }
}

// Sorted copy of the rows. Call this on the FILTERED set, before paginating — sorting a single
// page would only reorder the rows already on screen and leave the register unsorted.
export function sortRows(rows, columns, sort) {
  if (!sort) return rows
  const col = columns.find(c => c.id === sort.id)
  if (!col) return rows
  const valueOf = col.sortValue || (row => row[col.id])
  const dir = sort.dir === 'desc' ? -1 : 1

  return [...rows].sort((a, b) => {
    const va = valueOf(a)
    const vb = valueOf(b)
    // Blanks sort last in both directions. Flipping them to the top on a descending sort would
    // bury the rows that actually carry the value being looked for.
    const aEmpty = va === null || va === undefined || va === ''
    const bEmpty = vb === null || vb === undefined || vb === ''
    if (aEmpty && bEmpty) return 0
    if (aEmpty) return 1
    if (bEmpty) return -1
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    // Numeric collation so AC-L-000009 sorts before AC-L-000010 rather than after it.
    return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir
  })
}

// A sortable header cell's inner button. Non-sortable columns render their label as plain text,
// so nothing invites a click that would do nothing.
export function SortHeader({ column, sort, onSort, children }) {
  if (!column.sortable) return children
  const active = sort?.id === column.id
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={() => onSort(column.id)}
      title={`Sort by ${column.label}`}
      className={`inline-flex items-center gap-1 uppercase tracking-wide font-semibold transition-colors ${
        active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {children}
      <Icon className={`w-3 h-3 flex-shrink-0 ${active ? '' : 'opacity-40'}`} aria-hidden="true" />
    </button>
  )
}

// What a sorted column reports to assistive tech, mirroring the arrow shown beside it.
export function ariaSortFor(column, sort) {
  if (!column.sortable || sort?.id !== column.id) return undefined
  return sort.dir === 'asc' ? 'ascending' : 'descending'
}
