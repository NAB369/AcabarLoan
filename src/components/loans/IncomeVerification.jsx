import { useState, useMemo, useEffect } from 'react'
import {
  Briefcase, Building, MapPin, Wallet, Pencil, Trash2,
  Download, Eye, CheckCircle2, AlertTriangle, Info,
} from 'lucide-react'
import { formatVal } from '../../utils/format'
import { VerificationBadge, descriptionToneCls } from '../shared/DocBadges'
import {
  BUSINESS_OCCUPATIONS, INCOME_FIELD, INCOME_LIST_FIELD, INCOME_LABEL, INCOME_TARGETS,
  getIncomeProofDocTypes, getIncomeCompanyDocTypes, fileNameMatchesAny, hasWorkplace,
  getVerification, deriveVerifyStatus, normalizeVerifyStatus,
  VERIFY_STATUS, VERIFY_STATUS_STYLE,
} from '../../utils/income'
import { hasParty } from '../../utils/loanParties'
import PartyTabs from './PartyTabs'
import AddMenu from './AddMenu'
import { combineStatementAnalyses, detectBankFromFileName, formatMonth } from '../../utils/parseBankStatement'
import { assessStatementIncome, deriveStatementIncome, DOC_STATUS } from '../../utils/statementIncome'
import { assessPayslipIncome, derivePayslipIncome } from '../../utils/parsePayslip'
import { assessEmploymentCert, describeEmploymentCert } from '../../utils/parseEmploymentCert'

// What each document is verified against. Every type the app asks for is listed, so no row
// can turn up with nothing to check it by.
//   company  — the company/employer name is on the file
//   borrower — the name of the party this income belongs to is on the file
//   deposits — the recurring income the statement shows month by month, against the declared
//              figure. No name is checked on a statement: three months of deposits that come to
//              the declared income is the whole of what it is filed for.
//   salary   — the pay the payslip states, read off the payslip itself
//   names    — the employer and the party, read off the certificate's own text
//
// The certificate keeps the two file-name checks beside its content check: they are what a file
// with no text layer to read falls back on — see CONTENT_VERDICT.
const DOC_CHECKS = {
  'Payslips': ['salary'],
  'Bank Statement': ['deposits'],
  'Certificate of Employment': ['names', 'company', 'borrower'],
  'Work Place Image': ['company'],
  'Business License': ['borrower'],
  'Rent Agreement': ['borrower'],
}

// The checks that read nothing but the file's name. The other kinds are answered by reading the
// document itself — see CONTENT_VERDICT — and never by what the file happens to be called.
const NAME_CHECKS = ['company', 'borrower']

// The document types the app can actually read. A statement and a payslip are read against the
// declared income; a certificate of employment is read for the names printed on it. Every other
// type has only its file name to go on.
const CONTENT_VERDICT = {
  'Bank Statement': (doc, ctx) => assessStatementIncome(doc?.analysis || null, ctx.declared),
  'Payslips': (doc, ctx) => assessPayslipIncome(doc?.analysis || null, ctx.declared, ctx.sourceCount),
  // A certificate with no reading against it was either seeded, filed before the reader existed,
  // or has no text layer at all. Its file name is then all there is, so the old name check still
  // runs — and the row says that is what it ran on, rather than passing the file off as read.
  'Certificate of Employment': (doc, ctx) => (
    doc?.analysis ? assessEmploymentCert(doc.analysis, ctx) : fileNameVerdict(doc, ctx)
  ),
}

// The fallback verdict for a document that could not be read: its file name, checked against the
// names it should carry. Deliberately no better than it was — a name in a file name is typed by
// whoever saved the file, so a row resting on one says so in its reason.
function fileNameVerdict(doc, ctx) {
  if (!doc) return { state: DOC_STATUS.unverified, reason: 'No file uploaded yet', verified: null }
  const results = checkDoc(doc, ctx)
  const ok = results.length > 0 && results.every(r => r.ok)
  return {
    state: ok ? DOC_STATUS.verified : DOC_STATUS.unverified,
    reason: `Nothing could be read off this file, so only its name was checked — ${explainChecks(doc, results)}`,
    verified: null,
  }
}

