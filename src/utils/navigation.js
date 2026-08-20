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
  'admin-control': 'admin-control',
}

const SLUG_TABS = Object.fromEntries(Object.entries(TAB_SLUGS).map(([tab, slug]) => [slug, tab]))

// The sign-in screen's own URL. It gets one for the same reason every page has one: the address
// bar read '#/dashboard' with nobody signed in, naming a page the visitor was neither on nor able
// to reach. Deliberately NOT a member of TAB_SLUGS above — it is not a tab, and a session that is
// already signed in and opens a bookmarked '#/login' should land on the dashboard, which is
// exactly what parseLocationHash's unrecognised-slug fallback already does.
export const LOGIN_HASH = '#/login'

// Requesting an account is a screen of its own, not a mode of the sign-in form, because it is
// what a person is sent a link to: "open this and ask for access" has to be one URL.
export const SIGNUP_HASH = '#/signup'

// The operator's own sign-in. A separate door, not a mode of the business one: it accepts only the
// accounts that govern Admins, and it is the URL an operator keeps rather than one advertised on
// the screen a borrower-facing branch uses every morning.
export const CONSOLE_LOGIN_HASH = '#/super-admin'

// Both pre-session screens are matched here rather than through SLUG_TABS. parseLocationHash
// reads either as the dashboard, which is what a signed-in session opening a bookmarked
// '#/login' or '#/signup' should get — there is nothing to sign up for once you are in.
export const authViewFor = hash => {
  const h = String(hash || '').replace(/\/$/, '')
  if (h === SIGNUP_HASH) return 'sign-up'
  if (h === CONSOLE_LOGIN_HASH) return 'console'
  return 'sign-in'
}
export const authHashFor = view => {
  if (view === 'sign-up') return SIGNUP_HASH
  if (view === 'console') return CONSOLE_LOGIN_HASH
  return LOGIN_HASH
}

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
  'admin-control': 'Customers',
}

// The panes of the Admin Control console, as URL segments. A Super Admin governing a book of
// businesses needs to be able to send "here is the account, on this pane" to a colleague, or keep
// it open in a second tab beside the first — which means the console's position has to be in the
// address bar, not only in the reducer.
export const ADMIN_PANES = [
  'overview', 'customers', 'profile', 'permissions', 'scope', 'security', 'sessions', 'activity',
  'approvals', 'audit',
]

// '#/loans/AC-L-000042'            → { tab: 'open-loan',     loanRef: 'AC-L-000042' }
// '#/admin-control'                → { tab: 'admin-control', adminUser: null, adminPane: 'overview' }
// '#/admin-control/john.admin'     → { tab: 'admin-control', adminUser: 'john.admin', adminPane: 'profile' }
// '#/admin-control/john.admin/security' → … adminPane: 'security'
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
  if (tab === 'admin-control') {
    // A pane in the first segment is the console's own fleet-wide pages (the dashboard, the
    // approval queue, the audit log) — they govern no single account, so they carry no username.
    const [first, second] = rest
    if (!first) return { tab, loanRef: null, adminUser: null, adminPane: 'overview' }
    if (ADMIN_PANES.includes(first)) return { tab, loanRef: null, adminUser: null, adminPane: first }
    return {
      tab,
      loanRef: null,
      adminUser: first,
      adminPane: ADMIN_PANES.includes(second) ? second : 'profile',
    }
  }
  // Only the loan module carries a record in the URL so far. A segment after any other module
  // is ignored rather than rejected, which keeps older links working if more are added later.
  return { tab, loanRef: tab === 'open-loan' ? (rest[0] || null) : null }
}

export function hashFor({ tab, loanRef, adminUser, adminPane }) {
  const slug = TAB_SLUGS[tab] || TAB_SLUGS[DEFAULT_TAB]
  if (tab === 'admin-control') {
    // The fleet-wide panes are written without an account. '#/admin-control' on its own is the
    // dashboard — the one route that manages every Admin in the install.
    const pane = ADMIN_PANES.includes(adminPane) ? adminPane : 'overview'
    const fleetWide = pane === 'overview' || pane === 'customers' || pane === 'approvals' || pane === 'audit'
    if (fleetWide) return pane === 'overview' ? `#/${slug}` : `#/${slug}/${pane}`
    return adminUser ? `#/${slug}/${encodeURIComponent(adminUser)}/${pane}` : `#/${slug}`
  }
  return loanRef ? `#/${slug}/${encodeURIComponent(loanRef)}` : `#/${slug}`
}

// The document title, which is what the browser's history list and tab strip actually show.
// Most specific part first, so a row of tabs squeezed narrow still says which loan is which.
export function titleFor({ tab, loanRef, adminUser, adminPane }, companyName) {
  const most = tab === 'admin-control'
    ? [adminUser, adminPane && adminPane !== 'overview' ? adminPane : null].filter(Boolean).join(' · ')
    : loanRef
  const parts = [most, TAB_TITLES[tab], companyName].filter(Boolean)
  return parts.join(' · ')
}

// The same shape for the pre-session screens, so a browser history list reads consistently.
export const authTitle = (view, companyName) => {
  const what = view === 'sign-up' ? 'Request access'
    : view === 'console' ? 'Super Admin log in'
    : 'Log in'
  return [what, companyName].filter(Boolean).join(' · ')
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

// Where the Admin Control console is standing, for the state → URL direction.
export function currentAdminRef(state) {
  if (state.activeTab !== 'admin-control') return { adminUser: null, adminPane: null }
  const pane = state.adminControlTab || 'overview'
  return { adminUser: state.adminControlUser || null, adminPane: pane }
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
