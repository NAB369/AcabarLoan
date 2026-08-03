import { useState } from 'react'
import { X, Package, Percent, GitBranch, Edit2, Trash2, Check, AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const Th = ({ children, className = '' }) => (
  <th className={`px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 text-left first:rounded-tl-xl last:rounded-tr-xl ${className}`}>
    {children}
  </th>
)

// ─── Loan Product ────────────────────────────────────────────────────────────
function LoanProductPanel({ products, dispatch, showToast }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ name: '', rate: '', maxAmount: '' })
  const [editingIdx, setEditingIdx] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', rate: '', maxAmount: '' })
  const [deletingIdx, setDeletingIdx] = useState(null)
  const fieldCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500'
  const fieldLabelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1'
  const cellFieldCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

  function isDuplicateName(name, excludeIdx) {
    return products.some((p, i) => i !== excludeIdx && p.name.toLowerCase() === name.toLowerCase())
  }

  function handleAdd() {
    const name = form.name.trim()
    if (!name) {
      showToast('Enter a product name', 'error')
      return
    }
    if (isDuplicateName(name, -1)) {
      showToast('A loan product with that name already exists', 'error')
      return
    }
    dispatch({
      type: 'ADD_LOAN_PRODUCT',
      product: {
        name,
        rate: parseFloat(form.rate) || 0,
        maxAmount: parseFloat(form.maxAmount) || 0,
      },
    })
    showToast('Loan product added', 'success')
    setForm({ name: '', rate: '', maxAmount: '' })
    setShowAddForm(false)
  }

  function openEdit(idx) {
    setEditingIdx(idx)
    setEditForm({
      name: products[idx].name,
      rate: products[idx].rate?.toString() || '',
      maxAmount: products[idx].maxAmount?.toString() || '',
    })
  }

  function handleSaveEdit() {
    const name = editForm.name.trim()
    if (!name) {
      showToast('Enter a product name', 'error')
      return
    }
    if (isDuplicateName(name, editingIdx)) {
      showToast('A loan product with that name already exists', 'error')
      return
    }
    dispatch({
      type: 'UPDATE_LOAN_PRODUCT',
      index: editingIdx,
      product: { name, rate: parseFloat(editForm.rate) || 0, maxAmount: parseFloat(editForm.maxAmount) || 0 },
    })
    showToast('Loan product updated', 'success')
    setEditingIdx(null)
  }

  function handleConfirmRemove() {
    dispatch({ type: 'DELETE_LOAN_PRODUCT', index: deletingIdx })
    showToast('Loan product removed', 'success')
    if (editingIdx === deletingIdx) setEditingIdx(null)
    setDeletingIdx(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Loan Products</h2>
        <button
          onClick={() => setShowAddForm(o => !o)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label className={fieldLabelCls}>Product Name</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Education Loan"
                className={fieldCls}
              />
            </div>
            <div className="w-full sm:w-32 flex-shrink-0">
              <label className={fieldLabelCls}>Interest Rate (%)</label>
              <input type="number" min="0" step="0.1" value={form.rate} onChange={e => setForm(p => ({ ...p, rate: e.target.value }))} className={fieldCls} />
            </div>
            <div className="w-full sm:w-40 flex-shrink-0">
              <label className={fieldLabelCls}>Max Amount (USD)</label>
              <input type="number" min="0" step="100" value={form.maxAmount} onChange={e => setForm(p => ({ ...p, maxAmount: e.target.value }))} className={fieldCls} />
            </div>
            <button
              onClick={handleAdd}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors flex-shrink-0"
            >
              Add Product
            </button>
          </div>
        </div>
      )}

      {/* Product table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Product Name</Th>
                <Th>Interest Rate</Th>
                <Th>Max Loan Amount</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {products.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-400">No loan products yet.</td></tr>
              ) : products.map((p, idx) => editingIdx === idx ? (
                <tr key={idx} className="bg-brand-50/40 dark:bg-brand-900/10">
                  <td className="px-4 py-2">
                    <input
                      autoFocus
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                      className={cellFieldCls}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number" min="0" step="0.1"
                      value={editForm.rate}
                      onChange={e => setEditForm(f => ({ ...f, rate: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                      className={cellFieldCls}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number" min="0" step="100"
                      value={editForm.maxAmount}
                      onChange={e => setEditForm(f => ({ ...f, maxAmount: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                      className={cellFieldCls}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleSaveEdit}
                        title="Save changes"
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingIdx(null)}
                        title="Cancel"
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-100">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{p.rate}%</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {p.maxAmount ? `$${p.maxAmount.toLocaleString()}` : 'No limit'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(idx)}
                        title="Edit loan product"
                        className="p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeletingIdx(idx)}
                        title="Delete loan product"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation */}
      {deletingIdx !== null && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setDeletingIdx(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 flex gap-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Delete Loan Product</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Remove <span className="font-bold text-slate-700 dark:text-slate-200">{products[deletingIdx]?.name}</span> from
                  the product list? New applications will no longer be able to select it.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setDeletingIdx(null)}
                className="border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Benefit Fees ────────────────────────────────────────────────────────────
// The five built-in rates are keyed fields on feeSettings — every loan's "Benefit to the
// Bank" tab reads them by key, so they can be re-rated but never removed.
const FEE_FIELDS = [
  { key: 'adminFeeRate',             label: 'Admin Fee',                                 scope: 'Per loan' },
  { key: 'insuranceFeeRate',         label: 'Insurance Fee',                             scope: 'Per loan' },
  { key: 'lawyerFeeRate',            label: 'Lawyer Fee',                                scope: 'Per land title' },
  { key: 'ministryFeeRate',          label: 'Ministry Fee',                              scope: 'Per land title' },
  { key: 'transportMinistryFeeRate', label: 'Ministry of Public Works and Transport Fee', scope: 'Per vehicle' },
]

// A custom fee named after a built-in category is dropped on reload (see loadPersistedState in
// AppContext) and filtered out of the Benefit tab, so reject those names at entry instead.
const RESERVED_FEE_NAMES = new Set([
  'interest fee', 'admin fee', 'insurance fee', 'lawyer fee', 'ministry fee',
  'ministry of public works and transport',
  ...FEE_FIELDS.map(f => f.label.toLowerCase()),
])

function FeeSettingsPanel({ feeSettings, dispatch, showToast }) {
  const customFees = feeSettings.customFees || []
  // Built-in fees the institution has deleted — hidden here and skipped by every loan's Benefit tab
  const removedFeeKeys = feeSettings.removedFeeKeys || []
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ name: '', rate: '' })
  // Row being edited / deleted: { kind: 'system', key, name, rate } | { kind: 'custom', index, name, rate }
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const fieldCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500'
  const fieldLabelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1'
  const cellFieldCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

  // Built-in rates first, then the custom ones — one table, one reading order.
  const rows = [
    ...FEE_FIELDS.filter(f => !removedFeeKeys.includes(f.key)).map(f => ({
      kind: 'system', id: f.key, key: f.key, name: f.label,
      rate: feeSettings[f.key] ?? 0, scope: f.scope,
    })),
    ...customFees.map((f, index) => ({
      kind: 'custom', id: `custom-${index}`, index, name: f.name,
      rate: f.rate ?? 0, scope: 'Per loan',
    })),
  ]

  const isEditing = row => editing && editing.kind === row.kind &&
    (row.kind === 'system' ? editing.key === row.key : editing.index === row.index)

  function nameTaken(name, excludeIdx) {
    const lower = name.toLowerCase()
    if (RESERVED_FEE_NAMES.has(lower)) return 'built-in'
    return customFees.some((f, i) => i !== excludeIdx && (f.name || '').toLowerCase() === lower) ? 'custom' : null
  }

  function handleAddFee() {
    const name = form.name.trim()
    if (!name) {
      showToast('Enter a fee name', 'error')
      return
    }
    const taken = nameTaken(name, -1)
    if (taken) {
      showToast(taken === 'built-in' ? 'That name belongs to a built-in fee' : 'A fee with that name already exists', 'error')
      return
    }
    dispatch({ type: 'ADD_CUSTOM_FEE', fee: { name, rate: Math.max(0, parseFloat(form.rate) || 0) } })
    showToast('Custom fee added', 'success')
    setForm({ name: '', rate: '' })
    setShowAddForm(false)
  }

  function cancelAdd() {
    setForm({ name: '', rate: '' })
    setShowAddForm(false)
  }

  function openEdit(row) {
    setEditing({ ...row, rate: row.rate?.toString() ?? '' })
  }

  function handleSaveEdit() {
    const rate = Math.max(0, parseFloat(editing.rate) || 0)
    if (editing.kind === 'system') {
      dispatch({ type: 'UPDATE_FEE_SETTINGS', feeSettings: { [editing.key]: rate } })
      showToast(`${editing.name} rate saved`, 'success')
      setEditing(null)
      return
    }
    const name = editing.name.trim()
    if (!name) {
      showToast('Enter a fee name', 'error')
      return
    }
    const taken = nameTaken(name, editing.index)
    if (taken) {
      showToast(taken === 'built-in' ? 'That name belongs to a built-in fee' : 'A fee with that name already exists', 'error')
      return
    }
    dispatch({ type: 'UPDATE_CUSTOM_FEE', index: editing.index, fee: { name, rate } })
    showToast('Custom fee updated', 'success')
    setEditing(null)
  }

  function handleConfirmRemove() {
    if (deleting.kind === 'system') {
      dispatch({
        type: 'UPDATE_FEE_SETTINGS',
        feeSettings: { removedFeeKeys: [...removedFeeKeys, deleting.key] },
      })
      showToast(`${deleting.name} removed`, 'success')
    } else {
      dispatch({ type: 'DELETE_CUSTOM_FEE', index: deleting.index })
      showToast('Custom fee removed', 'success')
    }
    if (isEditing(deleting)) setEditing(null)
    setDeleting(null)
  }

  function handleRestoreBuiltIns() {
    dispatch({ type: 'UPDATE_FEE_SETTINGS', feeSettings: { removedFeeKeys: [] } })
    showToast('Built-in fees restored', 'success')
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Benefit fee</h2>
        <button
          onClick={() => showAddForm ? cancelAdd() : setShowAddForm(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-colors flex-shrink-0"
        >
          {showAddForm ? 'Cancel' : '+ Add Fee'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <label className={fieldLabelCls}>Fee Name</label>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddFee()}
                placeholder="e.g. Valuation Fee"
                className={fieldCls}
              />
            </div>
            <div className="w-full sm:w-40 flex-shrink-0">
              <label className={fieldLabelCls}>Rate (%)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.rate}
                onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddFee()}
                className={fieldCls}
              />
            </div>
            <button
              onClick={handleAddFee}
              className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors flex-shrink-0"
            >
              Add Fee
            </button>
          </div>
        </div>
      )}

      {/* Fee table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Fee Name</Th>
                <Th>Type</Th>
                <Th>Rate</Th>
                <Th>Applies To</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-400">No fees configured.</td></tr>
              ) : rows.map(row => isEditing(row) ? (
                <tr key={row.id} className="bg-brand-50/40 dark:bg-brand-900/10">
                  <td className="px-4 py-2">
                    {/* A built-in fee's name is the key the Benefit tab reads — rate only */}
                    {row.kind === 'system' ? (
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{row.name}</span>
                    ) : (
                      <input
                        autoFocus
                        value={editing.name}
                        onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                        className={cellFieldCls}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                      row.kind === 'system'
                        ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                        : 'bg-brand-50 text-brand-700 border-brand-200/50 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-800'
                    }`}>
                      {row.kind === 'system' ? 'Built-in' : 'Custom'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      autoFocus={row.kind === 'system'}
                      type="number" min="0" max="100" step="0.01"
                      value={editing.rate}
                      onChange={e => setEditing(p => ({ ...p, rate: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                      className={cellFieldCls}
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.scope}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleSaveEdit}
                        title="Save changes"
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        title="Cancel"
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-100">{row.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                      row.kind === 'system'
                        ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600'
                        : 'bg-brand-50 text-brand-700 border-brand-200/50 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-800'
                    }`}>
                      {row.kind === 'system' ? 'Built-in' : 'Custom'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.rate}%</td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.scope}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(row)}
                        title={row.kind === 'system' ? 'Edit rate' : 'Edit fee'}
                        className="p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(row)}
                        title="Delete fee"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {removedFeeKeys.length > 0 && (
        <div className="flex justify-end mt-3">
          <button
            onClick={handleRestoreBuiltIns}
            className="text-[11px] font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 hover:underline"
          >
            Restore {removedFeeKeys.length} deleted built-in {removedFeeKeys.length === 1 ? 'fee' : 'fees'}
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setDeleting(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 flex gap-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Delete Fee</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Remove <span className="font-bold text-slate-700 dark:text-slate-200">{deleting.name}</span> from
                  every loan's Benefit to the Bank tab?
                  {deleting.kind === 'system' && ' Its rate is kept, so restoring it brings the rate back.'}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
              <button
                onClick={() => setDeleting(null)}
                className="border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemove}
                className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Approval Line ───────────────────────────────────────────────────────────
// Read-only reference — the 3-stage approval chain is fixed, not configurable, so this
// panel has no Save action (there used to be one that fired a success toast with no
// dispatch behind it, which risked a credit manager believing they'd changed something).
function ApprovalLinePanel() {
  const stages = [
    {
      n: 1,
      role: 'Credit Officer',
      action: 'Submits Application',
      desc: 'The credit officer collects customer information, runs KYC checks, and submits a complete loan application for review.',
    },
    {
      n: 2,
      role: 'Credit Manager',
      action: 'Reviews & Approves',
      desc: 'The credit manager evaluates the application, verifies collateral valuation, and either approves or rejects the loan.',
    },
    {
      n: 3,
      role: 'Admin',
      action: 'Final Approval & Disbursement',
      desc: 'Admin performs a final compliance check and initiates loan disbursement to the customer\'s designated account.',
    },
  ]
  return (
    <div>
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Approval Line Configuration</h2>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th className="w-16">Stage</Th>
                <Th>Role</Th>
                <Th>Action</Th>
                <Th>Description</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {stages.map(s => (
                <tr key={s.n} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <span className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold">
                      {s.n}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{s.role}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-brand-600 whitespace-nowrap">{s.action}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 min-w-[18rem]">{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────
const LOAN_SETTINGS_MENUS = [
  { id: 'loan-product',  label: 'Loan Product',  icon: Package },
  { id: 'fee-settings',  label: 'Benefit Fees',  icon: Percent },
  { id: 'approval-line', label: 'Approval Line', icon: GitBranch },
]

export default function LoanSettingsModal({ open, onClose }) {
  const { state, dispatch, showToast } = useApp()
  const { feeSettings, loanProducts } = state
  const [activePanel, setActivePanel] = useState('loan-product')

  if (!open) return null

  const activeLabel = LOAN_SETTINGS_MENUS.find(m => m.id === activePanel)?.label || ''

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col md:flex-row overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar (desktop only) */}
        <div className="hidden md:flex w-56 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex-col overflow-y-auto bg-slate-50 dark:bg-slate-900">
          <div className="px-4 h-[65px] flex items-center flex-shrink-0">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Loan Setting</p>
          </div>
          <nav className="px-2 pb-2 pt-[18px] space-y-0.5 flex-1">
            {LOAN_SETTINGS_MENUS.map(m => (
              <button
                key={m.id}
                onClick={() => setActivePanel(m.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  activePanel === m.id
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                }`}
              >
                <m.icon className="w-4 h-4" />
                {m.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-slate-50 dark:bg-slate-900">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <nav className="flex items-center gap-1.5 min-w-0 text-xs text-slate-400 dark:text-slate-500">
              <span className="font-semibold hidden sm:inline">Loan Setting</span>
              <span className="hidden sm:inline">/</span>
              <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{activeLabel}</span>
            </nav>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile panel nav (sidebar is hidden below md) */}
          <div className="md:hidden px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
            <select
              value={activePanel}
              onChange={e => setActivePanel(e.target.value)}
              className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {LOAN_SETTINGS_MENUS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activePanel === 'loan-product'  && <LoanProductPanel products={loanProducts} dispatch={dispatch} showToast={showToast} />}
            {activePanel === 'fee-settings'  && <FeeSettingsPanel feeSettings={feeSettings} dispatch={dispatch} showToast={showToast} />}
            {activePanel === 'approval-line' && <ApprovalLinePanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
