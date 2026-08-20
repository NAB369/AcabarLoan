import { useState } from 'react'
import { Eye, EyeOff, Lock, LogOut, ShieldAlert } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { companyLogoSrc } from '../../utils/companyLogo'
import { needsPassword, verifyPassword } from '../../utils/credentials'
import { Button } from '@/components/ui/button'

// ── Screen lock ──────────────────────────────────────────────────────────────
// Covers the app when the terminal has been idle, and when the operator locks it by hand. What
// it is for: a branch counter left showing a customer's national ID, address, balances and
// arrears to whoever walks past.
//
// Now that accounts have passwords, resuming asks for the signed-in user's own password rather
// than just a button — which is what makes this a lock rather than a curtain. Signing out
// instead is offered beside it, for the case where the next person at the counter is somebody
// else. The cover is opaque, not translucent: a blurred loan book is still readable at arm's
// length.
export default function ScreenLock() {
  const { state, dispatch, showToast } = useApp()
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!state.screenLocked) return null

  const { companyProfile } = state
  const account = state.systemUsers.find(u => u.username === state.currentUser)
  // An account whose credential was reset while the screen was locked has nothing to check
  // against, so the lock lets it back in rather than trapping the session behind a password
  // that no longer exists.
  const unverifiable = !account || needsPassword(account)

  async function resume(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    if (unverifiable) {
      dispatch({ type: 'UNLOCK_SCREEN' })
      return
    }
    if (!password) return setError('Enter your password to resume')
    setBusy(true)
    try {
      if (!await verifyPassword(password, account)) {
        setError('That is not your password')
        return
      }
      setPassword('')
      dispatch({ type: 'UNLOCK_SCREEN' })
    } catch (err) {
      // A password that cannot be checked must not leave the operator locked out of a session
      // with work in it: the reason is reported and Sign out below is the way through.
      console.error('Unlock failed:', err)
      setError(err?.message || 'Could not check that password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-slate-900 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Screen locked"
    >
      <form onSubmit={resume} className="w-full max-w-xs text-center">
        <img
          src={companyLogoSrc(companyProfile)}
          alt=""
          className="w-14 h-14 rounded-full object-contain mx-auto ring-2 ring-gold-400/50"
        />
        <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mt-6">
          <Lock className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-lg font-bold text-white mt-4">Screen locked</h1>
        <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
          {account
            ? <>Signed in as <span className="font-semibold text-slate-200">{account.fullName}</span></>
            : 'The loan book was covered.'}
        </p>

        {!unverifiable && (
          <div className="relative mt-5 text-left">
            <label htmlFor="lock-password" className="sr-only">Your password</label>
            <input
              id="lock-password"
              autoFocus
              type={shown ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Your password"
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-white/15 bg-white/5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
            />
            <button
              type="button"
              onClick={() => setShown(v => !v)}
              aria-label={shown ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
            >
              {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-semibold text-rose-400 mt-2 text-left">{error}</p>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="h-auto w-full mt-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-sm font-bold rounded-xl disabled:opacity-60"
        >
          {busy ? 'Checking…' : 'Resume work'}
        </Button>

        {/* For the case the lock cannot solve: the next person at this terminal is somebody
            else, and they need their own session rather than this one reopened. */}
        <button
          type="button"
          onClick={() => { dispatch({ type: 'SIGN_OUT' }); showToast('Signed out', 'info') }}
          className="flex items-center justify-center gap-1.5 w-full mt-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out and switch user
        </button>

        <p className="flex items-start gap-2 text-left text-[11px] leading-snug text-slate-500 mt-6">
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>
            Checked in this browser against the stored digest. Data here is unencrypted, so treat
            the machine itself as the control and keep real customer data off shared terminals.
          </span>
        </p>
      </form>
    </div>
  )
}
