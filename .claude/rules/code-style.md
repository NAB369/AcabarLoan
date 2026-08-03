# Code style & UI conventions

- Function components with hooks only — no class components, no new state-management
  libraries (Redux, Zustand, etc.). Global state is the one reducer in
  [AppContext.jsx](../../src/context/AppContext.jsx); read it and
  [state-and-persistence.md](state-and-persistence.md) before adding any new state.
- Read state and get `dispatch` via `useApp()`. Components never read or write
  `localStorage` directly — that belongs to `AppContext.jsx` alone.
- Styling is Tailwind utility classes only. `src/globals.css` holds Tailwind's
  base/component/utility directives, the shadcn/ui CSS-variable theme, and any truly
  global rules — don't add new component-scoped CSS files. See
  [shadcn-ui.md](shadcn-ui.md) for the component-library setup and where custom
  keyframes/transitions belong.
- **New UI components are built on shadcn/ui first.** Before hand-rolling a button,
  dialog, dropdown, select, tooltip, popover, sheet, tabs, etc., check whether it
  should be `npx shadcn@latest add <name>` instead — see
  [shadcn-ui.md](shadcn-ui.md). Domain-specific composites (a loan card, a customer
  row) still live in `src/components/<domain>/`, built out of `src/components/ui/`
  primitives plus `src/components/shared/` primitives.
- Reuse `src/components/shared/` (existing hand-built primitives — `StatusBadge`,
  `Toast`, `Pagination`, `InfoCard`, `DocBadges`, `DocList`, `AddressFields`,
  `PersonInfoGrid`, `TypedDocumentUpload`, `StickyHScroll`, etc.) and
  `src/components/ui/` (shadcn primitives) instead of re-implementing similar markup
  in a domain component. If two domain components start needing the same pattern,
  promote it to `shared/` (or add the matching shadcn primitive) rather than
  copy-pasting.
- Multi-step flows (customer/loan wizards, payroll run modal) follow the existing
  step-index pattern already in state (`customerWizardStep`, `loanWizardStep`) — reuse
  that pattern for any new wizard rather than inventing a new mechanism.
- Any new screen, modal, or user flow follows
  [ux-ui-design.md](ux-ui-design.md) (hierarchy, minimal steps, feedback, error
  states, escape hatches) — see the
  [design-new-flow](../skills/design-new-flow/SKILL.md) skill for the checklist to
  run before writing markup.
- Comments: default to none. Only write one when it captures a non-obvious *why* — a
  business rule, a migration reason, a workaround for a specific bug. This codebase
  already leans heavily on that style in `AppContext.jsx`; match its tone (explain the
  domain/history reason, not the mechanics the code already shows) rather than adding
  a different commenting style elsewhere.
- No TypeScript, no PropTypes — keep new files plain `.jsx`/`.js` consistent with the
  rest of the repo.
- Don't add new dependencies for something a small util function or an existing
  shared component already covers.
