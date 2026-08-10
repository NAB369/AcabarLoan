import { hasCoBorrower, hasGuarantor } from './loanParties'

// Every file attached anywhere on a loan, gathered into one list for the Loan Profile's
// Documents section — identity papers, collateral titles, income and expense evidence, and the
// bureau report. Both Loan Preview and Approval Review print it, so it is built once here.
//
// A group with nothing uploaded is dropped rather than printing a heading over "No documents
// uploaded": the profile is a document that gets read and filed, and an empty heading on it is
// a line the reader has to discount. A caller can therefore also use the length of this list to
// decide whether the Documents section prints at all.
//
// The bureau report appears here and nowhere else. CBCReport can render the file itself, which
// is why the profile passes `hideDocument` — listed twice, a reader cannot tell whether two
// reports were filed or one was shown twice.

const CREDIT_HISTORY_FIELD = {
  borrower: 'creditHistoryInfo',
  coBorrower: 'coBorrowerCreditHistoryInfo',
  guarantor: 'guarantorCreditHistoryInfo',
}
const PARTY_LABEL = { borrower: 'Borrower', coBorrower: 'Co-Borrower', guarantor: 'Guarantor' }

const uploaded = docs => (docs || []).filter(d => d && (d.dataUrl || d.name))

// Uploads are stored as `reports`, each carrying its own file, and mirrored into `documents`;
// entries filed before the reader handled several reports carry only the latter.
function cbcFiles(info) {
  return uploaded(info?.reports?.length ? info.reports.map(r => r.document) : info?.documents)
}

const listOf = (loan, listKey, singleKey) =>
  (loan?.[listKey]?.length ? loan[listKey] : (loan?.[singleKey] ? [loan[singleKey]] : []))

export function buildProfileDocGroups(loan, customer) {
  const groups = []
  const add = (key, label, documents) => {
    const files = uploaded(documents)
    if (files.length) groups.push({ key, label, documents: files })
  }
  const suffix = (i, arr) => (arr.length > 1 ? ` ${i + 1}` : '')

  add('customer', 'Customer — Identity Documents', customer?.documents)

  const coBorrowers = listOf(loan, 'coBorrowers', 'coBorrower')
  coBorrowers.forEach((cb, i) =>
    add(`cb-${i}`, `Co-Borrower${suffix(i, coBorrowers)} — Identity Documents`, cb?.documents))

  const guarantors = listOf(loan, 'guarantors', 'guarantor')
  guarantors.forEach((g, i) =>
    add(`g-${i}`, `Guarantor${suffix(i, guarantors)} — Identity Documents`, g?.documents))

  // Only for parties the loan actually has — a bureau report filed against a party that was
  // never added would otherwise print under a heading naming nobody.
  const cbcTargets = ['borrower',
    ...(hasCoBorrower(loan) ? ['coBorrower'] : []),
    ...(hasGuarantor(loan) ? ['guarantor'] : [])]
  for (const target of cbcTargets) {
    add(`cbc-${target}`, `${PARTY_LABEL[target]} — CBC Report`, cbcFiles(loan?.[CREDIT_HISTORY_FIELD[target]]))
  }

  const collaterals = listOf(loan, 'collaterals', 'collateral')
  collaterals.forEach((c, i) =>
    add(`col-${i}`, `Collateral${suffix(i, collaterals)} — Collateral Documents`, c?.documents))

  for (const [target, label] of Object.entries(PARTY_LABEL)) {
    const incomes = loan?.[`${target}Incomes`] || (loan?.[`${target}IncomeInfo`] ? [loan[`${target}IncomeInfo`]] : [])
    incomes.forEach((info, i) =>
      add(`inc-${target}-${i}`, `${label}${incomes.length > 1 ? ` Income ${i + 1}` : ''} — Income Verification & Proof`, info?.documents))
  }

  for (const [target, label] of Object.entries(PARTY_LABEL)) {
    add(`exp-${target}`, `${label} — Expense Documents`, loan?.[`${target}ExpenseInfo`]?.documents)
  }

  return groups
}
