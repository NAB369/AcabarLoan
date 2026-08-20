// ── Super Admin → Admin → users ──────────────────────────────────────────────
// One level above Admin, and only one. Everything here exists to make that level mean something
// concrete rather than a label on a badge: which permissions an account actually holds, where it
// may work, what its sign-in must satisfy, and which of its actions it may not apply on its own.
//
// WHAT A BROWSER CANNOT DO, stated once here rather than implied by a switch that lies:
//   · There is no server, so a policy is only ever checked by the copy of the app doing the
//     checking. A determined Admin with developer tools on their own machine can edit the stored
//     record. This is governance and an audit trail, not a security boundary against that person.
//   · IP and device restriction are therefore RECORDED, NOT ENFORCED — a page cannot see its own
//     IP, and a user agent is self-reported. They are kept because a policy someone agreed to is
//     worth writing down, and shown as unenforced wherever they appear.
//   · "Terminate session" reaches the account record, not another machine. The signed-in browser
//     honours it the next time it reads state, which is immediate in this install and never for
//     a browser that is closed somewhere else.

// The operator's name. Both the value a fresh install starts with and the fallback if it is ever
// cleared — a console with no name in its own chrome is worse than one that reads the default.
export const PLATFORM_NAME_DEFAULT = 'WeLoan365'

export const SUPER_ADMIN_ROLE = 'Super Admin'
export const ADMIN_ROLE = 'Admin'

export const isSuperAdmin = user => user?.role === SUPER_ADMIN_ROLE
export const isAdmin = user => user?.role === ADMIN_ROLE

// ── The permission grid ──────────────────────────────────────────────────────
// The spec's module × action table, with each cell naming the permission key the app really
// checks. A cell is `null` where this app has no such capability — rendered as "—" rather than as
// a toggle that would change nothing, because a switch that does not switch anything is worse
// than an empty cell: it reads as a control that has been granted.
export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export']

export const PERMISSION_MODULES = [
  {
    id: 'users', label: 'Users',
    cells: { view: 'view_users', create: 'create_user', edit: 'edit_user', delete: null, approve: 'activate_user', export: null },
  },
  {
    id: 'customers', label: 'Customers',
    cells: { view: 'view_customers', create: 'add_customer', edit: 'edit_customer', delete: 'delete_customer', approve: null, export: 'export_customers' },
  },
  {
    id: 'transactions', label: 'Transactions',
    cells: { view: 'view_loans', create: 'open_loan', edit: 'request_restructure', delete: 'write_off', approve: 'review_loan', export: 'export_loans' },
  },
  {
    id: 'accounting', label: 'Accounting',
    cells: { view: 'view_accounting', create: 'manage_accounting', edit: null, delete: null, approve: 'disburse_loan', export: null },
  },
  {
    id: 'reports', label: 'Reports',
    cells: { view: 'view_reports', create: null, edit: null, delete: null, approve: null, export: 'export_reports' },
  },
  {
    id: 'settings', label: 'Settings',
    cells: { view: 'view_settings', create: null, edit: 'manage_settings', delete: null, approve: 'run_operations', export: null },
  },
]

// Governing the Admin is not a togglable module permission — it is the level itself. Kept out of
// the grid so it cannot be handed down by a Super Admin ticking a box, and guarded in the reducer
// so nobody below that level can grant it at all.
export const GOVERN_PERMISSION = 'govern_admins'

// Which sidebar module each tab needs. A tab nobody may open is not drawn, and is refused by
// SET_TAB as well — a pasted URL must not get further than the menu would.
export const TAB_PERMISSION = {
  dashboard: null,
  customers: 'view_customers',
  'open-loan': 'view_loans',
  reminders: 'view_loans',
  accounting: 'view_accounting',
  reports: 'view_reports',
  'admin-control': GOVERN_PERMISSION,
}

// ── Effective permissions ────────────────────────────────────────────────────
// The role grants, then the account's own overrides adjust. Two lists rather than one copy of the
// matrix per account: an override says what was deliberately done to THIS account, so a later
// change to the role still reaches it, and the Admin Control grid can show which cells are the
// role's doing and which are the Super Admin's.
export const emptyOverrides = () => ({ granted: [], revoked: [] })

