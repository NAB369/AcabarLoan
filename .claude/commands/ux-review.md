---
description: Run a UX/UI heuristic review of a new or reworked screen, modal, or user flow against this project's minimalism/design principles (hierarchy, minimal steps, consistency, feedback, error handling, escape hatches, accessibility, dark mode).
argument-hint: "[component or flow name]"
---

Delegate to the `ux-reviewer` agent to review the current diff (or, if `$ARGUMENTS`
names a specific screen/component/flow, focus on that one) against
[ux-ui-design.md](../rules/ux-ui-design.md).

The agent is read-only and reports findings — it does not edit code. After it
reports, summarize the verdict for the user: which findings are real (with the
specific principle violated and a concrete fix), and which are minor/optional. Run
this before `/qa` on any change that touches a user-facing flow, the same way
`/review-money-flow` gates anything that changes money.
