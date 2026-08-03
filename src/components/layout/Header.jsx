import { useState, useId } from 'react'
import { Bell, Moon, Sun, Settings, LogOut, User, ChevronLeft, Menu, MonitorCog, RefreshCw, ChevronDown, Check } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Sample "logged in as" identities for the role-switcher demo — one representative
// person per role so switching roles feels like switching users, not just labels.
const ROLE_SAMPLE_NAMES = {
  'Admin':          'System Administrator',
  'Credit Officer': 'Vuthy Sok',
  'Credit Manager': 'Srey Neang',
  'Accountant':     'Sopha Ly',
}

// Flags are drawn inline rather than using emoji — Windows renders regional
// indicator pairs as bare letters ("GB"), so 🇬🇧 would not read as a flag.
const flagCls = 'w-5 h-5 rounded-full flex-shrink-0 ring-1 ring-black/10 dark:ring-white/15'

function FlagEN() {
  // Union Jack, clipped to a circle. clipPath ids must be unique per instance.
  const raw = useId()
  const id = `uk-${raw.replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 60 60" className={flagCls} aria-hidden="true">
      <defs>
        <clipPath id={`${id}-round`}><circle cx="30" cy="30" r="30" /></clipPath>
        <clipPath id={`${id}-diag`}>
          <path d="M30,30 L60,30 L60,60 Z M30,30 L30,60 L0,60 Z M30,30 L0,30 L0,0 Z M30,30 L30,0 L60,0 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-round)`}>
        <rect width="60" height="60" fill="#012169" />
        <path d="M0,0 L60,60 M60,0 L0,60" stroke="#fff" strokeWidth="12" />
        <path d="M0,0 L60,60 M60,0 L0,60" stroke="#C8102E" strokeWidth="7" clipPath={`url(#${id}-diag)`} />
        <path d="M30,0 V60 M0,30 H60" stroke="#fff" strokeWidth="20" />
        <path d="M30,0 V60 M0,30 H60" stroke="#C8102E" strokeWidth="12" />
      </g>
    </svg>
  )
}

function FlagKH() {
  // Cambodia: blue / red / blue bands with a simplified Angkor Wat silhouette.
  const raw = useId()
  const id = `kh-${raw.replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 60 60" className={flagCls} aria-hidden="true">
      <defs>
        <clipPath id={`${id}-round`}><circle cx="30" cy="30" r="30" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-round)`}>
        <rect width="60" height="60" fill="#032EA1" />
        <rect y="15" width="60" height="30" fill="#E00025" />
        <g fill="#fff">
          <rect x="19" y="37" width="22" height="3" />
          <rect x="22" y="33.5" width="16" height="2.5" />
          <path d="M30,17 L33.2,29 L26.8,29 Z" />
          <rect x="28.4" y="28" width="3.2" height="6" />
          <path d="M22.5,23 L25,32 L20,32 Z" />
          <rect x="21.2" y="31" width="2.6" height="3.5" />
          <path d="M37.5,23 L40,32 L35,32 Z" />
          <rect x="36.2" y="31" width="2.6" height="3.5" />
        </g>
      </g>
    </svg>
  )
}

// Language options for the header switcher. Only the two languages the app
// actually ships strings for are listed.
const LANGUAGES = [
  { code: 'en', label: 'English',    Flag: FlagEN, toast: 'Language: English' },
  { code: 'kh', label: 'ភាសាខ្មែរ', Flag: FlagKH, toast: 'ភាសា: ខ្មែរ' },
]