export function effectivePermission(user, roleMatrix, perm) {
  if (!perm) return false
  const o = user?.permissionOverrides || emptyOverrides()
  if (o.revoked?.includes(perm)) return false
  if (o.granted?.includes(perm)) return true
  return !!roleMatrix?.[user?.role]?.[perm]
}

// What a toggle in the grid has to write. Expressed as the next override lists rather than as a
// mutation, so the reducer stays a pure copy and the same function can be used to preview.
export function withPermission(overrides, perm, on, roleGrants) {
  const granted = new Set(overrides?.granted || [])
  const revoked = new Set(overrides?.revoked || [])
  const byRole = !!roleGrants?.[perm]
  granted.delete(perm)
  revoked.delete(perm)
  if (on && !byRole) granted.add(perm)
  if (!on && byRole) revoked.add(perm)
  return { granted: [...granted], revoked: [...revoked] }
}

// ── Access scope ─────────────────────────────────────────────────────────────
// Where an account may work. Empty list = unrestricted on that dimension, which is what every
// account carries until a Super Admin narrows it — a scope that defaulted to "nothing" would lock
// an install out of its own data on the first load after this shipped.
export const emptyScope = () => ({ organization: '', branches: [], products: [], departments: [] })

export const DEPARTMENTS = ['Finance', 'Operation', 'Credit', 'IT', 'HR']

// Loans carry a branch and a product, which is what makes this enforceable rather than
// decorative: the register, the reports and the approval screens all read the same list.
export function inScope(scope, record) {
  if (!scope) return true
  const okBranch = !scope.branches?.length || !record?.branch || scope.branches.includes(record.branch)
  const okProduct = !scope.products?.length || !record?.product || scope.products.includes(record.product)
  return okBranch && okProduct
}

