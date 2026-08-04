import { useState, useRef, useEffect } from 'react'
import jsPDF from 'jspdf'
import { DollarSign, TrendingUp, Calendar, Calculator, User, FileText, CreditCard, ShieldCheck, ShieldAlert, X, Check, Printer, Download, Bell, Phone, Building, Briefcase, History } from 'lucide-react'
import { useApp, hasFundingAccount } from '../../context/AppContext'
import { buildReminderRecipients, buildSampleReminderMessage, daysUntilDue as daysUntilDueISO, weumsSignedIn } from '../../utils/reminders'
import { formatVal, formatAddress, buildAmortizationData, splitTimestamp } from '../../utils/format'
import StatusBadge from '../shared/StatusBadge'
import { LOAN_TAB_ICONS } from '../../utils/tabIcons'
import { downloadSheetPdf } from '../../utils/exportPdf'
import { companyLogoSrc } from '../../utils/companyLogo'
import { InfoRow, InfoCard } from '../shared/InfoCard'
import DocList from '../shared/DocList'
import WeumsGateModal from '../shared/WeumsGateModal'
import RepaymentTracking from './RepaymentTracking'
import FirstRepaymentDateField from './FirstRepaymentDateField'
import CBCReport from './CBCReport'
import { assessLoanRisk } from '../../utils/riskAssessment'
import { incomeCapacity } from '../../utils/statementIncome'
import { expenseCapacity } from '../../utils/statementExpense'

const INSTALLMENT_OPTIONS = [3, 6, 12, 18, 24, 36, 48, 60]
const CREDIT_HISTORY_FIELD = { borrower: 'creditHistoryInfo', coBorrower: 'coBorrowerCreditHistoryInfo', guarantor: 'guarantorCreditHistoryInfo' }
const CREDIT_HISTORY_LABEL = { borrower: 'Borrower', coBorrower: 'Co-Borrower', guarantor: 'Guarantor' }

function formatDMY(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Must mirror the tab list built in the component below, or the tab requested
// via `loanOverviewTab` resolves to the wrong panel.
function getOverviewTabIndex(loan, tabName) {
  const isDisbursed = loan?.status === 'Active'
  const isApproved = isDisbursed || (loan?.approvalState || 1) >= 3
  const tabs = ['Overview']
  if (isApproved) tabs.push('Repayment Tracking', 'Repayment Reminder')
  tabs.push('Loan Profile', 'Repayment Schedule', 'Audit Log')
  const idx = tabs.indexOf(tabName)
  return idx >= 0 ? idx : 0
}

function ScheduleField({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold text-slate-700 dark:text-slate-200 w-44 flex-shrink-0">{label}</span>
      <span className="text-slate-600 dark:text-slate-300">{value || '—'}</span>
    </div>
  )
}

function DocSection({ title, children, first }) {
  return (
    <div className={first ? 'mb-5' : 'mb-5 mt-6'}>
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1 mb-2">{title}</h4>
      {children}
    </div>
  )
}

function DocSubHeading({ children }) {
  return <p className="text-[11px] font-semibold italic text-slate-400 dark:text-slate-500 mt-3 mb-1 first:mt-0">{children}</p>
}

function DocField({ label, value }) {
  return (
    <div className="flex items-baseline gap-3 py-1 border-b border-dotted border-slate-200 dark:border-slate-700 text-xs">
      <span className="text-slate-500 dark:text-slate-400 w-36 flex-shrink-0">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100 text-left truncate">{value ?? '—'}</span>
    </div>
  )
}

function DocFieldGrid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">{children}</div>
}

