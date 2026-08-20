import { useState } from 'react'
import { ArrowLeft, BadgeCheck, Lock, Mail, ShieldCheck, User, UserPlus } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import {
  needsPassword, verifyPassword, hashPassword, makeSalt, passwordProblem, cryptoAvailable,
} from '../../utils/credentials'
import { signInBlock, mustChangePassword, isSuperAdmin, PLATFORM_NAME_DEFAULT } from '../../utils/governance'
import {
  AuthBrandHeader, AuthFootnote, AuthOperatorHeader, Explainer, InsecureContextWarning,
  PasswordField, field, label, leadIcon,
} from './AuthChrome'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Sign in ──────────────────────────────────────────────────────────────────
// Nothing behind this renders until an account is signed in, which is what replaces "the app
// opens as Admin for whoever loads the page". The role that governs every permission comes from
// the account itself — the role picker that used to sit in the header is gone.
//
// Accounts are matched on EITHER the work email or the username. The email is what staff know
// and what this screen asks for; the username is what every account already had before emails
// were added, so accepting both is what stops an existing install being locked out by a field
// its records have never carried.
//
// An account with no credential on file sets one here, on its first sign-in. No default password
// ships: a known starting credential that nobody changes is how a system like this gets opened,
// and there is no administrator standing over the install to force a reset.
//
// Someone with no account at all goes to SignUpScreen, which files a request an Admin grants —
// not a registration that lets itself in. The footer link below is what sends them there.
//
// TWO DOORS, ONE SCREEN. `operator` renders this as the Super Admin's own sign-in (#/super-admin):
// operator branding rather than the tenant's, no request-access route, and only an account that
// governs Admins may start a session. Everything that decides whether a sign-in is allowed —
// lockout, the sign-in window, password expiry, the first-sign-in password — is deliberately the
// same code on both, because two copies of that logic is how one of them ends up weaker.