export function scopeSummary(scope) {
  if (!scope) return 'Unrestricted'
  const parts = []
  if (scope.branches?.length) parts.push(`${scope.branches.length} branch${scope.branches.length === 1 ? '' : 'es'}`)
  if (scope.products?.length) parts.push(`${scope.products.length} product${scope.products.length === 1 ? '' : 's'}`)
  if (scope.departments?.length) parts.push(`${scope.departments.length} department${scope.departments.length === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'Unrestricted'
}

// ── Security policy ──────────────────────────────────────────────────────────
// Per account, because that is the level the Super Admin governs. Defaults are deliberately
// permissive: this arrives on top of installs that have been running without any of it, and a
// policy that locked everyone out on upgrade would be a worse failure than no policy.
export const defaultSecurity = () => ({
  mfaRequired: false,
  passwordExpiryDays: 0,      // 0 = never
  sessionTimeoutMinutes: 0,   // 0 = only the idle screen lock applies
  maxFailedAttempts: 5,       // 0 = never lock
  loginFrom: '',              // 'HH:MM' — empty = any time
  loginTo: '',
  ipRestriction: '',          // recorded, never enforced — see the header of this file
  deviceRestriction: '',      // recorded, never enforced
})

export const SECURITY_UNENFORCEABLE = ['ipRestriction', 'deviceRestriction']

const HHMM = t => {
  const [h, m] = String(t || '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (m || 0) : null
}

const daysSince = stamp => {
  const then = stamp ? new Date(stamp).getTime() : NaN
  return Number.isFinite(then) ? (Date.now() - then) / 86400000 : null
}

// Why this account may not open a session right now, in the words the operator needs, or '' when
// it may. One place, so the sign-in screen and the reducer cannot disagree about it — the screen
// explains and the reducer refuses.
export function signInBlock(user, now = new Date()) {
  if (!user) return 'no-account'
  if (user.status === 'Locked') return 'This account is locked. A Super Admin has to unlock it.'
  if (user.status === 'Suspended') {
    return user.suspendedUntil
      ? `Access is suspended until ${user.suspendedUntil}.`
      : 'Access to this account is suspended.'
  }
  if (user.status === 'Pending') return 'This account is still waiting on an Admin to activate it.'
  if (user.status !== 'Active') return 'That email and password do not match an active account'

  const sec = { ...defaultSecurity(), ...(user.security || {}) }
  const from = HHMM(sec.loginFrom)
  const to = HHMM(sec.loginTo)
  if (from !== null && to !== null && from !== to) {
    const mins = now.getHours() * 60 + now.getMinutes()
    const inside = from < to ? (mins >= from && mins <= to) : (mins >= from || mins <= to)
    if (!inside) return `Sign-in for this account is allowed between ${sec.loginFrom} and ${sec.loginTo}.`
  }
  return ''
}

// Separate from signInBlock because it is not a refusal: the password is accepted and then has to
// be replaced before anything else happens.
export function mustChangePassword(user) {
  if (!user) return false
  if (user.forcePasswordChange) return true
  const sec = { ...defaultSecurity(), ...(user.security || {}) }
  if (!sec.passwordExpiryDays) return false
  const age = daysSince(user.passwordSetAt)
  return age !== null && age > sec.passwordExpiryDays
}

// ── The audit chain ──────────────────────────────────────────────────────────
// Append-only, with each entry carrying a checksum over the entry before it. Called what it is: a
// CHECKSUM, not a signature. Anyone who can edit the store can recompute the chain, so this
// detects casual tampering — a line deleted, a value quietly changed — and proves nothing against
// someone who set out to forge it. There is no key to sign with in a browser nobody trusts.
//
// Synchronous on purpose: it is computed inside the reducer, where an async hash cannot be
// awaited, and every entry must be chained at the moment it is written or the chain has a hole.
function checksum(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const chainBody = e => JSON.stringify([
  e.id, e.timestamp, e.actor, e.actorRole, e.module, e.action, e.object,
  e.previousValue, e.newValue, e.device, e.result,
])

export function chainEntry(entry, previous) {
  const prevHash = previous?.hash || '00000000'
  return { ...entry, prevHash, hash: checksum(prevHash + chainBody(entry)) }
}

// Verifies newest-first storage order. Returns the ids that no longer agree with the chain, so
// the Audit Log can mark them rather than merely claiming everything is fine.
export function verifyChain(entries = []) {
  const oldestFirst = [...entries].reverse()
  const broken = []
  let prev = null
  for (const e of oldestFirst) {
    // The oldest entry retained has its own prevHash taken as given: the trail is trimmed at a
    // cap (see withAudit), so the entry it was chained onto may legitimately no longer be here.
    // Verifying against a missing predecessor would report every install that has ever trimmed
    // as tampered with, which is the fastest way to make a tamper check ignored.
    const expected = chainEntry({ ...e, hash: undefined, prevHash: undefined }, prev || { hash: e.prevHash })
    if (expected.hash !== e.hash || expected.prevHash !== e.prevHash) broken.push(e.id)
    prev = e
  }
  return broken
}

// The most a page can honestly say about the machine it is running on.
export const deviceLabel = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Android/i.test(ua)) return 'Android browser'
  if (/iPhone|iPad/i.test(ua)) return 'iOS browser'
  if (/Edg\//.test(ua)) return 'Edge (desktop)'
  if (/Chrome\//.test(ua)) return 'Chrome (desktop)'
  if (/Firefox\//.test(ua)) return 'Firefox (desktop)'
  if (/Safari\//.test(ua)) return 'Safari (desktop)'
  return 'Unknown browser'
}

// ── Maker → checker ──────────────────────────────────────────────────────────
// The Admin actions that could raise the Admin's own authority. These are filed as requests when
// an Admin performs them and applied only once a Super Admin approves — which is the whole of
// rule 3 ("Admin cannot grant itself permissions") expressed as a workflow rather than a wish.
// Everything else the Admin does stays instant: this is governance over authority, not a queue in
// front of the loan book.
export const REQUEST_KINDS = {
  ROLE_PERMISSION: 'Change role permission',
  USER_ROLE: 'Change user role',
  USER_STATUS: 'Change user status',
  USER_PASSWORD_RESET: 'Reset user password',
  ROLE_CREATE: 'Create role',
}

export function describeRequest(req) {
  if (!req) return ''
  switch (req.kind) {
    case 'ROLE_PERMISSION':
      return `${req.payload.on ? 'Grant' : 'Revoke'} "${req.payload.permission}" for ${req.payload.role}`
    case 'USER_ROLE':
      return `${req.payload.username}: ${req.payload.from || '—'} → ${req.payload.to}`
    case 'USER_STATUS':
      return `${req.payload.username}: ${req.payload.from || '—'} → ${req.payload.to}`
    case 'USER_PASSWORD_RESET':
      return `Clear the password on ${req.payload.username}`
    case 'ROLE_CREATE':
      return `New role "${req.payload.role}"`
    default:
      return req.kind
  }
}
