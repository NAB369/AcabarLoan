# Super Admin → Admin → users

The app has exactly **three levels** and no more: `Super Admin` governs `Admin`, and `Admin`
runs the book for everybody else. Do not add a fourth level, a second "Super Admin"-ish
role, or a parallel permission system — the model lives in
[governance.js](../../src/utils/governance.js) and the enforcement lives in the reducer in
[AppContext.jsx](../../src/context/AppContext.jsx).

## Where authorization actually happens

- **`can(perm)`** (from `useApp()`) is the only permission check. It resolves
  `roleMatrix[user.role][perm]` and then applies that account's own
  `permissionOverrides` (`{ granted: [], revoked: [] }`), so a Super Admin can narrow one
  Admin without touching every account sharing the role. Read it off the **account record**,
  never off `state.currentRole` — a refreshed session restores the role from the record, and
  `currentRole` is for display and audit stamps only.
- **Hiding a button is never the control.** Every governance action re-checks in its reducer
  case: `actorGoverns(state)`, `targetOffLimits(state, username)`,
  `wouldStrandInstall(state, ...)`. If you add a case that changes who holds what, use those
  three helpers or state in a comment why none applies.
- **`GOVERN_PERMISSION` (`govern_admins`) is the level, not a feature flag.** It is refused by
  `TOGGLE_ROLE_PERMISSION`, stripped by `mergeSeededPermissions` on load for every role but
  `Super Admin`, and never settable through `SET_ADMIN_PERMISSION`. Leave it that way.

## The invariants (each has a guard; don't remove one without replacing it)

1. An account below the level cannot edit, deactivate, re-role or reset a `Super Admin`
   (`targetOffLimits`).
2. Nobody can create a second Super Admin except an existing one (`ADD_SYSTEM_USER`,
   `UPDATE_SYSTEM_USER`, `ADD_ROLE`, and `applyRequest` all refuse it).
3. Nobody edits their **own** role's permission column (`role === state.currentRole` is
   refused in `TOGGLE_ROLE_PERMISSION`) — that is the definition of self-escalation.
4. There is always at least one **active** Super Admin (`wouldStrandInstall`).
5. An Admin's attempt to change identity or permissions is **filed, not applied**
   (`fileRequest` → `adminRequests` → `APPROVE_ADMIN_REQUEST` → `applyRequest`). Money
   actions are deliberately *not* in that queue — see the note in `REQUEST_KINDS`.
6. Status changes go through `SET_USER_STATUS` only. `UPDATE_SYSTEM_USER` deletes `status`
   from its updates on purpose, so every status change meets the same guards and lands in the
   trail.

## The audit trail

`adminAuditLogs` is append-only, newest first, and each entry carries a checksum over the
previous one (`chainEntry` / `verifyChain`). Write it with **`withAudit(state, patch, audit)`**
so the change and its record are one operation — an audited action whose audit is a separate
dispatch is one somebody will forget. Never add a case that edits or removes an entry.

It is **tamper-evident, not tamper-proof**: anyone with devtools can recompute the chain.
Don't describe it as immutable in UI copy.

## What this app cannot enforce, and must not pretend to

- **IP and device restriction** — a page cannot read its own IP and a user agent is
  self-reported. Both are stored and shown with a "recorded, not enforced" marker. Never
  wire them into a real check that would look like one.
- **MFA** — there is no second channel. The step-up is a **password re-authentication** and
  is labelled as such. Don't rename it "MFA" in UI copy.
- **Terminating a session on another machine** — `FORCE_LOGOUT_USER` writes to the account
  record; the browser holding the session stands down when it next reads state (see the
  session effect in `AppProvider`). Immediate in this install, never across machines.
- Login-time windows are checked at **sign-in only** (`signInBlock`). The session effect
  deliberately reacts to `status` alone, so a window closing does not eject someone
  mid-sentence.

## Adding a permission

Add the key to `INITIAL_PERMISSION_LABELS` **and** every row of `INITIAL_ROLE_MATRIX`, put it
in a `PERMISSION_GROUPS` group in SettingsModal, and map it into a cell of
`PERMISSION_MODULES` if it belongs in the Customers → Permissions grid.
`mergeSeededPermissions` fills it in for existing installs — `view_*`/`export_*` default to granted for a role the install
invented, everything else to denied. A grid cell with no capability behind it must stay
`null` (rendered "—"), never a toggle that changes nothing.
