// Customer status is derived, not staff-entered — it used to be a free dropdown with no
// control ever rendered for it, so every customer created through the wizard was silently
// stuck on 'Pending' forever. Deriving it from real state (a disbursement account on file,
// a loan that reached final approval) means it can never drift out of sync with reality.
//
// What the three states mean, and what they deliberately do NOT mean:
//
//   Active      — this customer has a loan at Waiting Disburse or Active.
//   Registered  — registered with a disbursement account on file. Nothing more: no one has
//                 approved anything. This used to read 'Approved' purely because an account
//                 number had been typed into the registration wizard, which made every new
//                 customer look like it had passed a credit decision it never went through.
//   Incomplete  — registered, but with no disbursement account number, so no loan for this
//                 customer can be disbursed until one is recorded. Called out rather than
//                 folded in with Registered, because it is work someone still has to do.
export function getCustomerStatus(customer, loanApplications = []) {
  const hasAdvancedLoan = loanApplications.some(
    l => l.customerCode === customer.code && (l.status === 'Waiting Disburse' || l.status === 'Active')
  )
  if (hasAdvancedLoan) return 'Active'
  if (customer.accountNumber) return 'Registered'
  return 'Incomplete'
}
