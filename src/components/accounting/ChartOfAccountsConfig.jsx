import { useMemo, useState } from 'react'
import { Folder, FileText, ChevronDown, ChevronRight, Pencil, Plus, Trash2, Check, X } from 'lucide-react'

// Chart of Account Configuration — the chart read as what it is, a tree, with one account's
// record beside it. The table this replaced could show every column at once but never showed
// the shape: which account rolls up into which is the first thing an accountant needs, and a
// flat list keyed on a code prefix left them to work it out.
//
// The five types are the stored values, not display labels — see INITIAL_CHART_OF_ACCOUNTS.
const ACC_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense']
const CURRENCIES = ['KHR', 'USD']

// A header is an account other accounts roll into. Stored on records that have been edited
// here, derived for every other, so an install that predates this screen still reads correctly
// instead of showing every account as a leaf.
export function accountLevel(account, accounts) {
  if (account?.level === 'HEADER' || account?.level === 'ACCOUNT') return account.level
  return accounts.some(a => a.parentCode === account?.code) ? 'HEADER' : 'ACCOUNT'
}

// The chart as a nested tree, to whatever depth it is filed at: a band holds accounts, an
// account can hold sub-accounts (1110 holds the stage allowances, 6030 the utilities). Sorted
// on code rather than insertion order — an account added by hand lands at the end of the list
// regardless of where it belongs in the chart.
//
// A node whose parent is not in the chart (deleted, or a mistyped parentCode) is treated as a
// root: it still holds a real balance and must not drop out of the tree entirely.
export function buildAccountTree(accounts, term = '') {
  const byCode = (a, b) => (a.code || '').localeCompare(b.code || '')
  const q = term.trim().toLowerCase()
  const matches = a => !q || [a.code, a.name, a.nameKhmer, a.description].some(v => (v || '').toLowerCase().includes(q))

  const present = new Set(accounts.map(a => a.code))
  const children = new Map()
  const roots = []
  for (const a of accounts) {
    const parent = (a.parentCode || '').trim()
    if (parent && parent !== a.code && present.has(parent)) {
      if (!children.has(parent)) children.set(parent, [])
      children.get(parent).push(a)
    } else {
      roots.push(a)
    }
  }

  // A branch survives the search when it matches itself or when anything beneath it does —
  // otherwise searching for a sub-account would hide the band it sits under.
  function build(account, seen) {
    if (seen.has(account.code)) return null      // a parentCode cycle would recurse forever
    const next = new Set(seen).add(account.code)
    const kids = (children.get(account.code) || [])
      .sort(byCode)
      .map(child => build(child, next))
      .filter(Boolean)
    if (!matches(account) && kids.length === 0) return null
    return { account, children: kids }
  }

  return [...roots].sort(byCode).map(root => build(root, new Set())).filter(Boolean)
}

