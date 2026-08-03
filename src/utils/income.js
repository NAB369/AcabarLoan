// Income-related constants and helpers shared by the loan detail income tab, the
// add/edit income modal and the income verification workspace.

export const INCOME_DOC_TYPES = ['Payslips', 'Bank Statement', 'Business License', 'Other']
export const BUSINESS_OCCUPATIONS = ['Business Owner', 'Shop Owner', 'Small Business Trader', 'Restaurant Owner']
export const BUSINESS_INCOME_TYPES = ['Retail', 'Service', 'Rent', 'Wholesale', 'Other']

export const INCOME_FIELD = { borrower: 'borrowerIncomeInfo', coBorrower: 'coBorrowerIncomeInfo', guarantor: 'guarantorIncomeInfo' }
export const INCOME_LIST_FIELD = { borrower: 'borrowerIncomes', coBorrower: 'coBorrowerIncomes', guarantor: 'guarantorIncomes' }
export const INCOME_LABEL = { borrower: 'Borrower', coBorrower: 'Co-Borrower', guarantor: 'Guarantor' }
export const INCOME_TARGETS = ['borrower', 'coBorrower', 'guarantor']

export const CAMBODIA_BANKS = [
  'ABA Bank', 'ACLEDA Bank', 'Canadia Bank', 'Cambodian Public Bank (Campu)', 'CIMB Bank',
  'Maybank', 'Vattanac Bank', 'Phillip Bank', 'Prince Bank', 'RHB Bank', 'Sathapana Bank',
  'Wing Bank', 'Foreign Trade Bank (FTB)', 'Hattha Bank', 'Chip Mong Bank', 'PPCBank', 'Other',
]

// Employed / part-time parties are asked about a workplace; a business owner is not.
export function hasWorkplace(employmentStatus) {
  return employmentStatus === 'Employed' || employmentStatus === 'Part-time'
}

export function getIncomeProofDocTypes(employmentStatus, occupation) {
  if (employmentStatus === 'Employed' || employmentStatus === 'Part-time') return ['Payslips', 'Bank Statement']
  if (BUSINESS_OCCUPATIONS.includes(occupation) && employmentStatus === 'Rent') return [...INCOME_DOC_TYPES.slice(0, -1), 'Rent Agreement']
  return INCOME_DOC_TYPES.filter(t => t !== 'Other')
}

export function getIncomeCompanyDocTypes(employmentStatus) {
  return employmentStatus === 'Part-time'
    ? ['Certificate of Employment', 'Work Place Image']
    : ['Certificate of Employment']
}

// Demo-only "verification": the app has no OCR/document-reading capability, so this
// approximates a name/company match by checking the uploaded file's name text —
// it is not a real read of the document's contents.
function nameMatches(fileName, name) {
  if (!fileName || !name) return false
  const normalizedFile = fileName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  return name.toLowerCase().split(/\s+/).filter(p => p.length > 1).some(part => normalizedFile.includes(part))
}

