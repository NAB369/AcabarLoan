// Which parties are actually on a loan.
//
// Co-borrower and guarantor are optional. Both are stored as a list (`coBorrowers`,
// `guarantors`) with an older single-record shape (`coBorrower`, `guarantor`) still on loans
// saved before the lists existed, so presence has to be read through both.
//
// A loan that has neither should not offer them, score them, or show a section for them —
// an absent co-borrower is not a party with no income, and treating it as one drags the
// household figures down and reads as missing data rather than a party that was never added.

export function hasCoBorrower(loan) {
  return !!(loan?.coBorrowers?.length || loan?.coBorrower)
}

export function hasGuarantor(loan) {
  return !!(loan?.guarantors?.length || loan?.guarantor)
}

export function hasParty(loan, target) {
  if (target === 'coBorrower') return hasCoBorrower(loan)
  if (target === 'guarantor') return hasGuarantor(loan)
  return true
}

// Whose record a party tab is showing. With more than one co-borrower or guarantor this names
// the first — the records that hang off these targets (one expense record per party) are not
// per-person either, so there is no second name to attribute anything to. The Customer tab,
// which does list every person, builds its own subtitle from the full list.
export function partyName(loan, target) {
  if (target === 'coBorrower') return (loan?.coBorrowers?.[0] || loan?.coBorrower)?.enName || ''
  if (target === 'guarantor') return (loan?.guarantors?.[0] || loan?.guarantor)?.enName || ''
  return loan?.customerName || ''
}

// The parties that count toward household affordability. The guarantor is deliberately absent:
// they back the loan without borrowing, so their income is not household capacity — see
// assessAffordability in creditVerification.js.
export function affordabilityTargets(loan) {
  return hasCoBorrower(loan) ? ['borrower', 'coBorrower'] : ['borrower']
}
