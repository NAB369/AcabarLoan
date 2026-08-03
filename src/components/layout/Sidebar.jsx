import { LayoutDashboard, Users, HandCoins, Landmark, BarChart3, Bell, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { companyLogoSrc } from '../../utils/companyLogo'
import { Button } from '@/components/ui/button'

// The day-to-day loan-book modules. Integration is configuration rather than daily
// work, so it lives under System Settings instead of here.
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
  const { state, dispatch } = useApp()
  const isKh = state.language === 'kh'
  const { companyProfile } = state

  function go(tab) {
    dispatch({ type: 'SET_TAB', tab })
    onClose?.()
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-72 bg-brand-50 lg:bg-brand-50/50 text-slate-800 flex flex-col flex-shrink-0 border-r border-brand-100 transform transition-transform duration-300 lg:static lg:translate-x-0 lg:z-20 dark:bg-slate-900 dark:border-slate-700 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <img src={companyLogoSrc(companyProfile)} alt={companyProfile.name} className="w-12 h-12 rounded-full object-contain flex-shrink-0 ring-2 ring-gold-400/60" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold font-serif tracking-tight text-brand-800 dark:text-brand-300">{companyProfile.name}</h1>
          <p className="text-[10px] text-brand-600/70 font-medium tracking-wider uppercase dark:text-brand-400/70">
            {isKh ? 'ប្រព័ន្ធគ្រប់គ្រងកម្ចីប្រាក់' : 'Loan Management System'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="lg:hidden text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:bg-white/5 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5">
        {NAV.map(({ id, label, labelKh, icon: Icon, badge }) => {
          const active = state.activeTab === id
          return (
            <button
              key={id}
              onClick={() => go(id)}
              className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                active
                  ? 'bg-brand-600 text-white hover:bg-brand-600/90'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5 transition-transform duration-200 group-hover:scale-105" />
              <span className="flex-1 text-left">{isKh ? labelKh : label}</span>
              {badge && (
                <span className={`text-xs px-2 py-0.5 rounded-md border font-semibold ${
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
