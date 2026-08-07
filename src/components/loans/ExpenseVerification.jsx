import { useState, useMemo, useEffect } from 'react'
import {
  Wallet, Pencil, Trash2,
  Download, Eye, CheckCircle2, AlertTriangle, Info, Calendar,
} from 'lucide-react'
import { formatVal } from '../../utils/format'
import { VerificationBadge, descriptionToneCls } from '../shared/DocBadges'
import { EXPENSE_TARGETS, EXPENSE_FIELD, EXPENSE_LABEL, EXPENSE_DOC_TYPES } from '../../utils/expense'
import { hasParty, partyName } from '../../utils/loanParties'
import PartyTabs from './PartyTabs'
import AddMenu from './AddMenu'
import { combineStatementAnalyses, detectBankFromFileName, formatMonth } from '../../utils/parseBankStatement'
import {
  assessStatementExpense, deriveStatementExpense, EXPENSE_MONTHS_REQUIRED, EXPENSE_STATUS,
} from '../../utils/statementExpense'

// The expense tab is laid out like the income tab — one card for what was declared, one for what
// the bank statements show, one for the documents — because a reviewer works both the same way:
// read the declaration, read the evidence, decide. What differs is the evidence itself. An income
// is verified by finding a recurring deposit; spending has no such pattern, so it is verified by
// totalling six months of money out and dividing by six. See utils/statementExpense.

const cardCls = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl'
const ghostBtnCls = 'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors'

function isImageDoc(doc) {
  return !!doc && (doc.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(doc.name || ''))
}

