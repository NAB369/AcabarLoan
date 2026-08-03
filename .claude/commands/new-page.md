---
description: Scaffold a new top-level sidebar page (activeTab route + component folder + sidebar entry), following this app's existing per-domain page convention.
argument-hint: "<page-name>"
---

Scaffold a new top-level page named `$ARGUMENTS` following the
[new-page](../skills/new-page/SKILL.md) skill:

1. Create `src/components/<domain>/` (derived from `$ARGUMENTS`) with a
   `<Domain>Page.jsx` entry component matching the existing per-domain convention.
2. Pick a short id for `state.activeTab` and wire it into
   [App.jsx](../../src/App.jsx).
3. Add the nav entry to
   [Sidebar.jsx](../../src/components/layout/Sidebar.jsx), reusing the existing
   nav-item markup and an appropriate `lucide-react` icon.
4. Extend the `SET_TAB` reducer case's reset list if the new page introduces its own
   modal/detail state.
5. Add any needed state to `INITIAL_STATE` and decide persistence per
   [state-and-persistence.md](../rules/state-and-persistence.md).
6. Reuse `src/components/shared/` primitives rather than rebuilding tables/badges/
   pagination/toasts.

If `$ARGUMENTS` is empty, ask what the page should be called and what it's for before
proceeding. When scaffolding is done, run `/qa` to confirm the new tab renders.
