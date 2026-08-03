---
name: qa-full-check
description: Use after finishing any code change to this project (a feature, a fix, a refactor) and before calling the task done. Runs a production build to catch compile/import errors, scans the diff for red flags, and produces a manual smoke-test checklist across every page. This is the skill behind the /qa command.
---

# Full QA check (post-task / post-build)

Run every step below. Report a single PASS/FAIL verdict per step, not just an overall
summary — a reader needs to know *which* step failed.

## 1. Production build — fix forward, don't just report

```
npm run build
```

Vite/esbuild will fail loudly on bad imports, syntax errors, and unresolved modules —
there is no TypeScript or test suite in this project, so this is the primary automated
safety net. Treat any warning about unused exports or chunk-size as non-blocking;
treat any error as blocking.

If the build fails, don't stop at reporting it — close the loop:

1. Read the actual compiler/bundler error (file, line, message) and fix the root
   cause in the source. Fix the real problem (a bad import, a typo, a missing export,
   a broken JSX tag) — never "fix" a failure by suppressing/disabling a check,
   deleting the failing code, or loosening a build setting.
2. Re-run `npm run build`.
3. Repeat up to **3 attempts total**. If it's still failing after 3, stop, report
   **FAIL**, show the current error and what you already tried, and ask the user for
   direction instead of continuing to guess — a build that resists 3 targeted fixes
   usually means the fix needs a decision only the user can make (which behavior is
   actually correct), not another blind attempt.
4. Whether it took one attempt or three, the final report must state plainly what
   was broken and what you changed to fix it — this is a real code change happening
   during what looks like a verification step, and the user needs to see it, not
   just a silent PASS.

## 2. Diff hygiene scan

Against the changed files (`git diff --name-only`, or `git diff HEAD~1` if nothing is
staged), grep for:

- `console.log(` / `debugger` left in `src/**` (temporary debugging left behind).
- `TODO` / `FIXME` newly introduced in the diff (not pre-existing ones elsewhere).
- Duplicate reducer `case` labels in `src/context/AppContext.jsx` (copy-paste of an
  existing action type is an easy mistake in a ~1200-line switch statement).

## 3. Accounting-invariant heuristic (only if AppContext.jsx changed)

If the diff touches `src/context/AppContext.jsx`, check whether any modified/added
reducer case that changes `chartOfAccounts` also pushes to `journalEntries` in the same
case (and vice versa) — per
[accounting-integrity.md](../../rules/accounting-integrity.md). If a case moves money
without an obvious matching journal entry, flag it explicitly rather than silently
passing — don't try to fully verify debit/credit balance yourself here; that's what
`/review-money-flow` (the accounting-reviewer agent) is for. This is a fast heuristic
tripwire, not a substitute for that review.

## 4. Preview server smoke check

```
npm run preview
```

Wait for it to report its local URL, then confirm the page actually serves (e.g. via
curl or WebFetch on the printed localhost URL) and contains the app's root div /
expected title — not a blank page or a stack trace. Stop the server afterward
(`Ctrl+C` equivalent — kill the background process); don't leave it running.

## 5. Manual click-through checklist

If a browser is available to drive (or hand this list back to the user), walk every
sidebar tab and confirm it renders without a blank screen or console error:

- **Dashboard** — loads with summary figures, no crash.
- **Customers** — list renders, open the customer wizard, open a customer preview.
- **Open Loan** — loan list renders; open a loan's detail/overview; if the change
  touched disbursement/repayment, actually run that flow on a test loan.
- **Reminders** — page renders without error.
- **Accounting** — Accounting page loads; if the change touched money flows, open
  Chart of Accounts / General Ledger and spot-check that the balance you'd expect
  changed actually changed.
- **Reports** — Reports page renders; spot-check the report(s) related to the change.
- **Settings** — modal opens or `/settings` view renders; if the change touched
  loan products, fee settings, or user management, check that specific screen.

Pay special attention to whatever page/flow the actual task touched — the generic
walk above is a regression net, not a substitute for exercising the specific change.

If the task added or reworked a user-facing screen/modal/flow, `/ux-review` (the
`ux-reviewer` agent) should have already run per
[ux-ui-design.md](../../rules/ux-ui-design.md) — note whether it did, don't re-derive
that review here.

## Verdict

State clearly: **PASS** (safe to consider the task done) or **FAIL** (list exactly
which step failed and why). Never report PASS if step 1 (build) failed.
