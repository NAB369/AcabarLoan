import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const fieldCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500'
const fieldLabelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1'

function todayStr() { return new Date().toISOString().split('T')[0] }

function ModalShell({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-lg'}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-auto w-auto p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-transparent">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

// The next readable journal number, continuing the JE-000001 series the seeded entries use.
// Auto-generated numbers used to be `JE-${Date.now()}`, so an install may hold a 13-digit epoch
// in that field — those are ignored when finding the highest, or one of them would push the
// whole series into the trillions and every number after it would be unreadable.
const MAX_SANE_SEQUENCE = 999999
export function nextJournalNo(entries) {
  const highest = (entries || []).reduce((max, entry) => {
    const match = /^JE-(\d+)$/.exec(entry?.transactionNo || '')
    if (!match) return max
    const value = parseInt(match[1], 10)
    return value <= MAX_SANE_SEQUENCE ? Math.max(max, value) : max
  }, 0)
  return `JE-${String(highest + 1).padStart(6, '0')}`
}

// ─── Journal Entry: balanced multi-line debit/credit posting ─────────────────
export function JournalEntryModal({ accounts, entries = [], onClose, onSubmit }) {
  const [date, setDate] = useState(todayStr())
  const [memo, setMemo] = useState('')
  // Proposed rather than fixed: the number is what the entry is referred to afterwards, and an
  // office running its own numbering has to be able to type theirs in.
  const [transactionNo, setTransactionNo] = useState(() => nextJournalNo(entries))
  // The reference this posting came in on — a bank advice, a voucher, an invoice. Free text
  // because it belongs to whoever issued it, not to this system.
  const [trnRef, setTrnRef] = useState('')
  const [rows, setRows] = useState([
    { accountCode: accounts[0]?.code || '', debit: '', credit: '' },
    { accountCode: accounts[1]?.code || accounts[0]?.code || '', debit: '', credit: '' },
  ])
  const [error, setError] = useState('')

  const totalDebit = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0)
  const totalCredit = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0)

  function setRow(i, patch) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function addRow() {
    setRows(rs => [...rs, { accountCode: accounts[0]?.code || '', debit: '', credit: '' }])
  }
  function removeRow(i) {
    setRows(rs => rs.filter((_, idx) => idx !== i))
  }

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const txnNo = transactionNo.trim()
    if (!txnNo) { setError('Enter a transaction number.'); return }
    // The number is what every later reference to this entry resolves on, so two entries
    // carrying the same one would make the trail ambiguous.
    if ((entries || []).some(x => (x?.transactionNo || '').trim().toLowerCase() === txnNo.toLowerCase())) {
      setError(`Transaction number ${txnNo} is already used by another entry.`)
      return
    }
    const lines = rows.filter(r => r.accountCode && ((Number(r.debit) || 0) > 0 || (Number(r.credit) || 0) > 0))
    if (lines.length < 2) { setError('Add at least two lines.'); return }
    if (totalDebit <= 0 || totalDebit !== totalCredit) { setError('Total debits must equal total credits and be greater than zero.'); return }
    onSubmit({
      id: `je-${Date.now()}`,
      entryType: 'Journal Entry',
      date,
      transactionNo: txnNo,
      trnRef: trnRef.trim(),
      memo,
      // Taken from the lines, never typed: the entry's amount IS its balanced total, and a
      // figure entered separately could disagree with the postings underneath it.
      amount: totalDebit,
      lines: lines.map(r => ({ accountCode: r.accountCode, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0, memo })),
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <ModalShell title="New Journal Entry" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className={fieldLabelCls} htmlFor="je-txn-no">Transaction No *</Label>
            <Input
              id="je-txn-no" required value={transactionNo}
              onChange={e => setTransactionNo(e.target.value)}
              placeholder="JE-000001"
              className={`${fieldCls} font-mono`}
            />
          </div>
          <div>
            <Label className={fieldLabelCls} htmlFor="je-trn-ref">Trn Ref #</Label>
            <Input
              id="je-trn-ref" value={trnRef}
              onChange={e => setTrnRef(e.target.value)}
              placeholder="Bank advice / voucher no."
              className={`${fieldCls} font-mono`}
            />
          </div>
          <div>
            <Label className={fieldLabelCls} htmlFor="je-date">Date</Label>
            <Input id="je-date" type="date" value={date} onChange={e => setDate(e.target.value)} className={fieldCls} />
          </div>
        </div>

        <div>
          <Label className={fieldLabelCls} htmlFor="je-memo">Memo</Label>
          <Input id="je-memo" value={memo} onChange={e => setMemo(e.target.value)} placeholder="Optional description" className={fieldCls} />
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_100px_100px_28px] gap-2 items-center">
              <select value={r.accountCode} onChange={e => setRow(i, { accountCode: e.target.value })} className={`col-span-2 sm:col-span-1 ${fieldCls}`}>
                {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
              <Input type="number" min="0" step="0.01" placeholder="Debit" value={r.debit} onChange={e => setRow(i, { debit: e.target.value, credit: '' })} className={fieldCls} />
              <Input type="number" min="0" step="0.01" placeholder="Credit" value={r.credit} onChange={e => setRow(i, { credit: e.target.value, debit: '' })} className={fieldCls} />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)} disabled={rows.length <= 2} className="col-span-2 sm:col-span-1 justify-self-end h-auto w-auto p-1.5 text-slate-400 hover:text-rose-600 hover:bg-transparent disabled:opacity-30 disabled:cursor-not-allowed">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={addRow} className="h-auto p-0 flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-transparent">
            Add line
          </Button>
        </div>

        <div className="flex items-center justify-end gap-6 text-xs font-semibold text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3 flex-wrap">
          <span>Total Debit: <span className={totalDebit !== totalCredit ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}>{totalDebit.toFixed(2)}</span></span>
          <span>Total Credit: <span className={totalDebit !== totalCredit ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}>{totalCredit.toFixed(2)}</span></span>
          {/* Shown, not entered — the entry's amount is its balanced total, so it reads off the
              lines and only settles once the two sides agree. */}
          <span className="border-l border-slate-200 dark:border-slate-600 pl-6">
            Transaction Amount:{' '}
            <span className={totalDebit !== totalCredit || totalDebit <= 0 ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}>
              {totalDebit === totalCredit && totalDebit > 0 ? totalDebit.toFixed(2) : '—'}
            </span>
          </span>
        </div>

        {error && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl py-2.5 h-auto text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700">
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-700 rounded-xl py-2.5 h-auto text-sm font-bold">
            Save Entry
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Single Entry: one-line debit or credit adjustment ───────────────────────
export function SingleEntryModal({ accounts, onClose, onSubmit }) {
  const [form, setForm] = useState({
    accountCode: accounts[0]?.code || '',
    entryType: 'Debit',
    amount: '',
    date: todayStr(),
    memo: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amount = Number(form.amount)
    if (!form.accountCode) { setError('Select an account.'); return }
    if (!amount || amount <= 0) { setError('Enter an amount greater than zero.'); return }
    onSubmit({ accountCode: form.accountCode, entryType: form.entryType, amount, date: form.date, memo: form.memo })
  }

  return (
    <ModalShell title="Make Single Entry" onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
        <div>
          <Label className={fieldLabelCls}>Account</Label>
          <select value={form.accountCode} onChange={e => set('accountCode', e.target.value)} className={fieldCls}>
            {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className={fieldLabelCls}>Type</Label>
            <select value={form.entryType} onChange={e => set('entryType', e.target.value)} className={fieldCls}>
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
            </select>
          </div>
          <div>
            <Label className={fieldLabelCls}>Amount</Label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} className={fieldCls} />
          </div>
        </div>
        <div>
          <Label className={fieldLabelCls}>Date</Label>
          <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={fieldCls} />
        </div>
        <div>
          <Label className={fieldLabelCls}>Memo</Label>
          <Textarea rows={2} value={form.memo} onChange={e => set('memo', e.target.value)} placeholder="Optional notes..." className={`${fieldCls} resize-none`} />
        </div>

        {error && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl py-2.5 h-auto text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700">
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-700 rounded-xl py-2.5 h-auto text-sm font-bold">
            Save Entry
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Sales Invoice: books income against a customer, no bank account yet ─────
export function SalesInvoiceModal({ customers, onClose, onSubmit }) {
  const [form, setForm] = useState({
    customerCode: customers[0]?.code || '',
    amount: '',
    date: todayStr(),
    description: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { setError('Enter an amount greater than zero.'); return }
    const customer = customers.find(c => c.code === form.customerCode)
    onSubmit({
      customerCode: form.customerCode,
      customerName: customer?.enName || '',
      amount,
      date: form.date,
      description: form.description,
    })
  }

  return (
    <ModalShell title="New Sales Invoice" onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
        <div>
          <Label className={fieldLabelCls}>Customer</Label>
          <select value={form.customerCode} onChange={e => set('customerCode', e.target.value)} className={fieldCls}>
            {customers.length === 0
              ? <option value="">No customers available</option>
              : customers.map(c => <option key={c.code} value={c.code}>{c.code} — {c.enName}</option>)
            }
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className={fieldLabelCls}>Amount</Label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} className={fieldCls} />
          </div>
          <div>
            <Label className={fieldLabelCls}>Date</Label>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={fieldCls} />
          </div>
        </div>
        <div>
          <Label className={fieldLabelCls}>Description</Label>
          <Textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What's being invoiced..." className={`${fieldCls} resize-none`} />
        </div>

        {error && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl py-2.5 h-auto text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700">
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 rounded-xl py-2.5 h-auto text-sm font-bold">
            Save Invoice
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── Enter Bill: books a pending-approval expense against a GL account ───────
export function EnterBillModal({ accounts, onClose, onSubmit }) {
  const expenseAccounts = accounts.filter(a => a.type === 'Expense')
  const [form, setForm] = useState({
    account: expenseAccounts[0]?.code || accounts[0]?.code || '',
    category: '',
    amount: '',
    date: todayStr(),
    description: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const amount = Number(form.amount)
    if (!form.account) { setError('Select an account.'); return }
    if (!amount || amount <= 0) { setError('Enter an amount greater than zero.'); return }
    onSubmit({
      account: form.account,
      category: form.category || 'Bill',
      amount,
      date: form.date,
      description: form.description,
    })
  }

  return (
    <ModalShell title="Enter Bill" onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
        <div>
          <Label className={fieldLabelCls}>Account</Label>
          <select value={form.account} onChange={e => set('account', e.target.value)} className={fieldCls}>
            {(expenseAccounts.length ? expenseAccounts : accounts).map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
          </select>
        </div>
        <div>
          <Label className={fieldLabelCls}>Vendor / Category</Label>
          <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Office Supplies Ltd." className={fieldCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className={fieldLabelCls}>Amount</Label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} className={fieldCls} />
          </div>
          <div>
            <Label className={fieldLabelCls}>Date</Label>
            <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className={fieldCls} />
          </div>
        </div>
        <div>
          <Label className={fieldLabelCls}>Description</Label>
          <Textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional notes..." className={`${fieldCls} resize-none`} />
        </div>

        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          This bill will be submitted as <strong>Pending Approval</strong> — funds only leave the account once approved.
        </p>

        {error && <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl py-2.5 h-auto text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700">
            Cancel
          </Button>
          <Button type="submit" className="flex-1 bg-rose-600 hover:bg-rose-700 rounded-xl py-2.5 h-auto text-sm font-bold">
            Save Bill
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
