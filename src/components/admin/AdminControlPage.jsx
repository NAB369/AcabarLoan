import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, BadgeCheck, ChevronDown, ChevronLeft, ClipboardList, Fingerprint,
  KeyRound, Layers, LayoutDashboard, Lock, LogOut, MonitorSmartphone, Search, ShieldAlert,
  ShieldCheck, SlidersHorizontal, Unlock, UserCog, UserMinus, Users,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { BRANCHES } from '../../data/constants'
import {
  ADMIN_ROLE, DEPARTMENTS, PERMISSION_ACTIONS, PERMISSION_MODULES, SECURITY_UNENFORCEABLE,
  defaultSecurity, describeRequest, effectivePermission, emptyScope, isSuperAdmin,
  scopeSummary, verifyChain, PLATFORM_NAME_DEFAULT,
} from '../../utils/governance'
import { initials } from '../../utils/format'
import { verifyPassword } from '../../utils/credentials'
import StatusBadge from '../shared/StatusBadge'
import StickyHScroll from '../shared/StickyHScroll'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Admin Control ────────────────────────────────────────────────────────────
// The Super Admin's console over the Admin accounts. Everything here is a governance action on
// somebody else's authority, so three things are true of every control on the page:
//
//   1. The reducer, not this file, is what enforces it. Each button dispatches an action that
//      re-checks who is asking and what it is being asked about (see the guards in AppContext).
//      A console that only hid its own buttons would be a suggestion.
//   2. The consequential ones ask for the Super Admin's own password first — the step-up in
//      rule 10. There is no second factor to demand in a browser with no server, and calling a
//      re-authentication "MFA" would be a lie; what it does buy is that an unattended session
//      cannot be used to lock the Admin out by someone walking past.
//   3. Every one of them lands in the audit trail, written by the same reducer case that makes
//      the change (rule 9).

// The three that govern no single account. Everything else is about one business's Admin, and
// carries that account in the URL — which is what makes a pane a place you can send somebody.
const FLEET_PANES = ['overview', 'customers', 'approvals', 'audit']

const PANES = [
  { id: 'overview',    label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'customers',   label: 'Customers',     icon: Users },
  { id: 'profile',     label: 'Admin Profile', icon: UserCog },
  { id: 'permissions', label: 'Permissions',   icon: ShieldCheck },
  { id: 'scope',       label: 'Access Scope',  icon: Layers },
  { id: 'security',    label: 'Security',      icon: Fingerprint },
  { id: 'sessions',    label: 'Sessions',      icon: MonitorSmartphone },
  { id: 'activity',    label: 'Activity',      icon: Activity },
  { id: 'approvals',   label: 'Approval Center', icon: ClipboardList },
  { id: 'audit',       label: 'Audit Log',     icon: ClipboardList },
]

const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700'
const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700/50'
const td = 'px-3 py-2 text-xs text-slate-700 dark:text-slate-200'

// ── Step-up ──────────────────────────────────────────────────────────────────
// Asks the signed-in Super Admin to re-enter their own password before an action lands. Stated
// plainly for what it is: a re-authentication, not a second factor.
function StepUp({ action, onCancel, onConfirm }) {
  const { state } = useApp()
  // Escape backs out. This dialog is local state, so App.jsx's global handler cannot reach it —
  // every modal still needs the same way out (see ux-ui-design.md).
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  const me = state.systemUsers.find(u => u.username === state.currentUser)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (!await verifyPassword(password, me)) { setError('That is not your password'); return }
      onConfirm()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" role="dialog" aria-modal="true">
      <form onSubmit={submit} className={`${card} w-full max-w-sm p-6 shadow-xl`}>
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Confirm it is you</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{action}</p>
          </div>
        </div>
        <Input
          autoFocus
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          placeholder="Your password"
          autoComplete="current-password"
          className="mt-4 text-sm"
        />
        {error && <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-2">{error}</p>}
        <div className="flex items-center gap-2 mt-5">
          <Button type="submit" disabled={busy} className="flex-1 h-auto py-2.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700">
            {busy ? 'Checking…' : 'Confirm'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-auto py-2.5 text-xs font-bold rounded-xl">
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}

// Typed fields here each drive a dispatch that writes an audit line, so a field wired straight to
// onChange would put one entry in the governance trail PER KEYSTROKE — thirty lines saying the
// business was renamed, and the real change buried among them. Held locally and committed once, on
// blur or Enter, and only when the value actually moved.
function CommitInput({ value, onCommit, type = 'text', className = '', ...rest }) {
  const [draft, setDraft] = useState(value ?? '')
  const [editing, setEditing] = useState(false)
  // While the field is not being typed in it follows the record, so a change made elsewhere (or an
  // action refused by the reducer) is reflected rather than masked by a stale draft.
  const shown = editing ? draft : (value ?? '')
  const commit = () => {
    setEditing(false)
    const next = type === 'number' ? Number(draft) || 0 : draft
    if (String(next) !== String(value ?? '')) onCommit(next)
  }
  return (
    <Input
      type={type}
      value={shown}
      onFocus={() => { setDraft(value ?? ''); setEditing(true) }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); e.currentTarget.blur() }
      }}
      className={className}
      {...rest}
    />
  )
}

// A figure with its label above and its qualifier below. Shared by the console's two summaries so
// a number means the same thing, and is read the same way, on both.
const StatTile = ({ label, value, sub }) => (
  <div className={`${card} p-4`}>
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</p>
    <p className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-100 mt-1.5 leading-none">{value}</p>
    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{sub}</p>
  </div>
)

const Field = ({ label, children }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</p>
    <div className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-1">{children}</div>
  </div>
)

