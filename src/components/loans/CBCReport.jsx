import { useState } from 'react'
import { FileText, Eye, ExternalLink, Download, CircleDot, Landmark, Wallet, Ban, Clock, TrendingUp, Pencil, Check, X } from 'lucide-react'
import { formatVal } from '../../utils/format'

const ACCOUNT_STATUS_OPTIONS = ['Normal', 'Delinquent', 'Write-off', 'Closed']

// Counts late cycles in a 24-cycle payment-history code (one character per cycle;
// '0' means on-time, 'X'/'x' means no data yet — anything else counts as late) and
// buckets that count into a plain-language repayment rating.
function analyzePaymentHistory(history) {
  if (!history) return { lateCount: null, rating: null, totalCycles: 0 }
  const totalCycles = history.length
  const lateCount = history.split('').filter(c => c !== '0' && !/x/i.test(c)).length
  const rating = lateCount === 0 ? 'Excellent' : lateCount <= 2 ? 'Good' : lateCount <= 5 ? 'Fair' : 'Poor'
  return { lateCount, rating, totalCycles }
}

function repaymentHistoryText({ lateCount, rating, totalCycles }) {
  if (rating === null) return '—'
  if (lateCount === 0) return `${rating} (${totalCycles} consecutive on-time payments)`
  return `${rating} (${lateCount} late payment${lateCount === 1 ? '' : 's'} in last ${totalCycles} cycles)`
}

