import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft, Plug, Unlink, RefreshCw, Plus, MoreVertical, Info, Trash2, X,
  UserCircle2, LogOut,
  Eye, EyeOff, KeyRound, Globe, ShieldCheck, Settings2, History,
  ArrowDownLeft, ArrowUpRight, CheckCircle2, AlertTriangle, XCircle, Save,
  QrCode, Upload,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { formatDateDisplay, splitTimestamp } from '../../utils/format'
import { buildKhqrPayload, renderKhqrImage } from '../../utils/khqr'
import ProviderLogo from './ProviderLogo'
import { INTEGRATION_CATALOGUE, buildIntegration } from './catalogue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

// Per-provider presentation. The data itself (credentials, scopes, logs) lives in app state
// and the wordmark in ProviderLogo — this is only the accent each card is drawn in, taken
// from the provider's own brand colour so the strip agrees with its logo.
const PROVIDER_STYLE = {
  webill365: {
    bar: 'bg-[#1B2BEF]',
    hover: 'hover:border-[#1B2BEF]/40 dark:hover:border-[#1B2BEF]/60',
    tile: 'bg-[#1B2BEF]/10 dark:bg-[#1B2BEF]/25',
  },
  weums: {
    bar: 'bg-[#1B2BEF]',
    hover: 'hover:border-[#1B2BEF]/40 dark:hover:border-[#1B2BEF]/60',
    tile: 'bg-slate-100 dark:bg-slate-700/60',
  },
  weinvoice365: {
    bar: 'bg-[#0B5D3B]',
    hover: 'hover:border-emerald-300 dark:hover:border-emerald-800',
    tile: 'bg-emerald-50 dark:bg-emerald-900/25',
  },
  bakong: {
    bar: 'bg-[#003A70]',
    hover: 'hover:border-sky-300 dark:hover:border-sky-800',
    tile: 'bg-sky-50 dark:bg-sky-900/25',
  },
  cbc: {
    bar: 'bg-[#0B4F9E]',
    hover: 'hover:border-blue-300 dark:hover:border-blue-800',
    tile: 'bg-blue-50 dark:bg-blue-900/25',
  },
  telegram: {
    bar: 'bg-[#229ED9]',
    hover: 'hover:border-[#229ED9]/40 dark:hover:border-[#229ED9]/60',
    tile: 'bg-[#229ED9]/10 dark:bg-[#229ED9]/25',
  },
}

const FALLBACK_STYLE = {
  bar: 'bg-slate-500',
  hover: 'hover:border-slate-300 dark:hover:border-slate-600',
  tile: 'bg-slate-100 dark:bg-slate-700/60',
}

const styleFor = id => PROVIDER_STYLE[id] || FALLBACK_STYLE

const TABS = [
  { id: 'connection', label: 'Connection',  icon: Plug },
  { id: 'sync',       label: 'Data Sync',   icon: Settings2 },
  { id: 'activity',   label: 'Activity Log', icon: History },
]

// Auto-sync cadences, in minutes — the log stamps are minute-resolution, so anything
// finer than a quarter of an hour would not be tellable apart in the history.
const SYNC_INTERVALS = [
  { value: 15,   label: 'Every 15 minutes' },
  { value: 30,   label: 'Every 30 minutes' },
  { value: 60,   label: 'Hourly' },
  { value: 360,  label: 'Every 6 hours' },
  { value: 1440, label: 'Daily' },
]

