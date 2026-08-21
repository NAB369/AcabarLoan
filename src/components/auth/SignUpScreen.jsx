import { useState } from 'react'
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, ClipboardCheck, Mail, User } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { auditStamp } from '../../utils/format'
import { cryptoAvailable, hashPassword, makeSalt, passwordProblem } from '../../utils/credentials'
import { PLATFORM_NAME_DEFAULT } from '../../utils/governance'
import {
  AuthBrandHeader, AuthFootnote, InsecureContextWarning, PasswordField, field, label, leadIcon,
} from './AuthChrome'
import { Button } from '@/components/ui/button'

// ── Request an account ───────────────────────────────────────────────────────
// What the "Request Access" line on the sign-in screen used to only describe. It is a REQUEST,
// not a registration, and that difference is the whole design: an account created here is
// 'Pending' and holds no role, so it cannot sign in and could do nothing if it did, until an
// Admin opens Settings → User Accounts and grants it one. A back office where anyone who loads
// the page can mint themselves a working account is the same as having no sign-in screen at all.
//
// The applicant chooses their own password here rather than being sent one. Nobody has to read a
// credential out over the phone, and the Admin approving the request never sees it — approval is
// a decision about the person and the role, not the handover of a secret.
//
// The role they pick is recorded as `requestedRole` and is a note to the approver, never a grant.
// Admin is deliberately not offered: the first administrator ships with the install and further
// ones are made by an existing Admin in Settings, not asked for at a login screen.

// The username keys the account record, and sign-in accepts it as an alternative to the email
// (see LoginScreen), so it has to exist and be unique — but asking a new joiner to invent one is
// another field, another rule to explain and another error to hit. Derived from the email
// instead, with a numeric suffix if that name is taken, and shown back on the confirmation.
function deriveUsername(email, fullName, users) {
  const base = (email.split('@')[0] || fullName || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20) || 'user'
  const taken = name => users.some(u => (u.username || '').toLowerCase() === name)
  if (!taken(base)) return base
  let n = 2
  while (taken(`${base}${n}`)) n += 1
  return `${base}${n}`
}

