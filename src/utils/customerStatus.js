// Customer status is derived, not staff-entered — it used to be a free dropdown with no
// control ever rendered for it, so every customer created through the wizard was silently
// stuck on 'Pending' forever. Deriving it from real state (a disbursement account on file,
// a loan that reached final approval) means it can never drift out of sync with reality.
export function getCustomerStatus(customer, loanApplications = []) {
  const hasAdvancedLoan = loanApplications.some(
    l => l.customerCode === customer.code && (l.status === 'Waiting Disburse' || l.status === 'Active')
  )
  if (hasAdvancedLoan) return 'Active'
  if (customer.accountNumber) return 'Approved'
  return 'Pending'
}
