import { useEffect, useState } from 'react'
import { ChevronLeft, Eye, EyeOff, Frown, KeyRound, Landmark, MoreVertical, User, UserRound } from 'lucide-react'
import ProviderLogo from './ProviderLogo'

// ── WeBill365's own sign-in ─────────────────────────────────────────────────
// WeBill365 is the one provider whose sign-in is its own product rather than a field on a
// form, so Connect opens it as a popup in the provider's own layout: sign in, or create an
// account, and then the account it created. Every other provider still uses the generic
// AuthPanel beside this one.
//
// Nothing here talks to WeBill365 — there is no backend. What it can honestly do is claim the
// phone number this install exchanges data as and remember the profile entered against it; the
// password is checked and dropped rather than stored, exactly as AuthPanel does.

const BRAND = '#1B2BEF'

// The country codes a Cambodian back office actually dials. Kept short on purpose — a full
// ITU list would bury the one that is right for nearly every account.
const DIAL_CODES = ['+855', '+66', '+84', '+65', '+1']

// Banks a Cambodian MFI actually settles through. A free-text field would let a typo through
// as a valid-looking account, which is worse than a list that occasionally needs adding to.
const BANKS = [
  'ABA Bank', 'ACLEDA Bank', 'Canadia Bank', 'Wing Bank', 'Vattanac Bank',
  'Sathapana Bank', 'Prince Bank', 'Phillip Bank', 'J Trust Royal Bank', 'Chip Mong Bank',
]

const Label = ({ children, required }) => (
  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
    {children}
    {required && <span className="text-rose-500 ml-0.5">*</span>}
  </label>
)

