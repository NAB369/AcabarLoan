import { useState, useMemo, useEffect } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  TrendingUp, TrendingDown,
  Plus, X, ArrowRightLeft, Wallet,
  FileText, ChevronDown,
  Banknote, Users, Zap, Receipt, ArrowUpCircle, ArrowDownCircle, HandCoins, Landmark, ChevronRight, ChevronLeft,
  Settings, Pencil, Search, Eye, LayoutDashboard, BookOpen, Check, CheckCheck, Trash2, History,
  Download, Columns3, ExternalLink, CornerDownRight,
} from 'lucide-react'
import { useApp, canFundExpense, expenseFundingAccount } from '../../context/AppContext'
import { formatVal } from '../../utils/format'
import { BRANCHES } from '../../data/constants'
import StatusBadge from '../shared/StatusBadge'
import {
  JournalEntryModal, SingleEntryModal
} from './AccountingForms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import EmployeeInformation from '../payroll/EmployeeInformation'
import PayrollRunModal from '../payroll/PayrollRunModal'
import { periodLabel } from '../../utils/employee'

// ─── helpers ──────────────────────────────────────────────────────────────────
const INCOME_CATEGORIES = [
  'Interest Income', 'Repayment Fee Income', 'Penalty Fee',
  'Recovery Income', 'Other Income',
]
const EXPENSE_CATEGORIES = [
  'Employment Salaries', 'Office Administration', 'Tax & Regulation',
  'Provision Expense', 'Write-Off', 'Operating',
]

// 'HH:MM:SS' (24-hour, as stored) shown as '08:50 PM'. The stored value is kept for
// sorting — a 12-hour string does not sort chronologically.
function to12Hour(hms) {
  const [h, m] = (hms || '').split(':')
  if (h == null || m == null) return ''
  const hour = Number(h)
  if (Number.isNaN(hour)) return ''
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${String(hour12).padStart(2, '0')}:${m} ${suffix}`
}

// A record's stamp split into the two columns the audit tables print. Date and time are
// separate columns, so they are kept apart from the start: `time` stays 24-hour for sorting,
// `timeLabel` is what the column shows. A record that carries only a date (an income entry,
// a transfer, a posting dated to a month end) has no time to show.
function auditAt(dateOrStamp, time = '') {
  return { date: (dateOrStamp || '').slice(0, 10), time, timeLabel: to12Hour(time) }
}

// Newest first, on date then time — a row with no time sorts after the timed ones of the
// same day rather than jumping to the top of it.
function byNewest(a, b) {
  return (b.date || '').localeCompare(a.date || '') || (b.time || '').localeCompare(a.time || '')
}

// Stored codes are shouted (DEBIT, ACTIVE, ASSET); the tables show them as words.
function sentenceCase(value) {
  const text = (value || '').toString()
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : text
}

function pad(n) { return String(n).padStart(3, '0') }
function todayStr() { return new Date().toISOString().split('T')[0] }
function randRef(prefix, len = 6) {
  return `${prefix}-${String(Math.floor(Math.random() * Math.pow(10, len))).padStart(len, '0')}`
}

// ─── sub-components ──────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const colors = {
    Income: 'bg-emerald-50 text-emerald-700 border-emerald-200/50 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    Expense: 'bg-rose-50 text-rose-700 border-rose-200/50 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
    Transfer: 'bg-brand-50 text-brand-700 border-brand-200/50 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-800',
    // The loan book's two control accounts, in the amber the Loan Account Management
    // card carries so a ledger row reads back to where it came from.
    Payable: 'bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    Receivable: 'bg-indigo-50 text-indigo-700 border-indigo-200/50 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800',
  }
  const cls = colors[type] || 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${cls}`}>{type}</span>
  )
}

function EmptyState({ message }) {
  return (
    <tr>
      <td colSpan={99} className="py-12 text-center text-sm text-slate-400">
        {message}
      </td>
    </tr>
  )
}

