import { lazy, Suspense, useEffect, useRef } from 'react'
import { useApp } from './context/AppContext'
import {
  parseLocationHash, hashFor, titleFor, authTitle, currentLoanRef, currentAdminRef,
  loanOpenAction, DEFAULT_TAB, LOGIN_HASH, SIGNUP_HASH, authHashFor, authViewFor,
} from './utils/navigation'
import { TAB_PERMISSION, PLATFORM_NAME_DEFAULT } from './utils/governance'
import Layout from './components/layout/Layout'
import Toast from './components/shared/Toast'
import ScreenLock from './components/shared/ScreenLock'
import ErrorBoundary from './components/shared/ErrorBoundary'
import LoginScreen from './components/auth/LoginScreen'
import NoAccess from './components/shared/NoAccess'
import SignUpScreen from './components/auth/SignUpScreen'

// ── One chunk per module ─────────────────────────────────────────────────────
// Everything used to arrive in a single 3.3 MB bundle, so a loan officer who only ever opens
// the loan register still downloaded the accounting ledger, every report, the charting library
// and the whole PDF toolchain before the first screen painted. Split here at the module
// boundary, each page and its heavy dependencies download when that page is first opened.
//
// The two modals are lazy for the same reason and it matters more than it looks: both pull in
// jsPDF, and being rendered unconditionally from this file is what kept the PDF toolchain in
// the entry chunk no matter how the pages were split.
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'))
const CustomersPage = lazy(() => import('./components/customers/CustomersPage'))
const LoanPage = lazy(() => import('./components/loans/LoanPage'))
const ReminderPage = lazy(() => import('./components/reminders/ReminderPage'))
const AccountingPage = lazy(() => import('./components/accounting/AccountingPage'))
const ReportsPage = lazy(() => import('./components/reports/ReportsPage'))
const SuperAdminShell = lazy(() => import('./components/admin/SuperAdminShell'))
const SettingsModal = lazy(() => import('./components/settings/SettingsModal'))
const SystemOperationsModal = lazy(() => import('./components/layout/SystemOperationsModal'))