// One CBC stat card. When `editable`, hovering reveals a pencil button that swaps the
// value for whatever editor `children` renders (the editor owns its own Save/Cancel).
function CbcCard({ icon: Icon, iconBg, iconColor, label, value, valueColor, editable, editing, onEdit, children }) {
  return (
    <div className="group relative flex items-start gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-w-0">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
        {editing ? children : (
          <p className={`text-sm font-bold leading-snug ${valueColor || 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
        )}
      </div>
      {editable && !editing && (
        <button
          type="button"
          onClick={onEdit}
          title={`Edit ${label}`}
          className="absolute top-2 right-2 p-1 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-opacity flex-shrink-0"
        >
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function EditActions({ onSave, onCancel }) {
  return (
    <>
      <button type="button" onClick={onSave} title="Save" className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex-shrink-0">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onCancel} title="Cancel" className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </>
  )
}

const inputClass = 'text-xs px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-400 min-w-0'

// --- 'report' variant helpers: replicate the CBC report's detailed account blocks ---

// Turns the 24-cycle token array (['ontime','30',…]) into the report's digit code
// ("000003…"): on-time → 0, otherwise the days-late bucket's leading digit (30→3, 60→6…).
function cyclesToCode(cycles) {
  return (cycles || []).map(c => (c === 'ontime' ? '0' : String(c)[0] || '0')).join('')
}

// A green CBC section band (e.g. "ព័ត៌មានសង្ខេប").
function CbcBand({ children }) {
  return (
    <div className="rounded-md bg-gradient-to-r from-green-700 to-green-500 px-4 py-2 shadow-sm">
      <span className="text-sm font-bold text-white tracking-wide">{children}</span>
    </div>
  )
}

// One label/value row inside an account block, matching the report's grey label cell +
// white value cell. `valueClass` colours the value (e.g. account status).
function CbcKV({ label, value, valueClass }) {
  return (
    <div className="flex text-[11px] border-t border-slate-200 dark:border-slate-700">
      <div className="w-2/5 flex-shrink-0 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 leading-snug">{label}</div>
      <div className={`flex-1 px-3 py-2 font-medium leading-snug break-words ${valueClass || 'text-slate-800 dark:text-slate-100'}`}>{value ?? '—'}</div>
    </div>
  )
}

const ACCT_STATUS_CLASS = status =>
  /^(delinquent|write-off|bad)/i.test(status || '') ? 'text-rose-600 dark:text-rose-400'
  : /^closed/i.test(status || '') ? 'text-slate-500 dark:text-slate-400'
  : /^normal/i.test(status || '') ? 'text-green-600 dark:text-green-400'
  : 'text-slate-800 dark:text-slate-100'

// One detailed credit-account block: grey institution header + label/value grid + the
// full 24-cycle payment-history code, mirroring pages 2–4 of the CBC report.
function CbcAccountCard({ acct, currency }) {
  const rows = [
    ['ឈ្មោះផលិតផលឥណទាន', acct.loanType],
    ['ប្រភេទអ្នកខ្ចី', acct.role],
    ['ស្ថានភាពឥណទាន', acct.status, ACCT_STATUS_CLASS(acct.status)],
    ['ចំនួនទឹកប្រាក់កម្ចី', formatVal(acct.creditLimit || 0, currency, 1)],
    ['ចំនួនគ្រា', acct.loanDuration],
    ['ចំនួនទឹកប្រាក់ឥណទានដែលនៅជំពាក់', formatVal(acct.currentBalance || 0, currency, 1)],
  ]
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-3 py-2 bg-slate-200 dark:bg-slate-700">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-100">
          ឈ្មោះគ្រឹះស្ថាន : <span className="text-green-700 dark:text-green-400">{acct.institution || '—'}</span>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {rows.map(([l, v, vc], i) => <CbcKV key={i} label={l} value={v} valueClass={vc} />)}
      </div>
      <div className="flex text-[11px] border-t border-slate-200 dark:border-slate-700">
        <div className="w-2/5 flex-shrink-0 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 leading-snug">ប្រវត្តិទូទាត់សងប្រាក់ ២៤គ្រាចុងក្រោយ</div>
        <div className="flex-1 px-3 py-2 font-mono text-xs tracking-wider text-slate-800 dark:text-slate-100 break-all">{cyclesToCode(acct.cycles)}</div>
      </div>
    </div>
  )
}

// CBC summary: headline numbers entered by the credit officer, plus the uploaded
// report file for the full detail. `hideDocument` skips the file card — use it where
// an editable upload field is shown right below and would otherwise duplicate it.
// `editable` + `onUpdate(patch)` turn on hover-to-edit for the stat cards, merging the
// patch into the party's credit-history info (used pre-disbursement in the loan wizard).
export default function CBCReport({ info, currency = 'USD', onView, hideDocument = false, editable = false, onUpdate, variant = 'cards' }) {
  const reportDoc = (info?.documents || [])[0]
  const isImage = reportDoc && (reportDoc.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(reportDoc.name || ''))

  const [editingKey, setEditingKey] = useState(null)
  const [draft, setDraft] = useState({})

  function startEdit(key, initial) {
    setDraft(initial)
    setEditingKey(key)
  }
  function cancelEdit() {
    setEditingKey(null)
    setDraft({})
  }
  function saveEdit(patch) {
    onUpdate && onUpdate(patch)
    setEditingKey(null)
    setDraft({})
  }

  // Until a CBC report file is actually attached, the summary cards show an empty
  // state — even if the underlying info has values (e.g. leftover manual edits) —
  // so the card never implies a report backs data that hasn't been uploaded yet.
  const hasReport = (info?.documents || []).length > 0
  const neutralColor = 'text-slate-400 dark:text-slate-500'
  const neutralBg = 'bg-slate-100 dark:bg-slate-700'

  const goodStatus = /^(normal|good)/i.test(info?.accountStatus || '')
  const statusColor = hasReport ? (!info?.accountStatus ? neutralColor : goodStatus ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : neutralColor
  const statusBg = hasReport ? (!info?.accountStatus ? neutralBg : goodStatus ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-rose-50 dark:bg-rose-900/30') : neutralBg
  const statusLabel = hasReport ? (!info?.accountStatus ? '—' : goodStatus ? 'Good' : 'At Risk') : '—'

  const badAccounts = info?.badAccounts || 0
  const badColor = hasReport ? (badAccounts > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') : neutralColor
  const badBg = hasReport ? (badAccounts > 0 ? 'bg-rose-50 dark:bg-rose-900/30' : 'bg-emerald-50 dark:bg-emerald-900/30') : neutralBg

  const history = analyzePaymentHistory(info?.paymentHistory24)
  const { lateCount, rating } = history
  const lateColor = hasReport ? (lateCount === null ? neutralColor : lateCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') : neutralColor
  const lateBg = hasReport ? (lateCount === null ? neutralBg : lateCount > 0 ? 'bg-rose-50 dark:bg-rose-900/30' : 'bg-emerald-50 dark:bg-emerald-900/30') : neutralBg
  const ratingColor = hasReport ? (rating === 'Excellent' || rating === 'Good' ? 'text-emerald-600 dark:text-emerald-400' : rating === 'Fair' ? 'text-amber-600 dark:text-amber-400' : rating === 'Poor' ? 'text-rose-600 dark:text-rose-400' : neutralColor) : neutralColor
  const ratingBg = hasReport ? (rating === 'Excellent' || rating === 'Good' ? 'bg-emerald-50 dark:bg-emerald-900/30' : rating === 'Fair' ? 'bg-amber-50 dark:bg-amber-900/30' : rating === 'Poor' ? 'bg-rose-50 dark:bg-rose-900/30' : neutralBg) : neutralBg

  // Report format ('report' variant): replicates the summary page of the official
  // Credit Bureau Cambodia (CBC) personal credit report — green section band, six
  // headline figures, and the outstanding-amount table. Fields the app doesn't
  // capture (bounced cheques, guaranteed accounts, per-currency splits other than the
  // one tracked) render as 0/—, matching how the source report shows them.
  const numGreen = 'text-green-600 dark:text-green-400'
  const numRed = 'text-rose-600 dark:text-rose-400'
  const numDark = 'text-slate-800 dark:text-slate-100'
  const numDim = 'text-slate-300 dark:text-slate-600'
  const statColor = base => (hasReport ? base : numDim)
  const cnt = v => (hasReport ? (v ?? 0) : '—')

  const summaryStats = [
    { value: cnt(info?.reportInquiries), color: statColor(numDark), label: 'ប្រវត្តិនៃការចូលឆែករបាយការណ៍ឥណទាន ក្នុងរយៈពេល ១២ ខែចុងក្រោយ' },
    { value: cnt(info?.activeAccounts), color: statColor(numGreen), label: 'គណនីឥណទានកំពុងដំណើរការ', subtitle: 'រួមបញ្ចូលទាំង គណនីឥណទានបង់យឺត & គណនីឥណទានធានា' },
    { value: cnt(info?.bouncedCheques), color: statColor(numRed), label: 'មូលប្បទានបត្រមិនមានប្រាក់គ្រប់គ្រាន់ក្នុងគណនី' },
    { value: cnt(badAccounts), color: statColor(numRed), label: 'គណនីឥណទានខូច' },
    { value: cnt(info?.guaranteedAccounts), color: statColor(numDark), label: 'គណនីឥណទានធានា' },
    { value: hasReport ? (lateCount ?? 0) : '—', color: statColor(numRed), label: 'គណនីឥណទានបង់យឺត' },
  ]

  const outCur = info?.totalOutstandingCurrency || 'USD'
  const outAmt = parseFloat(info?.totalOutstanding) || 0
  const fmtAmt = v => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const outstandingRows = [
    { label: 'ចំនួនទឹកប្រាក់ឥណទានដែលនៅជំពាក់សរុប:', values: hasReport ? [`KHR ${fmtAmt(outCur === 'KHR' ? outAmt : 0)}`, `USD ${fmtAmt(outCur === 'USD' ? outAmt : 0)}`] : ['—'] },
    { label: 'ចំនួនទឹកប្រាក់ឥណទានខូចដែលនៅជំពាក់សរុប:', values: [hasReport ? 'KHR 0.00' : '—'] },
    { label: 'ចំនួនទឹកប្រាក់ឥណទានធានាដែលនៅជំពាក់សរុប:', values: [hasReport ? 'KHR 0.00' : '—'] },
    { label: 'ចំនួនទឹកប្រាក់ឥណទានធានាខូចដែលនៅជំពាក់សរុប:', values: [hasReport ? 'KHR 0.00' : '—'] },
  ]

  const allAccounts = info?.accounts || []
  const activeAccts = allAccounts.filter(a => a.status !== 'Closed')
  const closedAccts = allAccounts.filter(a => a.status === 'Closed')

  return (
    <div className="space-y-3">
      {variant === 'report' ? (
      <div className="space-y-4">
        {/* Summary section band */}
        <div className="rounded-md bg-gradient-to-r from-green-700 to-green-500 px-4 py-2 shadow-sm">
          <span className="text-sm font-bold text-white tracking-wide">ព័ត៌មានសង្ខេប</span>
        </div>

        {/* Six headline figures */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-5 py-2">
          {summaryStats.map(s => (
            <div key={s.label} className="text-center px-1">
              <p className={`text-4xl font-extrabold leading-none ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug mt-2">{s.label}</p>
              {s.subtitle && <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-snug mt-0.5">{s.subtitle}</p>}
            </div>
          ))}
        </div>

        {/* Outstanding-amount table */}
        <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
          {outstandingRows.map((r, i) => (
            <div key={r.label} className={`grid grid-cols-2 ${i > 0 ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}>
              <div className="px-3 py-2.5 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-700/40">{r.label}</div>
              <div className="px-3 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-800">
                {r.values.map((v, vi) => <div key={vi}>{v}</div>)}
              </div>
            </div>
          ))}
        </div>

        {/* Detailed active credit accounts */}
        {hasReport && (
          <>
            <CbcBand>ព័ត៌មានលម្អិតនៃគណនីឥណទានកំពុងដំណើរការ</CbcBand>
            {activeAccts.length > 0 ? (
              <div className="space-y-3">
                {activeAccts.map((a, i) => <CbcAccountCard key={i} acct={a} currency={currency} />)}
              </div>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 px-1">គ្មានគណនីឥណទានកំពុងដំណើរការ។</p>
            )}
          </>
        )}

        {/* Detailed closed credit accounts */}
        {hasReport && closedAccts.length > 0 && (
          <>
            <CbcBand>ព័ត៌មានលម្អិតនៃគណនីឥណទានបានបិទ</CbcBand>
            <div className="space-y-3">
              {closedAccts.map((a, i) => <CbcAccountCard key={i} acct={a} currency={currency} />)}
            </div>
          </>
        )}
      </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <CbcCard
          icon={CircleDot} iconBg={statusBg} iconColor={statusColor}
          label="Credit Status" value={statusLabel} valueColor={statusColor}
          editable={editable} editing={editingKey === 'accountStatus'}
          onEdit={() => startEdit('accountStatus', { accountStatus: info?.accountStatus || 'Normal' })}
        >
          <div className="flex items-center gap-1 mt-0.5">
            <select
              value={draft.accountStatus}
              onChange={e => setDraft(d => ({ ...d, accountStatus: e.target.value }))}
              className={inputClass}
            >
              {ACCOUNT_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <EditActions onSave={() => saveEdit({ accountStatus: draft.accountStatus })} onCancel={cancelEdit} />
          </div>
        </CbcCard>

        <CbcCard
          icon={Landmark} iconBg={hasReport ? 'bg-blue-50 dark:bg-blue-900/30' : neutralBg} iconColor={hasReport ? 'text-blue-500 dark:text-blue-400' : neutralColor}
          label="Active Loans" value={hasReport ? (info?.activeAccounts ?? 0) : '—'}
          editable={editable} editing={editingKey === 'activeAccounts'}
          onEdit={() => startEdit('activeAccounts', { activeAccounts: info?.activeAccounts ?? 0 })}
        >
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number" min="0" value={draft.activeAccounts}
              onChange={e => setDraft(d => ({ ...d, activeAccounts: e.target.value }))}
              className={`${inputClass} w-16`}
            />
            <EditActions onSave={() => saveEdit({ activeAccounts: Math.max(0, parseInt(draft.activeAccounts, 10) || 0) })} onCancel={cancelEdit} />
          </div>
        </CbcCard>

        <CbcCard
          icon={Wallet} iconBg={hasReport ? 'bg-amber-50 dark:bg-amber-900/30' : neutralBg} iconColor={hasReport ? 'text-amber-500 dark:text-amber-400' : neutralColor}
          label="Outstanding Balance" value={hasReport ? formatVal(parseFloat(info?.totalOutstanding) || 0, info?.totalOutstandingCurrency || currency, 1) : '—'}
          editable={editable} editing={editingKey === 'totalOutstanding'}
          onEdit={() => startEdit('totalOutstanding', { totalOutstanding: info?.totalOutstanding ?? 0, totalOutstandingCurrency: info?.totalOutstandingCurrency || currency })}
        >
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number" min="0" value={draft.totalOutstanding}
              onChange={e => setDraft(d => ({ ...d, totalOutstanding: e.target.value }))}
              className={`${inputClass} w-20`}
            />
            <select
              value={draft.totalOutstandingCurrency}
              onChange={e => setDraft(d => ({ ...d, totalOutstandingCurrency: e.target.value }))}
              className={inputClass}
            >
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </select>
            <EditActions
              onSave={() => saveEdit({ totalOutstanding: Math.max(0, parseFloat(draft.totalOutstanding) || 0), totalOutstandingCurrency: draft.totalOutstandingCurrency })}
              onCancel={cancelEdit}
            />
          </div>
        </CbcCard>

        <CbcCard
          icon={Ban} iconBg={badBg} iconColor={badColor}
          label="Bad Debt (NPL)" value={hasReport ? badAccounts : '—'} valueColor={badColor}
          editable={editable} editing={editingKey === 'badAccounts'}
          onEdit={() => startEdit('badAccounts', { badAccounts: info?.badAccounts ?? 0 })}
        >
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="number" min="0" value={draft.badAccounts}
              onChange={e => setDraft(d => ({ ...d, badAccounts: e.target.value }))}
              className={`${inputClass} w-16`}
            />
            <EditActions onSave={() => saveEdit({ badAccounts: Math.max(0, parseInt(draft.badAccounts, 10) || 0) })} onCancel={cancelEdit} />
          </div>
        </CbcCard>

        <CbcCard
          icon={Clock} iconBg={lateBg} iconColor={lateColor}
          label="Late Payment Accounts" value={hasReport ? (lateCount ?? '—') : '—'} valueColor={lateColor}
          editable={editable} editing={editingKey === 'paymentHistory24'}
          onEdit={() => startEdit('paymentHistory24', { paymentHistory24: info?.paymentHistory24 || '' })}
        >
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="text" maxLength={24} placeholder="24-cycle code" value={draft.paymentHistory24}
              onChange={e => setDraft(d => ({ ...d, paymentHistory24: e.target.value }))}
              className={`${inputClass} w-28 font-mono`}
            />
            <EditActions onSave={() => saveEdit({ paymentHistory24: draft.paymentHistory24.trim() })} onCancel={cancelEdit} />
          </div>
        </CbcCard>

        <CbcCard
          icon={TrendingUp} iconBg={ratingBg} iconColor={ratingColor}
          label="Repayment History" value={hasReport ? repaymentHistoryText(history) : '—'} valueColor={ratingColor}
          editable={editable} editing={editingKey === 'paymentHistory24'}
          onEdit={() => startEdit('paymentHistory24', { paymentHistory24: info?.paymentHistory24 || '' })}
        >
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="text" maxLength={24} placeholder="24-cycle code" value={draft.paymentHistory24}
              onChange={e => setDraft(d => ({ ...d, paymentHistory24: e.target.value }))}
              className={`${inputClass} w-28 font-mono`}
            />
            <EditActions onSave={() => saveEdit({ paymentHistory24: draft.paymentHistory24.trim() })} onCancel={cancelEdit} />
          </div>
        </CbcCard>
      </div>
      )}

      {variant !== 'report' && hasReport && info?.reportInquiries !== undefined && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Report Inquiries (12mo): <span className="font-semibold text-slate-600 dark:text-slate-300">{info.reportInquiries}</span>
        </p>
      )}

      {hideDocument ? null : reportDoc ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
          {isImage && reportDoc.dataUrl ? (
            <img
              src={reportDoc.dataUrl}
              alt={reportDoc.name}
              onClick={() => onView(reportDoc, isImage)}
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-red-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{reportDoc.name}</p>
            <p className="text-[10px] text-slate-400">{reportDoc.size}</p>
          </div>
          {reportDoc.dataUrl && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onView(reportDoc, isImage)}
                title={isImage ? 'Preview image' : 'Open document'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                {isImage ? <Eye className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                {isImage ? 'Preview' : 'Open'}
              </button>
              <a
                href={reportDoc.dataUrl}
                download={reportDoc.name}
                title="Download"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500 px-1">No CBC report uploaded.</p>
      )}
    </div>
  )
}
