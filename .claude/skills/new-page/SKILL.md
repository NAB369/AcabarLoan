---
name: new-page
description: Use when adding a brand-new top-level page/section to the app (a new sidebar tab), as opposed to a new component within an existing page. Covers wiring activeTab routing, the sidebar entry, and the component folder convention this codebase uses.
---

# Adding a new top-level page

There is no router — a top-level page is just another branch of the `activeTab`
conditional in [App.jsx](../../../src/App.jsx), driven by global state. Run the
[design-new-flow](../design-new-flow/SKILL.md) skill first to plan the page's layout
and states, then wire it up following the existing pattern (see the `reminders` or
`reports` page as the simplest reference):

1. **Create the folder**: `src/components/<new-domain>/` with a `<Domain>Page.jsx`
   entry component, matching the existing per-domain folder convention
   (`customers/CustomersPage.jsx`, `reports/ReportsPage.jsx`, etc.).
2. **Add the tab value**: pick a short kebab/camel id (matches existing values like
   `'dashboard'`, `'open-loan'`, `'reminders'`) — this is what flows through
   `state.activeTab`.
3. **Wire `App.jsx`**: import the new page and add
   `{state.activeTab === '<id>' && <DomainPage />}` alongside the existing branches.
4. **Add the sidebar entry** in
   [Sidebar.jsx](../../../src/components/layout/Sidebar.jsx) that dispatches
   `{ type: 'SET_TAB', tab: '<id>' }` — reuse the existing nav-item markup/icon
   pattern (icons come from `lucide-react`, see `src/utils/tabIcons.js`).
5. **Extend `SET_TAB`'s reset list** in the reducer (AppContext.jsx) if the new page
   introduces its own modal/detail state that should close when the user navigates
   away, matching how loan/accounting sub-views already reset there.
6. **State**: if the page needs its own data, add it to `INITIAL_STATE` and decide
   persistence per [state-and-persistence.md](../../rules/state-and-persistence.md) —
   don't create a separate Context for it.
7. **Reuse shared primitives** (`src/components/shared/`) for tables, badges, pagination,
   toasts, etc. rather than rebuilding them for the new page.
8. Run `/qa` and confirm the new tab appears in the sidebar and renders without error.