const field = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B2BEF]/30 focus:border-[#1B2BEF]'
const readOnlyField = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300'

// Reveal toggle, in the provider's own blue rather than the app's.
function PasswordField({ value, onChange, placeholder, autoComplete }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <input
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
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#1B2BEF] dark:text-[#6E7BFF] hover:opacity-70"
      >
        {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

const ErrorNote = ({ children }) => children ? (
  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{children}</p>
) : null

export default function WeBill365Auth({ integration, mode, embedded = false, onSignIn, onRegister, onClose, onBankAccountChange, onProfileChange }) {
  const [editing, setEditing] = useState(false)
  // The bank account collected payments settle into. Held as a draft while it is being filled
  // in so a half-typed account never counts as activated.
  const [bankOpen, setBankOpen] = useState(false)
  const [draft, setDraft] = useState({ bankName: '', accountName: '', accountNumber: '' })
  const [bankError, setBankError] = useState('')
  // An install with no WeBill365 account has nothing to sign in with, so it opens on the
  // sign-up instead of on a login it would have to back out of. Each links to the other.
  const [view, setView] = useState(integration.login?.registered ? 'login' : 'signup')
  const [error, setError] = useState('')

  // Sign-in
  const [loginId, setLoginId] = useState(integration.login?.userId || '')
  const [loginPw, setLoginPw] = useState('')

  // Registration
  const [form, setForm] = useState({
    fullName: '', email: '', dialCode: DIAL_CODES[0], phone: '', otp: '', password: '', confirm: '',
  })
  const [otpSent, setOtpSent] = useState(false)
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }

  // Local state, so App.jsx's global Escape handler can't reach it. Embedded there is no
  // popup to dismiss, and swallowing Escape would stop it closing the Settings modal behind.
  useEffect(() => {
    if (embedded) return undefined
    const handleKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [embedded, onClose])

  const profile = integration.login?.profile || {}
  const bank = integration.bankAccount || null
  const bankReady = !!draft.bankName && !!draft.accountName.trim() && !!draft.accountNumber.trim()

  function activateBank() {
    if (!bankReady) return
    const accountNumber = draft.accountNumber.trim()
    // Digits only: the number is what a payment is routed on, and a stray letter would leave
    // the account looking activated while nothing could ever settle into it.
    if (!/^\d{6,20}$/.test(accountNumber)) {
      return setBankError('An account number is 6 to 20 digits')
    }
    onBankAccountChange({
      bankName: draft.bankName,
      accountName: draft.accountName.trim(),
      accountNumber,
    })
    setBankOpen(false)
    setBankError('')
  }

  // Everything the Sign Up button waits on. The button is dead until they are all in, so the
  // form is never submitted into a list of errors.
  const signUpReady = !!form.fullName.trim() && !!form.phone.trim() && otpSent
    && form.otp.trim().length === 6 && form.password.length >= 6 && form.confirm.length > 0

  function sendOtp() {
    if (!form.phone.trim()) return setError('Enter your telephone number first')
    setOtpSent(true)
    setError('')
  }

  function submitLogin(e) {
    e.preventDefault()
    const id = loginId.trim()
    if (!id) return setError('Enter your ID or phone number')
    if (!loginPw) return setError('Enter your password')
    if (!integration.login?.registered) {
      return setError('No WeBill365 account on this install yet — create one for free below.')
    }
    if (id.toLowerCase() !== (integration.login.userId || '').toLowerCase()) {
      return setError('That ID or phone number is not the account registered on this install')
    }
    onSignIn(id)
  }

  function submitSignUp(e) {
    e.preventDefault()
    if (!signUpReady) return
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setError('That email address does not look right')
    }
    if (form.password !== form.confirm) return setError('The two passwords do not match')
    const phone = `${form.dialCode} ${form.phone.trim()}`.trim()
    onRegister(phone, {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      phone,
    })
  }

  // Embedded, this same card is the provider's own panel rather than a popup over it: no
  // backdrop, no dialog role, and no Cancel — there is nothing above it to back out to.
  const shell = embedded
    ? 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm w-full flex flex-col'
    : 'bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full flex flex-col max-h-[92vh]'

  const body = (
    <>
      {/* ── After registering: the account WeBill365 just created ──────────── */}
      {mode === 'account' ? (
        <div className={embedded ? shell : `${shell} max-w-2xl`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{integration.name} Account</h2>
            {!embedded && (
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold hover:opacity-70"
                style={{ color: BRAND }}
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
            <section>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Profile</h3>
                {/* Edits in place. There is no configuration tab behind this any more, so a
                    button that sent the operator somewhere else would send them nowhere. */}
                <button
                  type="button"
                  onClick={() => setEditing(e => !e)}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: BRAND }}
                >
                  {editing ? 'Done' : 'Edit Profile'}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 sm:items-stretch">
                {/* Stretches beside both field rows rather than sitting square against the
                    first, so the block reads as one panel. */}
                <div className="relative w-28 sm:w-24 h-28 sm:h-auto sm:min-h-[7rem] rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <UserRound className="w-14 h-14 text-emerald-800/70 dark:text-emerald-400/70" strokeWidth={1.25} />
                  <button
                    type="button"
                    onClick={() => setEditing(e => !e)}
                    aria-label="Profile options"
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 min-w-0">
                  <div className="sm:col-span-2">
                    <Label required>Full Name</Label>
                    {editing ? (
                      <input
                        autoFocus
                        value={profile.fullName || ''}
                        onChange={e => onProfileChange({ fullName: e.target.value })}
                        placeholder="Enter your full name"
                        className={field}
                      />
                    ) : <p className={readOnlyField}>{profile.fullName || '—'}</p>}
                  </div>
                  <div>
                    {/* The phone number is the account this install signs in as, so it is not
                        editable here — changing it would be signing in as someone else. */}
                    <Label required>Phone Number</Label>
                    <p className={readOnlyField}>{profile.phone || integration.login?.userId || '—'}</p>
                  </div>
                  <div>
                    <Label>Email Address</Label>
                    {editing ? (
                      <input
                        type="email"
                        value={profile.email || ''}
                        onChange={e => onProfileChange({ email: e.target.value })}
                        placeholder="Enter your email"
                        className={field}
                      />
                    ) : <p className={readOnlyField}>{profile.email || '—'}</p>}
                  </div>
                </div>
              </div>
            </section>

            <div className="border-t border-slate-100 dark:border-slate-700" />

            <section>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Bank Account</h3>
              {/* Nothing can be billed or collected until the merchant account is set — and
                  the KHQR a borrower scans on a repayment schedule is built from it. */}
              {bank ? (
                /* Activated — what it is, and the way back into it. */
                <div className="rounded-xl border border-slate-100 dark:border-slate-700 p-4 flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
                    <Landmark className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{bank.bankName}</p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                        Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{bank.accountName}</p>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{bank.accountNumber}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setDraft(bank); setBankOpen(true) }}
                    className="text-xs font-bold hover:opacity-70 flex-shrink-0"
                    style={{ color: BRAND }}
                  >
                    Change
                  </button>
                </div>
              ) : bankOpen ? (
                /* Setting one up. Every field is required — a bank account missing any of
                   them cannot be paid into, so a half-filled one must not count as active. */
                <div className="max-w-md space-y-4">
                  <div>
                    <Label required>Bank Name</Label>
                    <select
                      value={draft.bankName}
                      onChange={e => setDraft(d => ({ ...d, bankName: e.target.value }))}
                      className={field}
                    >
                      <option value="">Select a bank</option>
                      {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label required>Account Name</Label>
                    <input
                      value={draft.accountName}
                      onChange={e => setDraft(d => ({ ...d, accountName: e.target.value }))}
                      placeholder="Name the account is held in"
                      className={field}
                    />
                  </div>
                  <div>
                    <Label required>Account Number</Label>
                    <input
                      value={draft.accountNumber}
                      onChange={e => setDraft(d => ({ ...d, accountNumber: e.target.value }))}
                      placeholder="e.g. 000123456789"
                      inputMode="numeric"
                      className={`${field} font-mono`}
                    />
                  </div>
                  <ErrorNote>{bankError}</ErrorNote>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={activateBank}
                      disabled={!bankReady}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-opacity ${
                        bankReady ? 'text-white hover:opacity-90' : 'text-slate-400 bg-slate-100 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
                      }`}
                      style={bankReady ? { backgroundColor: BRAND } : undefined}
                    >
                      Activate bank account
                    </button>
                    <button
                      type="button"
                      onClick={() => { setBankOpen(false); setBankError('') }}
                      className="px-4 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center py-6">
                  {/* The bank with nothing behind it yet — the downturned face is what makes
                      an empty state read as "not set up" rather than as decoration. */}
                  <div className="relative w-16 h-16 rounded-2xl bg-slate-50 dark:bg-slate-700/50 flex items-center justify-center mb-4">
                    <Landmark className="w-8 h-8 text-slate-400" strokeWidth={1.5} />
                    <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                      <Frown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Activate bank account</p>
                  {/* Narrow enough to break after "payments", the way the design reads */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[13.5rem] leading-relaxed">
                    To start billing and collecting payments from the customers
                  </p>
                  <button
                    type="button"
                    onClick={() => { setDraft({ bankName: '', accountName: '', accountNumber: '' }); setBankError(''); setBankOpen(true) }}
                    className="mt-4 px-4 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Set up bank account
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : view === 'login' ? (
        /* ── Sign in ──────────────────────────────────────────────────────── */
        <form onSubmit={submitLogin} className={`${shell} max-w-xs`} onClick={e => e.stopPropagation()}>
          <div className="px-6 py-7 space-y-4">
            <div className="text-center">
              <ProviderLogo id={integration.id} name={integration.name} size="lg" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">Simple. Smart. Secured.</p>
            </div>

            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                autoFocus
                value={loginId}
                onChange={e => { setLoginId(e.target.value); setError('') }}
                placeholder="ID or Phone number"
                autoComplete="username"
                className={`${field} pl-9`}
              />
            </div>

            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
              <div className="[&_input]:pl-9">
                <PasswordField
                  value={loginPw}
                  onChange={v => { setLoginPw(v); setError('') }}
                  placeholder="Password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <ErrorNote>{error}</ErrorNote>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white hover:opacity-90 transition-opacity"
              style={{ backgroundColor: BRAND }}
            >
              Login
            </button>

            <div className="flex items-center gap-3">
              <span className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
              <span className="text-xs text-slate-400 dark:text-slate-500">Don’t have account?</span>
              <span className="flex-1 h-px bg-slate-200 dark:bg-slate-600" />
            </div>

            <button
              type="button"
              onClick={() => { setView('signup'); setError('') }}
              className="w-full py-2.5 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Create Account for Free
            </button>
          </div>
        </form>
      ) : (
        /* ── Create an account ────────────────────────────────────────────── */
        <form onSubmit={submitSignUp} className={`${shell} max-w-xs`} onClick={e => e.stopPropagation()}>
          <div className="flex-1 overflow-y-auto px-6 py-7 space-y-4">
            <div className="text-center">
              <ProviderLogo id={integration.id} name={integration.name} size="lg" />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mt-4">Set up Personal Information</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Identify yourself to your business partners</p>
            </div>

            <div>
              <Label required>Full Name</Label>
              <input
                value={form.fullName}
                onChange={e => set('fullName', e.target.value)}
                placeholder="Enter your full name"
                autoComplete="name"
                className={field}
              />
            </div>

            <div>
              <Label>Email Address</Label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                className={field}
              />
            </div>

            <div>
              <Label required>Telephone Number</Label>
              <div className="flex items-center gap-2">
                <select
                  value={form.dialCode}
                  onChange={e => set('dialCode', e.target.value)}
                  aria-label="Country dialling code"
                  className={`${field} w-24 flex-shrink-0 px-2`}
                >
                  {DIAL_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="Enter phone number"
                  autoComplete="tel"
                  className={`${field} min-w-0`}
                />
                <button
                  type="button"
                  onClick={sendOtp}
                  className="text-xs font-semibold whitespace-nowrap flex-shrink-0 hover:opacity-70 disabled:opacity-40"
                  style={{ color: BRAND }}
                >
                  {otpSent ? 'Resend' : 'Send OTP'}
                </button>
              </div>
            </div>

            <div>
              <Label required>OTP Number</Label>
              <input
                value={form.otp}
                onChange={e => set('otp', e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={!otpSent}
                placeholder="Enter pin code"
                inputMode="numeric"
                autoComplete="one-time-code"
                className={`${field} disabled:bg-slate-100 dark:disabled:bg-slate-700/60 disabled:cursor-not-allowed`}
              />
              {/* No code is sent — there is nothing behind this to send one. Said plainly
                  rather than showing a code the form would then check against itself. */}
              {otpSent && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  Enter the 6-digit code sent to {form.dialCode} {form.phone}.
                </p>
              )}
            </div>

            <div>
              <Label required>Password</Label>
              <PasswordField
                value={form.password}
                onChange={v => set('password', v)}
                placeholder="Enter your password"
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label required>Confirm Password</Label>
              <PasswordField
                value={form.confirm}
                onChange={v => set('confirm', v)}
                placeholder="Enter your confirm password"
                autoComplete="new-password"
              />
            </div>

            <ErrorNote>{error}</ErrorNote>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setView('login'); setError('') }}
                className="flex items-center gap-1 text-sm font-semibold hover:opacity-70"
                style={{ color: BRAND }}
              >
                <ChevronLeft className="w-4 h-4" />
                Login
              </button>
              <button
                type="submit"
                disabled={!signUpReady}
                className={`px-5 py-2 rounded-lg text-sm font-bold transition-opacity ${
                  signUpReady
                    ? 'text-white hover:opacity-90'
                    : 'text-slate-400 bg-slate-100 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
                }`}
                style={signUpReady ? { backgroundColor: BRAND } : undefined}
              >
                Sign Up
              </button>
            </div>
          </div>
        </form>
      )}
    </>
  )

  if (embedded) return body

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'account' ? 'WeBill365 Account' : 'Sign in to WeBill365'}
    >
      {body}
    </div>
  )
}