function fileNameWords(fileName) {
  return (fileName || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
}

// Does an uploaded file's name carry any of the names it should belong to — the applicant's,
// or their employer's? The same demo-grade check as getIncomeDocBadgeStatus, but for any
// document type rather than the three that one recognises.
export function fileNameMatchesAny(fileName, candidateNames) {
  return (candidateNames || []).some(name => nameMatches(fileName, name))
}

export function getIncomeDocBadgeStatus(doc, allDocs, candidateNames) {
  const relevantTypes = ['Payslips', 'Bank Statement', 'Certificate of Employment']
  if (!relevantTypes.includes(doc.docType)) return null

  // Direct match against the borrower/co-borrower/guarantor name(s) or the company/employer name
  if (candidateNames.some(n => nameMatches(doc.name, n))) return 'Verified'

  if (doc.docType === 'Certificate of Employment') {
    // Fallback: no direct name/company match on the certificate itself — check whether it
    // shares wording (e.g. the employer name) with the payslip/bank statement already uploaded
    const otherDocs = allDocs.filter(d => d !== doc && (d.docType === 'Payslips' || d.docType === 'Bank Statement'))
    if (otherDocs.length === 0) return null
    const certWords = new Set(fileNameWords(doc.name))
    const matched = otherDocs.some(d => fileNameWords(d.name).some(w => certWords.has(w)))
    return matched ? 'Verified' : 'Unverified'
  }

  return 'Unverified'
}

/* ------------------------------------------------------------------ *
 * Verification review — the reviewer's decision on one income entry  *
 * ------------------------------------------------------------------ */

export const VERIFY_STATUS = {
  draft: 'Draft',
  unverified: 'Unverified',
  verified: 'Verified',
  moreDocs: 'More Documents Requested',
  rejected: 'Rejected',
  flagged: 'Flagged for Fraud',
}

// Statuses written under the previous labels. Data already in localStorage carries them, so
// every read is mapped forward rather than left to render as an unknown status.
const LEGACY_STATUS = { 'Pending Review': VERIFY_STATUS.unverified }

export function normalizeVerifyStatus(status) {
  return LEGACY_STATUS[status] || status
}

// Tailwind classes per status, used for the pill in the header, the summary card and the
// history rows so one status always reads the same colour everywhere.
export const VERIFY_STATUS_STYLE = {
  [VERIFY_STATUS.draft]: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600',
  [VERIFY_STATUS.unverified]: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  [VERIFY_STATUS.verified]: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  [VERIFY_STATUS.moreDocs]: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
  [VERIFY_STATUS.rejected]: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
  [VERIFY_STATUS.flagged]: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200 dark:bg-fuchsia-900/20 dark:text-fuchsia-400 dark:border-fuchsia-800',
}

export const EMPTY_VERIFICATION = {
  status: VERIFY_STATUS.unverified,
  verifiedIncome: '',
  employerConfirmed: '',
  incomeStable: '',
  riskLevel: 'Low',
  notes: '',
  reviewedBy: '',
  reviewedAt: '',
  history: [],
}

// An income entry saved before the verification workspace existed carries no `verification`
// block, so every read goes through here and gets the unverified default.
export function getVerification(info) {
  const stored = { ...EMPTY_VERIFICATION, ...(info?.verification || {}) }
  return { ...stored, status: normalizeVerifyStatus(stored.status) }
}

// The income tab records no reviewer decision, so the status is read off the evidence: an
// income counts as verified once the company named on the application is found on the
// uploaded bank statement. A fraud flag or a rejection already on file is never overwritten
// by that — a person said no, and a name match cannot undo it.
export function deriveVerifyStatus(info, nameMatch) {
  const { status } = getVerification(info)
  if (status === VERIFY_STATUS.rejected || status === VERIFY_STATUS.flagged) return status
  return nameMatch === true ? VERIFY_STATUS.verified : VERIFY_STATUS.unverified
}

// Whether a review carries a usable verified figure — an untouched review holds '' and a
// legacy entry may hold nothing at all, and neither is a zero to be summed.
export function hasVerifiedFigure(verification) {
  const v = verification?.verifiedIncome
  return v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v))
}

// How far the verified figure sits from what the borrower declared. Anything within 5% is
// treated as a match (rounding, a bonus month), up to 15% is minor, beyond that is material.
export function incomeDifference(declared, verified) {
  const dec = Number(declared) || 0
  const ver = verified === '' || verified === null || verified === undefined ? null : Number(verified)
  if (ver === null || Number.isNaN(ver)) return { pending: true, amount: 0, pct: 0, label: 'Not verified', tone: 'neutral' }
  const amount = ver - dec
  const pct = dec > 0 ? Math.abs(amount) / dec * 100 : (amount === 0 ? 0 : 100)
  if (pct <= 5) return { pending: false, amount, pct, label: 'Match', tone: 'good' }
  if (pct <= 15) return { pending: false, amount, pct, label: 'Minor Difference', tone: 'warn' }
  return { pending: false, amount, pct, label: 'Major Difference', tone: 'bad' }
}

export const DIFF_TONE_STYLE = {
  neutral: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600',
  good: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  warn: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  bad: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800',
}

