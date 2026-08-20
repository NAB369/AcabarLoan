import { ShieldOff } from 'lucide-react'
import { TAB_TITLES } from '../../utils/navigation'
import { useApp } from '../../context/AppContext'

// Shown where a module would be, for an account whose permission for it has been taken away
// (see rule 13 — a revoked permission bites on the next render, not at the next sign-in). It says
// which module and who can restore it, because "you can't see this" without either is a dead end
// the operator can only respond to by reloading and trying again.
export default function NoAccess({ tab }) {
  const { state } = useApp()
  const name = TAB_TITLES[tab] || 'this module'
  return (
    <div className="p-4 sm:p-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
        <ShieldOff className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-3">
          {name} is not open to your account
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
          Your role ({state.currentRole || 'none'}) does not hold the permission for it, or a Super Admin has
          revoked it for your account. Ask a Super Admin to grant it under Customers → Permissions —
          it applies as soon as they do, with no need to sign out.
        </p>
      </div>
    </div>
  )
}
