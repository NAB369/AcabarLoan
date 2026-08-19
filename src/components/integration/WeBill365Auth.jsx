import { useEffect, useState } from 'react'
import {
  ChevronLeft, Eye, EyeOff, Frown, KeyRound, Landmark, MoreVertical, Pencil, Plus, QrCode,
  Trash2, User, UserRound, X,
} from 'lucide-react'
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
  'Sathapana Bank', 'PPCBank', 'Prince Bank', 'Phillip Bank', 'J Trust Royal Bank',
  'Chip Mong Bank',
]

// Bank account numbers are written in groups: 1-120-00024176-5. The grouping is 1-3-8-1 over
// thirteen digits, so it is applied at that length and only then — a number of some other
// length has no grouping this could know, and inventing one would misprint it.
const ACCOUNT_NO_GROUPS = [1, 3, 8, 1]
const ACCOUNT_NO_DIGITS = ACCOUNT_NO_GROUPS.reduce((a, b) => a + b, 0)

export function formatAccountNo(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== ACCOUNT_NO_DIGITS) return digits
  let at = 0
  return ACCOUNT_NO_GROUPS.map(n => digits.slice(at, at += n)).join('-')
}

// Stands in for the account holder a real bank lookup would return, for installs whose
// WeBill365 profile carries no name. Invented, and deliberately the one invented value in
// here — see lookUpAccountHolder, which is where it is used and where it stops being needed.
const STAND_IN_HOLDER = 'Krong Kampuchea'

// An account is usable for KHQR only once WeBill365 trusts it. A code built from an account
// still under review is a payment instruction nobody has confirmed can be paid into, so the
// offer and the standing are both required — offering alone is not enough.
export const usableForKhqr = a => !!a?.useForKhqr && a?.status === 'Trusted'

// A new account is under review until WeBill365 says otherwise; Trusted is theirs to grant.
const ACCOUNT_STATUS_STYLE = {
  Reviewing: 'bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  Trusted: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
}

