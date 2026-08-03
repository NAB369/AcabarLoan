import { useState, useMemo } from 'react'
import { X, ChevronRight, ChevronLeft, Check, User } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { buildAmortizationData, formatVal, getProductMaxAmount } from '../../utils/format'
import { BRANCHES } from '../../data/constants'
import StatusBadge from '../shared/StatusBadge'
import SearchableSelect from '../shared/SearchableSelect'
import { getCustomerStatus } from '../../utils/customerStatus'

const STEPS = ['Customer', 'Loan Product']

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function addMonths(isoStr, months) {
  if (!isoStr) return ''
  const d = new Date(isoStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function getNextLoanRef(loanApplications) {
  const maxNum = loanApplications.reduce((max, loan) => {
    const match = /^AC-L-(\d+)$/.exec(loan.ref || '')
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  return `AC-L-${String(maxNum + 1).padStart(6, '0')}`
}

export default function LoanWizard() {
  const { state, dispatch, showToast, can } = useApp()

  const step = state.loanWizardStep
  const editRef = state.editingLoanRef
  const existingLoan = editRef ? state.loanApplications.find(a => a.ref === editRef) : null

  const nextRef = existingLoan?.ref || getNextLoanRef(state.loanApplications)

  // Step 1 — a "New Loan" shortcut from a customer row (OPEN_LOAN_WIZARD's customerCode)
  // prefills this the same way editing an existing loan does.
  const [customerCode, setCustomerCode] = useState(existingLoan?.customerCode || state.loanWizardPrefillCustomerCode || '')
  const [currency, setCurrency] = useState(existingLoan?.currency || state.currency || 'USD')

  // Step 2 - Loan Product
  const [product, setProduct] = useState(existingLoan?.product || 'Business Loan')
  const [amount, setAmount] = useState(existingLoan?.amount?.toString() || '')
  const [interestRate, setInterestRate] = useState(
    existingLoan?.interestRate?.toString() ||
    state.loanProducts.find(p => p.name === (existingLoan?.product || 'Business Loan'))?.rate?.toString() ||
    ''
  )
  const [installments, setInstallments] = useState(existingLoan?.installments?.toString() || '12')

  const [creditOfficer, setCreditOfficer] = useState(existingLoan?.creditOfficer || '')
  const [branch, setBranch] = useState(existingLoan?.branch || 'Phnom Penh HQ')

  // No longer editable in this wizard — kept with sane defaults so submitted loans still
  // carry the shape other screens (LoanDetail, Dashboard, Reports) expect.
  const [disbursementDate] = useState(existingLoan?.disbursementDate || todayISO())
  const [repaymentType] = useState(existingLoan?.repaymentType || 'Monthly')
  const [firstInstallment] = useState(existingLoan?.firstInstallment || addMonths(todayISO(), 1))
  const [penaltyRate] = useState(existingLoan?.penaltyRate?.toString() || '5')
  const [loanCycle] = useState(existingLoan?.loanCycle || '1')

  const selectedCustomer = state.customers.find(c => c.code === customerCode) || null
  const customerOptions = state.customers.map(c => ({ value: c.code, label: c.code, sublabel: c.enName }))

  const creditOfficers = state.systemUsers.filter(u => u.role === 'Credit Officer' && u.status === 'Active')

  const selectedProductMax = useMemo(() => {
    const selectedProduct = state.loanProducts.find(p => p.name === product)
    return getProductMaxAmount(selectedProduct, currency)
  }, [state.loanProducts, product, currency])
  const amountExceedsMax = selectedProductMax && parseFloat(amount) > selectedProductMax

  const amortData = useMemo(() => {
    const amt = parseFloat(amount)
    const rate = parseFloat(interestRate)
    const term = parseInt(installments, 10)
    if (!amt || amt <= 0 || !rate || rate <= 0 || !term || term <= 0) return { emi: 0, rows: [] }
    return buildAmortizationData(amt, rate, term, firstInstallment)
  }, [amount, interestRate, installments, firstInstallment])

  if (!state.loanWizardOpen) return null

  function handleProductChange(name) {
    setProduct(name)
    const rate = state.loanProducts.find(p => p.name === name)?.rate
    if (rate !== undefined) setInterestRate(rate.toString())
  }

  function handleClose() {
    dispatch({ type: 'CLOSE_LOAN_WIZARD' })
  }

  function validateStep() {
    if (step === 1) {
      if (!customerCode) { showToast('Please select a customer', 'error'); return false }
      return true
    }
    if (step === 2) {
      const amt = parseFloat(amount)
      if (!amt || amt <= 0) { showToast('Please enter a valid loan amount', 'error'); return false }
      const selectedProduct = state.loanProducts.find(p => p.name === product)
      const maxAmount = getProductMaxAmount(selectedProduct, currency)
      if (maxAmount && amt > maxAmount) {
        showToast(`Loan amount exceeds the maximum of ${formatVal(maxAmount, currency, 1)} for ${product}`, 'error')
        return false
      }
      return true
    }
    return true
  }

  function handleNext() {
    if (!validateStep()) return
    dispatch({ type: 'SET_LOAN_WIZARD_STEP', step: step + 1 })
  }

  function handleBack() {
    dispatch({ type: 'SET_LOAN_WIZARD_STEP', step: step - 1 })
  }

  function handleSubmit() {
    if (!validateStep()) return
    if (!can('open_loan')) {
      showToast(`${state.currentRole} does not have permission to submit a loan application.`, 'error')
      return
    }
    const amt = parseFloat(amount)
    const rate = parseFloat(interestRate)
    const term = parseInt(installments, 10)
    const penalty = parseFloat(penaltyRate) || 0
    const { emi, rows } = buildAmortizationData(amt, rate, term, firstInstallment)

    const loan = {
      ref: nextRef,
      customerCode,
      customerName: selectedCustomer?.enName || '',
      customerKhName: selectedCustomer?.khName || '',
      customerGender: selectedCustomer?.gender || '',
      customerPhone: selectedCustomer?.phone || '',
      customerEmail: selectedCustomer?.email || '',
      product,
      currency,
      amount: amt,
      disbursementDate,
      repaymentType,
      firstInstallment,
      installments: term,
      interestRate: rate,
      penaltyRate: penalty,
      creditOfficer,
      loanCycle,
      branch,
      coBorrowers: existingLoan?.coBorrowers || (existingLoan?.coBorrower ? [existingLoan.coBorrower] : []),
      guarantors: existingLoan?.guarantors || (existingLoan?.guarantor ? [existingLoan.guarantor] : []),
      collateral: existingLoan?.collateral || null,
      emi,
      schedule: existingLoan?.schedule || rows,
      status: existingLoan?.status || 'In Progress',
      submittedAt: existingLoan?.submittedAt || new Date().toISOString(),
      approvalState: existingLoan?.approvalState || 1,
      approvalHistory: existingLoan?.approvalHistory || [
        { stage: 1, action: 'Application submitted', user: 'Admin', timestamp: new Date().toLocaleString('en-GB') }
      ],
    }

    dispatch({ type: 'SUBMIT_LOAN', loan })
    showToast(existingLoan ? 'Loan updated successfully' : 'Loan application submitted', 'success')
  }

  const inputCls = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition'
  const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {editRef ? 'Edit Loan Application' : 'New Loan Application'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Step {step} of {STEPS.length} — {STEPS[step - 1]}</p>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 gap-2">
          {STEPS.map((label, idx) => {
            const s = idx + 1
            const done = step > s
            const active = step === s
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className={[
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors',
                    done ? 'bg-emerald-500 border-emerald-500 text-white'
                      : active ? 'bg-[#0047ab] border-[#0047ab] text-white'
                        : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400',
                  ].join(' ')}>
                    {done ? <Check className="w-3.5 h-3.5" /> : s}
                  </div>
                  <span className={[
                    'text-xs font-medium hidden sm:block',
                    done ? 'text-emerald-600 dark:text-emerald-400'
                      : active ? 'text-[#0047ab] dark:text-blue-400'
                        : 'text-slate-400 dark:text-slate-500',
                  ].join(' ')}>{label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={[
                    'flex-1 h-0.5 mx-3 rounded transition-colors',
                    done ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700',
                  ].join(' ')} />
                )}
              </div>
            )
          })}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-5 space-y-5">

          {/* ── STEP 1: Customer ── */}
          {step === 1 && (
            <>
              <div>
                <label className={labelCls}>Select Customer *</label>
                <SearchableSelect
                  value={customerCode}
                  onChange={setCustomerCode}
                  options={customerOptions}
                  placeholder="Search by name or ID…"
                  emptyText="No customers match"
                  triggerPlaceholder="— Select Customer —"
                />
              </div>

              {selectedCustomer && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200/50 dark:border-blue-700/50">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0047ab]/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-[#0047ab]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-800 dark:text-slate-100">{selectedCustomer.enName}</p>
                        <StatusBadge status={getCustomerStatus(selectedCustomer, state.loanApplications)} size="xs" />
                      </div>
                      {selectedCustomer.khName && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{selectedCustomer.khName}</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                        <div><span className="text-slate-400">ID: </span><span className="font-mono text-slate-600 dark:text-slate-300">{selectedCustomer.code}</span></div>
                        <div><span className="text-slate-400">Gender: </span><span className="text-slate-600 dark:text-slate-300">{selectedCustomer.gender}</span></div>
                        {selectedCustomer.phone && <div><span className="text-slate-400">Phone: </span><span className="text-slate-600 dark:text-slate-300">{selectedCustomer.phone}</span></div>}
                        {selectedCustomer.email && <div className="truncate"><span className="text-slate-400">Email: </span><span className="text-slate-600 dark:text-slate-300">{selectedCustomer.email}</span></div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Loan Product ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className={labelCls}>Currency</label>
                <div className="flex gap-2">
                  {['USD', 'KHR'].map(c => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={[
                        'flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors',
                        currency === c
                          ? 'bg-[#0047ab] border-[#0047ab] text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#0047ab]/50',
                      ].join(' ')}
                    >
                      {c === 'USD' ? '$ USD' : '៛ KHR'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Loan Product *</label>
                  <select value={product} onChange={e => handleProductChange(e.target.value)} className={inputCls}>
                    {state.loanProducts.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Loan Amount ({currency}) *</label>
                  <input
                    type="number" min="0" step="100" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                    className={[inputCls, amountExceedsMax ? 'border-rose-400 focus:ring-rose-400' : ''].join(' ')}
                  />
                  {selectedProductMax != null && (
                    <p className={`text-[11px] mt-1 ${amountExceedsMax ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                      {amountExceedsMax
                        ? `Exceeds ${product} max of ${formatVal(selectedProductMax, currency, 1)}`
                        : `Max for ${product}: ${formatVal(selectedProductMax, currency, 1)}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Credit Officer</label>
                  <select value={creditOfficer} onChange={e => setCreditOfficer(e.target.value)} className={inputCls}>
                    <option value="">Select credit officer</option>
                    {creditOfficers.map(o => <option key={o.username} value={o.fullName}>{o.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Branch</label>
                  <select value={branch} onChange={e => setBranch(e.target.value)} className={inputCls}>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              {amortData.rows.length > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-4 py-3 rounded-xl">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Estimated Monthly EMI</span>
                  <span className="text-sm font-bold text-[#0047ab] dark:text-blue-400">{formatVal(amortData.emi, currency, 1)}</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <div className="flex gap-3">
            {step > 1 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-xl transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {step < STEPS.length ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#0047ab] hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
              >
                <Check className="w-4 h-4" />
                {editRef ? 'Update Loan' : 'Save Application'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
