import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const icons = {
  success: <CheckCircle className="w-4 h-4 flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 flex-shrink-0" />,
  error:   <XCircle className="w-4 h-4 flex-shrink-0" />,
  info:    <Info className="w-4 h-4 flex-shrink-0" />,
}

// Said aloud before the message, since the colour and icon that carry this visually say
// nothing to a screen reader.
const TYPE_WORD = {
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  info: 'Note',
}

const styles = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error:   'bg-rose-50 border-rose-200 text-rose-800',
  info:    'bg-brand-50 border-brand-200 text-brand-800',
}

export default function Toast() {
  const { state, dispatch } = useApp()

  return (
    // Toasts are this app's main channel for saying an action worked — "Loan submitted",
    // "Repayment recorded", "Credit Officer does not have permission". Without a live region
    // none of that reaches a screen reader, so every confirmation and every refusal happened
    // silently. `polite` waits for a pause in speech, which is right for a confirmation; an
    // error interrupts (see role below), because a refusal the user does not hear is a user
    // who thinks their action succeeded.
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-5 left-5 right-5 sm:left-auto z-[100] flex flex-col gap-2 items-stretch sm:items-end"
    >
      {state.toasts.map(t => (
        <div
          key={t.id}
          role={t.toastType === 'error' ? 'alert' : 'status'}
          className={`fade-in flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-semibold w-full sm:w-auto sm:max-w-sm ${styles[t.toastType] || styles.info}`}
        >
          {icons[t.toastType] || icons.info}
          {/* The icon carries the kind of message visually; the word carries it in text, so a
              screen reader hears "Error: …" rather than an unqualified sentence. */}
          <span className="sr-only">{TYPE_WORD[t.toastType] || TYPE_WORD.info}: </span>
          <span className="flex-1">{t.msg}</span>
          <button
            onClick={() => dispatch({ type: 'REMOVE_TOAST', id: t.id })}
            aria-label="Dismiss notification"
            className="ml-1 opacity-60 hover:opacity-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
