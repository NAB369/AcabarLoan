import { combineStatementAnalyses } from './parseBankStatement'
import { assessStatementIncome, assessableIncome, DOC_STATUS } from './statementIncome'
import { assessStatementExpense, assessableExpense, EXPENSE_STATUS } from './statementExpense'
import { INCOME_FIELD, INCOME_LIST_FIELD, INCOME_LABEL } from './income'
import { EXPENSE_FIELD } from './expense'
import { assessCreditRisk } from './riskAssessment'
import { affordabilityTargets } from './loanParties'

// ── Consolidated credit verification ──────────────────────────────────────────
// The per-document verdicts already exist (statementIncome / statementExpense read what the
// bank statements demonstrate; riskAssessment reads the CBC). What was missing was the layer a
// credit committee actually signs off: one status, one confidence, one risk level and one
// recommended action per party, and the affordability ratios for the household as a whole.
//
// Two rules govern everything below, because this feeds a real lending decision:
//
//   1. A check that was not run never counts as passed. Forgery, tampering and edited-image
//      detection are impossible in a browser with no issuer to verify against and no forensic
//      capability — they are reported as outstanding manual work (see MANUAL_REVIEW_CHECKS)
//      and are deliberately excluded from every score.
//   2. Confidence is evidence, not agreement. A declared figure with nothing behind it scores
//      low even when nothing contradicts it — "no evidence against" is not verification.

export const VERIFICATION = {
  verified: 'Verified',
  partial: 'Partially Verified',
  unverified: 'Not Verified',
}

export const RISK = { low: 'Low', medium: 'Medium', high: 'High' }

export const RECOMMENDATION = {
  approve: 'Approve',
  review: 'Manual Review',
  reject: 'Reject',
}

// Ratio thresholds. DTI is the one a Cambodian MFI credit policy is usually written around;
// the others are supporting reads rather than hard gates.
export const DTI_LIMIT_PCT = 50
export const DTI_CAUTION_PCT = 40

const round2 = n => Math.round(n * 100) / 100
const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : null)

// Checks a browser cannot honestly perform. Listed so the officer sees what the system did NOT
// clear rather than inferring from a clean report that everything was examined. Nothing here
// contributes to a score in either direction.
export const MANUAL_REVIEW_CHECKS = [
  { id: 'forged-payslip', label: 'Salary slip authenticity', why: 'No issuer to verify against — confirm with the employer directly.' },
  { id: 'forged-letter', label: 'Employment certificate authenticity', why: 'Letterhead and signature cannot be authenticated from the file alone.' },
  { id: 'edited-image', label: 'Image and scan tampering', why: 'Requires forensic analysis the app cannot perform.' },
  { id: 'statement-authenticity', label: 'Bank statement authenticity', why: 'Figures are read and reconciled, but the document itself is not authenticated with the bank.' },
  { id: 'identity', label: 'Identity confirmation', why: 'ID documents are recorded, not validated against a registry.' },
  { id: 'undisclosed-informal', label: 'Undisclosed informal borrowing', why: 'Lending outside the CBC leaves no record to check.' },
]

function incomeEntriesOf(loan, target) {
  const list = loan?.[INCOME_LIST_FIELD[target]]
  if (Array.isArray(list) && list.length) return list
  // Entries saved before the list replaced the single record still live on the legacy field.
  const legacy = loan?.[INCOME_FIELD[target]]
  return legacy ? [legacy] : []
}

// ── Income ───────────────────────────────────────────────────────────────────
// Each declared source is held against what its own documents demonstrate. The existing
// statement reader supplies the verdict; this adds the per-source roll-up and the finding that
// a source has no supporting document at all — which the reader cannot report, because with no
// document there is nothing for it to read.
export function verifyIncome(loan, target) {
  const entries = incomeEntriesOf(loan, target)
  const sources = entries.map((info, index) => {
    const declared = Number(info?.totalMonthlyIncome) || 0
    const documents = [...(info?.documents || []), ...(info?.companyDocuments || [])]
    const analysis = combineStatementAnalyses(info?.documents)
    const verdict = assessStatementIncome(analysis, declared)
    const label = [info?.occupation || info?.employmentStatus, info?.companyName].filter(Boolean).join(' · ')
      || `Income source ${index + 1}`
    return {
      index,
      label,
      declared,
      assessable: assessableIncome(info),
      documentCount: documents.length,
      hasDocuments: documents.length > 0,
      state: verdict.state,
      reason: documents.length === 0
        ? 'Declared with no supporting document on file — nothing to verify it against'
        : verdict.reason,
      monthsOnFile: verdict.reading?.monthsCount ?? 0,
    }
  })

  const declared = round2(sources.reduce((s, x) => s + x.declared, 0))
  const assessable = round2(sources.reduce((s, x) => s + x.assessable, 0))
  const undocumented = sources.filter(s => !s.hasDocuments)
  const verifiedSources = sources.filter(s => s.state === DOC_STATUS.verified)
  const lowerSources = sources.filter(s => s.state === DOC_STATUS.lower)

  // Confidence is the share of declared income that documents actually stand behind, so a
  // large unevidenced source drags it down however many small verified ones sit beside it.
  const evidenced = round2(sources
    .filter(s => s.state === DOC_STATUS.verified || s.state === DOC_STATUS.lower)
    .reduce((s, x) => s + x.declared, 0))
  const confidence = declared > 0 ? Math.round((evidenced / declared) * 100) : 0

  let status = VERIFICATION.unverified
  if (sources.length && verifiedSources.length === sources.length) status = VERIFICATION.verified
  else if (verifiedSources.length || lowerSources.length) status = VERIFICATION.partial

  const findings = []
  if (!sources.length) findings.push('No income declared for this party')
  for (const s of undocumented) findings.push(`${s.label}: declared ${s.declared.toFixed(2)} with no supporting document`)
  for (const s of lowerSources) findings.push(`${s.label}: statements demonstrate less than declared — assessed at ${s.assessable.toFixed(2)}`)
  for (const s of sources.filter(x => x.state === DOC_STATUS.partial)) findings.push(`${s.label}: ${s.reason}`)

  return { sources, declared, assessable, confidence, status, findings, capped: round2(declared - assessable) > 0 }
}

