---
description: Run a focused double-entry-accounting review of pending changes to loan/expense/cash-transfer logic in AppContext.jsx (debit=credit, control-account pairing, currency correctness).
---

Delegate to the `accounting-reviewer` agent to review the current diff (or, if
$ARGUMENTS names a specific reducer case/action like `RECORD_REPAYMENT` or
`DISBURSE_LOAN`, focus on that one) against
[accounting-integrity.md](../rules/accounting-integrity.md).

The agent is read-only and reports findings — it does not edit code. After it reports,
summarize the verdict for the user: safe to ship, or which specific case needs a fix
and why, with the concrete scenario (inputs/state) that would produce a wrong ledger
entry.
