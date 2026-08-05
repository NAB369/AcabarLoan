import { useState, useRef, useEffect, useMemo } from 'react'
import { DollarSign, TrendingUp, Calculator, FileText, Building, Briefcase, Calendar, X, Check, Printer, Download, Bell, Phone, ShieldAlert, CheckCircle, Clock, AlertCircle, ChevronRight, ChevronDown, QrCode, Upload, CalendarClock, RefreshCw } from 'lucide-react'
import { useApp, hasFundingAccount } from '../../context/AppContext'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { buildReminderRecipients, buildSampleReminderMessage, daysUntilDue as daysUntilDueISO, weumsSignedIn } from '../../utils/reminders'
import { formatVal, formatAddress, buildAmortizationData, splitTimestamp, formatDateDisplay } from '../../utils/format'
import { LOAN_TAB_ICONS } from '../../utils/tabIcons'
import { downloadSheetPdf } from '../../utils/exportPdf'
import { companyLogoSrc } from '../../utils/companyLogo'
import { buildKhqrPayload, renderKhqrImage } from '../../utils/khqr'
import { InfoRow, InfoCard } from '../shared/InfoCard'
import DocList from '../shared/DocList'
import WeumsGateModal from '../shared/WeumsGateModal'
import RepaymentTracking from './RepaymentTracking'
import FirstRepaymentDateField from './FirstRepaymentDateField'
import CBCReport from './CBCReport'
import RestructureModal from './RestructureModal'
import KhqrCard from './KhqrCard'
import KhqrCropModal from './KhqrCropModal'
import { assessLoanRisk } from '../../utils/riskAssessment'
import { incomeCapacity } from '../../utils/statementIncome'
import { expenseCapacity } from '../../utils/statementExpense'

const INSTALLMENT_OPTIONS = [3, 6, 12, 18, 24, 36, 48, 60]
const CREDIT_HISTORY_FIELD = { borrower: 'creditHistoryInfo', coBorrower: 'coBorrowerCreditHistoryInfo', guarantor: 'guarantorCreditHistoryInfo' }
const CREDIT_HISTORY_LABEL = { borrower: 'Borrower', coBorrower: 'Co-Borrower', guarantor: 'Guarantor' }
const TABS = ['Overview', 'Repayment Tracking', 'Repayment Reminder', 'Repayment Schedule', 'Loan Profile', 'Audit Log']

function formatDMY(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Mirrors the status derivation in RepaymentTracking so the Overview snapshot
// labels a row exactly the way the full tracking tab does.
function isTrackedRowSettled(row) {
  return row.status === 'Paid' || row.status === 'Partial'
}

function trackedRowStatus(row) {
  if (isTrackedRowSettled(row)) return row.status
  if (row.dueDateISO && new Date(row.dueDateISO) < new Date(new Date().toDateString())) return 'Overdue'
  return row.status
}

function trackedStatusIcon(status) {
  if (status === 'Paid') return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
  if (status === 'Partial') return <CheckCircle className="w-3.5 h-3.5 text-sky-500" />
  if (status === 'Overdue') return <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
  return <Clock className="w-3.5 h-3.5 text-amber-500" />
}

function trackedStatusBadge(status) {
  const map = {
    Paid: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
    Partial: 'bg-sky-50 text-sky-700 border-sky-200/60 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700',
    Overdue: 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-700',
    Upcoming: 'bg-amber-50 text-amber-700 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
  }
  return map[status] || map.Upcoming
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
    // The heading is marked as a unit so the PDF export never cuts a page between a section
    // title and the first field under it — see keepWhole in handleDownloadPdf.
    <div className={first ? 'mb-5' : 'mb-5 mt-6'}>
      <h4 data-doc-section className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1 mb-2">{title}</h4>
      {children}
    </div>
  )
}

function DocSubHeading({ children }) {
  return <p className="text-[11px] font-semibold italic text-slate-400 dark:text-slate-500 mt-3 mb-1 first:mt-0">{children}</p>
}