// ─── Modal: Bank Account ─────────────────────────────────────────────────────
function BankAccountModal({ account, chartOfAccounts, onClose, onSubmit, onDelete }) {
  const [form, setForm] = useState({
    name: account?.name || '',
    currency: account?.currency || 'USD',
    number: account?.number || '',
    glCode: account?.glCode || chartOfAccounts[0]?.code || '',
    group: account?.group || DEFAULT_BANK_GROUP,
    branch: account?.branch || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name || !form.number || !form.glCode) return
    onSubmit({
      id: account?.id || Date.now().toString(),
      group: form.group,
      name: form.name,
      currency: form.currency,
      number: form.number,
      glCode: form.glCode,
      branch: form.branch,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{account ? 'Edit Bank Account' : 'Add Bank Account'}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-auto w-auto p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-transparent">
            <X className="w-5 h-5" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div>
            <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Bank Name</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. ABA Bank" className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Currency</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} required className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
              </select>
            </div>
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Account No</Label>
              <Input value={form.number} onChange={e => set('number', e.target.value)} required placeholder={form.currency === 'KHR' ? 'e.g. 000111333' : 'e.g. 000111222'} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Account Group</Label>
            <select value={form.group} onChange={e => set('group', e.target.value)} required className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
              {BANK_CARD_GROUPS.map(g => (
                <option key={g.id} value={g.id}>{g.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Branch</Label>
            <select value={form.branch} onChange={e => set('branch', e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All Branches (shared)</option>
              {BRANCHES.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Leave as "All Branches" for a shared account every branch without its own falls back to.</p>
          </div>
          <div>
            <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Linked GL ({form.currency})</Label>
            <select value={form.glCode} onChange={e => set('glCode', e.target.value)} required className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
              {chartOfAccounts.filter(a => !a.parentCode).map(a => (
                <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            {account && (
              <Button type="button" variant="outline" onClick={() => onDelete(account.id)} className="border-rose-200 text-rose-600 rounded-xl px-4 py-2 h-auto text-sm font-semibold hover:bg-rose-50">
                Delete
              </Button>
            )}
            <Button type="submit" className="flex-1 bg-brand-600 hover:bg-brand-700 rounded-xl py-2 h-auto text-sm font-bold">
              Save Account
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Transaction (Income / Expense) ───────────────────────────────────
function TransactionModal({ type, count, accounts, realBankAccounts, onClose, onSubmit }) {
  const isIncome = type === 'Income'
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const prefix = isIncome ? 'INC' : 'EXP'
  const autoCode = `${prefix}-${pad(count + 1)}`

  const [form, setForm] = useState({
    category: categories[0],
    code: autoCode,
    amount: '',
    date: todayStr(),
    description: '',
    account: realBankAccounts?.[0]?.glCode || accounts[0]?.code || '',
    source: '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || isNaN(Number(form.amount))) return
    if (!form.account) return
    onSubmit({
      category: form.category,
      code: form.code,
      amount: Number(form.amount),
      date: form.date,
      description: form.description,
      account: form.account,
      ...(isIncome ? { source: form.source } : {}),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Record New {type} Entry
          </h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-auto w-auto p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-transparent">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Sub-Category
              </Label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Trn No
              </Label>
              <Input
                value={form.code}
                onChange={e => set('code', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Amount (USD)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                required
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Date
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          {isIncome ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Bank Account (handles this income)
                </Label>
                <select
                  value={form.account}
                  onChange={e => set('account', e.target.value)}
                  required
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {(!realBankAccounts || realBankAccounts.length === 0) ? (
                    <option value="">No bank accounts available</option>
                  ) : (
                    realBankAccounts.map(acct => (
                      <option key={acct.id} value={acct.glCode}>
                        {acct.name} · {acct.currency} GL ({acct.glCode}) - A/C: {acct.number || 'None'}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Source (where it came from)
                </Label>
                <Input
                  value={form.source}
                  onChange={e => set('source', e.target.value)}
                  placeholder="e.g. Borrower repayment"
                  className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Bank Account (money will go out from)
              </Label>
              <select
                value={form.account}
                onChange={e => set('account', e.target.value)}
                required
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {(!realBankAccounts || realBankAccounts.length === 0) ? (
                  <option value="">No bank accounts available</option>
                ) : (
                  realBankAccounts.map(acct => (
                    <option key={acct.id} value={acct.glCode}>
                      {acct.name} · {acct.currency} GL ({acct.glCode}) - A/C: {acct.number || 'None'}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
          <div>
            <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Description
            </Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Optional notes..."
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
          {!isIncome && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-2">
              This expense will be submitted as <strong>Pending Approval</strong> — funds only leave the account once approved.
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl py-2.5 h-auto text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className={`flex-1 rounded-xl py-2.5 h-auto text-sm font-bold text-white ${
                isIncome ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              Save {type}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Cash Transfer ─────────────────────────────────────────────────────
function CashTransferModal({ accounts, onClose, onSubmit }) {
  const [form, setForm] = useState({
    fromCode: accounts[0]?.code || '',
    toCode: accounts[1]?.code || accounts[0]?.code || '',
    date: todayStr(),
    ref: randRef('CT'),
    amount: '',
    description: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    const from = accounts.find(a => a.code === form.fromCode)
    const to = accounts.find(a => a.code === form.toCode)
    if (!from || !to || from.code === to.code) return
    onSubmit({
      ref: form.ref,
      date: form.date,
      fromCode: from.code,
      fromName: from.name,
      toCode: to.code,
      toName: to.name,
      amount: Number(form.amount),
      description: form.description,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">New Cash Transfer</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-auto w-auto p-0 text-slate-400 hover:text-slate-600 hover:bg-transparent"><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">From Account</label>
              <select value={form.fromCode} onChange={e => set('fromCode', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">To Account</label>
              <select value={form.toCode} onChange={e => set('toCode', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Date</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Trn No</Label>
              <Input value={form.ref} onChange={e => set('ref', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-mono bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Amount (USD)</Label>
            <Input type="number" min="0" step="0.01" placeholder="0.00" required value={form.amount} onChange={e => set('amount', e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Description</Label>
            <Textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional..."
              className="w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}
              className="flex-1 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-xl py-2.5 h-auto text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700">
              Cancel
            </Button>
            <Button type="submit"
              className="flex-1 bg-brand-600 hover:bg-brand-700 rounded-xl py-2.5 h-auto text-sm font-bold">
              Submit Transfer
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Sub-account display metadata (fixed set — not user-creatable) ───────────
const ACCOUNT_ICONS = {
  'ACC-MAIN': Landmark,
  'ACC-LOAN': Banknote,
  'ACC-REPAYMENT': HandCoins,
  'ACC-PAYROLL': Users,
  'ACC-UTILITY': Zap,
  'ACC-EXPENSE': Receipt,
}

// ─── Modal: Account Transaction History ──────────────────────────────────────
function AccountHistoryModal({ account, transactions, currency, onClose }) {
  const totalIn = transactions.filter(t => t.txType !== 'Expense').reduce((s, t) => s + (t.amount || 0), 0)
  const totalOut = transactions.filter(t => t.txType === 'Expense').reduce((s, t) => s + (t.amount || 0), 0)
  const Icon = ACCOUNT_ICONS[account.code] || Wallet

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{account.name}</h2>
              <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{account.code}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} className="h-auto w-auto p-0 text-slate-400 hover:text-slate-600 hover:bg-transparent"><X className="w-4 h-4" /></Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mb-1">Current Balance</p>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatVal(account.balance || 0, currency)}</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">Cash In</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatVal(totalIn, currency)}</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3">
            <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mb-1">Cash Out</p>
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{formatVal(totalOut, currency)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {transactions.length === 0 ? (
            <p className="text-xs text-center text-slate-400 dark:text-slate-500 py-8">No transactions recorded for this account yet.</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((t, i) => {
                const isOut = t.txType === 'Expense'
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                    {isOut ? <ArrowDownCircle className="w-4 h-4 text-rose-500 flex-shrink-0" /> : <ArrowUpCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{t.category || t.description || t.code}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">{t.date} · {t.code}</p>
                    </div>
                    <span className={`text-xs font-bold flex-shrink-0 ${isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {isOut ? '-' : '+'}{formatVal(t.amount, currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
// The page lands on exactly these two cards. Everything general accounting lives
// inside the first one (its sections below); the loan book lives inside the second.
// Each card carries its own accent so the two halves of the module read apart at a
// glance — blue for the company's own books, amber for the loan book.
const CARDS = [
  {
    id: 'general', label: 'General Account Management', icon: Wallet,
    desc: 'Company accounts, banks, transfers and the ledger',
    idle: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    on: 'bg-blue-600 text-white',
    bar: 'bg-blue-600',
    ring: 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/60 dark:bg-blue-900/20 dark:border-blue-500',
    hover: 'hover:border-blue-300 dark:hover:border-blue-900/50',
    title: 'text-blue-700 dark:text-blue-400',
  },
  {
    id: 'loan', label: 'Loan Account Management', icon: Banknote,
    desc: 'Account Payable and Account Receivable',
    idle: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    on: 'bg-amber-500 text-white',
    bar: 'bg-amber-500',
    ring: 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/60 dark:bg-amber-900/20 dark:border-amber-500',
    hover: 'hover:border-amber-300 dark:hover:border-amber-900/50',
    title: 'text-amber-700 dark:text-amber-500',
  },
  {
    id: 'payroll', label: 'Payroll Management', icon: Users,
    desc: 'Employee register, payroll account and salary payments',
    idle: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    on: 'bg-purple-600 text-white',
    bar: 'bg-purple-600',
    ring: 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/60 dark:bg-purple-900/20 dark:border-purple-500',
    hover: 'hover:border-purple-300 dark:hover:border-purple-900/50',
    title: 'text-purple-700 dark:text-purple-400',
  },
]

// General Ledger columns. One definition drives the header, the rows, the View menu and
// the PDF export, so hiding a column takes it out of all four at once. `text` is what the
// PDF carries — `render` may return an element, which autoTable cannot print.
const GL_COLUMNS = [
  { id: 'date', label: 'Date', text: e => e.date || '', render: e => e.date },
  { id: 'ref', label: 'Ref', text: e => e.code || '', render: e => e.code, cellClass: 'font-mono text-slate-500 dark:text-slate-400' },
  { id: 'description', label: 'Description', text: e => `${e.category || ''}${e.description ? ` — ${e.description}` : ''}`, render: e => `${e.category || ''}${e.description ? ` — ${e.description}` : ''}`, cellClass: 'text-slate-700 dark:text-slate-200' },
  { id: 'account', label: 'Account', text: e => e.accountLabel || '', render: e => e.accountLabel },
  { id: 'customer', label: 'Customer', text: e => e.customerName || '—', render: e => e.customerName || '—' },
  { id: 'type', label: 'Type', text: e => e.txType || '', render: e => <TypeBadge type={e.txType} /> },
  { id: 'debit', label: 'Debit', right: true, text: (e, fmt) => e.debit > 0 ? fmt(e.debit) : '—', render: (e, fmt) => e.debit > 0 ? fmt(e.debit) : '—', cellClass: 'font-medium text-slate-700 dark:text-slate-200' },
  { id: 'credit', label: 'Credit', right: true, text: (e, fmt) => e.credit > 0 ? fmt(e.credit) : '—', render: (e, fmt) => e.credit > 0 ? fmt(e.credit) : '—', cellClass: 'font-medium text-slate-700 dark:text-slate-200' },
]

// Journal entry columns — same contract as GL_COLUMNS. Entries carry their own amount
// except the older ones, where it is the sum of the debit side.
const JE_COLUMNS = [
  { id: 'date', label: 'Date', text: j => j.date || '', render: j => j.date },
  { id: 'transactionNo', label: 'Transaction No', text: j => j.transactionNo || '', render: j => j.transactionNo, cellClass: 'font-mono text-slate-500 dark:text-slate-400' },
  { id: 'entryType', label: 'Type', text: j => j.entryType || '', render: j => j.entryType || '—' },
  { id: 'memo', label: 'Memo', text: j => j.memo || '—', render: j => j.memo || '—', cellClass: 'text-slate-700 dark:text-slate-200 max-w-[240px] truncate' },
  { id: 'accounts', label: 'Accounts', text: j => j.accountsLabel || '—', render: j => j.accountsLabel || '—' },
  {
    id: 'amount', label: 'Amount', right: true,
    text: (j, fmt) => fmt(j.amount ?? (j.lines || []).reduce((s, l) => s + (l.debit || 0), 0)),
    render: (j, fmt) => fmt(j.amount ?? (j.lines || []).reduce((s, l) => s + (l.debit || 0), 0)),
    cellClass: 'font-bold text-slate-700 dark:text-slate-200',
  },
]

// Income columns.
const INC_COLUMNS = [
  { id: 'date', label: 'Date', text: e => e.date || '', render: e => e.date },
  { id: 'code', label: 'Trn No', text: e => e.code || '', render: e => e.code, cellClass: 'font-mono text-slate-500 dark:text-slate-400' },
  { id: 'category', label: 'Category', text: e => e.category || '', render: e => e.category, cellClass: 'text-slate-700 dark:text-slate-200' },
  { id: 'description', label: 'Description', text: e => e.description || '—', render: e => e.description || '—', cellClass: 'max-w-[240px] truncate' },
  { id: 'account', label: 'Account', text: e => e.accountLabel || '—', render: e => e.accountLabel || '—' },
  { id: 'source', label: 'Source', text: e => e.source || e.customerName || '—', render: e => e.source || e.customerName || '—' },
  {
    id: 'amount', label: 'Amount', right: true,
    text: (e, fmt) => fmt(e.amount || 0),
    render: (e, fmt) => `+${fmt(e.amount || 0)}`,
    cellClass: 'font-bold text-emerald-600 dark:text-emerald-400',
  },
]

// Expense columns. Mirrors the income set, plus the status the approval turns and the
// Approve action that turns it.
const EXP_COLUMNS = [
  { id: 'date', label: 'Date', text: e => e.date || '', render: e => e.date },
  { id: 'code', label: 'Trn No', text: e => e.code || '', render: e => e.code, cellClass: 'font-mono text-slate-500 dark:text-slate-400' },
  { id: 'category', label: 'Category', text: e => e.category || '', render: e => e.category, cellClass: 'text-slate-700 dark:text-slate-200' },
  { id: 'description', label: 'Description', text: e => e.description || '—', render: e => e.description || '—', cellClass: 'max-w-[220px] truncate' },
  { id: 'account', label: 'Account', text: e => e.accountLabel || '—', render: e => e.accountLabel || '—' },
  {
    id: 'amount', label: 'Amount', right: true,
    text: (e, fmt) => fmt(e.amount || 0),
    render: (e, fmt) => `-${fmt(e.amount || 0)}`,
    cellClass: 'font-bold text-rose-600 dark:text-rose-400',
  },
  {
    id: 'status', label: 'Status',
    text: e => e.status || 'Pending Approval',
    render: e => <StatusBadge status={e.status || 'Pending Approval'} size="xs" />,
  },
  {
    id: 'action', label: 'Action',
    text: e => e.status === 'Approved' ? '' : 'Awaiting approval',
    render: (e, fmt, ctx) => e.status === 'Approved'
      ? <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
      : (
        <button
          onClick={() => ctx.onApprove(e.code)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors whitespace-nowrap"
        >
          <Check className="w-3 h-3" /> Approve
        </button>
      ),
  },
]

// Cash transfer columns. A transfer has no type of its own, so the tab's first filter is
// the account it touches on either side.
const CT_COLUMNS = [
  { id: 'date', label: 'Date', text: t => t.date || '', render: t => t.date },
  { id: 'ref', label: 'Ref', text: t => t.ref || '', render: t => t.ref, cellClass: 'font-mono text-slate-500 dark:text-slate-400' },
  { id: 'from', label: 'From', text: t => t.fromName || t.fromCode || '', render: t => t.fromName || t.fromCode, cellClass: 'text-slate-700 dark:text-slate-200' },
  { id: 'to', label: 'To', text: t => t.toName || t.toCode || '', render: t => t.toName || t.toCode, cellClass: 'text-slate-700 dark:text-slate-200' },
  { id: 'description', label: 'Description', text: t => t.description || '—', render: t => t.description || '—', cellClass: 'max-w-[260px] truncate' },
  {
    id: 'amount', label: 'Amount', right: true,
    text: (t, fmt) => fmt(t.amount || 0),
    render: (t, fmt) => fmt(t.amount || 0),
    cellClass: 'font-bold text-brand-600 dark:text-brand-400',
  },
]

// Single entry columns — a single entry has exactly one line, so its account and side
// come straight off it.
const seLine = j => (j.lines || [])[0] || {}
const seSideOf = j => ((seLine(j).debit || 0) > 0 ? 'Debit' : 'Credit')
const SE_COLUMNS = [
  { id: 'date', label: 'Date', text: j => j.date || '', render: j => j.date },
  { id: 'transactionNo', label: 'Transaction No', text: j => j.transactionNo || '', render: j => j.transactionNo, cellClass: 'font-mono text-slate-500 dark:text-slate-400' },
  { id: 'account', label: 'Account', text: j => j.accountsLabel || '—', render: j => j.accountsLabel || '—', cellClass: 'text-slate-700 dark:text-slate-200' },
  { id: 'side', label: 'Side', text: j => seSideOf(j), render: j => seSideOf(j) },
  { id: 'memo', label: 'Memo', text: j => j.memo || '—', render: j => j.memo || '—', cellClass: 'max-w-[240px] truncate' },
  {
    id: 'amount', label: 'Amount', right: true,
    text: (j, fmt) => fmt(j.amount || 0),
    render: (j, fmt) => fmt(j.amount || 0),
    cellClass: 'font-bold text-slate-700 dark:text-slate-200',
  },
]

// Chart of accounts columns — same contract as GL_COLUMNS: one definition drives the
// header, the rows and the View menu. `ctx` carries the row actions.
// An account either heads the chart or hangs off another one (`parentCode`), and the table
// rendered both identically — nothing on a row said which it was, or what a sub-account
// belonged to. The name now carries it at a glance and the Level column states it outright,
// so it survives a column being hidden and lands in the CSV export too.
const isSubAccount = a => !!(a.parentCode || '').trim()

const COA_COLUMNS = [
  { id: 'code', label: 'Code', text: a => a.code || '', render: a => a.code, cellClass: 'font-bold font-mono text-brand-600 dark:text-brand-400' },
  {
    id: 'name', label: 'Account Name',
    text: a => a.name || '',
    // Weight is set here rather than in cellClass because it differs per row: a main account
    // stays bold, a sub-account steps in under it at a lighter weight.
    render: a => isSubAccount(a)
      ? (
        <span className="flex items-center gap-1.5 pl-3 font-medium">
          <CornerDownRight className="w-3 h-3 flex-shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          {a.name}
        </span>
      )
      : <span className="font-bold">{a.name}</span>,
    cellClass: 'text-slate-800 dark:text-slate-100',
  },
  {
    id: 'level', label: 'Level',
    text: a => isSubAccount(a) ? `Sub-account of ${a.parentCode}` : 'Main account',
    // Shape and wording carry the distinction, not colour alone — these print to PDF and are
    // read by people who cannot rely on hue.
    render: a => isSubAccount(a)
      ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <CornerDownRight className="w-2.5 h-2.5 flex-shrink-0" aria-hidden="true" />
          Sub · {a.parentCode}
        </span>
      )
      : (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/30 text-[10px] font-bold text-brand-700 dark:text-brand-300 whitespace-nowrap">
          Main
        </span>
      ),
  },
  { id: 'nameKhmer', label: 'Name (Khmer)', text: a => a.nameKhmer || '—', render: a => a.nameKhmer || '—', cellClass: 'text-slate-500 dark:text-slate-400 font-khmer' },
  {
    id: 'normalBalance', label: 'Normal Balance',
    // Plain text — debit vs credit is a fact about the account, not a status worth
    // colouring, and the badge competed with the Status pill beside it.
    text: a => a.normalBalance ? sentenceCase(a.normalBalance) : '—',
    render: a => a.normalBalance ? sentenceCase(a.normalBalance) : '—',
    cellClass: 'text-slate-600 dark:text-slate-300',
  },
  { id: 'description', label: 'Description', text: a => a.description || '—', render: a => a.description || '—', cellClass: 'text-slate-600 dark:text-slate-300 max-w-[220px] truncate' },
  {
    id: 'status', label: 'Status',
    text: a => sentenceCase(a.status || 'ACTIVE'),
    render: a => <StatusBadge status={sentenceCase(a.status || 'ACTIVE')} size="xs" />,
  },
  {
    id: 'actions', label: 'Actions',
    render: (a, ctx) => (
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={() => ctx.onEdit(a)} title="Edit account" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => ctx.onView(a.code)} title="View transactions" className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded">
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => ctx.onDelete(a)} title="Delete account" className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    ),
  },
]

// Chart of accounts groups, in statement order, each with the band colours its section
// header uses. `typeDisplay` is also the filter value, so NBC's "Revenue" wording and the
// stored `Income` type stay in step.
const COA_TYPE_GROUPS = [
  { type: 'Asset', typeDisplay: 'ASSET', styles: { dot: 'bg-blue-500' } },
  { type: 'Liability', typeDisplay: 'LIABILITY', styles: { dot: 'bg-amber-500' } },
  { type: 'Equity', typeDisplay: 'EQUITY', styles: { dot: 'bg-purple-500' } },
  { type: 'Income', typeDisplay: 'REVENUE', styles: { dot: 'bg-emerald-500' } },
  { type: 'Expense', typeDisplay: 'EXPENSE', styles: { dot: 'bg-rose-500' } },
]

// Payroll has its own card, so its account and salary postings are carved out of the
// general books the same way the loan book is. Legacy sub-account code and GL code both
// count, plus anything a user names as payroll.
const PAYROLL_ACCOUNT_CODES = new Set(['ACC-PAYROLL', '6020', '6021'])
function isPayrollAccount(account) {
  return PAYROLL_ACCOUNT_CODES.has(account.code) || (account.name || '').toLowerCase().includes('payroll')
}
function isPayrollExpense(expense) {
  if (PAYROLL_ACCOUNT_CODES.has(expense.account)) return true
  const category = (expense.category || '').toLowerCase()
  return category.includes('salar') || category.includes('payroll')
}

// Sections of the Account Setting modal, one menu row each. Chart of Accounts is the only
// one so far; adding another means an entry here and its panel in the modal, and the menu,
// the mobile picker and the heading all pick it up. `caption` is the line under the section
// heading — it takes the chart so a section can count what it is showing.
const ACCOUNT_SETTING_MENUS = [
  {
    id: 'chart-of-accounts',
    label: 'Chart of Accounts',
    icon: LayoutDashboard,
    caption: coa => `${coa.length} account${coa.length === 1 ? '' : 's'} every posting in this module lands in`,
  },
]

// Tabs of General Account Management — each renders its own panel below, driven by
// `accountingTab`. No tab selected means the page's dashboard is showing.
// The chart of accounts is not among them: it is setup rather than day-to-day work, so it
// lives behind the Account Setting button in the page header.
const GENERAL_TABS = [
  { id: 'general-ledger',    label: 'General Ledger',     icon: BookOpen },
  { id: 'journal-entry',     label: 'Journal Entry',      icon: FileText },
  { id: 'single-entry',      label: 'Single Entry',       icon: Pencil },
  { id: 'cash-transfer',     label: 'Cash Transfer',      icon: ArrowRightLeft },
  { id: 'income',            label: 'Income',             icon: TrendingUp },
  { id: 'expense',           label: 'Expense',            icon: TrendingDown },
  { id: 'bank-accounts',     label: 'Real Bank Accounts', icon: Landmark },
  { id: 'audit-log',         label: 'Audit Log',          icon: History },
]

// Tabs of Payroll Management. The card lands on the employee register — payroll starts from
// who is on staff, and the salary account and its postings follow from that.
// Salary payments and the accounts they post against are two tabs, not one: the payments are
// a working list that is added to every run and approved row by row, the accounts are the
// standing chart-of-accounts entries behind them. Reading one rarely means reading the other.
// Audit Log is last and sits apart at the right end, the same way the general card's does:
// every payroll action, including each period run and what it paid.
const PAYROLL_TABS = [
  { id: 'employees', label: 'Employee Information', icon: Users },
  { id: 'salary',    label: 'Salary Payment', icon: Banknote },
  { id: 'approval',  label: 'Approval', icon: CheckCheck },
  { id: 'account',   label: 'Payroll Account', icon: Landmark },
  { id: 'audit-log', label: 'Audit Log', icon: History },
]

// The two control accounts behind Loan Account Management's Payable and Receivable
// tabs. Every disbursement passes through the payable and every repayment through the
// receivable, so these are the codes the loan ledger below posts against.
const AP_LOAN_CODE = '2030'
const AR_LOAN_CODE = '1130'

// The loan card's two accounts, in the order they are shown — same tab bar as the
// general and payroll cards. The first is what the card opens on, so this list is the
// single place that order is decided. The GL code rides along on each tab, so the tab
// and the ledger account it posts to are visibly the same thing.
const LOAN_ACCOUNT_TABS = [
  { id: 'payable',    label: 'Account Payable',    icon: ArrowUpCircle,   code: AP_LOAN_CODE },
  { id: 'receivable', label: 'Account Receivable', icon: ArrowDownCircle, code: AR_LOAN_CODE },
]
const LOAN_ACCOUNT_VIEWS = LOAN_ACCOUNT_TABS.map(t => t.id)

// The Real Bank Accounts tab groups its cards into four collapsible sections, each
// scoping its cards' transaction history to what that group is for: Payable to loan
// disbursements, Receivable to loan repayments (see the filtering in selectedBankEntries
// below), Payroll to staff salaries (its cards link to the Payroll GLs, 6020 USD / 6021
// KHR — a separate account from General, so a batch salary run doesn't get lost in the
// same bucket as rent/utilities/misc expenses), and General to everything else —
// expenses, transfers, any cash that isn't part of the loan book or payroll. Payroll
// sits above General in this list since it's the more specific, more frequently
// checked of the two. A bank account falls under Payable unless its `group` says
// otherwise.
const BANK_CARD_GROUPS = [
  { id: 'payable',    label: 'Account Payable' },
  { id: 'receivable', label: 'Account Receivable' },
  { id: 'payroll',    label: 'Payroll Account' },
  { id: 'general',    label: 'General Account' },
]
const DEFAULT_BANK_GROUP = BANK_CARD_GROUPS[0].id

// Categories that belong to the loan book — excluded from a General card's history
// since Payable/Receivable already own them (see the group filter in
// selectedBankEntries below).
const LOAN_BOOK_CATEGORIES = ['Loan Commitment', 'Loan Disbursement', 'Loan Repayment', 'Repayment Income', 'Late Penalty Fees']

// WeBill365's "Import settled payments" scope posts collected repayments straight into
// the loan book (see INITIAL_INTEGRATIONS in mockData.js), so its connection status is
// shown on the Account Receivable cards specifically — that's the account those synced
// payments land in. Same colour vocabulary as the Integrations page's own status badge.
const INTEGRATION_STATUS_STYLE = {
  connected:    { label: 'Connected',     dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900/50' },
  disconnected: { label: 'Not Connected', dot: 'bg-slate-400',   cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600' },
  error:        { label: 'Error',         dot: 'bg-rose-500',    cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-900/50' },
}
function Webill365StatusBadge({ status }) {
  const s = INTEGRATION_STATUS_STYLE[status] || INTEGRATION_STATUS_STYLE.disconnected
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      WeBill365 {s.label}
    </span>
  )
}

// Optional bank-transfer receipt fields a repayment can carry (see RepaymentTracking's
// "Transfer receipt details"). Every bank-history row can expand to this full set —
// fields with nothing recorded yet show as "—" rather than being hidden, so the receipt
// layout reads the same whether or not this particular payment captured them. Borrower
// name is deliberately not here — it sits next to the row's title instead (see the
// selectedBankEntries.map render), since it identifies the transaction at a glance
// rather than being a receipt-only detail.
const BANK_TX_DETAIL_FIELDS = [
  { key: 'trxId', label: 'Trx. ID' },
  { key: 'bankName', label: 'Bank' },
  { key: 'outlet', label: 'Outlet' },
  { key: 'payerName', label: 'Payer' },
  { key: 'referenceNo', label: 'Reference #' },
  { key: 'remark', label: 'Remark' },
  { key: 'toAccount', label: 'To Account' },
  { key: 'txnHash', label: 'Transaction Hash #' },
]

// Full receipt-style detail list for an expanded row, in the same order a bank transfer
// confirmation shows them — the optional captured fields (see BANK_TX_DETAIL_FIELDS)
// interleaved with the amount/date the row already carries, since those are always known.
function bankTxDetailRows(t, currency, formatVal) {
  const at = key => {
    const field = BANK_TX_DETAIL_FIELDS.find(f => f.key === key)
    return { label: field.label, value: t[key] || '—' }
  }
  return [
    at('trxId'), at('bankName'),
    { label: 'Original Amount', value: formatVal(t.amount, currency) },
    at('outlet'), at('payerName'), at('referenceNo'), at('remark'), at('toAccount'),
    { label: 'Transaction Date', value: t.date || '—' },
    at('txnHash'),
  ]
}

// Which GL accounts belong to the loan book rather than general company accounting:
// receivables and their loss allowances, accrued loan interest, and the release /
// repayment accounts that disbursement and repayment postings land in. Accounts a user
// adds later are classified by name so the split keeps holding without a code list edit.
const LOAN_GL_CODES = new Set(['1100', '1101', '1102', '1103', '1110', '1111', '1112', '1113', '1120', AR_LOAN_CODE, AP_LOAN_CODE, '5010', '6010'])
function isLoanGlAccount(account) {
  if (LOAN_GL_CODES.has(account.code)) return true
  const name = (account.name || '').toLowerCase()
  return name.includes('loan') || name.includes('repayment')
}

// When a loan was approved for release, as an ISO date the ledger can sort on.
// approvalHistory stamps are toLocaleString('en-GB') — 'dd/mm/yyyy, hh:mm:ss' — and the
// first stage-3 record is the approval (a later one is written when it is disbursed).
// Loans carrying no approval history fall back to their submission date.
function approvalDateISO(loan) {
  const approved = (loan.approvalHistory || []).find(h => h.stage === 3)
  const parts = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(approved?.timestamp || '')
  if (parts) return `${parts[3]}-${parts[2]}-${parts[1]}`
  return (loan.submittedAt || '').split('T')[0]
}

// ─── Modal: Chart of Account ──────────────────────────────────────────────────
function ChartOfAccountModal({ account, onClose, onSubmit }) {
  const [formData, setFormData] = useState(account || {
    code: '', type: 'Asset', name: '', nameKhmer: '',
    normalBalance: 'DEBIT', parentCode: '', description: '', status: 'ACTIVE',
    currency: 'USD', balance: 0
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {account ? 'Edit Account' : 'Add New Account'}
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Account Code *</label>
              <input required type="text" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="e.g. 10100" disabled={!!account}
                className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm disabled:opacity-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Account Type *</label>
              <select required value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}
                className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm">
                <option value="Asset">ASSET</option>
                <option value="Liability">LIABILITY</option>
                <option value="Equity">EQUITY</option>
                <option value="Income">REVENUE</option>
                <option value="Expense">EXPENSE</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Account Name (English) *</label>
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Cash Vault"
              className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Account Name (Khmer)</label>
            <input type="text" value={formData.nameKhmer} onChange={e => setFormData({...formData, nameKhmer: e.target.value})} placeholder="ឈ្មោះគណនី"
              className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Normal Balance</label>
              <select value={formData.normalBalance} onChange={e => setFormData({...formData, normalBalance: e.target.value})}
                className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm">
                <option value="DEBIT">DEBIT</option>
                <option value="CREDIT">CREDIT</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Parent Account Code</label>
              <input type="text" value={formData.parentCode} onChange={e => setFormData({...formData, parentCode: e.target.value})} placeholder="Optional"
                className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Description</label>
            <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Optional description" rows={2}
              className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
              {account ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Table: GL accounts (shared by the two account-management panels) ─────────
const ACCOUNT_TH = 'px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 first:rounded-tl-xl last:rounded-tr-xl text-left'

function GlAccountTable({ accounts, currency, emptyMessage }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className={ACCOUNT_TH}>Code</th>
              <th className={ACCOUNT_TH}>Account Name</th>
              <th className={ACCOUNT_TH}>Type</th>
              <th className={ACCOUNT_TH}>Normal Balance</th>
              <th className={`${ACCOUNT_TH} !text-right`}>Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {accounts.length === 0
              ? <EmptyState message={emptyMessage} />
              : accounts.map(acct => (
                <tr key={acct.code} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-xs font-bold font-mono text-brand-600 dark:text-brand-400">{acct.code}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-100">
                    {acct.name}
                    {acct.parentCode && <span className="ml-2 text-[10px] font-medium text-slate-400 dark:text-slate-500">under {acct.parentCode}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{acct.type === 'Income' ? 'Revenue' : acct.type}</td>
                  <td className="px-4 py-3">
                    {acct.normalBalance ? (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${acct.normalBalance === 'DEBIT' ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' : 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/30'}`}>
                        {acct.normalBalance}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">
                    {formatVal(acct.balance || 0, acct.currency || currency)}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Modal: Placeholder ───────────────────────────────────────────────────────
function PlaceholderModal({ title, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col p-6 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Settings className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          This feature is currently under development and will be available in a future update.
        </p>
        <button type="button" onClick={onClose} className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors">
          Close
        </button>
      </div>
    </div>
  )
}

export default function AccountingPage() {
  const { state, dispatch, showToast, can } = useApp()
  const {
    incomes, expenses, accounts, chartOfAccounts, cashTransfers,
    accountingTab, currency, loanApplications,
    cashTransferModalOpen, accountHistoryCode, accountHistoryCurrency,
    transactionModalOpen, transactionModalType,
    glFilter, glAccountFilter, realBankAccounts, journalEntries, employees, payrollRuns,
    integrations,
  } = state
  const webill365Status = integrations?.find(i => i.id === 'webill365')?.status || 'disconnected'

  const [bankAccountModalOpen, setBankAccountModalOpen] = useState(false)
  const [editingBankAccount, setEditingBankAccount] = useState(null)
  const [selectedBankId, setSelectedBankId] = useState(null)
  // Each bank card group collapses so a long list of banks doesn't push the history panel
  // off screen once more accounts are added. The first group starts open so the tab never
  // lands on an all-collapsed, empty-looking column. Groups toggle independently — both
  // can be open at once — since the column scrolls on its own (see
  // max-h-[calc(100vh-21rem)] below) rather than needing to stay short.
  const [openBankGroups, setOpenBankGroups] = useState(
    () => Object.fromEntries(BANK_CARD_GROUPS.map((g, i) => [g.id, i === 0]))
  )
  const toggleBankGroup = id => setOpenBankGroups(s => ({ ...s, [id]: !s[id] }))
  // A transaction row expands in place to show its bank-transfer receipt fields (Trx.
  // ID, Reference #, Payer, etc.). Accordion behaviour — opening one row closes whichever
  // other one was open — keeps the list from growing tall with several receipts open at
  // once inside the already-scrolling history panel.
  const [expandedBankTx, setExpandedBankTx] = useState(null)
  const toggleBankTx = key => setExpandedBankTx(s => (s === key ? null : key))

  // Which of the two landing cards is open, and — inside the loan card — which of its
  // two accounts is expanded. The page still lands on the cards alone, but opening the
  // loan card selects Payable straight away rather than showing a bare prompt.
  const [openCard, setOpenCard] = useState(null)
  const [loanAccountView, setLoanAccountView] = useState(LOAN_ACCOUNT_VIEWS[0])

  // Payroll card: which of its tabs is showing, and whether a payroll run is being drafted.
  const [payrollTab, setPayrollTab] = useState(PAYROLL_TABS[0].id)
  const [payrollRunOpen, setPayrollRunOpen] = useState(false)

  // General Ledger toolbar: date range, free-text search and which columns are shown.
  const [glDate, setGlDate] = useState('')
  const [glSearch, setGlSearch] = useState('')
  const [glViewOpen, setGlViewOpen] = useState(false)
  const [glColumns, setGlColumns] = useState(() => GL_COLUMNS.map(c => c.id))

  // Journal Entry toolbar: entry-type filter, search and column choice.
  const [jeType, setJeType] = useState('all')
  const [jeSearch, setJeSearch] = useState('')
  const [jeViewOpen, setJeViewOpen] = useState(false)
  const [jeColumns, setJeColumns] = useState(() => JE_COLUMNS.map(c => c.id))

  // Income toolbar: date, category, search and column choice.
  const [incDate, setIncDate] = useState('')
  const [incCategory, setIncCategory] = useState('all')
  const [incSearch, setIncSearch] = useState('')
  const [incViewOpen, setIncViewOpen] = useState(false)
  const [incColumns, setIncColumns] = useState(() => INC_COLUMNS.map(c => c.id))

  // Expense toolbar — same controls as income, plus a status filter for the approval queue.
  const [expDate, setExpDate] = useState('')
  const [expCategory, setExpCategory] = useState('all')
  const [expStatus, setExpStatus] = useState('all')
  const [expSearch, setExpSearch] = useState('')
  const [expViewOpen, setExpViewOpen] = useState(false)
  const [expColumns, setExpColumns] = useState(() => EXP_COLUMNS.map(c => c.id))
  // Approving releases real funds from a bank account — confirm-then-commit before the
  // dispatch, the same pattern already used for deleting a chart-of-accounts entry.
  const [approvingExpense, setApprovingExpense] = useState(null)

  // Cash Transfer toolbar.
  const [ctAccount, setCtAccount] = useState('all')
  const [ctSearch, setCtSearch] = useState('')
  const [ctViewOpen, setCtViewOpen] = useState(false)
  const [ctColumns, setCtColumns] = useState(() => CT_COLUMNS.map(c => c.id))

  // Single Entry toolbar mirrors the Journal Entry one; its "type" is the posting side.
  const [seSide, setSeSide] = useState('all')
  const [seSearch, setSeSearch] = useState('')
  const [seViewOpen, setSeViewOpen] = useState(false)
  const [seColumns, setSeColumns] = useState(() => SE_COLUMNS.map(c => c.id))

  const [coaFilter, setCoaFilter] = useState('ALL')
  const [coaViewOpen, setCoaViewOpen] = useState(false)
  const [coaColumns, setCoaColumns] = useState(() => COA_COLUMNS.map(c => c.id))
  const [coaSearch, setCoaSearch] = useState('')
  const [coaModalOpen, setCoaModalOpen] = useState(false)
  const [editingCoa, setEditingCoa] = useState(null)
  const [deletingCoa, setDeletingCoa] = useState(null)
  // Account Setting — the standing setup behind the module, kept in a modal off the header
  // rather than as a tab beside the working views. The modal opens on its first section.
  const [accountSettingOpen, setAccountSettingOpen] = useState(false)
  const [accountSettingMenu, setAccountSettingMenu] = useState(ACCOUNT_SETTING_MENUS[0].id)
  const activeAccountSetting = ACCOUNT_SETTING_MENUS.find(m => m.id === accountSettingMenu) || ACCOUNT_SETTING_MENUS[0]

  const [journalEntryModalOpen, setJournalEntryModalOpen] = useState(false)
  const [singleEntryModalOpen, setSingleEntryModalOpen] = useState(false)
  const [trialBalanceModalOpen, setTrialBalanceModalOpen] = useState(false)
  const [plModalOpen, setPlModalOpen] = useState(false)
  const [balanceSheetModalOpen, setBalanceSheetModalOpen] = useState(false)

  // Most of this page's modals are local component state, so App.jsx's global Escape
  // handler (which only knows about reducer state) can't reach them — this closes
  // whichever one is currently open. The three reducer-tracked ones (transaction/cash
  // transfer/account history) are closed via dispatch so they stay in sync with the
  // SET_TAB reset list that already resets them.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      if (journalEntryModalOpen) setJournalEntryModalOpen(false)
      else if (singleEntryModalOpen) setSingleEntryModalOpen(false)
      else if (trialBalanceModalOpen) setTrialBalanceModalOpen(false)
      else if (plModalOpen) setPlModalOpen(false)
      else if (balanceSheetModalOpen) setBalanceSheetModalOpen(false)
      else if (bankAccountModalOpen) setBankAccountModalOpen(false)
      else if (coaModalOpen) setCoaModalOpen(false)
      else if (deletingCoa) setDeletingCoa(null)
      else if (approvingExpense) setApprovingExpense(null)
      else if (payrollRunOpen) setPayrollRunOpen(false)
      else if (transactionModalOpen) dispatch({ type: 'CLOSE_TRANSACTION_MODAL' })
      else if (cashTransferModalOpen) dispatch({ type: 'CLOSE_CASH_TRANSFER_MODAL' })
      else if (accountHistoryCode) dispatch({ type: 'CLOSE_ACCOUNT_HISTORY' })
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [
    journalEntryModalOpen, singleEntryModalOpen,
    trialBalanceModalOpen, plModalOpen, balanceSheetModalOpen,
    bankAccountModalOpen, coaModalOpen, deletingCoa, approvingExpense, payrollRunOpen,
    transactionModalOpen, cashTransferModalOpen, accountHistoryCode, dispatch,
  ])

  // The open section lives in app state, not here, so leaving for another module and
  // coming back via the sidebar returns to whatever was open — remounting this page
  // must not reset it. First visit of a session starts with nothing expanded
  // (accountingTab defaults to null), so a section's data still only loads on click.

  // Keep a bank selected on the Real Bank Accounts tab so the history panel is never empty
  useEffect(() => {
    if (accountingTab !== 'bank-accounts' || !realBankAccounts?.length) return
    if (!realBankAccounts.some(a => a.id === selectedBankId)) setSelectedBankId(realBankAccounts[0].id)
  }, [accountingTab, realBankAccounts, selectedBankId])

  // ── derived values ──────────────────────────────────────────────────────
  const accountName = (code) => {
    const glAcc = chartOfAccounts.find(a => a.code === code)
    if (glAcc) return glAcc.name
    return accounts.find(a => a.code === code)?.name || code || '—'
  }
  const approvedExpenses = useMemo(() => expenses.filter(e => e.status === 'Approved'), [expenses])

  // ── Per-account transaction history (shared by the modal and the bank panel) ────
  const buildAccountEntries = (code) => {
    if (!code) return []
    const inc = incomes.filter(i => i.account === code).map(i => ({ ...i, txType: 'Income' }))
    const exp = approvedExpenses.filter(e => e.account === code).map(e => ({ ...e, txType: 'Expense' }))
    const tr = cashTransfers
      .filter(t => t.fromCode === code || t.toCode === code)
      .map(t => {
        const isOut = t.fromCode === code
        return {
          date: t.date, code: t.ref, amount: t.amount,
          category: isOut ? `Transfer to ${accountName(t.toCode)}` : `Transfer from ${accountName(t.fromCode)}`,
          txType: isOut ? 'Expense' : 'Income',
        }
      })
    return [...inc, ...exp, ...tr].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }

  // ── Real bank accounts: inline master–detail selection ─────────────────
  const selectedBank = useMemo(
    () => realBankAccounts?.find(a => a.id === selectedBankId) || null,
    [realBankAccounts, selectedBankId]
  )
  // Each card is a single-currency account, so the history panel's currency is whichever
  // card is selected — there is nothing to toggle between.
  const bankHistoryCurrency = selectedBank?.currency || 'USD'
  const selectedBankGL = selectedBank?.glCode || ''
  const selectedBankNumber = selectedBank ? (selectedBank.number || 'None') : ''
  const selectedBankGLAccount = selectedBankGL ? chartOfAccounts.find(a => a.code === selectedBankGL) : null
  // selectedBankEntries is built further down — it needs the loan ledger, which is
  // assembled after this block.

  // ── Deleting a GL account: an account backing a real bank account or already
  // carrying postings can't be removed without orphaning ledger history.
  const coaDeleteBlockedReason = useMemo(() => {
    if (!deletingCoa) return ''
    const code = deletingCoa.code
    if (realBankAccounts?.some(b => b.glCode === code)) {
      return 'This account is linked to a real bank account. Unlink it on the Real Bank Accounts tab first.'
    }
    const posted =
      incomes.some(i => i.account === code) ||
      expenses.some(e => e.account === code) ||
      cashTransfers.some(t => t.fromCode === code || t.toCode === code) ||
      (journalEntries || []).some(j => (j.lines || []).some(l => l.accountCode === code))
    return posted ? 'This account has posted transactions. Accounts with ledger history cannot be deleted.' : ''
  }, [deletingCoa, realBankAccounts, incomes, expenses, cashTransfers, journalEntries])

  const coaChildCount = deletingCoa ? chartOfAccounts.filter(a => a.parentCode === deletingCoa.code).length : 0

  const accountHistoryAccount = accountHistoryCode ? (chartOfAccounts.find(a => a.code === accountHistoryCode) || accounts.find(a => a.code === accountHistoryCode) || null) : null
  const accountHistoryEntries = useMemo(
    () => buildAccountEntries(accountHistoryCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountHistoryCode, incomes, approvedExpenses, cashTransfers]
  )
  // ── Account management split: general company accounts vs the loan book ──
  const generalGlAccounts = useMemo(
    () => chartOfAccounts
      .filter(a => !isLoanGlAccount(a) && !isPayrollAccount(a))
      .sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [chartOfAccounts]
  )
  const payrollGlAccounts = useMemo(
    () => chartOfAccounts.filter(isPayrollAccount).sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [chartOfAccounts]
  )
  // Salary postings, newest first. Pending ones are money committed but not yet released,
  // so they are reported apart from what has actually been paid.
  const payrollEntries = useMemo(
    () => expenses.filter(isPayrollExpense).sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [expenses]
  )
  const payrollPaid = useMemo(
    () => payrollEntries.filter(e => e.status === 'Approved').reduce((s, e) => s + (e.amount || 0), 0),
    [payrollEntries]
  )
  const payrollPending = useMemo(
    () => payrollEntries.filter(e => e.status !== 'Approved').reduce((s, e) => s + (e.amount || 0), 0),
    [payrollEntries]
  )
  // The approval queue — salary postings whose money has been committed but not released.
  // Oldest first, the reverse of the Salary Payment list: there the newest posting is the news,
  // here the one that has been waiting longest is the one to act on. A posting made by a
  // payroll run carries that run's period and headcount, so a row says which month is unpaid
  // and for how many people rather than only which reference is outstanding.
  const payrollApprovals = useMemo(
    () => payrollEntries
      .filter(e => e.status !== 'Approved')
      .map(e => {
        const run = payrollRuns.find(r => r.code === e.code)
        return { ...e, period: run?.period || '', employeeCount: run?.lines?.length || 0 }
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [payrollEntries, payrollRuns]
  )
  const generalCashBalance = useMemo(
    () => generalGlAccounts.filter(a => a.type === 'Asset').reduce((s, a) => s + (a.balance || 0), 0),
    [generalGlAccounts]
  )

  // Account Receivable — one row per borrower loan with money out. A loan only has a
  // receivable once it has actually been released, so pending/approved applications are
  // left out; the figures come from the same place the loan screens read — the repayment
  // schedule, whose last settled row carries the outstanding balance.
  const loanAccountRows = useMemo(() => loanApplications
    .filter(l => l.status === 'Active' || (l.schedule || []).some(r => r.status === 'Paid' || r.status === 'Partial'))
    .map(l => {
      const schedule = l.schedule || []
      const repaid = schedule.reduce((s, r) => s + (r.paid || 0), 0)
      const lastSettled = schedule.reduce((last, r) => (r.status === 'Paid' || r.status === 'Partial' ? r : last), null)
      return {
        ref: l.ref,
        customerName: l.customerName || l.customerCode || '—',
        product: l.product || '—',
        principal: l.amount || 0,
        repaid: Math.round(repaid * 100) / 100,
        outstanding: lastSettled ? (lastSettled.balance ?? 0) : (l.amount || 0),
      }
    }), [loanApplications])

  const loanTotals = useMemo(() => loanAccountRows.reduce((t, r) => ({
    principal: t.principal + r.principal,
    repaid: t.repaid + r.repaid,
    outstanding: t.outstanding + r.outstanding,
  }), { principal: 0, repaid: 0, outstanding: 0 }), [loanAccountRows])

  // Account Payable — the company's side of every approved loan. One sits in
  // 'Waiting Disburse' until DISBURSE_LOAN flips it to Active and posts the payout
  // expense, so that status is exactly an unpaid obligation. Released loans stay on the
  // list carrying what was actually paid out, rather than dropping off it — the account
  // is what the company owed and settled, not only what it still owes. Open rows sort
  // first, then newest release date, since those are the ones that need acting on.
  //
  // This is the account's full picture and it stays that way: the payable total below is
  // read off it, and that total is what the card and the GL 2030 balance both show. The
  // table renders every row of it for the same reason — showing only the released ones
  // put a disbursed-only total under a card holding the payable, two figures that share
  // no loan between them and so never agreed once anything had been released.
  const loanPayableRows = useMemo(() => loanApplications
    .map(l => {
      const schedule = l.schedule || []
      const released = l.status === 'Active' || schedule.some(r => r.status === 'Paid' || r.status === 'Partial')
      const awaiting = l.status === 'Waiting Disburse'
      if (!released && !awaiting) return null
      const payout = expenses.find(e => e.code === `DSB-${l.ref}`)
      return {
        ref: l.ref,
        customerName: l.customerName || l.customerCode || '—',
        product: l.product || '—',
        // Once released this is the date the money actually left, not the date it was
        // scheduled to — the two differ whenever a disbursement runs late.
        dueDate: (released ? payout?.date : null) || l.disbursementDate || '—',
        // The two sides of the account, and only ever one of them per row: a loan is
        // either still owed to the borrower or already paid out to them. Preferring the
        // payout expense's own amount over the loan's keeps the figure honest if a
        // release ever went out for something other than the approved principal.
        disbursed: released ? (payout?.amount ?? (l.amount || 0)) : 0,
        payable: released ? 0 : (l.amount || 0),
        released,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.released === b.released ? (b.dueDate || '').localeCompare(a.dueDate || '') : a.released ? 1 : -1)),
    [loanApplications, expenses])

  const payableTotals = useMemo(() => loanPayableRows.reduce((t, r) => ({
    disbursed: t.disbursed + r.disbursed,
    payable: t.payable + r.payable,
  }), { disbursed: 0, payable: 0 }), [loanPayableRows])

  // Only what is still owed — this is the figure that ties back to the 2030 balance,
  // so released rows (which carry a zero payable) must not count toward it.
  const payableTotal = payableTotals.payable

  // ── Loan ledger: every movement through Account Payable and Account Receivable ──
  // Derived from the loan book itself rather than from journal postings, so a loan
  // seeded straight into state and one released through the app produce the same
  // history. Each loan contributes, in order: the payable credited on approval, the
  // payable cleared and the receivable opened on release, then one receivable credit
  // per settled installment for whatever principal it retired. Interest and late fees
  // are deliberately absent — they were never receivable principal.
  const loanLedgerEntries = useMemo(() => {
    const rows = []
    for (const loan of loanApplications) {
      const schedule = loan.schedule || []
      const settled = schedule.filter(r => r.status === 'Paid' || r.status === 'Partial')
      const released = loan.status === 'Active' || settled.length > 0
      const awaiting = loan.status === 'Waiting Disburse'
      if (!released && !awaiting) continue

      const amount = loan.amount || 0
      const who = { customerCode: loan.customerCode, customerName: loan.customerName || loan.customerCode || '—' }
      const product = loan.product || 'loan'
      const payout = expenses.find(e => e.code === `DSB-${loan.ref}`)
      const releaseDate = payout?.date || loan.disbursementDate || ''

      rows.push({
        ...who, loanRef: loan.ref, date: approvalDateISO(loan), code: `AP-${loan.ref}`,
        account: AP_LOAN_CODE, txType: 'Payable', category: 'Loan Commitment',
        description: `${product} approved for release — ${loan.ref}`,
        debit: 0, credit: amount, amount,
      })

      if (!released) continue
      rows.push({
        ...who, loanRef: loan.ref, date: releaseDate, code: `DSB-${loan.ref}`,
        account: AP_LOAN_CODE, txType: 'Payable', category: 'Loan Disbursement',
        description: `Principal released to borrower — ${loan.ref}`,
        debit: amount, credit: 0, amount,
      })
      rows.push({
        ...who, loanRef: loan.ref, date: releaseDate, code: `DSB-${loan.ref}`,
        account: AR_LOAN_CODE, txType: 'Receivable', category: 'Loan Disbursement',
        description: `Loan receivable opened — ${loan.ref}`,
        debit: amount, credit: 0, amount,
      })
      for (const row of settled) {
        // Older rows predate the principalPaid/interestPaid split, so what the payment
        // covered is backed out of the installment's own figures when it is missing.
        const principal = row.principalPaid != null
          ? row.principalPaid
          : Math.max(Math.round(((row.paid || 0) - (row.interest || 0) - (row.lateFeePaid || 0)) * 100) / 100, 0)
        if (principal <= 0.005) continue
        // A remainder settled directly against this row carries its own receipt fields,
        // separate from the original installment's — prefer whichever actually retired
        // the principal so the history shows the receipt that really moved the money.
        rows.push({
          ...who, loanRef: loan.ref, date: row.paidDate || row.dueDateISO || '',
          code: `RP-${loan.ref}-${row.num}`,
          account: AR_LOAN_CODE, txType: 'Receivable', category: 'Loan Repayment',
          description: `Installment #${row.num} — principal collected via ${row.paymentMethod || 'Cash'}`,
          debit: 0, credit: principal, amount: principal,
          bankName: row.remainderBankName || row.bankName || '',
          trxId: row.remainderTrxId || row.trxId || '',
          referenceNo: row.remainderReferenceNo || row.referenceNo || '',
          payerName: row.remainderPayerName || row.payerName || '',
          outlet: row.remainderOutlet || row.outlet || '',
          remark: row.remainderRemark || row.remark || '',
          toAccount: row.remainderToAccount || row.toAccount || '',
          txnHash: row.remainderTxnHash || row.txnHash || '',
        })
      }
    }
    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [loanApplications, expenses])

  // History for the selected bank card. The two loan control accounts move through the loan
  // ledger rather than income/expense postings, so a card linked to one of them folds those
  // rows in — without them the receivable card reads as having no history at all. Credits to
  // the control account are money coming in (a repayment retiring principal) and debits are
  // money going out (principal released), which is how the panel's arrows and Cash In /
  // Cash Out tiles read them.
  //
  // A card's group names what it's for — Payable disburses, Receivable collects
  // repayments — so its displayed history is filtered down to just that: Payable shows
  // only "Loan Disbursement" rows, Receivable only repayment rows ("Loan Repayment" from
  // the control ledger, "Repayment Income"/"Late Penalty Fees" from posted incomes).
  // General is the same underlying bank account viewed the other way round — everything
  // that posts there except those loan-book categories (payroll, expenses, transfers,
  // and — since fundingGLCode funds both sides from the same real account — the
  // repayment income/fee entries too, which is why they're excluded here rather than
  // left to show up twice). Real cash still funds through fundingGLCode purely by
  // currency (unchanged) — a bank tagged Payable is where actual disbursement AND
  // repayment cash both land in this app's model, so this filter is a display-only lens
  // on that account's history, not a change to what gets posted where.
  const selectedBankEntries = useMemo(() => {
    const posted = buildAccountEntries(selectedBankGL)
    const combined = (() => {
      if (!selectedBankGL) return posted
      const ledger = loanLedgerEntries
        .filter(r => r.account === selectedBankGL)
        .map(r => ({
          date: r.date, code: r.code, amount: r.amount, loanRef: r.loanRef,
          category: r.category, description: r.description,
          customerCode: r.customerCode, customerName: r.customerName,
          txType: r.credit > 0 ? 'Income' : 'Expense',
          bankName: r.bankName || '', trxId: r.trxId || '', referenceNo: r.referenceNo || '',
          payerName: r.payerName || '', outlet: r.outlet || '', remark: r.remark || '',
          toAccount: r.toAccount || '', txnHash: r.txnHash || '',
        }))
      if (!ledger.length) return posted
      return [...posted, ...ledger].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    })()
    const group = selectedBank?.group || DEFAULT_BANK_GROUP
    if (group === 'payable') return combined.filter(e => e.category === 'Loan Disbursement')
    if (group === 'receivable') return combined.filter(e =>
      e.category === 'Loan Repayment' || e.category === 'Repayment Income' || e.category === 'Late Penalty Fees'
    )
    if (group === 'general') return combined.filter(e => !LOAN_BOOK_CATEGORIES.includes(e.category))
    return combined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBankGL, selectedBank, incomes, approvedExpenses, cashTransfers, loanLedgerEntries])

  // Which loan a bank-history row belongs to. Ledger rows carry it outright; posted
  // repayment income / late-fee rows only encode it in their code (`RP-<ref>`,
  // `LF-<ref>-<num>`), and a loan ref has dashes of its own ('AC-L-001001'), so the ref
  // is recovered by matching the loan book rather than splitting the string.
  const loanRefForEntry = (t) => {
    if (t.loanRef) return t.loanRef
    const code = t.code || ''
    if (!code) return ''
    return loanApplications.find(l => l.ref && code.includes(l.ref))?.ref || ''
  }

  // Follow a repayment row back to the installment it settled: the loan's full preview
  // page opened on its Repayment Tracking tab, not a modal over the accounting page — an
  // officer arriving from the ledger usually needs the rest of the loan record too.
  // Repayment Tracking lives inside Loan Management, so the tab is switched first —
  // SET_TAB clears activeLoan and every loan screen flag, which is why the loan is opened
  // after it, not before. A loan that never reached release has no tracking tab, so it
  // falls back to the same screen the loan list would have opened for that status.
  function openRepaymentTracking(loanRef) {
    const loan = loanApplications.find(l => l.ref === loanRef)
    if (!loan) {
      showToast('That loan is no longer in the loan book.', 'error')
      return
    }
    dispatch({ type: 'SET_TAB', tab: 'open-loan' })
    if (loan.status === 'Active' || loan.status === 'Waiting Disburse') {
      dispatch({ type: 'OPEN_LOAN_PREVIEW', loan, tab: 'Repayment Tracking' })
    } else if (loan.status === 'Pending Approval') {
      dispatch({ type: 'OPEN_LOAN_OVERVIEW', loan, tab: 'Overview' })
    } else {
      const idx = loanApplications.findIndex(l => l.ref === loan.ref)
      if (idx >= 0) dispatch({ type: 'OPEN_LOAN_DETAIL', idx })
    }
  }

  // A transfer touches two accounts, so it is labelled with both.
  const glAccountLabel = (e) => {
    if (e.txType === 'Transfer') return `${accountName(e.fromCode)} → ${accountName(e.toCode)}`
    return accountName(e.account)
  }

  // ── GL combined entries (only posted / approved money movements) ───────
  const glEntries = useMemo(() => {
    const inc = incomes.map(i => ({ ...i, txType: 'Income', debit: 0, credit: i.amount }))
    const exp = approvedExpenses.map(e => ({ ...e, txType: 'Expense', debit: e.amount, credit: 0 }))
    const tr = cashTransfers.map(t => ({
      date: t.date, code: t.ref, category: `${t.fromName} → ${t.toName}`,
      description: t.description, txType: 'Transfer',
      debit: t.amount, credit: t.amount,
      fromCode: t.fromCode, toCode: t.toCode,
    }))
    // The loan book's own two control accounts post here as well, so the ledger carries
    // the payable and receivable side of a loan next to the cash side the disbursement
    // expense and repayment income already contribute.
    let all = [...inc, ...exp, ...tr, ...loanLedgerEntries].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    if (glFilter !== 'all') all = all.filter(e => e.txType === glFilter)
    if (glAccountFilter !== 'all') {
      all = all.filter(e => e.account === glAccountFilter || e.fromCode === glAccountFilter || e.toCode === glAccountFilter)
    }
    if (glDate) all = all.filter(e => e.date === glDate)
    // The account label is resolved here rather than in the column, so search, display and
    // the PDF all match on exactly the same text.
    all = all.map(e => ({ ...e, accountLabel: glAccountLabel(e) }))
    const term = glSearch.trim().toLowerCase()
    if (term) {
      all = all.filter(e => [e.code, e.category, e.description, e.customerName, e.accountLabel, e.txType]
        .some(v => (v || '').toString().toLowerCase().includes(term)))
    }
    return all
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomes, approvedExpenses, cashTransfers, loanLedgerEntries, chartOfAccounts, accounts, glFilter, glAccountFilter, glDate, glSearch])

  // Accounts for the account pickers (General Ledger, Cash Transfer), ordered
  // parent-then-children so the list mirrors the chart's shape. A flat "code — name" list gave
  // no way to tell 1110 (Allowance for Loan Losses) from 1111 (one of its stages) when
  // choosing what to filter by — they read as siblings. Sorted on code rather than trusting
  // the stored order, since an account added by hand lands at the end of the list regardless
  // of where it belongs in the hierarchy.
  const accountPickerOptions = useMemo(() => {
    const byCode = (a, b) => (a.code || '').localeCompare(b.code || '')
    const children = new Map()
    const roots = []
    for (const a of chartOfAccounts) {
      const parent = (a.parentCode || '').trim()
      if (parent) {
        if (!children.has(parent)) children.set(parent, [])
        children.get(parent).push(a)
      } else {
        roots.push(a)
      }
    }
    const out = []
    const placed = new Set()
    for (const root of [...roots].sort(byCode)) {
      out.push({ account: root, isSub: false })
      placed.add(root.code)
      for (const child of (children.get(root.code) || []).sort(byCode)) {
        out.push({ account: child, isSub: true })
        placed.add(child.code)
      }
    }
    // A sub-account whose parent is not in the chart (a deleted or mistyped parentCode) has no
    // root to sit under and would otherwise drop out of the picker entirely — it is still a
    // real account holding a real balance, so it is appended rather than lost.
    for (const a of chartOfAccounts) {
      if (!placed.has(a.code)) out.push({ account: a, isSub: true })
    }
    return out
  }, [chartOfAccounts])

  // Chart of accounts, grouped by type and filtered by the panel's own controls. Groups
  // with nothing left after filtering drop out rather than printing an empty band.
  const coaGroups = useMemo(() => {
    const term = coaSearch.trim().toLowerCase()
    return COA_TYPE_GROUPS
      .filter(g => coaFilter === 'ALL' || coaFilter === g.typeDisplay)
      .map(g => ({
        ...g,
        accounts: chartOfAccounts
          .filter(a => a.type === g.type)
          .filter(a => !term || [a.code, a.name, a.nameKhmer, a.description].some(v => (v || '').toLowerCase().includes(term)))
          .sort((a, b) => (a.code || '').localeCompare(b.code || '')),
      }))
      .filter(g => g.accounts.length > 0)
  }, [chartOfAccounts, coaFilter, coaSearch])

  const visibleCoaColumns = useMemo(() => COA_COLUMNS.filter(c => coaColumns.includes(c.id)), [coaColumns])

  const visibleGlColumns = useMemo(() => GL_COLUMNS.filter(c => glColumns.includes(c.id)), [glColumns])
  // "Totals" spans every visible column that is not an amount column.
  const glTotalsSpan = visibleGlColumns.filter(c => c.id !== 'debit' && c.id !== 'credit').length

  // Tab data. Journal and single entries share one store, told apart by entryType.
  // Journal postings are everything except single entries — hand-written ones plus the
  // system's own (loan disbursement, repayment) — labelled and then filtered by the tab's
  // own type / search controls.
  const allJournalPostings = useMemo(
    () => (journalEntries || [])
      .filter(j => j.entryType !== 'Single Entry')
      .map(j => ({ ...j, accountsLabel: (j.lines || []).map(l => accountName(l.accountCode)).join(' · ') })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journalEntries, chartOfAccounts, accounts]
  )

  // Types offered by the filter come from the data, so a new kind of posting shows up
  // without touching this list.
  const journalTypes = useMemo(
    () => [...new Set(allJournalPostings.map(j => j.entryType).filter(Boolean))].sort(),
    [allJournalPostings]
  )

  const journalPostings = useMemo(() => {
    const term = jeSearch.trim().toLowerCase()
    return allJournalPostings
      .filter(j => jeType === 'all' || j.entryType === jeType)
      .filter(j => !term || [j.transactionNo, j.memo, j.entryType, j.accountsLabel]
        .some(v => (v || '').toString().toLowerCase().includes(term)))
  }, [allJournalPostings, jeType, jeSearch])

  const visibleJeColumns = useMemo(() => JE_COLUMNS.filter(c => jeColumns.includes(c.id)), [jeColumns])
  const singlePostings = useMemo(() => {
    const term = seSearch.trim().toLowerCase()
    return (journalEntries || [])
      .filter(j => j.entryType === 'Single Entry')
      .map(j => ({ ...j, accountsLabel: accountName(seLine(j).accountCode) }))
      .filter(j => seSide === 'all' || seSideOf(j) === seSide)
      .filter(j => !term || [j.transactionNo, j.memo, j.accountsLabel]
        .some(v => (v || '').toString().toLowerCase().includes(term)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalEntries, chartOfAccounts, accounts, seSide, seSearch])

  const visibleSeColumns = useMemo(() => SE_COLUMNS.filter(c => seColumns.includes(c.id)), [seColumns])

  const transferRows = useMemo(() => {
    const term = ctSearch.trim().toLowerCase()
    return [...cashTransfers]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .filter(t => ctAccount === 'all' || t.fromCode === ctAccount || t.toCode === ctAccount)
      .filter(t => !term || [t.ref, t.fromName, t.toName, t.description]
        .some(v => (v || '').toString().toLowerCase().includes(term)))
  }, [cashTransfers, ctAccount, ctSearch])

  const visibleCtColumns = useMemo(() => CT_COLUMNS.filter(c => ctColumns.includes(c.id)), [ctColumns])
  // Categories offered by the filter come from the data itself.
  const incomeCategories = useMemo(
    () => [...new Set(incomes.map(i => i.category).filter(Boolean))].sort(),
    [incomes]
  )

  const incomeRows = useMemo(() => {
    const term = incSearch.trim().toLowerCase()
    return [...incomes]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .map(e => ({ ...e, accountLabel: e.account ? accountName(e.account) : '' }))
      .filter(e => !incDate || e.date === incDate)
      .filter(e => incCategory === 'all' || e.category === incCategory)
      .filter(e => !term || [e.code, e.category, e.description, e.accountLabel, e.source, e.customerName]
        .some(v => (v || '').toString().toLowerCase().includes(term)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomes, chartOfAccounts, accounts, incDate, incCategory, incSearch])

  const visibleIncColumns = useMemo(() => INC_COLUMNS.filter(c => incColumns.includes(c.id)), [incColumns])
  // Unapproved expenses first — they are the ones that need someone to act.
  const expenseCategories = useMemo(
    () => [...new Set(expenses.map(e => e.category).filter(Boolean))].sort(),
    [expenses]
  )

  const expenseRows = useMemo(() => {
    const term = expSearch.trim().toLowerCase()
    const pending = e => (e.status === 'Approved' ? 1 : 0)
    return [...expenses]
      .sort((a, b) => pending(a) - pending(b) || (b.date || '').localeCompare(a.date || ''))
      .map(e => ({ ...e, accountLabel: e.account ? accountName(e.account) : '' }))
      .filter(e => !expDate || e.date === expDate)
      .filter(e => expCategory === 'all' || e.category === expCategory)
      .filter(e => expStatus === 'all' || (expStatus === 'Approved' ? e.status === 'Approved' : e.status !== 'Approved'))
      .filter(e => !term || [e.code, e.category, e.description, e.accountLabel, e.status]
        .some(v => (v || '').toString().toLowerCase().includes(term)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, chartOfAccounts, accounts, expDate, expCategory, expStatus, expSearch])

  const visibleExpColumns = useMemo(() => EXP_COLUMNS.filter(c => expColumns.includes(c.id)), [expColumns])
  // What has been done *in this module* — built from the records General Account
  // Management itself creates, not from the system-wide audit log in Settings (that one
  // carries logins, loan approvals and user-management changes, none of which happen here,
  // and it has never carried an accounting action). Settings audit-log rows whose module is
  // accounting are still folded in, so the tab picks them up if action logging is added later.
  const auditLogRows = useMemo(() => {
    const rows = []

    for (const j of journalEntries || []) {
      rows.push({
        ...auditAt(j.createdAt || j.date, (j.createdAt || '').slice(11, 19)),
        user: j.createdBy || '—',
        action: `${j.entryType || 'Journal entry'} posted`,
        reference: j.transactionNo || j.id,
        amount: j.amount ?? (j.lines || []).reduce((s, l) => s + (l.debit || 0), 0),
      })
    }
    for (const t of cashTransfers || []) {
      rows.push({
        ...auditAt(t.date),
        user: t.createdBy || '—',
        action: `Cash transfer ${t.fromName} → ${t.toName}`,
        reference: t.ref,
        amount: t.amount || 0,
      })
    }
    for (const i of incomes || []) {
      rows.push({ ...auditAt(i.date), user: i.createdBy || '—', action: `Income recorded — ${i.category || 'entry'}`, reference: i.code, amount: i.amount || 0 })
    }
    for (const e of expenses || []) {
      rows.push({ ...auditAt(e.date), user: e.createdBy || '—', action: `Expense submitted — ${e.category || 'entry'}`, reference: e.code, amount: e.amount || 0 })
      // An approval is its own event: a different person, on a different date, releasing
      // the funds the submission only requested.
      if (e.status === 'Approved' && e.approvedDate) {
        rows.push({ ...auditAt(e.approvedDate), user: e.approvedBy || '—', action: `Expense approved — ${e.category || 'entry'}`, reference: e.code, amount: e.amount || 0 })
      }
    }
    for (const log of state.auditLogs || []) {
      if (!/account/i.test(log.module || '')) continue
      rows.push({ ...auditAt(log.timestamp, (log.timestamp || '').slice(11, 19)), user: log.user, action: log.action, reference: log.module, amount: null })
    }

    return rows.sort(byNewest)
  }, [journalEntries, cashTransfers, incomes, expenses, state.auditLogs])

  // What has been done in Payroll Management, in the same shape as the general card's log
  // above. Two sources, because payroll has two kinds of event:
  //  · the money — runs processed and salary postings approved, read off the records
  //    themselves the way the general log reads journals and expenses;
  //  · the register — an employee added, edited or removed. Nothing is left behind to read
  //    for those (a removed employee takes their record with them), so they are written to
  //    the audit trail as they happen and folded back in here by module.
  const payrollAuditRows = useMemo(() => {
    const rows = []
    // A run posts one expense under the run's own code, so the run *is* that posting event —
    // logging both would double every month. Postings made outside a run have no run to
    // speak for them, so those are reported on their own.
    const runByCode = new Map((payrollRuns || []).map(r => [r.code, r]))

    for (const r of payrollRuns || []) {
      const count = (r.lines || []).length
      rows.push({
        ...auditAt(r.createdAt || r.date, (r.createdAt || '').slice(11, 19)),
        user: r.createdBy || '—',
        action: `Payroll processed — ${periodLabel(r.period)} · ${count} employee${count === 1 ? '' : 's'}`,
        reference: r.code,
        amount: r.total || 0,
      })
    }
    for (const e of payrollEntries) {
      const run = runByCode.get(e.code)
      if (!run) {
        rows.push({ ...auditAt(e.date), user: e.createdBy || '—', action: `Salary posting submitted — ${e.category || 'entry'}`, reference: e.code, amount: e.amount || 0 })
      }
      // The approval is its own event — a different person, on a different date, releasing
      // the money the run only committed.
      if (e.status === 'Approved' && e.approvedDate) {
        rows.push({
          ...auditAt(e.approvedDate),
          user: e.approvedBy || '—',
          action: run ? `Payroll approved — ${periodLabel(run.period)}` : 'Salary payment approved',
          reference: e.code,
          amount: e.amount || 0,
        })
      }
    }
    for (const log of state.auditLogs || []) {
      if (!/payroll/i.test(log.module || '')) continue
      rows.push({
        ...auditAt(log.timestamp, (log.timestamp || '').slice(11, 19)),
        user: log.user,
        action: log.action,
        reference: log.reference || log.module,
        amount: log.amount ?? null,
      })
    }

    return rows.sort(byNewest)
  }, [payrollRuns, payrollEntries, state.auditLogs])

  // ── handlers ─────────────────────────────────────────────────────────
  function handleAddTransaction(entry) {
    if (!can('manage_accounting')) {
      showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')
      return
    }
    if (transactionModalType === 'Income') {
      dispatch({ type: 'ADD_INCOME', entry })
      showToast('Income entry recorded', 'success')
    } else {
      dispatch({ type: 'ADD_EXPENSE', entry })
      showToast('Expense submitted for approval', 'info')
    }
    dispatch({ type: 'CLOSE_TRANSACTION_MODAL' })
  }

  function handleAddTransfer(transfer) {
    if (!can('manage_accounting')) {
      showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')
      return
    }
    dispatch({ type: 'ADD_CASH_TRANSFER', transfer })
    showToast('Cash transfer completed', 'success')
  }

  function viewAccountHistory(code) {
    dispatch({ type: 'OPEN_ACCOUNT_HISTORY', code })
  }

  // Exports exactly what the table is showing — same columns, same filtered rows, same
  // order — so a PDF can be traced back to the view it came from.
  function handleDownloadLedgerPdf() {
    if (glEntries.length === 0) return
    const money = v => formatVal(v, currency)
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('General Ledger', 14, 21)
    doc.setFontSize(8)
    const scope = [
      glAccountFilter === 'all' ? 'All accounts' : `${glAccountFilter} — ${accountName(glAccountFilter)}`,
      glFilter === 'all' ? 'All types' : glFilter,
      glDate || 'All dates',
      glSearch.trim() ? `search "${glSearch.trim()}"` : null,
    ].filter(Boolean).join(' · ')
    doc.text(scope, 14, 26)

    const showDebit = glColumns.includes('debit')
    const showCredit = glColumns.includes('credit')
    const foot = [[
      'Totals',
      ...Array(Math.max(glTotalsSpan - 1, 0)).fill(''),
      ...(showDebit ? [money(glEntries.reduce((s, e) => s + e.debit, 0))] : []),
      ...(showCredit ? [money(glEntries.reduce((s, e) => s + e.credit, 0))] : []),
    ]]

    autoTable(doc, {
      startY: 31,
      head: [visibleGlColumns.map(c => c.label)],
      body: glEntries.map(e => visibleGlColumns.map(c => c.text(e, money))),
      foot: glTotalsSpan > 0 ? foot : undefined,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
    })
    doc.save(`general-ledger-${glDate || 'all-dates'}.pdf`)
    showToast('General Ledger exported', 'success')
  }

  function handleDownloadExpensePdf() {
    if (expenseRows.length === 0 || visibleExpColumns.length === 0) return
    const money = v => formatVal(v, currency)
    // The Approve button is an action, not information — it stays off the paper.
    const cols = visibleExpColumns.filter(c => c.id !== 'action')
    if (cols.length === 0) return
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Expense', 14, 21)
    doc.setFontSize(8)
    doc.text([
      expDate || 'All dates',
      expCategory === 'all' ? 'All categories' : expCategory,
      expStatus === 'all' ? 'All statuses' : expStatus,
      expSearch.trim() ? `search "${expSearch.trim()}"` : null,
      `${expenseRows.length} entr${expenseRows.length === 1 ? 'y' : 'ies'} · ${money(expenseRows.reduce((s, e) => s + (e.amount || 0), 0))}`,
    ].filter(Boolean).join(' · '), 14, 26)

    autoTable(doc, {
      startY: 31,
      head: [cols.map(c => c.label)],
      body: expenseRows.map(e => cols.map(c => c.text(e, money))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
    })
    doc.save(`expense-${expDate || 'all-dates'}.pdf`)
    showToast('Expenses exported', 'success')
  }

  function handleDownloadIncomePdf() {
    if (incomeRows.length === 0 || visibleIncColumns.length === 0) return
    const money = v => formatVal(v, currency)
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Income', 14, 21)
    doc.setFontSize(8)
    doc.text([
      incDate || 'All dates',
      incCategory === 'all' ? 'All categories' : incCategory,
      incSearch.trim() ? `search "${incSearch.trim()}"` : null,
      `${incomeRows.length} entr${incomeRows.length === 1 ? 'y' : 'ies'} · ${money(incomeRows.reduce((s, e) => s + (e.amount || 0), 0))}`,
    ].filter(Boolean).join(' · '), 14, 26)

    autoTable(doc, {
      startY: 31,
      head: [visibleIncColumns.map(c => c.label)],
      body: incomeRows.map(e => visibleIncColumns.map(c => c.text(e, money))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
    })
    doc.save(`income-${incDate || 'all-dates'}.pdf`)
    showToast('Income exported', 'success')
  }

  function handleDownloadTransfersPdf() {
    if (transferRows.length === 0 || visibleCtColumns.length === 0) return
    const money = v => formatVal(v, currency)
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Cash Transfers', 14, 21)
    doc.setFontSize(8)
    doc.text([
      ctAccount === 'all' ? 'All accounts' : `${ctAccount} — ${accountName(ctAccount)}`,
      ctSearch.trim() ? `search "${ctSearch.trim()}"` : null,
      `${transferRows.length} transfer${transferRows.length === 1 ? '' : 's'} · ${money(transferRows.reduce((s, t) => s + (t.amount || 0), 0))}`,
    ].filter(Boolean).join(' · '), 14, 26)

    autoTable(doc, {
      startY: 31,
      head: [visibleCtColumns.map(c => c.label)],
      body: transferRows.map(t => visibleCtColumns.map(c => c.text(t, money))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
    })
    doc.save('cash-transfers.pdf')
    showToast('Cash transfers exported', 'success')
  }

  function handleDownloadSinglePdf() {
    if (singlePostings.length === 0 || visibleSeColumns.length === 0) return
    const money = v => formatVal(v, currency)
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Single Entries', 14, 21)
    doc.setFontSize(8)
    doc.text([
      seSide === 'all' ? 'Debit and credit' : `${seSide} only`,
      seSearch.trim() ? `search "${seSearch.trim()}"` : null,
      `${singlePostings.length} entr${singlePostings.length === 1 ? 'y' : 'ies'}`,
    ].filter(Boolean).join(' · '), 14, 26)

    autoTable(doc, {
      startY: 31,
      head: [visibleSeColumns.map(c => c.label)],
      body: singlePostings.map(j => visibleSeColumns.map(c => c.text(j, money))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
    })
    doc.save('single-entries.pdf')
    showToast('Single entries exported', 'success')
  }

  function handleDownloadJournalPdf() {
    if (journalPostings.length === 0 || visibleJeColumns.length === 0) return
    const money = v => formatVal(v, currency)
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Journal Entries', 14, 21)
    doc.setFontSize(8)
    doc.text([
      jeType === 'all' ? 'All types' : jeType,
      jeSearch.trim() ? `search "${jeSearch.trim()}"` : null,
      `${journalPostings.length} entr${journalPostings.length === 1 ? 'y' : 'ies'}`,
    ].filter(Boolean).join(' · '), 14, 26)

    autoTable(doc, {
      startY: 31,
      head: [visibleJeColumns.map(c => c.label)],
      body: journalPostings.map(j => visibleJeColumns.map(c => c.text(j, money))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
    })
    doc.save('journal-entries.pdf')
    showToast('Journal entries exported', 'success')
  }

  // Same contract as the ledger export: whatever the table is showing, minus the Actions
  // column, which is nothing but buttons on paper.
  function handleDownloadChartPdf() {
    if (coaGroups.length === 0) return
    const cols = visibleCoaColumns.filter(c => c.id !== 'actions')
    if (cols.length === 0) return
    const doc = new jsPDF({ orientation: 'landscape' })
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(state.companyProfile.name, 14, 15)
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text('Chart of Accounts', 14, 21)
    doc.setFontSize(8)
    const total = coaGroups.reduce((s, g) => s + g.accounts.length, 0)
    doc.text([
      coaFilter === 'ALL' ? 'All types' : sentenceCase(coaFilter),
      coaSearch.trim() ? `search "${coaSearch.trim()}"` : null,
      `${total} account${total === 1 ? '' : 's'}`,
    ].filter(Boolean).join(' · '), 14, 26)

    // Each type keeps its band, carried as a full-width row so the export reads like the
    // table rather than one flat list.
    const body = coaGroups.flatMap(g => ([
      [{
        content: `${g.typeDisplay} — ${g.accounts.length} account${g.accounts.length === 1 ? '' : 's'}`,
        colSpan: cols.length,
        styles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
      }],
      ...g.accounts.map(a => cols.map(c => c.text(a))),
    ]))

    autoTable(doc, {
      startY: 31,
      head: [cols.map(c => c.label)],
      body,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [0, 71, 171] },
    })
    doc.save('chart-of-accounts.pdf')
    showToast('Chart of Accounts exported', 'success')
  }

  // Handed to the expense Action column so its button stays with the column definition.
  const expenseRowActions = { onApprove: handleApproveExpense }

  // Handed to the Actions column so its buttons stay with the column definition.
  const coaRowActions = {
    onEdit: acct => { setEditingCoa(acct); setCoaModalOpen(true) },
    onView: viewAccountHistory,
    onDelete: setDeletingCoa,
  }

  function handleApproveExpense(code) {
    if (!can('manage_accounting')) {
      showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')
      return
    }
    // Approving is what releases the money, so it is where the account has to be able to
    // cover it. Named amounts rather than a bare "insufficient funds", because the fix is a
    // transfer of a specific size into a specific account.
    const exp = expenses.find(e => e.code === code)
    if (exp && !canFundExpense(state, exp)) {
      const funding = expenseFundingAccount(state, exp.account)
      const held = funding?.balance || 0
      showToast(
        `${funding?.name || exp.account} holds ${formatVal(held, currency)} — ${formatVal(exp.amount - held, currency)} short of this ${formatVal(exp.amount, currency)} posting. Transfer funds into the account first.`,
        'error'
      )
      return
    }
    setApprovingExpense(exp)
  }

  function confirmApproveExpense() {
    if (!approvingExpense) return
    dispatch({ type: 'APPROVE_EXPENSE', code: approvingExpense.code })
    showToast('Expense approved — funds released from the account', 'success')
    setApprovingExpense(null)
  }

  // Each card opens as its own page: the cards give way to that card's content with a
  // back arrow, rather than expanding a panel underneath them.
  const activeCard = CARDS.find(c => c.id === openCard) || null

  function openCardPage(id) {
    // Each card opens on its first section — General and Payroll on their first tab, the
    // loan card on Account Payable — so no card ever lands on an empty body.
    dispatch({ type: 'SET_ACCOUNTING_TAB', tab: id === 'general' ? GENERAL_TABS[0].id : null })
    setLoanAccountView(LOAN_ACCOUNT_VIEWS[0])
    setPayrollTab(PAYROLL_TABS[0].id)
    setOpenCard(id)
  }

  function closeCardPage() {
    dispatch({ type: 'SET_ACCOUNTING_TAB', tab: null })
    setLoanAccountView(LOAN_ACCOUNT_VIEWS[0])
    setAccountSettingOpen(false)
    setOpenCard(null)
  }

  // ── table th helper ─────────────────────────────────────────────────
  const Th = ({ children, right }) => (
    <th className={`px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 first:rounded-tl-xl last:rounded-tr-xl ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )

  return (
    <>
    <div className="p-4 sm:p-6 space-y-6">
      {/* Landing: the module title and its cards. Picking a card replaces this view with
          that card's own page (below), so only one of the two is ever on screen. */}
      {openCard === null && (
      <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Account Management</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(card => {
          const stats = {
            general: [
              { label: 'Accounts', value: String(generalGlAccounts.length) },
              { label: 'Cash & assets', value: formatVal(generalCashBalance, currency) },
            ],
            loan: [
              { label: 'Payable', value: formatVal(payableTotal, currency) },
              { label: 'Receivable', value: formatVal(loanTotals.outstanding, currency) },
            ],
            payroll: [
              { label: 'Employees', value: String(employees.length) },
              { label: 'Salaries paid', value: formatVal(payrollPaid, currency) },
            ],
          }[card.id]
          return (
            <button
              key={card.id}
              onClick={() => openCardPage(card.id)}
              className={`group relative overflow-hidden flex flex-col items-start text-left p-5 pt-6 min-h-[200px] rounded-2xl border shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 bg-white border-slate-200/60 dark:bg-slate-800 dark:border-slate-700 ${card.hover}`}
            >
              {/* Accent strip along the top edge — full colour on hover */}
              <span className={`absolute inset-x-0 top-0 h-1 ${card.bar} opacity-40 group-hover:opacity-100 transition-opacity`} />

              {/* Icon and title share the top row — the title carries the card, so it is
                  the largest text on it. The chevron sits in the footer rather than
                  competing with the title for width. */}
              <div className="w-full flex items-start gap-3">
                <div className={`p-3 rounded-xl flex-shrink-0 transition-colors ${card.idle}`}>
                  <card.icon className="w-6 h-6" />
                </div>
                {/* Title and subtitle share one column so both start at the same edge */}
                <div className="min-w-0 text-left">
                  <p className="text-base sm:text-lg font-bold leading-tight whitespace-nowrap text-slate-800 dark:text-slate-100">
                    {card.label}
                  </p>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">{card.desc}</p>
                </div>
              </div>

              <div className="w-full mt-auto pt-4 flex items-end gap-2 border-t border-slate-100 dark:border-slate-700/70">
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                  {stats.map(s => (
                    <div key={s.label} className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">{s.label}</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{s.value}</p>
                    </div>
                  ))}
                </div>
                <ChevronRight className="w-4 h-4 flex-shrink-0 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          )
        })}
      </div>
      </>
      )}

      {/* Page header for the card that is open — back arrow returns to the cards */}
      {activeCard && (
        <div className="flex items-center gap-3">
          <button
            onClick={closeCardPage}
            title="Back to Account Management"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 min-w-0">{activeCard.label}</h1>
          {/* Account Setting sits at the far end of the title row — it opens the module's
              setup rather than switching what the page below is showing, so it is kept off
              the tab bar. The label drops on narrow screens; the gear carries it. */}
          {openCard === 'general' && (
            <button
              onClick={() => setAccountSettingOpen(true)}
              title="Account Setting"
              className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Account Setting</span>
            </button>
          )}
        </div>
      )}

      {/* General Account Management tabs — one is always selected, General Ledger by
          default, so the page never sits on an empty body. */}
      {openCard === 'general' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
            {GENERAL_TABS.map(tab => {
              const active = accountingTab === tab.id
              // The audit log is a log rather than a working view, so it sits apart at
              // the right end — same placement as the loan detail audit log tab.
              const pushRight = tab.id === 'audit-log'
              return (
                <button
                  key={tab.id}
                  onClick={() => dispatch({ type: 'SET_ACCOUNTING_TAB', tab: tab.id })}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${pushRight ? 'ml-auto flex-shrink-0' : ''} ${
                    active
                      ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Panel: Loan Account Management — exactly two accounts. Payable is principal
          committed but not yet released; Receivable is principal out with borrowers. */}
      {openCard === 'loan' && (
        <div className="space-y-4">
          {/* Same tab bar as the general and payroll cards, down to the active colour —
              the bar means the same thing on every card, so it reads the same on each.
              One tab is always selected — Payable by default — so the page never sits on
              an empty body. */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
              {LOAN_ACCOUNT_TABS.map(tab => {
                const active = loanAccountView === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setLoanAccountView(tab.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${
                      active
                        ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {/* The chart-of-accounts code, so the tab and the ledger account it
                        posts to are visibly the same thing. Dimmed on the inactive tab so
                        it never competes with the label for attention. */}
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      active
                        ? 'bg-blue-100/70 text-[#0047ab] dark:bg-blue-900/50 dark:text-blue-400'
                        : 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                    }`}>
                      {tab.code}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* No balance line above the tables — each table's footer already totals its own
              account, so a figure here would only restate it. */}

          {/* No heading on either table — the selected tab above already names the
              account and shows its code, so a title here would only repeat it. */}
          {loanAccountView === 'payable' && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Loan Ref</Th>
                      <Th>Customer</Th>
                      <Th>Product</Th>
                      <Th>Status</Th>
                      {/* One date column for both kinds of row: the date the money left
                          for a released loan, the date it is due to leave for one still
                          awaiting release. The status beside it says which is which. */}
                      <Th>Release Date</Th>
                      <Th right>Payable</Th>
                      <Th right>Disbursed</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {loanPayableRows.length === 0
                      ? <EmptyState message="No payable yet — a loan appears here once it has been approved for release." />
                      : loanPayableRows.map(r => (
                        <tr key={r.ref} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono font-bold text-brand-600 dark:text-brand-400">{r.ref}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100">{r.customerName}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.product}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              r.released
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                            }`}>
                              {r.released ? 'Released' : 'Awaiting Release'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.dueDate}</td>
                          {/* A loan sits on exactly one side of the account, so the other
                              side is a dash rather than a zero — a column of $0.00 reads
                              as a figure that was calculated, not one that doesn't apply. */}
                          <td className="px-4 py-3 text-xs font-semibold text-rose-600 dark:text-rose-400 text-right whitespace-nowrap">
                            {r.released ? '—' : formatVal(r.payable, currency)}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-right whitespace-nowrap">
                            {r.released ? formatVal(r.disbursed, currency) : '—'}
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                  {loanPayableRows.length > 0 && (
                    <tfoot>
                      {/* Payable first, so the column the card's figure is the sum of sits
                          under the card. Disbursed is the settled side of the same
                          account, reported alongside rather than in place of it. */}
                      <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                        <td colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Totals</td>
                        <td className="px-4 py-3 text-xs font-bold text-rose-600 text-right whitespace-nowrap">{formatVal(payableTotals.payable, currency)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-emerald-600 text-right whitespace-nowrap">{formatVal(payableTotals.disbursed, currency)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {loanAccountView === 'receivable' && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Loan Ref</Th>
                      <Th>Customer</Th>
                      <Th>Product</Th>
                      <Th right>Principal</Th>
                      <Th right>Collected</Th>
                      <Th right>Receivable</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {loanAccountRows.length === 0
                      ? <EmptyState message="No receivables yet — accounts appear once a loan is released." />
                      : loanAccountRows.map(r => (
                        <tr key={r.ref} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono font-bold text-brand-600 dark:text-brand-400">{r.ref}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100">{r.customerName}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{r.product}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 text-right whitespace-nowrap">{formatVal(r.principal, currency)}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 text-right whitespace-nowrap">{formatVal(r.repaid, currency)}</td>
                          <td className="px-4 py-3 text-xs font-bold text-amber-600 dark:text-amber-400 text-right whitespace-nowrap">{formatVal(r.outstanding, currency)}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                  {loanAccountRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                        <td colSpan={3} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Totals</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">{formatVal(loanTotals.principal, currency)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-emerald-600 text-right whitespace-nowrap">{formatVal(loanTotals.repaid, currency)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-amber-600 text-right whitespace-nowrap">{formatVal(loanTotals.outstanding, currency)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Payroll Management tabs — same bar as the general card, active colour included */}
      {openCard === 'payroll' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
            {PAYROLL_TABS.map(tab => {
              const active = payrollTab === tab.id
              // Same placement as the general card's audit log — a log rather than a working
              // view, so it sits apart at the right end of the bar.
              const pushRight = tab.id === 'audit-log'
              return (
                <button
                  key={tab.id}
                  onClick={() => setPayrollTab(tab.id)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${pushRight ? 'ml-auto flex-shrink-0' : ''} ${
                    active
                      ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Panel: Employee Information — the staff register payroll pays, with its own
          Add/Edit modal */}
      {openCard === 'payroll' && payrollTab === 'employees' && <EmployeeInformation />}

      {/* Panel: Salary Payment — the record of every salary posting made against a payroll
          account, read-only apart from processing a new period. Approving is the Approval
          tab's job, so the gate lives in one place rather than on two tables. */}
      {openCard === 'payroll' && payrollTab === 'salary' && (
        <div className="space-y-4">
          {/* No heading and no stat cards — the active tab names the page, the Status column
              says which postings are paid and which are pending, and the footer totals them.
              Process Payroll sits on the table's own toolbar, the way Add does on the employee
              register, so the action stays reachable without a header band to hold it. */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-700">
              {/* No icon — Process Payroll runs a period, it does not add a row, so a plus
                  described the wrong action */}
              <button
                onClick={() => setPayrollRunOpen(true)}
                className="ml-auto px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 shadow-sm transition-colors"
              >
                Process Payroll
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Ref</Th>
                    <Th>Description</Th>
                    <Th>Account</Th>
                    <Th right>Amount</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {payrollEntries.length === 0
                    ? <EmptyState message="No salary payments recorded yet." />
                    : payrollEntries.map((e, i) => (
                      <tr key={`${e.code}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.date}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">{e.code}</td>
                        <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{e.description || e.category}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{accountName(e.account)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">{formatVal(e.amount, currency)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={e.status || 'Pending'} size="xs" />
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
                {payrollEntries.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                      <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Total Posted</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">
                        {formatVal(payrollPaid + payrollPending, currency)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Panel: Approval — the gate between a salary being committed and the money leaving the
          payroll account, and the only place that gate is offered. Salary Payment lists the
          same postings as a record; this tab is that list filtered to what still needs deciding. */}
      {openCard === 'payroll' && payrollTab === 'approval' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Ref</Th>
                  <Th>Period</Th>
                  <Th>Description</Th>
                  <Th>Account</Th>
                  <Th right>Employees</Th>
                  <Th right>Amount</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {payrollApprovals.length === 0
                  ? <EmptyState message="Nothing awaiting approval — every salary posting has been released." />
                  : payrollApprovals.map((e, i) => (
                    <tr key={`${e.code}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.date}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">{e.code}</td>
                      {/* Only a payroll run has a period — a one-off salary posting is dated, not monthly */}
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{e.period ? periodLabel(e.period) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{e.description || e.category}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{accountName(e.account)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 text-right">{e.employeeCount || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400 text-right whitespace-nowrap">{formatVal(e.amount, currency)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleApproveExpense(e.code)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors whitespace-nowrap"
                        >
                          <Check className="w-3 h-3" /> Approve
                        </button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
              {/* No Status column and no status footer — every row here is pending by
                  definition. What the total answers is how much leaves the account if the
                  whole queue is approved. */}
              {payrollApprovals.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                    <td colSpan={6} className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Awaiting Approval</td>
                    <td className="px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-400 text-right whitespace-nowrap">
                      {formatVal(payrollPending, currency)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Panel: Payroll Account — the chart-of-accounts entries salary postings land in, and
          what is left in them to pay with. */}
      {openCard === 'payroll' && payrollTab === 'account' && (
        <div className="space-y-4">
          {/* No heading and no balance card — the active tab names the page and the table
              below carries each account's own balance, which is what the card restated. */}
          <GlAccountTable
            accounts={payrollGlAccounts}
            currency={currency}
            emptyMessage="No payroll account defined yet."
          />
        </div>
      )}

      {/* Panel: Audit Log — who did what in this module: the register edited, a period run,
          a run approved. Same columns as the general card's log, so the two read alike. */}
      {openCard === 'payroll' && payrollTab === 'audit-log' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th>Date</Th>
                  <Th>Time</Th>
                  <Th>Action</Th>
                  <Th>Reference</Th>
                  <Th>User</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {payrollAuditRows.length === 0
                  ? <EmptyState message="Nothing has been done in payroll yet." />
                  : payrollAuditRows.map((row, i) => (
                    <tr key={`${row.reference}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.date || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.timeLabel || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{row.action}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.reference}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.user}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">
                        {row.amount == null ? '—' : formatVal(row.amount, currency)}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Tab: New Journal Entry — the double-entry postings, newest first, with the
          creator alongside them. Single Entry postings have their own tab. */}
      {accountingTab === 'journal-entry' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={jeType}
                onChange={e => setJeType(e.target.value)}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Types</option>
                {journalTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={jeSearch}
                onChange={e => setJeSearch(e.target.value)}
                placeholder="Search…"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <button
                onClick={() => can('manage_accounting') ? setJournalEntryModalOpen(true) : showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-colors ${
                  can('manage_accounting') ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> New Journal Entry
              </button>
              {/* View settings — which columns the table (and its export) carry */}
              <div className="relative">
                <button
                  onClick={() => setJeViewOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Columns3 className="w-3.5 h-3.5" /> View
                </button>
                {jeViewOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setJeViewOpen(false)} />
                    <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
                      {JE_COLUMNS.map(col => {
                        const shown = jeColumns.includes(col.id)
                        const lastOne = shown && jeColumns.length === 1
                        return (
                          <label
                            key={col.id}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown}
                              disabled={lastOne}
                              onChange={() => setJeColumns(cols =>
                                cols.includes(col.id) ? cols.filter(c => c !== col.id) : JE_COLUMNS.filter(c => cols.includes(c.id) || c.id === col.id).map(c => c.id)
                              )}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                            />
                            {col.label}
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleDownloadJournalPdf}
                disabled={journalPostings.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {visibleJeColumns.map(col => <Th key={col.id} right={col.right}>{col.label}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {journalPostings.length === 0
                  ? <EmptyState message="No journal entries found." />
                  : journalPostings.map((j, i) => (
                    <tr key={j.id || `${j.transactionNo}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      {visibleJeColumns.map(col => (
                        <td
                          key={col.id}
                          className={`px-4 py-3 text-xs ${col.cellClass || 'text-slate-600 dark:text-slate-300'} ${col.right ? 'text-right whitespace-nowrap' : ''}`}
                          title={col.id === 'memo' ? j.memo : undefined}
                        >
                          {col.render(j, v => formatVal(v, currency))}
                        </td>
                      ))}
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Tab: Single Entry — one-sided postings against a single account */}
      {accountingTab === 'single-entry' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={seSide}
                onChange={e => setSeSide(e.target.value)}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Types</option>
                <option value="Debit">Debit</option>
                <option value="Credit">Credit</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={seSearch}
                onChange={e => setSeSearch(e.target.value)}
                placeholder="Search…"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <button
                onClick={() => can('manage_accounting') ? setSingleEntryModalOpen(true) : showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-colors ${
                  can('manage_accounting') ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> New Single Entry
              </button>
              {/* View settings — which columns the table (and its export) carry */}
              <div className="relative">
                <button
                  onClick={() => setSeViewOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Columns3 className="w-3.5 h-3.5" /> View
                </button>
                {seViewOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setSeViewOpen(false)} />
                    <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
                      {SE_COLUMNS.map(col => {
                        const shown = seColumns.includes(col.id)
                        const lastOne = shown && seColumns.length === 1
                        return (
                          <label
                            key={col.id}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown}
                              disabled={lastOne}
                              onChange={() => setSeColumns(cols =>
                                cols.includes(col.id) ? cols.filter(c => c !== col.id) : SE_COLUMNS.filter(c => cols.includes(c.id) || c.id === col.id).map(c => c.id)
                              )}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                            />
                            {col.label}
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleDownloadSinglePdf}
                disabled={singlePostings.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {visibleSeColumns.map(col => <Th key={col.id} right={col.right}>{col.label}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {singlePostings.length === 0
                  ? <EmptyState message="No single entries found." />
                  : singlePostings.map((j, i) => (
                    <tr key={j.id || `${j.transactionNo}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      {visibleSeColumns.map(col => (
                        <td
                          key={col.id}
                          className={`px-4 py-3 text-xs ${col.cellClass || 'text-slate-600 dark:text-slate-300'} ${col.right ? 'text-right whitespace-nowrap' : ''}`}
                          title={col.id === 'memo' ? j.memo : undefined}
                        >
                          {col.render(j, v => formatVal(v, currency))}
                        </td>
                      ))}
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Tab: Income — every income posting, recordable from here */}
      {accountingTab === 'income' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={incCategory}
                onChange={e => setIncCategory(e.target.value)}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Categories</option>
                {incomeCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* One date — blank means every date */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={incDate}
                onChange={e => setIncDate(e.target.value)}
                title="Filter by date"
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {incDate && (
                <button
                  onClick={() => setIncDate('')}
                  title="Clear date"
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={incSearch}
                onChange={e => setIncSearch(e.target.value)}
                placeholder="Search…"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <button
                onClick={() => can('manage_accounting') ? dispatch({ type: 'OPEN_TRANSACTION_MODAL', transactionType: 'Income' }) : showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-colors ${
                  can('manage_accounting') ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Record Income
              </button>
              {/* View settings — which columns the table (and its export) carry */}
              <div className="relative">
                <button
                  onClick={() => setIncViewOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Columns3 className="w-3.5 h-3.5" /> View
                </button>
                {incViewOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setIncViewOpen(false)} />
                    <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
                      {INC_COLUMNS.map(col => {
                        const shown = incColumns.includes(col.id)
                        const lastOne = shown && incColumns.length === 1
                        return (
                          <label
                            key={col.id}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown}
                              disabled={lastOne}
                              onChange={() => setIncColumns(cols =>
                                cols.includes(col.id) ? cols.filter(c => c !== col.id) : INC_COLUMNS.filter(c => cols.includes(c.id) || c.id === col.id).map(c => c.id)
                              )}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                            />
                            {col.label}
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleDownloadIncomePdf}
                disabled={incomeRows.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {visibleIncColumns.map(col => <Th key={col.id} right={col.right}>{col.label}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {incomeRows.length === 0
                  ? <EmptyState message="No income found." />
                  : incomeRows.map((e, i) => (
                    <tr key={`${e.code}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      {visibleIncColumns.map(col => (
                        <td
                          key={col.id}
                          className={`px-4 py-3 text-xs ${col.cellClass || 'text-slate-600 dark:text-slate-300'} ${col.right ? 'text-right whitespace-nowrap' : ''}`}
                          title={col.id === 'description' ? e.description : undefined}
                        >
                          {col.render(e, v => formatVal(v, currency))}
                        </td>
                      ))}
                    </tr>
                  ))
                }
              </tbody>
              {incomeRows.length > 0 && incColumns.includes('amount') && (
                <tfoot>
                  <tr>
                    {visibleIncColumns.length > 1 && (
                      <td colSpan={visibleIncColumns.length - 1} className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">Total</td>
                    )}
                    <td className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 text-right whitespace-nowrap bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">
                      {formatVal(incomeRows.reduce((s, e) => s + (e.amount || 0), 0), currency)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}


      {/* Tab: Expense — postings plus the approval that releases the funds */}
      {accountingTab === 'expense' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={expCategory}
                onChange={e => setExpCategory(e.target.value)}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Categories</option>
                {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={expStatus}
                onChange={e => setExpStatus(e.target.value)}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending Approval</option>
                <option value="Approved">Approved</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* One date — blank means every date */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={expDate}
                onChange={e => setExpDate(e.target.value)}
                title="Filter by date"
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {expDate && (
                <button
                  onClick={() => setExpDate('')}
                  title="Clear date"
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={expSearch}
                onChange={e => setExpSearch(e.target.value)}
                placeholder="Search…"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <button
                onClick={() => can('manage_accounting') ? dispatch({ type: 'OPEN_TRANSACTION_MODAL', transactionType: 'Expense' }) : showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition-colors ${
                  can('manage_accounting') ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Record Expense
              </button>
              {/* View settings — which columns the table (and its export) carry */}
              <div className="relative">
                <button
                  onClick={() => setExpViewOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Columns3 className="w-3.5 h-3.5" /> View
                </button>
                {expViewOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setExpViewOpen(false)} />
                    <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
                      {EXP_COLUMNS.map(col => {
                        const shown = expColumns.includes(col.id)
                        const lastOne = shown && expColumns.length === 1
                        return (
                          <label
                            key={col.id}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown}
                              disabled={lastOne}
                              onChange={() => setExpColumns(cols =>
                                cols.includes(col.id) ? cols.filter(c => c !== col.id) : EXP_COLUMNS.filter(c => cols.includes(c.id) || c.id === col.id).map(c => c.id)
                              )}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                            />
                            {col.label}
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleDownloadExpensePdf}
                disabled={expenseRows.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {visibleExpColumns.map(col => <Th key={col.id} right={col.right}>{col.label}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {expenseRows.length === 0
                  ? <EmptyState message="No expenses found." />
                  : expenseRows.map((e, i) => (
                    <tr key={`${e.code}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      {visibleExpColumns.map(col => (
                        <td
                          key={col.id}
                          className={`px-4 py-3 text-xs ${col.cellClass || 'text-slate-600 dark:text-slate-300'} ${col.right ? 'text-right whitespace-nowrap' : ''}`}
                          title={col.id === 'description' ? e.description : undefined}
                        >
                          {col.render(e, v => formatVal(v, currency), expenseRowActions)}
                        </td>
                      ))}
                    </tr>
                  ))
                }
              </tbody>
              {expenseRows.length > 0 && expColumns.includes('amount') && (
                <tfoot>
                  <tr>
                    {visibleExpColumns.findIndex(c => c.id === 'amount') > 0 && (
                      <td colSpan={visibleExpColumns.findIndex(c => c.id === 'amount')} className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">Total</td>
                    )}
                    <td className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-rose-600 dark:text-rose-400 text-right whitespace-nowrap bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">
                      {formatVal(expenseRows.reduce((s, e) => s + (e.amount || 0), 0), currency)}
                    </td>
                    {visibleExpColumns.length - visibleExpColumns.findIndex(c => c.id === 'amount') - 1 > 0 && (
                      <td colSpan={visibleExpColumns.length - visibleExpColumns.findIndex(c => c.id === 'amount') - 1} className="sticky bottom-0 z-10 px-4 py-3 bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600" />
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}


      {/* Tab: Audit Log — the audit trail, accounting actions first */}
      {accountingTab === 'audit-log' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th>Date</Th>
                  <Th>Time</Th>
                  <Th>Action</Th>
                  <Th>Reference</Th>
                  <Th>User</Th>
                  <Th right>Amount</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {auditLogRows.length === 0
                  ? <EmptyState message="Nothing has been posted in this module yet." />
                  : auditLogRows.map((row, i) => (
                    <tr key={`${row.reference}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.date || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.timeLabel || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{row.action}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.reference}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.user}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap">
                        {row.amount == null ? '—' : formatVal(row.amount, currency)}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Panel: Cash Transfer */}
      {accountingTab === 'cash-transfer' && (
        <div id="acct-panel-cash-transfer" className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table */}
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={ctAccount}
                onChange={e => setCtAccount(e.target.value)}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Accounts</option>
                {/* Same hierarchy as the General Ledger picker — see accountPickerOptions. */}
                {accountPickerOptions.map(({ account, isSub }) => (
                  <option key={account.code} value={account.code}>
                    {isSub
                      ? `↳ ${account.code} — ${account.name} · under ${account.parentCode}`
                      : `${account.code} — ${account.name}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={ctSearch}
                onChange={e => setCtSearch(e.target.value)}
                placeholder="Search…"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <button
                onClick={() => can('manage_accounting') ? dispatch({ type: 'OPEN_CASH_TRANSFER_MODAL' }) : showToast(`${state.currentRole} does not have permission to manage income & expense.`, 'error')}
                title={can('manage_accounting') ? undefined : `${state.currentRole} cannot manage accounting`}
                className={`flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors ${
                  can('manage_accounting') ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> New Transfer
              </button>
              {/* View settings — which columns the table (and its export) carry */}
              <div className="relative">
                <button
                  onClick={() => setCtViewOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Columns3 className="w-3.5 h-3.5" /> View
                </button>
                {ctViewOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setCtViewOpen(false)} />
                    <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
                      {CT_COLUMNS.map(col => {
                        const shown = ctColumns.includes(col.id)
                        const lastOne = shown && ctColumns.length === 1
                        return (
                          <label
                            key={col.id}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown}
                              disabled={lastOne}
                              onChange={() => setCtColumns(cols =>
                                cols.includes(col.id) ? cols.filter(c => c !== col.id) : CT_COLUMNS.filter(c => cols.includes(c.id) || c.id === col.id).map(c => c.id)
                              )}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                            />
                            {col.label}
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleDownloadTransfersPdf}
                disabled={transferRows.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {visibleCtColumns.map(col => <Th key={col.id} right={col.right}>{col.label}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {transferRows.length === 0
                  ? <EmptyState message="No cash transfers found." />
                  : transferRows.map((t, i) => (
                    <tr key={`${t.ref}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      {visibleCtColumns.map(col => (
                        <td
                          key={col.id}
                          className={`px-4 py-3 text-xs ${col.cellClass || 'text-slate-600 dark:text-slate-300'} ${col.right ? 'text-right whitespace-nowrap' : ''}`}
                          title={col.id === 'description' ? t.description : undefined}
                        >
                          {col.render(t, v => formatVal(v, currency))}
                        </td>
                      ))}
                    </tr>
                  ))
                }
              </tbody>
              {transferRows.length > 0 && ctColumns.includes('amount') && (
                <tfoot>
                  <tr>
                    {visibleCtColumns.length > 1 && (
                      <td colSpan={visibleCtColumns.length - 1} className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">Total</td>
                    )}
                    <td className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-brand-600 dark:text-brand-400 text-right whitespace-nowrap bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">
                      {formatVal(transferRows.reduce((s, t) => s + (t.amount || 0), 0), currency)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}


      {/* Panel: Real Bank Accounts */}
      {accountingTab === 'bank-accounts' && (
        /* Wrapped in the same card shell the other tabs use, so the bank list and its
           history panel read as one section rather than floating on the page. */
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-5 space-y-4">
          {/* No heading — the active tab already names this section */}
          <div className="flex justify-end">
            <button
              onClick={() => { setEditingBankAccount(null); setBankAccountModalOpen(true) }}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Add Bank Account
            </button>
          </div>

          {(!realBankAccounts || realBankAccounts.length === 0) ? (
            <div className="py-12 text-center bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
              <Landmark className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No bank accounts configured</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Add your real-world bank accounts to manage disbursements and repayments</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4 items-start">
              {/* Left: bank cards, one collapsible group per control account. The whole
                  section scrolls on its own (capped to the same viewport-relative height
                  as the other GL tables on this page — chrome above is roughly 21rem) so
                  opening both groups never drags the main body down past the history
                  panel; the negative margin keeps the cards flush with the column while
                  leaving the selected card's ring unclipped. */}
              <div className="w-full lg:w-[340px] flex-shrink-0">
                <div className="space-y-3 max-h-[calc(100vh-21rem)] overflow-y-auto overscroll-contain -mx-1 px-1">
                  {BANK_CARD_GROUPS.map(group => {
                    const groupAccounts = realBankAccounts.filter(
                      a => (a.group || DEFAULT_BANK_GROUP) === group.id
                    )
                    const open = openBankGroups[group.id]
                    return (
                      <div key={group.id} className="space-y-3">
                        <button
                          type="button"
                          onClick={() => toggleBankGroup(group.id)}
                          aria-expanded={open}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                            open
                              ? 'bg-brand-50 border-brand-300 dark:bg-brand-900/20 dark:border-brand-900/50'
                              : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200/60 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-900/50'
                          }`}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs font-bold truncate ${open ? 'text-brand-700 dark:text-brand-400' : 'text-slate-700 dark:text-slate-200'}`}>
                              {group.label}
                            </span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-900/50 flex-shrink-0">
                              {groupAccounts.length}
                            </span>
                          </span>
                          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180 text-brand-600 dark:text-brand-400' : 'text-slate-400'}`} />
                        </button>

                        {open && groupAccounts.length === 0 && (
                          <p className="px-3 py-3 text-center text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                            No bank accounts in this group
                          </p>
                        )}

                        {open && groupAccounts.length > 0 && (
                          <div className="space-y-3">
                            {groupAccounts.map(acct => {
                              const gl = acct.glCode || ''
                              const balance = (gl ? chartOfAccounts.find(a => a.code === gl)?.balance : 0) || 0
                              const selected = acct.id === selectedBankId
                              return (
                                <div
                                  key={acct.id}
                                  role="button"
                                  tabIndex={0}
                                  aria-pressed={selected}
                                  onClick={() => setSelectedBankId(acct.id)}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedBankId(acct.id) } }}
                                  className={`text-left w-full bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden cursor-pointer transition-colors ${
                                    selected
                                      ? 'border-brand-500 dark:border-brand-500 ring-2 ring-brand-500/20'
                                      : 'border-slate-200/60 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-900/50'
                                  }`}
                                >
                                  <div className="p-4">
                                    <div className="flex justify-between items-start gap-2 mb-3">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{acct.name}</h4>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex-shrink-0 ${
                                          acct.currency === 'KHR'
                                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50'
                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/50'
                                        }`}>
                                          {acct.currency}
                                        </span>
                                      </div>
                                      <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border ${
                                        selected
                                          ? 'bg-brand-600 border-brand-600 text-white'
                                          : 'border-slate-300 dark:border-slate-600 text-transparent'
                                      }`}>
                                        <Check className="w-3 h-3" strokeWidth={3} />
                                      </span>
                                    </div>
                                    <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">A/C: {acct.number || 'None'}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">GL {gl || 'None'} · Branch: {acct.branch || 'All Branches'}</p>
                                    <p className="text-lg font-black text-brand-600 dark:text-brand-400 mt-1">{formatVal(balance, acct.currency)}</p>
                                    {group.id === 'receivable' && (
                                      <div className="mt-2">
                                        <Webill365StatusBadge status={webill365Status} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700">
                                    <button
                                      onClick={e => { e.stopPropagation(); setEditingBankAccount(acct); setBankAccountModalOpen(true) }}
                                      className="w-full py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-colors"
                                    >
                                      Edit Settings
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right: transaction history for the selected bank — capped to the same
                  viewport-relative height as the bank card column so this panel never
                  outgrows the screen and forces the main body to scroll; only the entry
                  list below the header/stats scrolls internally. */}
              <div className="flex-1 min-w-0 w-full max-h-[calc(100vh-21rem)] bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden">
                {!selectedBank ? (
                  <div className="py-16 text-center">
                    <Landmark className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Select a bank account</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Its transaction history will appear here</p>
                  </div>
                ) : (
                  <>
                    <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                          <Landmark className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{selectedBank.name}</h4>
                          <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">
                            A/C {selectedBankNumber} · GL {selectedBankGL || 'None'} · Branch: {selectedBank.branch || 'All Branches'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 self-start">
                        {(selectedBank.group || DEFAULT_BANK_GROUP) === 'receivable' && (
                          <Webill365StatusBadge status={webill365Status} />
                        )}
                        <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                          bankHistoryCurrency === 'KHR'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/50'
                        }`}>
                          {bankHistoryCurrency}
                        </span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium mb-1">Current Balance</p>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatVal(selectedBankGLAccount?.balance || 0, bankHistoryCurrency)}</p>
                      </div>
                      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">Cash In</p>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                          {formatVal(selectedBankEntries.filter(t => t.txType !== 'Expense').reduce((s, t) => s + (t.amount || 0), 0), bankHistoryCurrency)}
                        </p>
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3">
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mb-1">Cash Out</p>
                        <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                          {formatVal(selectedBankEntries.filter(t => t.txType === 'Expense').reduce((s, t) => s + (t.amount || 0), 0), bankHistoryCurrency)}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 py-4 flex-1 min-h-0 overflow-y-auto">
                      {!selectedBankGL ? (
                        <p className="text-xs text-center text-slate-400 dark:text-slate-500 py-8">
                          No {bankHistoryCurrency} GL code linked to this bank account. Use Edit Settings to link one.
                        </p>
                      ) : selectedBankEntries.length === 0 ? (
                        <p className="text-xs text-center text-slate-400 dark:text-slate-500 py-8">No transactions recorded for this account yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedBankEntries.map((t, i) => {
                            const isOut = t.txType === 'Expense'
                            const details = bankTxDetailRows(t, bankHistoryCurrency, formatVal)
                            const txKey = `${t.code}-${i}`
                            const txOpen = expandedBankTx === txKey
                            const txLoanRef = loanRefForEntry(t)
                            return (
                              <div key={txKey} className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 overflow-hidden">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  aria-expanded={txOpen}
                                  onClick={() => toggleBankTx(txKey)}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBankTx(txKey) } }}
                                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                                >
                                  {isOut ? <ArrowDownCircle className="w-4 h-4 text-rose-500 flex-shrink-0" /> : <ArrowUpCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                      {t.category || t.description || t.code}
                                      {t.customerName && <span className="font-normal text-slate-400 dark:text-slate-500"> · {t.customerName}</span>}
                                    </p>
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500">{t.date} · {t.code}</p>
                                  </div>
                                  {/* Centred in its own fixed-width column so the figures line up
                                      down the list instead of shifting with each row's label. */}
                                  <span className={`text-xs font-bold flex-shrink-0 w-24 text-center ${isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {isOut ? '-' : '+'}{formatVal(t.amount, bankHistoryCurrency)}
                                  </span>
                                  {txLoanRef && (
                                    // The row stays an expand toggle, so the jump out to the loan is
                                    // its own control rather than the whole row's click.
                                    <button
                                      type="button"
                                      onClick={e => { e.stopPropagation(); openRepaymentTracking(txLoanRef) }}
                                      onKeyDown={e => e.stopPropagation()}
                                      title={`Open Repayment Tracking for ${txLoanRef}`}
                                      aria-label={`Open Repayment Tracking for ${txLoanRef}`}
                                      className="inline-flex items-center gap-1 flex-shrink-0 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-500 rounded"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      {/* The panel gets narrow on a phone, where the amount has to
                                          stay readable — the icon carries the link on its own there. */}
                                      <span className="hidden sm:inline">Repayment Tracking</span>
                                    </button>
                                  )}
                                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${txOpen ? 'rotate-180' : ''}`} />
                                </div>
                                {txOpen && (
                                  <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-slate-200/70 dark:border-slate-700">
                                    {details.map(f => (
                                      <div key={f.label} className="flex items-start justify-between gap-3 text-[11px]">
                                        <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">{f.label}</span>
                                        <span className="text-slate-700 dark:text-slate-200 font-semibold text-right break-all">{f.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Panel: General Ledger */}
      {accountingTab === 'general-ledger' && (
        <div className="printable-area bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* No heading — the active tab already names this table. The toolbar is screen
              furniture, so it is left out of the printed page. */}
          <div className="print:hidden px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select
                value={glAccountFilter}
                onChange={e => dispatch({ type: 'SET_GL_ACCOUNT_FILTER', filter: e.target.value })}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Accounts</option>
                {/* A native option cannot carry markup, so the hierarchy lives in the text: a
                    sub-account is arrowed in under its parent and names it. The arrow does the
                    indenting because browsers collapse leading whitespace in an option. */}
                {accountPickerOptions.map(({ account, isSub }) => (
                  <option key={account.code} value={account.code}>
                    {isSub
                      ? `↳ ${account.code} — ${account.name} · under ${account.parentCode}`
                      : `${account.code} — ${account.name}`}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={glFilter}
                onChange={e => dispatch({ type: 'SET_GL_FILTER', filter: e.target.value })}
                className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Types</option>
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
                <option value="Transfer">Transfer</option>
                <option value="Payable">Payable</option>
                <option value="Receivable">Receivable</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>

            {/* One date — blank means every date */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={glDate}
                onChange={e => setGlDate(e.target.value)}
                title="Filter by date"
                className="border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {glDate && (
                <button
                  onClick={() => setGlDate('')}
                  title="Clear date"
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search — fixed width; the spare space goes to the buttons' right alignment */}
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={glSearch}
                onChange={e => setGlSearch(e.target.value)}
                placeholder="Search…"
                className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {/* View settings — which columns the table (and its exports) carry */}
              <div className="relative">
                <button
                  onClick={() => setGlViewOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Columns3 className="w-3.5 h-3.5" /> View
                </button>
                {glViewOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setGlViewOpen(false)} />
                    <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
                      {GL_COLUMNS.map(col => {
                        const shown = glColumns.includes(col.id)
                        // The last visible column can't be hidden — an empty table is not a view.
                        const lastOne = shown && glColumns.length === 1
                        return (
                          <label
                            key={col.id}
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                          >
                            <input
                              type="checkbox"
                              checked={shown}
                              disabled={lastOne}
                              onChange={() => setGlColumns(cols =>
                                cols.includes(col.id) ? cols.filter(c => c !== col.id) : GL_COLUMNS.filter(c => cols.includes(c.id) || c.id === col.id).map(c => c.id)
                              )}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                            />
                            {col.label}
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleDownloadLedgerPdf}
                disabled={glEntries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          {/* The ledger runs as tall as the viewport allows (page chrome above it is
              roughly 21rem), so the sticky totals row lands at the bottom of the screen
              instead of partway up the page. */}
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-21rem)]">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr>
                  {visibleGlColumns.map(col => <Th key={col.id} right={col.right}>{col.label}</Th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {glEntries.length === 0
                  ? <EmptyState message="No ledger entries found." />
                  : glEntries.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      {visibleGlColumns.map(col => (
                        <td key={col.id} className={`px-4 py-3 text-xs ${col.cellClass || 'text-slate-600 dark:text-slate-300'} ${col.right ? 'text-right' : ''}`}>
                          {col.render(e, v => formatVal(v, currency))}
                        </td>
                      ))}
                    </tr>
                  ))
                }
              </tbody>
              {glEntries.length > 0 && (
                /* Sticky sits on the cells, not the tfoot — and their background is fully
                   opaque, or scrolled rows show through the pinned totals. */
                <tfoot>
                  <tr>
                    {glTotalsSpan > 0 && (
                      <td colSpan={glTotalsSpan} className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">Totals</td>
                    )}
                    {glColumns.includes('debit') && (
                      <td className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-rose-600 text-right bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">
                        {formatVal(glEntries.reduce((s, e) => s + e.debit, 0), currency)}
                      </td>
                    )}
                    {glColumns.includes('credit') && (
                      <td className="sticky bottom-0 z-10 px-4 py-3 text-xs font-bold text-emerald-600 text-right bg-slate-50 dark:bg-slate-700 border-t-2 border-slate-200 dark:border-slate-600">
                        {formatVal(glEntries.reduce((s, e) => s + e.credit, 0), currency)}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

    </div>

      {/* Modals */}
      {/* Modal: Account Setting — the module's standing setup, laid out as a menu of sections
          beside their content so further settings can be added to ACCOUNT_SETTING_MENUS
          without reshaping this modal. Chart of Accounts is the first of them: it used to be
          a tab, but it is setup rather than a working view, so it opens from the page header
          instead of sitting beside the ledger.
          Declared ahead of the add/edit and delete account modals below: all three are z-50,
          so those later ones paint on top of this one, as nested modals must. */}
      {accountSettingOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4" onClick={() => setAccountSettingOpen(false)}>
          {/* A set height, not a max: the dialog would otherwise resize — and the menu jump
              with it — every time a section with less content than the last is picked. */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] sm:h-[88vh] flex flex-col md:flex-row overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Section menu. Hidden below md, where the select in the content column takes
                over — the same trade the System Settings modal makes. */}
            <div className="print:hidden hidden md:flex w-56 flex-shrink-0 flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 overflow-y-auto">
              {/* Matches the content top bar's height so the first menu row lines up with it */}
              <div className="px-4 h-[65px] flex items-center gap-2 flex-shrink-0">
                <Settings className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0" />
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Account Setting</p>
              </div>
              <nav className="px-2 pb-2 pt-[18px] space-y-0.5 flex-1">
                {ACCOUNT_SETTING_MENUS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setAccountSettingMenu(m.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      accountSettingMenu === m.id
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <m.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-left">{m.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="print:hidden flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{activeAccountSetting.label}</h2>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{activeAccountSetting.caption(chartOfAccounts)}</p>
                </div>
                <button onClick={() => setAccountSettingOpen(false)} title="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Section picker for narrow screens, where the menu column is hidden. Only
                  worth showing once there is more than one section to pick between. */}
              {ACCOUNT_SETTING_MENUS.length > 1 && (
                <div className="print:hidden md:hidden px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
                  <select
                    value={accountSettingMenu}
                    onChange={e => setAccountSettingMenu(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {ACCOUNT_SETTING_MENUS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              )}

            {/* Section: Chart of Accounts. Only the table prints — the modal frame, its menu
                and the toolbar are screen furniture. */}
            {accountSettingMenu === 'chart-of-accounts' && (
            <div className="printable-area flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="print:hidden px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <select
                    value={coaFilter}
                    onChange={e => setCoaFilter(e.target.value)}
                    className="appearance-none border border-slate-200 dark:border-slate-600 rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="ALL">All Types</option>
                    <option value="ASSET">Asset</option>
                    <option value="LIABILITY">Liability</option>
                    <option value="EQUITY">Equity</option>
                    <option value="REVENUE">Revenue</option>
                    <option value="EXPENSE">Expense</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>

                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={coaSearch}
                    onChange={e => setCoaSearch(e.target.value)}
                    placeholder="Search…"
                    className="w-full border border-slate-200 dark:border-slate-600 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                  <button
                    onClick={() => { setEditingCoa(null); setCoaModalOpen(true) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Account
                  </button>
                  {/* View settings — which columns the table carries */}
                  <div className="relative">
                    <button
                      onClick={() => setCoaViewOpen(o => !o)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Columns3 className="w-3.5 h-3.5" /> View
                    </button>
                    {coaViewOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setCoaViewOpen(false)} />
                        <div className="absolute right-0 mt-1 z-30 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-lg p-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-2 py-1">Columns</p>
                          {COA_COLUMNS.map(col => {
                            const shown = coaColumns.includes(col.id)
                            const lastOne = shown && coaColumns.length === 1
                            return (
                              <label
                                key={col.id}
                                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 ${lastOne ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={shown}
                                  disabled={lastOne}
                                  onChange={() => setCoaColumns(cols =>
                                    cols.includes(col.id) ? cols.filter(c => c !== col.id) : COA_COLUMNS.filter(c => cols.includes(c.id) || c.id === col.id).map(c => c.id)
                                  )}
                                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-blue-500/40"
                                />
                                {col.label}
                              </label>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={handleDownloadChartPdf}
                    disabled={coaGroups.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {visibleCoaColumns.map(col => <Th key={col.id}>{col.label}</Th>)}
                    </tr>
                  </thead>
                  {coaGroups.length === 0 && (
                    <tbody>
                      <EmptyState message="No accounts match this filter." />
                    </tbody>
                  )}
                  {coaGroups.map(({ type, typeDisplay, accounts: groupAccounts, styles }) => (
                    <tbody key={type} className="divide-y divide-slate-100 dark:divide-slate-700">
                      {/* Section band reads like the ledger's header row — same size, weight
                          and casing — with a colour dot as the only nod to the type. */}
                      <tr>
                        <td colSpan={visibleCoaColumns.length} className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-y border-slate-200/60 dark:border-slate-700">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{typeDisplay}</span>
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{groupAccounts.length} accounts</span>
                          </div>
                        </td>
                      </tr>
                      {groupAccounts.map(acct => (
                        <tr key={acct.code} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                          {visibleCoaColumns.map(col => (
                            <td key={col.id} className={`px-4 py-3 text-xs ${col.cellClass || 'text-slate-600 dark:text-slate-300'}`} title={col.id === 'description' ? acct.description : undefined}>
                              {col.render(acct, coaRowActions)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
            )}
            </div>
          </div>
        </div>
      )}

      {journalEntryModalOpen && (
        <JournalEntryModal
          accounts={chartOfAccounts}
          onClose={() => setJournalEntryModalOpen(false)}
          onSubmit={(entry) => {
            dispatch({ type: 'ADD_JOURNAL_ENTRY', entry })
            setJournalEntryModalOpen(false)
            showToast('Journal Entry saved successfully.', 'success')
          }}
        />
      )}
      {singleEntryModalOpen && (
        <SingleEntryModal
          accounts={chartOfAccounts}
          onClose={() => setSingleEntryModalOpen(false)}
          onSubmit={(entry) => {
            dispatch({ type: 'ADD_SINGLE_ENTRY', entry })
            setSingleEntryModalOpen(false)
            showToast('Single Entry saved successfully.', 'success')
          }}
        />
      )}

      {payrollRunOpen && (
        <PayrollRunModal
          accountCode={payrollGlAccounts[0]?.code || '6020'}
          accountLabel={payrollGlAccounts[0]?.name || 'Payroll Account'}
          onClose={() => setPayrollRunOpen(false)}
        />
      )}

      {trialBalanceModalOpen && <PlaceholderModal title="Trial Balance" onClose={() => setTrialBalanceModalOpen(false)} />}
      {plModalOpen && <PlaceholderModal title="Profit & Loss" onClose={() => setPlModalOpen(false)} />}
      {balanceSheetModalOpen && <PlaceholderModal title="Balance Sheet" onClose={() => setBalanceSheetModalOpen(false)} />}

      {transactionModalOpen && (
        <TransactionModal
          type={transactionModalType}
          count={transactionModalType === 'Income' ? incomes.length : expenses.length}
          accounts={chartOfAccounts}
          realBankAccounts={realBankAccounts}
          onClose={() => dispatch({ type: 'CLOSE_TRANSACTION_MODAL' })}
          onSubmit={handleAddTransaction}
        />
      )}

      {cashTransferModalOpen && (
        <CashTransferModal
          accounts={chartOfAccounts}
          onClose={() => dispatch({ type: 'CLOSE_CASH_TRANSFER_MODAL' })}
          onSubmit={handleAddTransfer}
        />
      )}

      {accountHistoryAccount && (
        <AccountHistoryModal
          account={accountHistoryAccount}
          transactions={accountHistoryEntries}
          currency={accountHistoryCurrency || accountHistoryAccount.currency || currency}
          onClose={() => dispatch({ type: 'CLOSE_ACCOUNT_HISTORY' })}
        />
      )}

      {bankAccountModalOpen && (
        <BankAccountModal
          account={editingBankAccount}
          chartOfAccounts={chartOfAccounts}
          onClose={() => setBankAccountModalOpen(false)}
          onDelete={(id) => {
            dispatch({ type: 'DELETE_BANK_ACCOUNT', id })
            setBankAccountModalOpen(false)
            showToast('Bank account deleted', 'success')
          }}
          onSubmit={(acct) => {
            dispatch({ type: editingBankAccount ? 'UPDATE_BANK_ACCOUNT' : 'ADD_BANK_ACCOUNT', account: acct })
            setBankAccountModalOpen(false)
            showToast(`Bank account ${editingBankAccount ? 'updated' : 'added'}`, 'success')
          }}
        />
      )}

      {coaModalOpen && (
        <ChartOfAccountModal
          account={editingCoa}
          onClose={() => {
            setCoaModalOpen(false)
            setEditingCoa(null)
          }}
          onSubmit={(acct) => {
            dispatch({ type: editingCoa ? 'UPDATE_CHART_OF_ACCOUNT' : 'ADD_CHART_OF_ACCOUNT', account: acct })
            setCoaModalOpen(false)
            setEditingCoa(null)
            showToast(`Account ${editingCoa ? 'updated' : 'created'} successfully`, 'success')
          }}
        />
      )}

      {deletingCoa && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeletingCoa(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Delete Account</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            {coaDeleteBlockedReason ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">{coaDeleteBlockedReason}</p>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
                Are you sure you want to delete{' '}
                <span className="font-bold text-slate-800 dark:text-slate-100">{deletingCoa.name}</span>
                <span className="text-slate-400 dark:text-slate-500"> ({deletingCoa.code})</span>?
                {coaChildCount > 0 && ` Its ${coaChildCount} sub-account${coaChildCount > 1 ? 's' : ''} will be removed as well.`}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeletingCoa(null)}
                className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                {coaDeleteBlockedReason ? 'Close' : 'Cancel'}
              </button>
              {!coaDeleteBlockedReason && (
                <button
                  onClick={() => {
                    dispatch({ type: 'DELETE_CHART_OF_ACCOUNT', code: deletingCoa.code })
                    showToast('Account deleted successfully', 'success')
                    setDeletingCoa(null)
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors"
                >
                  Delete Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {approvingExpense && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setApprovingExpense(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Approve Expense</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">This releases funds and cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
              Approve{' '}
              <span className="font-bold text-slate-800 dark:text-slate-100">{formatVal(approvingExpense.amount, currency)}</span>
              {' '}for <span className="font-semibold text-slate-800 dark:text-slate-100">{approvingExpense.description || approvingExpense.category}</span>
              {' '}from <span className="font-semibold text-slate-800 dark:text-slate-100">{approvingExpense.accountLabel || accountName(approvingExpense.account)}</span>?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setApprovingExpense(null)}
                className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmApproveExpense}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
