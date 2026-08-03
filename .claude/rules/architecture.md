# Project architecture

Acabar is a **client-only** microfinance back-office app: customer onboarding, loan
origination/approval/disbursement/repayment, payroll, general-ledger accounting, and
reporting. There is no backend and no API layer — everything lives in the browser.

## Stack

- React 18 + Vite 6, plain JS (no TypeScript).
- Tailwind CSS for all styling (`tailwind.config.js`, `src/globals.css`), with
  shadcn/ui as the base component library for new UI — see
  [shadcn-ui.md](shadcn-ui.md).
- `@` resolves to `src/` (see `vite.config.js` / `jsconfig.json`) — used by shadcn
  imports (`@/components/ui/...`, `@/lib/utils`) and available anywhere.
- `lucide-react` for icons, `jspdf`/`jspdf-autotable`/`html2canvas` for PDF export,
  `pdfjs-dist` for parsing uploaded PDFs (bank statements, payslips, CBC reports).
- No router. `state.activeTab` in the global reducer picks which page renders
  (see [App.jsx](../../src/App.jsx)).
- No test framework is installed. Correctness is verified by `npm run build`
  (Vite/esbuild will fail on bad imports/syntax) plus the manual smoke pass in `/qa`
  — see [qa-full-check](../skills/qa-full-check/SKILL.md).

## Layout

- `src/context/AppContext.jsx` — the entire app state: one `useReducer`, one Context.
  This is the most important file in the repo; read
  [state-and-persistence.md](state-and-persistence.md) and
  [accounting-integrity.md](accounting-integrity.md) before touching it.
- `src/components/<domain>/` — UI grouped by domain: `customers`, `loans`, `accounting`,
  `payroll`, `reports`, `reminders`, `settings`, `integration`, plus `layout` (shell/nav),
  `shared` (hand-built reusable primitives), and `ui` (shadcn/ui primitives — see
  [shadcn-ui.md](shadcn-ui.md)). Reuse `shared/` and `ui/` before writing new markup.
- `src/lib/utils.js` — the shadcn `cn()` class-merging helper. Not a general dumping
  ground; domain helpers still belong in `src/utils/`.
- `src/utils/` — pure functions: formatting (`format.js`), PDF export/parsing
  (`exportPdf.js`, `parseBankStatement.js`, `parseCbcReport.js`, `parsePayslip.js`,
  `parseEmploymentCert.js`, `pdfText.js`), and domain calculators (`income.js`,
  `expense.js`, `riskAssessment.js`, `reminders.js`, `employee.js`).
- `src/data/` — `constants.js` (dropdown option lists, doc-type maps) and
  `mockData.js` (seed/demo data used as the fallback when nothing is persisted yet).
- The legacy `index.html` / `css/style.css` / `js/app.js` at the repo root are a
  pre-React static prototype. The live app is the Vite one rooted at `src/main.jsx`;
  don't edit the root-level `js/`/`css/` expecting it to affect the running app.
- `dist/` is a build artifact (gitignored) — never hand-edit it.

## Currency & locale

The app handles both USD and KHR (Cambodian riel) side by side — loans, bank accounts,
and journal lines all carry a `currency` field. Cambodia-specific domain vocabulary
(province/district/commune/village addressing, NBC-style chart of accounts, CBC credit
report) is intentional, not an error — see [constants.js](../../src/data/constants.js)
and `src/utils/parseCbcReport.js` before "simplifying" anything that looks unfamiliar.