export default function LoanOverview() {
  const { state, dispatch, showToast, can } = useApp()
  const loan = state.activeLoan
  const [activeTab, setActiveTab] = useState(() => getOverviewTabIndex(loan, state.loanOverviewTab))
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [showDisburseModal, setShowDisburseModal] = useState(false)
  const [disburseConfirmed, setDisburseConfirmed] = useState(false)
  const [disburseFirstDueISO, setDisburseFirstDueISO] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [reminderRecipientKey, setReminderRecipientKey] = useState('borrower')
  const [reminderMessageOverride, setReminderMessageOverride] = useState(null)
  const [reminderGateOpen, setReminderGateOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [scheduleDownloading, setScheduleDownloading] = useState(false)
  const profileDocRef = useRef(null)
  const scheduleSheetRef = useRef(null)

  // Capture-phase + stopPropagation: these confirm dialogs stack on top of the
  // loanOverviewOpen screen App.jsx's global Escape handler already closes on Escape.
  // Without this, Escape would bounce the officer out of the whole loan record instead
  // of just backing out of the disburse/cancel/approval confirmation.
  useEffect(() => {
    if (!(showApprovalModal || showDisburseModal || showCancelModal || lightbox)) return
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (lightbox) setLightbox(null)
      else if (showDisburseModal) setShowDisburseModal(false)
      else if (showCancelModal) setShowCancelModal(false)
      else if (showApprovalModal) setShowApprovalModal(false)
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [showApprovalModal, showDisburseModal, showCancelModal, lightbox])

  if (!loan) return null

  const currency = loan.currency || state.currency
  const schedule = loan.schedule || []
  const emi = loan.emi || (schedule.length > 0 ? schedule[0].totalDue : 0)
  const isDisbursed = loan.status === 'Active'
  const customer = state.customers.find(c => c.code === loan.customerCode)
  const collaterals = loan.collaterals?.length ? loan.collaterals : (loan.collateral ? [loan.collateral] : [])

  const borrowerIncomes = loan.borrowerIncomes || (loan.borrowerIncomeInfo ? [loan.borrowerIncomeInfo] : [])
  const coBorrowerIncomes = loan.coBorrowerIncomes || (loan.coBorrowerIncomeInfo ? [loan.coBorrowerIncomeInfo] : [])
  const guarantorIncomes = loan.guarantorIncomes || (loan.guarantorIncomeInfo ? [loan.guarantorIncomeInfo] : [])
  // Declared income for display, statement-capped income for capacity — the same basis the
  // loan detail assesses on, so the document and the screen it prints from cannot disagree.
  const income = incomeCapacity([...borrowerIncomes, ...coBorrowerIncomes, ...guarantorIncomes])
  const totalMonthlyIncome = income.declared
  // What the bank statements show going out per month, the same basis the loan detail assesses
  // on, so the document and the screen it prints from cannot disagree.
  const expense = expenseCapacity([loan.borrowerExpenseInfo, loan.coBorrowerExpenseInfo, loan.guarantorExpenseInfo])
  const totalMonthlyExpense = expense.assessable
  const remainingAmount = income.assessable - expense.assessable

  const termOptions = (loan.amount && loan.interestRate)
    ? INSTALLMENT_OPTIONS.map(term => {
        const { emi: termEmi, rows: termRows } = buildAmortizationData(loan.amount, loan.interestRate, term, loan.firstInstallment)
        const totalInterest = termRows.reduce((sum, r) => sum + (r.interest || 0), 0)
        const leftAmount = remainingAmount - termEmi
        return { term, emi: termEmi, totalInterest, leftAmount, affordable: leftAmount >= 0 }
      })
    : []
  const affordableTermOptions = termOptions.filter(t => t.affordable)
  const recommendedTerm = affordableTermOptions.length > 0
    ? affordableTermOptions.reduce((best, t) => t.term < best.term ? t : best, affordableTermOptions[0]).term
    : (termOptions.length > 0 ? termOptions[termOptions.length - 1].term : null)

  // Benefit to the Bank: every fee is auto-calculated from the loan amount, interest rate,
  // and the fee rates configured in System Settings.
  const feeSettings = state.feeSettings || {}
  const productLower = (loan.product || '').toLowerCase()
  const isPersonalLoan = productLower.includes('personal')
  const isVehicleLoan = productLower.includes('car') || productLower.includes('vehicle')
  // Lawyer/ministry fees scale per land title pledged; the transport-ministry fee scales per
  // vehicle pledged — each asset needs its own filing, so two of them double the fee.
  const landCollateralCount = Math.max(1, collaterals.filter(c => c.type === 'Land').length)
  const vehicleCollateralCount = Math.max(1, collaterals.filter(c => c.type === 'Vehicle').length)
  const totalInterestIncome = schedule.reduce((sum, row) => sum + (row.interest || 0), 0)
  const interestFee = { category: 'Interest Fee', amount: totalInterestIncome }
  const adminFee = { category: 'Admin Fee', amount: (loan.amount || 0) * ((feeSettings.adminFeeRate || 0) / 100), rateKey: 'adminFeeRate' }
  const insuranceFee = { category: 'Insurance Fee', amount: (loan.amount || 0) * ((feeSettings.insuranceFeeRate || 0) / 100), rateKey: 'insuranceFeeRate' }
  const lawyerFee = { category: 'Lawyer Fee', amount: (loan.amount || 0) * ((feeSettings.lawyerFeeRate || 0) / 100) * landCollateralCount, multiplier: landCollateralCount, multiplierLabel: 'land titles', rateKey: 'lawyerFeeRate' }
  const ministryFee = { category: 'Ministry Fee', amount: (loan.amount || 0) * ((feeSettings.ministryFeeRate || 0) / 100) * landCollateralCount, multiplier: landCollateralCount, multiplierLabel: 'land titles', rateKey: 'ministryFeeRate' }
  const transportMinistryFee = { category: 'Ministry of Public Works and Transport', amount: (loan.amount || 0) * ((feeSettings.transportMinistryFeeRate || 0) / 100) * vehicleCollateralCount, multiplier: vehicleCollateralCount, multiplierLabel: 'vehicles', rateKey: 'transportMinistryFeeRate' }
  // Built-in fees deleted in Loan Setting → Benefit Fees drop out entirely; interest has no rate key and always counts.
  const removedFeeKeys = feeSettings.removedFeeKeys || []
  const baseFeeItems = (isPersonalLoan
    ? [interestFee, adminFee]
    : isVehicleLoan
    ? [interestFee, adminFee, insuranceFee, transportMinistryFee]
    : [interestFee, adminFee, insuranceFee, lawyerFee, ministryFee]
  ).filter(b => !b.rateKey || !removedFeeKeys.includes(b.rateKey))
  const baseFeeCategories = new Set(baseFeeItems.map(b => b.category.toLowerCase()))
  const customFees = (feeSettings.customFees || [])
    .filter(f => !baseFeeCategories.has((f.name || '').toLowerCase()))
    .map(f => ({ category: f.name, amount: (loan.amount || 0) * ((f.rate || 0) / 100) }))
  const benefitItems = [...baseFeeItems, ...customFees]
  const totalBenefitToBank = benefitItems.reduce((sum, b) => sum + b.amount, 0)

  // Risk Assessment: auto-derived from each party's CBC data — see utils/riskAssessment.
  const riskAssessment = assessLoanRisk(loan)

  const upcomingInstallments = schedule.filter(r => r.status !== 'Paid')
  const nextPayment = upcomingInstallments[0] || null
  const daysUntilDue = nextPayment ? daysUntilDueISO(nextPayment.dueDateISO) : null

  const reminderRecipients = buildReminderRecipients(loan)
  const selectedRecipient = reminderRecipients.find(r => r.key === reminderRecipientKey) || reminderRecipients[0]
  const sampleReminderMessage = buildSampleReminderMessage('Message', selectedRecipient, nextPayment, currency, loan)
  const reminderMessage = reminderMessageOverride ?? sampleReminderMessage

  // Ground truth is approvalState, not the status string — a loan can carry a
  // stale/legacy status (e.g. "In Progress") without having actually completed
  // Final Approval, so status alone must never gate the Disburse action.
  const approvalState = loan.approvalState || 1
  const readyToDisburse = approvalState >= 3 && !isDisbursed
  const isApproved = readyToDisburse || isDisbursed
  // Whether the loan can still be acted on, as distinct from whether it ever reached approval.
  // A cancelled or rejected loan keeps the approvalState it had got to, so it still reads as
  // approved — which is right for the Repayment tabs and the approval reason below, and wrong
  // for the Customer Cancel / Disburse buttons, which were still being offered on a loan
  // nobody can disburse. Kept separate from `isApproved` so fixing the buttons does not pull
  // tabs out from under a cancelled loan and shift every tab index with them.
  const isClosed = loan.status === 'Cancelled' || loan.status === 'Rejected'
  const canDisburse = readyToDisburse && !isClosed
  // A cleared repayment date blocks the payout too — the confirm dialog is where the
  // collection day is agreed, so it cannot be released without one.
  const disburseReady = !!customer?.accountNumber && disburseConfirmed && can('disburse_loan')
    && (schedule.length === 0 || !!disburseFirstDueISO)
  const tabs = ['Overview']
  // Available from approval onward, not just after disbursement.
  if (isApproved) tabs.push('Repayment Tracking', 'Repayment Reminder')
  tabs.push('Loan Profile', 'Repayment Schedule', 'Audit Log')
  const safeActiveTab = activeTab < tabs.length ? activeTab : 0

  const overviewTabIdx = tabs.indexOf('Overview')
  const reminderTabIdx = tabs.indexOf('Repayment Reminder')
  const trackRepaymentTabIdx = tabs.indexOf('Repayment Tracking')
  const loanProfileTabIdx = tabs.indexOf('Loan Profile')
  const scheduleTabIdx = tabs.indexOf('Repayment Schedule')
  const auditLogTabIdx = tabs.indexOf('Audit Log')

  function openApprovalModal() {
    setRemarks('')
    setShowApprovalModal(true)
  }

  function openDisburseModal() {
    setDisburseConfirmed(false)
    setDisburseFirstDueISO(schedule[0]?.dueDateISO || '')
    setShowDisburseModal(true)
  }

  function openCancelModal() {
    setCancelReason('')
    setShowCancelModal(true)
  }

  function handleViewDoc(doc, isImage) {
    if (isImage && doc.dataUrl) {
      setLightbox(doc)
    } else if (doc.dataUrl) {
      const w = window.open()
      w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:0"></iframe>`)
    }
  }

  async function handleDownloadPdf() {
    const element = profileDocRef.current
    if (!element || downloading) return
    setDownloading(true)
    try {
      const pdf = new jsPDF('p', 'pt', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      await pdf.html(element, {
        x: 0,
        y: 0,
        width: pdfWidth,
        windowWidth: element.scrollWidth,
        autoPaging: 'text',
        html2canvas: { scale: pdfWidth / element.scrollWidth, useCORS: true },
      })
      pdf.save(`Loan-Profile-${loan.ref}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  async function handleDownloadSchedule() {
    if (scheduleDownloading) return
    setScheduleDownloading(true)
    try {
      await downloadSheetPdf(scheduleSheetRef.current, `Repayment-Schedule-${loan.ref || 'loan'}`)
    } finally {
      setScheduleDownloading(false)
    }
  }

  function goToWeumsSetup() {
    setReminderGateOpen(false)
    dispatch({ type: 'OPEN_SETTINGS' })
    dispatch({ type: 'SET_SETTINGS_MENU', menu: 'integration' })
  }

  function handleSendReminder() {
    if (!weumsSignedIn(state)) { setReminderGateOpen(true); return }
    const destination = selectedRecipient?.phone
    const updatedLoan = {
      ...loan,
      reminderHistory: [
        ...(loan.reminderHistory || []),
        {
          method: 'Message',
          recipient: selectedRecipient?.name,
          role: selectedRecipient?.role,
          destination: destination || '',
          message: reminderMessage,
          timestamp: new Date().toLocaleString('en-GB'),
        },
      ],
    }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    showToast(`Repayment reminder sent to ${selectedRecipient?.name}${destination ? ` (${destination})` : ''}`, 'success')
  }

  function handleReminderRecipientChange(key) {
    setReminderRecipientKey(key)
    setReminderMessageOverride(null)
  }

  function handleApprove() {
    if (!can('review_loan')) {
      showToast(`${state.currentRole} does not have permission to approve loans.`, 'error')
      return
    }
    if (!remarks.trim()) {
      showToast('Please add a comment explaining why this loan is approved', 'error')
      return
    }
    const approvedLoan = {
      ...loan,
      status: 'Waiting Disburse',
      approvalState: 3,
      approvalReason: remarks.trim(),
      rejectionReason: '',
      approvalHistory: [
        ...(loan.approvalHistory || []),
        { stage: 3, action: `Final approval granted: ${remarks.trim()}`, user: 'Admin', timestamp: new Date().toLocaleString('en-GB') },
      ],
    }
    dispatch({ type: 'UPDATE_LOAN', loan: approvedLoan })
    dispatch({ type: 'OPEN_LOAN_OVERVIEW', loan: approvedLoan, tab: 'Overview' })
    // Approval inserts two tabs before Loan Profile, shifting every index after
    // Overview — reset locally so the selection can't land on a different panel
    // than the one that was open.
    setActiveTab(0)
    showToast('Loan approved — ready for disbursement', 'success')
    setShowApprovalModal(false)
  }

  function handleDisburse() {
    if (!customer?.accountNumber || !disburseConfirmed) return
    if (!can('disburse_loan')) {
      showToast(`${state.currentRole} does not have permission to disburse loans.`, 'error')
      return
    }
    if (!hasFundingAccount(state.realBankAccounts, loan.currency, loan.branch)) {
      showToast(`No ${loan.currency} bank account configured for ${loan.branch}. Add one in Real Bank Accounts before disbursing.`, 'error')
      return
    }
    const first = schedule[0]
    if (first && !disburseFirstDueISO) {
      showToast('Select the first repayment date before disbursing', 'error')
      return
    }
    // The collection day is agreed at release, so a date edited in this dialog is
    // committed as part of disbursing — ADJUST_DUE_DATE shifts the whole plan first so
    // DISBURSE_LOAN carries the rescheduled schedule into the now-fixed Active loan.
    const rescheduled = !!first && disburseFirstDueISO !== first.dueDateISO
    if (rescheduled) {
      dispatch({
        type: 'ADJUST_DUE_DATE',
        idx: 0, dateISO: disburseFirstDueISO,
        note: first.dueDateNote || '', shiftFollowing: true,
      })
    }
    dispatch({ type: 'DISBURSE_LOAN' })
    showToast(
      rescheduled
        ? 'Loan disbursed — funds released, repayment schedule updated to the new repayment date'
        : 'Loan disbursed — funds released, loan is now Active',
      'success'
    )
    setShowDisburseModal(false)
    dispatch({ type: 'OPEN_LOAN_PREVIEW', tab: 'Overview' })
  }

  function handleCustomerCancel() {
    if (!can('review_loan')) {
      showToast(`${state.currentRole} does not have permission to cancel loans.`, 'error')
      return
    }
    if (!cancelReason.trim()) {
      showToast('Please add a comment explaining why the customer cancelled', 'error')
      return
    }
    const cancelledLoan = {
      ...loan,
      status: 'Cancelled',
      cancellationReason: cancelReason.trim(),
      approvalHistory: [
        ...(loan.approvalHistory || []),
        { stage: loan.approvalState || 3, action: `Cancelled by customer: ${cancelReason.trim()}`, user: 'Admin', timestamp: new Date().toLocaleString('en-GB') },
      ],
    }
    dispatch({ type: 'UPDATE_LOAN', loan: cancelledLoan })
    const idx = state.loanApplications.findIndex(a => a.ref === loan.ref)
    dispatch({ type: 'CLOSE_LOAN_OVERVIEW' })
    dispatch({ type: 'OPEN_LOAN_DETAIL', idx })
    showToast('Loan cancelled by customer', 'info')
    setShowCancelModal(false)
  }

  function handleNotApprove() {
    if (!can('review_loan')) {
      showToast(`${state.currentRole} does not have permission to reject loans.`, 'error')
      return
    }
    if (!remarks.trim()) {
      showToast('Please add a comment explaining why this loan is not approved', 'error')
      return
    }
    const updatedLoan = {
      ...loan,
      status: 'Rejected',
      approvalState: 1,
      rejectionReason: remarks.trim(),
      approvalHistory: [
        ...(loan.approvalHistory || []),
        { stage: loan.approvalState || 1, action: `Rejected: ${remarks.trim()}`, user: 'Admin', timestamp: new Date().toLocaleString('en-GB') },
      ],
    }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    const idx = state.loanApplications.findIndex(a => a.ref === loan.ref)
    dispatch({ type: 'CLOSE_LOAN_OVERVIEW' })
    dispatch({ type: 'OPEN_LOAN_DETAIL', idx })
    showToast('Loan rejected', 'info')
    setShowApprovalModal(false)
  }

  return (
    <>
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Approval Review</h1>
            <StatusBadge status={loan.status} size="xs" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{loan.ref} · {loan.product} · {loan.customerName}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-shrink-0">
          {!isDisbursed && !readyToDisburse && (
            <button
              onClick={openApprovalModal}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#0047ab] hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors w-full sm:w-auto"
            >
              <ShieldCheck className="w-4 h-4" />
              Approval
            </button>
          )}
          {!isDisbursed && canDisburse && (
            <>
              <button
                onClick={openCancelModal}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-sm font-semibold rounded-xl transition-colors w-full sm:w-auto"
              >
                <X className="w-4 h-4" />
                Customer Cancel
              </button>
              <button
                onClick={openDisburseModal}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors w-full sm:w-auto"
              >
                <Check className="w-4 h-4" />
                Disburse
              </button>
            </>
          )}
        </div>
      </div>

      {isApproved && loan.approvalReason && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Reason for approval</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400/90 mt-0.5">{loan.approvalReason}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
          {tabs.map((tab, i) => {
            if (i === auditLogTabIdx) return null
            const TabIcon = LOAN_TAB_ICONS[tab]
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${safeActiveTab === i ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                {TabIcon && <TabIcon className="w-3.5 h-3.5" />}
                {tab}
              </button>
            )
          })}
          <button
            onClick={() => setActiveTab(auditLogTabIdx)}
            className={`ml-auto flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors flex-shrink-0 ${safeActiveTab === auditLogTabIdx ? 'text-[#0047ab] dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            <History className="w-3.5 h-3.5" />
            Audit Log
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-6 max-h-[65vh] overflow-y-auto">

          {safeActiveTab === overviewTabIdx && (
            <div className="space-y-4">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-2">Loan Info</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
                {[
                  { icon: FileText, label: 'Loan Product', value: loan.product },
                  { icon: DollarSign, label: 'Loan Amount', value: formatVal(loan.amount, currency, 1) },
                  { icon: TrendingUp, label: 'Interest Rate', value: `${loan.interestRate}% p.a.` },
                  { icon: Calendar, label: 'Installments', value: `${loan.installments} months` },
                  { icon: Calculator, label: 'EMI', value: formatVal(emi, currency, 1) },
                  { icon: Briefcase, label: 'Credit Officer', value: loan.creditOfficer || 'N/A' },
                  { icon: Building, label: 'Branch Name', value: loan.branch || 'N/A' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{value}</p>
                  </div>
                ))}
              </div>

              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-2 mt-20">Customer Info</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <InfoCard icon={User} title="Borrower">
                  <InfoRow label="English Name" value={customer?.enName || loan.customerName || 'N/A'} />
                  <InfoRow label="Phone Number" value={customer?.phone || loan.customerPhone || 'N/A'} />
                </InfoCard>

                {(() => {
                  const coBorrowerList = loan.coBorrowers?.length
                    ? loan.coBorrowers
                    : (loan.coBorrower ? [loan.coBorrower] : [null])
                  return (
                    <InfoCard icon={User} title={`Co-Borrower${coBorrowerList.length > 1 ? 's' : ''}`}>
                      {coBorrowerList.map((cb, idx) => (
                        <div key={idx} className={idx > 0 ? 'pt-2 mt-2 border-t border-slate-100 dark:border-slate-700' : ''}>
                          {coBorrowerList.length > 1 && (
                            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-0.5">Co-Borrower {idx + 1}</p>
                          )}
                          <InfoRow label="English Name" value={cb?.enName || 'N/A'} />
                          <InfoRow label="Phone Number" value={cb?.phone || 'N/A'} />
                        </div>
                      ))}
                    </InfoCard>
                  )
                })()}

                {(() => {
                  const guarantorList = loan.guarantors?.length
                    ? loan.guarantors
                    : (loan.guarantor ? [loan.guarantor] : [null])
                  return (
                    <InfoCard icon={User} title={`Guarantor${guarantorList.length > 1 ? 's' : ''}`}>
                      {guarantorList.map((g, idx) => (
                        <div key={idx} className={idx > 0 ? 'pt-2 mt-2 border-t border-slate-100 dark:border-slate-700' : ''}>
                          {guarantorList.length > 1 && (
                            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-0.5">Guarantor {idx + 1}</p>
                          )}
                          <InfoRow label="English Name" value={g?.enName || 'N/A'} />
                          <InfoRow label="Phone Number" value={g?.phone || 'N/A'} />
                        </div>
                      ))}
                    </InfoCard>
                  )
                })()}

                {(() => {
                  const collateralList = collaterals.length ? collaterals : [null]
                  return (
                    <InfoCard icon={CreditCard} title={`Collateral${collateralList.length > 1 ? 's' : ''}`}>
                      {collateralList.map((c, idx) => (
                        <div key={idx} className={idx > 0 ? 'pt-2 mt-2 border-t border-slate-100 dark:border-slate-700' : ''}>
                          {collateralList.length > 1 && (
                            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mb-0.5">Collateral {idx + 1}</p>
                          )}
                          <InfoRow label="Type" value={c?.type || 'N/A'} />
                          <InfoRow label="Estimated Market Value" value={c?.value ? formatVal(c.value, currency, 1) : 'N/A'} />
                          <InfoRow label="Registration Number" value={c?.docNo || 'N/A'} />
                        </div>
                      ))}
                    </InfoCard>
                  )
                })()}
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Benefit</span>
                </div>
                {/* Always a single row — extra fees scroll horizontally rather than wrapping */}
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {benefitItems.map((b, i) => (
                    <div key={i} className="flex-1 shrink-0 min-w-[140px] bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 truncate">{b.category}{b.multiplier > 1 ? ` (×${b.multiplier})` : ''}</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatVal(b.amount, currency, 1)}</p>
                    </div>
                  ))}
                  <div className="flex-1 shrink-0 min-w-[140px] bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                    <p className="text-[11px] font-medium text-[#0047ab] dark:text-blue-400 mb-1 truncate">Total Benefit Fee</p>
                    <p className="text-sm font-bold text-[#0047ab] dark:text-blue-400 whitespace-nowrap">{formatVal(totalBenefitToBank, currency, 1)}</p>
                  </div>
                </div>
              </div>

              {/* Repayment schedule — a compact read-only copy of the installment plan so
                  approvers can review it without leaving the Overview tab. The full
                  printable A4 version stays on the Repayment Schedule tab. */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Repayment Schedule</span>
                  {scheduleTabIdx >= 0 && (
                    <button
                      onClick={() => setActiveTab(scheduleTabIdx)}
                      className="text-[11px] font-semibold text-[#0047ab] dark:text-blue-400 hover:underline"
                    >
                      View full schedule
                    </button>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">No</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Due Date</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Principal</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Interest</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Total Due</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {schedule.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">
                              No repayment schedule available.
                            </td>
                          </tr>
                        ) : schedule.slice(0, 3).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.num}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatDMY(row.dueDateISO)}</td>
                            <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">{formatVal(row.principal, currency, 1)}</td>
                            <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">{formatVal(row.interest, currency, 1)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">{formatVal(row.totalDue, currency, 1)}</td>
                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{formatVal(row.balance, currency, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {safeActiveTab === auditLogTabIdx && (
            <div className="rounded-xl overflow-hidden">
              <div className="px-4 py-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Audit Log History</span>
              </div>
              <div className="p-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                          <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Time</th>
                          <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action</th>
                          <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">User</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {!loan.approvalHistory?.length ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">
                              No activity recorded.
                            </td>
                          </tr>
                        ) : loan.approvalHistory.map((h, i) => {
                          const { date, time } = splitTimestamp(h.timestamp)
                          return (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{date}</td>
                            <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{time}</td>
                            <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">{h.action || '—'}</td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{h.user || '—'}</td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {safeActiveTab === reminderTabIdx && (
            <div className="space-y-4">
              {nextPayment ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className={`rounded-xl p-3 ${daysUntilDue < 0 ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Calendar className={`w-3.5 h-3.5 ${daysUntilDue < 0 ? 'text-rose-500' : 'text-slate-400'}`} />
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Next Due Date</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{nextPayment.dueDate}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Amount Due</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatVal(nextPayment.totalDue, currency, 1)}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${daysUntilDue < 0 ? 'bg-rose-50 dark:bg-rose-900/20' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Bell className={`w-3.5 h-3.5 ${daysUntilDue < 0 ? 'text-rose-500' : 'text-slate-400'}`} />
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Status</p>
                      </div>
                      <p className={`text-sm font-semibold ${daysUntilDue < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                        {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue` : daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <InfoCard icon={Phone} title="Send Reminder To">
                      <div className="pb-2">
                        <label className="block text-[11px] text-slate-400 dark:text-slate-500 font-medium mb-1">Recipient</label>
                        <select
                          value={reminderRecipientKey}
                          onChange={e => handleReminderRecipientChange(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition"
                        >
                          {reminderRecipients.map(r => (
                            <option key={r.key} value={r.key}>{r.name} ({r.role})</option>
                          ))}
                        </select>
                      </div>
                      <InfoRow label="Phone" value={selectedRecipient?.phone} />
                      <InfoRow label="Email" value={selectedRecipient?.email} />
                    </InfoCard>

                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <button
                          onClick={handleSendReminder}
                          className="flex items-center gap-2 px-4 py-2 bg-[#0047ab] hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors flex-shrink-0"
                        >
                          <Bell className="w-4 h-4" />
                          Send Reminder
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Message to Send</label>
                        <textarea
                          value={reminderMessage}
                          onChange={e => setReminderMessageOverride(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition resize-y"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden">
                    <div className="px-4 py-3">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Reminder History</span>
                    </div>
                    <div className="p-4 space-y-1.5 max-h-64 overflow-y-auto">
                      {(loan.reminderHistory || []).length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">No reminders have been sent for this loan yet.</p>
                      ) : (
                        [...loan.reminderHistory].reverse().map((r, i) => (
                          <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-xs">
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-200">{r.recipient}{r.role ? ` (${r.role})` : ''}</span>
                              <span className="text-slate-400 dark:text-slate-500"> · {r.timestamp}</span>
                            </div>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">via {r.method}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">No upcoming repayments — the schedule is fully paid or not yet generated.</p>
              )}
            </div>
          )}

          {safeActiveTab === loanProfileTabIdx && (
            <div className="space-y-3">
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Profile
                </button>
                <button
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  {downloading ? 'Preparing…' : 'Download PDF'}
                </button>
              </div>

              <div
                ref={profileDocRef}
                className="printable-area bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mx-auto w-full max-w-[210mm] shadow-sm"
                style={{ fontFamily: "'Kantumruy Pro', 'Outfit', sans-serif" }}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <img src={companyLogoSrc(state.companyProfile)} alt={state.companyProfile.name} className="w-14 h-14 object-contain flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{state.companyProfile.nameKh}</p>
                    <p className="text-sm font-bold tracking-wide text-slate-700 dark:text-slate-200">{state.companyProfile.name.toUpperCase()}</p>
                  </div>
                  <div className="w-14 h-14 flex-shrink-0" aria-hidden="true" />
                </div>
                <p className="text-center text-base font-bold text-slate-800 dark:text-slate-100 mt-1 mb-1">LOAN APPLICATION PROFILE</p>
                <p className="text-center text-xs text-slate-500 dark:text-slate-400 mb-5">{loan.ref} · {loan.product} · {loan.customerName}</p>

                <DocSection title="Loan Information" first>
                  <DocFieldGrid>
                    <DocField label="Loan Product" value={loan.product} />
                    <DocField label="Loan Amount" value={loan.amount ? formatVal(loan.amount, currency, 1) : null} />
                    <DocField label="Interest Rate" value={loan.interestRate ? `${loan.interestRate}% p.a.` : null} />
                    <DocField label="Installments" value={loan.installments ? `${loan.installments} months` : null} />
                    <DocField label="EMI" value={emi ? formatVal(emi, currency, 1) : null} />
                    <DocField label="Credit Officer" value={loan.creditOfficer} />
                    <DocField label="Branch Name" value={loan.branch} />
                  </DocFieldGrid>
                </DocSection>

                <DocSection title="Customer Information">
                  <DocFieldGrid>
                    <DocField label="Customer Code" value={customer?.code || loan.customerCode} />
                    <DocField label="English Name" value={customer?.enName || loan.customerName} />
                    <DocField label="Khmer Name" value={customer?.khName || loan.customerKhName} />
                    <DocField label="Gender" value={customer?.gender} />
                    <DocField label="Marital Status" value={customer?.maritalStatus} />
                    <DocField label="Date of Birth" value={customer?.dob} />
                    <DocField label="National ID" value={customer?.idNo} />
                    <DocField label="Phone Number" value={customer?.phone || loan.customerPhone} />
                    <DocField label="Email" value={customer?.email} />
                    <DocField label="Current Address" value={formatAddress(customer?.currentAddress)} />
                    <DocField label="Permanent Address" value={formatAddress(customer?.permanentAddress)} />
                  </DocFieldGrid>
                </DocSection>

                {(() => {
                  const coBorrowerList = loan.coBorrowers?.length ? loan.coBorrowers : (loan.coBorrower ? [loan.coBorrower] : [null])
                  return (
                    <DocSection title={`Co-Borrower${coBorrowerList.length > 1 ? 's' : ''} Information`}>
                      {coBorrowerList.map((cb, idx) => (
                        <div key={idx}>
                          {coBorrowerList.length > 1 && <DocSubHeading>Co-Borrower {idx + 1}</DocSubHeading>}
                          <DocFieldGrid>
                            <DocField label="English Name" value={cb?.enName} />
                            <DocField label="Khmer Name" value={cb?.khName} />
                            <DocField label="Gender" value={cb?.gender} />
                            <DocField label="Marital Status" value={cb?.maritalStatus} />
                            <DocField label="Date of Birth" value={cb?.dob} />
                            <DocField label="National ID" value={cb?.idNo} />
                            <DocField label="Phone Number" value={cb?.phone} />
                            <DocField label="Email" value={cb?.email} />
                            <DocField label="Current Address" value={formatAddress(cb?.currentAddress)} />
                            <DocField label="Permanent Address" value={formatAddress(cb?.permanentAddress)} />
                            <DocField label="Relationship" value={cb?.relation} />
                          </DocFieldGrid>
                        </div>
                      ))}
                    </DocSection>
                  )
                })()}

                {(() => {
                  const guarantorList = loan.guarantors?.length ? loan.guarantors : (loan.guarantor ? [loan.guarantor] : [null])
                  return (
                    <DocSection title={`Guarantor${guarantorList.length > 1 ? 's' : ''} Information`}>
                      {guarantorList.map((g, idx) => (
                        <div key={idx}>
                          {guarantorList.length > 1 && <DocSubHeading>Guarantor {idx + 1}</DocSubHeading>}
                          <DocFieldGrid>
                            <DocField label="English Name" value={g?.enName} />
                            <DocField label="Khmer Name" value={g?.khName} />
                            <DocField label="Gender" value={g?.gender} />
                            <DocField label="Marital Status" value={g?.maritalStatus} />
                            <DocField label="Date of Birth" value={g?.dob} />
                            <DocField label="National ID" value={g?.idNo} />
                            <DocField label="Phone Number" value={g?.phone} />
                            <DocField label="Email" value={g?.email} />
                            <DocField label="Current Address" value={formatAddress(g?.currentAddress)} />
                            <DocField label="Permanent Address" value={formatAddress(g?.permanentAddress)} />
                            <DocField label="Relationship" value={g?.relation} />
                          </DocFieldGrid>
                        </div>
                      ))}
                    </DocSection>
                  )
                })()}

                {(() => {
                  const collateralList = collaterals.length ? collaterals : [null]
                  return (
                    <DocSection title={`Collateral${collateralList.length > 1 ? 's' : ''}`}>
                      {collateralList.map((item, idx) => {
                        const c = item || {}
                        const fields = [
                          ['Type', c.type],
                          ['Registration Number', c.docNo],
                          ['Registration Status', c.registrationStatus],
                          ['Estimated Market Value', c.value ? formatVal(c.value, currency, 1) : null],
                          ['Appraised Value', c.appraisedValue ? formatVal(c.appraisedValue, currency, 1) : null],
                          ['Forced Sale Value', c.forcedSaleValue ? formatVal(c.forcedSaleValue, currency, 1) : null],
                          ['Loan-to-Value Ratio', c.ltvRatio ? `${c.ltvRatio.toFixed(1)}%` : null],
                        ]
                        if (c.vehicleInfo) {
                          fields.push(
                            ['Vehicle Make / Model', [c.vehicleInfo.make, c.vehicleInfo.model].filter(Boolean).join(' ') || null],
                            ['Year of Manufacture', c.vehicleInfo.year],
                            ['Plate Number', c.vehicleInfo.plateNumber],
                            ['Chassis / VIN Number', c.vehicleInfo.chassisNumber],
                            ['Engine Number', c.vehicleInfo.engineNumber],
                            ['Color', c.vehicleInfo.color],
                            ['Owner Name', c.vehicleInfo.ownerName],
                            ['Issue Date', c.vehicleInfo.issueDate],
                            ['Collateral Status', c.vehicleInfo.encumbranceStatus],
                          )
                        }
                        if (c.landInfo) {
                          fields.push(
                            ['Title Type', c.landInfo.titleType],
                            ['Title Number', c.landInfo.titleNumber],
                            ['Plot / Parcel Number', c.landInfo.plotNumber],
                            ['Land Area', c.landInfo.area ? `${c.landInfo.area} sqm` : null],
                            ['Land Use', c.landInfo.landUse],
                            ['Owner Name', c.landInfo.ownerName],
                            ['Location', formatAddress(c.landInfo.location)],
                            ['Issue Date', c.landInfo.issueDate],
                            ['Collateral Status', c.landInfo.encumbranceStatus],
                          )
                        }
                        if (c.houseInfo) {
                          fields.push(
                            ['House Type', c.houseInfo.houseType],
                            ['Construction Type', c.houseInfo.constructionType],
                            ['Number of Floors', c.houseInfo.floors],
                            ['Floor Area', c.houseInfo.floorArea ? `${c.houseInfo.floorArea} sqm` : null],
                            ['Land Area', c.houseInfo.landArea ? `${c.houseInfo.landArea} sqm` : null],
                            ['Year Built', c.houseInfo.yearBuilt],
                            ['Owner Name', c.houseInfo.ownerName],
                            ['Location', formatAddress(c.houseInfo.location)],
                            ['Issue Date', c.houseInfo.issueDate],
                            ['Collateral Status', c.houseInfo.encumbranceStatus],
                          )
                        }
                        return (
                          <div key={idx}>
                            {collateralList.length > 1 && <DocSubHeading>Collateral {idx + 1}</DocSubHeading>}
                            <DocFieldGrid>
                              {fields.map(([label, value]) => (
                                <DocField key={label} label={label} value={value} />
                              ))}
                            </DocFieldGrid>
                          </div>
                        )
                      })}
                    </DocSection>
                  )
                })()}

                <DocSection title="Income">
                  {[
                    { key: 'borrower', label: 'Borrower', list: borrowerIncomes },
                    { key: 'coBorrower', label: 'Co-Borrower', list: coBorrowerIncomes },
                    { key: 'guarantor', label: 'Guarantor', list: guarantorIncomes },
                  ].map(party => {
                    const partyTotal = party.list.reduce((s, i) => s + (i.totalMonthlyIncome || 0), 0)
                    return (
                      <div key={party.key} className="mb-3 last:mb-0">
                        <DocSubHeading>{party.label} Income</DocSubHeading>
                        {party.list.length > 0 ? party.list.map((info, iIdx) => (
                          <div key={iIdx} className={iIdx > 0 ? 'mt-2' : ''}>
                            {party.list.length > 1 && (
                              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-0.5">Income {iIdx + 1}</p>
                            )}
                            <DocFieldGrid>
                              <DocField label="Occupation" value={info.occupation} />
                              <DocField label="Employment Status" value={info.employmentStatus} />
                              <DocField label="Company / Work Place" value={info.companyName} />
                              <DocField label="Company Address" value={info.companyAddress} />
                              {info.sources?.map((s, sIdx) => (
                                <DocField key={sIdx} label={s.label || 'Income Source'} value={s.amount ? formatVal(parseFloat(s.amount) || 0, currency, 1) : null} />
                              ))}
                              <DocField label="Total Monthly Income" value={info.totalMonthlyIncome ? formatVal(info.totalMonthlyIncome, currency, 1) : null} />
                            </DocFieldGrid>
                          </div>
                        )) : (
                          <DocField label="Total Monthly Income" value={null} />
                        )}
                        {party.list.length > 1 && (
                          <DocField label={`${party.label} Combined Total`} value={partyTotal ? formatVal(partyTotal, currency, 1) : null} />
                        )}
                      </div>
                    )
                  })}
                </DocSection>

                <DocSection title="Expense">
                  {[
                    { key: 'borrower', label: 'Borrower', info: loan.borrowerExpenseInfo },
                    { key: 'coBorrower', label: 'Co-Borrower', info: loan.coBorrowerExpenseInfo },
                    { key: 'guarantor', label: 'Guarantor', info: loan.guarantorExpenseInfo },
                  ].map(party => (
                    <div key={party.key} className="mb-3 last:mb-0">
                      <DocSubHeading>{party.label} Expense</DocSubHeading>
                      <DocFieldGrid>
                        {party.info?.expenses?.length > 0 ? party.info.expenses.map((e, eIdx) => (
                          <DocField key={eIdx} label={e.category || 'Expense'} value={[e.amount ? formatVal(parseFloat(e.amount) || 0, currency, 1) : null, e.notes].filter(Boolean).join(' — ') || null} />
                        )) : (
                          <DocField label="Expenses" value={null} />
                        )}
                        <DocField label="Total Monthly Expense" value={party.info?.totalMonthlyExpense ? formatVal(party.info.totalMonthlyExpense, currency, 1) : null} />
                      </DocFieldGrid>
                    </div>
                  ))}
                </DocSection>

                <DocSection title="Repayment Capacity">
                  <DocFieldGrid>
                    <DocField label="Total Monthly Income" value={formatVal(totalMonthlyIncome, currency, 1)} />
                    <DocField label="Total Monthly Expense" value={formatVal(totalMonthlyExpense, currency, 1)} />
                    <DocField label="Remaining Amount" value={formatVal(remainingAmount, currency, 1)} />
                  </DocFieldGrid>

                  {termOptions.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Other Term Options</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        {affordableTermOptions.length > 0 ? (
                          <>System recommendation: the <span className="font-semibold text-emerald-600 dark:text-emerald-400">{recommendedTerm}-month</span> term is the shortest option the borrower can afford, keeping total interest paid to a minimum.</>
                        ) : (
                          <>None of the standard terms fit within the borrower's remaining income. The <span className="font-semibold text-slate-700 dark:text-slate-200">{recommendedTerm}-month</span> term has the lowest monthly installment, but still exceeds capacity.</>
                        )}
                      </p>
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr>
                            <th className="border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-slate-700 dark:text-slate-200">Term</th>
                            <th className="border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-slate-700 dark:text-slate-200">Monthly</th>
                            <th className="border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-slate-700 dark:text-slate-200">Total Interest</th>
                            <th className="border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-slate-700 dark:text-slate-200">Left Amount</th>
                            <th className="border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-slate-700 dark:text-slate-200">Affordable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {termOptions.map(opt => {
                            const isCurrent = opt.term === loan.installments
                            return (
                              <tr key={opt.term} className={opt.term === recommendedTerm ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''}>
                                <td className="border border-slate-300 dark:border-slate-600 px-2 py-1 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                  {opt.term} mo
                                  {isCurrent && <span className="ml-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">(current)</span>}
                                  {opt.term === recommendedTerm && <span className="ml-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">(Recommended)</span>}
                                </td>
                                <td className="border border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatVal(opt.emi, currency, 1)}</td>
                                <td className="border border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatVal(opt.totalInterest, currency, 1)}</td>
                                <td className={`border border-slate-300 dark:border-slate-600 px-2 py-1 text-right font-medium whitespace-nowrap ${opt.leftAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatVal(opt.leftAmount, currency, 1)}</td>
                                <td className="border border-slate-300 dark:border-slate-600 px-2 py-1 text-center text-slate-700 dark:text-slate-200">{opt.affordable ? 'Yes' : 'No'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </DocSection>

                <DocSection title="Benefit to the Bank">
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                    Auto-calculated from the loan's amount, interest rate and the fee rates configured in System Settings.
                  </p>
                  <DocFieldGrid>
                    {benefitItems.map((b, i) => (
                      <DocField
                        key={i}
                        label={b.category + (b.multiplier > 1 ? ` (×${b.multiplier} ${b.multiplierLabel || 'items'})` : '')}
                        value={formatVal(b.amount, currency, 1)}
                      />
                    ))}
                  </DocFieldGrid>
                  <DocField label="Total Benefit to Bank" value={formatVal(totalBenefitToBank, currency, 1)} />
                </DocSection>

                <DocSection title="Credit History (CBC)">
                  {['borrower', 'coBorrower', 'guarantor'].map(target => {
                    const info = loan[CREDIT_HISTORY_FIELD[target]]
                    return (
                      <div key={target} className="mb-4 last:mb-0">
                        <DocSubHeading>{CREDIT_HISTORY_LABEL[target]}</DocSubHeading>
                        <CBCReport info={info} currency={currency} onView={handleViewDoc} />
                      </div>
                    )
                  })}
                </DocSection>

                <DocSection title="Risk Assessment">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Auto-calculated from each party's CBC data.</p>
                    <span className={`text-xs font-bold ${riskAssessment.status === 'High Risk' ? 'text-rose-600 dark:text-rose-400' : riskAssessment.status === 'No Risk' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                      {riskAssessment.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">Positive Assessment</p>
                  {riskAssessment.positives.length > 0 ? (
                    <ol className="space-y-1 mb-3">
                      {riskAssessment.positives.map((p, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex-shrink-0">{i + 1}.</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">None recorded.</p>
                  )}
                  <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mb-1">Negative Assessment</p>
                  {riskAssessment.negatives.length > 0 ? (
                    <ol className="space-y-1">
                      {riskAssessment.negatives.map((n, i) => (
                        <li key={i} className="flex gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-semibold text-rose-600 dark:text-rose-400 flex-shrink-0">{i + 1}.</span>
                          <span>{n}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-slate-400 dark:text-slate-500">None recorded.</p>
                  )}
                </DocSection>

                <DocSection title="Documents">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Customer — Identity Documents</p>
                      <DocList documents={customer?.documents} onView={handleViewDoc} />
                    </div>

                    {(loan.coBorrowers?.length ? loan.coBorrowers : (loan.coBorrower ? [loan.coBorrower] : [])).map((cb, idx, arr) => (
                      <div key={idx}>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Co-Borrower{arr.length > 1 ? ` ${idx + 1}` : ''} — Identity Documents</p>
                        <DocList documents={cb?.documents} onView={handleViewDoc} />
                      </div>
                    ))}

                    {(loan.guarantors?.length ? loan.guarantors : (loan.guarantor ? [loan.guarantor] : [])).map((g, idx, arr) => (
                      <div key={idx}>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Guarantor{arr.length > 1 ? ` ${idx + 1}` : ''} — Identity Documents</p>
                        <DocList documents={g?.documents} onView={handleViewDoc} />
                      </div>
                    ))}

                    {collaterals.map((c, idx, arr) => (
                      <div key={idx}>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Collateral{arr.length > 1 ? ` ${idx + 1}` : ''} — Collateral Documents</p>
                        <DocList documents={c.documents} onView={handleViewDoc} />
                      </div>
                    ))}

                    {[
                      { key: 'borrower', label: 'Borrower', list: borrowerIncomes },
                      { key: 'coBorrower', label: 'Co-Borrower', list: coBorrowerIncomes },
                      { key: 'guarantor', label: 'Guarantor', list: guarantorIncomes },
                    ].map(party => party.list.map((info, idx, arr) => (
                      <div key={`${party.key}-${idx}`}>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{party.label}{arr.length > 1 ? ` Income ${idx + 1}` : ' '} — Income Verification &amp; Proof</p>
                        <DocList documents={info.documents} onView={handleViewDoc} />
                      </div>
                    )))}

                    {[
                      { key: 'borrower', label: 'Borrower', info: loan.borrowerExpenseInfo },
                      { key: 'coBorrower', label: 'Co-Borrower', info: loan.coBorrowerExpenseInfo },
                      { key: 'guarantor', label: 'Guarantor', info: loan.guarantorExpenseInfo },
                    ].map(party => (
                      <div key={party.key}>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{party.label} — Expense Documents</p>
                        <DocList documents={party.info?.documents} onView={handleViewDoc} />
                      </div>
                    ))}
                  </div>
                </DocSection>
              </div>
            </div>
          )}

          {safeActiveTab === scheduleTabIdx && (
            <div className="space-y-3">
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={handleDownloadSchedule}
                  disabled={scheduleDownloading || schedule.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  {scheduleDownloading ? 'Preparing…' : 'Download PDF'}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Schedule
                </button>
              </div>

              <div
                ref={scheduleSheetRef}
                className="printable-area bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mx-auto w-full max-w-[210mm] shadow-sm"
                style={{ fontFamily: "'Kantumruy Pro', 'Outfit', sans-serif" }}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <img src={companyLogoSrc(state.companyProfile)} alt={state.companyProfile.name} className="w-14 h-14 object-contain flex-shrink-0" />
                  <div className="flex-1 text-center">
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{state.companyProfile.nameKh}</p>
                    <p className="text-sm font-bold tracking-wide text-slate-700 dark:text-slate-200">{state.companyProfile.name.toUpperCase()}</p>
                  </div>
                  <div className="w-14 h-14 flex-shrink-0" aria-hidden="true" />
                </div>
                <p className="text-center text-base font-bold text-slate-800 dark:text-slate-100 mt-1 mb-5">តារាងកាលវិភាគសងប្រាក់</p>

                {/* Borrower / loan info */}
                <div className="flex flex-col sm:flex-row gap-x-8 gap-y-1.5 text-xs mb-3">
                  <div className="space-y-1.5 flex-1">
                    <ScheduleField label="លេខគណនី (AccNo)" value={loan.ref} />
                    <ScheduleField label="លេខអតិថិជន (CID)" value={loan.customerCode} />
                    <ScheduleField label="ឈ្មោះអតិថិជន (Name)" value={loan.customerKhName || loan.customerName} />
                    <ScheduleField label="ភេទ (Sex)" value={loan.customerGender?.toUpperCase()} />
                    <ScheduleField label="ទូរស័ព្ទ (Tel)" value={loan.customerPhone} />
                    <ScheduleField label="គោលបំណងកម្ចី (Purpose)" value={loan.reasonCredit} />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <ScheduleField label="ទំហំកម្ចី (Amount)" value={`${currency} ${(loan.amount || 0).toFixed(2)}`} />
                    <ScheduleField label="ថ្ងៃបើកប្រាក់ (Disb Date)" value={formatDMY(loan.disbursementDate)} />
                    <ScheduleField label="អត្រា (Rate)" value={`${loan.interestRate}% p.a.`} />
                    <ScheduleField label="រយៈពេល (Period)" value={`${loan.installments} ${loan.repaymentType || 'Monthly'}`} />
                    <ScheduleField label="ជុំទី (Loan Seq)" value={loan.loanCycle === '1' ? 'New' : `Renewal (Cycle ${loan.loanCycle})`} />
                    <ScheduleField label="សេវា (Admin Fee)" value="0.00 % = 0.00" />
                    <ScheduleField label="Refinance Fee" value="0.00" />
                    <ScheduleField label="ភ្នាក់ងារឥណទាន (CO)" value={loan.creditOfficer} />
                  </div>
                </div>
                <div className="text-xs mb-4">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Address </span>
                  <span className="text-slate-600 dark:text-slate-300">{formatAddress(customer?.currentAddress) || '—'}</span>
                </div>

                {/* Schedule table */}
                <table className="w-full text-[11px] border-separate border-spacing-0 border-t border-l border-slate-300 dark:border-slate-600">
                  <thead>
                    <tr>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">លេខ<br />No</th>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ថ្ងៃបង់ប្រាក់<br />Repayment Date</th>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ប្រាក់ដើម<br />Principle</th>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ការប្រាក់<br />Interest</th>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">សេវាមូល<br />Col Fee</th>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">សរុប<br />Total</th>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ប្រាក់ដើមនៅសល់<br />Balance</th>
                      <th className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1.5 leading-tight text-slate-700 dark:text-slate-200">ប្រាក់ផាកពិន័យ<br />Penalty Payoff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row, idx) => (
                      <tr key={idx}>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-center text-slate-700 dark:text-slate-200">{row.num}</td>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-center whitespace-nowrap text-slate-700 dark:text-slate-200">
                          {formatDMY(row.dueDateISO)}
                        </td>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">{row.principal.toFixed(2)}</td>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">{row.interest.toFixed(2)}</td>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">0.00</td>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right font-semibold text-slate-800 dark:text-slate-100">{row.totalDue.toFixed(2)}</td>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">{row.balance.toFixed(2)}</td>
                        <td className="border-r border-b border-slate-300 dark:border-slate-600 px-2 py-1 text-right text-slate-700 dark:text-slate-200">0.00</td>
                      </tr>
                    ))}
                    {schedule.length === 0 && (
                      <tr>
                        <td colSpan={8} className="border-r border-b border-slate-300 dark:border-slate-600 px-3 py-8 text-center text-slate-400 dark:text-slate-500">No repayment schedule available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Footer */}
                <div className="mt-8 text-xs text-slate-600 dark:text-slate-300">
                  <span>កាលបរិច្ឆេទ (Date) {formatDMY(loan.disbursementDate)}</span>
                </div>
                <div className="flex items-center justify-between mt-10 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span>រៀបចំដោយ (Prepare by)</span>
                  <span>ស្នាមមេដៃអតិថិជន (Customer's thumbprint)</span>
                </div>
              </div>
            </div>
          )}

          {isApproved && safeActiveTab === trackRepaymentTabIdx && <RepaymentTracking />}

        </div>
      </div>
    </div>

      {/* Image Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-white truncate">{lightbox.name}</p>
                {lightbox.docType && <p className="text-xs text-white/60">{lightbox.docType}</p>}
              </div>
              <button
                onClick={() => setLightbox(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={lightbox.dataUrl}
              alt={lightbox.name}
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {reminderGateOpen && <WeumsGateModal onClose={() => setReminderGateOpen(false)} onGoToIntegrations={goToWeumsSetup} />}

      {/* Approval modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowApprovalModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Final Approval</h3>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                This loan has passed credit review. Grant final approval for <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.ref}</span> ({loan.product}, {formatVal(loan.amount, currency, 1)}) for <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.customerName}</span>?
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Reason (required)
                </label>
                <textarea
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  rows={3}
                  placeholder="Explain why this loan is approved, or why it is not / what needs adjustment…"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={handleNotApprove}
                disabled={!can('review_loan')}
                title={can('review_loan') ? undefined : `${state.currentRole} cannot reject loans`}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors ${
                  can('review_loan')
                    ? 'border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                    : 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
                }`}
              >
                <X className="w-4 h-4" />
                Not Approved
              </button>
              <button
                onClick={handleApprove}
                disabled={!can('review_loan')}
                title={can('review_loan') ? undefined : `${state.currentRole} cannot approve loans`}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors ${
                  can('review_loan') ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Check className="w-4 h-4" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disbursement modal — shows the account already on file for the customer, and is
          where the first repayment date is agreed before the funds go out */}
      {showDisburseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDisburseModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Confirm Disbursement</h3>
              <button
                onClick={() => setShowDisburseModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {!customer?.accountNumber ? (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This customer has no disbursement account number on file. Add one to their profile before this loan can be disbursed.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Please review carefully — funds cannot be recalled once released.
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">Loan Ref</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.ref}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">Customer</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.customerName}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">Amount</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{formatVal(loan.amount, currency, 1)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-slate-500 dark:text-slate-400">Disbursement Account</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{customer?.accountNumber || '—'}</span>
                </div>
              </div>
              {customer?.accountNumber && (
                <>
                  <FirstRepaymentDateField
                    schedule={schedule}
                    value={disburseFirstDueISO}
                    onChange={setDisburseFirstDueISO}
                  />
                  <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={disburseConfirmed}
                      onChange={e => setDisburseConfirmed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500/40"
                    />
                    I confirm the account and first repayment date above are correct and authorize releasing these funds. The loan will become Active.
                  </label>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
              <button
                onClick={() => setShowDisburseModal(false)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisburse}
                disabled={!disburseReady}
                title={can('disburse_loan') ? undefined : `${state.currentRole} cannot disburse loans`}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors ${
                  disburseReady ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <Check className="w-4 h-4" />
                Confirm & Disburse
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Cancel modal — records why the customer withdrew before disbursement */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Customer Cancel</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Record that <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.customerName}</span> has withdrawn from loan <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.ref}</span> ({loan.product}, {formatVal(loan.amount, currency, 1)}) before disbursement. This cannot be undone.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Reason (required)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="Explain why the customer is cancelling this loan…"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCustomerCancel}
                disabled={!can('review_loan')}
                title={can('review_loan') ? undefined : `${state.currentRole} cannot cancel loans`}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors ${
                  can('review_loan') ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'
                }`}
              >
                <X className="w-4 h-4" />
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