// ── The tab's icon follows the same rule as its text ────────────────────────
// The doors belong to the product, the session belongs to the business — so the Acabar mark that
// index.html sets is not what a sign-in screen should be wearing. Drawn as an SVG data URI for the
// same reason the wordmark is drawn: there is no WeLoan icon file in the project, and a favicon
// pointing at a file nobody added shows the browser's blank page icon.
//
// A font inside a favicon data URI cannot be loaded, so the W falls back to whatever system-ui is
// — at 16 pixels the shape is the mark, not the typeface.
const LOGIN_FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
  + '<rect width="64" height="64" rx="14" fill="#1B2BEF"/>'
  + '<text x="32" y="46" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif"'
  + ' font-size="42" font-weight="800">W</text></svg>',
)}`
const TENANT_FAVICON = '/acabar-logo.png'

// Shown while a module's chunk is in flight. Deliberately not a spinner over the whole page:
// on a warm cache the chunk resolves in a frame or two, and a spinner that flashes for 30ms
// reads as a glitch. This is the page's own shape, holding its place.
function PageSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-4" role="status" aria-label="Loading">
      <div className="h-7 w-56 rounded-lg bg-slate-200/70 dark:bg-slate-700/60 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-2xl bg-slate-200/60 dark:bg-slate-700/50 animate-pulse" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-slate-200/50 dark:bg-slate-700/40 animate-pulse" />
    </div>
  )
}

export default function App() {
  const { state, dispatch, can, inMyScope } = useApp()

  // ── The address bar and the reducer, kept in step ─────────────────────────
  // Two effects, one in each direction, and one ref to stop them chasing each other: whichever
  // side moves last records the hash it settled on, and the other skips when it already agrees.
  const syncedHash = useRef(null)

  // Reads a URL onto the state — the first load and every Back/Forward press go through here.
  // Held in a ref and refreshed after each render (rather than assigned during one, which a
  // discarded render would make a lie) so the popstate listener below can stay subscribed once
  // and still act on current state.
  const applyHash = useRef(() => {})
  useEffect(() => {
    applyHash.current = hash => {
      // '#/signup' is not a tab, so it is read first and on its own. Adopted even when a session
      // is open, where it is inert — the gate below only consults it with nobody signed in.
      const authView = authViewFor(hash)
      if (authView !== state.authView) dispatch({ type: 'SET_AUTH_VIEW', view: authView })

      const { tab, loanRef, adminUser, adminPane } = parseLocationHash(hash)
      // SET_TAB clears the loan views, so it goes first and the loan is opened after it — the
      // other order would open the loan and then immediately close it again.
      if (tab !== state.activeTab) dispatch({ type: 'SET_TAB', tab })

      // The Admin Control console. Adopted after SET_TAB, which resets the console the same way
      // it resets the loan views, so the order matters here for the same reason.
      if (tab === 'admin-control') {
        const named = adminUser
          // An account this install does not have, or one nobody may govern (a Super Admin is not
          // its peer's subject), is treated as no account at all rather than opening a blank
          // profile — and the URL is corrected so Back cannot walk into the dead link again.
          ? state.systemUsers.find(u => u.username === adminUser && u.role !== 'Super Admin')
          : null
        if (adminUser && !named) {
          const corrected = hashFor({ tab, adminUser: null, adminPane: 'overview' })
          syncedHash.current = corrected
          window.history.replaceState(null, '', corrected)
          dispatch({ type: 'SET_ADMIN_CONTROL_USER', username: null, tab: 'overview' })
          return
        }
        if (named?.username !== state.adminControlUser || adminPane !== state.adminControlTab) {
          dispatch({ type: 'SET_ADMIN_CONTROL_USER', username: named?.username || null, tab: adminPane })
        }
        return
      }

      if (loanRef) {
        if (loanRef === currentLoanRef(state)) return
        // A link is the one way to reach a loan without going through a list, so the access scope
        // has to be checked here as well: a loan outside it is treated exactly like a loan this
        // install does not have, rather than opening for someone who cannot see it in the
        // register (see AppContext's inMyScope).
        const found = state.loanApplications.find(l => l.ref === loanRef)
        const loan = found && inMyScope(found) ? found : null
        const action = loanOpenAction(loan, state.loanApplications)
        if (action) {
          dispatch(action)
        } else {
          // A link to a loan this install does not have — land on the register rather than on
          // a blank screen, and correct the URL so Back can't walk into the dead link again.
          const corrected = hashFor({ tab, loanRef: null })
          syncedHash.current = corrected
          window.history.replaceState(null, '', corrected)
        }
        return
      }

      // No record in the URL but one on screen: this is Back out of a loan.
      if (currentLoanRef(state)) {
        if (state.loanPreviewOpen) dispatch({ type: 'CLOSE_LOAN_PREVIEW' })
        if (state.loanOverviewOpen) dispatch({ type: 'CLOSE_LOAN_OVERVIEW' })
        if (state.loanDetailIdx !== null && state.loanDetailIdx !== undefined) {
          dispatch({ type: 'CLOSE_LOAN_DETAIL' })
        }
      }
    }
  })

  // First paint: adopt whatever the URL says, so a refresh or a pasted link lands where it
  // points instead of on the dashboard.
  useEffect(() => {
    // Read only. Writing the normalised URL is left to the state → URL effect below, which is
    // the one place that knows whether a page or the sign-in screen is on screen — doing it
    // here stamped '#/dashboard' over the address bar before the session was even checked.
    // A deep link still survives the sign-in: the tab (and the loan) are adopted into state
    // here while the gate is up, and the URL is written back out once a session exists.
    applyHash.current(window.location.hash || hashFor({ tab: DEFAULT_TAB, loanRef: null }))
    // Deliberately once: this is the initial adoption, not an ongoing subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back / Forward. The browser has already changed the URL by the time this fires, so the job
  // is to move the app to it — never to push anything of its own.
  useEffect(() => {
    const onPopState = () => {
      const hash = window.location.hash
      syncedHash.current = hash
      applyHash.current(hash)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // State → URL. A new view is a new history entry, which is what makes Back mean "the view I
  // was just on" rather than "leave the application".
  //
  // With nobody signed in that URL is the sign-in screen's, or the request-access screen's. Both
  // are rendered by a gate below rather than by a tab, so the address bar used to read
  // '#/dashboard' while a login form was what was actually on screen — a URL naming a page the
  // visitor was neither on nor able to open, and one that would land the next person straight
  // back on it. Request-access needs a URL for a second reason: it is what a new joiner is sent.
  const settled = useRef(false)
  useEffect(() => {
    const signedIn = !!state.currentUser
    const view = { tab: state.activeTab, loanRef: currentLoanRef(state), ...currentAdminRef(state) }
    const hash = signedIn ? hashFor(view) : authHashFor(state.authView)
    // The console belongs to the operator, so its tab carries the operator's name — the business's
    // name there would put Acabar Plc on a window that is governing it.
    const owner = state.activeTab === 'admin-control'
      ? (state.platformName || PLATFORM_NAME_DEFAULT)
      : state.companyProfile?.name
    document.title = signedIn
      ? titleFor(view, owner)
      // Before a session there is no business yet — nobody has said which institution's book they
      // are opening. The doors belong to the product, so the tab names the product; the business's
      // name arrives with the session, on the line above.
      : authTitle(state.authView, state.platformName || PLATFORM_NAME_DEFAULT)

    if (hash === syncedHash.current) return
    // Pushed within a side of the sign-in boundary and replaced across it. Moving between the
    // sign-in and request-access forms is a step Back should undo, the same as moving between two
    // pages; signing in or out is not — the view on the other side of it no longer exists. The
    // session's first write is replaced too, so it normalises the URL the app was opened on
    // rather than stacking a second entry for the same view.
    const preSession = h => h === LOGIN_HASH || h === SIGNUP_HASH
    const replace = !settled.current || preSession(syncedHash.current) !== preSession(hash)
    syncedHash.current = hash
    settled.current = true
    window.history[replace ? 'replaceState' : 'pushState'](null, '', hash)
  }, [state.currentUser, state.authView, state.activeTab, state.loanDetailIdx,
      state.loanOverviewOpen, state.loanPreviewOpen, state.activeLoan, state.loanApplications,
      state.adminControlUser, state.adminControlTab, state.platformName, state.companyProfile])

  useEffect(() => {
    const href = state.currentUser ? TENANT_FAVICON : LOGIN_FAVICON
    document.querySelectorAll('link[rel~="icon"]').forEach(link => { link.href = href })
  }, [state.currentUser])

  // ── Idle screen lock ──────────────────────────────────────────────────────
  // Restarted by any real sign of a person at the keyboard. Deliberately not by a timer alone:
  // a teller reading a long repayment schedule without touching anything is still working, so
  // scrolling counts as activity alongside keys, clicks and touches.
  //
  // 0 minutes means off, which is a legitimate choice for a back office in a locked room.
  useEffect(() => {
    const minutes = state.screenLockMinutes
    if (!minutes || state.screenLocked) return undefined

    let timer = null
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => dispatch({ type: 'LOCK_SCREEN' }), minutes * 60 * 1000)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, arm, { passive: true, capture: true }))
    arm()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, arm, { capture: true }))
    }
  }, [state.screenLockMinutes, state.screenLocked, dispatch])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
      // Pre-session there is nothing else on screen to close, and the request-access form is a
      // place Escape should get you out of, the same as any other view you did not mean to open.
      if (!state.currentUser) {
        if (state.authView !== 'sign-in') dispatch({ type: 'SET_AUTH_VIEW', view: 'sign-in' })
        return
      }
      if (state.settingsOpen) dispatch({ type: 'CLOSE_SETTINGS' })
      if (state.systemOpsOpen) dispatch({ type: 'CLOSE_SYSTEM_OPS' })
      if (state.customerWizardOpen) dispatch({ type: 'CLOSE_CUSTOMER_WIZARD' })
      if (state.loanWizardOpen) dispatch({ type: 'CLOSE_LOAN_WIZARD' })
      if (state.previewCustomerCode) dispatch({ type: 'CLOSE_CUSTOMER_PREVIEW' })
      if (state.deletePendingCode) dispatch({ type: 'CANCEL_DELETE_CUSTOMER' })
      if (state.loanDetailIdx !== null) dispatch({ type: 'CLOSE_LOAN_DETAIL' })
      if (state.loanPreviewOpen) dispatch({ type: 'CLOSE_LOAN_PREVIEW' })
      if (state.loanOverviewOpen) dispatch({ type: 'CLOSE_LOAN_OVERVIEW' })
      if (state.loanQuickPreviewOpen) dispatch({ type: 'CLOSE_LOAN_QUICK_PREVIEW' })
      if (state.cashCountModalOpen) dispatch({ type: 'CLOSE_CASH_COUNT_MODAL' })
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [state, dispatch])

  // Nothing renders until an account is signed in — not the shell, not a page, not a modal.
  // The pages are lazy, so an unauthenticated visitor does not even fetch their chunks. Placed
  // below every hook above: a return that skipped some of them would change hook order.
  if (!state.currentUser) {
    return (
      <ErrorBoundary>
        {state.authView === 'sign-up'
          ? <SignUpScreen />
          // One component for both doors: the mechanics that matter — lockout, expiry, policy
          // blocks, first-sign-in password — must not drift between them. `operator` changes who
          // is eligible and what the screen says, nothing else.
          : <LoginScreen operator={state.authView === 'console'} />}
        <Toast />
      </ErrorBoundary>
    )
  }

  const neededForTab = TAB_PERMISSION[state.activeTab]
  const tabAllowed = !neededForTab || can(neededForTab)

  // The Super Admin console replaces the whole business shell rather than rendering inside it: the
  // account that governs the Admins is the vendor's, and its screens are not one more module of
  // somebody else's daily work (see SuperAdminShell). The permission is re-checked here, so an
  // account that loses govern_admins mid-session falls back to the business app rather than being
  // left inside a console it may no longer use.
  if (state.activeTab === 'admin-control' && can(TAB_PERMISSION['admin-control'])) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          <SuperAdminShell />
        </Suspense>
        <Toast />
        <ScreenLock />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      <Layout>
        <Suspense fallback={<PageSkeleton />}>
          {/* SET_TAB refuses a module the account may not open and the sidebar does not draw it,
              so the only way to be standing on one is to have been on it when the permission was
              taken away — a Super Admin revoking it mid-session, which is meant to bite at once
              (rule 13). Saying so beats leaving the last render of a page nobody may see. */}
          {!tabAllowed && <NoAccess tab={state.activeTab} />}
          {tabAllowed && (
          <>
          {state.activeTab === 'dashboard'   && <Dashboard />}
          {state.activeTab === 'customers'   && <CustomersPage />}
          {state.activeTab === 'open-loan'   && <LoanPage />}
          {state.activeTab === 'reminders'   && <ReminderPage />}
          {state.activeTab === 'accounting'  && <AccountingPage />}
          {state.activeTab === 'reports'     && <ReportsPage />}
          </>
          )}
        </Suspense>
      </Layout>

      {/* Mounted only once opened, so their chunks — and the PDF toolchain inside them — are
          never fetched by a session that opens neither. No fallback: there is nothing on
          screen to hold a place for until the modal itself arrives. */}
      {state.settingsOpen && (
        <Suspense fallback={null}><SettingsModal /></Suspense>
      )}
      {state.systemOpsOpen && (
        <Suspense fallback={null}><SystemOperationsModal /></Suspense>
      )}
      <Toast />
      <ScreenLock />
    </ErrorBoundary>
  )
}
