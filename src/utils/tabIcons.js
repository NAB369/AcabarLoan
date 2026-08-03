import { LayoutDashboard, Wallet, Bell, Calendar, FileText, History } from 'lucide-react'

// Loan Preview / Approval Review build their tab lists as plain label strings
// (the list varies with disbursement state), so their icons are looked up by
// label here rather than carried alongside each entry.
export const LOAN_TAB_ICONS = {
  'Overview':            LayoutDashboard,
  'Repayment Tracking':  Wallet,
  'Repayment Reminder':  Bell,
  'Repayment Schedule':  Calendar,
  'Loan Profile':        FileText,
  'Audit Log':           History,
}
