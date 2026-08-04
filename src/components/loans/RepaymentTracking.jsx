import { Fragment, useState, useEffect } from 'react'
import { CheckCircle, Clock, AlertCircle, X, Check, Printer, CornerDownRight, ChevronRight, ChevronDown, Banknote, CalendarClock } from 'lucide-react'
import { useApp, hasFundingAccount } from '../../context/AppContext'
import { formatVal, formatDateDisplay, CONVERSION_RATE } from '../../utils/format'
import { companyLogoSrc } from '../../utils/companyLogo'
import { KH_BANKS } from '../../data/geoData'

const PAYMENT_METHODS = ['Cash', 'Transfer']
const inputCls = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition'

function formatThousands(value) {
  if (value === '' || value == null) return ''
  const num = Number(value)
  return isNaN(num) ? value : num.toLocaleString('en-US')
}

function isRowSettled(row) {
  return row.status === 'Paid' || row.status === 'Partial'
}

// A payment collected exactly on the due date is the expected case, so its date is
// left blank in the Payment Date column — only an early or late collection is worth
// surfacing there.
function paymentDateDisplay(dateISO, dueDateISO) {
  if (!dateISO || dateISO === dueDateISO) return ''
  return formatDateDisplay(dateISO) || ''
}

function isRowLate(row) {
  if (isRowSettled(row) || !row.dueDateISO) return false
  const today = new Date(new Date().toDateString())
  return new Date(row.dueDateISO) < today
}

// A payment that does not cover the scheduled principal (classically an
// interest-only month) leaves a principal remainder. It can be settled two ways:
// paid directly against this installment (RECORD_REMAINDER, which stamps
// remainderPaidDate), or collected with the next installment — RECORD_REPAYMENT
// rolls the shortfall onto that row, so paying it in full clears this remainder
// and supplies its paid date.
const round2 = x => Math.round((x || 0) * 100) / 100

// A residual of a cent or less is a rounding artifact, not money the borrower still owes.
// Schedules written before amortizePeriods rounded hold full-precision figures, so a row
// displayed as "Total Due $866.63" really wanted 866.6349 — paying exactly what the screen
// asked for left a fraction behind that surfaced as a $0.01 debt which was never real.
// Schedules generated now come out to the cent and land on zero, so this tolerance only
// ever absorbs that legacy case; a genuine underpayment is orders of magnitude larger.
const SETTLED_TOLERANCE = 0.015

function getRemainder(schedule, idx) {
  const row = schedule[idx]
  if (!isRowSettled(row)) return null
  const outstanding = Math.max(round2(round2(row.principal) - round2(row.principalPaid)), 0)
  const next = schedule[idx + 1]

  if (outstanding > SETTLED_TOLERANCE) {
    const collectedWithNext = next?.status === 'Paid'
    return {
      amount: outstanding,
      settled: collectedWithNext,
      paidDate: collectedWithNext ? next.paidDate : null,
      carriedTo: next?.num ?? null,
      // Once the next installment has been paid against at all, this remainder is
      // folded into that row's own figures — flagging it stops it being counted as
      // still-owed both here and there.
      absorbed: next ? isRowSettled(next) : false,
    }
  }

  const paidDirect = Math.round((row.remainderPaid || 0) * 100) / 100
  if (paidDirect > 0.005) {
    // Paid on its own, so it has its own receipt. A remainder collected with the
    // next installment does not — that payment's receipt lives on the next row.
    return { amount: paidDirect, settled: true, paidDate: row.remainderPaidDate || null, carriedTo: null, absorbed: false, hasOwnPayment: true }
  }
  return null
}

