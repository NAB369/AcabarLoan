import { Pencil, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Pagination from '../shared/Pagination'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

function formatDateDMY(isoStr) {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function shortAddress(addr) {
  if (!addr) return '—'
  if (typeof addr === 'string') return addr || '—'
  return [addr.district, addr.province].filter(Boolean).join(', ') || '—'
}

export default function CustomerTable() {
  const { state, dispatch } = useApp()
  const { customers, customerSearch, customerDateFilter, customerPage, customerPageSize } = state

  const q = customerSearch.trim().toLowerCase()

  const filtered = customers.filter(c => {
    const matchesSearch = !q || (
      c.code.toLowerCase().includes(q) ||
      (c.enName || '').toLowerCase().includes(q) ||
      (c.khName || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.idNo || '').toLowerCase().includes(q)
    )
    const created = c.createdAt ? c.createdAt.slice(0, 10) : ''
    const matchesDate = !customerDateFilter || created === customerDateFilter
    return matchesSearch && matchesDate
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / customerPageSize))
  const safePage = Math.min(customerPage, totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * customerPageSize + 1
  const to = Math.min(safePage * customerPageSize, total)
  const rows = filtered.slice((safePage - 1) * customerPageSize, safePage * customerPageSize)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="hidden md:block overflow-x-auto min-h-[60vh] max-h-[60vh] overflow-y-auto">
        <Table className="w-full text-xs">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">CID</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Name</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Gender</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Date of Birth</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">National ID</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Phone Number</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Email</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Address</TableHead>
              <TableHead className="h-auto text-left px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Created Date</TableHead>
              <TableHead className="h-auto text-center px-4 py-3 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <TableRow className="border-0 hover:bg-transparent">
                <TableCell colSpan={10} className="text-center py-16 text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20H7a2 2 0 01-2-2V7a2 2 0 012-2h3m4 0h3a2 2 0 012 2v3M9 12h6m-3-3v6" />
                    </svg>
                    <span className="text-sm font-medium">No customers found</span>
                    <span className="text-xs">Try adjusting your search or filter.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.map(c => (
              <TableRow
                key={c.code}
                onClick={() => dispatch({ type: 'OPEN_CUSTOMER_PREVIEW', code: c.code })}
                className="border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors group"
              >
                <TableCell className="px-4 py-3 font-mono font-semibold text-brand-600 dark:text-brand-400 whitespace-nowrap">
                  {c.code}
                </TableCell>
                <TableCell className="px-4 py-3 whitespace-nowrap">
                  <p className="font-bold text-slate-800 dark:text-slate-100">{c.enName}</p>
                  <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">{c.khName}</p>
                </TableCell>
                <TableCell className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.gender || '—'}</TableCell>
                <TableCell className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateDMY(c.dob)}</TableCell>
                <TableCell className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.idNo}</TableCell>
                <TableCell className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.phone}</TableCell>
                <TableCell className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{c.email}</TableCell>
                <TableCell className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{shortAddress(c.currentAddress)}</TableCell>
                <TableCell className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateDMY(c.createdAt)}</TableCell>
                <TableCell className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      variant="ghost"
                      title="Edit Customer"
                      onClick={() => dispatch({ type: 'OPEN_CUSTOMER_WIZARD', code: c.code })}
                      className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:hover:text-amber-400 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      title="Delete Customer"
                      onClick={() => dispatch({ type: 'CONFIRM_DELETE_CUSTOMER', code: c.code })}
                      className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden min-h-[60vh] max-h-[60vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400 dark:text-slate-500">
            <svg className="w-10 h-10 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20H7a2 2 0 01-2-2V7a2 2 0 012-2h3m4 0h3a2 2 0 012 2v3M9 12h6m-3-3v6" />
            </svg>
            <span className="text-sm font-medium">No customers found</span>
            <span className="text-xs">Try adjusting your search or filter.</span>
          </div>
        ) : rows.map(c => (
          <div
            key={c.code}
            onClick={() => dispatch({ type: 'OPEN_CUSTOMER_PREVIEW', code: c.code })}
            className="p-4 active:bg-slate-50 dark:active:bg-slate-700/40 cursor-pointer transition-colors space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-brand-600 dark:text-brand-400 text-xs">{c.code}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{c.gender || '—'}</span>
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{c.enName}</p>
              <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">{c.khName}</p>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{c.idNo}</span>
              <span>{c.phone}</span>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{c.email}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{shortAddress(c.currentAddress)}</div>
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>DOB: {formatDateDMY(c.dob)}</span>
              <span>Created: {formatDateDMY(c.createdAt)}</span>
            </div>
            <div className="flex items-center justify-end gap-1 pt-1" onClick={e => e.stopPropagation()}>
              <Button
                variant="ghost"
                title="Edit Customer"
                onClick={() => dispatch({ type: 'OPEN_CUSTOMER_WIZARD', code: c.code })}
                className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 dark:hover:text-amber-400 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                title="Delete Customer"
                onClick={() => dispatch({ type: 'CONFIRM_DELETE_CUSTOMER', code: c.code })}
                className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 dark:hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            from={from}
            to={to}
            total={total}
            onPage={p => dispatch({ type: 'SET_CUSTOMER_PAGE', page: p })}
          />
        </div>
      )}
    </div>
  )
}
