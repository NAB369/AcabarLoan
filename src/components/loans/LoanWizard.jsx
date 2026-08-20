import { useState, useMemo, useRef, useLayoutEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Check, User, CalendarDays, PiggyBank, TrendingDown, Layers } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import {
  buildAmortizationData, formatVal, getProductMaxAmount,
  formatAmountInput, sanitizeAmountInput, currencyDecimals, CURRENCY_SYMBOLS,
} from '../../utils/format'
import {
  BRANCHES, LOAN_STRUCTURES, LOAN_STRUCTURE_OPTIONS,
  BALLOON_INTEREST_ONLY_PERCENT, DEFAULT_BALLOON_PERCENT,
} from '../../data/constants'
import StatusBadge from '../shared/StatusBadge'
import SearchableSelect from '../shared/SearchableSelect'
import { getCustomerStatus } from '../../utils/customerStatus'
import { chargedCollectionRate } from '../../utils/benefitFees'
import useModalA11y from '@/components/shared/useModalA11y'

const STEPS = ['Customer', 'Loan Product']

// The colour a structure is read by, kept out of constants.js so the option list stays data and
// the styling stays with the markup that uses it. Each structure keeps one hue across its icon
// tile and its tag — the tag also carries a word, so the choice never rests on colour alone.
const STRUCTURE_STYLES = {
  Amortizing: {
    Icon: CalendarDays,
    tile: 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400',
    tag: 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/40 dark:text-blue-300',
  },
  Balloon: {
    Icon: PiggyBank,
    tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    tag: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  Decline: {
    Icon: TrendingDown,
    tile: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    tag: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  },
}

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

// A plain number input can't carry thousand separators, so this is a text field that keeps
// the raw digits in state and renders them grouped. The caret has to be re-placed by hand
// after every keystroke: inserting a separator shifts everything behind it, and without this
// the caret would jump to the end of the field the moment an amount crosses a thousand.
function AmountInput({ value, currency, onChange, className, ...rest }) {
  const ref = useRef(null)
  const caret = useRef(null)

  useLayoutEffect(() => {
    if (caret.current == null || !ref.current) return
    ref.current.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })

  function handleChange(e) {
    const typed = e.target.value
    // Count in digits, not characters — that is the position the separators move around.
    const digitsBefore = typed.slice(0, e.target.selectionStart).replace(/[^\d.]/g, '').length
    const next = formatAmountInput(typed, currency)
    let seen = 0
    caret.current = next.length
    for (let i = 0; i < next.length; i++) {
      if (/[\d.]/.test(next[i])) seen++
      if (seen >= digitsBefore) { caret.current = i + 1; break }
    }
    if (digitsBefore === 0) caret.current = 0
    onChange(sanitizeAmountInput(typed, currency))
  }

  // Settle a part-typed figure to the currency's decimals once the field is left, so what is
  // submitted reads the same as the amount shown everywhere after it.
  function handleBlur() {
    const amt = parseFloat(value)
    if (!Number.isFinite(amt)) return onChange('')
    onChange(amt.toFixed(currencyDecimals(currency)))
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
        {CURRENCY_SYMBOLS[currency] || ''}
      </span>
      <input
        {...rest}
        ref={ref}
        type="text"
        inputMode="decimal"
        value={formatAmountInput(value, currency)}
        onChange={handleChange}
        onBlur={handleBlur}
        className={[className, 'pl-7'].join(' ')}
      />
    </div>
  )
}

export default function LoanWizard() {
  const { state, dispatch, showToast, can } = useApp()
  // A collection fee charged the annuity way is priced into the instalment, so the quote the
  // borrower sees in the wizard is the same level payment the saved schedule will bill.
  const wizardCollectionRate = chargedCollectionRate({}, state.feeSettings || {})

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

  // A loan saved before balloons existed carries no structure at all, which reads as the ordinary
  // amortizing product it was written as — the same default a brand new application opens on.
  const [structure, setStructure] = useState(existingLoan?.structure || LOAN_STRUCTURES[0])
  const [balloonPercent, setBalloonPercent] = useState(
    existingLoan?.balloonPercent ? existingLoan.balloonPercent.toString() : String(DEFAULT_BALLOON_PERCENT)
  )

  const [creditOfficer, setCreditOfficer] = useState(existingLoan?.creditOfficer || '')
  const [branch, setBranch] = useState(existingLoan?.branch || 'Phnom Penh HQ')

  // No longer editable in this wizard — kept with sane defaults so submitted loans still
  // carry the shape other screens (LoanDetail, Dashboard, Reports) expect.
  const [disbursementDate] = useState(existingLoan?.disbursementDate || todayISO())
  const [repaymentType] = useState(existingLoan?.repaymentType || 'Monthly')
  const [firstInstallment] = useState(existingLoan?.firstInstallment || addMonths(todayISO(), 1))
  // Seeded from the loan product's penalty setting (Loan Setting -> Loan Product); 0 there means
  // the product carries no late penalty at all. An existing loan keeps whatever it was written with.
  // How far into the term the penalty applies (0 = whole term), carried from the product.
  const [penaltyMonths, setPenaltyMonths] = useState(() => {
    if (existingLoan?.penaltyMonths != null) return existingLoan.penaltyMonths
    return state.loanProducts.find(p => p.name === existingLoan?.product)?.penaltyMonths ?? 0
  })
  const [penaltyRate, setPenaltyRate] = useState(() => {
    if (existingLoan?.penaltyRate != null) return existingLoan.penaltyRate.toString()
    const prod = state.loanProducts.find(p => p.name === existingLoan?.product)
    return (prod?.penaltyRate ?? 0).toString()
  })
  const [loanCycle] = useState(existingLoan?.loanCycle || '1')

  const selectedCustomer = state.customers.find(c => c.code === customerCode) || null
  const customerOptions = state.customers.map(c => ({ value: c.code, label: c.code, sublabel: c.enName }))

  // Anything but an explicitly deactivated account. The User Accounts panel has no status
  // field, so accounts created there carry no status at all — testing `=== 'Active'` dropped
  // every officer added after install and left only the seeded ones in the list.
  // Active only: an account requested at the sign-in screen and given a role but not yet
  // activated cannot sign in, so it must not be assignable as the officer on a loan either.
  const creditOfficers = state.systemUsers.filter(u => u.role === 'Credit Officer' && u.status === 'Active')

  const selectedProductMax = useMemo(() => {
    const selectedProduct = state.loanProducts.find(p => p.name === product)
    return getProductMaxAmount(selectedProduct, currency)
  }, [state.loanProducts, product, currency])
  const amountExceedsMax = selectedProductMax && parseFloat(amount) > selectedProductMax

  const isBalloon = structure === 'Balloon'
  const isDeclining = structure === 'Decline'
  // Only a balloon loan carries a residual; switching back to amortizing or declining has to price
  // at zero rather than keep quoting the percentage still sitting in the field.
  const balloonPct = isBalloon ? parseFloat(balloonPercent) : 0
  const balloonValid = !isBalloon || (balloonPct > 0 && balloonPct <= 100)
  const isInterestOnly = isBalloon && balloonPct === BALLOON_INTEREST_ONLY_PERCENT

  const amortData = useMemo(() => {
    const amt = parseFloat(amount)
    const rate = parseFloat(interestRate)
    const term = parseInt(installments, 10)
    if (!amt || amt <= 0 || !rate || rate <= 0 || !term || term <= 0) return { emi: 0, rows: [] }
    if (!balloonValid) return { emi: 0, rows: [] }
    return buildAmortizationData(amt, rate, term, firstInstallment, wizardCollectionRate, disbursementDate, currency, balloonPct, structure)
  }, [amount, interestRate, installments, firstInstallment, disbursementDate, wizardCollectionRate, currency, balloonPct, balloonValid, structure])

  // The lump the borrower faces at maturity, read off the schedule rather than recomputed, so the
  // figures quoted here are the ones the saved schedule will actually bill.
  const lastRow = amortData.rows.length ? amortData.rows[amortData.rows.length - 1] : null
  const balloonAmount = lastRow ? lastRow.principal : 0
  const finalPayment = lastRow ? lastRow.totalDue : 0
  // Quoted alongside a declining schedule because it is the reason to write one: a shrinking
  // balance is charged less interest than a level one over the same term, and the officer should
  // be able to show the borrower that figure rather than assert it.
  const totalInterest = amortData.rows.reduce((sum, r) => sum + (r.interest || 0), 0)

  // Above the early return below: a hook called on some renders and not others changes the
  // hook order React relies on.
  const modal = useModalA11y({ label: editRef ? 'Edit Loan Application' : 'New Loan Application', escape: false })

  if (!state.loanWizardOpen) return null

  function handleProductChange(name) {
    setProduct(name)
    const prod = state.loanProducts.find(p => p.name === name)
    if (prod?.rate !== undefined) setInterestRate(prod.rate.toString())
    if (prod) { setPenaltyRate((prod.penaltyRate ?? 0).toString()); setPenaltyMonths(prod.penaltyMonths ?? 0) }
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
      if (isBalloon && !balloonValid) {
        showToast('Enter a balloon residual between 1% and 100% of the loan amount', 'error')
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
    const { emi, rows } = buildAmortizationData(amt, rate, term, firstInstallment, wizardCollectionRate, disbursementDate, currency, balloonPct, structure)

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
      // Both written every time, whichever structure was chosen: an application edited back from
      // Balloon has to stop carrying a residual, and a stale percentage left behind would re-price
      // the schedule the next time any screen rebuilt it.
      structure: LOAN_STRUCTURES.includes(structure) ? structure : LOAN_STRUCTURES[0],
      balloonPercent: balloonPct,
      interestRate: rate,
      penaltyRate: penalty,
      penaltyMonths,
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
      <div {...modal} className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

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
                      onClick={() => {
                        setCurrency(c)
                        // An amount already typed has to be re-read in the currency now selected —
                        // switching a USD 1200.50 to riel leaves 1200, not a stray decimal place.
                        setAmount(prev => sanitizeAmountInput(prev, c))
                      }}
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
                  <AmountInput
                    value={amount} currency={currency} onChange={setAmount}
                    placeholder={currencyDecimals(currency) === 0 ? '0' : '0.00'}
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

              {/* Each structure states what it costs the borrower on its own card, so the choice is
                  made by reading rather than by remembering what "Balloon" bills. The three sit one
                  per row rather than side by side: the description is the part being compared, and
                  three columns of it on a narrow modal would wrap into unreadable slivers. */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5 text-[#0047ab] dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Repayment Structure</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Select how you want to pay</p>
                  </div>
                </div>

                <div role="radiogroup" aria-label="Repayment structure" className="space-y-2">
                  {LOAN_STRUCTURE_OPTIONS.map(opt => {
                    const look = STRUCTURE_STYLES[opt.value]
                    const selected = structure === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setStructure(opt.value)}
                        className={[
                          'w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border-2 text-left transition-colors',
                          'focus:outline-none focus:ring-2 focus:ring-blue-500/30',
                          selected
                            ? 'border-[#0047ab] bg-blue-50/60 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#0047ab]/50',
                        ].join(' ')}
                      >
                        <div className={['w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', look.tile].join(' ')}>
                          <look.Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{opt.label}</span>
                            <span className={['px-2 py-0.5 rounded-full text-[10px] font-semibold', look.tag].join(' ')}>{opt.tag}</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.description}</p>
                        </div>
                        {selected ? (
                          <Check className="w-4 h-4 text-[#0047ab] dark:text-blue-400 flex-shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Only asked for once Balloon is chosen — an amortizing loan has no residual to
                  state, and putting the field on screen regardless would ask every officer to
                  read past a number that does not apply to the loan they are writing. */}
              {isBalloon && (
                <div>
                  <label className={labelCls}>Balloon Residual (% of principal) *</label>
                  <input
                    type="number" min="1" max="100" step="1" inputMode="numeric"
                    value={balloonPercent}
                    onChange={e => setBalloonPercent(e.target.value)}
                    className={[inputCls, balloonValid ? '' : 'border-rose-400 focus:ring-rose-400'].join(' ')}
                  />
                  {balloonValid ? (
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isInterestOnly
                        ? 'Interest only — the borrower services interest each month and repays the whole principal on the final instalment.'
                        : `${balloonPct}% of the principal stays outstanding through the term and falls due on the final instalment.`}
                    </p>
                  ) : (
                    <p className="text-[11px] mt-1 text-rose-600 font-semibold">Enter a residual between 1% and 100%</p>
                  )}
                </div>
              )}

              {amortData.rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-blue-50 dark:bg-blue-900/30 px-4 py-3 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {isDeclining ? 'Highest Instalment'
                        : isInterestOnly ? 'Estimated Monthly Interest'
                          : 'Estimated Monthly EMI'}
                    </span>
                    <span className="text-sm font-bold text-[#0047ab] dark:text-blue-400">{formatVal(amortData.emi, currency, 1)}</span>
                  </div>
                  {/* Both ends of a declining schedule, since neither one on its own tells the
                      borrower what they are signing: the highest is what they must be able to
                      afford, the last is what the instalment falls to. */}
                  {isDeclining && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Final Instalment ({amortData.rows.length})</span>
                        <span className="text-sm font-bold text-violet-700 dark:text-violet-400">{formatVal(finalPayment, currency, 1)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Total Interest</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatVal(totalInterest, currency, 1)}</span>
                      </div>
                    </>
                  )}
                  {isBalloon && balloonAmount > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Balloon at Maturity</span>
                        <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{formatVal(balloonAmount, currency, 1)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Final Instalment ({amortData.rows.length})</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatVal(finalPayment, currency, 1)}</span>
                      </div>
                    </>
                  )}
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
