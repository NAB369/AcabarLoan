// ── Where the user is, expressed as a URL ────────────────────────────────────
// Which page renders is decided by `state.activeTab` in the reducer (see App.jsx). That works,
// but it left the address bar frozen on one URL for the whole session: nothing could be
// bookmarked, nothing could be sent to a colleague, refresh dropped the user back on the
// dashboard, and the browser's Back button — the most-used control in any browser — walked out
// of the application entirely, taking any half-finished work with it.
//
// These helpers give the reducer's view state a URL and back. HASH routing, not path routing:
// this app is served as static files with no server to rewrite unknown paths, so `/loans/AC-L-1`
// would 404 on refresh while `#/loans/AC-L-1` cannot. The hash is also invisible to any static
// host, so nothing about deployment has to change.

// The tab ids are internal ('open-loan' is a verb from the original menu); the URL carries a
// stable slug instead, so a link keeps working even if a tab is renamed inside the app.
export const TAB_SLUGS = {
  dashboard: 'dashboard',
  customers: 'customers',
  'open-loan': 'loans',
  accounting: 'accounting',
  reports: 'reports',
  reminders: 'reminders',
}

const SLUG_TABS = Object.fromEntries(Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab]))

export const DEFAULT_TAB = 'dashboard'

// What each module is called in the browser tab and in a breadcrumb. Deliberately the same
// words the sidebar uses — a history entry the user cannot match to a menu item is no help.
export const TAB_TITLES = {
  dashboard: 'Dashboard',
  customers: 'Customer',
  'open-loan': 'Loan Management',
  accounting: 'Account Management',
  reports: 'Report',
  reminders: 'Reminder',
}

// '#/loans/AC-L-000042' → { tab: 'open-loan', loanRef: 'AC-L-000042' }
// Anything unrecognised reads as the dashboard rather than as an error: a stale or hand-edited
// link should land somewhere usable, not on a broken screen.
export function parseLocationHash(hash) {
  const [slug, ...rest] = String(hash || '')
    .replace(/^#\/?/, '')
    .split('/')
    .map(part => decodeURIComponent(part.trim()))
    .filter(Boolean)
  const tab = SLUG_TABS[slug]
  if (!tab) return { tab: DEFAULT_TAB, loanRef: null }
  // Only the loan module carries a record in the URL so far. A segment after any other module
  // is ignored rather than rejected, which keeps older links working if more are added later.
  return { tab, loanRef: tab === 'open-loan' ? (rest[0] || null) : null }
}

export function hashFor({ tab, loanRef }) {
  const slug = TAB_SLUGS[tab] || TAB_SLUGS[DEFAULT_TAB]
  return loanRef ? `#/${slug}/${encodeURIComponent(loanRef)}` : `#/${slug}`
}

// The document title, which is what the browser's history list and tab strip actually show.
// Most specific part first, so a row of tabs squeezed narrow still says which loan is which.
export function titleFor({ tab, loanRef }, companyName) {
  const parts = [loanRef, TAB_TITLES[tab], companyName].filter(Boolean)
  return parts.join(' · ')
}

// Which loan is on screen, whichever of the three full-screen loan views is showing it. The
// URL is written from this, so it has to name the same loan the user is looking at.
export function currentLoanRef(state) {
  if (state.loanDetailIdx !== null && state.loanDetailIdx !== undefined) {
    return state.loanApplications[state.loanDetailIdx]?.ref || null
  }
  if (state.loanOverviewOpen || state.loanPreviewOpen) return state.activeLoan?.ref || null
  return null
}

// Opening a loan is not one action: which of the three views is the right one depends on how
// far through its life the loan is — a disbursed loan opens on its preview, one waiting on a
// decision opens on the approval overview, and an application still being written opens on the
// detail form. That rule lived only in LoanList's row click; a link to a loan has to follow the
// same rule or the same loan would open differently depending on how it was reached.
export function loanOpenAction(loan, loanApplications = []) {
  if (!loan) return null
  if (loan.status === 'Active' || loan.status === 'Waiting Disburse') {
    return { type: 'OPEN_LOAN_PREVIEW', loan, tab: 'Overview' }
  }
  if (loan.status === 'Pending Approval') {
    return { type: 'OPEN_LOAN_OVERVIEW', loan, tab: 'Overview' }
  }
  const idx = loanApplications.findIndex(l => l.ref === loan.ref)
  return idx >= 0 ? { type: 'OPEN_LOAN_DETAIL', idx } : null
}
