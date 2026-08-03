import { formatVal, daysBetweenISO, toISODate } from './format'

// Everything the repayment-reminder screens share. The loan's own Repayment Reminder tab
// (LoanOverview / LoanPreview / LoanQuickPreviewModal) and the Reminder module all compose
// the same message to the same people about the same installment — held here so the four
// of them cannot drift apart.

export const REMINDER_METHODS = ['Telegram', 'Email', 'Message']

// The installment a reminder is about: the earliest one not yet settled. A 'Partial' row
// still owes its carried balance, so anything short of 'Paid' still counts as outstanding.
export function nextUnpaidInstallment(loan) {
  return (loan?.schedule || []).find(r => r.status !== 'Paid') || null
}

// Whole calendar days from today to the due date — negative once it is past due. Both dates
// are compared as local calendar dates: the schedule's ISO dates are built from local parts
// (see buildAmortizationData), so going through UTC would slide the count a day either way
// in east-of-UTC zones — which is exactly where this system runs.
export function daysUntilDue(dueDateISO) {
  if (!dueDateISO) return null
  return daysBetweenISO(toISODate(new Date()), dueDateISO)
}

export function dueLabel(days) {
  if (days == null) return '—'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days} day${days === 1 ? '' : 's'}`
}

// Who can be reminded about a loan — the borrower first, then anyone else on the hook for
// it. Older records carry a single `coBorrower`/`guarantor` rather than the lists.
export function buildReminderRecipients(loan) {
  return [
    { key: 'borrower', role: 'Borrower', name: loan.customerName, phone: loan.customerPhone, email: loan.customerEmail },
    ...(loan.coBorrowers || (loan.coBorrower ? [loan.coBorrower] : [])).map((cb, idx) => ({
      key: `coBorrower-${idx}`, role: `Co-Borrower${idx > 0 ? ` ${idx + 1}` : ''}`, name: cb.enName, phone: cb.phone, email: cb.email,
    })),
    ...(loan.guarantors || (loan.guarantor ? [loan.guarantor] : [])).map((g, idx) => ({
      key: `guarantor-${idx}`, role: `Guarantor${idx > 0 ? ` ${idx + 1}` : ''}`, name: g.enName, phone: g.phone, email: g.email,
    })),
  ]
}

export function buildSampleReminderMessage(method, recipient, nextPayment, currency, loan) {
  const name = recipient?.name || 'Customer'
  const amount = nextPayment ? formatVal(nextPayment.totalDue, currency, 1) : ''
  const dueDate = nextPayment?.dueDate || ''
  const ref = loan?.ref || ''

  if (method === 'Email') {
    return `Subject: Payment Reminder - Loan ${ref}\n\nDear ${name},\n\nThis is a friendly reminder that your installment payment of ${amount} for loan ${ref} is due on ${dueDate}. Please make your payment on or before the due date to avoid any late fees.\n\nThank you,\nAcabar Finance`
  }
  if (method === 'Telegram') {
    return `🔔 Payment Reminder\nDear ${name}, your installment of ${amount} for loan ${ref} is due on ${dueDate}. Please make your payment on time. Thank you - Acabar Finance`
  }
  return `Dear ${name}, this is a reminder that your payment of ${amount} is due on ${dueDate}. Please settle on time to avoid late fees. - Acabar Finance`
}

// One sent reminder, in the shape `loan.reminderHistory` has always carried.
export function buildReminderEntry({ method, recipient, message }) {
  return {
    method,
    recipient: recipient?.name,
    role: recipient?.role,
    destination: (method === 'Email' ? recipient?.email : recipient?.phone) || '',
    message,
    timestamp: new Date().toLocaleString('en-GB'),
  }
}

export function appendReminder(loan, entry) {
  return { ...loan, reminderHistory: [...(loan.reminderHistory || []), entry] }
}

// Every reminder these screens send goes out as borrower SMS through WeUMS (see its
// tagline in mockData.js), so none of the four send buttons should fire until this
// install has an account with it — see WeumsGateModal.
export function weumsSignedIn(state) {
  return !!(state.integrations || []).find(i => i.id === 'weums')?.login?.signedIn
}
