import { lazy, Suspense, useEffect, useState } from 'react'
import {
  AlertTriangle, ChevronRight, ClipboardList, Home, LayoutDashboard, Lock, LogOut, Menu, Moon,
  ScrollText, ShieldCheck, Sun, UserCog, X,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { initials } from '../../utils/format'
import { PLATFORM_NAME_DEFAULT } from '../../utils/governance'
import AdminControlPage from './AdminControlPage'
import { Button } from '@/components/ui/button'

const SettingsModal = lazy(() => import('../settings/SettingsModal'))

// ── The Super Admin console, standing on its own ─────────────────────────────
// Not a tab in the loan book. The account that governs the Admins belongs to the operator, not to
// the business: it does not register customers, originate loans or post journal entries, and its
// console sitting in the same sidebar as those made it look like one more module of the same job.
//
// It is a separate shell with its own navigation and no tenant branding — but the LAYOUT is the
// business app's, deliberately: the same three sidebar widths, the same drawer on a phone, the same
// skip link, the same scroll container, the same storage-failure banner (see layout/Layout.jsx).
// An operator who crosses between the two should be moving between two sections of one product, not
// learning a second set of habits.
//
// The console carries no route into the loan book and no settings entry: governing an Admin and
// working as the business are separate jobs, and this shell now only does the first. The business
// app is still reachable for an account that holds both — its Header offers the way back, and the
// URL still resolves — but not from a control in here.

// Grouped, because a flat list of five entries says everything on it is the same kind of thing.
// Governance is the daily work, records are what it left behind, and the platform group is
// configuration — which is the order an operator actually moves through them.
const NAV_GROUPS = [
  {
    label: 'Governance',
    items: [
      { pane: 'overview',  label: 'Dashboard',       icon: LayoutDashboard },
      { pane: 'customers', label: 'Customers',       icon: UserCog },
      { pane: 'approvals', label: 'Approval Center', icon: ClipboardList, badge: 'pending' },
    ],
  },
  {
    label: 'Records',
    items: [
      { pane: 'audit', label: 'Audit Logs', icon: ScrollText },
    ],
  },
]

// The per-account panes, so "Customers" reads as selected while you are standing on Security
// rather than looking unselected on six of its own pages.
const ACCOUNT_PANES = ['profile', 'permissions', 'scope', 'security', 'sessions', 'activity']

const PANE_LABELS = {
  overview: 'Dashboard',
  customers: 'Customers',
  profile: 'Admin Profile',
  permissions: 'Permissions',
  scope: 'Access Scope',
  security: 'Security',
  sessions: 'Sessions',
  activity: 'Activity',
  approvals: 'Approval Center',
  audit: 'Audit Logs',
}

export default function SuperAdminShell() {
  const { state, dispatch, showToast } = useApp()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const me = state.systemUsers.find(u => u.username === state.currentUser)
  const pane = state.adminControlTab || 'overview'
  const pending = state.adminRequests.filter(r => r.status === 'Pending Super Admin Approval').length
  // Admins only, matching what the Customers section lists — staff accounts belong to the Admin
  // that governs them, not to this console.
  const governedCount = state.systemUsers.filter(u => u.role === 'Admin').length
  const onAccountPane = ACCOUNT_PANES.includes(pane)
  const governedName = onAccountPane
    ? state.systemUsers.find(u => u.username === state.adminControlUser)?.fullName
    : null

  // The drawer backs out on Escape like every other overlay in the app. Local state, so App.jsx's
  // global Escape handler cannot reach it — the same reason Layout keeps its own.
  useEffect(() => {
    if (!mobileNavOpen) return undefined
    const handleKey = e => { if (e.key === 'Escape') setMobileNavOpen(false) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mobileNavOpen])

  const go = entry => {
    dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: entry.pane })
    setMobileNavOpen(false)
  }

  // The six per-account panes are children of Customers, so the section stays selected while you
  // are standing on one of them rather than looking unselected six pages deep.
  const isActive = entry => (entry.pane === 'customers'
    ? pane === 'customers' || onAccountPane
    : pane === entry.pane)

  // Icon-only from md and labelled again from lg, exactly as the business sidebar's items are. The
  // rail hides the label in CSS, which takes it out of the accessibility tree with it — so the name
  // is carried explicitly or the button reads as unlabelled at the one width where nothing on
  // screen names it either.
  const navButton = entry => (
    <Button
      key={entry.pane}
      variant="ghost"
      onClick={() => go(entry)}
      title={entry.label}
      aria-label={entry.label}
      className={`h-auto w-full relative flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 justify-start md:justify-center md:gap-0 md:px-0 lg:justify-start lg:gap-3.5 lg:px-3.5 ${
        isActive(entry)
          ? 'bg-brand-600 text-white hover:bg-brand-600/90'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5'
      }`}
    >
      {/* The accent bar carries the selection as well as the fill does, so it survives a dimmed
          monitor and reads without relying on colour alone. */}
      {isActive(entry) && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-gold-400" aria-hidden="true" />
      )}
      <entry.icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1 text-left md:hidden lg:block">{entry.label}</span>
      {/* On the rail the count rides the icon's corner instead of sitting in a row that no longer
          exists — the same treatment the customer count gets in the business nav. */}
      {entry.badge === 'pending' && pending > 0 && (
        <span className={`px-1.5 py-0.5 rounded-md text-xs font-semibold md:absolute md:top-1 md:right-1.5 md:px-1 md:py-0 md:text-[9px] lg:static lg:px-1.5 lg:py-0.5 lg:text-xs ${
          isActive(entry) ? 'bg-white/20 text-white' : 'bg-amber-400 text-slate-900'
        }`}>
          {pending}
        </span>
      )}
    </Button>
  )

  const groupLabel = text => (
    <p className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500 md:hidden lg:block">
      {text}
    </p>
  )

  return (
    <div className="h-screen flex overflow-hidden font-sans text-slate-800 antialiased">
      {/* Off screen until it is tabbed to — without it a keyboard user tabs the whole console nav
          before reaching the pane they came for. Same link, same behaviour as the business app. */}
      <a
        href="#main-content"
        onClick={e => {
          // The href alone would put the hash in the URL, which this app reads as a route
          // (see utils/navigation) and would navigate away. Move focus directly instead.
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-brand-600 focus:text-white focus:text-sm focus:font-bold focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Only under the drawer. From md the sidebar is part of the page and dimming the content
          beside it would be dimming the page against itself. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Three widths, matching the business sidebar: off-canvas drawer below md, an 80px icon rail
          at md where a tablet has room to keep navigation visible and none to spare for labels, and
          the full 288px from lg. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-brand-50 md:bg-brand-50/50 text-slate-800 flex flex-col flex-shrink-0 border-r border-brand-100 transform transition-transform duration-300 md:static md:translate-x-0 md:z-20 md:w-20 lg:w-72 dark:bg-slate-900 dark:border-slate-700 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Super Admin navigation"
      >
        {/* The OPERATOR's identity, and only the operator's — no tenant logo. Sized and spaced like
            the business app's logo block so the two sidebars start at the same place. */}
        <div className="p-6 md:p-4 lg:p-6 flex items-center gap-3 md:justify-center lg:justify-start">
          <div className="w-12 h-12 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center flex-shrink-0 ring-2 ring-gold-400/60">
            <ShieldCheck className="w-6 h-6 text-brand-700 dark:text-brand-300" />
          </div>
          <div className="flex-1 min-w-0 md:hidden lg:block">
            <h1 className="text-xl font-bold font-serif tracking-tight text-brand-800 dark:text-brand-300 truncate">
              {state.platformName || PLATFORM_NAME_DEFAULT}
            </h1>
            <p className="text-[10px] text-brand-600/70 font-medium tracking-wider uppercase dark:text-brand-400/70">
              Super Admin
            </p>
          </div>
          {/* Only the drawer needs dismissing — from md the sidebar is part of the page. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
            className="md:hidden text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:bg-white/5 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 md:px-2 lg:px-4 py-2 space-y-4">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="space-y-1.5">
              {groupLabel(group.label)}
              {group.items.map(entry => navButton(entry))}
            </div>
          ))}
        </nav>

        <div className="p-4 md:p-2 lg:p-4 border-t border-brand-100 dark:border-slate-700">
          <div className="flex items-center gap-2.5 md:flex-col md:gap-1.5 lg:flex-row lg:gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-brand-700 dark:text-brand-300">
              {initials(me?.fullName || me?.username)}
            </div>
            <div className="min-w-0 flex-1 md:hidden lg:block">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate leading-tight">{me?.fullName || state.currentUser}</p>
              <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate">{me?.username}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { dispatch({ type: 'LOCK_SCREEN' }); showToast('Screen locked', 'info') }}
                title="Lock the screen"
                aria-label="Lock the screen"
                className="h-auto w-auto p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-100 dark:hover:bg-white/5"
              >
                <Lock className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { dispatch({ type: 'SIGN_OUT' }); showToast('Signed out', 'info') }}
                title="Sign out"
                aria-label="Sign out"
                className="h-auto w-auto p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-300 dark:hover:bg-rose-500/10"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Same frame as the business app: a fixed header over one scrolling region, rather than the
          whole document scrolling under a sticky bar. */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center gap-3 flex-shrink-0 relative z-30 dark:bg-slate-800 dark:border-slate-700">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            className="md:hidden rounded-xl text-slate-500 dark:text-slate-400 flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {/* A breadcrumb rather than a repeated title: the sidebar already says which section you
              are in, so this bar's job is to say how deep you are and hold the way back out. */}
          <nav aria-label="Breadcrumb" className="min-w-0 flex-1 flex items-center gap-1.5 text-xs">
            {/* The root of the breadcrumb, as a house rather than the word "Console". Icon-only, so
                the name it lost in the markup is carried explicitly — a tooltip is not an
                accessible name. */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: 'overview' })}
              title="Console home"
              aria-label="Console home"
              className="flex items-center p-1 -m-1 rounded-lg text-slate-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 flex-shrink-0"
            >
              <Home className="w-4 h-4" />
            </button>
            <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" aria-hidden="true" />
            {governedName ? (
              <>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: 'customers' })}
                  className="font-semibold text-slate-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 flex-shrink-0"
                >
                  Customers
                </button>
                <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" aria-hidden="true" />
                <span className="font-semibold text-slate-600 dark:text-slate-300 truncate">{governedName}</span>
                <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" aria-hidden="true" />
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate" aria-current="page">{PANE_LABELS[pane]}</span>
              </>
            ) : (
              <span className="font-bold text-slate-800 dark:text-slate-100 truncate" aria-current="page">{PANE_LABELS[pane]}</span>
            )}
          </nav>

          <span className="hidden lg:inline text-[11px] text-slate-400 dark:text-slate-500 flex-shrink-0">
            {governedCount} customer{governedCount === 1 ? '' : 's'}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => { dispatch({ type: 'TOGGLE_DARK_MODE' }); showToast(state.darkMode ? 'Light mode enabled' : 'Dark mode enabled', 'info') }}
            aria-label={state.darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-xl text-slate-500 dark:text-slate-400 flex-shrink-0"
          >
            {state.darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
        </header>

        {/* A failed write used to be swallowed, so an install that had filled its quota kept
            accepting work and lost all of it at the next reload. The console governs accounts and
            writes an audit trail on every action, so it needs this banner exactly as much as the
            loan book does. */}
        {state.storageFailed && (
          <div role="alert" className="flex items-start gap-2.5 px-4 py-2.5 bg-rose-600 text-white">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-snug">
              This browser stopped saving &mdash; its storage is full. Anything entered from now on
              will be lost when the page reloads. Export what you need, then clear space.
            </p>
          </div>
        )}

        {/* tabIndex -1 so the skip link has something to land on; it is not a Tab stop itself. */}
        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 focus:outline-none"
        >
          <AdminControlPage />
        </div>
      </main>

      {/* Nothing in this shell opens Settings any more. The render stays because SET_TAB does not
          clear `settingsOpen`: a panel left open in the business app would otherwise be open and
          invisible, and Escape would have nothing to close. */}
      {state.settingsOpen && (
        <Suspense fallback={null}><SettingsModal /></Suspense>
      )}
    </div>
  )
}