function DocField({ label, value }) {
  return (
    <div data-doc-field className="flex items-baseline gap-3 py-1 border-b border-dotted border-slate-200 dark:border-slate-700 text-xs">
      <span className="text-slate-500 dark:text-slate-400 w-36 flex-shrink-0">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100 text-left truncate">{value ?? '—'}</span>
    </div>
  )
}

function DocFieldGrid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">{children}</div>
}

export default function LoanPreview() {
  const { state, dispatch, showToast, can } = useApp()
  const loan = state.activeLoan
  const [activeTab, setActiveTab] = useState(() => {
    const idx = TABS.indexOf(state.loanPreviewTab)
    return idx >= 0 ? idx : 0
  })
  const [reminderRecipientKey, setReminderRecipientKey] = useState('borrower')
  const [reminderMessageOverride, setReminderMessageOverride] = useState(null)
  const [reminderGateOpen, setReminderGateOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [showDisburseModal, setShowDisburseModal] = useState(false)
  const [disburseConfirmed, setDisburseConfirmed] = useState(false)
  const [disburseFirstDueISO, setDisburseFirstDueISO] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [scheduleDownloading, setScheduleDownloading] = useState(false)
  const [restructureMode, setRestructureMode] = useState(null)
  const [khqrBusy, setKhqrBusy] = useState(false)
  const [khqrCropFile, setKhqrCropFile] = useState(null)
  const khqrFileRef = useRef(null)
  const profileDocRef = useRef(null)
  const scheduleSheetRef = useRef(null)

  useEffect(() => {
    const idx = TABS.indexOf(state.loanPreviewTab)
    setActiveTab(idx >= 0 ? idx : 0)
  }, [loan?.ref, state.loanPreviewTab])

  // Capture-phase + stopPropagation: these confirm dialogs stack on top of the
  // loanPreviewOpen screen App.jsx's global Escape handler already closes on Escape.
  // Without this, Escape would bounce the officer out of the whole loan record instead
  // of just backing out of the disburse/cancel confirmation.
  useEffect(() => {
    if (!(showDisburseModal || showCancelModal || lightbox || restructureMode)) return
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (lightbox) setLightbox(null)
      else if (restructureMode) setRestructureMode(null)
      else if (showDisburseModal) setShowDisburseModal(false)
      else if (showCancelModal) setShowCancelModal(false)
    }
    document.addEventListener('keydown', handleEscape, true)
    return () => document.removeEventListener('keydown', handleEscape, true)
  }, [showDisburseModal, showCancelModal, lightbox, restructureMode])

  if (!loan) return null

  const currency = loan.currency || state.currency
  const schedule = loan.schedule || []
  const emi = loan.emi || (schedule.length > 0 ? schedule[0].totalDue : 0)
  const customer = state.customers.find(c => c.code === loan.customerCode)
  // `UPDATE_LOAN` refreshes `loanApplications` but not `activeLoan`, so read the
  // history off the live list entry — otherwise a reminder sent from this page
  // never appears below until the page is reopened.
  const liveLoan = state.loanApplications.find(a => a.ref === loan.ref) || loan
  const reminderHistory = liveLoan.reminderHistory || []
  const collaterals = loan.collaterals?.length ? loan.collaterals : (loan.collateral ? [loan.collateral] : [])
  const isDisbursed = loan.status === 'Active'
  const readyToDisburse = loan.status === 'Waiting Disburse' && !isDisbursed
  // A cleared repayment date blocks the payout too — the confirm dialog is where the
  // collection day is agreed, so it cannot be released without one.
  const disburseReady = !!customer?.accountNumber && disburseConfirmed && can('disburse_loan')
    && (schedule.length === 0 || !!disburseFirstDueISO)

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
  // Overview shows a three-row window of the tracking table, ending at the most
  // recently settled installment — the current collection position. Nothing settled
  // yet means the loan starts at the top of the schedule.
  const lastTrackedIdx = schedule.reduce((last, r, i) => (isTrackedRowSettled(r) ? i : last), -1)
  const trackingWindowEnd = Math.max(lastTrackedIdx + 1, 3)
  const trackingPreviewRows = schedule.slice(Math.max(0, trackingWindowEnd - 3), trackingWindowEnd)
  const daysUntilDue = nextPayment ? daysUntilDueISO(nextPayment.dueDateISO) : null

  const reminderRecipients = buildReminderRecipients(loan)
  const selectedRecipient = reminderRecipients.find(r => r.key === reminderRecipientKey) || reminderRecipients[0]
  const sampleReminderMessage = buildSampleReminderMessage('Message', selectedRecipient, nextPayment, currency, loan)
  const reminderMessage = reminderMessageOverride ?? sampleReminderMessage

  // The KHQR belongs to this loan, not to the company — one code per borrower is what makes a
  // collected payment attributable to the loan it settles. The switch is per loan too, so a
  // schedule can be issued without a payment code without disturbing anyone else's.
  const webill365 = state.integrations?.find(i => i.id === 'webill365')
  const khqrImage = loan.khqrEnabled ? (loan.khqrImage || '') : ''
  const hasKhqr = !!loan.khqrImage
  // Binding needs both a live connection and the merchant account the code is keyed on —
  // either missing and there is nothing for the button to fetch.
  const khqrCanBind = webill365?.status === 'connected' && !!(webill365.account || '').trim()

  function setKhqr(khqr) {
    dispatch({ type: 'SET_LOAN_KHQR', ref: loan.ref, khqr })
  }

  // Generated from the WeBill365 merchant account with this loan's reference riding inside it.
  // The connection is a mock with no endpoint (see INITIAL_INTEGRATIONS), so the payload is
  // built locally in the shape Bakong reads rather than fetched — utils/khqr.js covers what
  // that does and does not guarantee.
  async function handleGenerateKhqr() {
    const account = (webill365?.account || '').trim()
    // Two separate reasons this can fail, reported separately. They used to share one message
    // that blamed the connection, so a connection that was up but had no Merchant ID on it read
    // as "not connected" and sent the operator to the wrong screen.
    if (webill365?.status !== 'connected') {
      showToast(`${webill365?.name || 'WeBill365'} is not connected — connect it in Integrations, or upload a KHQR image`, 'error')
      return
    }
    if (!account) {
      showToast(`${webill365?.name || 'WeBill365'} has no ${webill365?.accountLabel || 'Merchant ID'} set — add it in Integrations → Configure`, 'error')
      return
    }
    setKhqrBusy(true)
    try {
      // Recorded alongside the image because the currency is baked into the payload at this
      // moment and cannot change afterwards. The card used to read its symbol from the live
      // schedule currency, so switching the app's currency toggle put a riel symbol on a code
      // that still encoded dollars — the badge now reports what the QR actually carries.
      const khqrCurrency = loan.currency || currency
      const payload = buildKhqrPayload({
        account,
        merchantName: state.companyProfile?.name,
        currency: khqrCurrency,
        billNumber: loan.ref,
        reference: loan.customerCode,
      })
      // The currency drives the badge painted into the middle of the code, so it is passed
      // rather than left to a default that could disagree with the payload's own tag 53.
      const image = await renderKhqrImage(payload, khqrCurrency)
      setKhqr({ khqrImage: image, khqrEnabled: true, khqrSource: 'webill365', khqrCurrency })
      logActivity('Repayment Schedule', 'KHQR generated',
        `From ${webill365?.name || 'WeBill365'} · merchant ${account} · ${khqrCurrency}`)
      showToast(`KHQR generated for ${loan.ref} — scan it once to confirm it resolves`, 'success')
    } catch {
      showToast('That KHQR could not be generated', 'error')
    } finally {
      setKhqrBusy(false)
    }
  }

  // What switching on does depends on where a code would come from, and the connection only
  // governs the codes that belong to it:
  //
  //   WeBill365 reachable      → generate a fresh code from it. That is the point of the link.
  //   held code was uploaded   → show it. An uploaded image is the operator's own file and has
  //                              nothing to do with whether the provider is up.
  //   held code was generated  → refused while the connection is down. It was issued against a
  //                              connection that is no longer there, so putting it back on a
  //                              borrower's schedule would present a code this install can no
  //                              longer stand behind.
  //   nothing held             → say which half is missing.
  //
  // Switching *off* never depends on any of it: a code already on a schedule has to be
  // removable whatever the provider is doing.
  async function handleKhqrToggle() {
    if (loan.khqrEnabled) {
      setKhqr({ khqrEnabled: false })
      logActivity('Repayment Schedule', 'KHQR hidden from schedule',
        loan.khqrSource === 'webill365' ? `Code from ${webill365?.name || 'WeBill365'}` : 'Uploaded code')
      return
    }
    if (khqrCanBind) {
      await handleGenerateKhqr()
      return
    }
    if (hasKhqr && loan.khqrSource === 'uploaded') {
      setKhqr({ khqrEnabled: true })
      logActivity('Repayment Schedule', 'KHQR shown on schedule', 'Uploaded code')
      return
    }
    if (hasKhqr) {
      showToast(
        `That KHQR was generated from ${webill365?.name || 'WeBill365'}, which is no longer connected —`
        + ' reconnect it to generate a current code, or upload one.',
        'error',
      )
      return
    }
    // Nothing to show and nothing to generate from — say which, rather than sitting inert.
    await handleGenerateKhqr()
  }

  // Upload runs through the cropper rather than straight into state — see KhqrCropModal on
  // why a screenshot of a bank app is rarely usable uncropped.
  function handleKhqrFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // so picking the same file twice still fires onChange
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Choose an image file', 'error')
      return
    }
    setKhqrCropFile(file)
  }

  // An upload shows on the schedule straight away — supplying the code is the whole intent, and
  // leaving it stored-but-hidden behind a second click made it look as though nothing happened.
  // What it must NOT do is imply WeBill365 bound it: the button is a display switch, and the
  // source chip beside it says where the code actually came from.
  function handleKhqrCropped(dataUrl) {
    setKhqrCropFile(null)
    setKhqr({ khqrImage: dataUrl, khqrSource: 'uploaded', khqrEnabled: true })
    logActivity('Repayment Schedule', hasKhqr ? 'KHQR replaced by upload' : 'KHQR uploaded',
      khqrCropFile?.name || 'image file')
    showToast(`KHQR uploaded for ${loan.ref}`, 'success')
  }

  const overviewTabIdx = TABS.indexOf('Overview')
  const loanProfileTabIdx = TABS.indexOf('Loan Profile')
  const scheduleTabIdx = TABS.indexOf('Repayment Schedule')
  const trackRepaymentTabIdx = TABS.indexOf('Repayment Tracking')
  const reminderTabIdx = TABS.indexOf('Repayment Reminder')
  const auditLogTabIdx = TABS.indexOf('Audit Log')

  function handleViewDoc(doc, isImage) {
    if (isImage && doc.dataUrl) {
      setLightbox(doc)
    } else if (doc.dataUrl) {
      const w = window.open()
      w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:0"></iframe>`)
    }
  }

  // The profile used to go out through jsPDF's own `pdf.html()` with autoPaging, which drew the
  // sheet at x:0 y:0 across the full page — no margin on any edge — and cut pages wherever the
  // text happened to fall, so a field's label could end one page and its value start the next.
  // It now takes the same route the schedule does: rasterised at paper width, inset by a margin
  // on all four sides, and cut only between whole blocks. `keepWhole` names the units that must
  // not be split — a section heading, a field row, a document row.
  async function handleDownloadPdf() {
    const element = profileDocRef.current
    if (!element || downloading) return
    setDownloading(true)
    try {
      await downloadSheetPdf(element, `Loan-Profile-${loan.ref || 'loan'}`, {
        keepWhole: '[data-doc-section], [data-doc-field], tbody tr',
      })
      // Logged after the export resolved, so a failed or cancelled save leaves no entry
      // claiming the document went out.
      logActivity('Loan Profile', 'Profile exported to PDF', `Loan-Profile-${loan.ref || 'loan'}.pdf`)
    } finally {
      setDownloading(false)
    }
  }

  async function handleDownloadSchedule() {
    if (scheduleDownloading) return
    setScheduleDownloading(true)
    try {
      await downloadSheetPdf(scheduleSheetRef.current, `Repayment-Schedule-${loan.ref || 'loan'}`)
      logActivity('Repayment Schedule', 'Schedule exported to PDF',
        `${schedule.length} installments${khqrImage ? ' · with KHQR' : ''}`)
    } finally {
      setScheduleDownloading(false)
    }
  }

  function openDisburseModal() {
    setDisburseConfirmed(false)
    setDisburseFirstDueISO(schedule[0]?.dueDateISO || '')
    setShowDisburseModal(true)
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
  }

  function openCancelModal() {
    setCancelReason('')
    setShowCancelModal(true)
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
    dispatch({ type: 'CLOSE_LOAN_PREVIEW' })
    dispatch({ type: 'OPEN_LOAN_DETAIL', idx })
    showToast('Loan cancelled by customer', 'info')
    setShowCancelModal(false)
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
      ...liveLoan,
      reminderHistory: [
        ...reminderHistory,
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
    logActivity('Repayment Reminder', 'Reminder sent',
      [`${selectedRecipient?.role || 'Recipient'} ${selectedRecipient?.name || ''}`.trim(),
        destination || 'no number on file',
        nextPayment ? `installment #${nextPayment.num} due ${nextPayment.dueDate}` : null,
      ].filter(Boolean).join(' · '))
    showToast(`Repayment reminder sent to ${selectedRecipient?.name}${destination ? ` (${destination})` : ''}`, 'success')
  }

  function handleReminderRecipientChange(key) {
    setReminderRecipientKey(key)
    setReminderMessageOverride(null)
  }

  // Records what was done and which tab it was done from. Called after the action has actually
  // happened, never before — an entry for something a guard turned back would be a lie in the
  // trail. Same store the Loan Detail tabs write to, so one loan has one history.
  function logActivity(section, action, detail) {
    dispatch({ type: 'ADD_LOAN_ACTIVITY', ref: loan.ref, entry: { section, action, detail: detail || '' } })
  }

  // The approval workflow and the per-tab activity read as one column of time. They are stored
  // apart because ApprovalTimeline walks approvalHistory to draw the stages, and the two use
  // different timestamp formats — toLocaleString('en-GB') against auditStamp() — so they are
  // normalised to a common sort key rather than concatenated.
  const auditEntries = useMemo(() => {
    const sortKey = ts => {
      const { date, time } = splitTimestamp(ts)
      const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(date)
        ? `${date.slice(6, 10)}-${date.slice(3, 5)}-${date.slice(0, 2)}`
        : date
      return `${iso} ${time}`
    }
    const fromApproval = (loan.approvalHistory || []).map(h => ({
      timestamp: h.timestamp, section: 'Approval', action: h.action, detail: '', user: h.user,
    }))
    const fromActivity = (loan.activityLog || []).map(a => ({
      timestamp: a.timestamp, section: a.section || 'Loan', action: a.action, detail: a.detail || '', user: a.user,
    }))
    return [...fromApproval, ...fromActivity]
      .sort((a, b) => sortKey(b.timestamp).localeCompare(sortKey(a.timestamp)))
  }, [loan.approvalHistory, loan.activityLog])

  return (
    <>
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Loan Preview</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700">
              {loan.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{loan.ref} · {loan.product} · {loan.customerName}</p>
        </div>
        {/* A live loan can be restructured. Reschedule only rewrites the schedule; refinance
            settles this loan with a new one and moves money, so it carries the heavier
            treatment of the two. */}
        {isDisbursed && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={() => setRestructureMode('reschedule')}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-semibold rounded-xl transition-colors flex-shrink-0 w-full sm:w-auto"
            >
              <CalendarClock className="w-4 h-4" />
              Reschedule
            </button>
            <button
              onClick={() => setRestructureMode('refinance')}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors flex-shrink-0 w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Refinance
            </button>
          </div>
        )}
        {readyToDisburse && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={openCancelModal}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-rose-200 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-sm font-semibold rounded-xl transition-colors flex-shrink-0 w-full sm:w-auto"
            >
              <X className="w-4 h-4" />
              Customer Cancel
            </button>
            <button
              onClick={openDisburseModal}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors flex-shrink-0 w-full sm:w-auto"
            >
              <Check className="w-4 h-4" />
              Disburse
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
          {TABS.map((tab, i) => {
            const TabIcon = LOAN_TAB_ICONS[tab]
            return (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${tab === 'Audit Log' ? 'ml-auto flex-shrink-0' : ''} ${activeTab === i ? (tab === 'Audit Log' ? 'text-[#0047ab] dark:text-blue-400' : 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400') : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              {TabIcon && <TabIcon className="w-3.5 h-3.5" />}
              {tab}
            </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-6 max-h-[65vh] overflow-y-auto">

          {activeTab === overviewTabIdx && (
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

              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700 pb-2 mt-20">Repayment Info</p>
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

                  <div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Upcoming Installments</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
                      {upcomingInstallments.slice(0, 5).map((row, i) => (
                        <div key={i} className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">#{row.num} · {row.dueDate}</p>
                          </div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{formatVal(row.totalDue, currency, 1)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 dark:text-slate-500">No upcoming repayments — the schedule is fully paid or not yet generated.</p>
              )}

              {trackingPreviewRows.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Repayment Tracking</span>
                    <button
                      onClick={() => setActiveTab(trackRepaymentTabIdx)}
                      className="flex items-center gap-0.5 text-[11px] font-semibold text-[#0047ab] dark:text-blue-400 hover:underline"
                    >
                      View all
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 mt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400">#</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400">Due Date</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Payment Date</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400">Total Due</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Penalty Fee</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500 dark:text-slate-400">Paid</th>
                          <th className="px-3 py-2.5 text-center font-semibold text-slate-500 dark:text-slate-400">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {trackingPreviewRows.map((row, i) => {
                          const status = trackedRowStatus(row)
                          return (
                            <tr key={i} className={row.status === 'Paid' ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : ''}>
                              <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-medium">{row.num}</td>
                              <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{row.dueDate}</td>
                              <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                {row.paid > 0 && row.paidDate ? formatDateDisplay(row.paidDate) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200">{formatVal(row.totalDue, currency, 1)}</td>
                              <td className="px-3 py-2.5 text-right">
                                {row.lateFee > 0
                                  ? <span className="text-rose-600 dark:text-rose-400 font-semibold">{formatVal(row.lateFee, currency, 1)}</span>
                                  : <span className="text-slate-300 dark:text-slate-600">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-slate-600 dark:text-slate-300">
                                {row.paid > 0 ? formatVal(row.paid, currency, 1) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex justify-center">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${trackedStatusBadge(status)}`}>
                                    {trackedStatusIcon(status)}
                                    {status}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === loanProfileTabIdx && (
            <div className="space-y-3">
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    logActivity('Loan Profile', 'Profile printed', `${loan.ref} · ${loan.product || 'loan'}`)
                    window.print()
                  }}
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
                {/* Header. Carries doc-letterhead / letterhead-name so the print rules size the
                    company name as a heading — without them the generic `> .flex p` rule shrank
                    both lines to 9px, printing the company smaller than the title beneath it. */}
                <div className="doc-letterhead flex items-center gap-3">
                  <img src={companyLogoSrc(state.companyProfile)} alt={state.companyProfile.name} className="doc-logo w-14 h-14 object-contain flex-shrink-0" />
                  <div className="letterhead-name flex-1 text-center">
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

          {activeTab === scheduleTabIdx && (
            <div className="space-y-3">
              {/* Two clusters rather than one row of equal buttons: what the sheet carries
                  (the payment code) stays a visible toggle on the left, because it reports state
                  and has to be readable without opening anything. The one-off document actions
                  sit behind a single menu on the right. */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2 mr-auto">
                  {/* One control for this loan's payment code. Switching it on with nothing on
                      file binds it from WeBill365 as part of the same action, so there is no
                      separate step to know about. Disabled while switched off and the provider
                      is unreachable — there would be nothing to bind — but never while switched
                      on, so a code already on a schedule can always be taken back off. */}
                  {/* Brand blue for the on state, not emerald: everywhere else in this app
                      emerald means "good" (StatusBadge Active/Approved) while blue means
                      "selected" — which is what a toggle actually is. */}
                  <button
                    onClick={handleKhqrToggle}
                    // Only ever disabled while it is working. It used to be disabled whenever it
                    // could not bind, which made a connection missing its Merchant ID look like a
                    // broken button — and the tooltip then blamed the connection. It now always
                    // responds and explains in a toast when it cannot do the thing.
                    disabled={khqrBusy}
                    aria-pressed={!!loan.khqrEnabled}
                    title={loan.khqrEnabled
                      ? 'KHQR is shown on this schedule — click to hide it'
                      : khqrCanBind
                        ? `Generate a new KHQR for this loan from ${webill365?.name || 'WeBill365'} and show it`
                        : hasKhqr && loan.khqrSource === 'uploaded'
                          ? 'Show the uploaded KHQR on file for this loan'
                          : hasKhqr
                            ? `The KHQR on file came from ${webill365?.name || 'WeBill365'}, which is disconnected — reconnect it, or upload a code`
                            : `Connect ${webill365?.name || 'WeBill365'} to generate a KHQR, or use Upload KHQR to supply one`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      loan.khqrEnabled
                        ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-900/25 dark:text-brand-300'
                        : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    {/* What pressing it actually does while switched off — bind from WeBill365 —
                        is carried by the tooltip and the busy label rather than the resting one,
                        which stays a plain on/off. */}
                    {khqrBusy
                      ? 'Binding from WeBill365…'
                      : loan.khqrEnabled
                        ? 'KHQR On'
                        : 'KHQR Off'}
                  </button>

                  <input ref={khqrFileRef} type="file" accept="image/*" onChange={handleKhqrFile} className="hidden" />
                </div>

                {/* Download, print and replacing the code are one-off document actions, so they
                    collapse into a single menu and leave the toggle — the only control that
                    reflects state — reading on its own. The trigger keeps the solid fill because
                    the menu holds what this tab is for; the items themselves stay plain. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={scheduleDownloading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {scheduleDownloading ? 'Preparing…' : 'Actions'}
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 rounded-xl dark:bg-slate-800 dark:border-slate-700">
                    <DropdownMenuItem
                      onSelect={handleDownloadSchedule}
                      disabled={scheduleDownloading || schedule.length === 0}
                      className="flex items-center gap-2 text-xs font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        logActivity('Repayment Schedule', 'Schedule printed',
                          `${schedule.length} installments${khqrImage ? ' · with KHQR' : ''}`)
                        window.print()
                      }}
                      disabled={schedule.length === 0}
                      className="flex items-center gap-2 text-xs font-semibold cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Schedule
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="dark:bg-slate-700" />
                    <DropdownMenuItem
                      // The file dialog has to be opened after the menu has closed and handed
                      // focus back — firing it inline from onSelect lands mid-teardown and the
                      // picker never appears.
                      onSelect={() => { setTimeout(() => khqrFileRef.current?.click(), 0) }}
                      className="flex items-center gap-2 text-xs font-semibold cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {hasKhqr ? 'Replace KHQR' : 'Upload KHQR'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* `schedule-sheet` opts this document out of the generic print rules written
                  for the dense on-screen tables elsewhere — see the print block in
                  globals.css, which would otherwise shrink the letterhead below the title
                  and wrap the date column. */}
              <div
                ref={scheduleSheetRef}
                className="printable-area schedule-sheet bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mx-auto w-full max-w-[210mm] shadow-sm"
                style={{ fontFamily: "'Kantumruy Pro', 'Outfit', sans-serif" }}
              >
                {/* Header. Both outer slots are the same width so the company name stays
                    optically centred whether or not this loan carries a KHQR.
                    The document title lives inside the centre column rather than under the whole
                    row: the KHQR card is much taller than two lines of company name, so a title
                    placed after the row sat below the card's full height and left a band of dead
                    space between the two. Inside the column it fills that space instead, and the
                    header closes up to the same height with or without a code. */}
                <div className="doc-letterhead flex items-start gap-3 mb-4">
                  <div className="w-32 flex-shrink-0 flex items-start justify-start">
                    <img src={companyLogoSrc(state.companyProfile)} alt={state.companyProfile.name} className="doc-logo w-[77px] h-[77px] object-contain" />
                  </div>
                  <div className="flex-1 text-center pt-1">
                    <div className="letterhead-name">
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{state.companyProfile.nameKh}</p>
                      <p className="text-sm font-bold tracking-wide text-slate-700 dark:text-slate-200">{state.companyProfile.name.toUpperCase()}</p>
                    </div>
                    <p className="doc-title text-base font-bold text-slate-800 dark:text-slate-100 mt-3">តារាងកាលវិភាគសងប្រាក់</p>
                  </div>
                  <div className="w-32 flex-shrink-0 flex flex-col items-end">
                    {khqrImage && (
                      <KhqrCard
                        className="w-[102px]"
                        image={khqrImage}
                        // The borrower, not the company — the code is issued per loan, so the
                        // name on it should say who is paying against it.
                        payeeName={loan.customerName}
                        reference={loan.ref}
                        // An uploaded image is already a complete KHQR card; framing it again
                        // stacked a second banner and payee on top of the one in the picture.
                        framed={loan.khqrSource !== 'uploaded'}
                      />
                    )}
                  </div>
                </div>

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

          {activeTab === trackRepaymentTabIdx && <RepaymentTracking />}

          {activeTab === reminderTabIdx && (
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
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Sent Reminder History</span>
                    </div>
                    <div className="p-4 space-y-1.5 max-h-64 overflow-y-auto">
                      {reminderHistory.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500">No reminders have been sent for this loan yet.</p>
                      ) : (
                        [...reminderHistory].reverse().map((r, i) => (
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

          {activeTab === auditLogTabIdx && (
            <div className="space-y-4">
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
                            <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Section</th>
                            <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action</th>
                            <th className="px-3 py-3 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">User</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {auditEntries.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-10 text-center text-slate-400 dark:text-slate-500">
                                No audit log entries recorded for this loan.
                              </td>
                            </tr>
                          ) : auditEntries.map((log, i) => {
                            const { date, time } = splitTimestamp(log.timestamp)
                            return (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors align-top">
                              <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{date}</td>
                              <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{time}</td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                {/* Which tab the action came from. Approval entries are the
                                    workflow itself, so they carry the brand colour the timeline
                                    uses; everything else is a neutral tag. */}
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  log.section === 'Approval'
                                    ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                }`}>
                                  {log.section}
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">{log.action || '—'}</span>
                                {/* What actually changed, so the row says more than that something did */}
                                {log.detail && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{log.detail}</span>}
                              </td>
                              <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{log.user || '—'}</td>
                            </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>

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

      {/* Reschedule / refinance. The plan shown in the dialog is the plan dispatched, so what
          the officer approved is what is applied — see RestructureModal. */}
      {restructureMode && (
        <RestructureModal
          mode={restructureMode}
          loan={loan}
          currency={currency}
          onClose={() => setRestructureMode(null)}
          onConfirm={(plan, reason) => {
            if (!plan) return
            if (restructureMode === 'refinance') {
              dispatch({ type: 'REFINANCE_LOAN', ref: loan.ref, plan, reason })
              showToast(`${loan.ref} refinanced — ${formatVal(plan.netToBorrower, currency, 1)} released`, 'success')
            } else {
              dispatch({ type: 'RESCHEDULE_LOAN', ref: loan.ref, plan, reason })
              showToast(`${loan.ref} rescheduled over ${plan.installments} months`, 'success')
            }
            setRestructureMode(null)
          }}
        />
      )}

      {/* Crop step for an uploaded KHQR — handles its own Escape, see KhqrCropModal. */}
      {khqrCropFile && (
        <KhqrCropModal
          file={khqrCropFile}
          onCancel={() => setKhqrCropFile(null)}
          onApply={handleKhqrCropped}
        />
      )}

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
    </>
  )
}
