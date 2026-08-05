import { useState, useRef, useEffect, useMemo } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { X, Pencil, User, Building, CreditCard, TrendingUp, DollarSign, FileText, Calculator, Briefcase, Wallet, Trash2, Scale, ShieldAlert, Send, Check, Calendar, LayoutDashboard, History, Plus, ArrowDownLeft, Eye, Printer, Download, Upload, PiggyBank } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatVal, buildAmortizationData, formatAddress, getProductMaxAmount, splitTimestamp, formatFileSize, formatDateDisplay } from '../../utils/format'
import StatusBadge from '../shared/StatusBadge'
import { downloadSheetPdf } from '../../utils/exportPdf'
import { companyLogoSrc } from '../../utils/companyLogo'
import { InfoRow, InfoCard } from '../shared/InfoCard'
import { KH_PROVINCES, getDistricts, getCommunes } from '../../data/geoData'
import { EMPTY_ADDRESS, OCCUPATIONS, RELATIONS, IDENTITY_DOC_TYPES, REGISTRATION_STATUSES, LAND_TITLE_TYPES, LAND_USE_TYPES, HOUSE_TYPES, CONSTRUCTION_TYPES, ENCUMBRANCE_STATUSES, getCollateralDocTypes, BRANCHES } from '../../data/constants'
import TypedDocumentUpload from '../shared/TypedDocumentUpload'
import PersonInfoGrid from '../shared/PersonInfoGrid'
import IdentityDocumentsTable from '../shared/IdentityDocumentsTable'
import IncomeVerification from './IncomeVerification'
import ExpenseVerification from './ExpenseVerification'
import {
  INCOME_FIELD, INCOME_LIST_FIELD, INCOME_LABEL, BUSINESS_OCCUPATIONS, BUSINESS_INCOME_TYPES,
  getIncomeProofDocTypes, getIncomeCompanyDocTypes,
  VERIFY_STATUS,
} from '../../utils/income'
import {
  EXPENSE_FIELD, EXPENSE_LABEL, EXPENSE_CATEGORIES, EXPENSE_DOC_TYPES,
} from '../../utils/expense'
import CustomerWizard from '../customers/CustomerWizard'
import AddressFields from '../shared/AddressFields'
import CBCReportDocument from './CBCReportA4'
import CreditVerificationPanel from './CreditVerificationPanel'
import StickyHScroll from '../shared/StickyHScroll'
import { assessLoanRisk } from '../../utils/riskAssessment'
import { extractCbcSummary } from '../../utils/parseCbcReport'
import { parseBankStatement } from '../../utils/parseBankStatement'
import { parsePayslip, derivePayslipIncome } from '../../utils/parsePayslip'
import { parseEmploymentCert } from '../../utils/parseEmploymentCert'
import { incomeCapacity } from '../../utils/statementIncome'
import { deriveStatementExpense, EXPENSE_MONTHS_REQUIRED, expenseCapacity } from '../../utils/statementExpense'

const INSTALLMENT_OPTIONS = [3, 6, 12, 18, 24, 36, 48, 60]
// Share of the borrower's remaining income (income − expense) that is set aside as savings and
// therefore excluded from repayment capacity in the loan assessment.
const SAVINGS_RESERVE_RATE = 0.2

// The document table renders one row per expected type, so a file whose type is no longer
// in the expected list (e.g. the collateral type was changed after upload) would vanish.
// Append any type actually present so every uploaded file stays visible.
function withUploadedDocTypes(baseTypes, documents) {
  return [...new Set([...baseTypes, ...(documents || []).map(d => d.docType).filter(Boolean)])]
}

const ghostBtnCls = 'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors'

// Every empty section reads the same way — an icon tile, what is missing, a line on how to
// fill it, and the action that does — the shape the income tab set. `bare` drops the card
// chrome for the places that already sit inside a bordered box (a card body, a table cell),
// where a second border would only double up.
function EmptyState({ icon: Icon, title, hint, bare = false, className = '', children }) {
  return (
    <div className={`${bare ? '' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl '}${bare ? 'py-8' : 'p-10'} flex flex-col items-center gap-3 ${className}`}>
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500 text-center max-w-sm">{hint}</p>}
      {children && <div className="flex items-center gap-2 flex-wrap justify-center mt-1">{children}</div>}
    </div>
  )
}

const GENDERS = ['Male', 'Female']
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed']
const COLLATERAL_TYPES = ['Land', 'Vehicle', 'House']
const DETAIL_TABS = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Customer', icon: User },
  { label: 'CBC', icon: CreditCard },
  { label: 'Collateral', icon: Building },
  { label: 'Income Verification', icon: ArrowDownLeft },
  { label: 'Expense Verification', icon: Wallet },
  { label: 'Loan Assessment', icon: Calculator },
  { label: 'Risk Assessment', icon: ShieldAlert },
  { label: 'Audit Log', icon: History },
]

function makePartyForm(party) {
  return {
    khName: party?.khName || '',
    enName: party?.enName || '',
    dob: party?.dob || '',
    gender: party?.gender || 'Male',
    maritalStatus: party?.maritalStatus || 'Single',
    idType: party?.idType || 'National ID',
    idNo: party?.idNo || '',
    relation: party?.relation || '',
    phone: party?.phone || '',
    email: party?.email || '',
    currentAddress: (party?.currentAddress && typeof party.currentAddress === 'object') ? party.currentAddress : { ...EMPTY_ADDRESS },
    permanentAddress: (party?.permanentAddress && typeof party.permanentAddress === 'object') ? party.permanentAddress : { ...EMPTY_ADDRESS },
    occupation: party?.occupation || '',
    employmentStatus: party?.employmentStatus || 'Employed',
    monthlyIncome: party?.monthlyIncome?.toString() || '',
  }
}

const EMPTY_LOCATION = { province: 'Phnom Penh', district: '', commune: '', village: '' }

function makeCollateralForm(collateral) {
  return {
    type: collateral?.type || '',
    value: collateral?.value?.toString() || '',
    appraisedValue: collateral?.appraisedValue?.toString() || '',
    forcedSaleValue: collateral?.forcedSaleValue?.toString() || '',
    docNo: collateral?.docNo || '',
    registrationStatus: collateral?.registrationStatus || '',
    customType: '',
    addingType: false,
  }
}

// A custom type typed through "Add Type" is selected on the form directly, so the only time
// custom text is still pending here is an entry left uncommitted when Save was pressed.
function resolveCollateralType(form) {
  return form.type === 'Other' && form.customType?.trim() ? form.customType.trim() : form.type
}

function makeVehicleForm(vehicleInfo) {
  return {
    make: vehicleInfo?.make || '',
    model: vehicleInfo?.model || '',
    year: vehicleInfo?.year || '',
    plateNumber: vehicleInfo?.plateNumber || '',
    chassisNumber: vehicleInfo?.chassisNumber || '',
    engineNumber: vehicleInfo?.engineNumber || '',
    color: vehicleInfo?.color || '',
    ownerName: vehicleInfo?.ownerName || '',
    issueDate: vehicleInfo?.issueDate || '',
    encumbranceStatus: vehicleInfo?.encumbranceStatus || '',
  }
}

function makeLandForm(landInfo) {
  return {
    titleType: landInfo?.titleType || '',
    titleNumber: landInfo?.titleNumber || '',
    plotNumber: landInfo?.plotNumber || '',
    area: landInfo?.area || '',
    landUse: landInfo?.landUse || '',
    ownerName: landInfo?.ownerName || '',
    location: (landInfo?.location && typeof landInfo.location === 'object') ? landInfo.location : { ...EMPTY_LOCATION },
    issueDate: landInfo?.issueDate || '',
    encumbranceStatus: landInfo?.encumbranceStatus || '',
  }
}

function makeHouseForm(houseInfo) {
  return {
    houseType: houseInfo?.houseType || '',
    constructionType: houseInfo?.constructionType || '',
    floors: houseInfo?.floors || '',
    floorArea: houseInfo?.floorArea || '',
    landArea: houseInfo?.landArea || '',
    yearBuilt: houseInfo?.yearBuilt || '',
    ownerName: houseInfo?.ownerName || '',
    location: (houseInfo?.location && typeof houseInfo.location === 'object') ? houseInfo.location : { ...EMPTY_LOCATION },
    issueDate: houseInfo?.issueDate || '',
    encumbranceStatus: houseInfo?.encumbranceStatus || '',
  }
}

