// A data table, read on a phone. Below md a table either scrolls sideways — which hides the
// columns that make a row mean anything — or shrinks its text until it can't be read; this
// stacks the same rows as cards instead, one card per record, every column kept as a labelled
// line. Above md it is display:none and the real table takes over, so the desktop and tablet
// views are untouched.
//
// Driven by the same `columns` array the table renders from, so the two can never drift: hide
// a column with the column picker and it leaves both. `renderCell` is the call site's own cell
// renderer (usually `col.render(row, …)`), which is what keeps this from needing to know
// anything about the data.
//
// Used by the ledger tables in AccountingPage and by every report (see ReportTable). The
// hand-built card lists in LoanList and CustomerTable predate it and carry summaries chosen by
// hand rather than a column list — they are deliberately not routed through here.
export default function MobileCardList({
  columns,
  rows,
  renderCell,
  rowKey,
  emptyMessage = 'Nothing to show.',
  footer,
  className = '',
}) {
  return (
    <div className={`md:hidden print:hidden overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 ${className}`}>
      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-slate-400 dark:text-slate-500">{emptyMessage}</p>
      ) : rows.map((row, i) => (
        <div key={rowKey ? rowKey(row, i) : i} className="px-4 py-3 space-y-1.5">
          {columns.map((col, ci) => {
            const id = col.id ?? col.key
            const value = renderCell(col, row, i)
            // The first column leads the card as its heading rather than as another
            // label/value line: it is what the row is keyed by — a reference, a code, a
            // date — and it is what the reader scans the stack for.
            return ci === 0 ? (
              <div key={id} className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {value}
              </div>
            ) : (
              <div key={id} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">{col.label}</span>
                <span className="min-w-0 text-right text-slate-600 dark:text-slate-300">{value}</span>
              </div>
            )
          })}
        </div>
      ))}
      {/* The table's totals row, restated for the stack. Only with rows above it — a total
          under an empty list is a figure for nothing. */}
      {footer && rows.length > 0 && (
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-t-2 border-slate-200 dark:border-slate-600">
          {footer}
        </div>
      )}
    </div>
  )
}

// The one shape a totals footer takes, so every card list ends the same way as every other.
export function MobileCardTotal({ label = 'Total', value, valueClass = 'text-slate-700 dark:text-slate-200' }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="font-bold text-slate-700 dark:text-slate-200">{label}</span>
      <span className={`text-right font-bold ${valueClass}`}>{value}</span>
    </div>
  )
}
