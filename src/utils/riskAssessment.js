const CREDIT_HISTORY_FIELD = { borrower: 'creditHistoryInfo', coBorrower: 'coBorrowerCreditHistoryInfo', guarantor: 'guarantorCreditHistoryInfo' }
const CREDIT_HISTORY_LABEL = { borrower: 'Borrower', coBorrower: 'Co-Borrower', guarantor: 'Guarantor' }

// Derives a risk read-out purely from a party's CBC data — no manual credit-officer
// input. Each rule contributes one factor to either the positive or negative side;
// any negative factor tips that party's status to High Risk.
export function assessCreditRisk(info) {
  if (!info) return null
  const positives = []
  const negatives = []

  const kScore = parseFloat(info.kScore)
  if (!isNaN(kScore)) {
    if (kScore >= 700) positives.push(`CBC K-Score of ${kScore} indicates strong creditworthiness`)
    else if (kScore < 600) negatives.push(`CBC K-Score of ${kScore} is below the acceptable threshold (600)`)
    else positives.push(`CBC K-Score of ${kScore} is within an acceptable range`)
  }

  const delinquencies = parseFloat(info.delinquencies)
  if (!isNaN(delinquencies)) {
    if (delinquencies === 0) positives.push('No recorded delinquencies')
    else negatives.push(`${delinquencies} delinquenc${delinquencies === 1 ? 'y' : 'ies'} on record`)
  }

  if (info.paymentRecord) {
    if (/^(excellent|good)/i.test(info.paymentRecord)) positives.push(`Payment record: ${info.paymentRecord}`)
    else if (/^(fair|poor)/i.test(info.paymentRecord)) negatives.push(`Payment record: ${info.paymentRecord}`)
  }

  if (info.publicRecords) {
    if (/^none$/i.test(info.publicRecords.trim())) positives.push('No public records or defaults')
    else negatives.push(`Public records / defaults on file: ${info.publicRecords}`)
  }

  const enquiries = parseFloat(info.enquiries6Months)
  if (!isNaN(enquiries)) {
    if (enquiries > 3) negatives.push(`${enquiries} CBC enquiries in the last 6 months — elevated credit-seeking activity`)
    else positives.push(`Only ${enquiries} CBC enquir${enquiries === 1 ? 'y' : 'ies'} in the last 6 months`)
  }

  const accounts = info.accounts || []
  const flaggedAccounts = accounts.filter(a => a.status === 'Delinquent' || a.status === 'Write-off')
  if (flaggedAccounts.length > 0) {
    const names = flaggedAccounts.map(a => a.institution).filter(Boolean).join(', ')
    negatives.push(`${flaggedAccounts.length} account${flaggedAccounts.length === 1 ? '' : 's'} flagged ${[...new Set(flaggedAccounts.map(a => a.status))].join('/')}${names ? ` — ${names}` : ''}`)
  } else if (accounts.length > 0) {
    positives.push('All credit accounts in Normal or Closed standing')
  }

  const lateCycles = accounts.reduce((sum, a) => sum + (a.cycles || []).filter(c => c === '60' || c === '90').length, 0)
  if (lateCycles > 0) {
    negatives.push(`${lateCycles} instance${lateCycles === 1 ? '' : 's'} of 60+ day late payment across accounts in the last 24 cycles`)
  }

  const status = negatives.length > 0 ? 'High Risk' : 'No Risk'
  return { status, positives, negatives }
}

// Aggregates borrower / co-borrower / guarantor CBC-derived assessments into one
// loan-level verdict — any party flagged High Risk makes the whole loan High Risk.
// A credit officer can also supplement the auto-derived factors with manual entries
// (loan.manualRiskFactors) — those count toward the overall status the same way.
export function assessLoanRisk(loan) {
  const parties = ['borrower', 'coBorrower', 'guarantor']
    .map(target => ({ target, label: CREDIT_HISTORY_LABEL[target], assessment: assessCreditRisk(loan?.[CREDIT_HISTORY_FIELD[target]]) }))
    .filter(p => p.assessment)

  const autoPositives = []
  const autoNegatives = []
  parties.forEach(p => {
    p.assessment.positives.forEach(reason => autoPositives.push(`${p.label}: ${reason}`))
    p.assessment.negatives.forEach(reason => autoNegatives.push(`${p.label}: ${reason}`))
  })

  const manualPositives = loan?.manualRiskFactors?.positives || []
  const manualNegatives = loan?.manualRiskFactors?.negatives || []

  const positives = [...autoPositives, ...manualPositives]
  const negatives = [...autoNegatives, ...manualNegatives]

  const status = parties.length === 0 && positives.length === 0 && negatives.length === 0
    ? 'Not Assessed'
    : (negatives.length > 0 ? 'High Risk' : 'No Risk')

  return { status, positives, negatives, autoPositives, autoNegatives, manualPositives, manualNegatives, parties }
}
