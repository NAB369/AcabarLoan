import { Button } from '@/components/ui/button'

export default function Pagination({ page, totalPages, from, to, total, onPage }) {
  if (!total || total <= 0) return null
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
      <span>
        Showing <span className="font-semibold text-slate-700">{from}–{to}</span> of{' '}
        <span className="font-semibold text-slate-700">{total}</span> records
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded-lg font-semibold"
        >
          Prev
        </Button>
        <span className="px-3 py-1.5 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded-lg">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg font-semibold"
        >
          Next
        </Button>
      </div>
    </div>
  )
}