export default function LoginScreen({ operator = false }) {
  const { state, dispatch, showToast } = useApp()
  const { systemUsers } = state

  const [identifier, setIdentifier] = useState(
    // Prefilled on a single-account business install as a convenience. Never on the operator door:
    // that URL is semi-private, and naming the account that governs every other one to anybody who
    // opens it would undo the point of the door being separate.
    !operator && systemUsers.length === 1 ? (systemUsers[0].email || systemUsers[0].username) : ''
  )
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aside, setAside] = useState(null)
  // Set once a correct password has been given for an account whose password has expired or been
  // reset by a Super Admin. The form then asks for the replacement before any session starts —
  // it is not a refusal, so it is kept apart from the error state.
  const [forcedChange, setForcedChange] = useState(false)
  // Whether a reset has been asked for in this visit. Local, because the confirmation is about what
  // just happened on screen, not about the state of the account.
  const [resetSent, setResetSent] = useState(false)
  // Checked once at render: whether the page is in a secure context cannot change while it is open.
  const secure = cryptoAvailable()

  // Email or username, matched case-insensitively — an address typed with a capital at a branch
  // counter is the same account, and refusing it would read to the operator as a wrong password.
  const typed = identifier.trim().toLowerCase()
  const account = systemUsers.find(u =>
    (u.email || '').toLowerCase() === typed || (u.username || '').toLowerCase() === typed)
  // Becomes the set-a-password form only once the account is known to have no credential, so an
  // unknown address cannot be told apart from a known one by which fields appear.
  // Who this door is for. Checked as a property of the ACCOUNT, not of the screen: an account that
  // does not govern Admins cannot start a session here however it arrived.
  const eligible = !!account && (!operator || isSuperAdmin(account))
  const settingUp = eligible && account.status === 'Active' && needsPassword(account)
  // The two paths that ask for a new password look the same and validate the same way.
  const choosing = settingUp || forcedChange

  // The ask needs a name to attach itself to, and that is the one thing this screen already has.
  function askForReset() {
    if (!identifier.trim()) {
      setError('Type your username or email address first, so the request knows which account')
      return
    }
    if (account) dispatch({ type: 'REQUEST_PASSWORD_RESET', username: account.username })
    // Confirmed the same way whether or not that account exists. A screen that only confirms for
    // real accounts is a way to find out which ones are real.
    setResetSent(true)
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')

    if (!identifier.trim()) return setError('Enter your username or email address')
    // Checked only when what was typed is MEANT to be an address. The field takes a username too,
    // so demanding an @ from everything would refuse a perfectly good one — while a mistyped
    // address ("sokha@acabar" , "sokha @acabar.com.kh") would otherwise come back as the generic
    // "those details do not match", sending the operator to check a password that was never wrong.
    if (identifier.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())) {
      return setError('That does not look like an email address')
    }
    if (!password) return setError(choosing ? 'Choose a password' : 'Enter your password')

    // One message for an unknown account, a wrong password, a deactivated one and a requested
    // one still waiting on an Admin. Saying which it was would tell whoever is at the keyboard
    // which accounts exist — and the wording already covers the case: an account that is not
    // Active is not one you can sign into, whatever the reason.
    const refuse = () => setError('Those details do not match an active account')
    if (!account || account.status !== 'Active') return refuse()

    setBusy(true)
    try {
      if (choosing) {
        const problem = passwordProblem(password, confirm)
        if (problem) { setError(problem); return }
        const salt = makeSalt()
        const hash = await hashPassword(password, salt)
        dispatch({ type: 'SET_USER_PASSWORD', username: account.username, salt, hash })
        dispatch({ type: 'SIGN_IN', username: account.username, remember })
        showToast(`Password set — signed in as ${account.fullName}`, 'success')
        return
      }

      if (!await verifyPassword(password, account)) {
        // Counted on the record, not in this component: a screen can be reloaded to forget what it
        // knew, and the maximum-failed-attempts policy that locks the account is only worth
        // anything if the count outlives the page (see RECORD_FAILED_LOGIN).
        dispatch({ type: 'RECORD_FAILED_LOGIN', username: account.username })
        return refuse()
      }

      // Only now, with the password proved, is it safe to say WHY an account cannot sign in.
      // Before that point every refusal has to read the same, or this screen becomes a way to
      // find out which accounts exist and which are locked — and, on this door, which of them hold
      // the level.
      if (!eligible) {
        setError('This sign-in is for Super Admin accounts. Use the main sign-in for a business account.')
        return
      }

      const blocked = signInBlock(account)
      if (blocked) { setError(blocked); return }

      if (mustChangePassword(account)) {
        setForcedChange(true)
        setPassword('')
        setConfirm('')
        setError('')
        return
      }

      dispatch({ type: 'SIGN_IN', username: account.username, remember })
      showToast(`Signed in as ${account.fullName} (${account.role})`, 'success')
    } catch (err) {
      // Without this the hashing throwing left the button re-enabled and the screen unchanged —
      // a sign-in that fails for a reason nobody can see is indistinguishable from a wrong
      // password, and the real cause is not something a password retry can fix.
      console.error('Sign-in failed:', err)
      setError(err?.name === 'InsecureContextError'
        ? err.message
        : `Sign-in could not complete: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-slate-900">
      <div className="w-full max-w-sm">
        {operator
          ? <AuthOperatorHeader name={state.platformName || PLATFORM_NAME_DEFAULT} />
          : <AuthBrandHeader name={state.platformName || PLATFORM_NAME_DEFAULT} />}

        <form
          onSubmit={submit}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mt-6"
        >
          {!secure && <InsecureContextWarning />}

          {operator && (
            <div className="flex items-start gap-2.5 rounded-xl border border-gold-300/70 dark:border-gold-500/30 bg-gold-50/70 dark:bg-gold-500/10 px-3.5 py-3 mb-5">
              <ShieldCheck className="w-4 h-4 text-gold-700 dark:text-gold-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug text-slate-700 dark:text-slate-300">
                <span className="font-bold">Operator sign-in.</span> This door is for the accounts that
                govern the Admins. A business account signs in at the main screen.
              </p>
            </div>
          )}

          {settingUp && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              <span className="font-bold text-slate-700 dark:text-slate-200">First sign-in for {account.fullName}.</span>{' '}
              This account has no password on this install yet — choose one to continue. It is stored on
              this machine only.
            </p>
          )}

          {/* Not an error: the password given was right. The account's policy — an expiry a Super
              Admin set, or a reset they applied — requires a new one before the session starts. */}
          {forcedChange && (
            <div role="status" className="flex items-start gap-2.5 rounded-xl border border-brand-200/70 dark:border-brand-900 bg-brand-50/60 dark:bg-brand-900/20 px-3.5 py-3 mb-5">
              <Lock className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug text-brand-800 dark:text-brand-300">
                <span className="font-bold">This password has to be replaced.</span> It has either expired
                under the policy on your account or been reset by a Super Admin. Choose a new one to
                continue — nobody else sees it.
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="login-email" className={label}>Username or Email Address</label>
              <div className="relative">
                {/* The field takes either, so the icon says which one it is reading. Switches on the
                    @ rather than on a full address check: it has to be right while the address is
                    still half-typed, not only once it parses. */}
                {identifier.includes('@')
                  ? <Mail className={leadIcon} />
                  : <User className={leadIcon} />}
                {/* The placeholder shows an example of EACH form rather than only the email — the
                    label says the field takes both, so the example should too.

                    cn(), not string concatenation, for the padding: `field` already sets pr-3.5,
                    and two padding utilities in one class list are decided by stylesheet order
                    rather than by which was written last. tailwind-merge resolves it. */}
                <input
                  id="login-email"
                  autoFocus={!identifier}
                  value={identifier}
                  onChange={e => { setIdentifier(e.target.value); setError('') }}
                  placeholder="you@acabar.com.kh or sokha"
                  autoComplete="username"
                  className={cn(field, 'pr-24')}
                />
                {/* What the field decided it is reading, said in a word. A dual-purpose input that
                    gives no feedback leaves the operator guessing whether it understood them —
                    and this is the one field where guessing wrong reads as a wrong password.
                    aria-hidden: it restates the value the screen reader has just read out. */}
                {identifier.trim() && (
                  <span
                    aria-hidden="true"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-600 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300"
                  >
                    {identifier.includes('@') ? 'Email' : 'Username'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className={label}>
                {choosing ? 'New password' : 'Password'}
              </label>
              <PasswordField
                id="login-password"
                autoFocus={!!identifier}
                value={password}
                onChange={v => { setPassword(v); setError('') }}
                placeholder={choosing ? 'At least 8 characters, with a number' : 'Your password'}
                autoComplete={choosing ? 'new-password' : 'current-password'}
              />
            </div>

            {choosing && (
              <div>
                <label htmlFor="login-confirm" className={label}>Confirm password</label>
                <PasswordField
                  id="login-confirm"
                  value={confirm}
                  onChange={v => { setConfirm(v); setError('') }}
                  placeholder="Type it again"
                  autoComplete="new-password"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {/* A real choice, not a decoration: ticked, the session is kept in localStorage and
                  survives the browser closing; unticked it lives in sessionStorage and ends with
                  the tab. The idle screen lock still applies either way. */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={() => setRemember(v => !v)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40 flex-shrink-0"
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">Keep me signed in</span>
              </label>
              <button
                type="button"
                onClick={() => setAside(aside === 'forgot' ? null : 'forgot')}
                aria-expanded={aside === 'forgot'}
                className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>
            )}

            <Button
              type="submit"
              disabled={busy || !secure}
              className="h-auto w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-700 text-sm font-bold rounded-xl disabled:opacity-60"
            >
              {/* No forward arrow: the label says the whole action, and an arrow reads as "next
                  step" on a form that has none. */}
              {busy ? 'Checking…' : choosing ? 'Set password & sign in' : operator ? 'Sign in' : 'Login'}
            </Button>

            {/* The second control, and a button rather than the line of text it used to be. On the
                business door it is the way to ask for an account; on the operator door there is
                nothing to request — an operator account is not something a form grants — so it is
                the way back to the main screen instead. Outline either way: signing in is this
                view's one primary action (see ux-ui-design.md). */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <span className="w-full border-t border-slate-200 dark:border-slate-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-2 bg-white dark:bg-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {operator ? 'Not an operator' : 'No account yet'}
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch({ type: 'SET_AUTH_VIEW', view: operator ? 'sign-in' : 'sign-up' })}
              className="h-auto w-full flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl"
            >
              {operator ? <ArrowLeft className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {operator ? 'Main sign-in' : 'Request access'}
            </Button>
          </div>

          {/* No mail server, so no reset link — but the ask can still be recorded against the
              account, where the person who can act on it already works. Who that is differs by
              door: an Admin cannot clear a Super Admin's credential (the guard in SET_USER_PASSWORD
              refuses it, since that would be a way to take the level over), so on the operator door
              it is another Super Admin. */}
          {aside === 'forgot' && (
            <Explainer
              icon={resetSent ? BadgeCheck : Lock}
              title={resetSent
                ? 'Your request is recorded'
                : operator ? 'Another Super Admin resets it' : 'An Admin resets it for you'}
            >
              {resetSent ? (
                <>
                  {operator ? 'Another Super Admin' : 'An Admin'} sees it beside your account and clears
                  the password; you choose a new one the next time you sign in. Nobody has to read a
                  password out. Ask them directly if it is urgent — this leaves a note, not an alert.
                </>
              ) : (
                <>
                  {operator
                    ? 'Only another Super Admin can reset this account, from Customers in the console. If this install has just one Super Admin and its password is lost there is no way back in — keep a second one for exactly that reason.'
                    : 'There is no mail server behind this install, so no reset link can be sent. An Admin clears your password from Settings → User Accounts and you choose a new one at your next sign-in.'}
                  <button
                    type="button"
                    onClick={askForReset}
                    className="block mt-2 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    Ask for a reset
                  </button>
                </>
              )}
            </Explainer>
          )}
        </form>

        <AuthFootnote />
      </div>
    </div>
  )
}