function Radio({ name, value, checked, disabled, onChange, label }) {
  return (
    <label className={`flex items-center gap-2 text-xs ${disabled ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200 cursor-pointer'}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="w-3.5 h-3.5 text-brand-600 border-slate-300 dark:border-slate-600 focus:ring-brand-500/40 disabled:opacity-60"
      />
      {label}
    </label>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </p>
      {children}
    </div>
  )
}

// One row, and its subtree under it. Indent comes from depth rather than a fixed padding, so
// a sub-account filed three levels down still reads as belonging to what is above it.
function TreeNode({ node, depth, selectedCode, collapsed, onToggle, onPick }) {
  const { account, children } = node
  const open = !collapsed.has(account.code)
  const isSelected = account.code === selectedCode
  const hasKids = children.length > 0

  return (
    <div>
      <div
        onClick={() => onPick(account)}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
        className={`flex items-center gap-1.5 pr-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
        }`}
      >
        {hasKids ? (
          <button
            onClick={e => { e.stopPropagation(); onToggle(account.code) }}
            aria-label={open ? 'Collapse' : 'Expand'}
            aria-expanded={open}
            className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-[18px] flex-shrink-0" />
        )}
        {hasKids
          ? <Folder className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 flex-shrink-0" aria-hidden="true" />
          : <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />}
        <span className={`text-xs truncate ${
          isSelected ? 'font-bold text-brand-700 dark:text-brand-300'
            : hasKids ? 'font-semibold text-slate-700 dark:text-slate-200'
            : 'font-medium text-slate-600 dark:text-slate-300'
        }`}>
          {account.code}-{account.name}
        </span>
      </div>

      {open && children.map(child => (
        <TreeNode
          key={child.account.code}
          node={child}
          depth={depth + 1}
          selectedCode={selectedCode}
          collapsed={collapsed}
          onToggle={onToggle}
          onPick={onPick}
        />
      ))}
    </div>
  )
}

export default function ChartOfAccountsConfig({ accounts, search, selectedCode, onSelect, onAdd, onUpdate, onDelete, onError }) {
  const tree = useMemo(() => buildAccountTree(accounts, search), [accounts, search])
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(null)   // the parent an unsaved child belongs to
  const [draft, setDraft] = useState(null)

  const selected = accounts.find(a => a.code === selectedCode) || null
  const record = adding ? draft : selected
  const isEditing = editing || !!adding

  function toggle(code) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function pick(account) {
    setEditing(false)
    setAdding(null)
    setDraft(null)
    onSelect(account.code)
  }

  function startEdit() {
    if (!selected) return
    setDraft({ ...selected, level: accountLevel(selected, accounts) })
    setEditing(true)
  }

  function startAddChild() {
    if (!selected) return
    setAdding(selected.code)
    setDraft({
      code: '', name: '', description: '', nameKhmer: '',
      parentCode: selected.code,
      type: selected.type || 'Asset',
      currency: selected.currency || 'USD',
      normalBalance: selected.normalBalance || 'DEBIT',
      status: 'ACTIVE',
      level: 'ACCOUNT',
      balance: 0,
    })
  }

  function cancel() {
    setEditing(false)
    setAdding(null)
    setDraft(null)
  }

  function save() {
    const code = (draft.code || '').trim()
    const name = (draft.name || '').trim()
    if (!code) { onError('Enter an account code.'); return }
    if (!name) { onError('Enter an account description.'); return }
    if (adding && accounts.some(a => a.code === code)) {
      onError(`Account code ${code} already exists.`)
      return
    }
    const account = { ...draft, code, name }
    if (adding) {
      onAdd(account)
      onSelect(code)
    } else {
      onUpdate(account)
    }
    setEditing(false)
    setAdding(null)
    setDraft(null)
  }

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition disabled:bg-slate-50 dark:disabled:bg-slate-800/60 disabled:text-slate-500 dark:disabled:text-slate-400'

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
      {/* ── The chart, as a tree ── */}
      <div className="lg:w-1/2 lg:border-r border-slate-100 dark:border-slate-700 overflow-y-auto p-3">
        {tree.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 px-2 py-6 text-center">
            No account matches this search.
          </p>
        ) : tree.map(node => (
          <TreeNode
            key={node.account.code}
            node={node}
            depth={0}
            selectedCode={selectedCode}
            collapsed={collapsed}
            onToggle={toggle}
            onPick={pick}
          />
        ))}
      </div>

      {/* ── The selected account's record ── */}
      <div className="lg:w-1/2 overflow-y-auto p-4 bg-slate-50/50 dark:bg-slate-900/30">
        {!record ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 px-2 py-6 text-center">
            Select an account on the left to see its details.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {adding ? 'New Account' : 'Account Details'}
                </p>
                {!isEditing ? (
                  <button onClick={startEdit} className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button onClick={cancel} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                    <button onClick={save} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-brand-600 hover:bg-brand-700 text-white">
                      <Check className="w-3 h-3" /> Save
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Account Level">
                  <div className="flex items-center gap-5">
                    {['HEADER', 'ACCOUNT'].map(lvl => (
                      <Radio
                        key={lvl} name="coa-level" value={lvl}
                        label={lvl === 'HEADER' ? 'Header' : 'Account'}
                        checked={(isEditing ? draft.level : accountLevel(record, accounts)) === lvl}
                        disabled={!isEditing}
                        onChange={v => set('level', v)}
                      />
                    ))}
                  </div>
                </Field>
                <Field label="Currency">
                  <div className="flex items-center gap-5">
                    {CURRENCIES.map(c => (
                      <Radio
                        key={c} name="coa-currency" value={c} label={c}
                        checked={(isEditing ? draft.currency : record.currency) === c}
                        disabled={!isEditing}
                        onChange={v => set('currency', v)}
                      />
                    ))}
                  </div>
                </Field>
              </div>

              <Field label="Parent Code">
                {/* Never typed: it is what the tree already says. Moving an account under a
                    different parent is a re-parenting, not a field edit. */}
                <input value={record.parentCode || '—'} disabled className={inputCls} />
              </Field>

              <Field label="Account Code" required>
                {/* The code is the account's identity — every journal line, bank account and
                    posting rule refers to it — so it is set once, when the account is created. */}
                <input
                  value={isEditing ? draft.code : record.code}
                  disabled={!adding}
                  onChange={e => set('code', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Account Description" required>
                <input
                  value={isEditing ? draft.name : record.name}
                  disabled={!isEditing}
                  onChange={e => set('name', e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Select Acc Type">
                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                  {ACC_TYPES.map(t => (
                    <Radio
                      key={t} name="coa-type" value={t} label={t}
                      checked={(isEditing ? draft.type : record.type) === t}
                      disabled={!isEditing}
                      onChange={v => set('type', v)}
                    />
                  ))}
                </div>
              </Field>
            </div>

            {!adding && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <button
                  onClick={startAddChild}
                  disabled={isEditing}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4 text-emerald-600" /> Add Child
                </button>
                <button
                  onClick={() => onDelete(selected)}
                  disabled={isEditing}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
