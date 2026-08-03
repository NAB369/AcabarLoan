---
name: add-reducer-action
description: Use when adding a new action type (a new piece of app behavior) to the global reducer in src/context/AppContext.jsx, or adding a new field to app state. Walks through immutability, persistence, and accounting-safety checks specific to this codebase so the new action doesn't break localStorage migration or the ledger.
---

# Adding a reducer action safely

This app has exactly one state container
([AppContext.jsx](../../../src/context/AppContext.jsx)). Follow this checklist for any
new action type or new state field — see
[state-and-persistence.md](../../rules/state-and-persistence.md) and
[accounting-integrity.md](../../rules/accounting-integrity.md) for the full rules this
checklist is drawn from.

1. **New state field?** Add it to `INITIAL_STATE` with a sane default. Decide now
   whether it's transient UI state (don't persist) or durable data (persist — see
   step 4).
2. **Name the action** SCREAMING_SNAKE_CASE and place its `case` near the other
   actions for the same domain in the `reducer` switch.
3. **Return new state immutably** — spread `state`, spread/map arrays and objects you
   change, never mutate in place. If the action represents a status transition, branch
   on `prevStatus`/`nextStatus`, not on the new status alone (prevents double-posting
   on re-save — see `loanPayableDelta` for the pattern).
4. **Does this action move money or touch `chartOfAccounts`?** If yes:
   - Update `chartOfAccounts` balances (via `applyGlMovements` or an explicit `.map`)
     **and** push a matching `journalEntries` entry whose `lines` balance
     (`sum(debit) === sum(credit)`) in the same case.
   - Fund/credit the real bank account matching the record's `currency`
     (`fundingGLCode(...)`), not a hardcoded bucket.
   - Round with `Math.round(x * 100) / 100`; compare with a `0.005` tolerance.
   - Refuse overdrafts rather than clamping them to zero.
   - Run `/review-money-flow` (the accounting-reviewer agent) once the case is written.
5. **Does this action need to survive a page reload?** If the field is new, add it to
   both the read side (`loadPersistedState()`) and the write/save effect. If you're
   changing the *shape* of something already persisted, write a migration (see
   state-and-persistence.md) — don't assume every install's localStorage already has
   the new shape.
6. **Wire it up**: dispatch the action from the component via `useApp().dispatch`,
   never by reaching into `localStorage` or another store directly.
7. **Run `/qa`** before considering the change done.
