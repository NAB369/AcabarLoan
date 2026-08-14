// Institution-wide custom benefit fees (Loan Setting → Benefit Fees) have no settings key of their
// own the way adminFeeRate/lawyerFeeRate do — they're just a name and a rate. A loan refers to one
// by a synthetic key derived from its name, which is what lets the per-loan Benefit Rate panel
// untick a fee or override its rate for a single loan without touching the institution's setting.

export function customFeeRateKey(name) {
  return `custom:${(name || '').trim().toLowerCase()}`
}

export function isCollectionFee(name) {
  return /collection/i.test(name || '')
}

// How a collection fee is billed, chosen per fee in Loan Setting → Benefit Fees. A rate on its own
// doesn't say this: the same 2% can mean one charge on the principal or a charge that accrues each
// month on what is still owed, and the two collect very different amounts.
export const COLLECTION_FEE_METHODS = [
  { value: 'none', label: 'Not charged', hint: 'Configured, but the borrower is not billed for it' },
  { value: 'flat', label: 'Charged', hint: 'Rate is a percentage OF THE PRINCIPAL — one charge, divided across the instalments and billed on top of the instalment' },
  { value: 'annuity', label: 'Charged (annuity)', hint: 'Rate is PER YEAR, like the loan\'s interest rate — a twelfth of it accrues each instalment on the balance still outstanding, and it is priced into the instalment' },
]
export const DEFAULT_COLLECTION_FEE_METHOD = 'annuity'

export function collectionFeeMethod(fee) {
  const m = (fee || {}).method
  return COLLECTION_FEE_METHODS.some(o => o.value === m) ? m : DEFAULT_COLLECTION_FEE_METHOD
}

// The collection fee is charged the way interest is, not as one charge on the principal split
// across the months. Its configured rate is annual, a twelfth of it falls due each installment,
// and it is charged on the principal still outstanding — so it declines over the life of the loan
// exactly as the interest column does. The balance an installment is charged on is the one
// standing before that installment is paid, which is what amortizePeriods uses for interest: the
// row's closing balance plus the principal that row retires. Each row is rounded to the cent as
// it is produced, the same rule the schedule follows for every other figure.
export function collectionFeeSchedule(schedule, annualRate, method = DEFAULT_COLLECTION_FEE_METHOD, loanAmount = 0) {
  const rate = Number(annualRate) || 0
  if (method === 'none' || rate <= 0 || !Array.isArray(schedule) || !schedule.length) return []

  // A schedule built with the fee priced into the instalment already carries the split, and it is
  // the authority: recomputing it here would drift from the totalDue the borrower was quoted.
  // Schedules saved before the fee was priced in have no such field, and fall through.
  // Tested on a fee actually being present, not on the field existing: every schedule built now
  // carries the field, and it is zero on one priced without a fee — a flat fee is charged on top
  // of such a schedule and still has to be worked out here.
  if (schedule.some(row => (row.collectionFee || 0) > 0)) {
    return schedule.map(row => row.collectionFee || 0)
  }

  if (method === 'flat') {
    // One charge on the principal, divided across the installments. The remainder lands on the
    // last one rather than being rounded on every row: twelve shares of a fee that doesn't divide
    // by twelve otherwise sum to a different number than the fee itself, and a borrower adding up
    // the column would find it disagreed with the total.
    const total = Math.round((loanAmount || 0) * (rate / 100) * 100) / 100
    const n = schedule.length
    if (total <= 0.005) return []
    const each = Math.floor((total / n) * 100) / 100
    const parts = Array.from({ length: n }, () => each)
    const spread = Math.round(each * n * 100) / 100
    parts[n - 1] = Math.round((each + (total - spread)) * 100) / 100
    return parts
  }

  const monthlyRate = rate / 100 / 12
  return schedule.map(row => {
    const openingBalance = (row.balance || 0) + (row.principal || 0)
    return Math.round(openingBalance * monthlyRate * 100) / 100
  })
}

// The penalty that applies to an instalment. Once one has actually been charged — End of Day on an
// overdue instalment, or a balance carried from an interest-only payment — that figure is the
// answer. Before then the column would read 0.00 on every row, which tells a borrower nothing about
// what missing a payment costs, so it shows the contracted charge instead.
//
// It is charged on the same basis as interest: the rate is annual, a twelfth of it applies to the
// instalment, and it is measured against the principal still outstanding — so a late payment early
// in the loan costs more than one near the end, exactly as the interest column behaves.
//
// `penaltyMonths` limits how far into the term the penalty applies at all (e.g. the first 18 of a
// 36-month loan); 0 or blank means the whole term.
// How far into the term the penalty applies for a given loan. A loan written before the setting
// existed carries nothing, so the product it was sold under answers instead — otherwise setting
// "18 months" on the product would change nothing for any loan already on the books.
// Rate and period are resolved together, from one source, or the sheet ends up quoting a rate the
// loan carries beside a period the product carries — two different answers in one sentence.
//
// A loan written before the penalty became configurable has no penaltyMonths, and its penaltyRate
// was never a decision anyone made: it was a hardcoded default. Such a loan takes both figures from
// the product it was sold under, so editing the product reaches it. A loan created since carries
// its own terms and keeps them, because a signed loan's terms must not shift underneath it.
export function loanPenaltyTerms(loan, loanProducts) {
  const l = loan || {}
  if (l.penaltyMonths != null) {
    return { rate: Number(l.penaltyRate) || 0, months: Number(l.penaltyMonths) || 0 }
  }
  const product = (loanProducts || []).find(p => p.name === l.product) || {}
  return {
    rate: product.penaltyRate != null ? Number(product.penaltyRate) || 0 : Number(l.penaltyRate) || 0,
    months: Number(product.penaltyMonths) || 0,
  }
}

