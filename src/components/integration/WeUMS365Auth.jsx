import { useEffect, useState } from 'react'
import { Eye, EyeOff, MessageSquare, X } from 'lucide-react'

// ── WeUMS365's own sign-in ──────────────────────────────────────────────────
// WeUMS365 signs in as its own product rather than through the generic AuthPanel beside it:
// it is an email-and-password account with a sign-up and a password reset of its own, which
// the ID-and-password form next door cannot express. Every other provider except WeBill365
// still uses that form.
//
// Nothing here talks to WeUMS365 — there is no backend. What it can honestly do is claim the
// email address this install sends SMS as and remember the name entered against it; the
// password is checked and dropped rather than stored, exactly as AuthPanel does.

// The blue WeUMS is already drawn in on the Integrations card strip and logo tile
// (PROVIDER_STYLE.weums), so these screens are drawn in the same one rather than a second
// blue that would disagree with the card the operator arrived from.
const BRAND = '#1B2BEF'

const emailLooksRight = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim())

// The product lockup as the WeUMS365 screens carry it: the messaging bubble, the wordmark
// with its "365", and what the product is underneath. ProviderLogo draws the mark used
// everywhere else in the app ("WeUMS", no 365, no bubble) and is deliberately left alone —
// this fuller lockup belongs to the provider's own screens, not to the app's provider lists.
function WeUms365Mark() {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-3">
        <div className="relative flex-shrink-0">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: BRAND }}
          >
            <MessageSquare className="w-6 h-6 text-white" strokeWidth={2.25} />
          </div>
          {/* The presence dot the mark carries — a messaging product that is up. */}
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-800" />
        </div>
        <span
          role="img"
          aria-label="WeUMS365"
          className="inline-flex items-center font-extrabold tracking-tight leading-none text-2xl"
        >
          <span className="text-[#1B2BEF] dark:text-[#6E7BFF]">We</span>
          <span className="px-1 py-0.5 rounded-md bg-[#1B2BEF] dark:bg-[#6E7BFF] text-white">UMS</span>
          <span className="text-[#FF5C00] dark:text-[#FF8A3D]">365</span>
        </span>
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-2">Unified Messaging</p>
    </div>
  )
}

const Label = ({ children, required, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
    {children}
    {required && <span className="text-rose-500 ml-0.5">*</span>}
  </label>
)

const field = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B2BEF]/30 focus:border-[#1B2BEF]'

const checkbox = 'w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40 flex-shrink-0'

// Link-styled, for the switches between these three screens. A button rather than an <a>:
// there is nowhere to navigate to — the card swaps which form it is showing.
const TextLink = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-sm font-semibold hover:underline"
    style={{ color: BRAND }}
  >
    {children}
  </button>
)

// The one primary action each screen has, and the only solid button on it.
function SubmitButton({ disabled, children }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={`w-full py-2.5 rounded-lg text-sm font-bold text-white transition-opacity ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
      }`}
      style={{ backgroundColor: BRAND }}
    >
      {children}
    </button>
  )
}

