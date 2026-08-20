import { LayoutDashboard, Users, HandCoins, Landmark, BarChart3, Bell, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { companyLogoSrc } from '../../utils/companyLogo'
import { Button } from '@/components/ui/button'
import { TAB_PERMISSION } from '../../utils/governance'

// The day-to-day loan-book modules. Integration is configuration rather than daily
// work, so it lives under System Settings instead of here.
//
// The Super Admin console is deliberately NOT in this list. It is the vendor's, not the business's,
// and it replaces this whole shell when it is open (see SuperAdminShell) — an account that governs
// Admins reaches it from its account menu, not from the menu a teller uses to open the loan book.
const NAV = [
  { id: 'dashboard',   label: 'Dashboard',            labelKh: 'ផ្ទាំងគ្រប់គ្រង', icon: LayoutDashboard },
  { id: 'customers',   label: 'Customer',             labelKh: 'អតិថិជន',          icon: Users, badge: true },
  { id: 'open-loan',   label: 'Loan Management',      labelKh: 'ដាក់ពាក្យខ្ចី',     icon: HandCoins },
  { id: 'accounting',  label: 'Account Management',   labelKh: 'គ្រប់គ្រងគណនេយ្យ',  icon: Landmark },
  { id: 'reports',     label: 'Report',                labelKh: 'របាយការណ៍កម្ចី',    icon: BarChart3 },
  // Chasing what is due is follow-up work driven by what the reports surface, so it
  // closes the list rather than sitting among the loan-book modules.
  { id: 'reminders',   label: 'Reminder',             labelKh: 'ការរំលឹក',          icon: Bell },
]

export default function Sidebar({ open, onClose }) {
  const { state, dispatch, can } = useApp()
  const isKh = state.language === 'kh'
  const { companyProfile } = state

  // A module the account has no view permission for is not drawn. SET_TAB refuses it as well
  // (see the reducer) — hiding a menu entry is a courtesy, refusing the action is the control.
  const nav = NAV.filter(item => {
    const needed = TAB_PERMISSION[item.id]
    return !needed || can(needed)
  })

  function go(tab) {
    dispatch({ type: 'SET_TAB', tab })
    onClose?.()
  }

  return (
    // Three widths, not two. Below md it is an off-canvas drawer the hamburger slides in.
    // From md (a 768px tablet in portrait) it is always on screen, but as a compact icon rail:
    // a tablet has room to keep navigation permanently visible, and none to spare for 288px of
    // it. From lg the labels come back and it is the full sidebar.
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-72 bg-brand-50 md:bg-brand-50/50 text-slate-800 flex flex-col flex-shrink-0 border-r border-brand-100 transform transition-transform duration-300 md:static md:translate-x-0 md:z-20 md:w-20 lg:w-72 dark:bg-slate-900 dark:border-slate-700 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label="Main navigation"
    >
      {/* Logo. On the rail only the mark survives — the company name at 80px wide would be
          three truncated characters, which says less than the logo already does. */}
      <div className="p-6 md:p-4 lg:p-6 flex items-center gap-3 md:justify-center lg:justify-start">
        <img src={companyLogoSrc(companyProfile)} alt={companyProfile.name} className="w-12 h-12 rounded-full object-contain flex-shrink-0 ring-2 ring-gold-400/60" />
        <div className="flex-1 min-w-0 md:hidden lg:block">
          <h1 className="text-xl font-bold font-serif tracking-tight text-brand-800 dark:text-brand-300">{companyProfile.name}</h1>
          <p className="text-[10px] text-brand-600/70 font-medium tracking-wider uppercase dark:text-brand-400/70">
            {isKh ? 'ប្រព័ន្ធគ្រប់គ្រងកម្ចីប្រាក់' : 'Loan Management System'}
          </p>
        </div>
        {/* Only the drawer needs dismissing — from md the sidebar is part of the page. */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="md:hidden text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:bg-white/5 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4 md:px-2 lg:px-4 py-2 space-y-1.5">
        {nav.map(({ id, label, labelKh, icon: Icon, badge }) => {
          const active = state.activeTab === id
          const name = isKh ? labelKh : label
          return (
            <button
              key={id}
              onClick={() => go(id)}
              // The rail hides the label in CSS, which takes it out of the accessibility tree
              // with it — the name has to be carried explicitly or the button reads as unlabelled
              // at exactly the width where nothing on screen names it either.
              title={name}
              aria-label={name}
              className={`relative w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 group md:justify-center md:gap-0 md:px-0 lg:justify-start lg:gap-3.5 lg:px-3.5 ${
                active
                  ? 'bg-brand-600 text-white hover:bg-brand-600/90'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span className="flex-1 text-left md:hidden lg:block">{name}</span>
              {/* How many customers are on file, kept at every width: it is the one number the
                  nav carries. On the rail it rides the icon's corner instead of sitting in a
                  row that no longer exists. */}
              {badge && (
                <span className={`text-xs px-2 py-0.5 rounded-md border font-semibold md:absolute md:top-1 md:right-1.5 md:px-1 md:py-0 md:text-[9px] lg:static lg:px-2 lg:py-0.5 lg:text-xs ${
                  active ? 'bg-white/20 text-white border-white/20' : 'bg-slate-100 text-slate-600 border-slate-200 group-hover:bg-slate-200/80'
                }`}>
                  {state.customers.length}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
