import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const icons = {
  success: <CheckCircle className="w-4 h-4 flex-shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 flex-shrink-0" />,
  error:   <XCircle className="w-4 h-4 flex-shrink-0" />,
  info:    <Info className="w-4 h-4 flex-shrink-0" />,
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
    <div className="fixed bottom-5 left-5 right-5 sm:left-auto z-[100] flex flex-col gap-2 items-stretch sm:items-end">
      {state.toasts.map(t => (
        <div
          key={t.id}
          className={`fade-in flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm font-semibold w-full sm:w-auto sm:max-w-sm ${styles[t.toastType] || styles.info}`}
        >
          {icons[t.toastType] || icons.info}
          <span className="flex-1">{t.msg}</span>
          <button onClick={() => dispatch({ type: 'REMOVE_TOAST', id: t.id })} className="ml-1 opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