export function loanPenaltyMonths(loan, loanProducts) {
  return loanPenaltyTerms(loan, loanProducts).months
}

export function installmentPenalty(row, penaltyRate, penaltyMonths = 0) {
  const r = row || {}
  if ((r.lateFee || 0) > 0) return Math.round(r.lateFee * 100) / 100
  const months = Number(penaltyMonths) || 0
  if (months > 0 && (r.num || 0) > months) return 0
  // What this instalment would be penalised: its rate against the principal it leaves outstanding.
  // The final instalment leaves nothing, so it carries none — which is what lets the payoff column
  // below reach exactly zero.
  return Math.round((r.balance || 0) * ((Number(penaltyRate) || 0) / 100 / 12) * 100) / 100
}

// The Penalty Payoff column: not a per-month charge but a balance, the same shape as the principal
// Balance column beside it. It opens at the whole penalty the loan could attract and is drawn down
// by each month's charge, landing on zero at the final instalment.
export function penaltyPayoffSchedule(schedule, penaltyRate, penaltyMonths = 0) {
  const rows = Array.isArray(schedule) ? schedule : []
  const round2 = x => Math.round(x * 100) / 100
  const charges = rows.map(r => installmentPenalty(r, penaltyRate, penaltyMonths))
  const total = round2(charges.reduce((s, v) => s + v, 0))
  let remaining = total
  return rows.map((_, i) => {
    // Month one shows the full figure; every later month shows what the months before it left.
    const outstanding = remaining
    remaining = round2(remaining - charges[i])
    return round2(outstanding)
  })
}

// What an installment asks for in total. The schedule's stored totalDue is principal + interest;
// a charged collection fee is due with that same installment, so the printed Total column has to
// include it — otherwise the sheet's own columns don't add up to the figure beside them.
export function installmentTotal(row, collectionFee) {
  const r = row || {}
  // A row priced with the fee inside it already has it in totalDue — adding it again would bill
  // the borrower twice. A zero here means the schedule was priced without one, and a flat fee
  // charged on top still has to be added.
  if ((r.collectionFee || 0) > 0) return Math.round((r.totalDue || 0) * 100) / 100
  return Math.round(((r.totalDue || 0) + (collectionFee || 0)) * 100) / 100
}

// Column totals for the printed schedule. Worth showing: the principal column must sum to the
// amount borrowed, which is what makes it obvious that the collection fee is charged on top of the
// installment rather than taken out of it — a fee funded from principal would leave the loan short
// at maturity, with the balance column never reaching zero.
export function scheduleTotals(rows, collectionFeeRows = [], penaltyRate = 0, penaltyMonths = 0) {
  const round2 = x => Math.round(x * 100) / 100
  const sum = fn => round2((rows || []).reduce((s, r, i) => s + (fn(r, i) || 0), 0))
  return {
    principal: sum(r => r.principal),
    interest: sum(r => r.interest),
    collectionFee: round2((collectionFeeRows || []).reduce((s, v) => s + (v || 0), 0)),
    // What the whole schedule would attract in penalties if every instalment fell overdue, with
    // any already charged counted at their actual figure. Summed for the reader, never added into
    // the Total column — a penalty is owed only when a payment is missed.
    penalty: sum(r => installmentPenalty(r, penaltyRate, penaltyMonths)),
    total: sum((r, i) => installmentTotal(r, collectionFeeRows[i])),
  }
}

// What the loan is charged in collection fees over its whole term: the sum of the rows above, so
// the Benefit figure and the schedule column can never disagree.
export function collectionFeeTotal(schedule, annualRate, method, loanAmount) {
  const rows = collectionFeeSchedule(schedule, annualRate, method, loanAmount)
  return Math.round(rows.reduce((sum, v) => sum + v, 0) * 100) / 100
}

// The rate a loan actually charges: the officer's per-loan override if there is one, else the
// institution-wide rate. An override of '' means "not set", not "zero".
export function overriddenRate(overrides, key, fallback) {
  const o = (overrides || {})[key]
  return (o != null && o !== '') ? Number(o) : (fallback || 0)
}