export default function SignUpScreen() {
  const { state, dispatch, showToast } = useApp()
  const { systemUsers, roleMatrix } = state

  const [form, setForm] = useState({
    fullName: '', email: '', branch: '', requestedRole: '', password: '', confirm: '',
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  // The request, once made. Replaces the form rather than sitting under it: there is nothing left
  // to fill in, and a form still on screen invites a second identical request.
  const [sent, setSent] = useState(null)
  const secure = cryptoAvailable()

  // Every role the install has except Admin — read live off the matrix, so a role added in
  // Settings → Roles & Permissions is one a new joiner can ask for without touching this file.
  const roles = Object.keys(roleMatrix).filter(r => r !== 'Admin')

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => (e[k] ? { ...e, [k]: '' } : e))
  }

  const backToSignIn = () => dispatch({ type: 'SET_AUTH_VIEW', view: 'sign-in' })

  async function submit(e) {
    e.preventDefault()
    if (busy) return

    const fullName = form.fullName.trim()
    const email = form.email.trim()
    const problems = {}

    // Tied to the field that failed rather than collected into one banner, so a form this long
    // does not have to be re-read to find out which line the complaint is about.
    if (!fullName) problems.fullName = 'Enter your full name'
    if (!email) problems.email = 'Enter your work email address'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.email = 'That does not look like an email address'
    // Sign-in matches on the email, so two accounts sharing one address would make it ambiguous
    // which was being signed into. Said plainly rather than swallowed: a request that vanished
    // because the address was already known would leave someone waiting on an approval that is
    // never coming.
    else if (systemUsers.some(u => (u.email || '').toLowerCase() === email.toLowerCase())) {
      problems.email = 'An account already exists for this address — sign in instead'
    }
    if (!form.requestedRole) problems.requestedRole = 'Choose the role you need'
    const pw = passwordProblem(form.password)
    if (pw) problems.password = pw
    else if (form.confirm !== form.password) problems.confirm = 'The two passwords do not match'

    if (Object.keys(problems).length) { setErrors(problems); return }

    setBusy(true)
    try {
      const username = deriveUsername(email, fullName, systemUsers)
      const salt = makeSalt()
      const hash = await hashPassword(form.password, salt)
      dispatch({
        type: 'ADD_SYSTEM_USER',
        user: {
          username, email, fullName,
          // No role until an Admin grants one. `can()` reads permissions off the role, so an
          // empty one is a floor as well as a marker: even if a Pending account did reach a
          // session, there would be nothing it was permitted to open.
          role: '',
          requestedRole: form.requestedRole,
          branch: form.branch.trim(),
          status: 'Pending',
          requestedAt: auditStamp(),
          statusChanged: '',
          lastLogin: '',
        },
      })
      // Dispatched straight after the account exists, in the same handler: the reducer applies
      // the two in order, so the record is there for this to write onto.
      dispatch({ type: 'SET_USER_PASSWORD', username, salt, hash })
      setSent({ username, fullName })
      showToast('Access request sent to an Admin', 'success')
    } catch (err) {
      // Hashing throwing leaves nothing on screen to explain itself, and a retry cannot fix a
      // missing crypto API — say which of the two it was.
      console.error('Access request failed:', err)
      setErrors({
        form: err?.name === 'InsecureContextError'
          ? err.message
          : `The request could not be completed: ${err?.message || err}`,
      })
    } finally {
      setBusy(false)
    }
  }

  const err = key => errors[key] && (
    <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1.5">{errors[key]}</p>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100 dark:bg-slate-900">
      <div className="w-full max-w-sm">
        <AuthBrandHeader name={state.platformName || PLATFORM_NAME_DEFAULT} />

        {sent ? (
          // What happens next, in the order it happens, because none of it is something the
          // applicant can make progress on themselves.
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mt-6">
            <div className="flex items-start gap-3">
              <BadgeCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Request sent</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  The account for <span className="font-semibold text-slate-700 dark:text-slate-200">{sent.fullName}</span>{' '}
                  is waiting on an Admin. It cannot sign in until one activates it and sets the role
                  that decides what you can open, approve and post.
                </p>
              </div>
            </div>
            <dl className="text-xs mt-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3.5 py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Your username</dt>
                <dd className="font-mono font-bold text-brand-600 dark:text-brand-400">{sent.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500 dark:text-slate-400">Sign in with</dt>
                <dd className="font-medium text-slate-700 dark:text-slate-200">Your email or username</dd>
              </div>
            </dl>
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-3">
              Your password is already set — the Admin approving the request never sees it, and
              nobody has to read one out to you.
            </p>
            <Button
              onClick={backToSignIn}
              className="h-auto w-full flex items-center justify-center gap-2 py-3 mt-5 bg-brand-600 hover:bg-brand-700 text-sm font-bold rounded-xl"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </Button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 mt-6"
          >
            {!secure && <InsecureContextWarning what="Requesting an account" />}

            {/* Said before the first field rather than after the submit: what this form does is
                not what a sign-up form normally does, and finding that out afterwards is how
                someone ends up waiting at the sign-in screen wondering why it refuses them. */}
            <div className="flex items-start gap-2.5 rounded-xl border border-brand-200/70 dark:border-brand-900 bg-brand-50/60 dark:bg-brand-900/20 px-3.5 py-3 mb-5">
              <ClipboardCheck className="w-4 h-4 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug text-brand-800 dark:text-brand-300">
                <span className="font-bold">This asks an Admin for access.</span> Your account is
                created straight away but stays inactive, with no permissions, until an Admin
                activates it and sets your role.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="signup-name" className={label}>Full Name</label>
                <div className="relative">
                  <User className={leadIcon} />
                  <input
                    id="signup-name"
                    autoFocus
                    value={form.fullName}
                    onChange={e => set('fullName', e.target.value)}
                    placeholder="e.g. Sokha Chan"
                    autoComplete="name"
                    aria-invalid={!!errors.fullName}
                    className={field}
                  />
                </div>
                {err('fullName')}
              </div>

              <div>
                <label htmlFor="signup-email" className={label}>Work Email</label>
                <div className="relative">
                  <Mail className={leadIcon} />
                  <input
                    id="signup-email"
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="you@acabar.com.kh"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    className={field}
                  />
                </div>
                {err('email') || (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                    This is what you will sign in with.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="signup-role" className={label}>Role You Need</label>
                <div className="relative">
                  <BadgeCheck className={leadIcon} />
                  <select
                    id="signup-role"
                    value={form.requestedRole}
                    onChange={e => set('requestedRole', e.target.value)}
                    aria-invalid={!!errors.requestedRole}
                    className={field}
                  >
                    <option value="">Select a role…</option>
                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {err('requestedRole') || (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                    A note for the Admin — they decide what is granted.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="signup-branch" className={label}>
                  Branch <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <div className="relative">
                  <Building2 className={leadIcon} />
                  <input
                    id="signup-branch"
                    value={form.branch}
                    onChange={e => set('branch', e.target.value)}
                    placeholder="e.g. Phnom Penh HQ"
                    className={field}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="signup-password" className={label}>Password</label>
                <PasswordField
                  id="signup-password"
                  value={form.password}
                  onChange={v => set('password', v)}
                  placeholder="At least 8 characters, with a number"
                  autoComplete="new-password"
                />
                {err('password')}
              </div>

              <div>
                <label htmlFor="signup-confirm" className={label}>Confirm Password</label>
                <PasswordField
                  id="signup-confirm"
                  value={form.confirm}
                  onChange={v => set('confirm', v)}
                  placeholder="Type it again"
                  autoComplete="new-password"
                />
                {err('confirm')}
              </div>

              {errors.form && (
                <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">{errors.form}</p>
              )}

              <Button
                type="submit"
                disabled={busy || !secure}
                className="h-auto w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-700 text-sm font-bold rounded-xl disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Request access'}
                {!busy && <ArrowRight className="w-4 h-4" />}
              </Button>

              {/* The way back, as a control rather than a line of text — the same shape the
                  sign-in screen offers for getting here. Outline: requesting access is this
                  view's one primary action. */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <span className="w-full border-t border-slate-200 dark:border-slate-700" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-2 bg-white dark:bg-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Already have an account
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={backToSignIn}
                className="h-auto w-full flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Button>
            </div>
          </form>
        )}

        <AuthFootnote />
      </div>
    </div>
  )
}
