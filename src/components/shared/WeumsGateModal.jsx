import { useEffect } from 'react'
import { X, LogIn } from 'lucide-react'
import ProviderLogo from '../integration/ProviderLogo'
import { Button } from '@/components/ui/button'

// Shown by every repayment-reminder send button (Reminder module, and the loan's own
// Repayment Reminder tab in LoanOverview / LoanPreview / LoanQuickPreviewModal) when this
// install has no WeUMS account yet — see weumsSignedIn in utils/reminders.js. Points the
// user at Settings → Integration, the same place any other provider is signed in to.
export default function WeumsGateModal({ onClose, onGoToIntegrations }) {
  // Local component state, so App.jsx's global Escape handler can't reach it.
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="min-w-0">
            <ProviderLogo id="weums" name="WeUMS" size="md" />
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="Close" className="h-auto w-auto p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-transparent flex-shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="px-5 py-5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mx-auto mb-3">
            <LogIn className="w-6 h-6 text-brand-600 dark:text-brand-400" />
          </div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Sign in to WeUMS to send reminders</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-snug">
            Repayment reminders go out to borrowers as SMS through WeUMS. Register or sign in
            with your WeUMS account under Integrations before sending.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-auto px-4 py-2 text-sm font-semibold rounded-xl border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Not now
          </Button>
          <Button
            onClick={onGoToIntegrations}
            className="h-auto flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-sm font-semibold rounded-xl shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            Sign In / Register
          </Button>
        </div>
      </div>
    </div>
  )
}