// ── The management card for one Admin ────────────────────────────────────────
function ProfilePane({ admin, onAction }) {
  const { state } = useApp()
  const sec = { ...defaultSecurity(), ...(admin.security || {}) }
  const session = admin.activeSession
  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {/* Initials, not a generic person icon: the same mark this account carries in the fleet
                table, so the row you clicked and the card you land on are visibly one thing. */}
            <div className="w-11 h-11 rounded-full bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0 text-sm font-bold text-brand-700 dark:text-brand-300">
              {initials(admin.fullName || admin.username)}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{admin.fullName || admin.username}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{admin.username}{admin.email ? ` · ${admin.email}` : ''}</p>
            </div>
          </div>
          <StatusBadge status={admin.status || 'Active'} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
          <Field label="Business">
            {admin.scope?.organization
              || <span className="text-slate-500 dark:text-slate-400" title="Inherited from the business this install serves">{state.companyProfile.name}</span>}
          </Field>
          <Field label="Role">{admin.role || '—'}</Field>
          <Field label="Branch">{admin.branch || 'Unrestricted'}</Field>
          <Field label="Access scope">{scopeSummary(admin.scope)}</Field>
          <Field label="Step-up required">{sec.mfaRequired ? 'Yes — re-auth on critical actions' : 'No'}</Field>
          <Field label="Last login">{admin.lastLogin || 'Never'}</Field>
          <Field label="Failed sign-ins">{admin.failedLogins || 0}{sec.maxFailedAttempts ? ` of ${sec.maxFailedAttempts}` : ''}</Field>
          <Field label="Session">{session ? `Open since ${session.startedAt}` : 'None open'}</Field>
          <Field label="Password set">{admin.passwordHash ? (admin.passwordSetAt || 'Yes') : 'Not set — chosen at next sign-in'}</Field>
        </div>
      </div>

      {/* Emergency controls (section 10). Grouped and labelled by what they do to the person, not
          by what they do to the record: "can no longer sign in" is the fact the Super Admin is
          deciding on. Each one re-authenticates first. */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Emergency controls</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Each of these asks for your password first, and each is recorded in the audit log against your account.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {admin.status === 'Locked' ? (
            <Button variant="outline" onClick={() => onAction('unlock')} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
              <Unlock className="w-3.5 h-3.5" /> Unlock
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onAction('lock')} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
              <Lock className="w-3.5 h-3.5" /> Lock
            </Button>
          )}
          <Button variant="outline" onClick={() => onAction('suspend')} disabled={admin.status === 'Suspended'} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
            <ShieldAlert className="w-3.5 h-3.5" /> Suspend access
          </Button>
          {admin.status === 'Active' ? (
            <Button variant="outline" onClick={() => onAction('deactivate')} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
              <UserMinus className="w-3.5 h-3.5" /> Deactivate
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onAction('activate')} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
              <BadgeCheck className="w-3.5 h-3.5" /> Activate
            </Button>
          )}
          <Button variant="outline" onClick={() => onAction('forceLogout')} disabled={!session} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
            <LogOut className="w-3.5 h-3.5" /> Force logout
          </Button>
          <Button variant="outline" onClick={() => onAction('resetPassword')} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
            <KeyRound className="w-3.5 h-3.5" /> Reset password
          </Button>
        </div>
        {state.adminRequests.some(r => r.status === 'Pending Super Admin Approval' && r.requestedBy === admin.username) && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-3 font-semibold">
            This Admin has requests waiting on you — see Approval Center.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Dashboard: every governed account at once ───────────────────────────────
// The rest of this console governs ONE account at a time, which is the right shape for deciding
// about a person and the wrong shape for noticing anything: a locked account, a request waiting
// three days and an Admin whose permissions were quietly narrowed all look identical from inside a
// single profile. This is the fleet.
//
// It is built top-down as an answer to one question — "is anything wrong, and what do I do about
// it" — because that is what an operator opens a console to find out:
//   1. one sentence of posture, with the single action that resolves it;
//   2. four figures, so the sentence can be checked rather than trusted;
//   3. the items that need a decision, each with the button that makes it;
//   4. the accounts themselves, searchable, for everything else;
//   5. what changed lately, and the console's own configuration, folded out of the way.
function OverviewPane({ accounts, supers, onManage, onAction }) {
  const { state, dispatch, showToast } = useApp()
  const [showIdentity, setShowIdentity] = useState(false)

  const pending = state.adminRequests.filter(r => r.status === 'Pending Super Admin Approval')
  const active = accounts.filter(u => u.status === 'Active')
  const openSessions = accounts.filter(u => u.activeSession)

  // Only things somebody has to DO something about, most serious first, each carrying the action
  // that resolves it. A list that also reported the healthy accounts would be a list nobody reads,
  // and one without buttons would send the reader hunting for the row it was talking about.
  const attention = [
    ...accounts.filter(u => u.status === 'Locked').map(u => ({
      key: `lock-${u.username}`, level: 'Critical',
      text: `${u.fullName || u.username} is locked out`,
      why: u.lockedReason || 'locked by a Super Admin',
      action: { label: 'Unlock', run: () => onAction('unlock', u) },
    })),
    ...accounts.filter(u => u.status === 'Suspended').map(u => ({
      key: `susp-${u.username}`, level: 'Critical',
      text: `${u.fullName || u.username} is suspended`,
      why: u.suspendedUntil ? `until ${u.suspendedUntil}` : 'no end date set',
      action: { label: 'Restore', run: () => onAction('activate', u) },
    })),
    ...pending.map(r => ({
      key: `req-${r.id}`, level: 'Attention',
      text: `${r.id} — ${describeRequest(r)}`,
      why: `requested by ${r.requestedBy} at ${r.requestedAt}`,
      action: { label: 'Review', run: () => dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: 'approvals' }) },
    })),
    ...accounts.filter(u => u.status === 'Pending').map(u => ({
      key: `pend-${u.username}`, level: 'Attention',
      text: `${u.fullName || u.username} requested access`,
      why: `asked for ${u.requestedRole || 'no role stated'}${u.requestedAt ? ` at ${u.requestedAt}` : ''}`,
      action: { label: 'Activate', run: () => onAction('activate', u) },
    })),
    ...accounts.filter(u => u.resetRequestedAt).map(u => ({
      key: `reset-${u.username}`, level: 'Attention',
      text: `${u.fullName || u.username} asked for a password reset`,
      why: `requested ${u.resetRequestedAt} — clearing it lets them choose a new one at next sign-in`,
      action: { label: 'Reset', run: () => onAction('resetPassword', u) },
    })),
    ...accounts.filter(u => u.status === 'Active' && !u.passwordHash).map(u => ({
      key: `pw-${u.username}`, level: 'Attention',
      text: `${u.fullName || u.username} has no password on this install`,
      why: 'the first person to reach the sign-in screen with this email sets it',
      action: null,
    })),
    ...accounts.filter(u => (u.failedLogins || 0) > 0 && u.status === 'Active').map(u => ({
      key: `fail-${u.username}`, level: 'Attention',
      text: `${u.fullName || u.username}: ${u.failedLogins} failed sign-in${u.failedLogins === 1 ? '' : 's'}`,
      why: `locks at ${(u.security?.maxFailedAttempts ?? 5) || 'never'}`,
      action: { label: 'Review', run: () => onManage(u.username) },
    })),
  ]

  const critical = attention.filter(a => a.level === 'Critical').length
  // The posture sentence and the one action that answers it. This is the view's single primary
  // action — everything else on the page is outline or ghost (see ux-ui-design.md).
  const posture = critical > 0
    ? {
      tone: 'bad',
      line: `${critical} account${critical === 1 ? '' : 's'} cannot sign in`,
      sub: 'Access is blocked until you restore it.',
      cta: attention.find(a => a.level === 'Critical' && a.action),
    }
    : pending.length > 0
      ? {
        tone: 'warn',
        line: `${pending.length} request${pending.length === 1 ? '' : 's'} waiting on you`,
        sub: 'Nothing changes until you approve or reject it.',
        cta: { action: { label: pending.length === 1 ? 'Review request' : 'Review requests', run: () => dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: 'approvals' }) } },
      }
      : attention.length > 0
        ? {
          tone: 'warn',
          line: `${attention.length} thing${attention.length === 1 ? '' : 's'} to look at`,
          sub: 'Nothing is blocking access.',
          cta: attention.find(a => a.action),
        }
        : {
          tone: 'good',
          line: 'All clear',
          sub: `${active.length} of ${accounts.length} account${accounts.length === 1 ? '' : 's'} active, no requests open.`,
          cta: null,
        }

  const dot = tone => (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
      tone === 'bad' ? 'bg-rose-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500'
    }`} aria-hidden="true" />
  )

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* 1 — posture. One sentence an operator can act on or walk away from. */}
      <div className={`${card} p-5 flex flex-wrap items-center justify-between gap-4`}>
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-1.5">{dot(posture.tone)}</span>
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{posture.line}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{posture.sub}</p>
          </div>
        </div>
        {posture.cta?.action ? (
          <Button
            onClick={posture.cta.action.run}
            className="h-auto gap-2 px-4 py-2.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700 flex-shrink-0"
          >
            {posture.cta.action.label}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 flex-shrink-0">
            Nothing to action
          </span>
        )}
      </div>

      {/* 2 — the figures behind the sentence. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Customers" value={accounts.length} sub={`Admin account${accounts.length === 1 ? '' : 's'} under management`} />
        <StatTile label="Not active" value={accounts.length - active.length} sub="locked, suspended or disabled" />
        <StatTile label="Sessions open" value={openSessions.length} sub="recorded in this install" />
        <StatTile label="Awaiting you" value={pending.length} sub="maker-checker requests" />
      </div>

      {/* 3 — the decisions, each with its button. */}
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Needs a decision</h3>
        {attention.length === 0 ? (
          <div className="py-7 text-center">
            <BadgeCheck className="w-6 h-6 text-emerald-500 mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Nothing waiting. Every governed account is active, and no request is open.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
            {attention.map(a => (
              <li key={a.key} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                {/* The level is a word as well as a colour — printed, exported or read by somebody
                    who cannot tell rose from amber, the row still says which it is. */}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${
                  a.level === 'Critical'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {a.level}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{a.text}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{a.why}</p>
                </div>
                {a.action && (
                  <Button
                    variant="outline"
                    onClick={a.action.run}
                    className="h-auto px-3 py-1.5 text-[11px] font-bold rounded-lg flex-shrink-0"
                  >
                    {a.action.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* The list itself is the Customers section — the dashboard only says how many there are and
          holds the door, so the two pages do not carry the same table. */}
      <div className={`${card} p-5 flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Customers</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {accounts.length} Admin account{accounts.length === 1 ? '' : 's'} under management ·
            {' '}{active.length} active
            {accounts.length - active.length > 0 ? ` · ${accounts.length - active.length} not active` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: 'customers' })}
          className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl flex-shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> Manage customers
        </Button>
      </div>

      {/* Your own side of the fence. A Super Admin is not governed from here — its permissions are
          the level itself, so there is no grid to narrow and no scope to set — but the operator has
          to see which of its own accounts exist, which are in use, and shut one down if it should
          not be. One active account is always kept: the reducer refuses the change that leaves none. */}
      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Super Admin accounts</h3>
          <span className="text-[11px] text-slate-400">
            {supers.filter(u => u.status === 'Active').length} active of {supers.length}
          </span>
        </div>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
          {supers.map(u => {
            const self = u.username === state.currentUser
            const lastActive = u.status === 'Active' && supers.filter(x => x.status === 'Active').length <= 1
            return (
              <div key={u.username} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-gold-400">
                  {initials(u.fullName || u.username)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {u.fullName || u.username}
                    {self && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">you</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono">{u.username}</span> · last login {u.lastLogin || 'never'}
                    {u.activeSession ? ' · session open' : ''}
                    {!u.passwordHash ? ' · no password set yet' : ''}
                  </p>
                </div>
                <StatusBadge status={u.status || 'Active'} size="xs" />
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onAction('forceLogout', u)}
                    disabled={!u.activeSession || self}
                    title={self ? 'Use Sign out for your own session' : u.activeSession ? 'End this account’s sessions' : 'No session open'}
                    className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 disabled:text-slate-300 dark:disabled:text-slate-600"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </Button>
                  {u.status === 'Locked' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onAction('unlock', u)}
                      title="Unlock this Super Admin"
                      className="h-auto w-auto p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onAction('lock', u)}
                      disabled={self || lastActive || u.status !== 'Active'}
                      title={self ? 'You cannot lock your own account'
                        : lastActive ? 'The last active Super Admin — the install would have no way back in'
                        : u.status !== 'Active' ? `Already ${u.status}`
                        : 'Lock this Super Admin out'}
                      className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:text-slate-300 dark:disabled:text-slate-600"
                    >
                      <Lock className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 5 — what changed, and the console's own name. Both below the work: an operator opening
          this page is here to govern, not to read history or rename a window. */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Latest activity</h3>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: 'audit' })}
              className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
            >
              Full audit log
            </button>
          </div>
          {state.adminAuditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">Nothing recorded yet.</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {state.adminAuditLogs.slice(0, 6).map(e => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{e.action}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {e.object ? `${e.object} · ` : ''}{e.actor} · {e.timestamp}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Configuration, folded away: two organisations meet on this screen and the difference is
            worth stating, but not at the cost of the operator's attention every visit. */}
        <div className={`${card} p-5`}>
          <button
            type="button"
            onClick={() => setShowIdentity(v => !v)}
            aria-expanded={showIdentity}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Console identity</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                {state.platformName || PLATFORM_NAME_DEFAULT} · managing {state.companyProfile.name}
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${showIdentity ? 'rotate-180' : ''}`} />
          </button>
          {showIdentity && (
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="operator-name" className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                  Operator (you)
                </label>
                <CommitInput
                  id="operator-name"
                  value={state.platformName || ''}
                  onCommit={v => {
                    dispatch({ type: 'SET_PLATFORM_NAME', name: v })
                    showToast(v ? `Console renamed to ${v}` : 'Operator name cleared', 'success')
                  }}
                  placeholder="Your company's name"
                  className="mt-1.5 text-sm"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  Shown on this console. Cleared, it falls back to {PLATFORM_NAME_DEFAULT} — never to
                  the business's name, which belongs to the business.
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                  Business under management
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1.5">{state.companyProfile.name}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                  The tenant this install serves. Its name and logo are the business's own — change them
                  in System Settings → Company Profile, not here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Customers: the client businesses, as a list you manage ──────────────────
// One row per account the operator governs. This is where a customer is FOUND — searched, filtered,
// and opened — which is a different job from the dashboard's, and the reason it is its own section:
// a list you scan to locate somebody does not belong inside a page you open to see what needs doing.
//
// Everything about one customer lives behind Manage, on the six per-account panes.
function CustomersPane({ accounts, onManage, onAction }) {
  const { state } = useApp()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Every permission key the grid can grant, so "14 of 22" means the same thing on every row.
  const PERM_KEYS = PERMISSION_MODULES
    .flatMap(m => PERMISSION_ACTIONS.map(a => m.cells[a]))
    .filter(Boolean)
  const permsHeld = u => PERM_KEYS.filter(k => effectivePermission(u, state.roleMatrix, k)).length

  const filtered = accounts.filter(u => {
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'active' ? u.status === 'Active' : u.status !== 'Active')
    const q = query.trim().toLowerCase()
    const matchQuery = !q || [u.fullName, u.username, u.email, u.role, u.scope?.organization]
      .some(v => String(v || '').toLowerCase().includes(q))
    return matchStatus && matchQuery
  })

  const filterButton = (id, label) => (
    <button
      type="button"
      onClick={() => setStatusFilter(id)}
      aria-pressed={statusFilter === id}
      className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${
        statusFilter === id
          ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )

  const active = accounts.filter(u => u.status === 'Active')
  const narrowed = accounts.filter(u => (u.permissionOverrides?.revoked?.length || 0) > 0)
  const scoped = accounts.filter(u => (u.scope?.branches?.length || 0) + (u.scope?.products?.length || 0) > 0)

  return (
    <div className="space-y-4">
    {/* The section's own dashboard. The console dashboard answers "what needs doing today"; this
        answers "what does the book of customers look like" — which is the question you are already
        asking when you came here to find one. */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatTile label="Customers" value={accounts.length} sub={`Admin account${accounts.length === 1 ? '' : 's'} under management`} />
      <StatTile label="Active" value={active.length} sub={accounts.length - active.length > 0 ? `${accounts.length - active.length} cannot sign in` : 'all can sign in'} />
      <StatTile label="Narrowed" value={narrowed.length} sub="permissions revoked for the account" />
      <StatTile label="Scoped" value={scoped.length} sub="limited to branches or products" />
    </div>

    <div className={`${card} p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Customers</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            The Admin account for each business under management. Lock and Force logout ask for your
            password, the same as they do on a profile.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label htmlFor="fleet-search" className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-1">
              Find
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <Input
                id="fleet-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Name, username, business"
                className="w-52 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900/60">
            {filterButton('all', 'All')}
            {filterButton('active', 'Active')}
            {filterButton('other', 'Not active')}
          </div>
        </div>
      </div>

      <StickyHScroll className="mt-4">
        <table className="w-full min-w-[54rem]">
          <thead>
            <tr>
              {['Account', 'Business', 'Status', 'Permissions', 'Scope', 'Last login', ''].map((h, i) => (
                <th key={h || 'act'} className={`${th} ${i === 0 ? 'rounded-tl-xl' : ''} ${i === 6 ? 'rounded-tr-xl text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {accounts.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-400">No customer Admin accounts yet.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-10 text-center text-xs text-slate-400">
                No account matches {query.trim() ? `“${query.trim()}”` : 'that filter'}.
              </td></tr>
            ) : filtered.map(u => {
              const held = permsHeld(u)
              return (
                <tr key={u.username} className="group hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-brand-700 dark:text-brand-300">
                        {initials(u.fullName || u.username)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{u.fullName || u.username}</p>
                        <p className="font-mono text-[10px] text-slate-400 truncate">{u.username}</p>
                      </div>
                      {u.activeSession && (
                        <span
                          title="Session open"
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"
                          aria-label="Session open"
                        />
                      )}
                    </div>
                  </td>
                  {/* Unset means the business this install serves — the tenant, not a gap. */}
                  <td className={td}>
                    {u.scope?.organization
                      ? <span className="font-semibold">{u.scope.organization}</span>
                      : <span className="text-slate-500 dark:text-slate-400" title="Inherited from the business this install serves">{state.companyProfile.name}</span>}
                  </td>
                  <td className="px-3 py-2.5"><StatusBadge status={u.status || 'Active'} size="xs" /></td>
                  {/* A number and a shape. "14 of 22" alone makes an operator do arithmetic to
                      see that this Admin has been narrowed hard. */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${held === PERM_KEYS.length ? 'bg-brand-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.round((held / PERM_KEYS.length) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{held}/{PERM_KEYS.length}</span>
                    </div>
                  </td>
                  <td className={`${td} text-slate-500`}>{scopeSummary(u.scope)}</td>
                  <td className={`${td} text-slate-500 whitespace-nowrap`}>{u.lastLogin || 'Never'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        onClick={() => onManage(u.username)}
                        className="h-auto gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-lg"
                      >
                        <SlidersHorizontal className="w-3 h-3" /> Manage
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onAction('forceLogout', u)}
                        disabled={!u.activeSession}
                        title={u.activeSession ? 'End this account’s sessions' : 'No session open'}
                        className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 disabled:text-slate-300 dark:disabled:text-slate-600"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </Button>
                      {u.status === 'Locked' ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onAction('unlock', u)}
                          title="Unlock this account"
                          className="h-auto w-auto p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onAction('lock', u)}
                          disabled={u.status !== 'Active'}
                          title={u.status === 'Active' ? 'Lock this account out' : `Already ${u.status}`}
                          className="h-auto w-auto p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 disabled:text-slate-300 dark:disabled:text-slate-600"
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </StickyHScroll>
    </div>
    </div>
  )
}

// ── Module × action grid ─────────────────────────────────────────────────────
function PermissionsPane({ admin }) {
  const { state, dispatch, showToast } = useApp()
  const roleGrants = state.roleMatrix[admin.role] || {}

  const toggle = (perm, on) => {
    dispatch({ type: 'SET_ADMIN_PERMISSION', username: admin.username, permission: perm, on })
    showToast(`${state.permissionLabels[perm] || perm} ${on ? 'granted to' : 'revoked from'} ${admin.fullName || admin.username}`, on ? 'success' : 'info')
  }

  return (
    <div className={`${card} p-5`}>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Permissions</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        Granted to <span className="font-semibold">{admin.fullName || admin.username}</span> alone — the role
        {' '}<span className="font-semibold">{admin.role}</span> is not changed, so no other account moves with it.
        A change applies immediately; the Admin cannot alter its own grid.
      </p>
      <StickyHScroll className="mt-4">
        <table className="w-full min-w-[46rem]">
          <thead>
            <tr>
              <th className={`${th} rounded-tl-xl`}>Module</th>
              {PERMISSION_ACTIONS.map(a => <th key={a} className={`${th} capitalize text-center`}>{a}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {PERMISSION_MODULES.map(mod => (
              <tr key={mod.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                <td className={`${td} font-semibold whitespace-nowrap`}>{mod.label}</td>
                {PERMISSION_ACTIONS.map(action => {
                  const perm = mod.cells[action]
                  if (!perm) {
                    // Nothing in this app does that. An empty cell rather than a switch that
                    // would change nothing — see governance.js.
                    return <td key={action} className={`${td} text-center text-slate-300 dark:text-slate-600`} title="This app has no such capability">—</td>
                  }
                  const on = effectivePermission(admin, state.roleMatrix, perm)
                  const overridden = (admin.permissionOverrides?.granted || []).includes(perm)
                    || (admin.permissionOverrides?.revoked || []).includes(perm)
                  return (
                    <td key={action} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(perm, !on)}
                        aria-pressed={on}
                        title={`${state.permissionLabels[perm] || perm}${overridden ? ' — set for this account' : roleGrants[perm] ? ' — from the role' : ''}`}
                        className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'} ${overridden ? 'ring-2 ring-brand-400/60' : ''}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </StickyHScroll>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
        A ring marks a cell set for this account specifically, rather than inherited from its role.
      </p>
    </div>
  )
}

// ── Where the Admin may work ─────────────────────────────────────────────────
function ScopePane({ admin }) {
  const { state, dispatch, showToast } = useApp()
  const scope = { ...emptyScope(), ...(admin.scope || {}) }
  const products = state.loanProducts.map(p => p.name || p).filter(Boolean)

  const save = next => {
    dispatch({ type: 'SET_ADMIN_SCOPE', username: admin.username, scope: next })
    showToast('Access scope updated', 'success')
  }
  const toggleIn = (key, value) => {
    const list = scope[key] || []
    save({ ...scope, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] })
  }

  const Group = ({ label, k, options, note }) => (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</h4>
        <span className="text-[11px] text-slate-400">{(scope[k] || []).length ? `${scope[k].length} selected` : 'All'}</span>
      </div>
      {note && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{note}</p>}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {options.map(opt => {
          const on = (scope[k] || []).includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggleIn(k, opt)}
              aria-pressed={on}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                on
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-brand-400'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className={`${card} p-5 space-y-5`}>
      <div>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Access scope</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Nothing selected means unrestricted on that dimension. Branch and product are carried by every
          loan, so those two are filtered on for real — the loan register, the reports and the approval
          screens all read this list. Department is recorded against the account; no record in this app
          carries one yet, so nothing filters on it.
        </p>
      </div>
      <div>
        <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">Organization</h4>
        <CommitInput
          value={scope.organization || ''}
          onCommit={v => save({ ...scope, organization: v })}
          placeholder={state.companyProfile.name}
          className="mt-2 text-sm max-w-sm"
        />
      </div>
      <Group label="Branches" k="branches" options={BRANCHES.slice(0, 12)} note="Loans outside these branches are hidden from this Admin." />
      <Group label="Products" k="products" options={products} note="Loan products this Admin may see and work on." />
      <Group label="Departments" k="departments" options={DEPARTMENTS} note="Recorded on the account — not enforced, because no record carries a department." />
    </div>
  )
}

// ── Security policy ──────────────────────────────────────────────────────────
function SecurityPane({ admin, onAction }) {
  const { state, dispatch, showToast } = useApp()
  const sec = { ...defaultSecurity(), ...(admin.security || {}) }
  const set = patch => {
    dispatch({ type: 'SET_ADMIN_SECURITY', username: admin.username, security: patch })
    showToast('Security policy updated', 'success')
  }

  const Row = ({ label, hint, children, unenforced }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {label}
          {unenforced && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              recorded, not enforced
            </span>
          )}
        </p>
        {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )

  const Toggle = ({ on, onChange }) => (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`w-10 h-5 rounded-full relative transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  )

  const num = (value, onCommit, suffix) => (
    <div className="flex items-center gap-2">
      <CommitInput type="number" min="0" value={value} onCommit={onCommit} className="w-20 text-sm" />
      <span className="text-[11px] text-slate-400">{suffix}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Security policy</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Applied to <span className="font-semibold">{admin.fullName || admin.username}</span> at sign-in and
          while its session is open. Zero means no limit.
        </p>
        <div className="mt-3">
          <Row label="Step-up required on critical actions" hint="Re-enter the password before a governance action. There is no second factor to demand in a browser with no server — this is re-authentication, and it is labelled as such wherever it is asked for.">
            <Toggle on={sec.mfaRequired} onChange={v => set({ mfaRequired: v })} />
          </Row>
          <Row label="Password expiry" hint="A password older than this must be replaced at the next sign-in.">
            {num(sec.passwordExpiryDays, v => set({ passwordExpiryDays: v }), 'days')}
          </Row>
          <Row label="Session timeout" hint="How long one sign-in may last, however busy the operator is. The idle screen lock still applies on top.">
            {num(sec.sessionTimeoutMinutes, v => set({ sessionTimeoutMinutes: v }), 'minutes')}
          </Row>
          <Row label="Maximum failed sign-ins" hint="The account locks itself on reaching this. Only a Super Admin can unlock it.">
            {num(sec.maxFailedAttempts, v => set({ maxFailedAttempts: v }), 'attempts')}
          </Row>
          <Row label="Sign-in window" hint="Outside these hours the sign-in is refused, with the window quoted back.">
            <div className="flex items-center gap-2">
              <CommitInput type="time" value={sec.loginFrom} onCommit={v => set({ loginFrom: v })} className="w-28 text-sm" />
              <span className="text-[11px] text-slate-400">to</span>
              <CommitInput type="time" value={sec.loginTo} onCommit={v => set({ loginTo: v })} className="w-28 text-sm" />
            </div>
          </Row>
          <Row
            label="IP restriction"
            unenforced
            hint="A page cannot read its own IP address. Kept because a policy that was agreed is worth writing down; it will not stop anybody."
          >
            <CommitInput value={sec.ipRestriction} onCommit={v => set({ ipRestriction: v })} placeholder="e.g. 203.0.113.0/24" className="w-48 text-sm" />
          </Row>
          <Row
            label="Device restriction"
            unenforced
            hint="A user agent is self-reported, so this records an expectation rather than enforcing one."
          >
            <CommitInput value={sec.deviceRestriction} onCommit={v => set({ deviceRestriction: v })} placeholder="e.g. branch desktops only" className="w-48 text-sm" />
          </Row>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Apply now</h3>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="outline" onClick={() => onAction('resetPassword')} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
            <KeyRound className="w-3.5 h-3.5" /> Force password change
          </Button>
          <Button variant="outline" onClick={() => onAction('forceLogout')} disabled={!admin.activeSession} className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl">
            <LogOut className="w-3.5 h-3.5" /> Force logout all sessions
          </Button>
        </div>
        {SECURITY_UNENFORCEABLE.some(k => sec[k]) && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-3">
            An IP or device restriction is recorded on this account. Neither is enforced by a browser-only
            install — treat them as documentation of the agreed policy, not as a control.
          </p>
        )}
      </div>
    </div>
  )
}

// ── Sessions ─────────────────────────────────────────────────────────────────
function SessionsPane({ admin, onAction }) {
  const history = admin.sessionHistory || []
  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Sessions</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            What this install can see. Ending a session writes it to the account record; the browser holding
            it stands down the next time it reads state — at once in this install, and never for a browser
            closed on another machine, because there is no server here to push to.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => onAction('forceLogout')}
          disabled={!admin.activeSession}
          className="h-auto gap-1.5 px-3 py-2 text-xs font-bold rounded-xl flex-shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" /> Terminate
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {admin.activeSession ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-900/20 px-3.5 py-3">
            <div>
              <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Open now</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Started {admin.activeSession.startedAt} · {admin.activeSession.device}
                {admin.activeSession.remembered ? ' · kept signed in' : ' · ends with the tab'}
              </p>
            </div>
            <span className="text-[10px] font-mono text-emerald-700/70 dark:text-emerald-400/70">{admin.activeSession.id}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">No session open for this account.</p>
        )}

        {history.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 pt-3">Earlier</p>
            {history.map(h => (
              <div key={h.id + h.endedAt} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5">
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {h.startedAt} → {h.endedAt} · {h.device}
                </p>
                <span className="text-[10px] text-slate-400">ended by {h.endedBy}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Activity / audit ─────────────────────────────────────────────────────────
function ActivityPane({ admin }) {
  const { state } = useApp()
  const mine = useMemo(
    () => state.adminAuditLogs.filter(e => e.actor === admin.username || e.object === admin.username || (e.object || '').startsWith(`${admin.username} `)),
    [state.adminAuditLogs, admin.username],
  )
  return (
    <div className={`${card} p-5`}>
      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Activity</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
        Everything this account did, and everything done to it, newest first.
      </p>
      {mine.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center">Nothing recorded for this account yet.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {mine.slice(0, 100).map(e => (
            <li key={e.id} className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5">
              <span className="text-[11px] font-mono text-slate-400 flex-shrink-0 w-36">{e.timestamp}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{e.action}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {e.module}{e.object ? ` · ${e.object}` : ''} · by {e.actor}
                  {e.previousValue || e.newValue ? ` · ${e.previousValue || '—'} → ${e.newValue || '—'}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function AuditPane() {
  const { state } = useApp()
  const broken = useMemo(() => verifyChain(state.adminAuditLogs), [state.adminAuditLogs])
  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Audit log</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Append-only: nothing in this app edits or deletes an entry. Each line carries a checksum over the
            one before it, so a line removed or quietly changed shows up here — that makes the trail
            tamper-<em>evident</em>, not tamper-proof. Anyone who can open developer tools on this machine can
            recompute the chain; there is no key to sign with in a browser nobody trusts.
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex-shrink-0 ${
          broken.length
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
        }`}>
          {broken.length ? `${broken.length} entr${broken.length === 1 ? 'y' : 'ies'} fail the chain` : 'Chain intact'}
        </span>
      </div>

      <StickyHScroll className="mt-4">
        <table className="w-full min-w-[64rem]">
          <thead>
            <tr>
              {['Audit ID', 'Date / time', 'Actor', 'Module', 'Action', 'Object', 'Previous', 'New', 'Device', 'Result'].map((h, i) => (
                <th key={h} className={`${th} ${i === 0 ? 'rounded-tl-xl' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {state.adminAuditLogs.length === 0 ? (
              <tr><td colSpan={10} className="py-10 text-center text-xs text-slate-400">Nothing recorded yet.</td></tr>
            ) : state.adminAuditLogs.slice(0, 300).map(e => (
              <tr key={e.id} className={broken.includes(e.id) ? 'bg-rose-50/60 dark:bg-rose-900/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}>
                <td className={`${td} font-mono whitespace-nowrap`}>{e.id}</td>
                <td className={`${td} whitespace-nowrap`}>{e.timestamp}</td>
                <td className={td}>{e.actor}{e.actorRole ? ` (${e.actorRole})` : ''}</td>
                <td className={td}>{e.module}</td>
                <td className={`${td} font-semibold`}>{e.action}</td>
                <td className={td}>{e.object || '—'}</td>
                <td className={`${td} text-slate-500 max-w-[14rem] truncate`} title={e.previousValue}>{e.previousValue || '—'}</td>
                <td className={`${td} text-slate-500 max-w-[14rem] truncate`} title={e.newValue}>{e.newValue || '—'}</td>
                <td className={`${td} text-slate-500`}>{e.device || '—'}</td>
                <td className={td}>{e.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </StickyHScroll>
      {/* IP is the one audit field this app cannot fill. Said in the table's own words rather
          than left as an empty column the reader would take for "no address recorded". */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
        There is no IP column: a browser cannot see its own address. Device is the most the page can
        honestly say about where an action came from.
      </p>
    </div>
  )
}

// ── Approval Center ──────────────────────────────────────────────────────────
function ApprovalsPane() {
  const { state, dispatch, showToast } = useApp()
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')
  // Same reason as StepUp: local state, so it closes itself on Escape.
  useEffect(() => {
    if (!rejecting) return undefined
    const onKey = e => { if (e.key === 'Escape') setRejecting(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rejecting])

  const pending = state.adminRequests.filter(r => r.status === 'Pending Super Admin Approval')
  const decided = state.adminRequests.filter(r => r.status !== 'Pending Super Admin Approval')

  const approve = req => {
    dispatch({ type: 'APPROVE_ADMIN_REQUEST', id: req.id })
    showToast(`${req.id} approved and applied`, 'success')
  }
  const reject = () => {
    if (!reason.trim()) return
    dispatch({ type: 'REJECT_ADMIN_REQUEST', id: rejecting.id, reason: reason.trim() })
    showToast(`${rejecting.id} rejected`, 'info')
    setRejecting(null)
    setReason('')
  }

  const Row = ({ req, children }) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{describeRequest(req)}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {req.id} · {req.kind.replace(/_/g, ' ').toLowerCase()} · requested by {req.requestedBy} ({req.requestedByRole}) at {req.requestedAt}
          </p>
          {req.reason && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">Reason: {req.reason}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Approval Center</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
          The Admin cannot change who holds what on its own authority. Those attempts arrive here as
          requests — <span className="font-semibold">Draft → Submitted → Pending Super Admin Approval → Approved → Applied</span> —
          and take effect the moment you approve one, with no sign-out needed. Everything else the Admin
          does in the loan book stays immediate; this queue is only in front of authority.
        </p>

        <div className="mt-4 space-y-2">
          {pending.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center">Nothing waiting on you.</p>
          ) : pending.map(req => (
            <Row key={req.id} req={req}>
              <Button onClick={() => approve(req)} className="h-auto px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700">
                Approve
              </Button>
              <Button variant="outline" onClick={() => { setRejecting(req); setReason('') }} className="h-auto px-3 py-1.5 text-xs font-bold rounded-xl">
                Reject
              </Button>
            </Row>
          ))}
        </div>
      </div>

      {decided.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Decided</h3>
          <div className="mt-3 space-y-2">
            {decided.slice(0, 30).map(req => (
              <Row key={req.id} req={req}>
                <StatusBadge status={req.status === 'Applied' ? 'Approved' : 'Rejected'} size="xs" />
              </Row>
            ))}
          </div>
        </div>
      )}

      {/* Rejecting demands a reason: "no" without one is not a decision the maker can act on. */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" role="dialog" aria-modal="true">
          <div className={`${card} w-full max-w-sm p-6 shadow-xl`}>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Reject {rejecting.id}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{describeRequest(rejecting)}</p>
            <Input
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why it is refused"
              className="mt-4 text-sm"
            />
            <div className="flex items-center gap-2 mt-5">
              <Button onClick={reject} disabled={!reason.trim()} className="flex-1 h-auto py-2.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60">
                Reject with reason
              </Button>
              <Button variant="outline" onClick={() => setRejecting(null)} className="flex-1 h-auto py-2.5 text-xs font-bold rounded-xl">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── The console ──────────────────────────────────────────────────────────────
export default function AdminControlPage() {
  const { state, dispatch, showToast } = useApp()
  const [stepUp, setStepUp] = useState(null)

  // Every account this console governs: the Admins and anything below them. A Super Admin is not
  // in the list — rule 2 cuts both ways, and an install with two of them does not make one the
  // other's subject.
  // Admins only. The operator governs the business owner's account; the staff accounts below it are
  // that Admin's own to manage, in the business app's Settings → User Accounts. Listing them here
  // would put the operator inside somebody else's org chart, and would make "Customers" mean two
  // different things on one screen.
  const governed = state.systemUsers.filter(u => u.role === ADMIN_ROLE)
  const supers = state.systemUsers.filter(isSuperAdmin)
  const admins = governed
  // In the order the accounts were opened.
  const ordered = governed
  const selected = state.adminControlUser
    ? governed.find(u => u.username === state.adminControlUser)
    : (admins[0] || governed[0])
  const pane = state.adminControlTab || 'overview'

  // The consequential actions, each with the sentence the step-up shows and the dispatch it
  // commits. Kept in one place so a new one cannot be added without saying what it does.
  //
  // Built for a named account rather than for whichever one is selected: the dashboard acts on the
  // row you clicked, and a step-up dialog that confirmed one account while locking another would
  // be the worst possible bug in this file.
  const actionsFor = u => ({
    lock: {
      say: `Lock ${u?.fullName || u?.username || ''} out. The account cannot sign in until you unlock it.`,
      run: () => dispatch({ type: 'SET_USER_STATUS', username: u.username, status: 'Locked', reason: 'Locked by Super Admin' }),
      toast: `${u?.fullName || u?.username} locked`,
    },
    unlock: {
      say: `Unlock ${u?.fullName || u?.username || ''} and allow sign-in again.`,
      run: () => dispatch({ type: 'SET_USER_STATUS', username: u.username, status: 'Active' }),
      toast: `${u?.fullName || u?.username} unlocked`,
    },
    suspend: {
      say: `Suspend ${u?.fullName || u?.username || ''}. Access stops now; the account, its history and its audit trail are kept.`,
      run: () => dispatch({ type: 'SET_USER_STATUS', username: u.username, status: 'Suspended', reason: 'Suspended by Super Admin', until: '' }),
      toast: 'Access suspended',
    },
    deactivate: {
      say: `Deactivate ${u?.fullName || u?.username || ''}. The account is disabled and any open session ends.`,
      run: () => dispatch({ type: 'SET_USER_STATUS', username: u.username, status: 'Inactive', reason: 'Deactivated by Super Admin' }),
      toast: 'Account deactivated',
    },
    activate: {
      say: `Activate ${u?.fullName || u?.username || ''} as ${u?.role || u?.requestedRole || 'its assigned role'}.`,
      run: () => dispatch({ type: 'SET_USER_STATUS', username: u.username, status: 'Active' }),
      toast: 'Account activated',
    },
    forceLogout: {
      say: `End every session recorded for ${u?.fullName || u?.username || ''}. Their browser signs out the next time it reads state.`,
      run: () => dispatch({ type: 'FORCE_LOGOUT_USER', username: u.username }),
      toast: 'Sessions terminated',
    },
    resetPassword: {
      say: `Clear the password on ${u?.fullName || u?.username || ''}. They choose a new one at the next sign-in; you never see it.`,
      run: () => dispatch({ type: 'SET_USER_PASSWORD', username: u.username, salt: '', hash: '' }),
      toast: 'Password cleared — a new one is chosen at next sign-in',
    },
  })

  // The panes that govern one account leave the target out and mean the selected one; the
  // dashboard passes the row it was clicked on.
  const onAction = (key, target = selected) => setStepUp({ key, user: target })
  const commit = () => {
    const act = stepUp && actionsFor(stepUp.user)[stepUp.key]
    setStepUp(null)
    if (!act) return
    act.run()
    showToast(act.toast, 'success')
  }
  const onManage = username => dispatch({ type: 'SET_ADMIN_CONTROL_USER', username, tab: 'profile' })

  const onAccountPane = !FLEET_PANES.includes(pane)
  const paneLabel = PANES.find(p => p.id === pane)?.label || 'Customers'

  // Only the panes that govern one account need one. The audit log and the approval queue belong to
  // the install, and a fresh install with no Admin yet still has both — plus a dashboard whose job
  // is precisely to say that nothing is provisioned.
  if (!selected && onAccountPane) {
    return (
      <div className="p-4 sm:p-6">
        <div className={`${card} p-10 text-center`}>
          <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-3">No customer provisioned yet</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
            This install has no Admin account to govern. Add the business owner's Admin under
            Settings → User Accounts, then name their business under Access Scope — it will appear here
            with everything you can govern about it.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {onAccountPane ? (
            <>
              {/* Which business you are standing in, and the way out of it. Without this a Super
                  Admin governing three Admins has no reminder on screen of whose permissions are
                  about to change. */}
              {/* Back to the list this account was opened from, not to the dashboard. */}
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_ADMIN_CONTROL_TAB', tab: 'customers' })}
                className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> All customers
              </button>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">
                {selected.fullName || selected.username}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span className="font-mono">{selected.username}</span> · {selected.role || 'no role'}
                {' · '}
                {selected.scope?.organization || state.companyProfile.name}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{paneLabel}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Super Admin governance over the accounts below this level. {governed.length} account{governed.length === 1 ? '' : 's'},
                {' '}{admins.length} Admin{admins.length === 1 ? '' : 's'}.
              </p>
            </>
          )}
        </div>
        {/* Which account is being governed. Hidden on the dashboard, which is about all of them —
            a selector there would suggest the page below it only showed one. */}
        <label className={`text-xs font-semibold text-slate-500 dark:text-slate-400 ${onAccountPane ? '' : 'hidden'}`}>
          Customer
          <select
            value={selected?.username || ''}
            onChange={e => dispatch({ type: 'SET_ADMIN_CONTROL_USER', username: e.target.value, tab: pane })}
            className="ml-2 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
          >
            {governed.map(u => (
              <option key={u.username} value={u.username}>
                {u.fullName || u.username} — {u.role || 'no role'}{u.status !== 'Active' ? ` (${u.status})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Only the panes that govern the selected account — Dashboard, Approval Center and Audit
          Logs are the shell's nav, and repeating them here would be two menus for one thing. */}
      {/* A segmented control rather than a row of buttons: these are six views of one account, not
          six actions, and a row of equally solid buttons reads as the latter. Each names its account
          as it opens, so the URL says which business is on screen and a refresh comes back to it. */}
      <div className={`${onAccountPane ? 'flex' : 'hidden'} flex-wrap gap-0.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 w-fit`}>
        {PANES.filter(p => !FLEET_PANES.includes(p.id)).map(p => (
          <button
            key={p.id}
            type="button"
            aria-pressed={pane === p.id}
            onClick={() => dispatch({ type: 'SET_ADMIN_CONTROL_USER', username: selected?.username || null, tab: p.id })}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors ${
              pane === p.id
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <p.icon className="w-3.5 h-3.5" />
            {p.label}
          </button>
        ))}
      </div>

      {pane === 'overview'    && <OverviewPane accounts={ordered} supers={supers} onManage={onManage} onAction={onAction} />}
      {pane === 'customers'   && <CustomersPane accounts={ordered} onManage={onManage} onAction={onAction} />}
      {pane === 'profile'     && <ProfilePane admin={selected} onAction={onAction} />}
      {pane === 'permissions' && <PermissionsPane admin={selected} />}
      {pane === 'scope'       && <ScopePane admin={selected} />}
      {pane === 'security'    && <SecurityPane admin={selected} onAction={onAction} />}
      {pane === 'sessions'    && <SessionsPane admin={selected} onAction={onAction} />}
      {pane === 'activity'    && <ActivityPane admin={selected} />}
      {pane === 'approvals'   && <ApprovalsPane />}
      {pane === 'audit'       && <AuditPane />}

      {stepUp && (
        <StepUp
          action={actionsFor(stepUp.user)[stepUp.key]?.say || ''}
          onCancel={() => setStepUp(null)}
          onConfirm={commit}
        />
      )}
    </div>
  )
}