export default function RepaymentTracking() {
  const { state, dispatch, showToast } = useApp()
  const loan = state.activeLoan
  const [adjustIdx, setAdjustIdx] = useState(null)
  const [lateFeeInput, setLateFeeInput] = useState('')
  const [lateFeeNote, setLateFeeNote] = useState('')
  const [recordIdx, setRecordIdx] = useState(null)
  const [recordMode, setRecordMode] = useState('installment')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [paymentMemo, setPaymentMemo] = useState('')
  const [bankName, setBankName] = useState('')
  const [receivedCurrency, setReceivedCurrency] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  // Optional bank-transfer receipt details — mirror what a real transfer confirmation
  // shows (transaction ID, reference #, payer, remark, destination account, hash), kept
  // collapsed by default since most repayments don't need them recorded field-by-field.
  const [showTransferDetails, setShowTransferDetails] = useState(false)
  const [trxId, setTrxId] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [payerName, setPayerName] = useState('')
  const [outlet, setOutlet] = useState('')
  const [remark, setRemark] = useState('')
  const [toAccount, setToAccount] = useState('')
  const [txnHash, setTxnHash] = useState('')
  const [receiptIdx, setReceiptIdx] = useState(null)
  const [receiptMode, setReceiptMode] = useState('installment')
  const [expanded, setExpanded] = useState(() => new Set())

  // Capture-phase + stopPropagation: this component's own modals (Record Payment, Adjust
  // Late Fee, Receipt) stack on top of the LoanOverview/LoanPreview screen, whose Escape
  // is already handled (globally, or via that screen's own capture-phase handler). Without
  // this, Escape here would bounce the officer out of the whole loan record instead of
  // just backing out of the record/adjust/receipt dialog.
  useEffect(() => {
    if (!(adjustIdx !== null || recordIdx !== null || receiptIdx !== null)) return
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (recordIdx !== null) setRecordIdx(null)
      else if (adjustIdx !== null) setAdjustIdx(null)
      else if (receiptIdx !== null) setReceiptIdx(null)
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [adjustIdx, recordIdx, receiptIdx])

  function toggleExpand(idx) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  if (!loan || !loan.schedule || loan.schedule.length === 0) return null

  const currency = loan.currency || state.currency
  const schedule = loan.schedule

  const paidRows = schedule.filter(isRowSettled)
  const dueRows = schedule.filter(r => !isRowSettled(r))
  const lateRows = schedule.filter(isRowLate)
  // Principal still owed — the balance left by the most recent settled installment
  // (each row's `balance` is already the running remainder, so summing them would
  // count the same principal once per outstanding row).
  const lastSettledIdx = schedule.reduce((last, r, i) => (isRowSettled(r) ? i : last), -1)
  const outstandingBalance = lastSettledIdx >= 0 ? (schedule[lastSettledIdx].balance ?? 0) : loan.amount
  const totalPaid = paidRows.reduce((sum, r) => sum + (r.paid || r.totalDue || 0), 0)

  // Only a loan that has actually been released has money out to report. The payout
  // expense carries the real release date; `loan.disbursementDate` is the date agreed
  // on the contract and is the fallback for loans seeded as already Active.
  const isDisbursed = loan.status === 'Active'
  const disbursementExpense = state.expenses?.find(e => e.code === `DSB-${loan.ref}`)
  const disbursedAmount = disbursementExpense?.amount ?? loan.amount
  const disbursedDate = disbursementExpense?.date || loan.disbursementDate
  const disbursementAccount = state.customers.find(c => c.code === loan.customerCode)?.accountNumber
  // Interest the schedule will charge over the full term, stated alongside the
  // principal that went out so both sides of the loan are visible in one place.
  const totalInterest = schedule.reduce((sum, r) => sum + (r.interest || 0), 0)
  // What the loan is worth over its life — principal out plus all interest charged.
  const totalContractValue = Math.round((disbursedAmount + totalInterest) * 100) / 100

  function openRecordModal(idx, mode = 'installment', prefillAmount = null) {
    const row = schedule[idx]
    const due = mode === 'remainder'
      ? prefillAmount
      : Math.round(((row.totalDue || 0) + (row.lateFee || 0)) * 100) / 100
    setPaymentMethod('')
    setPaymentAmount(String(due))
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentMemo('')
    setBankName('')
    setReceivedCurrency(currency)
    setExchangeRate(String(CONVERSION_RATE))
    setShowTransferDetails(false)
    setTrxId('')
    setReferenceNo('')
    setPayerName('')
    setOutlet('')
    setRemark('')
    setToAccount('')
    setTxnHash('')
    setRecordMode(mode)
    setRecordIdx(idx)
  }

  function openReceipt(idx, mode = 'installment') {
    setReceiptMode(mode)
    setReceiptIdx(idx)
  }

  const showExchangeRate = paymentMethod === 'Cash' && currency === 'USD' && receivedCurrency === 'KHR'

  // The amount field always reflects whichever currency is actually being received —
  // switching currency converts the figure already typed instead of leaving it stale.
  function handleReceivedCurrencyChange(newCurrency) {
    if (newCurrency === receivedCurrency) return
    const rate = parseFloat(exchangeRate) || CONVERSION_RATE
    const amt = parseFloat(paymentAmount)
    if (!isNaN(amt)) {
      if (newCurrency === 'KHR') setPaymentAmount(String(Math.round(amt * rate)))
      else setPaymentAmount(String(Math.round((amt / rate) * 100) / 100))
    }
    setReceivedCurrency(newCurrency)
  }

  function handleConfirmRecord() {
    if (!paymentMethod) {
      showToast('Select a payment method', 'error')
      return
    }
    if (!hasFundingAccount(state.realBankAccounts, currency, loan.branch)) {
      showToast(`No ${currency} bank account configured for ${loan.branch}. Add one in Real Bank Accounts before recording this payment.`, 'error')
      return
    }
    const enteredAmount = parseFloat(paymentAmount)
    if (isNaN(enteredAmount) || enteredAmount <= 0) {
      showToast('Enter a valid payment amount', 'error')
      return
    }
    if (!paymentDate) {
      showToast('Select a payment date', 'error')
      return
    }
    let rate = null
    let amount = enteredAmount
    if (showExchangeRate) {
      rate = parseFloat(exchangeRate)
      if (isNaN(rate) || rate <= 0) {
        showToast('Enter a valid exchange rate', 'error')
        return
      }
      amount = Math.round((enteredAmount / rate) * 100) / 100
    }
    dispatch({
      type: recordMode === 'remainder' ? 'RECORD_REMAINDER' : 'RECORD_REPAYMENT',
      idx: recordIdx, paymentMethod, amount, date: paymentDate,
      memo: paymentMemo.trim(),
      bankName: paymentMethod === 'Transfer' ? bankName.trim() : '',
      receivedCurrency: showExchangeRate ? 'KHR' : null,
      exchangeRate: rate,
      trxId: paymentMethod === 'Transfer' ? trxId.trim() : '',
      referenceNo: paymentMethod === 'Transfer' ? referenceNo.trim() : '',
      payerName: paymentMethod === 'Transfer' ? payerName.trim() : '',
      outlet: paymentMethod === 'Transfer' ? outlet.trim() : '',
      remark: paymentMethod === 'Transfer' ? remark.trim() : '',
      toAccount: paymentMethod === 'Transfer' ? toAccount.trim() : '',
      txnHash: paymentMethod === 'Transfer' ? txnHash.trim() : '',
    })
    if (recordMode === 'remainder') {
      showToast(`Remaining balance of installment #${schedule[recordIdx].num} recorded via ${paymentMethod}`, 'success')
    } else {
      showToast(`Repayment #${recordIdx + 1} recorded via ${paymentMethod}`, 'success')
      openReceipt(recordIdx, 'installment')
    }
    setRecordIdx(null)
  }

  function openAdjustModal(idx) {
    const row = schedule[idx]
    const suggested = row.lateFee != null ? row.lateFee : Math.round((row.totalDue || 0) * ((loan.penaltyRate || 0) / 100) * 100) / 100
    setLateFeeInput(String(suggested))
    setLateFeeNote(row.lateFeeNote || '')
    setAdjustIdx(idx)
  }

  function handleSaveLateFee() {
    const amount = parseFloat(lateFeeInput)
    if (isNaN(amount) || amount < 0) {
      showToast('Enter a valid late fee amount', 'error')
      return
    }
    dispatch({ type: 'ADJUST_LATE_FEE', idx: adjustIdx, amount, note: lateFeeNote.trim() })
    showToast(`Late fee for installment #${schedule[adjustIdx].num} updated`, 'success')
    setAdjustIdx(null)
  }

  function effectiveStatus(row) {
    return isRowLate(row) ? 'Overdue' : row.status
  }

  function statusIcon(status) {
    if (status === 'Paid') return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
    if (status === 'Partial') return <CheckCircle className="w-3.5 h-3.5 text-sky-500" />
    if (status === 'Overdue') return <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
    return <Clock className="w-3.5 h-3.5 text-amber-500" />
  }

  function statusBadge(status) {
    const map = {
      Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
      Partial: 'bg-sky-50 text-sky-700 border-sky-200/60 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700',
      Overdue: 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700',
      Upcoming: 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
    }
    return map[status] || map.Upcoming
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl px-4 sm:px-6 pt-4 sm:pt-6 pb-6">
      <div className={receiptIdx === null ? 'printable-area' : ''}>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-4">
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">Paid Installments</p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{paidRows.length}</p>
          <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1">{formatVal(totalPaid, currency, 1)} paid</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-4">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">Remaining</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{dueRows.length}</p>
          <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">installments due</p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-900/30 rounded-xl p-4">
          <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mb-1">Overdue</p>
          <p className="text-2xl font-bold text-rose-700 dark:text-rose-300">{lateRows.length}</p>
          <p className="text-xs text-rose-500 dark:text-rose-400 mt-1">past due date</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-4">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Outstanding</p>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300 truncate">{formatVal(outstandingBalance, currency, 1)}</p>
          <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">remaining balance</p>
        </div>
      </div>

      {/* Schedule table */}
      <div className="overflow-x-auto overflow-y-auto max-h-[420px] rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
              <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400">#</th>
              <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400">Due Date</th>
              <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Payment Date</th>
              <th className="px-3 py-3 text-right font-semibold text-slate-500 dark:text-slate-400">Principal</th>
              <th className="px-3 py-3 text-right font-semibold text-slate-500 dark:text-slate-400">Interest</th>
              <th className="px-3 py-3 text-right font-semibold text-slate-500 dark:text-slate-400">Total Due</th>
              <th className="px-3 py-3 text-right font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Penalty Fee</th>
              <th className="px-3 py-3 text-right font-semibold text-slate-500 dark:text-slate-400">Paid</th>
              <th className="px-3 py-3 text-right font-semibold text-slate-500 dark:text-slate-400">Remaining</th>
              <th className="px-3 py-3 text-center font-semibold text-slate-500 dark:text-slate-400">Status</th>
              <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400">Memo</th>
              <th className="px-3 py-3 text-right font-semibold text-slate-500 dark:text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {/* Money out. The schedule only tracks money coming back in, so the principal
                actually released to the customer is stated once at the head of the table
                to give the collections below something to be measured against. */}
            {isDisbursed && (
              <tr className="bg-blue-50/50 dark:bg-blue-900/10">
                <td className="px-3 py-2.5 text-center">
                  <Banknote className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 mx-auto" />
                </td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {formatDateDisplay(disbursedDate) || '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-blue-700 dark:text-blue-300">
                  {formatVal(disbursedAmount, currency, 1)}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-blue-700 dark:text-blue-300">
                  {formatVal(totalInterest, currency, 1)}
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-blue-700 dark:text-blue-300">
                  {formatVal(totalContractValue, currency, 1)}
                </td>
                <td className="px-3 py-2.5 text-right"><span className="text-slate-300 dark:text-slate-600">—</span></td>
                <td className="px-3 py-2.5 text-right"><span className="text-slate-300 dark:text-slate-600">—</span></td>
                <td className="px-3 py-2.5 text-right"><span className="text-slate-300 dark:text-slate-600">—</span></td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700">
                      <Banknote className="w-3.5 h-3.5" />
                      Disbursed
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                  <span className="block max-w-[200px] truncate">
                    {disbursementAccount ? `Released to ${disbursementAccount}` : 'Loan amount released'}
                  </span>
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            )}
            {schedule.map((row, idx) => {
              const status = effectiveStatus(row)
              const late = isRowLate(row)
              const remainder = getRemainder(schedule, idx)
              // When an installment is settled in two collections, break the payment
              // apart so each keeps its own settlement date (the second must not overwrite
              // the first). `row.paid` already rolls both together.
              const remainderPaidAmt = Math.round((row.remainderPaid || 0) * 100) / 100
              const firstPaidAmt = Math.round(((row.paid || 0) - remainderPaidAmt) * 100) / 100
              const paidTwice = remainder && remainder.settled && remainder.hasOwnPayment && firstPaidAmt > 0.005 && remainderPaidAmt > 0.005
              return (
                <Fragment key={idx}>
                <tr
                  className={[
                    'transition-colors',
                    row.status === 'Paid'
                      ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700/30',
                  ].join(' ')}
                >
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-medium">
                    {paidTwice ? (
                      <button
                        onClick={() => toggleExpand(idx)}
                        className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        title={expanded.has(idx) ? 'Hide payment breakdown' : 'Show payment breakdown'}
                      >
                        {expanded.has(idx) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {row.num}
                      </button>
                    ) : (
                      <span className="pl-[18px]">{row.num}</span>
                    )}
                  </td>
                  {/* The collection day is agreed in the Confirm Disbursement dialog
                      (FirstRepaymentDateField) and fixed once the loan is Active, so the date
                      here is plain text — it also keeps the column printable. A rescheduled
                      date is flagged amber with its reason in the tooltip. */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={row.dueDateOriginalISO ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-slate-700 dark:text-slate-200'}
                      title={row.dueDateOriginalISO ? `Rescheduled from ${formatDateDisplay(row.dueDateOriginalISO)}${row.dueDateNote ? ` — ${row.dueDateNote}` : ''}` : undefined}
                    >
                      {row.dueDate}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {!paidTwice && row.paid > 0 ? paymentDateDisplay(row.paidDate, row.dueDateISO) : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{formatVal(row.principal, currency, 1)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">{formatVal(row.interest, currency, 1)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">{formatVal(row.totalDue, currency, 1)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {row.lateFee > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{formatVal(row.lateFee, currency, 1)}</span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                    {row.paid > 0 ? formatVal(row.paid, currency, 1) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {!remainder ? (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    ) : remainder.settled ? (
                      <span className="text-slate-400 dark:text-slate-500 line-through">{formatVal(remainder.amount, currency, 1)}</span>
                    ) : remainder.absorbed ? (
                      <span className="text-slate-400 dark:text-slate-500">{formatVal(remainder.amount, currency, 1)}</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatVal(remainder.amount, currency, 1)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusBadge(status)}`}>
                        {statusIcon(status)}
                        {status}
                      </span>
                    </div>
                  </td>
                  {/* Payment memo and reschedule reason are separate notes about the same
                      installment, so both show — stacked, with the reason in amber to match
                      the rescheduled due date it explains. */}
                  <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                    {row.memo || row.dueDateNote ? (
                      <div className="max-w-[200px] space-y-0.5">
                        {row.memo && <span className="block truncate" title={row.memo}>{row.memo}</span>}
                        {row.dueDateNote && (
                          <span
                            className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
                            title={`Rescheduled from ${formatDateDisplay(row.dueDateOriginalISO)} — ${row.dueDateNote}`}
                          >
                            <CalendarClock className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{row.dueDateNote}</span>
                          </span>
                        )}
                      </div>
                    ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {!isRowSettled(row) ? (
                      <div className="flex items-center justify-end gap-1.5">
                        {late && (
                          <button
                            onClick={() => openAdjustModal(idx)}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold rounded-lg transition-colors"
                          >
                            Adjust
                          </button>
                        )}
                        <button
                          onClick={() => openRecordModal(idx)}
                          className="px-2.5 py-1 bg-[#0047ab] hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg transition-colors"
                        >
                          Record
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openReceipt(idx, 'installment')}
                        className="flex items-center gap-1 ml-auto px-2.5 py-1 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold rounded-lg transition-colors"
                      >
                        <Printer className="w-3 h-3" />
                        Receipt
                      </button>
                    )}
                  </td>
                </tr>

                {/* Principal remainder left by an interest-only payment (condition 2).
                    Settled in two collections → one settlement sub-row per payment so both
                    dates survive; otherwise a single row (its real date once paid, or the
                    outstanding amount with a Record action while still owed). */}
                {remainder && (paidTwice ? (expanded.has(idx) && (
                  <Fragment>
                    <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                      <td className="px-3 py-2 text-center">
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mx-auto" />
                      </td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {paymentDateDisplay(row.paidDate, row.dueDateISO)}
                      </td>
                      <td colSpan={4} />
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{formatVal(firstPaidAmt, currency, 1)}</td>
                      <td className="px-3 py-2 text-right"><span className="text-slate-300 dark:text-slate-600">—</span></td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusBadge('Paid')}`}>
                            {statusIcon('Paid')}
                            Paid
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                        {row.memo ? <span className="block max-w-[200px] truncate" title={row.memo}>{row.memo}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => openReceipt(idx, 'installment')}
                          className="flex items-center gap-1 ml-auto px-2.5 py-1 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold rounded-lg transition-colors"
                        >
                          <Printer className="w-3 h-3" />
                          Receipt
                        </button>
                      </td>
                    </tr>
                    <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                      <td className="px-3 py-2 text-center">
                        <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mx-auto" />
                      </td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {paymentDateDisplay(remainder.paidDate, row.dueDateISO)}
                      </td>
                      <td colSpan={4} />
                      <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{formatVal(remainderPaidAmt, currency, 1)}</td>
                      <td className="px-3 py-2 text-right"><span className="text-slate-300 dark:text-slate-600">—</span></td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusBadge('Paid')}`}>
                            {statusIcon('Paid')}
                            Paid
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                        {row.remainderMemo ? <span className="block max-w-[200px] truncate" title={row.remainderMemo}>{row.remainderMemo}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => openReceipt(idx, 'remainder')}
                          className="flex items-center gap-1 ml-auto px-2.5 py-1 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold rounded-lg transition-colors"
                        >
                          <Printer className="w-3 h-3" />
                          Receipt
                        </button>
                      </td>
                    </tr>
                  </Fragment>
                )) : (
                  <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                    <td className="px-3 py-2 text-center">
                      <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mx-auto" />
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {paymentDateDisplay(remainder.settled ? remainder.paidDate : row.paidDate, row.dueDateISO)}
                    </td>
                    <td colSpan={4} />
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                      {remainder.settled ? formatVal(remainder.amount, currency, 1) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {remainder.settled
                        ? <span className="text-slate-300 dark:text-slate-600">—</span>
                        : <span className={remainder.absorbed ? 'text-slate-400 dark:text-slate-500' : 'text-amber-600 dark:text-amber-400 font-semibold'}>{formatVal(remainder.amount, currency, 1)}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusBadge(remainder.settled ? 'Paid' : 'Upcoming')}`}>
                          {statusIcon(remainder.settled ? 'Paid' : 'Upcoming')}
                          {remainder.settled ? 'Paid' : 'Outstanding'}
                        </span>
                      </div>
                    </td>
                    {(() => { const m = remainder.settled ? row.remainderMemo : row.memo; return (
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                        {m ? <span className="block max-w-[200px] truncate" title={m}>{m}</span> : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>
                    ) })()}
                    <td className="px-3 py-2 text-right">
                      {!remainder.settled ? (
                        <button
                          onClick={() => openRecordModal(idx, 'remainder', remainder.amount)}
                          className="px-2.5 py-1 bg-[#0047ab] hover:bg-blue-700 text-white text-[11px] font-semibold rounded-lg transition-colors"
                        >
                          Record
                        </button>
                      ) : remainder.hasOwnPayment && (
                        <button
                          onClick={() => openReceipt(idx, 'remainder')}
                          className="flex items-center gap-1 ml-auto px-2.5 py-1 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold rounded-lg transition-colors"
                        >
                          <Printer className="w-3 h-3" />
                          Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      </div>

      {/* Adjust late fee modal */}
      {adjustIdx !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAdjustIdx(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Adjust Late Fee</h3>
              <button
                onClick={() => setAdjustIdx(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Installment <span className="font-semibold text-slate-800 dark:text-slate-100">#{schedule[adjustIdx].num}</span> was due <span className="font-semibold text-slate-800 dark:text-slate-100">{schedule[adjustIdx].dueDate}</span> and is overdue.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Late Fee Amount ({currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lateFeeInput}
                  onChange={e => setLateFeeInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Suggested from loan penalty rate ({loan.penaltyRate || 0}%) — override as needed.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Note (optional)
                </label>
                <textarea
                  value={lateFeeNote}
                  onChange={e => setLateFeeNote(e.target.value)}
                  rows={2}
                  placeholder="Reason for this adjustment…"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setAdjustIdx(null)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLateFee}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white bg-amber-600 hover:bg-amber-700 transition-colors"
              >
                <Check className="w-4 h-4" />
                Save Late Fee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record repayment modal */}
      {recordIdx !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setRecordIdx(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {recordMode === 'remainder' ? 'Record Remaining Balance' : 'Record Repayment'}
              </h3>
              <button
                onClick={() => setRecordIdx(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {recordMode === 'remainder' ? (
                  <>
                    Remaining balance of installment <span className="font-semibold text-slate-800 dark:text-slate-100">#{schedule[recordIdx].num}</span> — {formatVal(Math.max(round2(round2(schedule[recordIdx].principal) - round2(schedule[recordIdx].principalPaid)), 0), currency, 1)}
                  </>
                ) : (
                  <>
                    Installment <span className="font-semibold text-slate-800 dark:text-slate-100">#{schedule[recordIdx].num}</span> — due {formatVal((schedule[recordIdx].totalDue || 0) + (schedule[recordIdx].lateFee || 0), currency, 1)}
                  </>
                )}
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Amount Paid ({showExchangeRate ? 'KHR' : currency})
                </label>
                {showExchangeRate ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatThousands(paymentAmount)}
                    onChange={e => setPaymentAmount(e.target.value.replace(/[^\d]/g, ''))}
                    className={inputCls}
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    className={inputCls}
                  />
                )}
                {showExchangeRate && parseFloat(paymentAmount) > 0 && parseFloat(exchangeRate) > 0 && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                    ≈ {formatVal(Math.round((parseFloat(paymentAmount) / parseFloat(exchangeRate)) * 100) / 100, 'USD', 1)} credited toward this installment
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => { setPaymentMethod(e.target.value); if (e.target.value !== 'Cash') handleReceivedCurrencyChange(currency) }}
                  className={inputCls}
                >
                  <option value="">— Select Method —</option>
                  {PAYMENT_METHODS.map(method => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
              {paymentMethod === 'Transfer' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Bank Name
                  </label>
                  <select
                    value={bankName}
                    onChange={e => setBankName(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Select Bank —</option>
                    {KH_BANKS.map(bank => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              )}
              {paymentMethod === 'Transfer' && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowTransferDetails(v => !v)}
                    aria-expanded={showTransferDetails}
                    className="flex items-center gap-1 text-xs font-semibold text-[#0047ab] dark:text-blue-400 hover:underline"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTransferDetails ? 'rotate-180' : ''}`} />
                    Transfer receipt details (optional)
                  </button>
                  {showTransferDetails && (
                    <div className="mt-3 space-y-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Trx. ID</label>
                        <input type="text" placeholder="e.g. 57988813172" value={trxId} onChange={e => setTrxId(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Reference #</label>
                        <input type="text" placeholder="e.g. 100FT38404071292" value={referenceNo} onChange={e => setReferenceNo(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Outlet</label>
                        <input type="text" placeholder="e.g. CHHAIYA IT" value={outlet} onChange={e => setOutlet(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Payer</label>
                        <input type="text" placeholder="e.g. VIN AN GIE (1120002293650)" value={payerName} onChange={e => setPayerName(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">To Account</label>
                        <input type="text" placeholder="e.g. Daily Expend Account (500 443 976)" value={toAccount} onChange={e => setToAccount(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Remark</label>
                        <input type="text" placeholder="e.g. Pay/Transfer to CHHAIYA IT" value={remark} onChange={e => setRemark(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Transaction Hash #</label>
                        <input type="text" placeholder="e.g. 0cbc55f8" value={txnHash} onChange={e => setTxnHash(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                  )}
                </div>
              )}
              {paymentMethod === 'Cash' && currency === 'USD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Cash Received In
                  </label>
                  <select
                    value={receivedCurrency}
                    onChange={e => handleReceivedCurrencyChange(e.target.value)}
                    className={inputCls}
                  >
                    <option value="USD">USD</option>
                    <option value="KHR">KHR</option>
                  </select>
                </div>
              )}
              {showExchangeRate && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Exchange Rate (KHR per 1 USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={exchangeRate}
                    onChange={e => setExchangeRate(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Memo (optional)
                </label>
                <textarea
                  value={paymentMemo}
                  onChange={e => setPaymentMemo(e.target.value)}
                  rows={2}
                  placeholder="Note about this payment…"
                  className={[inputCls, 'resize-none'].join(' ')}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <button
                onClick={() => setRecordIdx(null)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRecord}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white bg-[#0047ab] hover:bg-blue-700 transition-colors"
              >
                <Check className="w-4 h-4" />
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt */}
      {receiptIdx !== null && (() => {
        const row = schedule[receiptIdx]
        const isRemainder = receiptMode === 'remainder'
        const remainderPaid = Math.round((row.remainderPaid || 0) * 100) / 100
        // Each receipt covers one payment. The remainder was collected separately
        // from the installment, so its amount is backed out of the installment
        // receipt — otherwise both would report the same money.
        const p = isRemainder
          ? {
              principal: remainderPaid, interest: 0, penalty: 0, total: remainderPaid,
              date: row.remainderPaidDate, paymentMethod: row.remainderPaymentMethod,
              bankName: row.remainderBankName, receivedCurrency: row.remainderReceivedCurrency,
              exchangeRate: row.remainderExchangeRate, memo: row.remainderMemo,
            }
          : {
              principal: Math.round(((row.principalPaid ?? row.principal) - remainderPaid) * 100) / 100,
              interest: row.interestPaid ?? row.interest,
              penalty: row.lateFeePaid ?? row.lateFee ?? 0,
              total: Math.round(((row.paid || 0) - remainderPaid) * 100) / 100,
              date: row.paidDate, paymentMethod: row.paymentMethod,
              bankName: row.bankName, receivedCurrency: row.receivedCurrency,
              exchangeRate: row.exchangeRate, memo: row.memo,
            }
        const principal = p.principal
        const interest = p.interest
        const penalty = p.penalty
        const paidInKHR = p.receivedCurrency === 'KHR' && p.exchangeRate
        const displayCurrency = paidInKHR ? 'KHR' : currency
        const displayRate = paidInKHR ? p.exchangeRate : 1
        const receiptNo = `${String(row.num).padStart(3, '0')}${isRemainder ? 'R' : ''}-${loan.ref.replace('AC-L-', '')}`
        const dmy = (() => {
          const d = p.date ? new Date(p.date + 'T00:00:00') : new Date()
          return isNaN(d) ? '—' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
        })()

        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReceiptIdx(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 sm:px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Receipt — {isRemainder ? `Remaining Balance of Installment #${row.num}` : `Installment #${row.num}`}
                </h3>
                <button
                  onClick={() => setReceiptIdx(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
              <div
                className="printable-area bg-white text-slate-800 p-4 sm:p-8 flex flex-col min-h-[700px] print:min-h-[277mm]"
                style={{ fontFamily: "'Kantumruy Pro', 'Outfit', sans-serif" }}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <img src={companyLogoSrc(state.companyProfile)} alt={state.companyProfile.name} className="w-14 h-14 object-contain flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <p className="text-lg font-bold">{state.companyProfile.nameKh}</p>
                    <p className="text-sm font-bold tracking-wide">{state.companyProfile.name.toUpperCase()}</p>
                  </div>
                  <div className="w-14 h-14 flex-shrink-0" aria-hidden="true" />
                </div>

                <div className="text-center mt-4 mb-5">
                  <p className="text-xl font-bold">បណ្ណទទួលប្រាក់</p>
                  <p className="text-sm font-semibold text-slate-500">Receipt of Payment</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm mb-5">
                  <div className="flex gap-2"><span className="font-semibold w-32 flex-shrink-0">លេខកិច្ចសន្យា<br /><span className="font-normal text-xs text-slate-500">Contract No.</span></span><span>{loan.ref}</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-32 flex-shrink-0">លេខរឿង<br /><span className="font-normal text-xs text-slate-500">Receipt No.</span></span><span>{receiptNo}</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-32 flex-shrink-0">ឈ្មោះអតិថិជន<br /><span className="font-normal text-xs text-slate-500">Customer Name</span></span><span>{loan.customerName}</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-32 flex-shrink-0">កាលបរិច្ឆេទ<br /><span className="font-normal text-xs text-slate-500">Date</span></span><span>{dmy}</span></div>
                  <div className="flex gap-2"><span className="font-semibold w-32 flex-shrink-0">វិធីបង់ប្រាក់<br /><span className="font-normal text-xs text-slate-500">Payment Method</span></span><span>{p.paymentMethod}</span></div>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 border-2 border-slate-800 flex items-center justify-center">
                        {(!paidInKHR && (p.receivedCurrency || currency) !== 'KHR') && <Check className="w-3.5 h-3.5 text-slate-800" strokeWidth={3} />}
                      </span>
                      ប្រាក់ដុល្លារ <span className="text-xs text-slate-500">(USD)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 border-2 border-slate-800 flex items-center justify-center">
                        {(p.receivedCurrency || currency) === 'KHR' && <Check className="w-3.5 h-3.5 text-slate-800" strokeWidth={3} />}
                      </span>
                      ប្រាក់រៀល <span className="text-xs text-slate-500">(KHR)</span>
                    </span>
                  </div>
                  {p.paymentMethod === 'Transfer' && p.bankName && (
                    <div className="flex gap-2"><span className="font-semibold w-32 flex-shrink-0">ធនាគារ<br /><span className="font-normal text-xs text-slate-500">Bank</span></span><span>{p.bankName}</span></div>
                  )}
                </div>

                <div className="rounded-xl overflow-hidden border border-slate-300">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="text-left px-3 py-2 border-r border-slate-300">
                        <div>បរិយាយ</div>
                        <div className="font-normal text-xs text-slate-500">Description</div>
                      </th>
                      <th className="text-right px-3 py-2">
                        <div>ចំនួនទឹកប្រាក់ {paidInKHR && <span className="font-normal">(KHR)</span>}</div>
                        <div className="font-normal text-xs text-slate-500">Cash Amount</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-200">
                      <td className="px-3 py-2 border-r border-slate-300">ប្រាក់ដើម <span className="text-xs text-slate-500">Principal</span></td>
                      <td className="px-3 py-2 text-right">{formatVal(principal, displayCurrency, displayRate)}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="px-3 py-2 border-r border-slate-300">ការប្រាក់ <span className="text-xs text-slate-500">Interest</span></td>
                      <td className="px-3 py-2 text-right">{formatVal(interest, displayCurrency, displayRate)}</td>
                    </tr>
                    <tr className="border-b border-slate-200">
                      <td className="px-3 py-2 border-r border-slate-300">ប្រាក់ពិន័យ <span className="text-xs text-slate-500">Penalty</span></td>
                      <td className="px-3 py-2 text-right">{penalty > 0 ? formatVal(penalty, displayCurrency, displayRate) : '—'}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 border-r border-slate-300 font-bold">ទឹកប្រាក់សរុប <span className="text-xs font-normal text-slate-500">Total</span></td>
                      <td className="px-3 py-2 text-right font-bold">{formatVal(p.total, displayCurrency, displayRate)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>

                {paidInKHR && (
                  <div className="mt-3 text-sm">
                    អត្រាប្តូរប្រាក់ <span className="text-xs text-slate-500">Exchange Rate</span>: {p.exchangeRate} KHR/USD ({formatVal(p.total, currency, 1)})
                  </div>
                )}

                <div className="mt-2 text-sm">
                  <span className="font-semibold">Memo</span>: {p.memo}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-auto pt-16">
                  <div className="text-center">
                    <div className="border-t border-slate-400 pt-1.5">
                      <p className="text-sm font-semibold">អ្នកបង់ប្រាក់</p>
                      <p className="text-xs text-slate-500">Payer's Signature &amp; Name</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-400 pt-1.5">
                      <p className="text-sm font-semibold">អ្នកទទួលប្រាក់</p>
                      <p className="text-xs text-slate-500">Receiver's Signature &amp; Name</p>
                    </div>
                  </div>
                </div>
              </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-4 sm:px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
                <button
                  onClick={() => setReceiptIdx(null)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white bg-[#0047ab] hover:bg-blue-700 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print Receipt
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