// Runs one document's name checks. A type in CONTENT_VERDICT never reaches here — its verdict
// comes out of the document rather than off the label.
function checkDoc(doc, ctx) {
  return (DOC_CHECKS[doc.docType] || []).filter(c => NAME_CHECKS.includes(c)).map(check => {
    if (check === 'company') {
      return { check, ok: fileNameMatchesAny(doc.name, [ctx.companyName].filter(Boolean)) }
    }
    return { check, ok: fileNameMatchesAny(doc.name, ctx.borrowerNames) }
  })
}

const CHECK_LABELS = { company: 'company name', borrower: 'borrower name' }

// "a, b and c" — the checks a row ran are listed in prose, since a cell reading
// "company name, borrower name" leaves it unsaid whether both had to match or either would do.
function joinList(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items.join('')
}

// Parts of a description, joined and sentence-cased. Written lowercase at each site so a part
// reads the same wherever in the cell it ends up.
function sentence(parts) {
  const text = parts.filter(Boolean).join(' · ')
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

const checkLabels = results => results.map(r => CHECK_LABELS[r.check] || r.check)

// ── The Description column ─────────────────────────────────────────────────────
// What the document was actually checked against, and how each check went. The Status column
// carries the one-word verdict; this says what that verdict is a verdict on, which is what a
// reviewer needs to act on a row rather than merely see it failed.

// For a document with nothing but its file name to go on: which names were looked for in it,
// split into the ones found and the ones not.
function describeNameChecks(results) {
  if (!results.length) return 'no automatic check applies to this document type'
  const matched = checkLabels(results.filter(r => r.ok))
  const missed = checkLabels(results.filter(r => !r.ok))
  if (!missed.length) return `matched ${joinList(matched)}`
  if (!matched.length) return `no match for ${joinList(missed)}`
  return `matched ${joinList(matched)} · no match for ${joinList(missed)}`
}

// For a document the app can read: what was found inside it. The issuing bank is left out —
// the row has a Bank column of its own, and repeating it here would crowd out the check.
const CONTENT_DESCRIPTION = {
  'Payslips': (ctx, doc) => {
    const reading = derivePayslipIncome(doc.analysis)
    return sentence([
      // Whose payslip it is comes off the payslip itself where the reader found a name on it,
      // which is better evidence of that than the employer the application declares.
      doc.analysis?.employee && `pay to ${doc.analysis.employee}`,
      reading
        ? `states ${reading.basis} pay of ${reading.periodAmount.toFixed(2)}`
          + (reading.multiplier === 1 ? ' per month' : ` ${reading.frequency}`)
        : 'no pay figure could be read off it',
    ])
  },
  // A statement is checked against no name at all. What it is for is the income itself: the
  // deposits it shows month by month, and whether those come to what was declared. So the cell
  // lists the months collected and what each brought in — the evidence the verdict rests on, laid
  // out so a reviewer can read it against the declared figure rather than take the verdict's word
  // for it. Only recurring deposits are counted, which is why a month can read lower than the
  // total paid into the account that month.
  'Bank Statement': (ctx, doc) => {
    const analysis = doc.analysis
    const reading = deriveStatementIncome(analysis)
    if (!reading) return 'No text layer to read — a photo or flat scan, so enter the income by hand'
    // Which half of the reader failed. A statement whose transaction table could not be followed
    // is a layout problem, not an empty account, and the row count is what tells the two apart:
    // rows found but unclassified means the columns were not recognised; none found at all means
    // the reader never located the table.
    if (!reading.monthsCount) {
      return analysis.transactionCount
        ? `${analysis.transactionCount} dated rows found, but none could be read as money in or out`
          + ' — enter the income by hand'
        : 'No dated transaction rows could be found — this layout is one the reader cannot follow,'
          + ' so enter the income by hand'
    }
    if (!(analysis.credits || []).length) {
      return `${reading.monthsCount} months read, but only money out — no deposits on it to read an income from`
    }
    const months = reading.monthsUsed.map((month, i) => `${formatMonth(month)} ${reading.perMonth[i].toFixed(2)}`)
    if (!reading.recurringMonthly) {
      return `${reading.monthsCount} months of deposits read, but no deposit recurs across them`
    }
    return `${months.join(' · ')} → ${reading.recurringMonthly.toFixed(2)}/month`
  },
  // Which names the certificate carries, and the employment it certifies — off the page itself.
  // A file that could not be read says what its name was checked against instead, so the cell
  // never implies the document was opened when it wasn't.
  'Certificate of Employment': (ctx, doc) => sentence([
    doc.analysis
      ? describeEmploymentCert(doc.analysis, ctx)
      : `file name only — ${describeNameChecks(checkDoc(doc, ctx))}`,
  ]),
}

// Why the status reads as it does, for the Status pill's tooltip. Unverified without a reason
// leaves a reviewer nothing to act on — and the reason is already computed here.
function explainChecks(doc, results) {
  if (!doc) return 'No file uploaded yet'
  if (!results.length) return 'No automatic check applies to this document type'
  return results
    .map(r => sentence([`${CHECK_LABELS[r.check] || r.check} ${r.ok ? 'matched' : 'not matched'}${r.detail ? ` — ${r.detail}` : ''}`]))
    .join(' · ')
}

// One row per document type expected of an income entry — or one per file where a type has
// several — each with its checks. A type with nothing against it still gets a row, so a gap
// stays visible rather than absent.
function documentRows(info, ctx) {
  const proofDocs = info?.documents || []
  const companyDocs = info?.companyDocuments || []
  const groups = [
    ...getIncomeProofDocTypes(info?.employmentStatus, info?.occupation).map(type => ({ type, pool: proofDocs })),
    ...(hasWorkplace(info?.employmentStatus) ? getIncomeCompanyDocTypes(info?.employmentStatus) : [])
      .map(type => ({ type, pool: companyDocs })),
  ]
  return groups.flatMap(({ type, pool }) => {
    // A type with no file on it describes nothing at all, so its cell stays empty rather than
    // describing a document that isn't there.
    const make = doc => {
      // A statement and a payslip both carry their own evidence, so each gets the four-state
      // verdict off what was read out of it. Every other type has only its file name to go on,
      // and stays binary.
      const readContent = CONTENT_VERDICT[type]
      if (readContent) {
        const verdict = readContent(doc, ctx)
        return {
          type,
          doc,
          description: doc ? CONTENT_DESCRIPTION[type](ctx, doc) : '',
          status: doc ? verdict.state : DOC_STATUS.unverified,
          reason: doc ? verdict.reason : 'No file uploaded yet',
          verifiedIncome: doc ? verdict.verified : null,
        }
      }
      const results = doc ? checkDoc(doc, ctx) : []
      return {
        type,
        doc,
        description: doc ? sentence([describeNameChecks(results)]) : '',
        reason: explainChecks(doc, results),
        status: doc && results.length > 0 && results.every(r => r.ok) ? DOC_STATUS.verified : DOC_STATUS.unverified,
      }
    }
    const found = pool.filter(d => d.docType === type)
    return found.length ? found.map(make) : [make(null)]
  })
}

// The Bank column: only a statement has an issuing bank, and it is read off the statement's
// own header rather than asked for at upload. A statement that names no bank the reader knows
// says so, which is a different thing from a document type that has no bank at all.
function bankCell(type, doc) {
  if (type !== 'Bank Statement') return <span className="text-slate-300 dark:text-slate-600">—</span>
  // A statement filed before the reader could name its bank — or one with no text layer for it
  // to read — still often carries the bank in its file name.
  const bank = doc?.analysis?.bank || doc?.bank || detectBankFromFileName(doc?.name)
  if (bank) return <span className="font-semibold text-slate-700 dark:text-slate-200">{bank}</span>
  return <span className="text-slate-400 dark:text-slate-500">{doc ? 'Not detected' : '—'}</span>
}

// The income entry is verified once every document expected of it is — fully. A statement that
// only partly stands up, or one that demonstrates a smaller income than was declared, is a
// finding for a reviewer to settle, so neither carries the entry on its own.
function allDocsVerified(rows) {
  return rows.length > 0 && rows.every(r => r.status === DOC_STATUS.verified)
}

const cardCls = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl'
const ghostBtnCls = 'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors'
// The Collateral tab's Add button, to the letter — the two tabs share the same sticky bar.

function isImageDoc(doc) {
  return !!doc && (doc.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(doc.name || ''))
}

function StatusPill({ status }) {
  if (!status) return null
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold whitespace-nowrap ${VERIFY_STATUS_STYLE[status] || VERIFY_STATUS_STYLE[VERIFY_STATUS.unverified]}`}>
      {status}
    </span>
  )
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

function Field({ label, value, icon: Icon }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 mb-0.5">
        {Icon && <Icon className="w-3 h-3 text-slate-400 flex-shrink-0" />}
        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide truncate">{label}</p>
      </div>
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-words">{value || 'N/A'}</p>
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

export default function IncomeVerification({
  loan, currency, isDisbursed,
  onAddIncome, onEditIncome, onRemoveIncome, onViewDoc, candidateNamesFor,
}) {
  // Flat list of every income entry on the loan — one tab each, so a party with two
  // incomes needs no extra control to reach the second.
  const entries = useMemo(() => INCOME_TARGETS.flatMap(target => {
    const list = loan[INCOME_LIST_FIELD[target]] || (loan[INCOME_FIELD[target]] ? [loan[INCOME_FIELD[target]]] : [])
    return list.map((info, idx) => ({ key: `${target}:${idx}`, target, idx, info, label: INCOME_LABEL[target] }))
  }), [loan])

  // A co-borrower or guarantor is added on the Customer tab. Until one is, there is no party
  // to record an income for, so no button offering it. Entries already on the loan still get
  // their tab below whatever this says — nothing recorded is ever hidden.
  const addTargets = INCOME_TARGETS.filter(t => hasParty(loan, t))

  // With nothing recorded the tab still renders its real layout against a blank record, rather
  // than a placeholder card: the operator sees the shape of what they are about to fill in, and
  // the screen does not change form the moment the first entry lands. `blank` is what tells the
  // panel there is no record behind it to edit or remove.
  const BLANK = { key: 'borrower:blank', target: 'borrower', idx: 0, info: {}, label: INCOME_LABEL.borrower, blank: true }
  const tabEntries = entries.length ? entries : [BLANK]

  const [activeKey, setActiveKey] = useState(entries[0]?.key || '')
  const active = tabEntries.find(e => e.key === activeKey) || tabEntries[0]

  useEffect(() => {
    if (entries.length && !entries.some(e => e.key === activeKey)) setActiveKey(entries[0].key)
  }, [entries, activeKey])

  const info = active?.info || null
  const salaried = hasWorkplace(info?.employmentStatus)
  const isBusiness = BUSINESS_OCCUPATIONS.includes(info?.occupation)
  const declared = info?.totalMonthlyIncome || 0

  // ── What the bank statements say ──
  const analysis = useMemo(() => combineStatementAnalyses(info?.documents), [info?.documents])
  // A statement on file that produced no reading is a different problem from none on file.
  const hasStatement = (info?.documents || []).some(d => d.docType === 'Bank Statement')
  // What every statement filed against this entry demonstrates about the income, together.
  const statementIncome = useMemo(() => assessStatementIncome(analysis, declared), [analysis, declared])

  // ── Documents ──
  // Everything the document checks compare against, per entry — the roll-up walks them all,
  // so this cannot be taken from the active entry alone.
  const checkContext = e => ({
    companyName: e.info?.companyName || '',
    borrowerNames: candidateNamesFor?.(e.target) || [],
    declared: e.info?.totalMonthlyIncome || 0,
    // A payslip states a salary, not a total. How many sources the entry declares is what
    // separates a payslip that falls short from one that was only ever part of the picture.
    sourceCount: (e.info?.sources || []).length || 1,
    currency,
  })
  const docTableRows = active ? documentRows(info, checkContext(active)) : []

  // ── Status: an entry is verified once every document expected of it is ──
  const statuses = useMemo(
    () => new Map(tabEntries.map(e => [
      e.key,
      deriveVerifyStatus(e.info, allDocsVerified(documentRows(e.info, checkContext(e)))),
    ])),
    [tabEntries],
  )
  const historyRows = entries
    .flatMap(e => (getVerification(e.info).history || [])
      .map(h => ({ ...h, status: normalizeVerifyStatus(h.status), party: h.party || e.label })))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))

  const addAction = !isDisbursed ? (
    <AddMenu
      options={addTargets.map(t => ({ id: t, label: `${INCOME_LABEL[t]} Income` }))}
      onSelect={onAddIncome}
      iconOnly
    />
  ) : null

  return (
    <div className="space-y-4 pt-4">
      {/* Same party tab bar as the CBC tab: the party, whose income it is, and where its
          verification stands. One tab per entry, so a party with two incomes needs no extra
          control to reach the second. Adding one is the single Add beside the tabs — which
          party an income belongs to is the whole of the choice, so it is what the menu lists. */}
      <PartyTabs
        idPrefix="income"
        ariaLabel="Income by party"
        activeId={active.key}
        onSelect={setActiveKey}
        items={tabEntries.map(e => {
          const sameParty = tabEntries.filter(x => x.target === e.target).length > 1
          return {
            id: e.key,
            label: `${e.label}${sameParty ? ` #${e.idx + 1}` : ''}`,
            subtitle: candidateNamesFor?.(e.target)?.[0],
            // Nothing on file is said in words. A verification pill over a blank record would
            // report a verdict on evidence nobody has filed yet.
            count: 0,
            pill: e.blank ? undefined : <StatusPill status={statuses.get(e.key)} />,
          }
        })}
        actions={addAction}
      />

      <div>
        {/* ── Evidence: who they work for, and what the bank shows ── */}
        <div className="min-w-0 space-y-4">
          <div className={cardCls}>
            <SectionHead title="Employment & Income" badge={active.blank ? null : <StatusPill status={statuses.get(active.key)} />}>
              {/* Edit is where an operator looks to put the figures in, so on a blank record it
                  opens the same form the + does rather than being absent. Remove is not there:
                  there is no record to remove yet. */}
              {!isDisbursed && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => (active.blank ? onAddIncome(active.target) : onEditIncome(active.target, active.idx))}
                    className={ghostBtnCls}
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                  {!active.blank && (
                  <button
                    onClick={() => onRemoveIncome(active.target, active.idx)}
                    title="Remove this income entry"
                    className="p-1.5 text-[11px] font-semibold rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  )}
                </div>
              )}
            </SectionHead>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Field label="Occupation" value={info.occupation} icon={Briefcase} />
                <Field label={isBusiness ? 'Business Type' : 'Employment'} value={info.employmentStatus} icon={Building} />
                <Field
                  label={salaried ? (info.employmentStatus === 'Part-time' ? 'Work Place' : 'Company Name') : 'Business Name'}
                  value={info.companyName}
                  icon={Building}
                />
                <Field
                  label={salaried ? (info.employmentStatus === 'Part-time' ? 'Work Place Address' : 'Company Address') : 'Business Address'}
                  value={info.companyAddress}
                  icon={MapPin}
                />
                <Field label="Income" value={`${formatVal(declared, currency, 1)} / month`} icon={Wallet} />
              </div>

              {/* What the statements demonstrate about the income itself. Whose statement it is
                  is no longer said here — that is a fact about a particular document, so it sits
                  on that document's row in the table below. Stated in figures, since this is
                  what the capacity is sized on. */}
              {hasStatement && analysis && (
                <Finding ok={statementIncome.state === DOC_STATUS.verified ? true : statementIncome.state === DOC_STATUS.unverified ? false : null}>
                  {statementIncome.reason}
                  {statementIncome.state === DOC_STATUS.lower && (
                    <> Repayment capacity is measured on {formatVal(statementIncome.verified, currency, 1)}/month, not the declared figure.</>
                  )}
                </Finding>
              )}
            </div>
          </div>

          <div className={cardCls}>
            <SectionHead title="Verification Documents" />
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
                  {docTableRows.map(({ type, doc, status, description, reason }, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{type}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {doc
                          ? <span className="block truncate max-w-[220px]" title={doc.name}>{doc.name}</span>
                          : <span className="text-slate-400 dark:text-slate-500">No file uploaded</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{bankCell(type, doc)}</td>
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
                  {docTableRows.length === 0 && (
                    <tr className="border-t border-slate-100 dark:border-slate-700">
                      <td colSpan={6} className="px-4 py-4 text-center text-slate-400 dark:text-slate-500">
                        No document types apply to this income type.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Verification history — every decision recorded across all income entries */}
      {historyRows.length > 0 && (
        <div className={cardCls}>
          <SectionHead title="Verification History" subtitle={`${historyRows.length} entr${historyRows.length === 1 ? 'y' : 'ies'}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/40 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Date &amp; Time</th>
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Party</th>
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">Status</th>
                  <th className="px-4 py-2 text-left font-semibold whitespace-nowrap">By</th>
                  <th className="px-4 py-2 text-left font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((h, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{h.timestamp}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{h.party}</td>
                    <td className="px-4 py-2.5"><StatusPill status={h.status} /></td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">{h.performedBy} · {h.role}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{h.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