// ── Expense ──────────────────────────────────────────────────────────────────
export function verifyExpense(loan, target) {
  const info = loan?.[EXPENSE_FIELD[target]]
  const declared = Number(info?.totalMonthlyExpense) || 0
  const analysis = combineStatementAnalyses(info?.documents)
  const verdict = assessStatementExpense(analysis, declared)
  const items = info?.expenses || []
  const documented = (info?.documents || []).length > 0

  const findings = []
  if (!items.length) findings.push('No household expenses declared — a borrower with no outgoings at all is not a credible budget')
  if (!documented) findings.push('No bank statement filed against the expense budget — the declared figure stands on its own')
  if (verdict.state === EXPENSE_STATUS.higher) findings.push(verdict.reason)
  if (verdict.state === EXPENSE_STATUS.partial) findings.push(verdict.reason)

  // Duplicate category lines are a common data-entry fault and quietly inflate the budget.
  const seen = new Map()
  for (const e of items) {
    const key = `${(e.category || '').trim().toLowerCase()}|${e.amount}`
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  for (const [key, count] of seen) {
    if (count > 1) findings.push(`Duplicate expense line entered ${count} times — ${key.split('|')[0] || 'uncategorised'}`)
  }

  let status = VERIFICATION.unverified
  if (verdict.state === EXPENSE_STATUS.verified) status = VERIFICATION.verified
  else if (verdict.state === EXPENSE_STATUS.higher || verdict.state === EXPENSE_STATUS.partial) status = VERIFICATION.partial

  const confidence = status === VERIFICATION.verified ? 90
    : status === VERIFICATION.partial ? 55
    : declared > 0 ? 20 : 0

  return {
    declared,
    assessable: assessableExpense(info),
    itemCount: items.length,
    documented,
    // Whether the assessed figure came off the statements rather than the declared budget. It
    // matters downstream: a statement total is all money out, so it already contains any loan
    // repayments that left the account, and subtracting bureau debt service on top of it counts
    // the same money twice. Surfaced rather than corrected — see the note in the panel.
    fromStatement: !!verdict.reading?.monthlySpend,
    state: verdict.state,
    reason: verdict.reason,
    status,
    confidence,
    findings,
  }
}

// ── Per party ────────────────────────────────────────────────────────────────
export function verifyParty(loan, target) {
  const income = verifyIncome(loan, target)
  const expense = verifyExpense(loan, target)
  const credit = assessCreditRisk(loan?.[{ borrower: 'creditHistoryInfo', coBorrower: 'coBorrowerCreditHistoryInfo', guarantor: 'guarantorCreditHistoryInfo' }[target]])

  // Income carries the most weight: it is what the loan is repaid from, and it is the figure
  // most often overstated. The CBC is a hard signal rather than a weighted one — a party the
  // bureau has flagged does not become low risk because their payslips are tidy.
  const confidence = Math.round(income.confidence * 0.6 + expense.confidence * 0.4)

  let risk = RISK.low
  if (confidence < 50 || income.status === VERIFICATION.unverified) risk = RISK.high
  else if (confidence < 75 || income.capped || expense.status !== VERIFICATION.verified) risk = RISK.medium
  if (credit?.status === 'High Risk') risk = RISK.high

  const status = income.status === VERIFICATION.verified && expense.status === VERIFICATION.verified
    ? VERIFICATION.verified
    : income.status === VERIFICATION.unverified && expense.status === VERIFICATION.unverified
      ? VERIFICATION.unverified
      : VERIFICATION.partial

  const findings = [
    ...income.findings,
    ...expense.findings,
    ...(credit?.negatives || []).map(n => `CBC: ${n}`),
  ]

  const action = status === VERIFICATION.verified && risk === RISK.low
    ? 'Proceed — evidence supports the declared position.'
    : income.sources.some(s => !s.hasDocuments)
      ? 'Collect supporting documents for every undocumented income source before proceeding.'
      : !expense.documented
        ? 'Collect 6 months of bank statements to substantiate the expense budget.'
        : income.capped
          ? 'Reassess capacity on the statement-demonstrated income, and confirm the shortfall with the applicant.'
          : 'Refer to a credit officer to clear the outstanding findings.'

  return { target, label: INCOME_LABEL[target], income, expense, credit, confidence, risk, status, findings, action }
}

// ── Affordability ────────────────────────────────────────────────────────────
// Household figures, on the assessable side rather than the declared one — capacity has to be
// measured against what the evidence supports, not what was written on the form.
// Targets default to the parties the loan actually has. Scoring a co-borrower that was never
// added produced a party with no income at all — which both showed as an empty Co-Borrower
// card and tripped the "at least one party has no verified income" blocker in recommendCredit
// below, pushing a perfectly good single-borrower loan toward Reject.
export function assessAffordability(loan, targets = affordabilityTargets(loan)) {
  const parties = targets.map(t => verifyParty(loan, t))
  const income = round2(parties.reduce((s, p) => s + p.income.assessable, 0))
  const declaredIncome = round2(parties.reduce((s, p) => s + p.income.declared, 0))
  const expense = round2(parties.reduce((s, p) => s + p.expense.assessable, 0))

  // What the borrower already services elsewhere, taken from the bureau rather than from the
  // application — an existing loan the applicant did not mention is exactly what this catches.
  const existingDebt = round2(targets.reduce((sum, t) => {
    const info = loan?.[{ borrower: 'creditHistoryInfo', coBorrower: 'coBorrowerCreditHistoryInfo' }[t]]
    return sum + (info?.accounts || []).reduce((s, a) => s + (Number(a.monthlyPayment) || 0), 0)
  }, 0))

  const newInstalment = round2(Number(loan?.emi) || 0)
  const debtService = round2(existingDebt + newInstalment)
  const disposable = round2(income - expense)
  const net = round2(disposable - debtService)

  return {
    parties,
    declaredIncome,
    income,
    expense,
    expenseFromStatement: parties.some(p => p.expense.fromStatement),
    existingDebt,
    newInstalment,
    debtService,
    disposable,
    net,
    dti: pct(debtService, income),
    expenseRatio: pct(expense, income),
    savingsRatio: pct(net, income),
  }
}

// ── Final recommendation ─────────────────────────────────────────────────────
// Reject is reserved for a position the evidence contradicts or the borrower cannot afford.
// Everything short of that is Manual Review rather than Approve — an automated pass on thin
// evidence is the failure mode that costs money.
export function recommendCredit(loan, targets = affordabilityTargets(loan)) {
  const affordability = assessAffordability(loan, targets)
  const { parties, dti, net } = affordability

  const overall = parties.length
    ? Math.round(parties.reduce((s, p) => s + p.confidence, 0) / parties.length)
    : 0

  const blockers = []
  if (net < 0) blockers.push(`Net cash flow is negative (${net.toFixed(2)}) — the household cannot service this instalment`)
  if (dti !== null && dti > DTI_LIMIT_PCT) blockers.push(`Debt-to-income of ${dti}% exceeds the ${DTI_LIMIT_PCT}% policy limit`)
  if (parties.some(p => p.income.status === VERIFICATION.unverified)) {
    blockers.push('At least one party has no verified income at all')
  }

  const cautions = []
  if (dti !== null && dti > DTI_CAUTION_PCT && dti <= DTI_LIMIT_PCT) cautions.push(`Debt-to-income of ${dti}% is close to the ${DTI_LIMIT_PCT}% limit`)
  for (const p of parties) {
    if (p.risk === RISK.high) cautions.push(`${p.label} is High Risk`)
    else if (p.status !== VERIFICATION.verified) cautions.push(`${p.label} is only ${p.status.toLowerCase()}`)
  }

  const recommendation = blockers.length
    ? RECOMMENDATION.reject
    : (cautions.length || overall < 80)
      ? RECOMMENDATION.review
      : RECOMMENDATION.approve

  return {
    ...affordability,
    overall,
    incomeScore: parties.length ? Math.round(parties.reduce((s, p) => s + p.income.confidence, 0) / parties.length) : 0,
    expenseScore: parties.length ? Math.round(parties.reduce((s, p) => s + p.expense.confidence, 0) / parties.length) : 0,
    blockers,
    cautions,
    recommendation,
    manualChecks: MANUAL_REVIEW_CHECKS,
  }
}