const STATUS_STYLE = {
  connected:    { label: 'Connected',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800' },
  disconnected: { label: 'Not connected', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600' },
  error:        { label: 'Error',         cls: 'bg-rose-50 text-rose-700 border-rose-200/60 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800' },
}

const LOG_STATUS_STYLE = {
  Success: { icon: CheckCircle2,   cls: 'text-emerald-600 dark:text-emerald-400' },
  Warning: { icon: AlertTriangle,  cls: 'text-amber-600 dark:text-amber-400' },
  Failed:  { icon: XCircle,        cls: 'text-rose-600 dark:text-rose-400' },
}

// Log stamps are written in the same 'YYYY-MM-DD HH:MM:SS' shape the seeded history uses,
// in local time — an ISO string would print the log in UTC and read as the wrong hour.
function nowStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Log stamps are stored as 'YYYY-MM-DD HH:MM:SS'; the landing rows read better with the
// date spelled out and the seconds dropped.
function lastSyncLabel(stamp) {
  if (!stamp) return 'Never synced'
  const { date, time } = splitTimestamp(stamp)
  return `Last sync: ${formatDateDisplay(date) || date} ${time.slice(0, 5)}`
}

function intervalLabel(minutes) {
  return SYNC_INTERVALS.find(i => i.value === Number(minutes))?.label || `Every ${minutes} minutes`
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.disconnected
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-500' : status === 'error' ? 'bg-rose-500' : 'bg-slate-400'}`} />
      {s.label}
    </span>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className="h-6 w-11 data-[state=unchecked]:bg-slate-200 dark:data-[state=unchecked]:bg-slate-600 [&>span]:h-5 [&>span]:w-5 [&>span]:data-[state=checked]:translate-x-5"
    />
  )
}

// Row of the per-provider kebab menu on the landing page
const MenuItem = ({ icon: Icon, danger, onClick, children }) => (
  <DropdownMenuItem
    onSelect={onClick}
    className={`gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
      danger
        ? 'text-rose-600 dark:text-rose-400 focus:bg-rose-50 dark:focus:bg-rose-900/20 focus:text-rose-600 dark:focus:text-rose-400'
        : 'text-slate-600 dark:text-slate-300 focus:bg-slate-50 dark:focus:bg-white/5 focus:text-slate-600 dark:focus:text-slate-300'
    }`}
  >
    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
    {children}
  </DropdownMenuItem>
)

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</label>
    {children}
    {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
  </div>
)

const inputClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

// ── Sign in / register ──────────────────────────────────────────────────────
// Configure opens here until the install has signed in to the provider. A provider this
// install has no account with starts on the register form instead of the sign-in one.
//
// Only the user ID is ever stored. The password is held in this form's own state, checked,
// and dropped — persisting it would put a provider password in localStorage in the clear.
// That also means sign-in cannot re-check the password after a reload: a registered ID with
// any non-empty password is accepted, which is as far as a mock connection can honestly go.
function AuthPanel({ integration, onRegister, onSignIn }) {
  const registered = !!integration.login?.registered
  const [mode, setMode] = useState(registered ? 'signin' : 'register')
  const [form, setForm] = useState({
    userId: registered ? integration.login.userId : '',
    password: '',
    confirm: '',
  })
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }
  const isRegister = mode === 'register'
  // Most providers log in with an arbitrary "ID"; WeBill365 keys accounts by phone
  // number instead (see loginLabel in INITIAL_INTEGRATIONS) — this form asks for
  // whichever one the provider actually uses.
  const idLabel = integration.loginLabel || 'ID'
  const idPlaceholder = integration.loginPlaceholder || 'e.g. acabar.admin'
  const idAutoComplete = integration.loginAutoComplete || 'username'

  function submit(e) {
    e.preventDefault()
    const userId = form.userId.trim()
    if (!userId) return setError(`Enter your ${idLabel}`)

    if (isRegister) {
      if (userId.length < 3) return setError(`The ${idLabel} needs at least 3 characters`)
      if (form.password.length < 6) return setError('The password needs at least 6 characters')
      if (form.password !== form.confirm) return setError('The two passwords do not match')
      onRegister(userId)
      return
    }
    if (!form.password) return setError('Enter your password')
    if (userId.toLowerCase() !== (integration.login?.userId || '').toLowerCase()) {
      return setError(`No account with that ${idLabel} is registered for ${integration.name} on this install`)
    }
    onSignIn(userId)
  }

  return (
    <div className="max-w-md mx-auto w-full">
      <form
        onSubmit={submit}
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-5 sm:p-6"
      >
        <div className="text-center mb-5">
          <ProviderLogo id={integration.id} name={integration.name} size="md" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-3">
            {isRegister ? `Register with ${integration.name}` : `Sign in to ${integration.name}`}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRegister
              ? 'Create the account this install will use to exchange data.'
              : 'Sign in with the account this install is registered as.'}
          </p>
        </div>

        <div className="space-y-3">
          <Field label={idLabel}>
            <Input
              autoFocus
              value={form.userId}
              onChange={e => set('userId', e.target.value)}
              placeholder={idPlaceholder}
              autoComplete={idAutoComplete}
              className={`${inputClass} font-mono`}
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={isRegister ? 'At least 6 characters' : 'Your provider password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                className={`${inputClass} pl-9 pr-10`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPw(s => !s)}
                title={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-auto w-auto p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-transparent"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </Field>

          {isRegister && (
            <Field label="Confirm Password">
              <Input
                type={showPw ? 'text' : 'password'}
                value={form.confirm}
                onChange={e => set('confirm', e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="h-auto w-full bg-brand-600 hover:bg-brand-700 py-2.5 rounded-xl text-sm font-bold"
          >
            {isRegister ? 'Register & Continue' : 'Sign In'}
          </Button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isRegister ? `Already have a ${idLabel} and password?` : `No ${idLabel} and password yet?`}{' '}
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setMode(isRegister ? 'signin' : 'register'); setError(''); setForm(f => ({ ...f, password: '', confirm: '' })) }}
              className="h-auto w-auto p-0 font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 hover:underline hover:bg-transparent"
            >
              {isRegister ? 'Sign in instead' : 'Register'}
            </Button>
          </p>
        </div>
      </form>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-3">
        Your {idLabel} is saved with this install; the password is not stored.
      </p>
    </div>
  )
}

// ── Connection tab ──────────────────────────────────────────────────────────
// Edits are held here and written back on Save, so a half-typed key never counts as the
// stored credential — and so Cancel can put the form back to what is actually connected.
// Mounted keyed by provider id, which is what resets the draft when the provider changes.
function ConnectionPanel({ integration, onSave, onTest, onDisconnect }) {
  const [form, setForm] = useState({
    environment: integration.environment,
    baseUrl: integration.baseUrl,
    account: integration.account,
    apiKey: integration.apiKey,
  })
  const [showKey, setShowKey] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const dirty = ['environment', 'baseUrl', 'account', 'apiKey'].some(k => form[k] !== integration[k])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">API Credentials</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Issued by {integration.name} for this company
            </p>
          </div>
          <StatusBadge status={integration.status} />
        </div>

        <form
          onSubmit={e => { e.preventDefault(); onSave(form) }}
          className="p-4 sm:p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Environment" hint="Sandbox never moves real money or real customer data.">
              <select value={form.environment} onChange={e => set('environment', e.target.value)} className={inputClass}>
                <option value="sandbox">Sandbox</option>
                <option value="production">Production</option>
              </select>
            </Field>
            <Field label={integration.accountLabel}>
              <Input
                value={form.account}
                onChange={e => set('account', e.target.value)}
                placeholder="e.g. ACABAR-MCH-0042"
                className={`${inputClass} font-mono`}
              />
            </Field>
          </div>

          <Field label="API Base URL">
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                value={form.baseUrl}
                onChange={e => set('baseUrl', e.target.value)}
                placeholder="https://"
                className={`${inputClass} pl-9 font-mono`}
              />
            </div>
          </Field>

          <Field label="API Key / Secret" hint="Stored with this install only — it is never shown in reports or exports.">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={e => set('apiKey', e.target.value)}
                placeholder="Paste the key issued by the provider"
                autoComplete="off"
                className={`${inputClass} pl-9 pr-10 font-mono`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowKey(s => !s)}
                title={showKey ? 'Hide key' : 'Show key'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-auto w-auto p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-transparent"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </Field>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={!dirty}
              className="h-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold"
            >
              <Save className="w-4 h-4" />
              Save &amp; Connect
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onTest(form)}
              className="h-auto flex items-center gap-2 px-5 py-2.5 rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-bold"
            >
              <ShieldCheck className="w-4 h-4" />
              Test Connection
            </Button>
            {integration.status === 'connected' && (
              <Button
                type="button"
                variant="outline"
                onClick={onDisconnect}
                className="h-auto flex items-center gap-2 px-5 py-2.5 rounded-xl border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-sm font-bold"
              >
                <Unlink className="w-4 h-4" />
                Disconnect
              </Button>
            )}
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setForm({
                  environment: integration.environment,
                  baseUrl: integration.baseUrl,
                  account: integration.account,
                  apiKey: integration.apiKey,
                })}
                className="h-auto w-auto p-0 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-transparent"
              >
                Discard changes
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* What this connection is and what it exchanges — the reference half of the tab, so
          the form beside it needs no explanatory text of its own. */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-4 sm:p-6 space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Provider</p>
          <ProviderLogo id={integration.id} name={integration.name} size="sm" />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-snug">{integration.tagline}</p>
        </div>
        <div className="border-t border-slate-100 dark:border-slate-700 pt-4 space-y-3">
          {[
            { label: 'Category', value: integration.category },
            { label: 'Environment', value: integration.environment === 'production' ? 'Production' : 'Sandbox' },
            { label: 'Auto sync', value: integration.autoSync ? intervalLabel(integration.syncEvery) : 'Off — manual only' },
            { label: 'Last sync', value: integration.lastSyncAt || 'Never' },
            { label: 'Active scopes', value: `${integration.scopes.filter(s => s.enabled).length} of ${integration.scopes.length}` },
          ].map(row => (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{row.label}</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-right">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── KHQR (Connection tab, WeBill365 only) ───────────────────────────────────
// Two ways in, because a back office should never be blocked from putting a payment code on
// its own paperwork by the state of a third-party connection:
//   • Connected — generate the code from the merchant account WeBill365 signs in as.
//   • Any time — upload the KHQR image the bank or Bakong issued, connection or not.
// Whichever produced the current code, the switch is what puts it on the repayment schedule;
// turning it off leaves the image in place so it can be switched back on without redoing it.
//
// An uploaded image is downscaled on the way in for the same reason the company logo is (it
// rides in localStorage with the rest of the state), but to 512px rather than 256 — a dense
// KHQR starts losing modules, and with them scannability, at the logo's size.
const KHQR_MAX_PX = 512

function KhqrPanel({ integration, dispatch, showToast, companyName }) {
  const fileInputRef = useRef(null)
  const [generating, setGenerating] = useState(false)
  const connected = integration.status === 'connected'
  const hasImage = !!integration.khqrImage
  const currency = integration.khqrCurrency || 'USD'

  const update = updates => dispatch({ type: 'UPDATE_INTEGRATION', id: integration.id, updates })

  // "Retrieving" is generating locally from the merchant account — the connection is a mock
  // with no endpoint to ask (see INITIAL_INTEGRATIONS), so the payload is built here in the
  // EMVCo shape Bakong reads rather than fetched. See utils/khqr.js on what that does and
  // does not guarantee.
  async function handleGenerate() {
    const account = (integration.account || '').trim()
    if (!account) {
      showToast(`Set the ${integration.accountLabel} above and save before generating a KHQR`, 'error')
      return
    }
    setGenerating(true)
    try {
      const payload = buildKhqrPayload({ account, merchantName: companyName, currency })
      const image = await renderKhqrImage(payload)
      update({ khqrImage: image, khqrEnabled: true, khqrSource: 'webill365' })
      showToast(`KHQR generated for ${account} — scan it once to confirm it resolves`, 'success')
    } catch {
      showToast('That KHQR could not be generated', 'error')
    } finally {
      setGenerating(false)
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // so picking the same file twice still fires onChange
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Choose an image file', 'error')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => showToast('That image could not be read', 'error')
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => showToast('That image could not be read', 'error')
      img.onload = () => {
        const scale = Math.min(1, KHQR_MAX_PX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        // Flattened onto white first — a QR saved with a transparent background loses its
        // quiet zone against a dark sheet, and a scanner needs that margin to lock on.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        // Switched on by the upload — someone who has just supplied the code wants it shown,
        // and leaving it off would read as the upload having failed.
        update({ khqrImage: canvas.toDataURL('image/png'), khqrEnabled: true, khqrSource: 'uploaded' })
        showToast('KHQR image uploaded — it will appear on the repayment schedule', 'success')
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  function handleRemove() {
    update({ khqrImage: '', khqrEnabled: false, khqrSource: '' })
    showToast('KHQR image removed', 'info')
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">KHQR on Repayment Schedule</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {integration.khqrEnabled
              ? hasImage
                ? 'Shown on the repayment schedule preview and on the printed copy.'
                : 'Switched on, but there is no code yet — nothing will be shown.'
              : 'Off — the repayment schedule carries no payment code.'}
          </p>
        </div>
        <Toggle
          checked={!!integration.khqrEnabled}
          onChange={() => {
            if (!integration.khqrEnabled && !hasImage) {
              showToast('Generate or upload a KHQR first', 'error')
              return
            }
            update({ khqrEnabled: !integration.khqrEnabled })
          }}
          label="Show KHQR on repayment schedule"
        />
      </div>

      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-32 h-32 rounded-xl border border-slate-200 dark:border-slate-600 bg-white flex items-center justify-center overflow-hidden">
              {hasImage
                ? <img src={integration.khqrImage} alt="KHQR payment code" className="w-full h-full object-contain" />
                : <QrCode className="w-8 h-8 text-slate-300 dark:text-slate-500" aria-hidden="true" />}
            </div>
            {hasImage && (
              <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-1.5">
                {integration.khqrSource === 'webill365' ? `From ${integration.name}` : 'Uploaded'}
              </p>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {/* Generate — only meaningful once the connection has a merchant account to key
                the code on. Kept above upload because it is the path that needs no file. */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!connected || generating}
                  className="h-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {generating ? 'Generating…' : `Generate from ${integration.name}`}
                </Button>
                <select
                  value={currency}
                  onChange={e => update({ khqrCurrency: e.target.value })}
                  aria-label="KHQR currency"
                  className={`${inputClass} w-auto text-xs py-2`}
                >
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </select>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                {connected
                  ? `Built from the ${integration.accountLabel} on this connection. Scan the result once to confirm it resolves before issuing schedules.`
                  : `${integration.name} is not connected — connect it to generate, or upload the code below.`}
              </p>
            </div>

            {/* Upload — deliberately never gated on the connection. A KHQR issued by the bank
                or Bakong direct is just as valid, and paperwork should not wait on a
                third-party integration being reachable. */}
            <div className="border-t border-slate-100 dark:border-slate-700 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-auto flex items-center gap-2 px-4 py-2 rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {hasImage ? 'Replace with an image' : 'Upload KHQR image'}
                </Button>
                {hasImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleRemove}
                    className="h-auto flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                Upload the KHQR your bank or Bakong issued. Available whether or not {integration.name} is
                connected, and it replaces whatever code is held now.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Data Sync tab ───────────────────────────────────────────────────────────
function SyncPanel({ integration, onToggleScope, onSetAutoSync, onSetInterval, onSyncNow }) {
  const enabledCount = integration.scopes.filter(s => s.enabled).length
  const connected = integration.status === 'connected'

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Automatic Sync</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {integration.autoSync
                ? `Runs ${intervalLabel(integration.syncEvery).toLowerCase()} for every scope switched on below.`
                : 'Off — nothing is exchanged until a sync is run by hand.'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <select
              value={integration.syncEvery}
              onChange={e => onSetInterval(Number(e.target.value))}
              disabled={!integration.autoSync}
              className={`${inputClass} w-auto disabled:opacity-50`}
            >
              {SYNC_INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
            <Toggle checked={integration.autoSync} onChange={onSetAutoSync} label="Automatic sync" />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Sync Scopes</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {enabledCount} of {integration.scopes.length} switched on — a scope that is off is never sent or read.
            </p>
          </div>
          <Button
            onClick={onSyncNow}
            className="h-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-xs font-bold flex-shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Now
          </Button>
        </div>

        {/* A disconnected provider still shows its scopes so they can be set up before the
            key arrives — the banner is what says nothing will move yet. */}
        {!connected && (
          <div className="px-4 sm:px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/40 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {integration.name} is not connected. These scopes are saved but nothing is exchanged until the
              connection is established on the Connection tab.
            </p>
          </div>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {integration.scopes.map(scope => (
            <div key={scope.id} className="px-4 sm:px-6 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{scope.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{scope.desc}</p>
              </div>
              <Toggle checked={scope.enabled} onChange={() => onToggleScope(scope.id)} label={scope.label} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Activity Log tab ────────────────────────────────────────────────────────
function ActivityPanel({ integration }) {
  const logs = integration.logs || []
  // The count column is named for what this provider actually exchanges.
  const countHeader = integration.unit === 'message' ? 'Messages' : 'Records'

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Exchange History</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Newest first — the last 50 exchanges with {integration.name}.
        </p>
      </div>
      {/* `min-w` is what makes the horizontal scroll real — a plain `w-full` table
          compresses to the container instead of overflowing it. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr>
              {['Date & Time', 'Event', 'Direction', countHeader, 'Status', 'Detail'].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 first:rounded-tl-xl last:rounded-tr-xl ${i === 3 ? 'text-right' : 'text-left'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                  Nothing exchanged yet.
                </td>
              </tr>
            ) : logs.map((log, i) => {
              const s = LOG_STATUS_STYLE[log.status] || LOG_STATUS_STYLE.Success
              const inbound = log.direction === 'Inbound'
              return (
                <tr key={`${log.at}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{log.at}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{log.event}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${
                      inbound ? 'text-sky-600 dark:text-sky-400' : 'text-violet-600 dark:text-violet-400'
                    }`}>
                      {inbound ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                      {log.direction}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 text-right">{log.records}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap ${s.cls}`}>
                      <s.icon className="w-3.5 h-3.5" />
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{log.detail}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Lives inside System Settings (`embedded`), where the modal already supplies the padding
// and the panel heading is one step smaller than a page title. The prop is the only
// difference between the two presentations — the provider views themselves are identical.
export default function IntegrationPage({ embedded = false }) {
  const { state, dispatch, showToast } = useApp()
  const { integrations, language } = state
  const isKh = language === 'kh'

  // Each provider opens as its own page: the cards give way to that provider's tabs with a
  // back arrow, the same way the Account Management cards do.
  const [openId, setOpenId] = useState(null)
  const [tab, setTab] = useState(TABS[0].id)
  // Which provider row has its kebab menu open on the landing page
  const [menuId, setMenuId] = useState(null)
  const [catalogueOpen, setCatalogueOpen] = useState(false)
  const [removing, setRemoving] = useState(null)

  const active = integrations.find(i => i.id === openId) || null
  const signedIn = !!active?.login?.signedIn

  // Local component state, so App.jsx's global Escape handler can't reach it.
  useEffect(() => {
    if (!catalogueOpen) return
    const handleKey = (e) => { if (e.key === 'Escape') setCatalogueOpen(false) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [catalogueOpen])

  function openProvider(id, toTab = TABS[0].id) {
    setTab(toTab)
    setOpenId(id)
  }

  const log = (id, entry) => dispatch({ type: 'ADD_INTEGRATION_LOG', id, log: { at: nowStamp(), ...entry } })

  // Adding lands on the new provider's Connection tab: it has no credentials yet, and that
  // is the one thing standing between it and being usable.
  function handleAddProvider(template) {
    dispatch({ type: 'ADD_INTEGRATION', integration: buildIntegration(template) })
    log(template.id, {
      event: 'Integration added',
      direction: 'Outbound',
      records: 0,
      status: 'Success',
      detail: 'Added from the provider catalogue — awaiting credentials',
    })
    setCatalogueOpen(false)
    openProvider(template.id)
    showToast(`${template.name} added — enter its credentials to connect`, 'success')
  }

  // Registering claims the provider ID this install exchanges data as, and signs straight
  // in — a freshly registered account that then asked to sign in would be busywork.
  function handleRegister(integration, userId) {
    dispatch({
      type: 'UPDATE_INTEGRATION',
      id: integration.id,
      updates: {
        login: { userId, registered: true, signedIn: true },
        // The provider's own identifier field is this same account, unless one is already set
        account: integration.account || userId,
      },
    })
    log(integration.id, {
      event: 'Account registered',
      direction: 'Outbound',
      records: 0,
      status: 'Success',
      detail: `Registered as ${userId} — signed in`,
    })
    showToast(`Registered with ${integration.name} as ${userId}`, 'success')
  }

  function handleSignIn(integration, userId) {
    dispatch({
      type: 'UPDATE_INTEGRATION',
      id: integration.id,
      updates: { login: { ...integration.login, userId, signedIn: true } },
    })
    log(integration.id, {
      event: 'Signed in',
      direction: 'Outbound',
      records: 0,
      status: 'Success',
      detail: `Signed in as ${userId}`,
    })
    showToast(`Signed in to ${integration.name}`, 'success')
  }

  function handleSignOut(integration) {
    dispatch({
      type: 'UPDATE_INTEGRATION',
      id: integration.id,
      updates: { login: { ...integration.login, signedIn: false } },
    })
    log(integration.id, {
      event: 'Signed out',
      direction: 'Outbound',
      records: 0,
      status: 'Success',
      detail: `${integration.login?.userId || 'Account'} signed out — credentials and scopes kept`,
    })
    showToast(`Signed out of ${integration.name}`, 'info')
  }

  function handleConfirmRemove() {
    dispatch({ type: 'DELETE_INTEGRATION', id: removing.id })
    if (openId === removing.id) setOpenId(null)
    showToast(`${removing.name} removed`, 'info')
    setRemoving(null)
  }

  // A key is what the provider authenticates on, so saving without one cannot leave the
  // connection reading as established — it is stored, flagged as an error, and logged.
  function handleSave(integration, form) {
    const ok = !!form.apiKey.trim() && !!form.baseUrl.trim()
    dispatch({
      type: 'UPDATE_INTEGRATION',
      id: integration.id,
      updates: { ...form, status: ok ? 'connected' : 'error' },
    })
    log(integration.id, {
      event: 'Credentials saved',
      direction: 'Outbound',
      records: 0,
      status: ok ? 'Success' : 'Failed',
      detail: ok
        ? `${form.environment === 'production' ? 'Production' : 'Sandbox'} connection established at ${form.baseUrl}`
        : 'API key and base URL are both required to connect',
    })
    showToast(
      ok ? `${integration.name} connected (${form.environment})` : `${integration.name}: API key and base URL are required`,
      ok ? 'success' : 'error'
    )
  }

  function handleTest(integration, form) {
    const ok = !!form.apiKey.trim() && !!form.baseUrl.trim()
    log(integration.id, {
      event: 'Connection test',
      direction: 'Outbound',
      records: 0,
      status: ok ? 'Success' : 'Failed',
      detail: ok ? `Handshake accepted by ${form.baseUrl}` : 'Credentials rejected — API key not set',
    })
    // A passing test on an untested connection is itself the confirmation it works, so it
    // clears an error state; it never overwrites credentials, which is Save's job.
    if (ok && integration.status !== 'connected') {
      dispatch({ type: 'UPDATE_INTEGRATION', id: integration.id, updates: { status: 'connected' } })
    }
    showToast(
      ok ? `${integration.name} responded — connection healthy` : `${integration.name} did not respond — check the API key`,
      ok ? 'success' : 'error'
    )
  }

  function handleDisconnect(integration) {
    // Auto-sync goes off with the connection: a disconnected provider left on schedule
    // would report a failed run every interval.
    dispatch({ type: 'UPDATE_INTEGRATION', id: integration.id, updates: { status: 'disconnected', autoSync: false } })
    log(integration.id, {
      event: 'Disconnected',
      direction: 'Outbound',
      records: 0,
      status: 'Success',
      detail: 'Connection closed by Admin — credentials kept, automatic sync switched off',
    })
    showToast(`${integration.name} disconnected`, 'info')
  }

  function handleSyncNow(integration) {
    // Nothing is exchanged on behalf of an account that is not signed in
    if (!integration.login?.signedIn) {
      showToast(`Sign in to ${integration.name} first — open Configure.`, 'error')
      return
    }
    if (integration.status !== 'connected') {
      showToast(`${integration.name} is not connected — establish the connection first.`, 'error')
      return
    }
    const scopes = integration.scopes.filter(s => s.enabled)
    if (scopes.length === 0) {
      showToast(`No sync scope is switched on for ${integration.name}.`, 'error')
      return
    }
    const at = nowStamp()
    // What one exchanged item is called differs by provider — a billing connection moves
    // records, a messaging one sends messages.
    const unit = integration.unit || 'record'
    const plural = n => `${n} ${unit}${n === 1 ? '' : 's'}`
    // Mock exchange: one log line per enabled scope, so the history shows exactly what the
    // run was allowed to touch rather than a single opaque "sync completed".
    const results = scopes.map(s => ({ scope: s, count: 1 + Math.floor(Math.random() * 20) }))
    results.forEach(({ scope, count }) => {
      dispatch({
        type: 'ADD_INTEGRATION_LOG',
        id: integration.id,
        log: {
          at,
          event: scope.label,
          direction: scope.direction || 'Outbound',
          records: count,
          status: 'Success',
          detail: `Manual sync — ${plural(count)} processed`,
        },
      })
    })
    dispatch({ type: 'UPDATE_INTEGRATION', id: integration.id, updates: { lastSyncAt: at } })
    showToast(
      `${integration.name} synced — ${plural(results.reduce((sum, r) => sum + r.count, 0))} across ${scopes.length} scope${scopes.length === 1 ? '' : 's'}`,
      'success'
    )
  }

  return (
    <div className={embedded ? 'space-y-5' : 'p-4 sm:p-6 space-y-6'}>
      {/* Landing: the module title and one full-width row per provider. Picking one replaces
          this view with that provider's own page, so only one of the two is ever on screen. */}
      {openId === null && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className={`font-bold text-slate-800 dark:text-slate-100 ${embedded ? 'text-base' : 'text-xl'}`}>
                {isKh ? 'ការតភ្ជាប់ប្រព័ន្ធ' : 'Integrations'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Manage and configure third-party integrations to automate and streamline your operations.
              </p>
            </div>
            <Button
              onClick={() => setCatalogueOpen(true)}
              className="h-auto flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-xs font-bold flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Integration
            </Button>
          </div>

          <div className="space-y-4">
            {integrations.map(item => {
              const Look = styleFor(item.id)
              const connected = item.status === 'connected'
              return (
                <div
                  key={item.id}
                  className={`relative bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 transition-colors ${Look.hover}`}
                >
                  {/* The provider's own wordmark stands in for an app icon, on a tile tinted
                      with its brand colour. */}
                  <div className={`w-24 h-24 rounded-2xl flex items-center justify-center overflow-hidden px-2 flex-shrink-0 ${Look.tile}`}>
                    <ProviderLogo id={item.id} name={item.name} size="sm" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">{item.name}</p>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-snug">{item.tagline}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
                      <StatusBadge status={item.status} />
                      {/* Which account is behind this connection, or that Configure will ask
                          for one — the sign-in gate is otherwise a surprise on click. */}
                      {item.login?.signedIn ? (
                        <span className="flex items-center gap-1.5 min-w-0 text-xs text-slate-400 dark:text-slate-500">
                          <UserCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="font-mono truncate">{item.login.userId}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {item.login?.registered ? 'Signed out' : 'Sign-in required'}
                        </span>
                      )}
                      <p className="text-xs text-slate-400 dark:text-slate-500">{lastSyncLabel(item.lastSyncAt)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0 self-start sm:self-center">
                    <Button
                      variant="outline"
                      onClick={() => openProvider(item.id)}
                      className="h-auto px-4 py-2 rounded-xl border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold"
                    >
                      Configure
                    </Button>
                    <DropdownMenu open={menuId === item.id} onOpenChange={open => setMenuId(open ? item.id : null)}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`More actions for ${item.name}`}
                          className="h-auto w-auto p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
                        <MenuItem icon={Settings2} onClick={() => openProvider(item.id)}>
                          Configure
                        </MenuItem>
                        <MenuItem icon={RefreshCw} onClick={() => handleSyncNow(item)}>
                          Sync now
                        </MenuItem>
                        <MenuItem icon={History} onClick={() => openProvider(item.id, 'activity')}>
                          Activity log
                        </MenuItem>
                        {connected && (
                          <MenuItem icon={Unlink} danger onClick={() => handleDisconnect(item)}>
                            Disconnect
                          </MenuItem>
                        )}
                        {/* Only a catalogue-added provider can be removed — a seeded one
                            has no template to add it back from, so it only disconnects. */}
                        {item.fromCatalogue && (
                          <MenuItem icon={Trash2} danger onClick={() => setRemoving(item)}>
                            Remove integration
                          </MenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Where the credentials above actually live. Worth stating plainly on the landing
              page, since this install keeps them in the browser rather than on a server. */}
          <div className="rounded-2xl border border-brand-200/60 dark:border-brand-900 bg-brand-50/60 dark:bg-brand-900/20 p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-600 dark:text-brand-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Where your credentials are kept</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                API keys are saved with this install only — they are never shown in reports or exports.
                Sandbox connections move no real money and no real customer data.
              </p>
            </div>
          </div>
        </>
      )}

      {active && (
        <>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOpenId(null)}
              title="Back to Integration"
              className="h-auto w-auto p-2 rounded-xl border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h1 className="sr-only">{active.name}</h1>
            <ProviderLogo id={active.id} name={active.name} size="sm" />
            <StatusBadge status={active.status} />
            {signedIn && (
              <div className="ml-auto flex items-center gap-2 min-w-0">
                <span className="hidden sm:flex items-center gap-1.5 min-w-0 text-xs text-slate-500 dark:text-slate-400">
                  <UserCircle2 className="w-4 h-4 flex-shrink-0 text-slate-400" />
                  <span className="font-mono font-semibold truncate">{active.login.userId}</span>
                </span>
                <Button
                  variant="outline"
                  onClick={() => handleSignOut(active)}
                  title="Sign out of this provider"
                  className="h-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold flex-shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </Button>
              </div>
            )}
          </div>

          {/* Configure opens on the sign-in gate until this install has an account with the
              provider — nothing behind it can be set up without one. */}
          {!signedIn && (
            <AuthPanel
              key={active.id}
              integration={active}
              onRegister={userId => handleRegister(active, userId)}
              onSignIn={userId => handleSignIn(active, userId)}
            />
          )}
        </>
      )}

      {active && signedIn && (
        <>
          {/* Same tab bar, down to the active colour, as the Account Management cards —
              one tab is always selected, so the page never sits on an empty body. */}
          {/* Inside Settings the modal body is already white, so the bar needs its own
              outline to stay a distinct strip. */}
          <div className={`bg-white dark:bg-slate-800 rounded-2xl overflow-hidden ${
            embedded ? 'border border-slate-200/60 dark:border-slate-700 shadow-sm' : ''
          }`}>
            <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
              {TABS.map(t => {
                const on = tab === t.id
                // The log is a record rather than a working view, so it sits apart at the
                // right end — same placement as the ledger's audit log tab.
                const pushRight = t.id === 'activity'
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    aria-pressed={on}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold whitespace-nowrap rounded-2xl transition-colors ${pushRight ? 'ml-auto flex-shrink-0' : ''} ${
                      on
                        ? 'bg-blue-50 text-[#0047ab] dark:bg-blue-900/30 dark:text-blue-400'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {tab === 'connection' && (
            <div className="space-y-4">
              <ConnectionPanel
                key={active.id}
                integration={active}
                onSave={form => handleSave(active, form)}
                onTest={form => handleTest(active, form)}
                onDisconnect={() => handleDisconnect(active)}
              />
              {/* KHQR is a WeBill365 capability — the other providers have no merchant code
                  to present, so the card only appears for that connection. */}
              {active.id === 'webill365' && (
                <KhqrPanel
                  integration={active}
                  dispatch={dispatch}
                  showToast={showToast}
                  companyName={state.companyProfile?.name}
                />
              )}
            </div>
          )}

          {tab === 'sync' && (
            <SyncPanel
              integration={active}
              onToggleScope={scopeId => dispatch({ type: 'TOGGLE_INTEGRATION_SCOPE', id: active.id, scopeId })}
              onSetAutoSync={() => {
                if (!active.autoSync && active.status !== 'connected') {
                  showToast(`${active.name} is not connected — establish the connection first.`, 'error')
                  return
                }
                dispatch({ type: 'UPDATE_INTEGRATION', id: active.id, updates: { autoSync: !active.autoSync } })
              }}
              onSetInterval={minutes => dispatch({ type: 'UPDATE_INTEGRATION', id: active.id, updates: { syncEvery: minutes } })}
              onSyncNow={() => handleSyncNow(active)}
            />
          )}

          {tab === 'activity' && <ActivityPanel integration={active} />}
        </>
      )}

      {/* Provider catalogue */}
      {catalogueOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setCatalogueOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Add Integration</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pick a provider to add. It starts disconnected — enter its credentials on the Connection tab.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCatalogueOpen(false)}
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto bg-slate-50 dark:bg-slate-900">
              {INTEGRATION_CATALOGUE.map(template => {
                const already = integrations.some(i => i.id === template.id)
                const Look = styleFor(template.id)
                return (
                  <div
                    key={template.id}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 p-4 flex items-center gap-4"
                  >
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden px-1.5 flex-shrink-0 ${Look.tile}`}>
                      <ProviderLogo id={template.id} name={template.name} size="xs" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{template.name}</p>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 whitespace-nowrap">
                          {template.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{template.tagline}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {template.scopes.length} sync scopes · exchanges {template.unit}s
                      </p>
                    </div>
                    {already ? (
                      <span className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                        Added
                      </span>
                    ) : (
                      <Button
                        onClick={() => handleAddProvider(template)}
                        className="h-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-xs font-bold flex-shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation — a catalogue-added provider only */}
      <AlertDialog open={!!removing} onOpenChange={open => !open && setRemoving(null)}>
        <AlertDialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden gap-0">
          {removing && (
            <>
              <AlertDialogHeader className="p-5 flex-row gap-4 space-y-0 text-left">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div className="min-w-0">
                  <AlertDialogTitle className="text-sm font-bold text-slate-800 dark:text-slate-100">Remove Integration</AlertDialogTitle>
                  <AlertDialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Remove <span className="font-bold text-slate-700 dark:text-slate-200">{removing.name}</span> and
                    its exchange history? Its credentials and activity log are deleted — you can add the provider
                    again from the catalogue, but it starts fresh.
                  </AlertDialogDescription>
                </div>
              </AlertDialogHeader>
              <AlertDialogFooter className="px-5 py-4 border-t border-slate-100 dark:border-slate-700">
                <AlertDialogCancel className="h-auto border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmRemove}
                  className="h-auto bg-rose-600 hover:bg-rose-700 px-5 py-2 rounded-xl text-xs font-bold"
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
