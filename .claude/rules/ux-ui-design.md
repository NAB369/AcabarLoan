# UX/UI design principles

Everyone using this app is **professional back-office staff** (loan officers, credit
managers, accountants, admins) doing the same handful of tasks — register a customer,
originate/approve/disburse a loan, record a repayment, post a journal entry, run
payroll — many times a day. There is no borrower-facing screen. Design for repeated,
fast, error-free use by a trained operator, not for a first-time consumer audience.

## What "minimalism" means in this app

Minimalism here is **not** "make it sparse" — this is a financial system; loan
officers need to see balances, statuses, and dates at a glance, and hiding data to
look clean creates real operational risk. Minimalism means:

- Every element on screen earns its place — remove decoration that doesn't help
  someone read the data faster (gratuitous borders, redundant icons, low-value labels).
- One primary action per view, visually distinct from everything else (see
  "hierarchy" below) — not zero actions, not five equally-loud actions.
- Reduce *visual noise*, not *information*. A dense table with clear typography and
  restrained color is more minimal than a sparse layout that forces three clicks to
  see the number you actually needed.

## Core principles (apply to any new screen, modal, or flow)

1. **Visual hierarchy.** One primary action per view (solid/`primary` button), one
   visual treatment for it — everything else is `outline`/`ghost`/`secondary` (see
   [shadcn-ui.md](shadcn-ui.md)). Status (paid/overdue/pending, approved/rejected)
   should be the loudest thing in a row via `StatusBadge`, not buried in plain text.
2. **Progressive disclosure — minimize steps.** Don't put everything on one screen if
   the user only needs it conditionally. This app already does this well with the
   step-index wizard pattern (`customerWizardStep`, `loanWizardStep`) and with detail
   views reached from a summary row (`LoanQuickPreviewModal`, `CustomerPreview`) —
   follow that pattern for new flows rather than a single long form. But don't add
   steps for their own sake: if a task can honestly be one screen, keep it one screen.
3. **Consistency over novelty.** Reuse `src/components/shared/` and
   `src/components/ui/` before inventing new patterns for pagination, badges,
   toasts, tables, or document lists (see [code-style.md](code-style.md)). A new
   one-off pattern is a cost paid by every future maintainer, not just this task.
4. **Feedback for every action.** Every dispatch that changes data (submit, approve,
   disburse, delete) needs a visible result — a `Toast` (see
   `src/components/shared/Toast.jsx`), an updated badge, or a closed modal. Silent
   success is indistinguishable from a bug to the person operating it.
5. **Error prevention and graceful recovery.** Validate at the point of entry with a
   message tied to the specific field, not a generic banner. Irreversible or
   high-consequence actions (delete a customer, disburse a loan, approve an expense)
   need a confirmation step — follow the existing `deletePendingCode`
   confirm-then-commit pattern rather than acting on the first click.
6. **User control — always leave an escape hatch.** Every modal/wizard/preview needs
   an obvious close (X, Cancel, click-outside) *and* must be wired into the global
   `Escape` handler in [App.jsx](../../src/App.jsx) — a new piece of modal state that
   isn't added to that `useEffect`'s key handler is a trap the user can't back out of
   with the keyboard.
7. **Recognition over recall.** Show the data needed to make a decision in the
   context where the decision is made (e.g. a loan's outstanding balance visible on
   the repayment screen itself) rather than requiring the user to remember a number
   from a different tab.
8. **Don't rely on color alone.** Status must be readable from icon/shape/text as
   well as color — colorblind users and printed/PDF-exported output (see
   `src/utils/exportPdf.js`) both lose color-only signals. `StatusBadge` already
   pairs color with a text label; keep that pairing in any new status indicator.
9. **Define every state, not just the happy path.** A new list/table/detail view
   needs an explicit empty state (no customers yet, no loans yet), and — if it does
   any async work — a loading state. A screen that only renders correctly when data
   already exists will look broken on a fresh install.
10. **Match the real-world domain.** Use the vocabulary a Cambodian MFI back office
    actually uses (see [architecture.md](architecture.md) on CBC reports, NBC-style
    chart of accounts, province/district/commune addressing) — don't generalize
    domain-specific terms into something more "universal" that a loan officer
    wouldn't recognize.

## Applying this with shadcn/ui

- Reserve the `default` (solid, brand-colored) Button variant for the one primary
  action in a view. Use `outline`/`secondary`/`ghost` for everything else, and
  `destructive` only for actions that truly delete/reverse something.
- Prefer shadcn's built-in open/close animations (`tailwindcss-animate` — see
  [shadcn-ui.md](shadcn-ui.md)) over custom motion; consistent, restrained motion is
  part of minimalism, novel per-component motion is not.
- Don't decorate a shadcn primitive with extra borders/shadows/gradients "to make it
  pop" — if it needs to stand out, that's a sign it should be the view's one primary
  action (point 1), not a styling problem to paper over.

## Designing a new flow

Use the [design-new-flow](../skills/design-new-flow/SKILL.md) skill when building
any new screen, modal, or multi-step process. Run `/ux-review` before `/qa` on
anything that changes a user-facing flow, the same way `/review-money-flow` gates
anything that changes money.
