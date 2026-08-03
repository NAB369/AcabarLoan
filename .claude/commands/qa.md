---
description: Run the full QA pass (build + red-flag scan + preview smoke check + manual checklist) after finishing a task, before calling it done.
---

Run the [qa-full-check](../skills/qa-full-check/SKILL.md) skill against the current
working tree, in full:

1. `npm run build` and confirm zero errors. If it fails, fix the root cause and
   re-run — up to 3 attempts — rather than just reporting the failure; if it's still
   broken after 3 tries, stop and report FAIL with what you tried.
2. Scan the diff for leftover debug statements, new TODO/FIXME, and duplicate reducer
   `case` labels in `src/context/AppContext.jsx`.
3. If `AppContext.jsx` changed, apply the accounting heuristic (chartOfAccounts change
   ⇒ expect a matching journalEntries push) per
   [accounting-integrity.md](../rules/accounting-integrity.md); if it looks
   suspicious, say so and recommend `/review-money-flow`.
4. Boot `npm run preview`, confirm the page actually serves content (not blank/error),
   then stop the server.
5. Produce a manual click-through checklist across all pages (Dashboard, Customers,
   Open Loan, Reminders, Accounting, Reports, Settings), weighted toward whatever the
   current task actually touched.

You may delegate this whole run to the `qa-tester` agent instead of doing it inline if
that's more convenient — either way, report a clear per-step PASS/FAIL and an overall
verdict. Do not report success if the build step failed. If a build error was fixed
along the way, say so explicitly in the report — name what was broken and what
changed — don't fold it silently into a PASS.

Arguments (optional): $ARGUMENTS — if given, treat it as a hint about which
page/flow was just changed, and put that at the top of the manual checklist instead of
running through everything with equal weight.