// What one custom fee comes to on this loan. Every fee but the collection fee is a single charge
// on the principal; the collection fee accrues per installment like interest, so it is worth what
// its schedule sums to. Without a schedule to accrue over — a loan whose term isn't set yet — it
// falls back to the flat calculation rather than reporting nothing.
function customFeeAmount(name, rate, loan, schedule, method) {
  if (!isCollectionFee(name)) return (loan.amount || 0) * (rate / 100)
  if (method === 'none') return 0
  if (Array.isArray(schedule) && schedule.length) return collectionFeeTotal(schedule, rate, method, loan.amount)
  return (loan.amount || 0) * (rate / 100)
}

// Every institution-wide custom fee, with this loan's rate applied. `skipCategories` drops any
// that duplicates a built-in fee's category.
export function loanCustomFeeItems(loan, feeSettings, skipCategories = new Set(), schedule) {
  const overrides = loan.benefitFeeRates || {}
  return ((feeSettings || {}).customFees || [])
    .filter(f => !skipCategories.has((f.name || '').toLowerCase()))
    // A collection fee set to "Not charged" is off institution-wide: it drops out of every loan's
    // fee list entirely rather than showing as a card worth nothing.
    .filter(f => !(isCollectionFee(f.name) && collectionFeeMethod(f) === 'none'))
    .map(f => {
      const rateKey = customFeeRateKey(f.name)
      const rate = overriddenRate(overrides, rateKey, f.rate)
      const method = collectionFeeMethod(f)
      return { category: f.name, rate, rateKey, method, amount: customFeeAmount(f.name, rate, loan, schedule, method) }
    })
}

// The ones this loan is actually charged — the officer can untick a fee per loan. Tracked by
// exclusion, so a loan saved before these became tickable keeps charging them.
export function appliedCustomFeeItems(loan, feeSettings, skipCategories, schedule) {
  const excluded = loan.excludedBenefitFeeKeys || []
  return loanCustomFeeItems(loan, feeSettings, skipCategories, schedule).filter(f => !excluded.includes(f.rateKey))
}

// The collection-fee rate a schedule should be PRICED AT — i.e. folded into the instalment so the
// borrower pays one level figure. Only the annuity option works that way: 'flat' is a single charge
// divided across the months and stays on top of the instalment, and 'none' isn't charged at all.
// Returns an annual rate, matching how every other rate in the app is expressed.
export function chargedCollectionRate(loan, feeSettings) {
  const fee = benefitCustomFeeItems(loan || {}, feeSettings || {}, new Set())
    .find(f => isCollectionFee(f.category))
  return fee && fee.method === 'annuity' ? (fee.rate || 0) : 0
}

// The built-in fees that classically apply to a product. Only a default: it decides what a loan
// nobody has customised yet is charged, and seeds the Benefit Rate panel's ticks.
export function productDefaultFeeKeys(product) {
  const p = (product || '').toLowerCase()
  if (p.includes('personal')) return ['adminFeeRate']
  if (p.includes('car') || p.includes('vehicle')) return ['adminFeeRate', 'insuranceFeeRate', 'transportMinistryFeeRate']
  return ['adminFeeRate', 'insuranceFeeRate', 'lawyerFeeRate', 'ministryFeeRate']
}

// Which built-in fees this loan carries: the officer's ticks from the Benefit Rate panel once
// they've saved a selection, the product default until then. Every screen that prints the Benefit
// figures must read this — printing the product default over the officer's choice is what made
// Loan Preview show fees the officer had already unticked.
export function selectedBuiltInFeeKeys(loan) {
  return Array.isArray(loan.benefitFeeKeys) ? loan.benefitFeeKeys : productDefaultFeeKeys(loan.product)
}

// Custom fees the officer added to this one loan in the Benefit Rate panel, each with its tick.
// Two entries with the same name are one fee entered twice, not two charges — the first wins.
export function loanOwnCustomFeeItems(loan, schedule) {
  const seen = new Set()
  return (loan.customBenefitFees || [])
    .filter(f => (f.name || '').trim() && f.included !== false)
    .filter(f => {
      const name = f.name.trim().toLowerCase()
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
    .filter(f => !(isCollectionFee(f.name) && collectionFeeMethod(f) === 'none'))
    .map(f => {
      const method = collectionFeeMethod(f)
      return { category: f.name, rate: f.rate || 0, method, amount: customFeeAmount(f.name, f.rate || 0, loan, schedule, method) }
    })
}

// Every custom fee this loan is charged, institution-wide and its own, as one list. A per-loan fee
// named after an institution one *replaces* it rather than stacking on top: an officer writing
// "Collection Fee" against this loan means this loan's collection fee, not a second one. Fee names
// are the identity here (the per-loan rate key is derived from the name), so the same name twice
// is always one fee.
export function benefitCustomFeeItems(loan, feeSettings, skipCategories, schedule) {
  const own = loanOwnCustomFeeItems(loan, schedule)
  const ownNames = new Set(own.map(f => f.category.trim().toLowerCase()))
  const institution = appliedCustomFeeItems(loan, feeSettings, skipCategories, schedule)
    .filter(f => !ownNames.has((f.category || '').trim().toLowerCase()))
  return [...institution, ...own]
}
