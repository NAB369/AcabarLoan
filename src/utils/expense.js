// The expense records on a loan: one per party, each a declared monthly budget broken down by
// category. Held here rather than in the detail screen because the expense tab, the loan
// assessment and the seed data all have to agree on the field names.

export const EXPENSE_TARGETS = ['borrower', 'coBorrower', 'guarantor']

export const EXPENSE_FIELD = {
  borrower: 'borrowerExpenseInfo',
  coBorrower: 'coBorrowerExpenseInfo',
  guarantor: 'guarantorExpenseInfo',
}

export const EXPENSE_LABEL = { borrower: 'Borrower', coBorrower: 'Co-Borrower', guarantor: 'Guarantor' }

export const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Food', 'Transportation', 'Education', 'Healthcare', 'Other',
]

// A bank statement is the only document asked for. It is the one thing on file that says what
// actually left the account, and a handful of receipts and invoices never add up to a household's
// whole monthly spending — they only ever evidenced the lines the applicant chose to hand over.
export const EXPENSE_DOC_TYPES = ['Bank Statement']