// Branch and Memo are the bank's own; nothing on this side collects them, so they read '—'
// rather than being made up to fill the column.
const BANK_COLUMNS = [
  {
    id: 'bank',
    label: 'Bank',
    cellCls: 'font-semibold text-slate-700 dark:text-slate-200',
    render: a => (
      <span className="flex items-center gap-1.5">
        <Landmark className="w-3.5 h-3.5 flex-shrink-0" style={{ color: BRAND }} />
        {a.bankName}
      </span>
    ),
  },
  {
    id: 'accountNumber',
    label: 'Account No',
    cellCls: 'font-mono text-slate-600 dark:text-slate-300',
    render: a => (
      <span className="flex items-center gap-2 whitespace-nowrap">
        {formatAccountNo(a.accountNumber)}
        {usableForKhqr(a) && (
          <span
            title="A loan's KHQR can be generated from this account"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 font-sans"
          >
            <QrCode className="w-3 h-3" /> KHQR
          </span>
        )}
      </span>
    ),
  },
  { id: 'accountName', label: 'Account Name', render: a => a.accountName || '—' },
  { id: 'branchName', label: 'Branch Name', render: a => a.branchName || '—' },
  { id: 'currency', label: 'Currency', render: a => a.currency || '—' },
  { id: 'memo', label: 'Memo', render: a => a.memo || '—' },
  {
    id: 'status',
    label: 'Status',
    render: a => (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
        ACCOUNT_STATUS_STYLE[a.status] || ACCOUNT_STATUS_STYLE.Reviewing
      }`}>
        {a.status || 'Reviewing'}
      </span>
    ),
  },
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

export default function WeBill365Auth({ integration, mode, embedded = false, onSignIn, onRegister, onClose, onBankAccountChange, onRemoveBankAccounts, onLinkKhqr, onProfileChange }) {
  // Editing the profile happens in a dialog of its own, against a draft — so Cancel leaves
  // what was there and Save is what writes.
  const [editing, setEditing] = useState(false)
  const [profileDraft, setProfileDraft] = useState({ fullName: '', email: '', phone: '' })
  const [changingPhone, setChangingPhone] = useState(false)
  // Which rows of the bank-account table are picked, by account number, and which one the
  // dialog is editing (null when it is adding).
  const [selected, setSelected] = useState([])
  const [editingNumber, setEditingNumber] = useState(null)
  // The bank account collected payments settle into, set up in a dialog of its own. Held as a
  // draft so a half-typed account never counts as activated, and Confirm waits on Check —
  // an unchecked number is one nobody has established is real.
  const [bankOpen, setBankOpen] = useState(false)
  const [draft, setDraft] = useState({ bankName: BANKS[0], accountNumber: '', currency: 'USD', memo: '' })
  const [checked, setChecked] = useState(false)
  // Whose account the check came back with. It belongs to the check result rather than being
  // read at render, so it clears with the number it was resolved for.
  const [checkedName, setCheckedName] = useState('')
  const [linkDeposits, setLinkDeposits] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [bankError, setBankError] = useState('')
  // Always the login card first, including the very first connect on an install with no
  // account yet. It used to open straight on the sign-up form in that case, on the reasoning
  // that there was nothing to sign in with — but connecting a provider is a sign-in action,
  // and being handed a registration form instead reads as the wrong screen to anyone who
  // already has a WeBill365 account and simply hasn't used it here. Signing in with no
  // account on file says so and points at the Create Account button below it.
  const [view, setView] = useState('login')
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
  // The bank dialog sits on top, so Escape closes that first — closing the card underneath it
  // would take the dialog with it and lose what was typed.
  useEffect(() => {
    if (embedded && !bankOpen && !editing) return undefined
    const handleKey = e => {
      if (e.key !== 'Escape') return
      if (bankOpen) setBankOpen(false)
      else if (editing) setEditing(false)
      else onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [embedded, bankOpen, editing, onClose])

  const profile = integration.login?.profile || {}
  const accounts = integration.bankAccounts || []
  // Accounts a loan's KHQR may be generated from. A schedule picks between them; `account`
  // is only the one it falls back to when it has no pick of its own.
  const khqrOffered = accounts.filter(usableForKhqr)
  const allTickedOffered = selected.length > 0
    && selected.every(n => accounts.find(a => a.accountNumber === n)?.useForKhqr)
  // A ticked account still under review cannot be offered — WeBill365 has not confirmed it.
  const tickedUnderReview = selected
    .map(n => accounts.find(a => a.accountNumber === n))
    .filter(a => a && a.status !== 'Trusted')
  const allSelected = accounts.length > 0 && selected.length === accounts.length

  function openProfileEdit() {
    setProfileDraft({
      fullName: profile.fullName || '',
      email: profile.email || '',
      phone: profile.phone || integration.login?.userId || '',
    })
    setChangingPhone(false)
    setEditing(true)
  }

  // Save writes all three at once, so a half-finished edit never lands. The name is the one
  // that has to be there — it is what the bank account is held in.
  function saveProfile() {
    if (!profileDraft.fullName.trim()) return
    onProfileChange({
      fullName: profileDraft.fullName.trim(),
      email: profileDraft.email.trim(),
      phone: profileDraft.phone.trim(),
    })
    setEditing(false)
  }

  // Blank for Add, filled for Edit. `editingNumber` is what tells Confirm to replace that
  // account rather than put another one on the list.
  function openBankSetup(account = null) {
    setEditingNumber(account?.accountNumber || null)
    setDraft({
      bankName: account?.bankName || BANKS[0],
      accountNumber: account?.accountNumber || '',
      currency: account?.currency || 'USD',
      memo: account?.memo || '',
    })
    // An account already on the list has been through the check once; reopening it shows what
    // it was confirmed with rather than making the operator re-check to see it.
    setChecked(!!account)
    setCheckedName(account?.accountName || '')
    setLinkDeposits(!!account?.linkDeposits)
    setAgreed(!!account)
    setBankError('')
    setBankOpen(true)
  }

  // Who the bank says the account belongs to. In a live integration this is the lookup
  // WeBill365 performs against the bank when Check is pressed — the one call to swap in here,
  // and the only place this name comes from: it is never typed and never the phone number.
  //
  // There is no bank to ask from this install, so it answers with the name the WeBill365
  // account was registered under, and with STAND_IN_HOLDER when the account carries none.
  // That name is invented — it exists so the setup flow can be walked through end to end on
  // an install whose profile has no name on it. Wiring the real lookup means replacing this
  // function body; the stand-in goes with it.
  function lookUpAccountHolder() {
    return (profile.fullName || '').trim() || STAND_IN_HOLDER
  }

  // Check is as far as this can honestly go without that lookup: what it establishes is that
  // the number is one a payment could be routed on. Bank account numbers are grouped with
  // hyphens and spaces (1-120-00024176-5), so those pass and only the digits are counted.
  function checkAccount() {
    const accountNumber = draft.accountNumber.trim()
    const digits = accountNumber.replace(/\D/g, '')
    if (!/^\d[\d\s-]*$/.test(accountNumber) || digits.length < 6 || digits.length > 20) {
      setChecked(false)
      setCheckedName('')
      setAgreed(false)
      return setBankError('A bank account number is 6 to 20 digits — hyphens and spaces are fine')
    }
    setBankError('')
    setCheckedName(lookUpAccountHolder())
    setChecked(true)
  }

  // The holder's name comes back with the check, so an account the check names nobody for
  // cannot be confirmed — there would be nothing to hold it in.
  const bankReady = checked && agreed && !!checkedName

  function confirmBank() {
    if (!bankReady) return
    onBankAccountChange({
      bankName: draft.bankName,
      accountName: checkedName,
      accountNumber: draft.accountNumber.trim(),
      currency: draft.currency,
      memo: draft.memo.trim(),
      linkDeposits,
    }, editingNumber)
    setBankOpen(false)
    setSelected([])
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
                <button
                  type="button"
                  onClick={openProfileEdit}
                  className="px-3.5 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: BRAND }}
                >
                  Edit Profile
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 sm:items-stretch">
                {/* Stretches beside both field rows rather than sitting square against the
                    first, so the block reads as one panel. */}
                <div className="relative w-28 sm:w-24 h-28 sm:h-auto sm:min-h-[7rem] rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <UserRound className="w-14 h-14 text-emerald-800/70 dark:text-emerald-400/70" strokeWidth={1.25} />
                  <button
                    type="button"
                    onClick={openProfileEdit}
                    aria-label="Profile options"
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-slate-800/90 shadow-sm flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 min-w-0">
                  <div className="sm:col-span-2">
                    <Label required>Full Name</Label>
                    <p className={readOnlyField}>{profile.fullName || '—'}</p>
                  </div>
                  <div>
                    {/* The phone number is the account this install signs in as, so it is not
                        editable here — changing it would be signing in as someone else. */}
                    <Label required>Phone Number</Label>
                    <p className={readOnlyField}>{profile.phone || integration.login?.userId || '—'}</p>
                  </div>
                  <div>
                    <Label>Email Address</Label>
                    <p className={readOnlyField}>{profile.email || '—'}</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="border-t border-slate-100 dark:border-slate-700" />

            <section>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Bank Account</h3>
                {accounts.length > 0 && (
                  <div className="flex items-center gap-2">
                    {/* Only offered when rows are picked — buttons sitting there with nothing
                        selected can only disappoint. Edit takes one account at a time: there
                        is one form behind it, and it can only be filled with one. */}
                    {selected.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { onRemoveBankAccounts(selected); setSelected([]) }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                    {/* More than one account can be offered — a dollar one and a riel one,
                        say — and the schedule picks between them when it generates. Pressing
                        it on accounts already offered withdraws them. */}
                    {selected.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { onLinkKhqr(selected); setSelected([]) }}
                        // Refused, not hidden, while a ticked account is under review — a
                        // button that vanished would leave the operator guessing why.
                        disabled={!allTickedOffered && tickedUnderReview.length > 0}
                        title={!allTickedOffered && tickedUnderReview.length > 0
                          ? `${tickedUnderReview.length === 1 ? 'That account is' : 'Those accounts are'} still under review — a KHQR can only be generated from a Trusted account`
                          : undefined}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                          !allTickedOffered && tickedUnderReview.length > 0
                            ? 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                            : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        {allTickedOffered ? 'Stop using for KHQR' : 'Use for KHQR'}
                      </button>
                    )}
                    {selected.length === 1 && (
                      <button
                        type="button"
                        onClick={() => openBankSetup(accounts.find(a => a.accountNumber === selected[0]))}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openBankSetup()}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white hover:opacity-90 transition-opacity"
                      style={{ backgroundColor: BRAND }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                )}
              </div>

              {accounts.length > 0 ? (
                /* One row per account. A newly added one is Reviewing until WeBill365 says
                   otherwise — nothing on this side can grant it any other standing. */
                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-700">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-700/50">
                        <th className="w-10 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = selected.length > 0 && !allSelected }}
                            onChange={() => setSelected(allSelected ? [] : accounts.map(a => a.accountNumber))}
                            aria-label="Select every bank account"
                            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40"
                          />
                        </th>
                        {BANK_COLUMNS.map(c => (
                          <th key={c.id} className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {accounts.map(a => (
                        // A picked row is tinted, so what Delete and Edit are about to act on
                        // is readable without tracing back to the checkbox.
                        <tr
                          key={a.accountNumber}
                          className={`transition-colors ${
                            selected.includes(a.accountNumber)
                              ? 'bg-blue-50/70 dark:bg-blue-900/20'
                              : 'hover:bg-slate-50 dark:hover:bg-white/5'
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selected.includes(a.accountNumber)}
                              onChange={() => setSelected(s => s.includes(a.accountNumber)
                                ? s.filter(x => x !== a.accountNumber)
                                : [...s, a.accountNumber])}
                              aria-label={`Select ${a.accountNumber}`}
                              className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40"
                            />
                          </td>
                          {BANK_COLUMNS.map(c => (
                            <td key={c.id} className={`px-3 py-2.5 text-xs whitespace-nowrap ${c.cellCls || 'text-slate-600 dark:text-slate-300'}`}>
                              {c.render(a)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                null
              )}

              {/* Which account a borrower's KHQR resolves to, stated rather than left to be
                  inferred from a chip in the table. Unlinked is worth saying out loud: the
                  code cannot be generated at all until an account is linked. */}
              {accounts.length > 0 && (
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed mt-3 text-slate-500 dark:text-slate-400">
                  <QrCode className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                  {khqrOffered.length ? (
                    <span>
                      A loan’s KHQR can be generated from{' '}
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {khqrOffered.map(a => `${a.bankName} · ${formatAccountNo(a.accountNumber)} (${a.currency || '—'})`).join(', ')}
                      </span>
                      {khqrOffered.length > 1
                        ? ' — the repayment schedule picks which one when it generates.'
                        : '. Offer another account to choose between them on a schedule.'}
                    </span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      No account is offered for KHQR, so a loan’s payment code cannot be generated.
                      {accounts.some(a => a.status === 'Trusted')
                        ? ' Tick a Trusted account and press Use for KHQR.'
                        : ' Every account here is still under review — WeBill365 has to trust one before a code can be built from it.'}
                    </span>
                  )}
                </p>
              )}

              {accounts.length === 0 && (
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
                    onClick={() => openBankSetup()}
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
        <form onSubmit={submitSignUp} className={`${shell} max-w-sm`} onClick={e => e.stopPropagation()}>
          {/* max-w-sm, wider than the sign-in card: this one carries a dialling code, a
              number and Send OTP on one row, which will not fit the sign-in card's width. */}
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
              {/* The dialling code is boxed at a fixed width rather than given one directly:
                  `field` carries w-full, which beats a w-24 sitting beside it in the same
                  class list and blew this row out past the card. Wraps instead of overflowing
                  once the card is too narrow to hold all three. */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-[5.5rem] flex-shrink-0">
                  <select
                    value={form.dialCode}
                    onChange={e => set('dialCode', e.target.value)}
                    aria-label="Country dialling code"
                    className={`${field} px-2`}
                  >
                    {DIAL_CODES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <input
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="Enter phone number"
                  autoComplete="tel"
                  className={`${field} flex-1 min-w-[7rem]`}
                />
                <button
                  type="button"
                  onClick={sendOtp}
                  className="text-xs font-semibold whitespace-nowrap flex-shrink-0 ml-auto hover:opacity-70"
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

  // Sits above whichever surface the account card is on — the provider panel when embedded,
  // the connect popup when not — so it is its own overlay rather than part of the card.
  const profileDialog = editing && (
    <div
      className="fixed inset-0 !mt-0 bg-black/60 z-[60] flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => setEditing(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Edit Profile"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Edit Profile</h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm font-semibold hover:opacity-70"
              style={{ color: BRAND }}
            >
              Cancel
            </button>
            {/* Held until there is a name to save — it is what the bank account is held in. */}
            <button
              type="button"
              onClick={saveProfile}
              disabled={!profileDraft.fullName.trim()}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-opacity ${
                profileDraft.fullName.trim()
                  ? 'text-white hover:opacity-90'
                  : 'text-slate-400 bg-slate-100 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
              }`}
              style={profileDraft.fullName.trim() ? { backgroundColor: BRAND } : undefined}
            >
              Save
            </button>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <Label required>Full Name</Label>
            <input
              autoFocus
              value={profileDraft.fullName}
              onChange={e => setProfileDraft(d => ({ ...d, fullName: e.target.value }))}
              placeholder="Enter your full name"
              autoComplete="name"
              className={field}
            />
          </div>
          <div>
            <Label>Email</Label>
            <input
              type="email"
              value={profileDraft.email}
              onChange={e => setProfileDraft(d => ({ ...d, email: e.target.value }))}
              placeholder="Enter your email"
              autoComplete="email"
              className={field}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700" />

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Label required>Mobile Number</Label>
            {changingPhone ? (
              <input
                autoFocus
                value={profileDraft.phone}
                onChange={e => setProfileDraft(d => ({ ...d, phone: e.target.value }))}
                placeholder="e.g. +855 93-333-333"
                autoComplete="tel"
                className={field}
              />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">{profileDraft.phone || '—'}</p>
            )}
          </div>
          {!changingPhone && (
            <button
              type="button"
              onClick={() => setChangingPhone(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              Change
            </button>
          )}
        </div>

        <div className="border-t border-slate-100 dark:border-slate-700" />

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Label required>Password</Label>
            {/* No password is kept on this install — it is checked at sign-in and dropped, so
                there is no age to report and nothing here to change. Said plainly rather than
                printing a "last updated" this app cannot know. */}
            <p className="text-sm text-slate-500 dark:text-slate-400">Held by {integration.name}</p>
          </div>
          <button
            type="button"
            disabled
            title={`Passwords are changed at ${integration.name}; this install never stores one`}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed flex-shrink-0"
          >
            Change
          </button>
        </div>
      </div>
    </div>
  )

  // Editing an account already on the list is its own form: everything on one row, with the
  // remark editable and the name and currency the check settled read back beside it.
  const updateDialog = bankOpen && editingNumber && (
    <div
      className="fixed inset-0 !mt-0 bg-black/60 z-[60] flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => setBankOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Update Bank Account"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Update Bank Account</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Please input your bank account information</p>
          </div>
          <button
            type="button"
            onClick={() => setBankOpen(false)}
            aria-label="Close"
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-slate-100 dark:border-slate-700 pt-5">
          <div className="w-44 flex-shrink-0">
            <Label>Select Bank</Label>
            <p className={readOnlyField}>{draft.bankName}</p>
          </div>

          {/* The account itself is what WeBill365 reviewed and the bank confirmed — it is
              read back here, not re-opened for editing. Changing which account payments
              settle into is adding one, which is what Add is for. Only the remark, this
              install's own note against it, can be changed. */}
          <div className="flex-1 min-w-[12rem]">
            <Label>Account Number</Label>
            <p className={`${readOnlyField} font-mono`}>{draft.accountNumber || '—'}</p>
          </div>
          <div className="w-44 flex-shrink-0">
            <Label>Account Name</Label>
            <p className={readOnlyField}>{checkedName || '—'}</p>
          </div>
          <div className="w-24 flex-shrink-0">
            <Label>Currency</Label>
            <p className={readOnlyField}>{draft.currency || '—'}</p>
          </div>
          <div className="w-32 flex-shrink-0">
            <Label>Remarks</Label>
            <input
              autoFocus
              value={draft.memo}
              onChange={e => setDraft(d => ({ ...d, memo: e.target.value }))}
              placeholder="e.g. VIP"
              className={field}
            />
          </div>
        </div>

        <ErrorNote>{bankError}</ErrorNote>

        <label className="flex items-start justify-center gap-2.5 cursor-pointer mt-10">
          <input
            type="checkbox"
            checked={agreed}
            onChange={() => setAgreed(v => !v)}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40 flex-shrink-0"
          />
          <span className="text-xs text-slate-600 dark:text-slate-300 text-center">
            I accept that above Account Number + Name + Currency is right information
            <span className="block font-semibold mt-0.5" style={{ color: BRAND }}>
              in case of losing , WeBill Service not responsible
            </span>
          </span>
        </label>

        <div className="flex justify-center mt-8">
          <button
            type="button"
            onClick={confirmBank}
            disabled={!bankReady}
            className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-opacity ${
              bankReady ? 'text-white hover:opacity-90' : 'text-slate-400 bg-slate-100 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
            }`}
            style={bankReady ? { backgroundColor: BRAND } : undefined}
          >
            Update
          </button>
        </div>
      </div>
    </div>
  )

  const bankDialog = bankOpen && !editingNumber && (
    <div
      className="fixed inset-0 !mt-0 bg-black/60 z-[60] flex items-center justify-center p-4 overflow-y-auto"
      onClick={() => setBankOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Set up a bank account"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-5 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Set up a bank account</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Collect bill payments with your bank account</p>

        <div className="mt-5 space-y-4">
          <div>
            <Label>Bank</Label>
            <select
              value={draft.bankName}
              onChange={e => {
                setDraft(d => ({ ...d, bankName: e.target.value }))
                setChecked(false)
                setCheckedName('')
                setAgreed(false)
              }}
              className={field}
            >
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <Label required>Bank Account No.</Label>
            <div className="flex items-center gap-2">
              <input
                value={draft.accountNumber}
                // A number that changes after being checked is unchecked again, and the
                // agreement goes with it: "confirm account info" cannot stay ticked for
                // account info that has since changed and nobody has looked at.
                onChange={e => {
                  setDraft(d => ({ ...d, accountNumber: formatAccountNo(e.target.value) }))
                  setChecked(false)
                  setCheckedName('')
                  setAgreed(false)
                  setBankError('')
                }}
                placeholder="Enter Bank Account No."
                inputMode="numeric"
                className={`${field} flex-1 min-w-0 font-mono`}
              />
              {/* Spent once the number checks out — pressing it again would only re-check
                  what is already on screen below. Editing the number brings it back. */}
              <button
                type="button"
                onClick={checkAccount}
                disabled={checked}
                className={`px-3 py-2.5 rounded-lg text-xs font-bold border transition-colors flex-shrink-0 ${
                  checked
                    ? 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                Check
              </button>
            </div>
            <ErrorNote>{bankError}</ErrorNote>
          </div>

          {/* What the check came back with. Only shown once it has — there is nothing to
              confirm before then. */}
          {checked && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Account Info</h4>
              <div>
                {/* Always read-only: the account is held in the name this install is
                    registered under, so that profile is the one source of it. Typing a
                    different name here would let the bank account and the account it belongs
                    to disagree, with nothing to say which was right. */}
                <Label>Bank Account Name</Label>
                <p className={readOnlyField}>{checkedName || '—'}</p>
                {!checkedName && (
                  <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400 mt-1.5">
                    The check returned no name for this account. Close this, set your Full Name
                    under Profile, and check the number again.
                  </p>
                )}
              </div>
              <div>
                {/* A select, not a resolved value: this app runs on both dollars and riel,
                    and nothing here can ask the bank which one the account is held in. */}
                <Label>Currency</Label>
                <select
                  value={draft.currency}
                  onChange={e => setDraft(d => ({ ...d, currency: e.target.value }))}
                  className={field}
                >
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </select>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkDeposits}
                  onChange={() => setLinkDeposits(v => !v)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40 flex-shrink-0"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">Link all deposit transactions</span>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={() => setAgreed(v => !v)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/40 flex-shrink-0"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  Confirm account info and agree to the{' '}
                  {/* Emphasised rather than linked: WeBill365's terms are not something this
                      install holds a URL for, and a link to nowhere is worse than none. */}
                  <span className="font-semibold" style={{ color: BRAND }}>Term of Use</span>
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-4 mt-6">
          <button
            type="button"
            onClick={() => setBankOpen(false)}
            className="text-sm font-semibold hover:opacity-70"
            style={{ color: BRAND }}
          >
            Close
          </button>
          {/* Confirm waits on the check AND on the agreement: an unchecked number is one
              nobody has established a payment could be routed on, and the tick is the
              confirmation the button's name refers to. */}
          <button
            type="button"
            onClick={confirmBank}
            disabled={!bankReady}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-opacity ${
              bankReady ? 'text-white hover:opacity-90' : 'text-slate-400 bg-slate-100 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
            }`}
            style={bankReady ? { backgroundColor: BRAND } : undefined}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )

  if (embedded) return <>{body}{bankDialog}{updateDialog}{profileDialog}</>

  return (
    <>
      <div
        className="fixed inset-0 !mt-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'account' ? 'WeBill365 Account' : 'Sign in to WeBill365'}
      >
        {body}
      </div>
      {bankDialog}{updateDialog}{profileDialog}
    </>
  )
}
