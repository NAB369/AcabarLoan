// Small pills attached to an uploaded document row: which bank a statement came from, and
// the demo-only name-match verification result.

import { Badge } from '@/components/ui/badge'

export function BankBadge({ bank }) {
  if (!bank) return null
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
      {bank}
    </Badge>
  )
}

// A document's verdict. Four states rather than two, because a bank statement can stand up
// only partly, or stand up at a figure other than the borrower declared — both are findings
// worth acting on, and both used to collapse into a bare "Unverified". Which direction is the
// awkward one depends on what is being verified: a smaller income than declared, or a larger
// spend than declared.
const DOC_STATUS_STYLE = {
  'Verified': 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  'Verified Lower': 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800',
  'Verified Higher': 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800',
  'Partially Verified': 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  'Unverified': 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600',
}

// The Description column tells a reviewer what the document was checked against. Where the
// status did not come back clean, what it says is a finding rather than a note, so it is set in
// orange to be read — the plain grey is kept for a row that stood up and for one with no
// verdict at all (a document type nothing is checked against).
export function descriptionToneCls(status) {
  return status && status !== 'Verified'
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-slate-500 dark:text-slate-400'
}

export function VerificationBadge({ status, title }) {
  if (!status) return null
  return (
    <Badge
      variant="outline"
      title={title || "Demo-only match based on the file name, not the document's actual contents"}
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${
        DOC_STATUS_STYLE[status] || DOC_STATUS_STYLE.Unverified
      }`}
    >
      {status}
    </Badge>
  )
}
