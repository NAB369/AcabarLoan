import { useRef, useState } from 'react'
import {
  X, Users, ChevronRight, ChevronDown, Building2, Link as LinkIcon,
  ToggleLeft, ToggleRight, Edit2, Check, Upload, Trash2, MoreVertical,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { companyLogoSrc } from '../../utils/companyLogo'
import IntegrationPage from '../integration/IntegrationPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

const Th = ({ children }) => (
  <th className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700/50 text-left first:rounded-tl-xl last:rounded-tr-xl">
    {children}
  </th>
)

// ─── Sidebar ─────────────────────────────────────────────────────────────────
const SETTINGS_USER_MGMT_SUBS = [
  { id: 'user-accounts',   label: 'User Accounts' },
  { id: 'roles',           label: 'Roles & Permissions' },
  { id: 'access-control',  label: 'Access Control' },
  { id: 'password',        label: 'Password & Security' },
]
// Which panels belong to the User Management group — the sidebar highlights the group and
// the header shows its breadcrumb for these. Read off the list above rather than repeated,
// so adding or dropping a sub-menu is a one-line change.
const USER_MGMT_PANELS = SETTINGS_USER_MGMT_SUBS.map(s => s.id)
const SETTINGS_MAIN_MENUS = [
  { id: 'company-profile', label: 'Company Profile',  icon: Building2 },
  { id: 'integration',     label: 'Integration',      icon: LinkIcon },
]

function Sidebar({ active, userMgmtOpen, onMenu, onUserSub, onToggleUserMgmt }) {
  const subs = SETTINGS_USER_MGMT_SUBS
  const mainMenus = SETTINGS_MAIN_MENUS

  const isUserMgmtActive = USER_MGMT_PANELS.includes(active)

  return (
    <div className="hidden md:flex w-56 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 flex-col overflow-y-auto bg-slate-50 dark:bg-slate-900">
      {/* Header row height mirrors the content top bar (py-4 + 32px close button + 1px border) */}
      <div className="px-4 h-[65px] flex items-center flex-shrink-0">
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Settings</p>
      </div>
      {/* pt-[18px] puts the first menu row's text on the same line as the panel heading */}
      <nav className="px-2 pb-2 pt-[18px] space-y-0.5 flex-1">
        {/* User Management group */}
        <Button
          variant="ghost"
          onClick={onToggleUserMgmt}
          className={`h-auto w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold ${
            isUserMgmtActive
              ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/30'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            User Management
          </div>
          {userMgmtOpen
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />
          }
        </Button>
        {userMgmtOpen && (
          <div className="ml-5 pl-3 border-l border-slate-200 dark:border-slate-600 space-y-0.5">
            {subs.map(s => (
              <Button
                key={s.id}
                variant="ghost"
                onClick={() => onUserSub(s.id)}
                className={`h-auto w-full justify-start px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-transparent ${
                  active === s.id
                    ? 'text-brand-600 dark:text-brand-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {s.label}
              </Button>
            ))}
          </div>
        )}

        {/* Main menus */}
        {mainMenus.map(m => (
          <Button
            key={m.id}
            variant="ghost"
            onClick={() => onMenu(m.id)}
            className={`h-auto w-full justify-start gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
              active === m.id
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/30'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <m.icon className="w-4 h-4" />
            {m.label}
          </Button>
        ))}
      </nav>
    </div>
  )
}

// ─── Panels ──────────────────────────────────────────────────────────────────

// Stands in for the username of the row being added, which has none until it is typed.
// A real username can't collide with it: the field trims and this one couldn't be typed
// as a sensible account name anyway.
const NEW_USER_ROW = '__new__'

// Editing happens in the row itself rather than in a dialog over it — the fields sit under
// the headers that name them, and the rest of the register stays readable while one row is
// being changed. Adding is the same row in the same place, at the top of the table with an
// empty username to fill in, so both actions work one way instead of two.
function UserAccountsPanel({ users, roleMatrix, dispatch, showToast }) {
  // Which row is open: a username, NEW_USER_ROW for the one being added, or null. One at a
  // time — two open rows means two Save buttons and no telling which one wins.
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ username: '', fullName: '', role: '', branch: '' })
  const roles = Object.keys(roleMatrix)
  const adding = editing === NEW_USER_ROW

  // Sized to the cell rather than the column: a full-width input in every cell stretches
  // the table past its container on narrow screens.
  const cellInput = 'w-full min-w-[7rem] px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function startEdit(u) {
    setEditing(u.username)
    setForm({ username: u.username, fullName: u.fullName || u.name || '', role: u.role || roles[0] || '', branch: u.branch || '' })
  }

  function startAdd() {
    setEditing(NEW_USER_ROW)
    setForm({ username: '', fullName: '', role: roles[0] || '', branch: '' })
  }

  function handleSave() {
    const username = form.username.trim()
    const fullName = form.fullName.trim()
    if (adding && !username) { showToast('Enter a username', 'error'); return }
    if (!fullName) { showToast('Enter a full name', 'error'); return }
    // Compared case-insensitively — two accounts differing only in case are the same account
    // to anyone signing in with one of them.
    if (adding && users.some(u => (u.username || '').toLowerCase() === username.toLowerCase())) {
      showToast(`Username "${username}" is already taken`, 'error')
      return
    }
    if (adding) {
      // Only what this panel collects. The seeded accounts also carry a department and a
      // status, but nothing reads either any more, so a new account doesn't invent values
      // for them. Last Login stays empty until the account is actually used.
      dispatch({
        type: 'ADD_SYSTEM_USER',
        user: { username, fullName, role: form.role, branch: form.branch.trim(), lastLogin: '' },
      })
      showToast(`User "${username}" added`, 'success')
    } else {
      dispatch({
        type: 'UPDATE_SYSTEM_USER',
        username: editing,
        updates: { fullName, role: form.role, branch: form.branch.trim() },
      })
      showToast('User account updated', 'success')
    }
    setEditing(null)
  }

  // Enter saves and Escape backs out from anywhere in the row, so a one-field change
  // doesn't need the mouse.
  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    else if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
  }

  // The row being added is drawn first, above the accounts that already exist.
  const rows = adding ? [{ username: NEW_USER_ROW }, ...users] : users

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">User Accounts</h2>
        {/* Add is disabled while a row is open rather than replacing it — an edit in progress
            is not thrown away by starting something else. */}
        <Button
          onClick={adding ? () => setEditing(null) : startAdd}
          disabled={!!editing && !adding}
          className={`h-auto flex-shrink-0 px-3 py-1.5 text-xs font-bold rounded-xl ${
            editing && !adding ? 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'
          }`}
        >
          {adding ? 'Cancel' : '+ Add User'}
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Username</Th>
              <Th>Full Name</Th>
              <Th>Role</Th>
              <Th>Branch</Th>
              <Th>Last Login</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">No users yet — add one to get started.</td></tr>
            ) : rows.map(u => {
              const isNew = u.username === NEW_USER_ROW
              const open = editing === u.username
              return (
                <tr key={u.username} className={open ? 'bg-brand-50/40 dark:bg-brand-900/10' : 'hover:bg-slate-50 dark:hover:bg-white/5 transition-colors'}>
                  {/* The username keys the record, so an existing one is shown rather than
                      edited — renaming it would orphan whatever it was signed in as. Only the
                      row being added asks for one. */}
                  <td className="px-4 py-3 text-xs font-mono font-bold text-brand-600">
                    {isNew ? (
                      <Input
                        autoFocus
                        value={form.username}
                        onChange={e => set('username', e.target.value.replace(/\s/g, ''))}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g. sokha"
                        className={`${cellInput} font-mono`}
                      />
                    ) : u.username}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                    {open ? (
                      <Input
                        autoFocus={!isNew}
                        value={form.fullName}
                        onChange={e => set('fullName', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Full name"
                        className={cellInput}
                      />
                    ) : (u.fullName || u.name || '—')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {open ? (
                      <select
                        value={form.role}
                        onChange={e => set('role', e.target.value)}
                        onKeyDown={handleKeyDown}
                        className={cellInput}
                      >
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : u.role}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {open ? (
                      <Input
                        value={form.branch}
                        onChange={e => set('branch', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Branch"
                        className={cellInput}
                      />
                    ) : (u.branch || '—')}
                  </td>
                  {/* Not editable either way — it is stamped by signing in, not set by hand */}
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{u.lastLogin || '—'}</td>
                  <td className="px-4 py-3">
                    {open ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handleSave}
                          title={isNew ? 'Add user account' : 'Save changes'}
                          className="h-auto w-auto p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(null)}
                          title="Discard changes"
                          className="h-auto w-auto p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEdit(u)}
                        disabled={!!editing}
                        title={editing ? 'Finish the open row first' : 'Edit user account'}
                        className={`h-auto w-auto p-1 rounded-lg ${
                          editing ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' : 'text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30'
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

// Row of a role column's preset menu on the permission matrix
const PresetItem = ({ onClick, children }) => (
  <DropdownMenuItem
    onSelect={onClick}
    className="px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 focus:bg-slate-50 dark:focus:bg-white/5 focus:text-slate-600 dark:focus:text-slate-300 truncate cursor-pointer"
  >
    {children}
  </DropdownMenuItem>
)

// Which module each permission belongs to. A permission added at runtime has no group of
// its own, so it falls to "Other" rather than disappearing from the matrix.
const PERMISSION_GROUPS = [
  { label: 'Customers',  keys: ['add_customer'] },
  { label: 'Loans',      keys: ['open_loan', 'review_loan', 'disburse_loan', 'write_off'] },
  { label: 'Accounting', keys: ['manage_accounting', 'view_accounting'] },
  { label: 'Operations', keys: ['run_operations'] },
]

// A permission that only reads is one the "Read-only" preset leaves on — decided on the
// key rather than a hand-kept list, so a new "view_*" permission is covered by it too.
const isReadOnlyPerm = (key, label) => /^view_/.test(key) || /^view\b/i.test(label)

function groupedPermissions(permissionLabels) {
  const keys = Object.keys(permissionLabels)
  const grouped = PERMISSION_GROUPS
    .map(g => ({ label: g.label, keys: g.keys.filter(k => keys.includes(k)) }))
    .filter(g => g.keys.length)
  const placed = new Set(grouped.flatMap(g => g.keys))
  const rest = keys.filter(k => !placed.has(k))
  return rest.length ? [...grouped, { label: 'Other', keys: rest }] : grouped
}

function RolesPanel({ roleMatrix, permissionLabels, selectedRole, users, dispatch, showToast }) {
  const [newRole, setNewRole] = useState('')
  const [newPermLabel, setNewPermLabel] = useState('')
  // Which add field is showing: null | 'role' | 'permission'
  const [adding, setAdding] = useState(null)
  const [presetFor, setPresetFor] = useState(null)
  const roles = Object.keys(roleMatrix)
  const permKeys = Object.keys(permissionLabels)
  const groups = groupedPermissions(permissionLabels)

  function applyPreset(role, kind) {
    const permissions =
      kind === 'full' ? Object.fromEntries(permKeys.map(k => [k, true]))
      : kind === 'none' ? {}
      : kind === 'read' ? Object.fromEntries(permKeys.map(k => [k, isReadOnlyPerm(k, permissionLabels[k])]))
      : { ...roleMatrix[kind] } // copy another role's column
    dispatch({ type: 'SET_ROLE_PERMISSIONS', role, permissions })
    showToast(
      kind === 'full' ? `${role}: all permissions granted`
      : kind === 'none' ? `${role}: all permissions revoked`
      : kind === 'read' ? `${role}: read-only access`
      : `${role} now matches ${kind}`,
      'success'
    )
    setPresetFor(null)
  }

  function handleAddRole() {
    const role = newRole.trim()
    if (!role) return
    if (roleMatrix[role]) {
      showToast('That role already exists', 'error')
      return
    }
    dispatch({ type: 'ADD_ROLE', role })
    showToast(`Role "${role}" added`, 'success')
    setNewRole('')
    setAdding(null)
  }

  function handleAddPermission() {
    const label = newPermLabel.trim()
    if (!label) return
    const key = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!key || permissionLabels[key]) {
      showToast('That permission already exists', 'error')
      return
    }
    dispatch({ type: 'ADD_PERMISSION', key, label })
    showToast(`Permission "${label}" added`, 'success')
    setNewPermLabel('')
    setAdding(null)
  }

  const addFieldCls = 'flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-brand-500 transition'

  return (
    <div>
      {/* Adding a role adds a column, adding a permission adds a row — the field for each
          stays out of the way until its button is clicked. */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Roles &amp; Permissions</h2>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            onClick={() => setAdding(a => a === 'role' ? null : 'role')}
            className="h-auto px-3 py-1.5 text-xs font-bold rounded-xl bg-brand-600 hover:bg-brand-700"
          >
            {adding === 'role' ? 'Cancel' : '+ Add Role'}
          </Button>
          <Button
            variant="outline"
            onClick={() => setAdding(a => a === 'permission' ? null : 'permission')}
            className="h-auto px-3 py-1.5 text-xs font-bold rounded-xl border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {adding === 'permission' ? 'Cancel' : '+ Add Permission'}
          </Button>
        </div>
      </div>

      {adding && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-4">
          <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            {adding === 'role' ? 'Role Name' : 'Permission Name'}
          </Label>
          <div className="flex items-center gap-2">
            {adding === 'role' ? (
              <Input
                autoFocus
                type="text"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddRole()}
                placeholder="e.g. Branch Manager"
                className={addFieldCls}
              />
            ) : (
              <Input
                autoFocus
                type="text"
                value={newPermLabel}
                onChange={e => setNewPermLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddPermission()}
                placeholder="e.g. Export Reports"
                className={addFieldCls}
              />
            )}
            <Button
              onClick={adding === 'role' ? handleAddRole : handleAddPermission}
              className="h-auto px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-xs font-bold flex-shrink-0"
            >
              {adding === 'role' ? 'Add Role' : 'Add Permission'}
            </Button>
          </div>
        </div>
      )}

      {/* Permission matrix — every role and permission in one scroller. The permission column,
          the role headings and the summary rows all stay put while it scrolls. */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-auto max-h-[55vh]">
          <table className="w-full">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide bg-slate-50 dark:bg-slate-700">
                  Permission
                </th>
                {roles.map(role => {
                  const on = selectedRole === role
                  return (
                    <th key={role} className="sticky top-0 z-20 px-3 py-2 bg-slate-50 dark:bg-slate-700">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          onClick={() => dispatch({ type: 'SET_SELECTED_ROLE', role })}
                          title={`Highlight ${role}`}
                          className={`h-auto w-auto p-0 text-xs font-semibold uppercase tracking-wide whitespace-nowrap hover:bg-transparent ${
                            on
                              ? 'text-brand-700 dark:text-brand-300'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          {role}
                        </Button>
                        <DropdownMenu open={presetFor === role} onOpenChange={open => setPresetFor(open ? role : null)}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Set all permissions for ${role}`}
                              className="h-auto w-auto p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-600"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 rounded-2xl p-1.5 text-left normal-case">
                            <PresetItem onClick={() => applyPreset(role, 'full')}>Grant all</PresetItem>
                            <PresetItem onClick={() => applyPreset(role, 'read')}>Read-only</PresetItem>
                            <PresetItem onClick={() => applyPreset(role, 'none')}>Revoke all</PresetItem>
                            {roles.filter(r => r !== role).length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                  Copy from
                                </DropdownMenuLabel>
                                {roles.filter(r => r !== role).map(other => (
                                  <PresetItem key={other} onClick={() => applyPreset(role, other)}>{other}</PresetItem>
                                ))}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* One body per module, so its heading row travels with its permissions */}
            {groups.map(group => (
              <tbody key={group.label} className="divide-y divide-slate-100 dark:divide-slate-700">
                <tr>
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700/40 border-y border-slate-200 dark:border-slate-700"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.keys.map(key => (
                  <tr key={key} className="group">
                    <td className="sticky left-0 z-10 px-4 py-3 pl-6 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-700/50 transition-colors">
                      {permissionLabels[key]}
                    </td>
                    {roles.map(role => {
                      const enabled = roleMatrix[role]?.[key] ?? false
                      return (
                        <td
                          key={role}
                          className={`px-3 py-3 text-center transition-colors group-hover:bg-slate-50 dark:group-hover:bg-white/5 ${
                            selectedRole === role ? 'bg-brand-50/40 dark:bg-brand-900/10' : ''
                          }`}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => dispatch({ type: 'TOGGLE_ROLE_PERMISSION', role, perm: key })}
                            aria-pressed={enabled}
                            title={`${permissionLabels[key]} — ${role}: ${enabled ? 'on' : 'off'}`}
                            className={`h-auto w-auto p-0 hover:bg-transparent ${enabled ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'}`}
                          >
                            {enabled
                              ? <ToggleRight className="w-5 h-5" />
                              : <ToggleLeft className="w-5 h-5" />
                            }
                          </Button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            ))}

            {/* How much each role can do, and how many people hold it — read down the column.
                One row, pinned to the bottom of the scroller so it stays in view. */}
            <tfoot>
              <tr>
                <td className="sticky left-0 bottom-0 z-30 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                  Granted
                </td>
                {roles.map(role => {
                  const count = (users || []).filter(u => u.role === role).length
                  return (
                    <td
                      key={role}
                      className={`sticky bottom-0 z-20 px-3 py-2.5 text-center border-t border-slate-200 dark:border-slate-700 ${
                        selectedRole === role ? 'bg-brand-50 dark:bg-brand-900/20' : 'bg-white dark:bg-slate-800'
                      }`}
                    >
                      <span className="block text-xs font-bold text-slate-600 dark:text-slate-300">
                        {permKeys.filter(k => roleMatrix[role]?.[k]).length} / {permKeys.length}
                      </span>
                      <span className={`block text-[10px] mt-0.5 ${count === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>
                        {count} {count === 1 ? 'user' : 'users'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  )
}

function AccessControlPanel({ showToast }) {
  const [sessionTimeout, setSessionTimeout] = useState(30)
  const [maxAttempts, setMaxAttempts] = useState(5)
  return (
    <div className="max-w-md">
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Access Control</h2>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
        <div>
          <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Session Timeout (minutes)
          </Label>
          <Input
            type="number" min="1" max="480"
            value={sessionTimeout}
            onChange={e => setSessionTimeout(Number(e.target.value))}
            className="w-full border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Max Login Attempts
          </Label>
          <Input
            type="number" min="1" max="20"
            value={maxAttempts}
            onChange={e => setMaxAttempts(Number(e.target.value))}
            className="w-full border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <Button
          onClick={() => showToast('Access control settings saved', 'success')}
          className="h-auto w-full bg-brand-600 hover:bg-brand-700 py-2.5 rounded-xl text-xs font-bold"
        >
          Save Settings
        </Button>
      </div>
    </div>
  )
}

function PasswordPanel({ showToast }) {
  const [minLen, setMinLen] = useState(8)
  const [expiry, setExpiry] = useState(90)
  return (
    <div className="max-w-md">
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Password & Security</h2>
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
        <div>
          <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Minimum Password Length
          </Label>
          <Input
            type="number" min="6" max="32"
            value={minLen}
            onChange={e => setMinLen(Number(e.target.value))}
            className="w-full border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <Label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
            Password Expiry (days)
          </Label>
          <Input
            type="number" min="0" max="365"
            value={expiry}
            onChange={e => setExpiry(Number(e.target.value))}
            className="w-full border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-[10px] text-slate-400 mt-1">Set to 0 for passwords that never expire.</p>
        </div>
        <Button
          onClick={() => showToast('Password policy saved', 'success')}
          className="h-auto w-full bg-brand-600 hover:bg-brand-700 py-2.5 rounded-xl text-xs font-bold"
        >
          Save Policy
        </Button>
      </div>
    </div>
  )
}

const COMPANY_PROFILE_FIELDS = [
  { key: 'name',            label: 'Company Name' },
  { key: 'nameKh',          label: 'Company Name (Khmer)' },
  { key: 'licenseNo',       label: 'License No.' },
  { key: 'address',         label: 'Address' },
  { key: 'phone',           label: 'Phone' },
  { key: 'email',           label: 'Email' },
]

// A logo big enough to print at 56px is all the app ever draws, and every upload is
// carried in the same localStorage budget as the rest of the data — so downscale to a
// 256px PNG on the way in rather than persisting a multi-megabyte original.
const LOGO_MAX_PX = 256

function CompanyProfilePanel({ profile, dispatch, showToast }) {
  // One field edited at a time, in place — no bulk save to leave half-applied
  const [editingKey, setEditingKey] = useState(null)
  const [draft, setDraft] = useState('')
  const logoInputRef = useRef(null)
  const cellFieldCls = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500'

  function openEdit(field) {
    setEditingKey(field.key)
    setDraft(profile[field.key] || '')
  }

  function handleSave(field) {
    const value = draft.trim()
    if (field.key === 'name' && !value) {
      showToast('Enter a company name', 'error')
      return
    }
    dispatch({ type: 'UPDATE_COMPANY_PROFILE', profile: { [field.key]: value } })
    showToast(`${field.label} saved`, 'success')
    setEditingKey(null)
  }

  function handleLogoFile(e) {
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
        const scale = Math.min(1, LOGO_MAX_PX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        dispatch({ type: 'UPDATE_COMPANY_PROFILE', profile: { logo: canvas.toDataURL('image/png') } })
        showToast('Company logo updated', 'success')
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  function handleResetLogo() {
    dispatch({ type: 'UPDATE_COMPANY_PROFILE', profile: { logo: '' } })
    showToast('Company logo reset to default', 'success')
  }

  return (
    <div>
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">Company Profile</h2>

      {/* Logo — an image, so it sits above the field table and uploads rather than edits in place */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 mb-4 flex items-center gap-4">
        <img
          src={companyLogoSrc(profile)}
          alt={profile.name}
          className="w-16 h-16 rounded-xl object-contain bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex-shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Company Logo</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            {profile.logo ? 'Custom logo — shown on the sidebar, receipts and printed reports' : 'Default logo — upload one to replace it'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoFile}
            className="hidden"
          />
          <Button
            onClick={() => logoInputRef.current?.click()}
            className="h-auto flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 px-3 py-2 rounded-xl text-xs font-bold"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </Button>
          {profile.logo && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleResetLogo}
              title="Reset to the default logo"
              className="h-auto w-auto p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Field</Th>
                <Th>Value</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {COMPANY_PROFILE_FIELDS.map(f => editingKey === f.key ? (
                <tr key={f.key} className="bg-brand-50/40 dark:bg-brand-900/10">
                  <td className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{f.label}</td>
                  <td className="px-4 py-2">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSave(f)}
                      className={cellFieldCls}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSave(f)}
                        title="Save changes"
                        className="h-auto w-auto p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingKey(null)}
                        title="Cancel"
                        className="h-auto w-auto p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={f.key} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">{f.label}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-100">
                    {profile[f.key] || <span className="font-medium text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(f)}
                      title={`Edit ${f.label}`}
                      className="h-auto w-auto p-1.5 text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-lg"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function SettingsModal() {
  const { state, dispatch, showToast } = useApp()
  const {
    settingsOpen, activeSettingsMenu, activeUserMgmtSubMenu,
    systemUsers, roleMatrix, permissionLabels, selectedRole,
    companyProfile,
  } = state

  const [userMgmtOpen, setUserMgmtOpen] = useState(true)

  if (!settingsOpen) return null

  // Resolve the active panel key
  const isUserMgmt = USER_MGMT_PANELS.includes(activeSettingsMenu) || activeSettingsMenu === 'user-management'

  const activePanel = isUserMgmt ? (activeSettingsMenu === 'user-management' ? 'user-accounts' : activeSettingsMenu) : activeSettingsMenu

  // Label of the open panel, for the header breadcrumb
  const activeLabel =
    SETTINGS_USER_MGMT_SUBS.find(s => s.id === activePanel)?.label ||
    SETTINGS_MAIN_MENUS.find(m => m.id === activePanel)?.label ||
    ''

  function handleMenu(id) {
    dispatch({ type: 'SET_SETTINGS_MENU', menu: id })
  }

  function handleUserSub(sub) {
    dispatch({ type: 'SET_USER_MGMT_SUBMENU', sub })
    dispatch({ type: 'SET_SETTINGS_MENU', menu: sub })
  }

  function handleToggleUserMgmt() {
    setUserMgmtOpen(o => !o)
    if (!userMgmtOpen) {
      // Opening — navigate to first sub
      dispatch({ type: 'SET_SETTINGS_MENU', menu: 'user-accounts' })
    }
  }

  function handleMobileNavChange(id) {
    if (SETTINGS_USER_MGMT_SUBS.some(s => s.id === id)) handleUserSub(id)
    else handleMenu(id)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col md:flex-row overflow-hidden">

        {/* Sidebar (desktop only) */}
        <Sidebar
          active={activePanel}
          userMgmtOpen={userMgmtOpen}
          onMenu={handleMenu}
          onUserSub={handleUserSub}
          onToggleUserMgmt={handleToggleUserMgmt}
        />

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-slate-50 dark:bg-slate-900">
          {/* Top bar — breadcrumb of the open panel, plus which company is being configured */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <nav className="flex items-center gap-1.5 min-w-0 text-xs text-slate-400 dark:text-slate-500">
              {isUserMgmt && (
                <>
                  <span className="font-semibold hidden sm:inline">User Management</span>
                  <ChevronRight className="w-3 h-3 flex-shrink-0 hidden sm:inline-block" />
                </>
              )}
              <span className="font-bold text-slate-600 dark:text-slate-300 truncate">{activeLabel}</span>
            </nav>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-[14rem]">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0 text-brand-600 dark:text-brand-400" />
                <span className="truncate">{companyProfile.name}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => dispatch({ type: 'CLOSE_SETTINGS' })}
                className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Mobile panel nav (sidebar is hidden below md) */}
          <div className="md:hidden px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
            <select
              value={activePanel}
              onChange={e => handleMobileNavChange(e.target.value)}
              className="w-full px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <optgroup label="User Management">
                {SETTINGS_USER_MGMT_SUBS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </optgroup>
              <optgroup label="Settings">
                {SETTINGS_MAIN_MENUS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </optgroup>
            </select>
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {activePanel === 'user-accounts'  && <UserAccountsPanel users={systemUsers} roleMatrix={roleMatrix} dispatch={dispatch} showToast={showToast} />}
            {activePanel === 'roles'           && <RolesPanel roleMatrix={roleMatrix} permissionLabels={permissionLabels} selectedRole={selectedRole} users={systemUsers} dispatch={dispatch} showToast={showToast} />}
            {activePanel === 'access-control'  && <AccessControlPanel showToast={showToast} />}
            {activePanel === 'password'        && <PasswordPanel showToast={showToast} />}
            {activePanel === 'company-profile' && <CompanyProfilePanel profile={companyProfile} dispatch={dispatch} showToast={showToast} />}
            {activePanel === 'integration'     && <IntegrationPage embedded />}
          </div>
        </div>
      </div>
    </div>
  )
}