function CollateralLocationFields({ values, onChange }) {
  const districts = getDistricts(values.province)
  const communes = getCommunes(values.district)
  const inputCls = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition'
  const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1'

  function handleChange(field, val) {
    if (field === 'province') onChange({ ...values, province: val, district: '', commune: '' })
    else if (field === 'district') onChange({ ...values, district: val, commune: '' })
    else onChange({ ...values, [field]: val })
  }

  return (
    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Location</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Province</label>
          <select value={values.province} onChange={e => handleChange('province', e.target.value)} className={inputCls}>
            <option value="">Select Province</option>
            {KH_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>District</label>
          <select value={values.district} onChange={e => handleChange('district', e.target.value)} className={inputCls} disabled={!values.province}>
            <option value="">Select District</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Commune/Sangkat</label>
          <select value={values.commune} onChange={e => handleChange('commune', e.target.value)} className={inputCls} disabled={!values.district}>
            <option value="">Select Commune</option>
            {communes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Village</label>
          <input type="text" placeholder="Village" value={values.village} onChange={e => handleChange('village', e.target.value)} className={inputCls} />
        </div>
      </div>
    </div>
  )
}

const CREDIT_HISTORY_FIELD = { borrower: 'creditHistoryInfo', coBorrower: 'coBorrowerCreditHistoryInfo', guarantor: 'guarantorCreditHistoryInfo' }

// The credit-history fields that come out of an uploaded CBC report (see
// utils/parseCbcReport) — cleared together when the report file is removed.
const CBC_PARSED_FIELDS = [
  'reportDate', 'referenceNo', 'placeOfBirth', 'nationality', 'reportInquiries', 'activeAccounts',
  'bouncedCheques', 'badAccounts', 'guaranteedAccounts', 'totalOutstanding', 'totalOutstandingCurrency',
  'accounts', 'accountStatus', 'paymentHistory24',
]

// A party can have several bureau reports on file, each kept whole in `reports` with the
// file it was read from. Records written before that — a seeded loan, or one saved when a
// party held a single report — carry the figures flat on the record instead, so they read
// back as one report.
function cbcReportsOf(info) {
  if (info?.reports?.length) return info.reports
  const document = (info?.documents || [])[0]
  const hasFigures = CBC_PARSED_FIELDS.some(field => info?.[field] !== undefined)
  return document || hasFigures ? [{ ...info, document }] : []
}
const CREDIT_HISTORY_LABEL = { borrower: 'Borrower', coBorrower: 'Co-Borrower', guarantor: 'Guarantor' }

function mergeSchedule(newRows, oldRows) {
  if (!oldRows || oldRows.length !== newRows.length) return newRows
  return newRows.map((row, i) => ({ ...row, status: oldRows[i].status, paid: oldRows[i].paid, paidDate: oldRows[i].paidDate }))
}

function formatDMY(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function ScheduleField({ label, value }) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold text-slate-700 dark:text-slate-200 w-44 flex-shrink-0">{label}</span>
      <span className="text-slate-600 dark:text-slate-300">{value || '—'}</span>
    </div>
  )
}

// A category added through "Add Category" is selected on the row directly, so the only time
// custom text is still pending here is an entry left uncommitted when Save was pressed.
function resolveCategory(item) {
  return item.category === 'Other' && item.customCategory?.trim() ? item.customCategory.trim() : item.category
}

export default function LoanDetail() {
  const { state, dispatch, showToast } = useApp()

  if (state.loanDetailIdx === null || state.loanDetailIdx === undefined) return null
  const loan = state.loanApplications[state.loanDetailIdx]
  if (!loan) return null

  const customer = state.customers.find(c => c.code === loan.customerCode) || null
  const isDisbursed = loan.status === 'Active'
  // Cancelling or rejecting a loan leaves its approvalState where it had got to — the customer
  // cancel flow only rewrites `status` — so testing the approval stage alone still counted a
  // dead loan as ready and kept offering Go to Disbursement on it. Both closed states are
  // excluded explicitly rather than inferred from the stage.
  const isClosed = loan.status === 'Cancelled' || loan.status === 'Rejected'
  const readyToDisburse = (loan.approvalState || 1) >= 3 && !isDisbursed && !isClosed

  const borrowerDocTypes = (customer?.maritalStatus === 'Married'
    ? [...IDENTITY_DOC_TYPES.slice(0, -1), 'Marriage Certificate', IDENTITY_DOC_TYPES[IDENTITY_DOC_TYPES.length - 1]]
    : IDENTITY_DOC_TYPES
  ).filter(t => t !== 'Other')
  const partyDocTypes = IDENTITY_DOC_TYPES.filter(t => t !== 'Other')

  function handleGoToDisbursement() {
    dispatch({ type: 'OPEN_LOAN_OVERVIEW', loan })
  }

  const coBorrowers = loan.coBorrowers || (loan.coBorrower ? [loan.coBorrower] : [])
  const guarantors = loan.guarantors || (loan.guarantor ? [loan.guarantor] : [])
  const collaterals = loan.collaterals || (loan.collateral ? [loan.collateral] : [])
  const borrowerIncomes = loan.borrowerIncomes || (loan.borrowerIncomeInfo ? [loan.borrowerIncomeInfo] : [])
  const coBorrowerIncomes = loan.coBorrowerIncomes || (loan.coBorrowerIncomeInfo ? [loan.coBorrowerIncomeInfo] : [])
  const guarantorIncomes = loan.guarantorIncomes || (loan.guarantorIncomeInfo ? [loan.guarantorIncomeInfo] : [])

  const borrowerFullName = customer?.enName || loan.customerName || ''
  function getCollateralOwnerInfo(item) {
    const ownerName = item?.landInfo?.ownerName || item?.houseInfo?.ownerName || null
    const matchesBorrower = ownerName
      ? ownerName.trim().toLowerCase() === borrowerFullName.trim().toLowerCase()
      : null
    return { ownerName, matchesBorrower }
  }

  function getIncomeCandidateNames(target) {
    if (target === 'borrower') return [borrowerFullName, customer?.khName || loan.customerKhName].filter(Boolean)
    if (target === 'coBorrower') return coBorrowers.flatMap(cb => [cb.enName, cb.khName]).filter(Boolean)
    return guarantors.flatMap(g => [g.enName, g.khName]).filter(Boolean)
  }

  const currency = loan.currency || state.currency

  // Use existing schedule or compute one
  const schedule = loan.schedule && loan.schedule.length > 0
    ? loan.schedule
    : (loan.amount && loan.interestRate
        ? buildAmortizationData(loan.amount, loan.interestRate, loan.installments || 12, loan.firstInstallment).rows
        : [])

  const emi = loan.emi || (schedule.length > 0 ? schedule[0].totalDue : 0)

  // Total interest income over the life of the loan, derived from loan amount, rate and installment term
  const totalInterestIncome = schedule.reduce((sum, row) => sum + (row.interest || 0), 0)

  // Benefit to the Bank: every fee is auto-calculated, never manually entered.
  // Interest fee comes from the loan's own schedule; the rest are rates configured in System Settings.
  // Which fees apply depends on the loan product: Personal Loan only carries interest + admin;
  // vehicle loans (Vehicle Loan) swap the generic ministry fee for the transport-ministry fee and drop the lawyer fee;
  // every other product shows the full fee set.
  const feeSettings = state.feeSettings || {}
  const productLower = (loan.product || '').toLowerCase()
  const isPersonalLoan = productLower.includes('personal')
  const isVehicleLoan = productLower.includes('car') || productLower.includes('vehicle')

  // Lawyer and ministry fees are per land title registered as collateral — each additional
  // land parcel needs its own legal/ministry filing, so the fee scales with the land count.
  // The transport-ministry fee works the same way per vehicle: each vehicle pledged needs its
  // own registration filing with the Ministry of Public Works and Transport, so two vehicles
  // double the fee, three triple it, and so on.
  const landCollateralCount = Math.max(1, collaterals.filter(c => c.type === 'Land').length)
  const vehicleCollateralCount = Math.max(1, collaterals.filter(c => c.type === 'Vehicle').length)

  // Each auto-calculated fee carries the settings key + label of the rate that drives it, plus the
  // effective rate itself, so the Loan Assessment "Benefit Rate" editor can be derived straight from
  // this list (below) instead of a hand-kept parallel list that drifts out of sync.
  // Effective rate = a per-loan override the officer set here, else the System Settings default.
  const feeRateOverrides = loan.benefitFeeRates || {}
  const effectiveFeeRate = key => {
    const o = feeRateOverrides[key]
    return (o != null && o !== '') ? Number(o) : (feeSettings[key] || 0)
  }
  const interestFee = { category: 'Interest Fee', amount: totalInterestIncome }
  const adminFee = { category: 'Admin Fee', rate: effectiveFeeRate('adminFeeRate'), amount: (loan.amount || 0) * (effectiveFeeRate('adminFeeRate') / 100), rateKey: 'adminFeeRate', rateLabel: 'Admin Fee Rate' }
  const insuranceFee = { category: 'Insurance Fee', rate: effectiveFeeRate('insuranceFeeRate'), amount: (loan.amount || 0) * (effectiveFeeRate('insuranceFeeRate') / 100), rateKey: 'insuranceFeeRate', rateLabel: 'Insurance Fee Rate' }
  const lawyerFee = { category: 'Lawyer Fee', rate: effectiveFeeRate('lawyerFeeRate'), amount: (loan.amount || 0) * (effectiveFeeRate('lawyerFeeRate') / 100) * landCollateralCount, multiplier: landCollateralCount, multiplierLabel: 'land titles', rateKey: 'lawyerFeeRate', rateLabel: 'Lawyer Fee Rate' }
  const ministryFee = { category: 'Ministry Fee', rate: effectiveFeeRate('ministryFeeRate'), amount: (loan.amount || 0) * (effectiveFeeRate('ministryFeeRate') / 100) * landCollateralCount, multiplier: landCollateralCount, multiplierLabel: 'land titles', rateKey: 'ministryFeeRate', rateLabel: 'Ministry Fee Rate' }
  const transportMinistryFee = { category: 'Ministry of Public Works and Transport', rate: effectiveFeeRate('transportMinistryFeeRate'), amount: (loan.amount || 0) * (effectiveFeeRate('transportMinistryFeeRate') / 100) * vehicleCollateralCount, multiplier: vehicleCollateralCount, multiplierLabel: 'vehicles', rateKey: 'transportMinistryFeeRate', rateLabel: 'Ministry of Public Works and Transport Fee Rate' }

  // Full set of configurable fees, listed regardless of product. The credit officer ticks which
  // ones apply to this loan in the Benefit Rate panel; only ticked fees render as Benefit cards.
  // Fees deleted in Loan Setting → Benefit Fees are gone institution-wide, so they drop out here first.
  const removedFeeKeys = feeSettings.removedFeeKeys || []
  const configurableFeeItems = [adminFee, insuranceFee, lawyerFee, ministryFee, transportMinistryFee]
    .filter(b => !removedFeeKeys.includes(b.rateKey))

  // Default ticks for a loan that hasn't been customised yet — the fees that classically apply to
  // its product. Once the officer saves a selection it's stored on the loan (loan.benefitFeeKeys).
  const productDefaultFeeKeys = isPersonalLoan
    ? ['adminFeeRate']
    : isVehicleLoan
    ? ['adminFeeRate', 'insuranceFeeRate', 'transportMinistryFeeRate']
    : ['adminFeeRate', 'insuranceFeeRate', 'lawyerFeeRate', 'ministryFeeRate']
  const selectedFeeKeys = Array.isArray(loan.benefitFeeKeys) ? loan.benefitFeeKeys : productDefaultFeeKeys

  // Skip any custom fee that duplicates a built-in category (e.g. someone adding "Ministry of
  // Public Works and Transport" as a custom fee on top of the built-in one)
  const baseFeeCategories = new Set([interestFee, ...configurableFeeItems].map(b => b.category.toLowerCase()))
  const customFees = (feeSettings.customFees || [])
    .filter(f => !baseFeeCategories.has((f.name || '').toLowerCase()))
    .map(f => ({
      category: f.name,
      amount: (loan.amount || 0) * ((f.rate || 0) / 100),
    }))

  // Per-loan custom fees added by the credit officer in the Benefit Rate panel. Like the built-in
  // fees, each carries a tick — only ticked ones show as Benefit cards.
  const loanCustomFees = (loan.customBenefitFees || [])
    .filter(f => (f.name || '').trim() && f.included !== false)
    .map(f => ({
      category: f.name,
      rate: f.rate || 0,
      amount: (loan.amount || 0) * ((f.rate || 0) / 100),
    }))

  // Benefit cards: interest always counts; the ticked configurable fees; plus any custom fees.
  const benefitItems = [
    interestFee,
    ...configurableFeeItems.filter(b => selectedFeeKeys.includes(b.rateKey)),
    ...customFees,
    ...loanCustomFees,
  ]
  const totalBenefitToBank = benefitItems.reduce((sum, b) => sum + b.amount, 0)

  // The Benefit Rate panel lists every configurable fee (checkbox + editable rate), regardless of product.
  const relevantFeeRateFields = configurableFeeItems.map(b => ({ key: b.rateKey, label: b.category, rate: b.rate, multiplier: b.multiplier }))

  // Two figures, deliberately: `declared` is what the parties stated, `assessable` is that
  // capped by what their bank statements actually demonstrate — see utils/statementIncome.
  // Capacity is measured on the second, so a loan is never sized on income no statement shows.
  const income = incomeCapacity([...borrowerIncomes, ...coBorrowerIncomes, ...guarantorIncomes])
  const totalMonthlyIncome = income.declared
  // Unlike income, the expense side shown here is the reader's own figure: what the bank
  // statements demonstrate actually goes out per month ("Really spent / month" in the
  // verification panel — see utils/statementExpense), not the declared budget. Only an entry
  // with nothing readable off it falls back to what was declared, since there is nothing else
  // to assess it on.
  const expense = expenseCapacity([loan.borrowerExpenseInfo, loan.coBorrowerExpenseInfo, loan.guarantorExpenseInfo])
  const totalMonthlyExpense = expense.assessable
  const remainingAmount = income.assessable - expense.assessable

  // Prudential savings buffer: 20% of whatever is left after expenses stays with the borrower as
  // savings, so only the other 80% counts as disposable income available to service the loan.
  // Affordability everywhere below (term options included) is measured against that 80% figure.
  const savingsReserve = Math.max(0, remainingAmount) * SAVINGS_RESERVE_RATE
  const availableForRepayment = remainingAmount - savingsReserve

  // Other Term Options: recompute EMI/interest for each standard term so the credit officer
  // can compare affordability side-by-side and see which term the system recommends. If the loan
  // carries a custom term (manually entered in the Loan Product Rate panel and not one of the
  // presets), fold it into the list so it stays visible and selectable alongside the standards.
  const termChoices = (loan.installments && !INSTALLMENT_OPTIONS.includes(loan.installments))
    ? [...INSTALLMENT_OPTIONS, loan.installments].sort((a, b) => a - b)
    : INSTALLMENT_OPTIONS
  const termOptions = (loan.amount && loan.interestRate)
    ? termChoices.map(term => {
        const { emi: termEmi, rows: termRows } = buildAmortizationData(loan.amount, loan.interestRate, term, loan.firstInstallment)
        const totalInterest = termRows.reduce((sum, r) => sum + (r.interest || 0), 0)
        const leftAmount = availableForRepayment - termEmi
        return { term, emi: termEmi, totalInterest, leftAmount, affordable: leftAmount >= 0, rows: termRows }
      })
    : []
  const affordableTermOptions = termOptions.filter(t => t.affordable)
  const recommendedTerm = affordableTermOptions.length > 0
    ? affordableTermOptions.reduce((best, t) => t.term < best.term ? t : best, affordableTermOptions[0]).term
    : (termOptions.length > 0 ? termOptions[termOptions.length - 1].term : null)

  // Risk Assessment (Section 9): auto-derived from each party's CBC data — see utils/riskAssessment.
  const riskAssessment = assessLoanRisk(loan)

  const [showCoBorrowerCbc, setShowCoBorrowerCbc] = useState(() => !!loan.coBorrowerCreditHistoryInfo)

  // CBC sheet toolbar (upload / download / print), per party. One hidden file input is
  // shared, with the party it was opened for remembered alongside it.
  const cbcFileInputRef = useRef(null)
  const cbcUploadTargetRef = useRef('borrower')
  const cbcSheetRefs = useRef({})
  const [cbcDownloading, setCbcDownloading] = useState(null)
  const [cbcPrintTarget, setCbcPrintTarget] = useState(null)

  // Printing is a browser-level action on whatever currently carries `printable-area`,
  // so the chosen sheet has to be the only one wearing it before the dialog opens.
  useEffect(() => {
    if (!cbcPrintTarget) return
    withLightTheme(async () => window.print()).finally(() => setCbcPrintTarget(null))
  }, [cbcPrintTarget])

  // Personal data for the CBC report's identity section, per party. Borrower reads
  // from the linked customer (falling back to the loan's own snapshot); co-borrower /
  // guarantor read from their embedded records.
  function resolveCbcPerson(target) {
    if (target === 'coBorrower') {
      const cb = coBorrowers[0]
      return cb ? { enName: cb.enName, khName: cb.khName, gender: cb.gender, maritalStatus: cb.maritalStatus, dob: cb.dob, idType: cb.idType, idNo: cb.idNo, currentAddress: cb.currentAddress } : null
    }
    return {
      enName: customer?.enName || loan.customerName,
      khName: customer?.khName || loan.customerKhName,
      gender: customer?.gender || loan.customerGender,
      maritalStatus: customer?.maritalStatus,
      dob: customer?.dob,
      idType: customer?.idType,
      idNo: customer?.idNo,
      currentAddress: customer?.currentAddress,
    }
  }

  const [newRiskPositive, setNewRiskPositive] = useState('')
  const [newRiskNegative, setNewRiskNegative] = useState('')
  const [editingRiskSection, setEditingRiskSection] = useState(null)
  const [riskSectionDraft, setRiskSectionDraft] = useState([])

  const [showLoanInfoModal, setShowLoanInfoModal] = useState(false)
  const [loanInfoForm, setLoanInfoForm] = useState({ product: loan.product, amount: loan.amount?.toString() || '', interestRate: loan.interestRate?.toString() || '', installments: loan.installments?.toString() || '', creditOfficer: loan.creditOfficer || '', branch: loan.branch || 'Phnom Penh HQ' })

  // Loan Assessment tab: inline rate adjustment (left panel), separate from the Edit Loan Info modal
  // so tweaking rates here doesn't get tangled up with amount/term/officer edits.
  const [assessmentRateForm, setAssessmentRateForm] = useState({ interestRate: loan.interestRate?.toString() || '', installments: loan.installments?.toString() || '' })
  const [editingAssessmentRate, setEditingAssessmentRate] = useState(false)
  const [benefitFeeForm, setBenefitFeeForm] = useState(selectedFeeKeys)
  // Editable rate per configurable fee, seeded from the loan's effective rates.
  const [benefitRateForm, setBenefitRateForm] = useState(
    () => Object.fromEntries(relevantFeeRateFields.map(f => [f.key, f.rate.toString()]))
  )
  // Editable list of per-loan custom fees added in the Benefit Rate panel.
  const [benefitCustomFeesForm, setBenefitCustomFeesForm] = useState(
    () => (loan.customBenefitFees || []).map(f => ({ name: f.name || '', rate: (f.rate ?? '').toString(), included: f.included !== false }))
  )
  const [editingBenefitRate, setEditingBenefitRate] = useState(false)
  const [scheduleModalTerm, setScheduleModalTerm] = useState(null)
  // The term option's schedule sheet, for exporting it as a PDF / printing it on its own.
  const scheduleSheetRef = useRef(null)
  const [scheduleDownloading, setScheduleDownloading] = useState(false)
  const loanInfoProductMax = getProductMaxAmount(state.loanProducts.find(p => p.name === loanInfoForm.product), currency)
  const loanInfoAmountExceedsMax = loanInfoProductMax && parseFloat(loanInfoForm.amount) > loanInfoProductMax

  const [showIncomeModal, setShowIncomeModal] = useState(false)
  const [incomeTarget, setIncomeTarget] = useState('borrower')
  const [editingIncomeIdx, setEditingIncomeIdx] = useState(null)
  const [incomeOccupation, setIncomeOccupation] = useState('')
  const [incomeEmploymentStatus, setIncomeEmploymentStatus] = useState('')
  const [incomeStatusCategory, setIncomeStatusCategory] = useState('')
  const [incomeCompanyName, setIncomeCompanyName] = useState('')
  const [incomeCompanyAddress, setIncomeCompanyAddress] = useState('')
  const [incomeSources, setIncomeSources] = useState([{ label: '', amount: '' }])
  const [incomeDocuments, setIncomeDocuments] = useState([])
  const [incomeCompanyDocuments, setIncomeCompanyDocuments] = useState([])
  // Statement and payslip readings for this modal session, keyed by type and file name — see
  // handleIncomeFilesAdded for why they cannot go straight onto the document.
  const incomeAnalysisRef = useRef({})

  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [expenseTarget, setExpenseTarget] = useState('borrower')
  const [expenseItems, setExpenseItems] = useState([{ category: '', customCategory: '', notes: '', amount: '' }])
  // Categories the user added through "Add Category", plus any already sitting on the saved
  // expenses — both belong in the dropdown so a custom category can be picked like a listed one.
  const [expenseExtraCategories, setExpenseExtraCategories] = useState([])
  const [expenseDocuments, setExpenseDocuments] = useState([])
  // Statement readings for this modal session, keyed by file name — same reason as the income
  // modal's: TypedDocumentUpload hands over the raw File before the document list has it.
  const expenseAnalysisRef = useRef({})

  const [showCoBorrowerModal, setShowCoBorrowerModal] = useState(false)
  const [editingCoBorrowerIdx, setEditingCoBorrowerIdx] = useState(null)
  const [coBorrowerForm, setCoBorrowerForm] = useState(makePartyForm(null))
  const [coBorrowerDocuments, setCoBorrowerDocuments] = useState([])
  const [coBorrowerCustomerCode, setCoBorrowerCustomerCode] = useState('')

  const [showGuarantorModal, setShowGuarantorModal] = useState(false)
  const [editingGuarantorIdx, setEditingGuarantorIdx] = useState(null)
  const [guarantorForm, setGuarantorForm] = useState(makePartyForm(null))
  const [guarantorDocuments, setGuarantorDocuments] = useState([])
  const [guarantorCustomerCode, setGuarantorCustomerCode] = useState('')

  const [showCollateralModal, setShowCollateralModal] = useState(false)
  const [editingCollateralIdx, setEditingCollateralIdx] = useState(null)
  const [collateralForm, setCollateralForm] = useState(makeCollateralForm(null))
  const [collateralExtraTypes, setCollateralExtraTypes] = useState([])
  const [vehicleForm, setVehicleForm] = useState(makeVehicleForm(null))
  const [landForm, setLandForm] = useState(makeLandForm(null))
  const [houseForm, setHouseForm] = useState(makeHouseForm(null))
  const [collateralDocuments, setCollateralDocuments] = useState([])

  const [lightbox, setLightbox] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  // Which party's CBC the tab is showing. The two used to stack down one scroll, so reading
  // the co-borrower's report meant scrolling past the whole of the borrower's A4 sheet.
  const [cbcTarget, setCbcTarget] = useState('borrower')
  // The co-borrower only has a sub-tab once its section exists. `activeCbcTarget` is derived
  // rather than corrected in an effect, so removing the co-borrower while its tab is open
  // falls straight back to the borrower instead of rendering one frame against a party that
  // no longer has a section.
  const cbcTargets = ['borrower', ...(showCoBorrowerCbc ? ['coBorrower'] : [])]
  const activeCbcTarget = cbcTargets.includes(cbcTarget) ? cbcTarget : 'borrower'
  const cbcTabRefs = useRef({})

  // Arrow keys move between the parties and Home/End jump to the ends, which is what a tab
  // bar is expected to do once it is marked up as one — without it the roving tabindex below
  // would leave every tab but the active one unreachable from the keyboard.
  function handleCbcTabKey(e) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    let next = null
    if (e.key === 'Home') next = cbcTargets[0]
    else if (e.key === 'End') next = cbcTargets[cbcTargets.length - 1]
    else if (step) {
      const i = cbcTargets.indexOf(activeCbcTarget)
      next = cbcTargets[(i + step + cbcTargets.length) % cbcTargets.length]
    }
    if (!next) return
    e.preventDefault()
    setCbcTarget(next)
    cbcTabRefs.current[next]?.focus()
  }

  // All of this screen's modals are local component state, so App.jsx's global Escape
  // handler (which only knows about reducer state) can't reach them — this closes
  // whichever one is currently open.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      if (showLoanInfoModal) setShowLoanInfoModal(false)
      else if (showIncomeModal) setShowIncomeModal(false)
      else if (showExpenseModal) setShowExpenseModal(false)
      else if (showCoBorrowerModal) setShowCoBorrowerModal(false)
      else if (showGuarantorModal) setShowGuarantorModal(false)
      else if (showCollateralModal) setShowCollateralModal(false)
      else if (showApprovalModal) setShowApprovalModal(false)
      else if (lightbox) setLightbox(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [
    showLoanInfoModal, showIncomeModal, showExpenseModal, showCoBorrowerModal,
    showGuarantorModal, showCollateralModal, showApprovalModal, lightbox,
  ])

  function handleApprove() {
    // Only moves the loan into the Approval Review screen — it does NOT grant
    // approval itself. Final approval happens from the Approval Review screen,
    // and disbursement (with its required account number) only after that.
    const updatedLoan = {
      ...loan,
      status: 'Pending Approval',
      schedule,
      emi,
      approvalHistory: [
        ...(loan.approvalHistory || []),
        { stage: loan.approvalState || 1, action: 'Submitted for approval review', user: 'Admin', timestamp: new Date().toLocaleString('en-GB') },
      ],
    }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    dispatch({ type: 'OPEN_LOAN_OVERVIEW', loan: updatedLoan })
    showToast('Loan submitted for approval review', 'success')
    setShowApprovalModal(false)
  }

  function handleViewDoc(doc, isImage) {
    if (isImage && doc.dataUrl) {
      setLightbox(doc)
    } else if (doc.dataUrl) {
      const w = window.open()
      w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:0"></iframe>`)
    }
  }

  function handleLoanInfoProductChange(name) {
    const rate = state.loanProducts.find(p => p.name === name)?.rate
    setLoanInfoForm(p => ({ ...p, product: name, interestRate: rate !== undefined ? rate.toString() : p.interestRate }))
  }

  function openLoanInfoModal() {
    setLoanInfoForm({ product: loan.product, amount: loan.amount?.toString() || '', interestRate: loan.interestRate?.toString() || '', installments: loan.installments?.toString() || '', creditOfficer: loan.creditOfficer || '', branch: loan.branch || 'Phnom Penh HQ' })
    setShowLoanInfoModal(true)
  }

  function handleSaveLoanInfo() {
    const amt = parseFloat(loanInfoForm.amount)
    const rate = parseFloat(loanInfoForm.interestRate)
    const term = parseInt(loanInfoForm.installments, 10)
    if (!amt || amt <= 0) { showToast('Please enter a valid loan amount', 'error'); return }
    const selectedProduct = state.loanProducts.find(p => p.name === loanInfoForm.product)
    const maxAmount = getProductMaxAmount(selectedProduct, currency)
    if (maxAmount && amt > maxAmount) {
      showToast(`Loan amount exceeds the maximum of ${formatVal(maxAmount, currency, 1)} for ${loanInfoForm.product}`, 'error')
      return
    }
    if (!rate || rate <= 0) { showToast('Please enter a valid interest rate', 'error'); return }
    if (!term || term <= 0) { showToast('Please enter a valid number of installments', 'error'); return }

    const { emi: newEmi, rows } = buildAmortizationData(amt, rate, term, loan.firstInstallment)
    const updatedLoan = {
      ...loan,
      product: loanInfoForm.product,
      amount: amt,
      interestRate: rate,
      installments: term,
      termSelected: true,
      creditOfficer: loanInfoForm.creditOfficer,
      branch: loanInfoForm.branch,
      emi: newEmi,
      schedule: mergeSchedule(rows, loan.schedule),
    }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Overview', 'Loan info updated',
      `${loanInfoForm.product} · ${formatVal(amt, currency, 1)} · ${rate}% · ${term} months · ${loanInfoForm.creditOfficer || '—'} · ${loanInfoForm.branch}`)
    showToast('Loan info updated', 'success')
    setShowLoanInfoModal(false)
  }

  function handleApplyTerm(term) {
    const { emi: newEmi, rows } = buildAmortizationData(loan.amount, loan.interestRate, term, loan.firstInstallment)
    const updatedLoan = {
      ...loan,
      installments: term,
      termSelected: true,
      emi: newEmi,
      schedule: mergeSchedule(rows, loan.schedule),
    }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Loan Assessment', 'Installment term applied', `${term} months · EMI ${formatVal(newEmi, currency, 1)}`)
    showToast(`Installment term updated to ${term} months`, 'success')
  }

  function handleSaveAssessmentRate() {
    const rate = parseFloat(assessmentRateForm.interestRate)
    if (!rate || rate <= 0) { showToast('Please enter a valid interest rate', 'error'); return }
    const term = parseInt(assessmentRateForm.installments, 10)
    if (!term || term <= 0) { showToast('Please select a valid installment term', 'error'); return }
    const { emi: newEmi, rows } = buildAmortizationData(loan.amount, rate, term, loan.firstInstallment)
    const updatedLoan = { ...loan, interestRate: rate, installments: term, termSelected: true, emi: newEmi, schedule: mergeSchedule(rows, loan.schedule) }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Loan Assessment', 'Interest rate and term changed', `${rate}% p.a. · ${term} months`)
    showToast('Loan product rate updated', 'success')
    setEditingAssessmentRate(false)
  }

  function handleSaveBenefitRates() {
    // Persist the ticked fees (ordered to match the configurable fee list) plus the per-loan
    // rate overrides. Rates are clamped to >= 0.
    const ordered = relevantFeeRateFields.map(f => f.key).filter(k => benefitFeeForm.includes(k))
    const rates = Object.fromEntries(
      relevantFeeRateFields.map(f => [f.key, Math.max(0, parseFloat(benefitRateForm[f.key]) || 0)])
    )
    // Keep only named custom fees, clamping rates to >= 0.
    const custom = benefitCustomFeesForm
      .filter(f => f.name.trim())
      .map(f => ({ name: f.name.trim(), rate: Math.max(0, parseFloat(f.rate) || 0), included: f.included !== false }))
    dispatch({ type: 'UPDATE_LOAN', loan: { ...loan, benefitFeeKeys: ordered, benefitFeeRates: rates, customBenefitFees: custom } })
    logActivity('Loan Assessment', 'Benefit fees updated',
      `${ordered.length} built-in fee${ordered.length === 1 ? '' : 's'} applied, ${custom.length} custom`)
    showToast('Benefit fees updated', 'success')
    setEditingBenefitRate(false)
  }

  function handleCancelAssessmentRate() {
    setAssessmentRateForm({ interestRate: loan.interestRate?.toString() || '', installments: loan.installments?.toString() || '' })
    setEditingAssessmentRate(false)
  }

  function handleCancelBenefitRates() {
    setBenefitFeeForm(selectedFeeKeys)
    setBenefitRateForm(Object.fromEntries(relevantFeeRateFields.map(f => [f.key, f.rate.toString()])))
    setBenefitCustomFeesForm((loan.customBenefitFees || []).map(f => ({ name: f.name || '', rate: (f.rate ?? '').toString(), included: f.included !== false })))
    setEditingBenefitRate(false)
  }

  // The term option's schedule is a paper document — the same A4 sheet the modal shows — so it
  // leaves as a paged PDF of that sheet rather than a CSV of the bare numbers. The term is kept
  // in the filename: several options can be exported for the same loan while comparing them.
  async function handleDownloadTermSchedule(opt) {
    if (scheduleDownloading) return
    setScheduleDownloading(true)
    try {
      await downloadSheetPdf(scheduleSheetRef.current, `Repayment-Schedule-${loan.ref || 'loan'}-${opt.term}mo`)
    } finally {
      setScheduleDownloading(false)
    }
  }

  // Records what was just done and which tab it was done from, so the Audit Log answers
  // "who changed this loan, where, and when" rather than only tracking approval stages.
  // Called after the dispatch that actually changed something, never before — an entry for
  // an edit that was rejected by a guard would be a lie in the trail.
  function logActivity(section, entry, detail) {
    dispatch({ type: 'ADD_LOAN_ACTIVITY', ref: loan.ref, entry: { section, action: entry, detail: detail || '' } })
  }

  function updateCreditHistory(target, patch) {
    dispatch({ type: 'PATCH_LOAN_FIELD', ref: loan.ref, field: CREDIT_HISTORY_FIELD[target], patch })
  }

  // Everything a CBC report tells us is read out of the uploaded PDF, so removing the
  // file has to take its figures and account blocks with it — otherwise the sheet would
  // keep showing bureau data with no report on file to back it.
  // Writes a party's report list back, and mirrors the newest report's figures onto the
  // record itself: the risk assessment and the CBC summary cards elsewhere read one flat
  // set of fields, and `documents` is what every other view treats as "a report is on
  // file", so both are kept in step with the list.
  function commitCbcReports(target, reports) {
    const newest = reports[0]
    const patch = { reports, documents: reports.map(r => r.document).filter(Boolean) }
    CBC_PARSED_FIELDS.forEach(field => { patch[field] = newest ? newest[field] : undefined })
    updateCreditHistory(target, patch)
  }

  function handleRemoveCbcReport(target, index) {
    const removed = cbcReportsOf(loan[CREDIT_HISTORY_FIELD[target]])[index]
    commitCbcReports(target, cbcReportsOf(loan[CREDIT_HISTORY_FIELD[target]]).filter((_, i) => i !== index))
    logActivity('CBC', `${CREDIT_HISTORY_LABEL[target]} CBC report removed`, removed?.document?.name || `Report ${index + 1}`)
  }

  function openCbcFilePicker(target) {
    cbcUploadTargetRef.current = target
    cbcFileInputRef.current?.click()
  }

  // Each picked file is read as its own bureau report and added to the party's list,
  // newest first. Anything the reader doesn't recognise as a CBC report — a scan, or some
  // other document altogether — is reported and left out rather than filed as a report
  // with nothing in it.
  async function handleCbcFilePicked(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return
    const target = cbcUploadTargetRef.current

    const added = []
    let unreadable = 0
    for (const file of files) {
      const parsed = await extractCbcSummary(file)
      if (Object.keys(parsed).length === 0) {
        unreadable += 1
        continue
      }
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target.result)
        reader.readAsDataURL(file)
      })
      added.push({
        ...parsed,
        document: { name: file.name, size: formatFileSize(file.size), mimeType: file.type, dataUrl, docType: 'CBC Report' },
      })
    }

    if (unreadable > 0) {
      showToast(`${unreadable} file${unreadable === 1 ? '' : 's'} could not be read as a CBC report`, 'error')
    }
    if (added.length === 0) return

    // Newly added reports go to the front, so their sheets lead the row.
    commitCbcReports(target, [...added, ...cbcReportsOf(loan[CREDIT_HISTORY_FIELD[target]])])
    const accounts = added.reduce((sum, r) => sum + (r.accounts || []).length, 0)
    logActivity('CBC', `${CREDIT_HISTORY_LABEL[target]} CBC report uploaded`,
      `${added.map(r => r.document?.name).filter(Boolean).join(', ')} — ${accounts} credit account${accounts === 1 ? '' : 's'}`)
    showToast(`${added.length} CBC report${added.length === 1 ? '' : 's'} read — ${accounts} credit account${accounts === 1 ? '' : 's'}`, 'success')
  }

  // The sheet is a paper document; dark mode restyles it (the theme remaps bg-white and
  // the slate text colours), which has no business in a print-out or an exported PDF, so
  // the theme steps aside while the browser renders it.
  async function withLightTheme(run) {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    if (wasDark) root.classList.remove('dark')
    try {
      return await run()
    } finally {
      if (wasDark) root.classList.add('dark')
    }
  }

  // Where to cut the rasterised sheet into pages. Slicing blindly every page-height lands
  // the boundary wherever it falls — through the middle of an account block as often as
  // not. So the same units the print stylesheet keeps whole are measured off the live DOM
  // (`break-inside-avoid`, plus a heading and whatever follows it for `break-after-avoid`)
  // and a cut that would run through one is pulled back to that unit's top.
  // Returns [start, end] pairs in canvas pixels.
  function cbcPageCuts(element, canvas, pageHeightPx) {
    const sheet = element.getBoundingClientRect()
    const ratio = canvas.height / sheet.height
    const spanOf = (top, bottom) => ({ top: (top - sheet.top) * ratio, bottom: (bottom - sheet.top) * ratio })

    const units = Array.from(element.querySelectorAll('.break-inside-avoid')).map(el => {
      const r = el.getBoundingClientRect()
      return spanOf(r.top, r.bottom)
    })
    // A section band is only worth keeping whole together with the block under it.
    for (const el of element.querySelectorAll('.break-after-avoid')) {
      const r = el.getBoundingClientRect()
      const next = el.nextElementSibling
      units.push(spanOf(r.top, next ? next.getBoundingClientRect().bottom : r.bottom))
    }

    const cuts = []
    for (let offset = 0; offset < canvas.height;) {
      const limit = offset + pageHeightPx
      if (limit >= canvas.height) { cuts.push([offset, canvas.height]); break }
      // Of every unit the cut would run through, the highest one decides the page's end.
      const straddled = units.filter(u => u.top > offset && u.top < limit && u.bottom > limit)
      const pulled = straddled.length ? Math.floor(Math.min(...straddled.map(u => u.top))) : limit
      // A unit taller than a page can't be rescued, and pulling back to one that starts
      // near the top of the page would leave a near-empty sheet — cut at the page edge.
      const cut = pulled > offset + pageHeightPx * 0.15 ? pulled : limit
      cuts.push([offset, cut])
      offset = cut
    }
    return cuts
  }

  async function handleCbcDownloadPdf(sheetKey, target, report) {
    const element = cbcSheetRefs.current[sheetKey]
    if (!element || cbcDownloading) return
    setCbcDownloading(sheetKey)
    try {
      // jsPDF's own text rendering carries no Khmer font — every label comes out as
      // garbled Latin glyphs — so the browser rasterises the sheet instead and the image
      // is cut into A4 pages.
      const canvas = await withLightTheme(() => html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true }))
      const pdf = new jsPDF('p', 'pt', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const pxPerPt = canvas.width / pageWidth
      // Head and foot margin on every page — the slices used to run edge to edge, so a
      // page began hard against the paper's top. Sides are left alone: the sheet carries
      // its own inner padding, which the raster already includes.
      const MARGIN_PT = 24
      const pageHeightPx = Math.floor((pageHeight - MARGIN_PT * 2) * pxPerPt)

      for (const [offset, end] of cbcPageCuts(element, canvas, pageHeightPx)) {
        const sliceHeight = end - offset
        const slice = document.createElement('canvas')
        slice.width = canvas.width
        slice.height = sliceHeight
        const ctx = slice.getContext('2d')
        // A page cut short to spare a block leaves the rest of the sheet white rather
        // than transparent, which JPEG would otherwise flatten to black.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, slice.width, slice.height)
        ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
        if (offset > 0) pdf.addPage()
        pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, MARGIN_PT, pageWidth, sliceHeight / pxPerPt)
      }

      // The report date keeps one party's several reports apart on disk.
      pdf.save(`CBC-Report-${CREDIT_HISTORY_LABEL[target]}-${loan.ref || 'loan'}${report?.reportDate ? `-${report.reportDate}` : ''}.pdf`)
    } finally {
      setCbcDownloading(null)
    }
  }

  function openCoBorrowerModal(idx = null) {
    const existing = idx !== null ? coBorrowers[idx] : null
    setEditingCoBorrowerIdx(idx)
    setCoBorrowerForm(makePartyForm(existing))
    setCoBorrowerDocuments(existing?.documents || [])
    setCoBorrowerCustomerCode(existing?.customerCode || '')
    setShowCoBorrowerModal(true)
  }

  function handleRemoveCoBorrower(idx) {
    const removed = coBorrowers[idx]
    const { coBorrower, ...loanRest } = loan
    const updatedLoan = { ...loanRest, coBorrowers: coBorrowers.filter((_, i) => i !== idx) }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Customer', 'Co-borrower removed', removed?.enName || `Co-borrower ${idx + 1}`)
    showToast('Co-borrower removed', 'success')
  }

  function handleSelectCoBorrowerCustomer(code) {
    setCoBorrowerCustomerCode(code)
    if (!code) return
    const picked = state.customers.find(c => c.code === code)
    if (!picked) return
    setCoBorrowerForm(prev => ({
      ...prev,
      khName: picked.khName || '',
      enName: picked.enName || '',
      dob: picked.dob || '',
      gender: picked.gender || 'Male',
      maritalStatus: picked.maritalStatus || 'Single',
      idType: picked.idType || 'National ID',
      idNo: picked.idNo || '',
      phone: picked.phone || '',
      email: picked.email || '',
      currentAddress: picked.currentAddress || { ...EMPTY_ADDRESS },
      permanentAddress: picked.permanentAddress || { ...EMPTY_ADDRESS },
    }))
  }

  function handleSaveCoBorrower() {
    const { khName, enName, ...rest } = coBorrowerForm
    const entry = {
      ...rest,
      khName: khName.trim(),
      enName: enName.trim().toUpperCase(),
      customerCode: coBorrowerCustomerCode || null,
      documents: coBorrowerDocuments,
    }
    const updatedCoBorrowers = editingCoBorrowerIdx !== null
      ? coBorrowers.map((c, i) => i === editingCoBorrowerIdx ? entry : c)
      : [...coBorrowers, entry]
    const { coBorrower, ...loanRest } = loan
    const updatedLoan = { ...loanRest, coBorrowers: updatedCoBorrowers }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Customer', editingCoBorrowerIdx !== null ? 'Co-borrower edited' : 'Co-borrower added',
      `${entry.enName || '—'} · ${entry.idType || '—'} ${entry.idNo || ''} · ${coBorrowerDocuments.length} document${coBorrowerDocuments.length === 1 ? '' : 's'}`)
    showToast('Co-borrower info updated', 'success')
    setShowCoBorrowerModal(false)
  }

  function openGuarantorModal(idx = null) {
    const existing = idx !== null ? guarantors[idx] : null
    setEditingGuarantorIdx(idx)
    setGuarantorForm(makePartyForm(existing))
    setGuarantorDocuments(existing?.documents || [])
    setGuarantorCustomerCode(existing?.customerCode || '')
    setShowGuarantorModal(true)
  }

  function handleRemoveGuarantor(idx) {
    const removed = guarantors[idx]
    const { guarantor, ...loanRest } = loan
    const updatedLoan = { ...loanRest, guarantors: guarantors.filter((_, i) => i !== idx) }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Customer', 'Guarantor removed', removed?.enName || `Guarantor ${idx + 1}`)
    showToast('Guarantor removed', 'success')
  }

  function handleSelectGuarantorCustomer(code) {
    setGuarantorCustomerCode(code)
    if (!code) return
    const picked = state.customers.find(c => c.code === code)
    if (!picked) return
    setGuarantorForm(prev => ({
      ...prev,
      khName: picked.khName || '',
      enName: picked.enName || '',
      dob: picked.dob || '',
      gender: picked.gender || 'Male',
      maritalStatus: picked.maritalStatus || 'Single',
      idType: picked.idType || 'National ID',
      idNo: picked.idNo || '',
      phone: picked.phone || '',
      email: picked.email || '',
      currentAddress: picked.currentAddress || { ...EMPTY_ADDRESS },
      permanentAddress: picked.permanentAddress || { ...EMPTY_ADDRESS },
    }))
  }

  function handleSaveGuarantor() {
    const { khName, enName, ...rest } = guarantorForm
    const entry = {
      ...rest,
      khName: khName.trim(),
      enName: enName.trim().toUpperCase(),
      customerCode: guarantorCustomerCode || null,
      documents: guarantorDocuments,
    }
    const updatedGuarantors = editingGuarantorIdx !== null
      ? guarantors.map((g, i) => i === editingGuarantorIdx ? entry : g)
      : [...guarantors, entry]
    const { guarantor, ...loanRest } = loan
    const updatedLoan = { ...loanRest, guarantors: updatedGuarantors }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Customer', editingGuarantorIdx !== null ? 'Guarantor edited' : 'Guarantor added',
      `${entry.enName || '—'} · ${entry.idType || '—'} ${entry.idNo || ''} · ${guarantorDocuments.length} document${guarantorDocuments.length === 1 ? '' : 's'}`)
    showToast('Guarantor info updated', 'success')
    setShowGuarantorModal(false)
  }

  function openCollateralModal(idx = null) {
    const existing = idx !== null ? collaterals[idx] : null
    setEditingCollateralIdx(idx)
    setCollateralForm(makeCollateralForm(existing))
    setVehicleForm(makeVehicleForm(existing?.vehicleInfo))
    setLandForm(makeLandForm(existing?.landInfo))
    setHouseForm(makeHouseForm(existing?.houseInfo))
    setCollateralDocuments(existing?.documents || [])
    setShowCollateralModal(true)
  }

  // Picking a listed type drops whatever custom name was being typed, so the
  // "Add Type" button comes back clean the next time "Other" is chosen.
  function updateCollateralType(value) {
    setCollateralForm(p => ({ ...p, type: value, ...(value !== 'Other' ? { customType: '', addingType: false } : {}) }))
  }

  // A typed-in type joins the dropdown and is selected on the form, so from here on it reads
  // and behaves exactly like one of the listed types.
  function commitCollateralType() {
    const name = collateralForm.customType?.trim()
    if (!name) {
      setCollateralForm(p => ({ ...p, addingType: false }))
      return
    }
    const existing = collateralTypeOptions.find(t => t.toLowerCase() === name.toLowerCase())
    if (!existing) setCollateralExtraTypes(prev => [...prev, name])
    setCollateralForm(p => ({ ...p, type: existing || name, customType: '', addingType: false }))
  }

  function cancelCollateralType() {
    setCollateralForm(p => ({ ...p, customType: '', addingType: false }))
  }

  // "Other" stays last in the list, with the added types sitting just above it.
  const collateralTypeOptions = [...COLLATERAL_TYPES, ...collateralExtraTypes, 'Other']

  function handleSaveCollateral() {
    const resolvedType = resolveCollateralType(collateralForm)
    if (!resolvedType || resolvedType === 'Other') {
      showToast('Please select a collateral type', 'error')
      return
    }
    const value = parseFloat(collateralForm.value) || 0
    const ltvRatio = value > 0 && loan.amount ? (loan.amount / value) * 100 : undefined
    const entry = {
      type: resolvedType,
      value: collateralForm.value,
      appraisedValue: collateralForm.appraisedValue,
      forcedSaleValue: collateralForm.forcedSaleValue,
      docNo: collateralForm.docNo,
      registrationStatus: collateralForm.registrationStatus,
      ltvRatio,
      documents: collateralDocuments,
    }
    if (collateralForm.type === 'Vehicle') entry.vehicleInfo = vehicleForm
    if (collateralForm.type === 'Land') entry.landInfo = landForm
    if (collateralForm.type === 'House') entry.houseInfo = houseForm

    const updatedCollaterals = editingCollateralIdx !== null
      ? collaterals.map((c, i) => i === editingCollateralIdx ? entry : c)
      : [...collaterals, entry]
    const { collateral, ...loanRest } = loan
    const updatedLoan = { ...loanRest, collaterals: updatedCollaterals }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Collateral', editingCollateralIdx !== null ? 'Collateral edited' : 'Collateral added',
      `${resolvedType} · ${formatVal(value, currency, 1)}${ltvRatio ? ` · LTV ${ltvRatio.toFixed(1)}%` : ''}`)
    showToast('Collateral info updated', 'success')
    setShowCollateralModal(false)
  }

  function handleRemoveCollateral(idx) {
    const removed = collaterals[idx]
    const { collateral, ...loanRest } = loan
    const updatedLoan = { ...loanRest, collaterals: collaterals.filter((_, i) => i !== idx) }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Collateral', 'Collateral removed',
      `${removed?.type || 'Collateral'} · ${formatVal(parseFloat(removed?.value) || 0, currency, 1)}`)
    showToast('Collateral removed', 'success')
  }

  function getIncomeList(target) {
    return target === 'borrower' ? borrowerIncomes : (target === 'coBorrower' ? coBorrowerIncomes : guarantorIncomes)
  }

  function openIncomeModal(target, idx = null) {
    const info = idx !== null ? getIncomeList(target)[idx] : null
    setIncomeTarget(target)
    setEditingIncomeIdx(idx)
    setIncomeOccupation(info?.occupation || '')
    setIncomeEmploymentStatus(info?.employmentStatus || '')
    setIncomeStatusCategory(BUSINESS_OCCUPATIONS.includes(info?.occupation) ? 'Business' : (info?.employmentStatus || ''))
    setIncomeCompanyName(info?.companyName || '')
    setIncomeCompanyAddress(info?.companyAddress || '')
    setIncomeSources(info?.sources?.length ? info.sources.map(s => ({ ...s })) : [{ label: '', amount: '' }])
    setIncomeDocuments((info?.documents || []).map(d => typeof d === 'string' ? { name: d, docType: 'Other', size: '' } : d))
    setIncomeCompanyDocuments((info?.companyDocuments || []).map(d => typeof d === 'string' ? { name: d, docType: 'Other', size: '' } : d))
    incomeAnalysisRef.current = {}
    setShowIncomeModal(true)
  }

  // A bank statement and a payslip are the two income documents the app can actually read, so
  // each newly picked file of either type is parsed as soon as it is chosen and the reading
  // reported straight back rather than waiting for a save. Every other type has only its file
  // name to go on and needs nothing here.
  //
  // The reading is held by type and file name until save, because TypedDocumentUpload hands over
  // the raw File before it has finished reading it into the document list.
  async function handleIncomeFilesAdded(docType, files) {
    if (docType === 'Bank Statement') await readIncomeStatements(files)
    else if (docType === 'Payslips') await readIncomePayslips(files)
  }

  // The certificate of employment is filed under the company documents rather than the income
  // proofs, so it comes in through its own uploader — but it is read on the same terms: what it
  // says about the employment is on the page, and the file name is not evidence of anything.
  async function handleIncomeCompanyFilesAdded(docType, files) {
    if (docType !== 'Certificate of Employment') return
    for (const file of files) {
      const analysis = await parseEmploymentCert(file)
      if (!analysis) {
        showToast(`${file.name} has no readable text — check the employer and the name on it by hand`, 'info')
        continue
      }
      incomeAnalysisRef.current[`Certificate of Employment:${file.name}`] = analysis
      setIncomeCompanyDocuments(prev => prev.map(d => (
        d.name === file.name && d.docType === 'Certificate of Employment' ? { ...d, analysis } : d
      )))
      const found = [
        analysis.employer && `issued by ${analysis.employer}`,
        analysis.employee && `certifies ${analysis.employee}`,
        analysis.position,
      ].filter(Boolean).join(' · ')
      showToast(found ? `${file.name}: ${found}` : `${file.name}: read, but it names no employer or employee`, found ? 'success' : 'info')
    }
  }

  // The issuing bank comes off the statement's own header — it is never asked for, so a
  // statement that names no bank the reader knows simply has none recorded.
  async function readIncomeStatements(files) {
    for (const file of files) {
      const analysis = await parseBankStatement(file)
      if (!analysis) {
        showToast(`${file.name} carries no readable transaction table — enter the income manually`, 'info')
        continue
      }
      incomeAnalysisRef.current[`Bank Statement:${file.name}`] = analysis
      setIncomeDocuments(prev => prev.map(d => (
        d.name === file.name && d.docType === 'Bank Statement' ? { ...d, analysis, bank: analysis.bank || '' } : d
      )))
      showToast(
        `${file.name}: ${formatVal(analysis.averageMonthlyCredits, currency, 1)} average monthly income detected`
        + (analysis.bank ? ` · ${analysis.bank}` : ''),
        'success',
      )
    }
  }

  // A payslip states its pay outright, so what is reported back is the figure it states and
  // which one it is — a gross figure verifies nothing on its own, and the officer is better told
  // that at upload than left to find it in the verification table.
  async function readIncomePayslips(files) {
    for (const file of files) {
      const analysis = await parsePayslip(file)
      const reading = derivePayslipIncome(analysis)
      if (!reading) {
        showToast(`${file.name}: no pay figure could be read off it — enter the income manually`, 'info')
        continue
      }
      incomeAnalysisRef.current[`Payslips:${file.name}`] = analysis
      setIncomeDocuments(prev => prev.map(d => (
        d.name === file.name && d.docType === 'Payslips' ? { ...d, analysis } : d
      )))
      showToast(
        `${file.name}: ${formatVal(reading.monthly, currency, 1)}/month ${reading.basis} pay detected`
        + (reading.multiplier !== 1 ? ` (${reading.frequency} payslip)` : ''),
        reading.basis === 'net' ? 'success' : 'info',
      )
    }
  }

  function addIncomeSource() {
    setIncomeSources(prev => [...prev, { label: '', amount: '' }])
  }

  function updateIncomeSource(idx, field, value) {
    setIncomeSources(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  function removeIncomeSource(idx) {
    setIncomeSources(prev => prev.filter((_, i) => i !== idx))
  }

  // Editing an income entry replaces the whole record, so the verification review attached
  // to it is carried across by hand. A decision that was recorded against a different
  // declared figure no longer stands, so changing the total sends the entry back for review.
  function carryVerification(previous, newTotal) {
    if (!previous?.verification) return undefined
    const v = previous.verification
    const settled = [VERIFY_STATUS.verified, VERIFY_STATUS.rejected, VERIFY_STATUS.flagged].includes(v.status)
    if (!settled || (previous.totalMonthlyIncome || 0) === newTotal) return v
    const now = new Date()
    return {
      ...v,
      status: VERIFY_STATUS.unverified,
      history: [
        ...(v.history || []),
        {
          at: now.toISOString(),
          timestamp: now.toLocaleString('en-GB'),
          status: VERIFY_STATUS.unverified,
          performedBy: 'Admin',
          role: 'Credit Officer',
          notes: 'Declared income changed after review — sent back for verification',
          party: INCOME_LABEL[incomeTarget],
        },
      ],
    }
  }

  // Readings taken during this modal session, put back onto the documents they were read off.
  function withPendingAnalyses(docs) {
    return docs.map(d => {
      const pending = d.analysis ? null : incomeAnalysisRef.current[`${d.docType}:${d.name}`]
      if (!pending) return d
      // Only a statement carries an issuing bank; nothing else has anything for that column.
      return d.docType === 'Bank Statement'
        ? { ...d, analysis: pending, bank: pending.bank || d.bank || '' }
        : { ...d, analysis: pending }
    })
  }

  function handleSaveIncome() {
    const cleanedSources = incomeSources.filter(s => s.amount !== '' && s.amount != null)
    const total = cleanedSources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
    const entry = {
      occupation: incomeOccupation,
      employmentStatus: incomeEmploymentStatus,
      companyName: incomeCompanyName,
      companyAddress: incomeCompanyAddress,
      sources: cleanedSources,
      totalMonthlyIncome: total,
      // A document parsed during this session may have finished reading after the list it belongs
      // to was last written, so the readings are merged in here rather than relied on having
      // landed on the document already.
      documents: withPendingAnalyses(incomeDocuments),
      companyDocuments: withPendingAnalyses(incomeCompanyDocuments),
    }
    const list = getIncomeList(incomeTarget)
    const updatedList = editingIncomeIdx !== null
      ? list.map((it, i) => i === editingIncomeIdx ? { ...entry, verification: carryVerification(it, total) } : it)
      : [...list, entry]
    const { [INCOME_FIELD[incomeTarget]]: legacyRemoved, ...loanRest } = loan
    const updatedLoan = { ...loanRest, [INCOME_LIST_FIELD[incomeTarget]]: updatedList }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Income Verification',
      `${INCOME_LABEL[incomeTarget]} income ${editingIncomeIdx !== null ? 'edited' : 'added'}`,
      [entry.occupation || entry.employmentStatus, entry.companyName,
        `${formatVal(total, currency, 1)}/month from ${cleanedSources.length} source${cleanedSources.length === 1 ? '' : 's'}`,
      ].filter(Boolean).join(' · '))
    showToast(`${INCOME_LABEL[incomeTarget]} income updated`, 'success')
    setShowIncomeModal(false)
  }

  function handleRemoveIncome(target, idx) {
    const list = getIncomeList(target)
    const removed = list[idx]
    const { [INCOME_FIELD[target]]: legacyRemoved, ...loanRest } = loan
    dispatch({ type: 'UPDATE_LOAN', loan: { ...loanRest, [INCOME_LIST_FIELD[target]]: list.filter((_, i) => i !== idx) } })
    logActivity('Income Verification', `${INCOME_LABEL[target]} income removed`,
      [removed?.occupation || removed?.employmentStatus, removed?.companyName,
        removed?.totalMonthlyIncome != null ? `${formatVal(removed.totalMonthlyIncome, currency, 1)}/month` : null,
      ].filter(Boolean).join(' · ') || `Entry ${idx + 1}`)
    showToast(`${INCOME_LABEL[target]} income removed`, 'success')
  }

  function openExpenseModal(target) {
    const info = loan[EXPENSE_FIELD[target]]
    setExpenseTarget(target)
    const stored = info?.expenses || []
    setExpenseExtraCategories([...new Set(
      stored.map(e => e.category).filter(c => c && !EXPENSE_CATEGORIES.includes(c))
    )])
    setExpenseItems(
      stored.length
        ? stored.map(e => ({ ...e, customCategory: '' }))
        : [{ category: '', customCategory: '', notes: '', amount: '' }]
    )
    setExpenseDocuments((info?.documents || []).map(d => typeof d === 'string' ? { name: d, docType: 'Other', size: '' } : d))
    expenseAnalysisRef.current = {}
    setShowExpenseModal(true)
  }

  // The bank statement is the only expense document asked for, and the whole point of it is the
  // money out — so each newly picked statement is read for its per-month spending as soon as it
  // is chosen, and the reader's figure is reported straight back rather than waiting for a save.
  async function handleExpenseFilesAdded(docType, files) {
    if (docType !== 'Bank Statement') return
    for (const file of files) {
      const analysis = await parseBankStatement(file)
      if (!analysis) {
        showToast(`${file.name} carries no readable transaction table — enter the expenses manually`, 'info')
        continue
      }
      expenseAnalysisRef.current[file.name] = analysis
      setExpenseDocuments(prev => prev.map(d => (
        d.name === file.name && d.docType === 'Bank Statement' ? { ...d, analysis, bank: analysis.bank || '' } : d
      )))
      const reading = deriveStatementExpense(analysis)
      showToast(
        reading?.total
          ? `${file.name}: ${formatVal(reading.total, currency, 1)} out over ${reading.monthsCount} month${reading.monthsCount === 1 ? '' : 's'}`
            + ` · ${formatVal(reading.monthlySpend, currency, 1)}/month`
            + (analysis.bank ? ` · ${analysis.bank}` : '')
          : `${file.name}: no money out could be read off it`,
        reading?.total ? 'success' : 'info',
      )
    }
  }

  function addExpenseItem() {
    setExpenseItems(prev => [...prev, { category: '', customCategory: '', notes: '', amount: '' }])
  }

  function updateExpenseItem(idx, field, value) {
    setExpenseItems(prev => prev.map((e, i) => {
      if (i !== idx) return e
      const next = { ...e, [field]: value }
      // Picking a listed category drops whatever custom name was being typed, so the
      // "Add Category" button comes back clean the next time "Other" is chosen.
      if (field === 'category' && value !== 'Other') {
        next.customCategory = ''
        next.addingCategory = false
      }
      return next
    }))
  }

  function removeExpenseItem(idx) {
    setExpenseItems(prev => prev.filter((_, i) => i !== idx))
  }

  // A typed-in category joins the dropdown and is selected on the row, so from here on it reads
  // and behaves exactly like one of the listed categories.
  function commitExpenseCategory(idx) {
    const name = expenseItems[idx]?.customCategory?.trim()
    if (!name) {
      updateExpenseItem(idx, 'addingCategory', false)
      return
    }
    const existing = expenseCategoryOptions.find(c => c.toLowerCase() === name.toLowerCase())
    if (!existing) setExpenseExtraCategories(prev => [...prev, name])
    setExpenseItems(prev => prev.map((e, i) => (
      i === idx ? { ...e, category: existing || name, customCategory: '', addingCategory: false } : e
    )))
  }

  function cancelExpenseCategory(idx) {
    setExpenseItems(prev => prev.map((e, i) => (
      i === idx ? { ...e, customCategory: '', addingCategory: false } : e
    )))
  }

  const expenseItemsTotal = expenseItems.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

  // "Other" stays last in the list, with the added categories sitting just above it.
  const expenseCategoryOptions = [
    ...EXPENSE_CATEGORIES.filter(c => c !== 'Other'),
    ...expenseExtraCategories,
    'Other',
  ]

  function handleSaveExpense() {
    const resolvedExpenses = expenseItems.map(e => ({ category: resolveCategory(e), notes: e.notes, amount: e.amount }))
    const cleanedExpenses = resolvedExpenses.filter(e => e.category.trim() || e.notes.trim() || e.amount)
    const total = cleanedExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
    const updatedLoan = {
      ...loan,
      [EXPENSE_FIELD[expenseTarget]]: {
        expenses: cleanedExpenses,
        totalMonthlyExpense: total,
        // A statement parsed during this session may have finished reading after the document
        // list was last written, so the readings are merged in here rather than relied on having
        // landed on the document already.
        documents: expenseDocuments.map(d => {
          const pending = d.docType === 'Bank Statement' && !d.analysis ? expenseAnalysisRef.current[d.name] : null
          return pending ? { ...d, analysis: pending, bank: pending.bank || d.bank || '' } : d
        }),
      },
    }
    dispatch({ type: 'UPDATE_LOAN', loan: updatedLoan })
    logActivity('Expense Verification', `${EXPENSE_LABEL[expenseTarget]} expenses updated`,
      `${cleanedExpenses.length} item${cleanedExpenses.length === 1 ? '' : 's'} · ${formatVal(total, currency, 1)}/month`)
    showToast(`${EXPENSE_LABEL[expenseTarget]} expense updated`, 'success')
    setShowExpenseModal(false)
  }

  function handleRemoveExpense(target) {
    const { [EXPENSE_FIELD[target]]: removed, ...loanRest } = loan
    dispatch({ type: 'UPDATE_LOAN', loan: loanRest })
    logActivity('Expense Verification', `${EXPENSE_LABEL[target]} expenses removed`,
      removed?.totalMonthlyExpense != null ? `${formatVal(removed.totalMonthlyExpense, currency, 1)}/month` : '')
    showToast(`${EXPENSE_LABEL[target]} expense removed`, 'success')
  }

  function handleRemoveCoBorrowerCbc() {
    const { [CREDIT_HISTORY_FIELD.coBorrower]: removed, ...loanRest } = loan
    dispatch({ type: 'UPDATE_LOAN', loan: loanRest })
    setShowCoBorrowerCbc(false)
    logActivity('CBC', 'Co-Borrower CBC removed',
      `${cbcReportsOf(removed).length} report${cbcReportsOf(removed).length === 1 ? '' : 's'} dropped`)
    showToast('Co-Borrower CBC removed', 'success')
  }

  function addManualRiskFactor(type, text) {
    if (!text.trim()) return
    const current = loan.manualRiskFactors?.[type] || []
    dispatch({ type: 'PATCH_LOAN_FIELD', ref: loan.ref, field: 'manualRiskFactors', patch: { [type]: [...current, text.trim()] } })
    logActivity('Risk Assessment', `Manual ${type === 'positives' ? 'positive' : 'negative'} factor added`, text.trim())
  }

  function removeManualRiskFactor(type, index) {
    const current = loan.manualRiskFactors?.[type] || []
    dispatch({ type: 'PATCH_LOAN_FIELD', ref: loan.ref, field: 'manualRiskFactors', patch: { [type]: current.filter((_, i) => i !== index) } })
    logActivity('Risk Assessment', `Manual ${type === 'positives' ? 'positive' : 'negative'} factor removed`, current[index] || '')
  }

  function startRiskSectionEdit(type, manual) {
    setEditingRiskSection(type)
    setRiskSectionDraft([...manual])
  }

  function saveRiskSectionEdit(type) {
    const cleaned = riskSectionDraft.map(v => v.trim()).filter(Boolean)
    dispatch({ type: 'PATCH_LOAN_FIELD', ref: loan.ref, field: 'manualRiskFactors', patch: { [type]: cleaned } })
    logActivity('Risk Assessment', `Manual ${type === 'positives' ? 'positive' : 'negative'} factors edited`,
      `${cleaned.length} factor${cleaned.length === 1 ? '' : 's'} on file`)
    setEditingRiskSection(null)
    setRiskSectionDraft([])
  }

  function cancelRiskSectionEdit() {
    setEditingRiskSection(null)
    setRiskSectionDraft([])
  }

  // The audit trail is the approval workflow and the per-tab edits read as one list. They are
  // stored apart (see ADD_LOAN_ACTIVITY) because ApprovalTimeline walks approvalHistory to draw
  // the stages, but an officer asking "what happened to this loan" wants both in one column of
  // time. Sorted on the parsed timestamp rather than on array order: approvalHistory is oldest
  // first and activityLog newest first, so concatenating them alone would interleave wrongly.
  const auditEntries = useMemo(() => {
    const sortKey = ts => {
      const { date, time } = splitTimestamp(ts)
      // splitTimestamp handles both stored formats. "26/07/2026" has to be reordered to compare;
      // "2026-07-26" already sorts lexically.
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
    return [...fromApproval, ...fromActivity].sort((a, b) => sortKey(b.timestamp).localeCompare(sortKey(a.timestamp)))
  }, [loan.approvalHistory, loan.activityLog])

  const inputCls = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-[#0047ab] transition'
  const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1'

  return (
    <>
    <div className="p-4 sm:p-6 space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Loan Detail</h1>
            <StatusBadge status={loan.status} size="xs" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{loan.ref} · {loan.product} · {loan.customerName}</p>
        </div>
        {(loan.status === 'Pending Approval' || loan.status === 'In Progress') && (
          <button
            onClick={() => setShowApprovalModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#0047ab] hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors flex-shrink-0 w-full sm:w-auto"
          >
            <Send className="w-4 h-4" />
            Submit for Approval
          </button>
        )}
        {readyToDisburse && (
          <button
            onClick={handleGoToDisbursement}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors flex-shrink-0 w-full sm:w-auto"
          >
            <Wallet className="w-4 h-4" />
            Go to Disbursement
          </button>
        )}
      </div>

      {loan.status === 'Rejected' && loan.rejectionReason && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700">
          <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Rejected</p>
            <p className="text-xs text-rose-600 dark:text-rose-400/90 mt-0.5">{loan.rejectionReason}</p>
          </div>
        </div>
      )}
      {loan.status === 'Pending Approval' && loan.rejectionReason && (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Needs adjustment before resubmitting</p>
            <p className="text-xs text-amber-600 dark:text-amber-400/90 mt-0.5">{loan.rejectionReason}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
          {DETAIL_TABS.map((tab, i) => (
            i < DETAIL_TABS.length - 1 && (
              <button
                key={tab.label}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${activeTab === i ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          ))}
          <button
            onClick={() => setActiveTab(DETAIL_TABS.length - 1)}
            className={`ml-auto flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors flex-shrink-0 ${activeTab === DETAIL_TABS.length - 1 ? 'text-[#0047ab] dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            {(() => { const LastIcon = DETAIL_TABS[DETAIL_TABS.length - 1].icon; return <LastIcon className="w-3.5 h-3.5" /> })()}
            {DETAIL_TABS[DETAIL_TABS.length - 1].label}
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
        <div className="pt-0 px-6 pb-6 max-h-[65vh] overflow-y-auto">

        {activeTab === 0 && (
        /* Section 1: Loan Overview — main info at a glance */
        <div className="space-y-4 pt-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Loan Info</p>
            {!isDisbursed && (
              <button
                onClick={openLoanInfoModal}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Loan Info
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            {[
              { icon: FileText, label: 'Loan Product', value: loan.product },
              { icon: DollarSign, label: 'Loan Amount', value: formatVal(loan.amount, currency, 1) },
              { icon: TrendingUp, label: 'Interest Rate', value: `${loan.interestRate}% p.a.` },
              { icon: CreditCard, label: 'Installments', value: (loan.termSelected || isDisbursed) && loan.installments ? `${loan.installments} months` : 'Not selected' },
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
        </div>
        )}

        {activeTab === 1 && (
        /* Section 2: Customer (Borrower, Co-Borrower, Guarantor) */
        <div className="space-y-6">
          {!isDisbursed && (
            <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={() => openCoBorrowerModal(null)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Add Co-Borrower
              </button>
              <button
                onClick={() => openGuarantorModal(null)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Add Guarantor
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Borrower</span>
                <span className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">{customer?.code || loan.customerCode}</span>
              </div>
              {!isDisbursed && (
                <button
                  onClick={() => dispatch({ type: 'OPEN_CUSTOMER_WIZARD', code: customer?.code || loan.customerCode })}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" /> {customer ? 'Edit' : 'Add'}
                </button>
              )}
            </div>
            <div className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">Disbursement Account Number</span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{customer?.accountNumber || 'N/A'}</span>
              </div>
              <PersonInfoGrid
                personal={{ khName: customer?.khName || loan.customerKhName, enName: customer?.enName || loan.customerName, dob: customer?.dob, gender: customer?.gender, maritalStatus: customer?.maritalStatus }}
                contact={{ phone: customer?.phone || loan.customerPhone, email: customer?.email, currentAddress: formatAddress(customer?.currentAddress), permanentAddress: formatAddress(customer?.permanentAddress) }}
                identification={{ idNo: customer?.idNo, idType: customer?.idType }}
              />
              <div className="px-4 pb-4 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Identity Documents</p>
                <IdentityDocumentsTable docTypes={borrowerDocTypes} documents={customer?.documents} onView={handleViewDoc} />
              </div>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border-t border-slate-100 dark:border-slate-700 pt-4">
            <div className="px-4 py-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Co-Borrower{coBorrowers.length > 1 ? 's' : ''}</span>
            </div>
            <div className="p-4">
              {coBorrowers.length > 0 ? (
                <div className="space-y-4">
                  {coBorrowers.map((cb, idx) => (
                    <div key={idx} className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50/70 dark:bg-slate-900/30">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cb.enName || `Co-Borrower ${idx + 1}`}</span>
                          {cb.relation && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">{cb.relation}</span>
                          )}
                        </div>
                        {!isDisbursed && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openCoBorrowerModal(idx)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleRemoveCoBorrower(idx)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <PersonInfoGrid
                        personal={{ khName: cb.khName, enName: cb.enName, dob: cb.dob, gender: cb.gender, maritalStatus: cb.maritalStatus }}
                        contact={{ phone: cb.phone, email: cb.email, currentAddress: formatAddress(cb.currentAddress), permanentAddress: formatAddress(cb.permanentAddress) }}
                        identification={{ idNo: cb.idNo }}
                        showIdType={false}
                      />
                      <div className="p-3 pt-0 space-y-2">
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Identity Documents</p>
                          <IdentityDocumentsTable docTypes={partyDocTypes} documents={cb.documents} onView={handleViewDoc} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={User}
                  title="No co-borrower on this loan"
                  hint="A co-borrower shares the repayment obligation — their income and expenses join the assessment."
                >
                  {!isDisbursed && (
                    <button onClick={() => openCoBorrowerModal(null)} className={ghostBtnCls}>
                      <Plus className="w-3.5 h-3.5" /> Add Co-Borrower
                    </button>
                  )}
                </EmptyState>
              )}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border-t border-slate-100 dark:border-slate-700 pt-4">
            <div className="px-4 py-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Guarantor{guarantors.length > 1 ? 's' : ''}</span>
            </div>
            <div className="p-4">
              {guarantors.length > 0 ? (
                <div className="space-y-4">
                  {guarantors.map((g, idx) => (
                    <div key={idx} className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-50/70 dark:bg-slate-900/30">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{g.enName || `Guarantor ${idx + 1}`}</span>
                          {g.relation && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">{g.relation}</span>
                          )}
                        </div>
                        {!isDisbursed && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => openGuarantorModal(idx)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                            <button
                              onClick={() => handleRemoveGuarantor(idx)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <PersonInfoGrid
                        personal={{ khName: g.khName, enName: g.enName, dob: g.dob, gender: g.gender, maritalStatus: g.maritalStatus }}
                        contact={{ phone: g.phone, email: g.email, currentAddress: formatAddress(g.currentAddress), permanentAddress: formatAddress(g.permanentAddress) }}
                        identification={{ idNo: g.idNo }}
                        showIdType={false}
                      />
                      <div className="p-3 pt-0 space-y-2">
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Identity Documents</p>
                          <IdentityDocumentsTable docTypes={partyDocTypes} documents={g.documents} onView={handleViewDoc} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={ShieldAlert}
                  title="No guarantor on this loan"
                  hint="A guarantor backs the loan without borrowing — add one to record their details and identity documents."
                >
                  {!isDisbursed && (
                    <button onClick={() => openGuarantorModal(null)} className={ghostBtnCls}>
                      <Plus className="w-3.5 h-3.5" /> Add Guarantor
                    </button>
                  )}
                </EmptyState>
              )}
            </div>
          </div>
        </div>
        )}

        {activeTab === 2 && (
        /* Section 3: Credit History & Score (CBC) */
        <div className="space-y-4">
          {/* One sub-tab per party, marked up as a real tablist so arrow keys move between
              them and a screen reader announces the relationship to the sheet below. Which
              tab is active is derived rather than stored, so removing the co-borrower's CBC
              while its tab is open falls back to the borrower instead of leaving the panel
              pointed at a party that no longer has a section to show. */}
          <div className="flex items-end justify-between gap-3 flex-wrap border-b border-slate-200 dark:border-slate-700">
            <div role="tablist" aria-label="CBC report by party" onKeyDown={handleCbcTabKey} className="flex items-end gap-1 flex-wrap">
              {cbcTargets.map(t => {
                const count = cbcReportsOf(loan[CREDIT_HISTORY_FIELD[t]]).length
                const active = t === activeCbcTarget
                const person = resolveCbcPerson(t)
                return (
                  <button
                    key={t}
                    id={`cbc-tab-${t}`}
                    role="tab"
                    aria-selected={active}
                    aria-controls={`cbc-panel-${t}`}
                    // Roving tabindex: Tab reaches the bar, arrows move within it.
                    tabIndex={active ? 0 : -1}
                    ref={el => { cbcTabRefs.current[t] = el }}
                    onClick={() => setCbcTarget(t)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-t-xl border-b-2 -mb-px transition-colors ${
                      active
                        ? 'border-[#0047ab] dark:border-blue-400 bg-blue-50/60 dark:bg-blue-900/20'
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <div className="text-left min-w-0">
                      <span className={`block text-xs font-bold leading-tight ${
                        active ? 'text-[#0047ab] dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
                      }`}>
                        {CREDIT_HISTORY_LABEL[t]}
                      </span>
                      {/* Whose report this is. "Borrower" alone means checking somewhere else
                          to find out which person's credit history is on screen. */}
                      <span className="block text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate max-w-[9rem] leading-tight">
                        {person?.enName || 'Not on file'}
                      </span>
                    </div>
                    {/* A bare "0" reads as a score or an amount. Nothing on file is said in
                        words; a real count gets the pill. */}
                    {count > 0 ? (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
                        active
                          ? 'bg-[#0047ab] text-white dark:bg-blue-400 dark:text-slate-900'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {count}
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 flex-shrink-0">None</span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Adding the co-borrower creates a tab, so the action belongs beside the tabs
                rather than buried in the borrower's own toolbar where it used to sit. */}
            {!isDisbursed && !showCoBorrowerCbc && (
              <button
                onClick={() => { setShowCoBorrowerCbc(true); setCbcTarget('coBorrower') }}
                className="flex items-center gap-1 mb-2 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Co-Borrower
              </button>
            )}
          </div>
          {[activeCbcTarget].map(target => {
            const info = loan[CREDIT_HISTORY_FIELD[target]]
            const reports = cbcReportsOf(info)
            // Every report on file gets its own sheet, laid out side by side so several
            // can be read against each other without switching between them. With nothing
            // on file one sheet still shows, as an empty form — only its data waits for a
            // report. Download / Print / Remove act on a single report, so they sit on the
            // sheet they belong to rather than in the party's toolbar.
            const sheets = reports.length > 0 ? reports : [null]
            const multiple = sheets.length > 1
            return (
              /* No `overflow-hidden` here: it would make this box the sticky header's
                 scroll container and the header would never stick to the panel top. */
              <div
                key={target}
                id={`cbc-panel-${target}`}
                role="tabpanel"
                aria-labelledby={`cbc-tab-${target}`}
                tabIndex={0}
                className="rounded-xl focus:outline-none"
              >
                <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{CREDIT_HISTORY_LABEL[target]} CBC Report</span>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {multiple
                        ? `${reports.length} reports on file`
                        : reports[0]?.document?.name || (reports[0] ? 'CBC report' : 'No report uploaded')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!isDisbursed && (
                      <button
                        onClick={() => openCbcFilePicker(target)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" /> Upload CBC Report
                      </button>
                    )}
                    {!isDisbursed && target === 'coBorrower' && (
                      <button
                        onClick={handleRemoveCoBorrowerCbc}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove Co-Borrower
                      </button>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-4">
                  {/* One sheet per report, laid out as it appears on the CBC document, in a
                      row that scrolls sideways once a second report joins the first — an A4
                      sheet is already wider than most panels. The sheets are far taller than
                      the viewport, so StickyHScroll keeps that scrollbar at hand rather than
                      stranding it at the foot of the last page. */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/40 p-2 sm:p-5">
                    <StickyHScroll>
                      <div className={multiple ? 'flex items-start gap-5 min-w-max' : ''}>
                        {sheets.map((report, si) => {
                          const sheetKey = `${target}:${si}`
                          return (
                            <div key={sheetKey} className={multiple ? 'w-[210mm] flex-shrink-0' : ''}>
                              {/* This report's own caption and actions — with several sheets
                                  on screen they have to say which one they act on. */}
                              <div className="flex items-center justify-between gap-2 flex-wrap mb-2 px-1">
                                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate min-w-0">
                                  {report
                                    ? [report.reportDate ? formatDateDisplay(report.reportDate) : `Report ${si + 1}`, report.document?.name].filter(Boolean).join(' · ')
                                    : 'No report uploaded'}
                                </p>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <button
                                    onClick={() => handleCbcDownloadPdf(sheetKey, target, report)}
                                    disabled={cbcDownloading === sheetKey}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 transition-colors"
                                  >
                                    <Download className="w-3.5 h-3.5" /> {cbcDownloading === sheetKey ? 'Preparing…' : 'Download'}
                                  </button>
                                  <button
                                    onClick={() => setCbcPrintTarget(sheetKey)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                  >
                                    <Printer className="w-3.5 h-3.5" /> Print
                                  </button>
                                  {/* Dropping a report takes everything read out of it with it */}
                                  {!isDisbursed && report && (
                                    <button
                                      onClick={() => handleRemoveCbcReport(target, si)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" /> Remove Report
                                    </button>
                                  )}
                                </div>
                              </div>
                              <CBCReportDocument
                                info={report ? { ...report, documents: [report.document].filter(Boolean) } : null}
                                person={resolveCbcPerson(target)}
                                currency={currency}
                                docRef={el => { cbcSheetRefs.current[sheetKey] = el }}
                                printable={cbcPrintTarget === null || cbcPrintTarget === sheetKey}
                              />
                              {/* The sheet above is the app's own rendering of what was read
                                  out of the bureau report. The file the officer actually
                                  uploaded is kept under it, so the original can be opened and
                                  checked against the transcription — the same place every
                                  other section keeps its uploads. */}
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-1">Original File</p>
                                <IdentityDocumentsTable
                                  docTypes={['CBC Report']}
                                  documents={report?.document ? [report.document] : []}
                                  onView={handleViewDoc}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </StickyHScroll>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Backs the toolbar's Upload button for whichever party opened it */}
          <input
            ref={cbcFileInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={handleCbcFilePicked}
          />
        </div>
        )}

        {activeTab === 3 && (
        /* Section 3: Collateral */
        <div>
          {/* With nothing on file the empty state below already offers Add Collateral — a
              second copy pinned to the top would just repeat it, so the toolbar only appears
              once there is a collateral to add another alongside. */}
          {!isDisbursed && collaterals.length > 0 && (
            <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 flex items-center justify-end">
              <button
                onClick={() => openCollateralModal(null)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors"
              >
                Add Collateral
              </button>
            </div>
          )}
          <div className="p-4">
            {collaterals.length > 0 ? (
              <div className="space-y-4">
                {collaterals.map((item, idx) => {
                  const { ownerName, matchesBorrower } = getCollateralOwnerInfo(item)
                  const rows = [
                    { label: 'Type', value: item.type || 'N/A' },
                    { label: 'Registration Number', value: item.docNo || 'N/A' },
                    { label: 'Registration Status', value: item.registrationStatus || 'N/A' },
                    { label: 'Estimated Market Value', value: item.value ? formatVal(item.value, currency, 1) : 'N/A' },
                    { label: 'Appraised Value', value: item.appraisedValue ? formatVal(item.appraisedValue, currency, 1) : 'N/A' },
                    { label: 'Forced Sale Value', value: item.forcedSaleValue ? formatVal(item.forcedSaleValue, currency, 1) : 'N/A' },
                    { label: 'Loan-to-Value Ratio', value: item.ltvRatio ? `${item.ltvRatio.toFixed(1)}%` : 'N/A' },
                  ]
                  if (item.vehicleInfo) {
                    rows.push(
                      { label: 'Vehicle Make / Model', value: [item.vehicleInfo.make, item.vehicleInfo.model].filter(Boolean).join(' ') || 'N/A' },
                      { label: 'Year of Manufacture', value: item.vehicleInfo.year || 'N/A' },
                      { label: 'Plate Number', value: item.vehicleInfo.plateNumber || 'N/A' },
                      { label: 'Chassis / VIN Number', value: item.vehicleInfo.chassisNumber || 'N/A' },
                      { label: 'Engine Number', value: item.vehicleInfo.engineNumber || 'N/A' },
                      { label: 'Color', value: item.vehicleInfo.color || 'N/A' },
                      { label: 'Owner Name', value: item.vehicleInfo.ownerName || 'N/A' },
                      { label: 'Issue Date', value: item.vehicleInfo.issueDate || 'N/A' },
                      { label: 'Collateral Status', value: item.vehicleInfo.encumbranceStatus || 'N/A' },
                    )
                  }
                  if (item.landInfo) {
                    rows.push(
                      { label: 'Title Type', value: item.landInfo.titleType || 'N/A' },
                      { label: 'Title Number', value: item.landInfo.titleNumber || 'N/A' },
                      { label: 'Plot / Parcel Number', value: item.landInfo.plotNumber || 'N/A' },
                      { label: 'Land Area', value: item.landInfo.area ? `${item.landInfo.area} sqm` : 'N/A' },
                      { label: 'Land Use', value: item.landInfo.landUse || 'N/A' },
                      { label: 'Owner Name', value: item.landInfo.ownerName || 'N/A' },
                      { label: 'Location', value: formatAddress(item.landInfo.location) || 'N/A' },
                      { label: 'Issue Date', value: item.landInfo.issueDate || 'N/A' },
                      { label: 'Collateral Status', value: item.landInfo.encumbranceStatus || 'N/A' },
                    )
                  }
                  if (item.houseInfo) {
                    rows.push(
                      { label: 'House Type', value: item.houseInfo.houseType || 'N/A' },
                      { label: 'Construction Type', value: item.houseInfo.constructionType || 'N/A' },
                      { label: 'Number of Floors', value: item.houseInfo.floors || 'N/A' },
                      { label: 'Floor Area', value: item.houseInfo.floorArea ? `${item.houseInfo.floorArea} sqm` : 'N/A' },
                      { label: 'Land Area', value: item.houseInfo.landArea ? `${item.houseInfo.landArea} sqm` : 'N/A' },
                      { label: 'Year Built', value: item.houseInfo.yearBuilt || 'N/A' },
                      { label: 'Owner Name', value: item.houseInfo.ownerName || 'N/A' },
                      { label: 'Location', value: formatAddress(item.houseInfo.location) || 'N/A' },
                      { label: 'Issue Date', value: item.houseInfo.issueDate || 'N/A' },
                      { label: 'Collateral Status', value: item.houseInfo.encumbranceStatus || 'N/A' },
                    )
                  }
                  const collateralDocTypes = withUploadedDocTypes(getCollateralDocTypes(item.type), item.documents)
                  return (
                  <div key={idx} className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50/70 dark:bg-slate-900/30">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{item.type || `Collateral ${idx + 1}`}</span>
                      {!isDisbursed && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openCollateralModal(idx)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => handleRemoveCollateral(idx)}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> Remove
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6">
                        {rows.map((row, i) => (
                          <InfoRow key={i} label={row.label} value={row.value} />
                        ))}
                      </div>
                      {ownerName && (
                        <div className={`rounded-xl p-3 flex items-center justify-between ${matchesBorrower ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>
                          <div className="flex items-center gap-1.5">
                            <ShieldAlert className="w-4 h-4" />
                            <span className="text-xs font-semibold">Title Owner vs Borrower ({ownerName})</span>
                          </div>
                          <span className="text-sm font-bold">{matchesBorrower ? 'Matches Borrower' : 'Different Owner'}</span>
                        </div>
                      )}
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Collateral Documents</p>
                        <IdentityDocumentsTable docTypes={collateralDocTypes} documents={item.documents} onView={handleViewDoc} />
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={Building}
                title="No collateral recorded for this loan"
                hint="Add land, a house or a vehicle — its appraised value sets the loan-to-value ratio used in the assessment."
              >
                {!isDisbursed && (
                  <button onClick={() => openCollateralModal(null)} className={ghostBtnCls}>
                    <Plus className="w-3.5 h-3.5" /> Add Collateral
                  </button>
                )}
              </EmptyState>
            )}
          </div>
        </div>
        )}

        {activeTab === 4 && (
        /* Section 4: Income — the verification workspace: pick an income entry, read its
           documents alongside the declared figures, and record the review decision. */
        <IncomeVerification
          loan={loan}
          currency={currency}
          isDisbursed={isDisbursed}
          onAddIncome={target => openIncomeModal(target, null)}
          onEditIncome={(target, idx) => openIncomeModal(target, idx)}
          onRemoveIncome={handleRemoveIncome}
          onViewDoc={handleViewDoc}
          candidateNamesFor={getIncomeCandidateNames}
        />
        )}

        {activeTab === 5 && (
        /* Section 5: Expense Verification — the declared expense types against what six months
           of bank statements show actually going out. Laid out like Income Verification. */
        <ExpenseVerification
          loan={loan}
          currency={currency}
          isDisbursed={isDisbursed}
          onAddExpense={openExpenseModal}
          onEditExpense={openExpenseModal}
          onRemoveExpense={handleRemoveExpense}
          onViewDoc={handleViewDoc}
        />
        )}

        {activeTab === 6 && (
        /* Section 6: Loan Assessment — the verification verdict, then rate adjustment (left)
           and repayment capacity & benefit to the bank (right). The verdict leads because it is
           what the terms below have to be justified against. */
        <div className="pt-6">
          <CreditVerificationPanel loan={loan} currency={currency} />
        </div>
        )}
        {activeTab === 6 && (
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-start pt-4">
          {/* Left: adjust loan product rate and benefit rate */}
          <div className="lg:col-span-3 space-y-4">
            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Benefit Rate</span>
                {!isDisbursed && !editingBenefitRate && (
                  <button
                    type="button"
                    onClick={() => setEditingBenefitRate(true)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                {relevantFeeRateFields.map(f => {
                  const ticked = benefitFeeForm.includes(f.key)
                  return (
                    <div key={f.key} className="flex items-center gap-2.5">
                      <label className={`flex items-center gap-2.5 flex-1 min-w-0 ${isDisbursed || !editingBenefitRate ? 'cursor-default' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={ticked}
                          disabled={isDisbursed || !editingBenefitRate}
                          onChange={e => setBenefitFeeForm(prev =>
                            e.target.checked ? [...prev, f.key] : prev.filter(k => k !== f.key)
                          )}
                          className="w-4 h-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-[#0047ab] disabled:opacity-50"
                        />
                        <span className={`text-xs font-medium truncate ${ticked ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                          {f.label}
                          {/* Fees charged per pledged asset show the multiplier so the rate below reads as "rate × N" */}
                          {f.multiplier > 1 && <span className="ml-1 text-[10px] font-semibold text-[#0047ab] dark:text-blue-400">×{f.multiplier}</span>}
                        </span>
                      </label>
                      <div className="relative shrink-0 w-20">
                        <input
                          type="number" min="0" max="100" step="0.01"
                          value={benefitRateForm[f.key]}
                          disabled={isDisbursed || !editingBenefitRate || !ticked}
                          onChange={e => setBenefitRateForm(p => ({ ...p, [f.key]: e.target.value }))}
                          className={`${inputCls} pr-5 text-right`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">%</span>
                      </div>
                    </div>
                  )
                })}

                {/* Custom fees added on this loan — same row format as the built-in fees */}
                {benefitCustomFeesForm.map((f, idx) => {
                  if (!editingBenefitRate && !f.name.trim()) return null
                  return (
                    <div key={idx} className="flex items-center gap-2.5">
                      <div className="flex items-center gap-2.5 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={f.included !== false}
                          disabled={isDisbursed || !editingBenefitRate}
                          onChange={e => setBenefitCustomFeesForm(prev => prev.map((c, i) => i === idx ? { ...c, included: e.target.checked } : c))}
                          className="w-4 h-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-[#0047ab] focus:ring-[#0047ab] disabled:opacity-50"
                        />
                        {editingBenefitRate ? (
                          <input
                            type="text"
                            value={f.name}
                            placeholder="Fee name"
                            onChange={e => setBenefitCustomFeesForm(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                            className={`${inputCls} flex-1 min-w-0`}
                          />
                        ) : (
                          <span className={`text-xs font-medium truncate ${f.included !== false ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>{f.name}</span>
                        )}
                      </div>
                      <div className="relative shrink-0 w-20">
                        <input
                          type="number" min="0" max="100" step="0.01"
                          value={f.rate}
                          disabled={isDisbursed || !editingBenefitRate || f.included === false}
                          onChange={e => setBenefitCustomFeesForm(prev => prev.map((c, i) => i === idx ? { ...c, rate: e.target.value } : c))}
                          className={`${inputCls} pr-5 text-right`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">%</span>
                      </div>
                      {!isDisbursed && editingBenefitRate && (
                        <button
                          type="button"
                          onClick={() => setBenefitCustomFeesForm(prev => prev.filter((_, i) => i !== idx))}
                          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Remove fee"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}

                {!isDisbursed && editingBenefitRate && (
                  <button
                    type="button"
                    onClick={() => setBenefitCustomFeesForm(prev => [...prev, { name: '', rate: '' }])}
                    className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-semibold rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-[#0047ab] hover:text-[#0047ab] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Fee
                  </button>
                )}

                {!isDisbursed && editingBenefitRate && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelBenefitRates}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBenefitRates}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
                    >
                      Update
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Loan Product Rate</span>
                {!isDisbursed && !editingAssessmentRate && (
                  <button
                    type="button"
                    onClick={() => setEditingAssessmentRate(true)}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-600 transition-colors"
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className={labelCls}>{loan.product || 'Loan Product'} — Interest Rate (% p.a.)</label>
                  <input
                    type="number" min="0" step="0.1"
                    value={assessmentRateForm.interestRate}
                    disabled={isDisbursed || !editingAssessmentRate}
                    onChange={e => setAssessmentRateForm(p => ({ ...p, interestRate: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Payment Term</label>
                  <input
                    type="number" min="1" step="1"
                    value={assessmentRateForm.installments}
                    disabled={isDisbursed || !editingAssessmentRate}
                    onChange={e => setAssessmentRateForm(p => ({ ...p, installments: e.target.value }))}
                    placeholder="e.g. 12"
                    className={inputCls}
                  />
                </div>
                {!isDisbursed && editingAssessmentRate && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCancelAssessmentRate}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAssessmentRate}
                      className="flex-1 px-3 py-2 text-xs font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
                    >
                      Update
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Repayment Capacity Analysis + Benefit to the Bank */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Benefit</span>
              </div>
              <div className="px-4 pb-4">
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {benefitItems.map((b, i) => (
                    <div key={i} className="flex-1 min-w-[150px] px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 flex flex-col">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight mb-1 break-words">
                        {b.category}{b.multiplier > 1 && ` (×${b.multiplier})`}
                      </p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap mt-auto">{formatVal(b.amount, currency, 1)}</p>
                    </div>
                  ))}
                  <div className="flex-1 min-w-[150px] px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex flex-col">
                    <p className="text-xs font-medium text-[#0047ab] dark:text-blue-400 leading-tight mb-1 break-words">Total Benefit Fee</p>
                    <p className="text-sm font-bold text-[#0047ab] dark:text-blue-400 whitespace-nowrap mt-auto">{formatVal(totalBenefitToBank, currency, 1)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-slate-700">
              <div className="px-4 py-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Repayment Capacity Analysis</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-3 overflow-x-auto pb-1">
                  <div className="flex-1 min-w-[140px] bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wallet className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight">Total Monthly Income</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatVal(totalMonthlyIncome, currency, 1)}</p>
                    {/* A capped figure never appears without its reason: the declared total
                        stays on show, with what the statements actually demonstrate beneath it. */}
                    {income.capped && (
                      <p
                        title="A bank statement shows recurring deposits below the declared income, so capacity is assessed on the statement figure"
                        className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 mt-0.5 whitespace-nowrap"
                      >
                        {formatVal(income.assessable, currency, 1)} verified by statements
                      </p>
                    )}
                  </div>
                  <div className="flex-1 min-w-[140px] bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <DollarSign className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-tight">Total Monthly Expense</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatVal(totalMonthlyExpense, currency, 1)}</p>
                    {/* A swapped-in figure never appears without its reason: what was declared
                        stays on show beneath it, so a reviewer can see the two never disagree
                        by more than the statements account for. */}
                    {expense.fromStatement && expense.assessable !== expense.declared && (
                      <p
                        title="Assessed on what the bank statements show going out per month ('Really spent / month'), not the declared budget"
                        className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 mt-0.5 whitespace-nowrap"
                      >
                        {formatVal(expense.declared, currency, 1)} declared
                      </p>
                    )}
                  </div>
                  <div className={`flex-1 min-w-[140px] rounded-xl p-3 ${remainingAmount >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Scale className={`w-3.5 h-3.5 shrink-0 ${remainingAmount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                      <p className={`text-[11px] font-medium leading-tight ${remainingAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>Remaining Amount</p>
                    </div>
                    <p className={`text-sm font-bold whitespace-nowrap ${remainingAmount >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>{formatVal(remainingAmount, currency, 1)}</p>
                  </div>
                  <div className="flex-1 min-w-[140px] bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <PiggyBank className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 leading-tight">Savings Reserve ({Math.round(SAVINGS_RESERVE_RATE * 100)}%)</p>
                    </div>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">− {formatVal(savingsReserve, currency, 1)}</p>
                  </div>
                  <div className={`flex-1 min-w-[140px] rounded-xl p-3 ${availableForRepayment >= 0 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className={`w-3.5 h-3.5 shrink-0 ${availableForRepayment >= 0 ? 'text-[#0047ab] dark:text-blue-400' : 'text-rose-500'}`} />
                      <p className={`text-[11px] font-medium leading-tight ${availableForRepayment >= 0 ? 'text-[#0047ab] dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>Available for Repayment</p>
                    </div>
                    <p className={`text-sm font-bold whitespace-nowrap ${availableForRepayment >= 0 ? 'text-[#0047ab] dark:text-blue-400' : 'text-rose-700 dark:text-rose-400'}`}>{formatVal(availableForRepayment, currency, 1)}</p>
                  </div>
                </div>

                {termOptions.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Other Term Options</p>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                            <th className="py-2 px-3 font-medium">Term</th>
                            <th className="py-2 px-3 font-medium">Monthly</th>
                            <th className="py-2 px-3 font-medium">Total Interest</th>
                            <th className="py-2 px-3 font-medium">Left Amount</th>
                            <th className="py-2 px-3 font-medium">Affordable</th>
                            <th className="py-2 px-3 font-medium">Action</th>
                            <th className="py-2 px-3 font-medium">Schedule</th>
                          </tr>
                        </thead>
                        <tbody>
                          {termOptions.map(opt => {
                            const isSelected = (loan.termSelected || isDisbursed) && opt.term === loan.installments
                            const isRecommended = opt.term === recommendedTerm
                            return (
                              <tr
                                key={opt.term}
                                className={`border-t border-slate-100 dark:border-slate-700/50 ${isSelected ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''}`}
                              >
                                <td className="py-2 px-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                  {opt.term} mo
                                  {isRecommended && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">Recommended</span>}
                                </td>
                                <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatVal(opt.emi, currency, 1)}</td>
                                <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatVal(opt.totalInterest, currency, 1)}</td>
                                <td className={`py-2 px-3 font-medium whitespace-nowrap ${opt.leftAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{formatVal(opt.leftAmount, currency, 1)}</td>
                                <td className="py-2 px-3">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${opt.affordable ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'}`}>
                                    {opt.affordable ? 'Yes' : 'No'}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  {isSelected ? (
                                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Selected</span>
                                  ) : !isDisbursed ? (
                                    <button
                                      type="button"
                                      onClick={() => handleApplyTerm(opt.term)}
                                      className="px-2 py-1 text-[10px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                                    >
                                      Select
                                    </button>
                                  ) : null}
                                </td>
                                <td className="py-2 px-3">
                                  <button
                                    type="button"
                                    onClick={() => setScheduleModalTerm(opt)}
                                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
                                  >
                                    <Eye className="w-3 h-3" /> View
                                  </button>
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
            </div>
          </div>
        </div>
        )}

        {activeTab === 7 && (
        /* Section 9: Risk Assessment — auto-derived from each party's CBC data, plus
           manual factors a credit officer can add/remove to supplement it. */
        <div className="rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Risk Assessment</span>
          </div>
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {[
              { type: 'positives', label: 'Positive Assessment', auto: riskAssessment.autoPositives, manual: riskAssessment.manualPositives, box: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400', title: 'text-emerald-700 dark:text-emerald-400', num: 'text-emerald-600 dark:text-emerald-400', input: newRiskPositive, setInput: setNewRiskPositive },
              { type: 'negatives', label: 'Negative Assessment', auto: riskAssessment.autoNegatives, manual: riskAssessment.manualNegatives, box: 'bg-rose-50 dark:bg-rose-900/20', icon: 'text-rose-600 dark:text-rose-400', title: 'text-rose-700 dark:text-rose-400', num: 'text-rose-600 dark:text-rose-400', input: newRiskNegative, setInput: setNewRiskNegative },
            ].map(({ type, label, auto, manual, box, icon, title, num, input, setInput }) => (
              <div key={type} className={`rounded-xl p-3 ${box}`}>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className={`w-4 h-4 ${icon}`} />
                    <span className={`text-xs font-bold ${title}`}>{label}</span>
                  </div>
                  {!isDisbursed && manual.length > 0 && (
                    editingRiskSection === type ? (
                      <button
                        onClick={() => saveRiskSectionEdit(type)}
                        title="Save"
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400 hover:bg-white/70 dark:hover:bg-slate-800/50 transition-colors flex-shrink-0"
                      >
                        <Check className="w-3 h-3" /> Save
                      </button>
                    ) : (
                      <button
                        onClick={() => startRiskSectionEdit(type, manual)}
                        title="Edit"
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800/50 transition-colors flex-shrink-0"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    )
                  )}
                </div>
                {auto.length > 0 || manual.length > 0 ? (
                  <ol className="space-y-1">
                    {auto.map((p, i) => (
                      <li key={`auto-${i}`} className="flex gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <span className={`font-semibold flex-shrink-0 ${num}`}>{i + 1}.</span>
                        <span>{p}</span>
                      </li>
                    ))}
                    {editingRiskSection === type
                      ? riskSectionDraft.map((p, i) => (
                          <li key={`manual-${i}`} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                            <span className={`font-semibold flex-shrink-0 ${num}`}>{auto.length + i + 1}.</span>
                            <input
                              type="text"
                              value={p}
                              onChange={e => setRiskSectionDraft(d => d.map((v, vi) => vi === i ? e.target.value : v))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); saveRiskSectionEdit(type) }
                                else if (e.key === 'Escape') cancelRiskSectionEdit()
                              }}
                              placeholder="Assessment note…"
                              className="w-64 max-w-full text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-400"
                            />
                            <button
                              type="button"
                              onClick={() => setRiskSectionDraft(d => d.filter((_, di) => di !== i))}
                              title="Delete"
                              className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))
                      : manual.map((p, i) => (
                          <li key={`manual-${i}`} className="group flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                            <span className={`font-semibold flex-shrink-0 ${num}`}>{auto.length + i + 1}.</span>
                            <span>{p}</span>
                            {!isDisbursed && (
                              <button
                                type="button"
                                onClick={() => removeManualRiskFactor(type, i)}
                                title="Delete"
                                className="flex-shrink-0 ml-auto p-0.5 rounded text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                  </ol>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500">None recorded.</p>
                )}
                {!isDisbursed && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <input
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addManualRiskFactor(type, input)
                          setInput('')
                        }
                      }}
                      placeholder={`Add ${label}…`}
                      className="w-64 max-w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                    <button
                      onClick={() => { addManualRiskFactor(type, input); setInput('') }}
                      title="Add"
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        )}

        {activeTab === 8 && (
        /* Section 10: Audit Log */
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
                        <td colSpan={5} className="px-3">
                          <EmptyState
                            bare
                            icon={History}
                            title="No audit log entries for this loan"
                            hint="Submitting or approving this loan, and any edit made on the tabs above, writes an entry here."
                          />
                        </td>
                      </tr>
                    ) : auditEntries.map((h, i) => {
                      const { date, time } = splitTimestamp(h.timestamp)
                      return (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors align-top">
                        <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{date}</td>
                        <td className="px-3 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{time}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {/* Which tab the action came from. Approval entries are the workflow
                              itself, so they carry the brand colour the timeline uses. */}
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            h.section === 'Approval'
                              ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                            {h.section}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{h.action || '—'}</span>
                          {/* What actually changed, so the row says more than that something did */}
                          {h.detail && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{h.detail}</span>}
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{h.user || '—'}</td>
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

        </div>
      </div>
    </div>

    {/* Edit Borrower (Customer) wizard */}
    {state.customerWizardOpen && <CustomerWizard />}

    {/* Edit Loan Info modal */}
    {showLoanInfoModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowLoanInfoModal(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Edit Loan Info</h3>
            <button
              onClick={() => setShowLoanInfoModal(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className={labelCls}>Loan Product</label>
              <select value={loanInfoForm.product} onChange={e => handleLoanInfoProductChange(e.target.value)} className={inputCls}>
                {state.loanProducts.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Loan Amount ({currency})</label>
              <input
                type="number" min="0" step="100" value={loanInfoForm.amount} onChange={e => setLoanInfoForm(p => ({ ...p, amount: e.target.value }))}
                className={[inputCls, loanInfoAmountExceedsMax ? 'border-rose-400 focus:ring-rose-400' : ''].join(' ')}
              />
              {loanInfoProductMax != null && (
                <p className={`text-[11px] mt-1 ${loanInfoAmountExceedsMax ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                  {loanInfoAmountExceedsMax
                    ? `Exceeds ${loanInfoForm.product} max of ${formatVal(loanInfoProductMax, currency, 1)}`
                    : `Max for ${loanInfoForm.product}: ${formatVal(loanInfoProductMax, currency, 1)}`}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Interest Rate (% p.a.)</label>
              <input type="number" min="0" step="0.1" value={loanInfoForm.interestRate} onChange={e => setLoanInfoForm(p => ({ ...p, interestRate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Number of Installments</label>
              <select value={loanInfoForm.installments} onChange={e => setLoanInfoForm(p => ({ ...p, installments: e.target.value }))} className={inputCls}>
                <option value="">Select term</option>
                {INSTALLMENT_OPTIONS.map(n => <option key={n} value={n}>{n} installments</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Credit Officer</label>
              <input type="text" placeholder="Officer name" value={loanInfoForm.creditOfficer} onChange={e => setLoanInfoForm(p => ({ ...p, creditOfficer: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Branch Name</label>
              <select value={loanInfoForm.branch} onChange={e => setLoanInfoForm(p => ({ ...p, branch: e.target.value }))} className={inputCls}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => setShowLoanInfoModal(false)}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveLoanInfo}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Repayment Schedule modal — view/print/download the schedule for a term option, formatted like the official schedule in Loan Preview */}
    {scheduleModalTerm && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setScheduleModalTerm(null)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Repayment Schedule — {scheduleModalTerm.term} months</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadTermSchedule(scheduleModalTerm)}
                disabled={scheduleDownloading}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" /> {scheduleDownloading ? 'Preparing…' : 'Download PDF'}
              </button>
              <button
                onClick={() => withLightTheme(async () => window.print())}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
              <button
                onClick={() => setScheduleModalTerm(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-6 overflow-y-auto flex-1">
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
                  <ScheduleField label="រយៈពេល (Period)" value={`${scheduleModalTerm.term} ${loan.repaymentType || 'Monthly'}`} />
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
                  {scheduleModalTerm.rows.map(row => (
                    <tr key={row.num}>
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
        </div>
      </div>
    )}

    {/* Edit Risk Assessment modal */}
    {/* Edit Income modal */}
    {showIncomeModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowIncomeModal(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {editingIncomeIdx !== null ? 'Edit' : 'Add'} {INCOME_LABEL[incomeTarget]} Income
            </h3>
            <button
              onClick={() => setShowIncomeModal(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div className={`grid grid-cols-1 gap-3 ${incomeStatusCategory === 'Business' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
              <div>
                <label className={labelCls}>Employment Status</label>
                <select
                  value={incomeStatusCategory}
                  onChange={e => {
                    const category = e.target.value
                    setIncomeStatusCategory(category)
                    setIncomeOccupation('')
                    setIncomeEmploymentStatus(category === 'Business' ? '' : category)
                  }}
                  className={inputCls}
                >
                  <option value="">Select Employment Status</option>
                  {['Employed', 'Business', 'Part-time'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Occupation</label>
                <select
                  value={incomeOccupation}
                  onChange={e => setIncomeOccupation(e.target.value)}
                  disabled={!incomeStatusCategory}
                  className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <option value="">Select Occupation</option>
                  {(incomeStatusCategory === 'Business' ? BUSINESS_OCCUPATIONS : OCCUPATIONS.filter(o => !BUSINESS_OCCUPATIONS.includes(o)))
                    .map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {incomeStatusCategory === 'Business' && (
                <div>
                  <label className={labelCls}>Type</label>
                  <select value={incomeEmploymentStatus} onChange={e => setIncomeEmploymentStatus(e.target.value)} className={inputCls}>
                    <option value="">Select Type</option>
                    {BUSINESS_INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>Income Amount</label>
                <div className="space-y-2">
                  {incomeSources.map((source, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={source.amount}
                        onChange={e => updateIncomeSource(idx, 'amount', e.target.value)}
                        className={`${inputCls.replace('w-full', 'flex-1 min-w-0')}`}
                      />
                      {incomeSources.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIncomeSource(idx)}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(incomeEmploymentStatus === 'Employed' || incomeEmploymentStatus === 'Part-time') && (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{incomeEmploymentStatus === 'Part-time' ? 'Work Place Name' : 'Company Name'}</label>
                <input
                  type="text"
                  placeholder="e.g. ABC Trading Co., Ltd."
                  value={incomeCompanyName}
                  onChange={e => setIncomeCompanyName(e.target.value)}
                  className={inputCls}
                />
              </div>

              <div>
                <label className={labelCls}>{incomeEmploymentStatus === 'Part-time' ? 'Work Place Address' : 'Company Address'}</label>
                <input
                  type="text"
                  placeholder="e.g. #12, Street 271, Phnom Penh"
                  value={incomeCompanyAddress}
                  onChange={e => setIncomeCompanyAddress(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{incomeEmploymentStatus === 'Part-time' ? 'Work Place Document' : 'Company Document'}</label>
              <TypedDocumentUpload
                docTypes={getIncomeCompanyDocTypes(incomeEmploymentStatus)}
                documents={incomeCompanyDocuments}
                setDocuments={setIncomeCompanyDocuments}
                onFilesAdded={handleIncomeCompanyFilesAdded}
              />
            </div>
            </>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide pt-2 pb-3">Income Verification & Proof</p>
            </div>

            <TypedDocumentUpload
              docTypes={getIncomeProofDocTypes(incomeEmploymentStatus, incomeOccupation)}
              documents={incomeDocuments}
              setDocuments={setIncomeDocuments}
              onFilesAdded={handleIncomeFilesAdded}
            />
          </div>
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => setShowIncomeModal(false)}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveIncome}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Edit Expense modal */}
    {showExpenseModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExpenseModal(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {loan[EXPENSE_FIELD[expenseTarget]] ? 'Edit' : 'Add'} {EXPENSE_LABEL[expenseTarget]} Expense
            </h3>
            <button
              onClick={() => setShowExpenseModal(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-3 overflow-y-auto flex-1">
            {expenseItems.map((item, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>Category</label>
                  <select
                    value={item.category}
                    onChange={e => updateExpenseItem(idx, 'category', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select Category</option>
                    {expenseCategoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {item.category === 'Other' && (
                  item.addingCategory ? (
                    <div className="flex-1 min-w-0">
                      <label className={labelCls}>New Category</label>
                      <input
                        type="text"
                        autoFocus
                        placeholder="Category name"
                        value={item.customCategory}
                        onChange={e => updateExpenseItem(idx, 'customCategory', e.target.value)}
                        onBlur={() => commitExpenseCategory(idx)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitExpenseCategory(idx) }
                          if (e.key === 'Escape') cancelExpenseCategory(idx)
                        }}
                        className={inputCls}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateExpenseItem(idx, 'addingCategory', true)}
                      className="flex items-center gap-1 flex-shrink-0 mb-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Category
                    </button>
                  )
                )}
                <div className="w-24 flex-shrink-0">
                  <label className={labelCls}>Amount</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={item.amount}
                    onChange={e => updateExpenseItem(idx, 'amount', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label className={labelCls}>Notes</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={item.notes}
                    onChange={e => updateExpenseItem(idx, 'notes', e.target.value)}
                    className={inputCls}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeExpenseItem(idx)}
                  disabled={expenseItems.length === 1}
                  className="p-2 mb-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addExpenseItem}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Add Expense
            </button>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/30">
              <span className="text-xs text-slate-500 dark:text-slate-400">Total Monthly Expense</span>
              <span className="text-sm font-bold text-[#0047ab] dark:text-blue-400">{formatVal(expenseItemsTotal, currency, 1)}</span>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 space-y-2">
              <label className={labelCls}>Bank Statement — {EXPENSE_MONTHS_REQUIRED} Months</label>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                The money out is totalled across {EXPENSE_MONTHS_REQUIRED} months and divided by {EXPENSE_MONTHS_REQUIRED},
                which is what the borrower really spends. Upload one file covering the period or one per month.
              </p>
              <TypedDocumentUpload
                docTypes={EXPENSE_DOC_TYPES}
                documents={expenseDocuments}
                setDocuments={setExpenseDocuments}
                multiple
                onFilesAdded={handleExpenseFilesAdded}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => setShowExpenseModal(false)}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveExpense}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Edit Co-Borrower modal */}
    {showCoBorrowerModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCoBorrowerModal(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{editingCoBorrowerIdx !== null ? 'Edit Co-Borrower' : 'Add Co-Borrower'}</h3>
            <button
              onClick={() => setShowCoBorrowerModal(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className={labelCls}>Add from Customer</label>
              <select value={coBorrowerCustomerCode} onChange={e => handleSelectCoBorrowerCustomer(e.target.value)} className={inputCls}>
                <option value="">— Manual Entry —</option>
                {state.customers.filter(c => c.code !== loan.customerCode).map(c => (
                  <option key={c.code} value={c.code}>{c.enName} ({c.code})</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Selecting a customer pre-fills the fields below. Any missing info can still be entered manually.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Full Name (Khmer)</label>
                <input type="text" placeholder="e.g. ច័ន្ទនី ចាន់" value={coBorrowerForm.khName} onChange={e => setCoBorrowerForm(p => ({ ...p, khName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Full Name (English)</label>
                <input type="text" placeholder="e.g. CHAN CHANTNY" value={coBorrowerForm.enName} onChange={e => setCoBorrowerForm(p => ({ ...p, enName: e.target.value.toUpperCase() }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Gender</label>
                <select value={coBorrowerForm.gender} onChange={e => setCoBorrowerForm(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Marital Status</label>
                <select value={coBorrowerForm.maritalStatus} onChange={e => setCoBorrowerForm(p => ({ ...p, maritalStatus: e.target.value }))} className={inputCls}>
                  {MARITAL_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input type="date" value={coBorrowerForm.dob} onChange={e => setCoBorrowerForm(p => ({ ...p, dob: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>National ID</label>
                <input type="text" placeholder="e.g. 019109208765" value={coBorrowerForm.idNo} onChange={e => setCoBorrowerForm(p => ({ ...p, idNo: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone Number</label>
                <input type="text" placeholder="e.g. 011 334 556" value={coBorrowerForm.phone} onChange={e => setCoBorrowerForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" placeholder="e.g. name@example.com" value={coBorrowerForm.email} onChange={e => setCoBorrowerForm(p => ({ ...p, email: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Relationship to Customer</label>
              <select value={coBorrowerForm.relation} onChange={e => setCoBorrowerForm(p => ({ ...p, relation: e.target.value }))} className={inputCls}>
                <option value="">Select Relationship</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <hr className="border-t border-slate-200 dark:border-slate-700" />

            <AddressFields
              label="Current Address"
              values={coBorrowerForm.currentAddress}
              onChange={addr => setCoBorrowerForm(p => ({ ...p, currentAddress: addr }))}
            />

            <hr className="border-t border-slate-200 dark:border-slate-700" />

            <AddressFields
              label="Permanent Address"
              values={coBorrowerForm.permanentAddress}
              onChange={addr => setCoBorrowerForm(p => ({ ...p, permanentAddress: addr }))}
            />
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Identity Documents</label>
              <TypedDocumentUpload docTypes={IDENTITY_DOC_TYPES.filter(t => t !== 'Other')} documents={coBorrowerDocuments} setDocuments={setCoBorrowerDocuments} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => setShowCoBorrowerModal(false)}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCoBorrower}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Edit Guarantor modal */}
    {showGuarantorModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowGuarantorModal(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{editingGuarantorIdx !== null ? 'Edit Guarantor' : 'Add Guarantor'}</h3>
            <button
              onClick={() => setShowGuarantorModal(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className={labelCls}>Add from Customer</label>
              <select value={guarantorCustomerCode} onChange={e => handleSelectGuarantorCustomer(e.target.value)} className={inputCls}>
                <option value="">— Manual Entry —</option>
                {state.customers.filter(c => c.code !== loan.customerCode).map(c => (
                  <option key={c.code} value={c.code}>{c.enName} ({c.code})</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Selecting a customer pre-fills the fields below. Any missing info can still be entered manually.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Full Name (Khmer)</label>
                <input type="text" placeholder="e.g. ស្រីម៉ៅ សេង" value={guarantorForm.khName} onChange={e => setGuarantorForm(p => ({ ...p, khName: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Full Name (English)</label>
                <input type="text" placeholder="e.g. SENG SREYMAO" value={guarantorForm.enName} onChange={e => setGuarantorForm(p => ({ ...p, enName: e.target.value.toUpperCase() }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Gender</label>
                <select value={guarantorForm.gender} onChange={e => setGuarantorForm(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Marital Status</label>
                <select value={guarantorForm.maritalStatus} onChange={e => setGuarantorForm(p => ({ ...p, maritalStatus: e.target.value }))} className={inputCls}>
                  {MARITAL_STATUSES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input type="date" value={guarantorForm.dob} onChange={e => setGuarantorForm(p => ({ ...p, dob: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>National ID</label>
                <input type="text" placeholder="e.g. 016511011234" value={guarantorForm.idNo} onChange={e => setGuarantorForm(p => ({ ...p, idNo: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone Number</label>
                <input type="text" placeholder="e.g. 017 456 789" value={guarantorForm.phone} onChange={e => setGuarantorForm(p => ({ ...p, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" placeholder="e.g. name@example.com" value={guarantorForm.email} onChange={e => setGuarantorForm(p => ({ ...p, email: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Relationship to Customer</label>
              <select value={guarantorForm.relation} onChange={e => setGuarantorForm(p => ({ ...p, relation: e.target.value }))} className={inputCls}>
                <option value="">Select Relationship</option>
                {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <hr className="border-t border-slate-200 dark:border-slate-700" />

            <AddressFields
              label="Current Address"
              values={guarantorForm.currentAddress}
              onChange={addr => setGuarantorForm(p => ({ ...p, currentAddress: addr }))}
            />

            <hr className="border-t border-slate-200 dark:border-slate-700" />

            <AddressFields
              label="Permanent Address"
              values={guarantorForm.permanentAddress}
              onChange={addr => setGuarantorForm(p => ({ ...p, permanentAddress: addr }))}
            />
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Identity Documents</label>
              <TypedDocumentUpload docTypes={IDENTITY_DOC_TYPES.filter(t => t !== 'Other')} documents={guarantorDocuments} setDocuments={setGuarantorDocuments} />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => setShowGuarantorModal(false)}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveGuarantor}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Edit Collateral modal */}
    {showCollateralModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCollateralModal(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Collateral Information</h3>
            <button
              onClick={() => setShowCollateralModal(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Collateral Information</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Collateral Type</label>
                  <select value={collateralForm.type} onChange={e => updateCollateralType(e.target.value)} className={inputCls}>
                    <option value="">Select Type</option>
                    {collateralTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {collateralForm.type === 'Other' && (
                    collateralForm.addingType ? (
                      <input
                        type="text"
                        autoFocus
                        placeholder="Collateral type name"
                        value={collateralForm.customType}
                        onChange={e => setCollateralForm(p => ({ ...p, customType: e.target.value }))}
                        onBlur={commitCollateralType}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitCollateralType() }
                          if (e.key === 'Escape') cancelCollateralType()
                        }}
                        className={`${inputCls} mt-2`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCollateralForm(p => ({ ...p, addingType: true }))}
                        className="flex items-center gap-1 mt-2 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Type
                      </button>
                    )
                  )}
                </div>
                <div>
                  <label className={labelCls}>Registration Number</label>
                  <input type="text" placeholder="e.g. LT-2024-00178" value={collateralForm.docNo} onChange={e => setCollateralForm(p => ({ ...p, docNo: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Registration Status</label>
                  <select value={collateralForm.registrationStatus} onChange={e => setCollateralForm(p => ({ ...p, registrationStatus: e.target.value }))} className={inputCls}>
                    <option value="">Select Status</option>
                    {REGISTRATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Estimated Market Value ({currency})</label>
                  <input type="number" min="0" placeholder="0.00" value={collateralForm.value} onChange={e => setCollateralForm(p => ({ ...p, value: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Appraised Value ({currency})</label>
                  <input type="number" min="0" placeholder="0.00" value={collateralForm.appraisedValue} onChange={e => setCollateralForm(p => ({ ...p, appraisedValue: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Forced Sale Value ({currency})</label>
                  <input type="number" min="0" placeholder="0.00" value={collateralForm.forcedSaleValue} onChange={e => setCollateralForm(p => ({ ...p, forcedSaleValue: e.target.value }))} className={inputCls} />
                </div>
              </div>
            </div>

            {collateralForm.type === 'Vehicle' && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Vehicle Details</p>
                <div>
                  <label className={labelCls}>Owner Name</label>
                  <input type="text" placeholder="Full name as shown on registration" value={vehicleForm.ownerName} onChange={e => setVehicleForm(p => ({ ...p, ownerName: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Make</label>
                    <input type="text" placeholder="e.g. Toyota" value={vehicleForm.make} onChange={e => setVehicleForm(p => ({ ...p, make: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Model</label>
                    <input type="text" placeholder="e.g. Camry" value={vehicleForm.model} onChange={e => setVehicleForm(p => ({ ...p, model: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Year of Manufacture</label>
                    <input type="text" placeholder="e.g. 2019" value={vehicleForm.year} onChange={e => setVehicleForm(p => ({ ...p, year: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={labelCls}>Plate Number</label>
                    <input type="text" placeholder="e.g. PP-3456" value={vehicleForm.plateNumber} onChange={e => setVehicleForm(p => ({ ...p, plateNumber: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Chassis / VIN Number</label>
                    <input type="text" placeholder="e.g. JT2BF22K1X0123456" value={vehicleForm.chassisNumber} onChange={e => setVehicleForm(p => ({ ...p, chassisNumber: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Engine Number</label>
                    <input type="text" placeholder="e.g. 5A-1234567" value={vehicleForm.engineNumber} onChange={e => setVehicleForm(p => ({ ...p, engineNumber: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Color</label>
                    <input type="text" placeholder="e.g. White" value={vehicleForm.color} onChange={e => setVehicleForm(p => ({ ...p, color: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Issue Date</label>
                    <input type="date" value={vehicleForm.issueDate} onChange={e => setVehicleForm(p => ({ ...p, issueDate: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Collateral Status</label>
                    <select value={vehicleForm.encumbranceStatus} onChange={e => setVehicleForm(p => ({ ...p, encumbranceStatus: e.target.value }))} className={inputCls}>
                      <option value="">Select Status</option>
                      {ENCUMBRANCE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {collateralForm.type === 'Land' && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Land Details</p>
                <div>
                  <label className={labelCls}>Owner Name</label>
                  <input type="text" placeholder="Full name as shown on title" value={landForm.ownerName} onChange={e => setLandForm(p => ({ ...p, ownerName: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Title Type</label>
                    <select value={landForm.titleType} onChange={e => setLandForm(p => ({ ...p, titleType: e.target.value }))} className={inputCls}>
                      <option value="">Select Title Type</option>
                      {LAND_TITLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Title Number</label>
                    <input type="text" placeholder="e.g. T-2024-00178" value={landForm.titleNumber} onChange={e => setLandForm(p => ({ ...p, titleNumber: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Plot / Parcel Number</label>
                    <input type="text" placeholder="e.g. 178" value={landForm.plotNumber} onChange={e => setLandForm(p => ({ ...p, plotNumber: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Land Area (sqm)</label>
                    <input type="number" min="0" placeholder="e.g. 400" value={landForm.area} onChange={e => setLandForm(p => ({ ...p, area: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Land Use</label>
                    <select value={landForm.landUse} onChange={e => setLandForm(p => ({ ...p, landUse: e.target.value }))} className={inputCls}>
                      <option value="">Select Land Use</option>
                      {LAND_USE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Issue Date</label>
                    <input type="date" value={landForm.issueDate} onChange={e => setLandForm(p => ({ ...p, issueDate: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Collateral Status</label>
                    <select value={landForm.encumbranceStatus} onChange={e => setLandForm(p => ({ ...p, encumbranceStatus: e.target.value }))} className={inputCls}>
                      <option value="">Select Status</option>
                      {ENCUMBRANCE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <CollateralLocationFields values={landForm.location} onChange={loc => setLandForm(p => ({ ...p, location: loc }))} />
              </div>
            )}

            {collateralForm.type === 'House' && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">House Details</p>
                <div>
                  <label className={labelCls}>Owner Name</label>
                  <input type="text" placeholder="Full name as shown on title" value={houseForm.ownerName} onChange={e => setHouseForm(p => ({ ...p, ownerName: e.target.value }))} className={inputCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>House Type</label>
                    <select value={houseForm.houseType} onChange={e => setHouseForm(p => ({ ...p, houseType: e.target.value }))} className={inputCls}>
                      <option value="">Select House Type</option>
                      {HOUSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Construction Type</label>
                    <select value={houseForm.constructionType} onChange={e => setHouseForm(p => ({ ...p, constructionType: e.target.value }))} className={inputCls}>
                      <option value="">Select Construction Type</option>
                      {CONSTRUCTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Year Built</label>
                    <input type="text" placeholder="e.g. 2015" value={houseForm.yearBuilt} onChange={e => setHouseForm(p => ({ ...p, yearBuilt: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Number of Floors</label>
                    <input type="number" min="0" placeholder="e.g. 2" value={houseForm.floors} onChange={e => setHouseForm(p => ({ ...p, floors: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Floor Area (sqm)</label>
                    <input type="number" min="0" placeholder="e.g. 120" value={houseForm.floorArea} onChange={e => setHouseForm(p => ({ ...p, floorArea: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Land Area (sqm)</label>
                    <input type="number" min="0" placeholder="e.g. 200" value={houseForm.landArea} onChange={e => setHouseForm(p => ({ ...p, landArea: e.target.value }))} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Issue Date</label>
                    <input type="date" value={houseForm.issueDate} onChange={e => setHouseForm(p => ({ ...p, issueDate: e.target.value }))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Collateral Status</label>
                    <select value={houseForm.encumbranceStatus} onChange={e => setHouseForm(p => ({ ...p, encumbranceStatus: e.target.value }))} className={inputCls}>
                      <option value="">Select Status</option>
                      {ENCUMBRANCE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <CollateralLocationFields values={houseForm.location} onChange={loc => setHouseForm(p => ({ ...p, location: loc }))} />
              </div>
            )}

            {collateralForm.type && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Collateral Documents</p>
              <TypedDocumentUpload docTypes={getCollateralDocTypes(collateralForm.type)} documents={collateralDocuments} setDocuments={setCollateralDocuments} multiple />
            </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              onClick={() => setShowCollateralModal(false)}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCollateral}
              className="px-4 py-2 text-sm font-semibold rounded-xl bg-[#0047ab] hover:bg-blue-700 text-white transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Submit for Approval confirmation modal */}
    {showApprovalModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowApprovalModal(false)}>
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Submit for Approval</h3>
            <button
              onClick={() => setShowApprovalModal(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Submit <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.ref}</span> ({loan.product}, {formatVal(loan.amount, currency, 1)}) for <span className="font-semibold text-slate-800 dark:text-slate-100">{loan.customerName}</span> for approval?
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This opens the Approval Review with disbursement and repayment tracking.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setShowApprovalModal(false)}
              className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
            >
              <Check className="w-4 h-4" />
              Submit
            </button>
          </div>
        </div>
      </div>
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
    </>
  )
}
