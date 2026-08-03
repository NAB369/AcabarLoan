# Accounting / general-ledger integrity

The app models real double-entry bookkeeping. Money-moving reducer cases in
[AppContext.jsx](../../src/context/AppContext.jsx) — `UPDATE_LOAN`, `ADVANCE_APPROVAL`,
`DISBURSE_LOAN`, `RECORD_REPAYMENT`, `RECORD_REMAINDER`, `ADD_INCOME`, `APPROVE_EXPENSE`,
`ADD_CASH_TRANSFER` — must keep the books consistent. Treat any change to these cases,
or any new case that moves money, as accounting-critical: see the
[accounting-reviewer](../agents/accounting-reviewer.md) agent and
`/review-money-flow` command before merging.

## What "consistent" means here

1. **`chartOfAccounts` balances and `journalEntries` move together.** A balance change
   via `applyGlMovements`/direct `.map()` without a corresponding `journalEntries` push
   (or vice versa) is a bug — the GL and the audit trail must never disagree. Check both
   sides changed in the same reducer case.
2. **Every journal entry's lines balance**: `sum(debit) === sum(credit)`. When writing
   or reviewing a `journalEntries` push, add up the `lines` by hand — this is the single
   most important check for any accounting change.
3. **Loan control accounts**: `AP_LOAN_CODE` ('2030', Account Payable) carries principal
   approved but not yet disbursed; `AR_LOAN_CODE` ('1130', Account Receivable) carries
   principal already disbursed to a borrower. A loan's life cycle should always move
   between these two, never lose track of principal in between:
   - Reaching "Waiting Disburse" credits AP (`loanPayableDelta`).
   - Disbursing moves the amount from AP to AR (`DISBURSE_LOAN`).
   - Each repayment credits AR back down by the **principal portion only** — interest
     and late fees are income, not principal, and must not touch AR.
4. **Funding account follows loan currency.** Cash in/out must be posted against the
   real bank account matching the loan's currency via `fundingGLCode(...)`, not a
   hardcoded bucket — a USD loan's disbursement/repayment must not land on a KHR
   account's GL code.
5. **Rounding**: monetary values are rounded with `Math.round(x * 100) / 100`, and
   balance/threshold comparisons use a half-cent tolerance (`+ 0.005` /
   `> 0.005`) to absorb float drift. Follow this convention exactly — a bare `===` or
   `>` on a computed monetary value will intermittently misfire.
6. **Overdraft is refused, not clamped.** `canFundExpense` / `APPROVE_EXPENSE` reject an
   action that would take a funding account negative rather than flooring it at zero
   with `Math.max(0, ...)` — a floored balance silently loses the shortfall with no
   record it happened. Any new money-out path must refuse the same way, not clamp.
7. **Idempotency on re-save**: status-transition logic (see
   [state-and-persistence.md](state-and-persistence.md)) exists specifically so that
   re-dispatching an update to an already-transitioned record doesn't double-post. Any
   new transition-driven posting must branch on `prevStatus !== nextStatus`, not on
   `nextStatus` alone.

## Before you ship a change touching money

Manually trace one example transaction end-to-end (approval → disbursement →
repayment, or whichever stage changed) and confirm: the chart of accounts balance
change, the journal entry's balanced lines, and the correct control account(s) all
agree with what a real loan officer would expect to see in the ledger.
