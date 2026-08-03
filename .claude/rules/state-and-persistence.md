# State, reducer, and localStorage persistence

All app state lives in one `useReducer` in
[AppContext.jsx](../../src/context/AppContext.jsx). Do not introduce a second
Context/store or component-local state for anything that other pages need to read —
add a field to `INITIAL_STATE` and a case to the reducer instead.

## Reducer rules

- Every case must return a **new** state object/array — never mutate `state`,
  `action`, or nested objects in place. Follow the existing spread patterns
  (`{ ...state, ... }`, `array.map(...)`).
- Name new action types SCREAMING_SNAKE_CASE, grouped near the other actions for the
  same domain (customer wizard actions together, loan actions together, etc.).
- When an action represents a **status transition** (e.g. loan status, expense
  approval), branch on the transition (`prevStatus` vs `nextStatus`), not on the new
  status alone — see `loanPayableDelta`. This is what stops a re-save of an
  already-approved record from re-posting a ledger movement a second time.
- If a new state field should reset when the user switches sidebar tabs, add it to the
  `SET_TAB` case's reset list, matching how loan/accounting modal state already resets
  there.

## localStorage persistence

- Persisted state is written under `STORAGE_KEY` (currently `'acabar-state-v6'`) via
  `loadPersistedState()` / the effect that saves state (see the rest of the file below
  `INITIAL_STATE`).
- Adding a new field to state that should persist: add it to the object returned by
  `loadPersistedState()` and to the save effect. Purely transient/UI state (modal open
  flags, active tab, wizard step) should generally **not** be persisted.
- Changing the **shape** of already-persisted data (renaming a field, splitting one
  record into several, moving data between collections) requires a migration, not just
  a code change — an existing install's localStorage still has the old shape and must
  not be allowed to silently crash or corrupt on load. Follow the existing patterns:
  - `stripCidPrefixes` — value-shape rewrite applied to the whole persisted blob.
  - `mergeSeededAccounts` / `mergeSeededBankAccounts` / `mergeSeededIntegrations` —
    reconcile an install's saved collection against the current seed, matched on a
    stable key (`code`/`id`), keeping user edits and appending anything the seed added
    since the install last saved.
  - The numbered comments above `STORAGE_KEY` and inline above each migration
    documenting *why* (e.g. "v6: ... a v5 install would otherwise keep its old sparse
    copy"). Add a comment in the same style for any new migration — the next person
    (including future-you) needs the *why*, not just the *what*.
  - Only bump `STORAGE_KEY` itself when old data is actually incompatible/unreadable
    by the new code; prefer an additive migration function over a bump when the old
    data can be reconciled in place, since bumping throws away everything the install
    had saved.
- Length-checked fallbacks (`persisted.employees?.length ? persisted.employees :
  INITIAL_EMPLOYEES`) exist because an install that once saved an empty array must
  not be stuck with an empty seed forever — use `?.length ?` instead of `||` for any
  list where an empty saved list should NOT beat the seed.

## Verifying a persistence change

Before calling a persistence change done: open the app, use it enough to populate the
field you changed, refresh the page, and confirm the data survives. Then simulate an
old install by pasting a pre-change JSON shape into
`localStorage.setItem('acabar-state-v6', ...)` and reloading, to confirm the migration
doesn't throw.
