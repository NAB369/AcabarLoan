import { Component } from 'react'

// The one class component in the codebase, and it has to be: error boundaries have no hook
// equivalent. Without it a render error anywhere blanked the whole app to white — and with the
// state living in localStorage rather than on a server, the operator had no way to tell whether
// the work they had just done was saved or lost.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Nowhere to report it to — there is no backend — so the console is the record, and it is
    // what a developer will be asked to look at when this screen is reported.
    console.error('Unhandled error in Acabar UI:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">
            This screen stopped responding
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Something in the page failed while drawing it. Your saved work is untouched — the
            loan book is written to this browser as you go, and reloading brings it back.
          </p>
          {/* The message, not a stack trace: it is the one line worth quoting when reporting
              this, and a stack in front of a loan officer is noise. */}
          <p className="mt-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 font-mono text-[11px] text-slate-500 dark:text-slate-400 break-words">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="flex items-center gap-3 mt-5">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold transition-colors"
            >
              Reload the app
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
