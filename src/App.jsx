import { lazy, Suspense, useEffect, useRef } from 'react'
import { useApp } from './context/AppContext'
import {
  parseLocationHash, hashFor, titleFor, currentLoanRef, loanOpenAction, DEFAULT_TAB,
} from './utils/navigation'
import Layout from './components/layout/Layout'
import Toast from './components/shared/Toast'

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
const SettingsModal = lazy(() => import('./components/settings/SettingsModal'))
const SystemOperationsModal = lazy(() => import('./components/layout/SystemOperationsModal'))

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
  const { state, dispatch } = useApp()

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
      const { tab, loanRef } = parseLocationHash(hash)
      // SET_TAB clears the loan views, so it goes first and the loan is opened after it — the
      // other order would open the loan and then immediately close it again.
      if (tab !== state.activeTab) dispatch({ type: 'SET_TAB', tab })

      if (loanRef) {
        if (loanRef === currentLoanRef(state)) return
        const loan = state.loanApplications.find(l => l.ref === loanRef)
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
  // points instead of on the dashboard. An empty hash is normalised to one, so every entry in
  // the session's history has the same shape.
  useEffect(() => {
    const hash = window.location.hash || hashFor({ tab: DEFAULT_TAB, loanRef: null })
    syncedHash.current = hash
    window.history.replaceState(null, '', hash)
    applyHash.current(hash)
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
  useEffect(() => {
    const hash = hashFor({ tab: state.activeTab, loanRef: currentLoanRef(state) })
    document.title = titleFor(
      { tab: state.activeTab, loanRef: currentLoanRef(state) },
      state.companyProfile?.name
    )
    if (hash === syncedHash.current) return
    syncedHash.current = hash
    window.history.pushState(null, '', hash)
  }, [state.activeTab, state.loanDetailIdx, state.loanOverviewOpen, state.loanPreviewOpen,
      state.activeLoan, state.loanApplications, state.companyProfile])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return
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

  return (
    <>
      <Layout>
        <Suspense fallback={<PageSkeleton />}>
          {state.activeTab === 'dashboard'   && <Dashboard />}
          {state.activeTab === 'customers'   && <CustomersPage />}
          {state.activeTab === 'open-loan'   && <LoanPage />}
          {state.activeTab === 'reminders'   && <ReminderPage />}
          {state.activeTab === 'accounting'  && <AccountingPage />}
          {state.activeTab === 'reports'     && <ReportsPage />}
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
    </>
  )
}