function PasswordField({ id, value, onChange, placeholder, autoComplete }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${field} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShown(s => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

const ErrorNote = ({ children }) => children ? (
  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{children}</p>
) : null

export default function WeUMS365Auth({ integration, onSignIn, onRegister, onClose }) {
  const [view, setView] = useState('signin')
  const [error, setError] = useState('')

  // Local, so App.jsx's global Escape handler can't reach it — this popup is its own thing
  // and closes itself. All three views share it: whichever one is showing, Escape backs out
  // of the sign-in rather than only out of the first.
  useEffect(() => {
    const handleKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Prefilled only when the last sign-in asked to be remembered — that is the whole of what
  // "Remember me" can honestly do on an install that never stores a password. Unticked, the
  // field opens empty next time even though the account is still registered here.
  const remembered = integration.login?.remember === true
  const [email, setEmail] = useState(remembered ? (integration.login?.userId || '') : '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(remembered)

  const [signUp, setSignUp] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [accepted, setAccepted] = useState(false)
  const setUp = (k, v) => { setSignUp(f => ({ ...f, [k]: v })); setError('') }

  const [resetEmail, setResetEmail] = useState('')
  // Which address the code was asked for. Held rather than read off the field so the
  // confirmation names the address it was actually sent to.
  const [resetSentTo, setResetSentTo] = useState('')

  function go(next) {
    setView(next)
    setError('')
    setResetSentTo('')
  }

  function submitSignIn(e) {
    e.preventDefault()
    const id = email.trim()
    if (!id) return setError('Enter your email address')
    if (!emailLooksRight(id)) return setError('That email address does not look right')
    if (!password) return setError('Enter your password')
    if (!integration.login?.registered) {
      return setError(`No ${integration.name} account on this install yet — create one below.`)
    }
    if (id.toLowerCase() !== (integration.login.userId || '').toLowerCase()) {
      return setError('That email is not the account registered on this install')
    }
    onSignIn(id, remember)
  }

  // Everything Create Account waits on, so the button is never pressed into a list of errors.
  const signUpReady = !!signUp.firstName.trim() && !!signUp.lastName.trim()
    && !!signUp.email.trim() && signUp.password.length > 0 && accepted

  function submitSignUp(e) {
    e.preventDefault()
    if (!signUpReady) return
    const id = signUp.email.trim()
    if (!emailLooksRight(id)) return setError('That email address does not look right')
    if (signUp.password.length < 6) return setError('The password needs at least 6 characters')
    const firstName = signUp.firstName.trim()
    const lastName = signUp.lastName.trim()
    onRegister(id, {
      firstName,
      lastName,
      // Written alongside the two halves because everywhere else in the app reads a profile's
      // `fullName` (see WeBill365's account card) — splitting it here must not make the name
      // unreadable to a screen that only knows the one field.
      fullName: `${firstName} ${lastName}`.trim(),
      email: id,
    })
  }

  function submitReset(e) {
    e.preventDefault()
    const id = resetEmail.trim()
    if (!emailLooksRight(id)) return setError('That email address does not look right')
    setError('')
    setResetSentTo(id)
  }

  // A popup rather than a panel on the page: signing in to WeUMS365 is its own product's
  // screen, the same way WeBill365's is, and the provider page behind it has nothing usable
  // on it until the sign-in is through. `relative` carries the close button in the corner.
  const card = 'relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl px-6 sm:px-8 py-8'

  // Backdrop clicks close, so the card must not pass its own clicks up to it.
  const stop = e => e.stopPropagation()

  // Escape and the backdrop both close this, but neither is visible — the corner X is what
  // makes the way out of all three views something the operator can see.
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
    >
      <X className="w-4 h-4" />
    </button>
  )

  return (
    <div
      className="fixed inset-0 !mt-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Sign in to ${integration.name}`}
    >
      <div className="max-w-md mx-auto w-full my-auto">
        {/* ── Sign in ──────────────────────────────────────────────────────── */}
        {view === 'signin' && (
          <form onSubmit={submitSignIn} onClick={stop} className={card}>
            {closeButton}
            <WeUms365Mark />

            <div className="text-center mt-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Welcome Back</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Enter your credentials to access your account
              </p>
            </div>

            <div className="mt-7 space-y-4">
              <div>
                <Label htmlFor="weums-email" required>Email</Label>
                <input
                  id="weums-email"
                  type="email"
                  autoFocus
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  placeholder="john.doe@example.com"
                  autoComplete="username"
                  className={field}
                />
              </div>

              <div>
                <Label htmlFor="weums-password" required>Password</Label>
                <PasswordField
                  id="weums-password"
                  value={password}
                  onChange={v => { setPassword(v); setError('') }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={() => setRemember(v => !v)}
                    className={checkbox}
                  />
                  <span className="text-sm text-slate-600 dark:text-slate-300">Remember me</span>
                </label>
                <TextLink onClick={() => go('forgot')}>Forgot password?</TextLink>
              </div>

              <ErrorNote>{error}</ErrorNote>

              <SubmitButton>Sign In</SubmitButton>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 text-center mt-6">
              Don’t have an account? <TextLink onClick={() => go('signup')}>Sign up</TextLink>
            </p>
          </form>
        )}

        {/* ── Create an account ────────────────────────────────────────────── */}
        {view === 'signup' && (
          <form onSubmit={submitSignUp} onClick={stop} className={card}>
            {closeButton}
            <WeUms365Mark />

            <div className="text-center mt-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Create Account</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Enter your information to create your account
              </p>
            </div>

            <div className="mt-7 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="weums-first" required>First Name</Label>
                  <input
                    id="weums-first"
                    autoFocus
                    value={signUp.firstName}
                    onChange={e => setUp('firstName', e.target.value)}
                    placeholder="John"
                    autoComplete="given-name"
                    className={field}
                  />
                </div>
                <div>
                  <Label htmlFor="weums-last" required>Last Name</Label>
                  <input
                    id="weums-last"
                    value={signUp.lastName}
                    onChange={e => setUp('lastName', e.target.value)}
                    placeholder="Doe"
                    autoComplete="family-name"
                    className={field}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="weums-signup-email" required>Email</Label>
                <input
                  id="weums-signup-email"
                  type="email"
                  value={signUp.email}
                  onChange={e => setUp('email', e.target.value)}
                  placeholder="john.doe@example.com"
                  autoComplete="email"
                  className={field}
                />
              </div>

              <div>
                <Label htmlFor="weums-signup-password" required>Password</Label>
                <PasswordField
                  id="weums-signup-password"
                  value={signUp.password}
                  onChange={v => setUp('password', v)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={() => setAccepted(v => !v)}
                  className={`${checkbox} mt-0.5`}
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  I accept the Terms and Conditions{' '}
                  {/* Emphasised rather than linked, the same way WeBill365's Term of Use is:
                      this install holds no URL for WeUMS365's terms, and a link to nowhere is
                      worse than none. */}
                  <span className="font-semibold" style={{ color: BRAND }} title={`Held by ${integration.name}`}>
                    Terms and Conditions
                  </span>
                </span>
              </label>

              <ErrorNote>{error}</ErrorNote>

              <SubmitButton disabled={!signUpReady}>Create Account</SubmitButton>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 text-center mt-6">
              Already have an account? <TextLink onClick={() => go('signin')}>Sign in</TextLink>
            </p>
          </form>
        )}

        {/* ── Forgot password ──────────────────────────────────────────────── */}
        {view === 'forgot' && (
          <form onSubmit={submitReset} onClick={stop} className={card}>
            {closeButton}
            <WeUms365Mark />

            <div className="text-center mt-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Forgot Password</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                Enter your email address and we’ll send you a verification code to reset your password
              </p>
            </div>

            {resetSentTo ? (
              /* Where the flow honestly ends on this install: WeUMS365 holds the password and
                 sends the code, and nothing here can check one or set a new password. Said
                 plainly rather than showing a code entry that would only check itself. */
              <div className="mt-7 space-y-4">
                <div className="rounded-xl border border-emerald-200/60 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Reset code sent</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 leading-relaxed">
                    If <span className="font-semibold">{resetSentTo}</span> has a {integration.name} account,
                    a verification code is on its way. Follow it through {integration.name} to set a new
                    password, then sign in here with it — this install never stores your password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setResetEmail(''); go('signin') }}
                  className="w-full py-2.5 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <div className="mt-7 space-y-4">
                <div>
                  <Label htmlFor="weums-reset-email">Email Address</Label>
                  <input
                    id="weums-reset-email"
                    type="email"
                    autoFocus
                    value={resetEmail}
                    onChange={e => { setResetEmail(e.target.value); setError('') }}
                    placeholder="john.doe@example.com"
                    autoComplete="email"
                    className={field}
                  />
                </div>

                <ErrorNote>{error}</ErrorNote>

                {/* Held until there is an address to send to — a reset code with nowhere to go
                    is the one thing this button must not claim to have sent. */}
                <SubmitButton disabled={!resetEmail.trim()}>Send Reset Code</SubmitButton>
              </div>
            )}

            <p className="text-sm text-slate-600 dark:text-slate-300 text-center mt-6">
              Remember your password? <TextLink onClick={() => { setResetEmail(''); go('signin') }}>Sign in</TextLink>
            </p>
          </form>
        )}

        {/* Sits on the backdrop rather than in the card, so it reads the same under all
            three views. Light-on-dark in both themes — the backdrop is dark either way. */}
        <p className="text-[11px] text-white/70 text-center mt-3" onClick={stop}>
          Your email is saved with this install; the password is not stored.
        </p>
      </div>
    </div>
  )
}