export default function Header({ onMenuClick }) {
  const { state, dispatch, showToast } = useApp()
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sysOpsOpen, setSysOpsOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const isKh = state.language === 'kh'
  const activeLang = LANGUAGES.find(l => l.code === state.language) || LANGUAGES[0]

  const unread = state.notifications.filter(n => !n.read).length
  const inLoanDetail = state.activeTab === 'open-loan' && state.loanDetailIdx !== null && state.loanDetailIdx !== undefined
  const inLoanOverview = state.activeTab === 'open-loan' && state.loanOverviewOpen
  const inLoanPreview = state.activeTab === 'open-loan' && state.loanPreviewOpen

  // Each of the four header menus closes its siblings when it opens — Radix already
  // closes a menu on outside click / Escape on its own, this just preserves the
  // "only one open at a time" behavior the hand-rolled version had.
  function only(setter) {
    return (open) => {
      setter(open)
      if (open) {
        if (setter !== setLangOpen) setLangOpen(false)
        if (setter !== setSysOpsOpen) setSysOpsOpen(false)
        if (setter !== setNotifOpen) setNotifOpen(false)
        if (setter !== setProfileOpen) setProfileOpen(false)
      }
    }
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between flex-shrink-0 relative z-30 dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center gap-1.5 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5 flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </Button>
        {(inLoanDetail || inLoanOverview || inLoanPreview) ? (
          <Button
            variant="ghost"
            onClick={() => dispatch({ type: inLoanOverview ? 'CLOSE_LOAN_OVERVIEW' : inLoanPreview ? 'CLOSE_LOAN_PREVIEW' : 'CLOSE_LOAN_DETAIL' })}
            className="flex items-center gap-1.5 px-2 sm:px-4 py-2 h-auto text-sm font-semibold rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 min-w-0"
          >
            <ChevronLeft className="w-4 h-4 flex-shrink-0" />
            <span className="truncate hidden sm:inline">Back to Loan Applications</span>
            <span className="truncate sm:hidden">Back</span>
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-1 sm:gap-2.5">
        {/* Language — flag chip that opens a language picker */}
        <DropdownMenu open={langOpen} onOpenChange={only(setLangOpen)}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              aria-label={isKh ? 'ភាសា' : 'Language'}
              className="flex items-center gap-1.5 sm:gap-2 h-auto pl-1.5 pr-1.5 sm:pr-2.5 py-1.5 rounded-xl border-brand-200 bg-white hover:bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-slate-700 dark:border-slate-600 dark:text-brand-300 dark:hover:bg-slate-600"
            >
              <activeLang.Flag />
              <span className="hidden sm:inline">{activeLang.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${langOpen ? 'rotate-180' : ''}`} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            role="listbox"
            className="w-44 rounded-2xl shadow-xl p-1.5 dark:bg-slate-800 dark:border-slate-700"
          >
            {LANGUAGES.map(lang => {
              const active = state.language === lang.code
              return (
                <DropdownMenuItem
                  key={lang.code}
                  role="option"
                  aria-selected={active}
                  onSelect={() => {
                    if (!active) {
                      dispatch({ type: 'TOGGLE_LANGUAGE' })
                      showToast(lang.toast, 'info')
                    }
                  }}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs cursor-pointer ${
                    active
                      ? 'font-bold text-brand-700 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/30'
                      : 'font-semibold text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <lang.Flag />
                  <span className="truncate">{lang.label}</span>
                  {active && <Check className="w-4 h-4 ml-auto flex-shrink-0 text-brand-600 dark:text-brand-400" />}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* System operations (EOD / EOM batches) */}
        <DropdownMenu open={sysOpsOpen} onOpenChange={only(setSysOpsOpen)}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title={isKh ? 'ប្រតិបត្តិការប្រព័ន្ធ' : 'System Operations'}
              className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
            >
              <MonitorCog className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[calc(100vw-1.5rem)] max-w-80 rounded-2xl shadow-xl p-0 dark:bg-slate-800 dark:border-slate-700"
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {isKh ? 'ប្រតិបត្តិការប្រព័ន្ធ' : 'System Operations'}
              </p>
            </div>
            <div className="p-3 space-y-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">End of Day (EOD) Batch</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Calculates daily accruals, updates account balances, runs overdue detection, generates daily summary reports, and posts automated journal entries.
                </p>
                <Button
                  onClick={() => { showToast('EOD batch completed successfully', 'success'); setSysOpsOpen(false) }}
                  className="mt-2.5 w-full h-auto flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-xl text-xs font-bold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Run EOD
                </Button>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">End of Month (EOM) Batch</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Finalizes monthly accruals and interest income, runs PAR aging, calculates required loan loss provisions, closes monthly accounting period, and archives data for regulatory reporting.
                </p>
                <Button
                  onClick={() => { showToast('EOM batch completed successfully', 'success'); setSysOpsOpen(false) }}
                  className="mt-2.5 w-full h-auto flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Run EOM
                </Button>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 leading-relaxed">
                  Note: Batch operations are irreversible. Ensure all daily transactions have been posted before running EOD. Contact your system administrator before running EOM.
                </p>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu open={notifOpen} onOpenChange={only(setNotifOpen)}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[calc(100vw-1.5rem)] max-w-80 rounded-2xl shadow-xl p-0 dark:bg-slate-800 dark:border-slate-700"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{isKh ? 'សារជូនដំណឹង' : 'Notifications'}</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => dispatch({ type: 'MARK_NOTIFICATIONS_READ' })}
                className="h-auto p-0 text-xs text-brand-600 font-semibold hover:text-brand-700 hover:no-underline"
              >
                {isKh ? 'សម្គាល់ទាំងអស់ថាបានអាន' : 'Mark all read'}
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {state.notifications.length === 0
                ? <p className="text-xs text-slate-400 text-center py-6">No notifications</p>
                : state.notifications.map((n, i) => (
                  <div key={i} className={`px-4 py-3 border-b border-slate-50 text-xs dark:border-slate-700 ${n.read ? 'opacity-60' : ''}`}>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">{n.title}</p>
                    <p className="text-slate-400 mt-0.5">{n.body}</p>
                  </div>
                ))
              }
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dark mode */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { dispatch({ type: 'TOGGLE_DARK_MODE' }); showToast(state.darkMode ? 'Light mode enabled' : 'Dark mode enabled', 'info') }}
          className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
        >
          {state.darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        {/* Profile */}
        <DropdownMenu open={profileOpen} onOpenChange={only(setProfileOpen)}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex items-center gap-2.5 h-auto px-3 py-1.5 rounded-xl border-slate-200/60 bg-slate-50 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:hover:bg-slate-600"
            >
              <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                <User className="w-4 h-4" />
              </div>
              <div className="text-left hidden md:block">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{ROLE_SAMPLE_NAMES[state.currentRole] || state.currentRole}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{state.currentRole}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[calc(100vw-1.5rem)] max-w-64 rounded-2xl shadow-xl p-2 dark:bg-slate-800 dark:border-slate-700"
          >
            <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Logged in as (demo)
            </p>
            <div className="px-1 pb-2 flex flex-col gap-0.5">
              {Object.keys(state.roleMatrix).map(role => (
                <DropdownMenuItem
                  key={role}
                  onSelect={() => {
                    dispatch({ type: 'SET_CURRENT_ROLE', role })
                    showToast(`Switched to ${ROLE_SAMPLE_NAMES[role] || role} (${role})`, 'info')
                  }}
                  className={`flex-col items-start w-full px-3 py-2 rounded-xl cursor-pointer ${
                    state.currentRole === role
                      ? 'bg-brand-600 text-white focus:bg-brand-600 focus:text-white data-[highlighted]:bg-brand-600 data-[highlighted]:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <p className="text-xs font-semibold">{ROLE_SAMPLE_NAMES[role] || role}</p>
                  <p className={`text-[10px] ${state.currentRole === role ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>{role}</p>
                </DropdownMenuItem>
              ))}
            </div>
            <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
            <DropdownMenuItem
              onSelect={() => dispatch({ type: 'OPEN_SETTINGS' })}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
            >
              <Settings className="w-4 h-4" />
              {isKh ? 'ការកំណត់' : 'Settings'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => showToast('Sign out (mock)', 'info')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-rose-600 focus:text-rose-600 focus:bg-rose-50 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-600 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              {isKh ? 'ចាកចេញ' : 'Sign Out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