// `badge` sits inline with the title; `children` are the section's actions, pushed right.
function SectionHead({ title, subtitle, badge, children }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{title}</p>
          {badge}
        </div>
        {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// A finding the reader produced, shown for or against the declaration.
function Finding({ ok, children }) {
  const tone = ok === null
    ? 'bg-slate-50 text-slate-500 dark:bg-slate-900/40 dark:text-slate-400'
    : ok
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
  const Icon = ok === null ? Info : ok ? CheckCircle2 : AlertTriangle
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-xl text-[11px] ${tone}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

// One step of the arithmetic the process spells out: total, divisor, result.
function Step({ label, value, hint, strong }) {
  return (
    <div className={`px-3 py-2.5 rounded-xl ${strong ? 'bg-brand-50 dark:bg-brand-900/20' : 'bg-slate-50 dark:bg-slate-900/50'}`}>
      <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`font-bold mt-0.5 ${strong ? 'text-sm text-[#0047ab] dark:text-brand-400' : 'text-sm text-slate-700 dark:text-slate-200'}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{hint}</p>}
    </div>
  )
}

// The bank a statement came from, read off the statement's own header rather than asked for at
// upload. A statement that names no bank the reader knows still often carries it in its file name.
function bankCell(doc) {
  const bank = doc?.analysis?.bank || doc?.bank || detectBankFromFileName(doc?.name)
  if (bank) return <span className="font-semibold text-slate-700 dark:text-slate-200">{bank}</span>
  return <span className="text-slate-400 dark:text-slate-500">{doc ? 'Not detected' : '—'}</span>
}

// Where one statement came from and what period it covers. Whether it stands up is the Status
// column's job — a type with no file on it says nothing at all, so the cell stays empty.
function describeStatement(doc) {
  if (!doc) return ''
  const bank = doc.analysis?.bank || doc.bank
  const holder = doc.analysis?.accountName
  const months = doc.analysis?.months || []
  const period = months.length
    ? `${formatMonth(months[0].month)} – ${formatMonth(months[months.length - 1].month)}`
    : ''
  return [
    `Issued by ${bank || "the applicant's bank"}`,
    holder ? `account of ${holder}` : '',
    period,
  ].filter(Boolean).join(' · ')
}

export default function ExpenseVerification({
  loan, currency, isDisbursed, onAddExpense, onEditExpense, onRemoveExpense, onViewDoc,
}) {
  // One tab per party with an expense record on file. A party the loan may not even have gets
  // no tab — the Add menu is how one is brought into existence.
  const entries = useMemo(() => EXPENSE_TARGETS
    .filter(target => loan[EXPENSE_FIELD[target]])
    .map(target => ({ key: target, target, info: loan[EXPENSE_FIELD[target]], label: EXPENSE_LABEL[target] })), [loan])

  // With nothing recorded the tab still renders its real layout against a blank record, rather
  // than a placeholder card — see IncomeVerification, which this tab matches. `blank` is what
  // tells the panel there is no record behind it to edit or remove.
  const BLANK = { key: 'borrower', target: 'borrower', info: {}, label: EXPENSE_LABEL.borrower, blank: true }
  const tabEntries = entries.length ? entries : [BLANK]

  const [activeKey, setActiveKey] = useState(entries[0]?.key || '')
  const active = tabEntries.find(e => e.key === activeKey) || tabEntries[0]

  // A party holds one expense record, so only the parties without one can still be added — the
  // rest are reached through their own tab's Edit. A co-borrower or guarantor the loan does not
  // have is not offered at all; one is added on the Customer tab, not here.
  const addTargets = EXPENSE_TARGETS.filter(t => hasParty(loan, t) && !loan[EXPENSE_FIELD[t]])

  useEffect(() => {
    if (entries.length && !entries.some(e => e.key === activeKey)) setActiveKey(entries[0].key)
  }, [entries, activeKey])

  const info = active?.info || null
  const declared = info?.totalMonthlyExpense || 0
  const lines = info?.expenses || []

  // ── What the bank statements say ──
  // Every statement filed against the record, read as one: six monthly PDFs and one six-month
  // PDF have to come to the same figure.
  const analysis = useMemo(() => combineStatementAnalyses(info?.documents), [info?.documents])
  const verdict = useMemo(() => assessStatementExpense(analysis, declared), [analysis, declared])
  const reading = verdict.reading
  const statements = (info?.documents || []).filter(d => d.docType === 'Bank Statement')
  const hasStatement = statements.length > 0

  // The verdict per party, for the tab pills — computed across every record, so it cannot be
  // taken from the active one alone.
  const statuses = useMemo(() => new Map(tabEntries.map(e => [
    e.key,
    assessStatementExpense(combineStatementAnalyses(e.info?.documents), e.info?.totalMonthlyExpense || 0).state,
  ])), [tabEntries])

  const money = amount => formatVal(amount, currency, 1)

  // What one statement on its own contributes. The six-month sufficiency question is settled
  // once, on the section above, across all of them — so a row says only whether this file could
  // be read and what came out of it, never that a single month failed a six-month test.
  function statementRow(doc) {
    const base = { doc, type: EXPENSE_DOC_TYPES[0], description: describeStatement(doc) }
    if (!doc) return { ...base, status: EXPENSE_STATUS.unverified, reason: 'No file uploaded yet' }
    const own = deriveStatementExpense(doc.analysis || null)
    if (!own) {
      return {
        ...base,
        status: EXPENSE_STATUS.unverified,
        reason: 'Nothing could be read off this file — a scan or photo with no text layer. Confirm it by hand',
      }
    }
    if (!own.total) {
      return {
        ...base,
        status: EXPENSE_STATUS.unverified,
        reason: own.monthsCount === 0
          ? 'Its transaction table could not be followed — confirm the spending by hand'
          : 'No money-out rows could be read off it',
      }
    }
    const read = `${own.monthsCount} month${own.monthsCount === 1 ? '' : 's'} read · ${money(own.total)} out`
    if (own.reconciliation.checked && !own.reconciliation.ok) {
      return {
        ...base,
        status: EXPENSE_STATUS.partial,
        reason: `${read}, but it does not foot against its ${own.reconciliation.basis} — confirm it by hand`,
      }
    }
    if (own.coverage !== null && own.coverage < 70) {
      return {
        ...base,
        status: EXPENSE_STATUS.partial,
        reason: `${read}, but only ${own.coverage}% of its transaction rows could be classified`,
      }
    }
    return { ...base, status: EXPENSE_STATUS.verified, reason: read }
  }

  // A statement row always shows, even with nothing against it, so the gap stays visible. Files
  // of any other type are listed after it rather than dropped — the expense record no longer asks
  // for receipts or invoices, but one already uploaded must not quietly disappear from the table.
  const docTableRows = [
    ...(hasStatement ? statements.map(statementRow) : [statementRow(null)]),
    ...(info?.documents || []).filter(d => d.docType !== 'Bank Statement').map(d => ({
      doc: d,
      type: d.docType || 'Document',
      status: null,
      reason: '',
      description: 'Kept from an earlier upload — only a bank statement is asked for now',
    })),
  ]

  const addAction = !isDisbursed ? (
    <AddMenu
      options={addTargets.map(t => ({ id: t, label: `${EXPENSE_LABEL[t]} Expense` }))}
      onSelect={onAddExpense}
      iconOnly
    />
  ) : null

  return (
    <div className="space-y-4 pt-4">
      {/* Same party tab bar as the CBC tab: the party, whose expenses they are, and where the
          bank-statement check stands. Adding one is the single Add beside the tabs — which
          party an expense belongs to is the whole of the choice, so it is what the menu lists. */}
      <PartyTabs
        idPrefix="expense"
        ariaLabel="Expenses by party"
        activeId={active.key}
        onSelect={setActiveKey}
        items={tabEntries.map(e => ({
          id: e.key,
          label: e.label,
          subtitle: partyName(loan, e.target),
          // Nothing on file is said in words. A verdict pill over a blank record would report
          // on evidence nobody has filed yet.
          count: 0,
          pill: e.blank ? undefined : (
            <VerificationBadge
              status={statuses.get(e.key)}
              title={`Bank statement verdict for the ${e.label.toLowerCase()} expenses`}
            />
          ),
        }))}
        actions={addAction}
      />

      <div className="min-w-0 space-y-4">
        {/* ── What was declared: the expense types, with the amount against each ── */}
        <div className={cardCls}>
          <SectionHead
            title="Monthly Expenses"
            subtitle={`${lines.length} expense type${lines.length === 1 ? '' : 's'} declared`}
            badge={active.blank ? null : <VerificationBadge status={statuses.get(active.key)} title={verdict.reason} />}
          >
            {/* Edit is where an operator looks to put the figures in, so on a blank record it
                opens the same form the + does rather than being absent. Remove is not there:
                there is no record to remove yet. */}
            {!isDisbursed && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => onEditExpense(active.target)} className={ghostBtnCls}>
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                {!active.blank && (
                <button
                  onClick={() => onRemoveExpense(active.target)}
                  title="Remove this expense record"
                  className="p-1.5 text-[11px] font-semibold rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
                )}
              </div>
            )}
          </SectionHead>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Expense Type</th>
                  <th className="px-4 py-2 text-left font-semibold">Notes</th>
                  <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Amount / Month</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((e, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{e.category || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{e.notes || ''}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      {money(parseFloat(e.amount) || 0)}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr className="border-t border-slate-100 dark:border-slate-700">
                    <td colSpan={3} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500">
                      No expense types recorded — edit this record to break the monthly total down.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40">
                  <td colSpan={2} className="px-4 py-2.5 font-bold text-slate-600 dark:text-slate-300">Total Monthly Expense</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{money(declared)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── What the statements show: six months of money out, averaged ── */}
        <div className={cardCls}>
          <SectionHead
            title={`Bank Statement — ${EXPENSE_MONTHS_REQUIRED}-Month Spending`}
            subtitle={`Money out is totalled across ${EXPENSE_MONTHS_REQUIRED} months and divided by ${EXPENSE_MONTHS_REQUIRED} — a single month is a bad month or a quiet one`}
          />
          <div className="p-4 space-y-3">
            {!hasStatement ? (
              <div className="py-6 flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No bank statement on file</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center max-w-sm">
                  Upload {EXPENSE_MONTHS_REQUIRED} months of statements — as one file or one per month.
                  Until then the declared budget is all there is.
                </p>
              </div>
            ) : !reading ? (
              <Finding ok={false}>
                {statements.length === 1 ? 'The uploaded bank statement' : 'None of the uploaded bank statements'} could
                not be read — a scan or photo with no text layer, so nothing can be totalled out of it.
                Confirm the spending directly.
              </Finding>
            ) : reading.monthsCount === 0 ? (
              <Finding ok={false}>
                {statements.length === 1 ? 'The uploaded bank statement has' : 'The uploaded bank statements have'} readable
                text, but no dated transaction rows could be matched off {statements.length === 1 ? 'it' : 'them'} — this
                layout is one the reader cannot follow. Confirm the spending directly.
              </Finding>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Month</th>
                        <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Transactions</th>
                        <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Money Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reading.months.map(m => (
                        <tr key={m.month} className="border-t border-slate-100 dark:border-slate-700">
                          <td className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatMonth(m.month)}</td>
                          <td className="px-4 py-2 text-right text-slate-500 dark:text-slate-400">{m.debitCount || 0}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{money(m.debits || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40">
                        <td colSpan={2} className="px-4 py-2.5 font-bold text-slate-600 dark:text-slate-300">
                          Total over {reading.monthsCount} month{reading.monthsCount === 1 ? '' : 's'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{money(reading.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* The arithmetic, spelled out: this is the figure a reviewer is being asked to
                    trust, so every step of it is on the page. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Step label="Total money out" value={money(reading.total)} hint={`${reading.debitCount} payment${reading.debitCount === 1 ? '' : 's'} read`} />
                  <Step
                    label="Divided by"
                    value={`${reading.monthsCount} month${reading.monthsCount === 1 ? '' : 's'}`}
                    hint={reading.monthsCount < EXPENSE_MONTHS_REQUIRED
                      ? `${EXPENSE_MONTHS_REQUIRED - reading.monthsCount} more to collect`
                      : `${EXPENSE_MONTHS_REQUIRED} months collected`}
                  />
                  <Step label="Really spent / month" value={money(reading.monthlySpend)} hint={`${money(declared)} declared`} strong />
                </div>

                <Finding ok={verdict.state === EXPENSE_STATUS.verified ? true : verdict.state === EXPENSE_STATUS.higher ? false : null}>
                  {verdict.state === EXPENSE_STATUS.verified && (
                    <>The statements show <span className="font-semibold">{money(reading.monthlySpend)}</span> a
                    month going out against <span className="font-semibold">{money(declared)}</span> declared —
                    the expense record is verified.</>
                  )}
                  {verdict.state === EXPENSE_STATUS.higher && (
                    <>The statements show <span className="font-semibold">{money(reading.monthlySpend)}</span> a
                    month going out, <span className="font-semibold">{money(reading.monthlySpend - declared)}</span> more
                    than the {money(declared)} declared — capacity is assessed on the statement figure.</>
                  )}
                  {(verdict.state === EXPENSE_STATUS.partial || verdict.state === EXPENSE_STATUS.unverified) && verdict.reason}
                </Finding>
              </>
            )}
          </div>
        </div>

        {/* ── Documents: the bank statement, and nothing else ── */}
        <div className={cardCls}>
          <SectionHead
            title="Verification Documents"
            subtitle={`Only a bank statement is asked for — ${EXPENSE_MONTHS_REQUIRED} months of it`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Document Type</th>
                  <th className="px-4 py-2 text-left font-semibold">File</th>
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Bank</th>
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Description</th>
                  <th className="px-4 py-2 text-right font-semibold whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docTableRows.map(({ doc, type, status, description, reason }, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{type}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                      {doc
                        ? <span className="block truncate max-w-[220px]" title={doc.name}>{doc.name}</span>
                        : <span className="text-slate-400 dark:text-slate-500">No file uploaded</span>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{bankCell(doc)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <VerificationBadge status={status} title={reason} />
                    </td>
                    <td className={`px-4 py-2.5 ${descriptionToneCls(status)}`}>{description}</td>
                    <td className="px-4 py-2.5">
                      {doc ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onViewDoc(doc, isImageDoc(doc))}
                            disabled={!doc.dataUrl}
                            title="View"
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors disabled:opacity-30"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={doc.dataUrl || undefined}
                            download={doc.name}
                            title="Download"
                            className={`p-1.5 rounded-lg transition-colors ${doc.dataUrl ? 'text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20' : 'text-slate-200 dark:text-slate-700 pointer-events-none'}`}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="flex justify-end text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
