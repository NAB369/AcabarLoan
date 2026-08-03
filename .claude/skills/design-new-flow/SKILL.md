---
name: design-new-flow
description: Use when building any new screen, modal, wizard step, or multi-step process (a new UI/UX feature), or reworking an existing user flow. Walks through minimizing steps, reusing existing components, and covering every required state before writing markup — this is the design pass that happens before implementation, per ux-ui-design.md.
---

# Designing a new UI flow

Read [ux-ui-design.md](../../rules/ux-ui-design.md) first — this skill is the applied
checklist for those principles. Work through it in order; don't jump straight to
markup.

## 1. Define the goal and the operator

Name the specific role doing this task (loan officer, credit manager, accountant,
admin) and the one outcome they need. If you can't state the outcome in one sentence
("approve this loan for disbursement"), the flow is probably trying to do too much at
once — split it.

## 2. Map the flow before building it

- If this replaces/extends an existing flow, walk the current one first and note
  where a user has to re-enter data, backtrack, or open a second modal to find
  information the first one needed.
- Count the steps/clicks a fresh flow would take. Can two steps honestly be one
  screen? Can a piece of data be defaulted or looked up instead of asked for?
- Only reach for the multi-step wizard pattern (`customerWizardStep`/
  `loanWizardStep`-style step index in state) when the task has genuinely sequential,
  conditional stages. A short form is not a wizard.

## 3. Reuse before inventing

Check, in this order, before writing new markup:
1. `src/components/ui/` — shadcn primitives (button, dialog, etc.)
2. `src/components/shared/` — hand-built primitives (`StatusBadge`, `Toast`,
   `Pagination`, `InfoCard`, `DocBadges`, `DocList`, `AddressFields`,
   `PersonInfoGrid`, `TypedDocumentUpload`, `StickyHScroll`)
3. The closest existing domain component in the same area (`src/components/<domain>/`)

Only build something new if none of the above fit — and if it's likely to be reused,
put it in `shared/` (or generate it via `npx shadcn@latest add <name>`) rather than
inline in the domain component.

## 4. Design every state, not just the filled/happy one

For each new view, explicitly decide what renders for:
- **Empty** — no data yet (new install, first customer, first loan)
- **Loading** — anything that isn't instant (PDF parsing, file upload)
- **Error** — validation failure (field-level message) and any user-facing
  operation failure (e.g. `canFundExpense` refusing an overdraft — see
  [accounting-integrity.md](../../rules/accounting-integrity.md))
- **Success** — the feedback the user gets when it worked (`Toast`, updated badge,
  closed modal — pick one, don't leave it silent)
- **Destructive-action confirmation** — if the action deletes or irreversibly commits
  something, follow the `deletePendingCode` confirm-then-commit pattern instead of
  acting on the first click

## 5. Wire in escape hatches

Any new modal/wizard/preview open-flag needs:
- A visible close control (X button and/or Cancel)
- An entry in the `Escape`-key handler in [App.jsx](../../../src/App.jsx)
- If it's a sub-view of a tab (like loan detail/overview), an entry in the `SET_TAB`
  reducer case's reset list (see
  [state-and-persistence.md](../../rules/state-and-persistence.md)) so navigating
  away closes it

## 6. Hierarchy and restraint pass

- Identify the one primary action in the view. It gets the solid/`primary` button
  variant. Everything else is `outline`/`secondary`/`ghost`.
  `destructive` is reserved for actions that actually delete/reverse something.
- Status is carried by `StatusBadge` (color + text), never color alone.
- If you're tempted to make something "pop" with an extra border/shadow/gradient,
  ask whether it's actually the view's primary action instead — that's usually the
  real fix.

## 7. Accessibility and dark mode

- Every input has a visible label (not just a placeholder).
- Confirm the new screen reads correctly with `state.darkMode` toggled on — this app
  hand-tunes dark overrides in `src/globals.css`; if a new color utility class you
  used has no dark-mode counterpart there, either use one that does or add one,
  following the existing `.dark .foo { ... !important }` pattern.
- Keyboard: tab order follows visual order, and the `Escape` path from step 5 works.

## 8. Review and verify

Run `/ux-review` for a heuristic pass against
[ux-ui-design.md](../../rules/ux-ui-design.md), then `/qa` before calling the task
done.
