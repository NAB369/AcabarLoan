import { formatAddress } from '../../utils/format'

// ── Full A4 replica of the Credit Bureau Cambodia (CBC) personal credit report ──
// Renders every section of the bureau report (header, personal info, summary,
// active/closed account details, other identities, declaration) on an A4 sheet,
// embedded directly in the loan detail CBC tab. The app stores only a subset of the
// bureau's fields, so the rest are DERIVED deterministically from what we have
// (report date, term, amount, institution) — plausible values for a demo/mock
// system, clearly not a substitute for the real bureau data.

const GREEN = '#0a8a3f'

// ── formatting / derivation helpers ──────────────────────────────────────────
const money = (v, cur = 'USD') => `${cur} ${(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = v => (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function isoOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addMonths(dateStr, n) {
  const d = new Date((dateStr || '2026-01-01') + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return d
}
// DD/MM/YYYY, the format the bureau report uses.
function dmy(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr)
  if (isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function hashNum(s, len) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return String(h).padStart(len, '0').slice(0, len)
}
function cyclesToCode(cycles) {
  return (cycles || []).map(c => (c === 'ontime' ? '0' : String(c)[0] || '0')).join('') || '—'
}
function collateralFor(loanType) {
  const t = (loanType || '').toLowerCase()
  if (/motor|car|vehicle/.test(t)) return 'Vehicle Registration'
  if (/land|home|house|mortgage/.test(t)) return 'Hard Title Deed_Residential Property'
  return 'Mortgage Agreement'
}

// Builds the fully-populated account model the report needs. An account read off an
// uploaded bureau PDF (utils/parseCbcReport) already carries every field, so those win;
// anything missing — a hand-entered or seeded account — is derived from what the app
// does store (report date, term, amount, institution).
function deriveAccount(a, info, currency, idx) {
  const reportDate = info?.reportDate || '2026-01-01'
  const term = a.loanDuration || 12
  const closed = a.status === 'Closed'
  const cur = a.currency || info?.totalOutstandingCurrency || currency || 'USD'
  const amount = a.creditLimit || 0
  const installment = term > 0 ? amount / term : 0

  const openDate = closed ? addMonths(reportDate, -(term + 4)) : addMonths(reportDate, -Math.round(term / 2))
  const openStr = isoOf(openDate)
  const expiry = isoOf(addMonths(openStr, term))
  const closeStr = closed ? isoOf(addMonths(openStr, term)) : null
  const flagged = a.status === 'Delinquent' || a.status === 'Write-off'
  const given = (value, fallback) => (value === undefined || value === null || value === '' ? fallback : value)

  return {
    institution: a.institution || '—',
    product: a.loanType || '—',
    borrowerType: a.role === 'Borrower' ? 'Primary' : (a.role || 'Primary'),
    accountNumber: given(a.accountNumber, `2200${hashNum((a.institution || '') + idx, 9)}`),
    currencyAmount: money(amount, cur),
    status: a.status || 'Normal',
    restructured: given(a.restructured, 'No'),
    lastPaidAmount: num(given(a.lastPaidAmount, closed ? amount : installment)),
    installments: term,
    lastPaidDate: dmy(given(a.lastPaidDate, closed ? closeStr : isoOf(addMonths(reportDate, -1)))),
    installmentAmount: num(given(a.installmentAmount, installment)),
    overdueAmount: num(given(a.overdueAmount, flagged ? installment : 0)),
    collateral: given(a.collateral, collateralFor(a.loanType)),
    openDate: dmy(given(a.openDate, openStr)),
    expiryDate: dmy(given(a.expiryDate, expiry)),
    closeDate: closed ? dmy(given(a.closeDate, closeStr)) : null,
    nextPaymentDate: closed ? null : dmy(given(a.nextPaymentDate, isoOf(addMonths(reportDate, 1)))),
    outstanding: num(a.currentBalance || 0),
    dataPullDate: dmy(given(a.dataPullDate, reportDate)),
    paymentFrequency: given(a.paymentFrequency, 'Monthly'),
    loanTermType: given(a.loanTermType, term >= 24 ? 'Long Term Loan' : term >= 12 ? 'Medium Term Loan' : 'Short Term Loan'),
    // The bureau marks a settled account's history with a leading "C" (closed) and
    // keeps the code at 24 characters.
    cycleCode: given(a.paymentHistory24, closed ? `C${cyclesToCode(a.cycles).slice(0, 23)}` : cyclesToCode(a.cycles)),
  }
}

// ── presentational atoms (light-only: this is a paper document) ───────────────
// The report runs to several printed pages, so the pieces below each declare how they
// may be broken: `break-inside-avoid` keeps a unit whole rather than letting a page
// boundary cut through it, and a section band adds `break-after-avoid` so a heading is
// never left stranded as the last thing on a page.
function Band({ children }) {
  return (
    // `lineHeight: 'normal'` is deliberate and load-bearing, not a default left in place.
    // Khmer stacks marks above the line and subscript consonants below it, and the font's
    // natural line box is the one box that holds them without clipping. It is also the only
    // one the PDF export gets right: html2canvas derives a font's baseline from its metrics
    // alone and then draws at `textRect.top + baseline`, so any line-height other than the
    // natural one offsets the text in the raster by half the difference — 1.2 sank these
    // headings to the foot of the band, a tall one floats them above it. Give the band its
    // air with padding instead, which the export reproduces exactly.
    <div className="mt-5 mb-2 rounded-sm px-3 py-1.5 break-inside-avoid break-after-avoid" style={{ background: `linear-gradient(90deg, ${GREEN}, #4cbf6b)`, lineHeight: 'normal' }}>
      <span className="text-[15px] font-bold text-white tracking-wide">{children}</span>
    </div>
  )
}

// One personal-info row: ► label ......... : value
function PersonRow({ label, value }) {
  return (
    <div className="flex items-baseline gap-2 py-[3px] text-[13px] break-inside-avoid">
      <span className="text-green-700 text-[10px]">▶</span>
      <span className="text-slate-600 w-52 flex-shrink-0">{label}</span>
      <span className="text-slate-800 font-semibold">: {value || <span className="font-normal text-slate-400">—</span>}</span>
    </div>
  )
}

function statusClass(status) {
  return /^(delinquent|write-off|bad)/i.test(status || '') ? 'text-rose-600'
    : /^closed/i.test(status || '') ? 'text-slate-500'
    : /^normal/i.test(status || '') ? 'text-green-700'
    : 'text-slate-800'
}

// One label/value cell inside an account block.
function Cell({ label, value, valueClass, leftBorder }) {
  return (
    <div className={`flex text-[11px] border-b border-slate-200 break-inside-avoid ${leftBorder ? 'sm:border-r' : ''}`}>
      <div className="w-[46%] flex-shrink-0 px-2 py-2 bg-slate-50 text-slate-500 leading-snug">{label}</div>
      <div className={`flex-1 px-2 py-2 font-semibold leading-snug break-words ${valueClass || 'text-slate-800'}`}>{value ?? '—'}</div>
    </div>
  )
}

function AccountBlock({ acct }) {
  // Field pairs in the bureau report's own order (each entry is one cell of the
  // two-column grid, read left-to-right). A closed account's block drops the credit
  // status, loan-term type and next-payment date the report only prints for live
  // accounts, and moves the payment frequency up into the freed slot.
  const cells = acct.closeDate ? [
    ['ឈ្មោះផលិតផលឥណទាន', acct.product],
    ['កាលបរិច្ឆេទបើកគណនីឥណទាន', acct.openDate],
    ['ប្រភេទអ្នកខ្ចី', acct.borrowerType, 'text-green-700'],
    ['កាលបរិច្ឆេទផុតកំណត់ឥណទាន', acct.expiryDate],
    ['លេខគណនីឥណទាន', acct.accountNumber],
    ['កាលបរិច្ឆេទបិទគណនីឥណទាន', acct.closeDate],
    ['ប្រភេទរូបិយប័ណ្ណ/ចំនួនទឹកប្រាក់កម្ចី', acct.currencyAmount],
    ['គ្រានៃការទូទាត់សង', acct.paymentFrequency],
    ['ឥណទានរៀបចំឡើងវិញ', acct.restructured],
    ['ចំនួនទឹកប្រាក់ដែលបានសងចុងក្រោយ', acct.lastPaidAmount],
    ['ចំនួនគ្រា', acct.installments],
    ['កាលបរិច្ឆេទសងចុងក្រោយ', acct.lastPaidDate],
    ['ចំនួនទឹកប្រាក់ដែលត្រូវសងប្រចាំគ្រា', acct.installmentAmount],
    ['ចំនួនទឹកប្រាក់ដែលហួសកំណត់សង', acct.overdueAmount],
    ['ទ្រព្យធានា', acct.collateral],
    ['កាលបរិច្ឆេទទាញទិន្នន័យ', acct.dataPullDate],
    ['ចំនួនទឹកប្រាក់ឥណទានដែលនៅជំពាក់', acct.outstanding],
    ['ប្រវត្តិទូទាត់សងប្រាក់ ២៤គ្រាចុងក្រោយ', acct.cycleCode, 'font-mono tracking-wide'],
  ] : [
    ['ឈ្មោះផលិតផលឥណទាន', acct.product],
    ['កាលបរិច្ឆេទបើកគណនីឥណទាន', acct.openDate],
    ['ប្រភេទអ្នកខ្ចី', acct.borrowerType, 'text-green-700'],
    ['កាលបរិច្ឆេទផុតកំណត់ឥណទាន', acct.expiryDate],
    ['លេខគណនីឥណទាន', acct.accountNumber],
    ['រយៈពេលនៃឥណទាន', acct.loanTermType],
    ['ប្រភេទរូបិយប័ណ្ណ/ចំនួនទឹកប្រាក់កម្ចី', acct.currencyAmount],
    ['ស្ថានភាពឥណទាន', acct.status, statusClass(acct.status)],
    ['ឥណទានរៀបចំឡើងវិញ', acct.restructured],
    ['ចំនួនទឹកប្រាក់ដែលបានសងចុងក្រោយ', acct.lastPaidAmount],
    ['ចំនួនគ្រា', acct.installments],
    ['កាលបរិច្ឆេទសងចុងក្រោយ', acct.lastPaidDate],
    ['ចំនួនទឹកប្រាក់ដែលត្រូវសងប្រចាំគ្រា', acct.installmentAmount],
    ['ចំនួនទឹកប្រាក់ដែលហួសកំណត់សង', acct.overdueAmount],
    ['ទ្រព្យធានា', acct.collateral],
    ['កាលបរិច្ឆេទសងបន្ទាប់', acct.nextPaymentDate],
    ['ចំនួនទឹកប្រាក់ឥណទានដែលនៅជំពាក់', acct.outstanding],
    ['កាលបរិច្ឆេទទាញទិន្នន័យ', acct.dataPullDate],
    ['គ្រានៃការទូទាត់សង', acct.paymentFrequency],
    ['ប្រវត្តិទូទាត់សងប្រាក់ ២៤គ្រាចុងក្រោយ', acct.cycleCode, 'font-mono tracking-wide'],
  ]
  return (
    <div className="mb-3 border border-slate-300 rounded-sm overflow-hidden break-inside-avoid">
      <div className="px-3 py-1.5 bg-slate-200">
        <span className="text-[13px] font-bold text-slate-700">
          ឈ្មោះគ្រឹះស្ថាន : <span className="text-green-700">{acct.institution}</span>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {cells.map(([l, v, vc], i) => <Cell key={i} label={l} value={v} valueClass={vc} leftBorder={i % 2 === 0} />)}
      </div>
    </div>
  )
}

// ── the bureau's masthead ─────────────────────────────────────────────────────
// The triquetra mark — three pointed leaves woven around a circle, with white
// interlace gaps and the curved triangle at the centre — beside the "CBC /
// CREDIT BUREAU CAMBODIA" wordmark. Drawn as SVG so it stays crisp at any zoom and
// needs no external asset. Each leaf is a vesica: two arcs of radius 38 meeting at
// the outer tip (50,6.11) and the inner tip (50,71.94), copied at 120° intervals.
const LEAF = 'M 50 71.94 A 38 38 0 0 1 50 6.11 A 38 38 0 0 1 50 71.94 Z'
// The knot's centre: a curved triangle, point down.
const KNOT_CENTRE = 'M 50 59 A 15.59 15.59 0 0 1 42.21 45.5 A 15.59 15.59 0 0 1 57.79 45.5 A 15.59 15.59 0 0 1 50 59 Z'
const MARK_GREEN = '#22b414'
const WORDMARK_GREEN = '#0b5c38'
const TAGLINE_GREY = '#6d6e71'

function CbcLogo() {
  const leaves = [0, 120, 240].map(angle => <path key={angle} d={LEAF} transform={`rotate(${angle} 50 50)`} />)
  return (
    <div className="flex items-center gap-0.5">
      <svg width="54" height="48" viewBox="8 1 84 76" aria-hidden="true">
        <g fill={MARK_GREEN}>{leaves}</g>
        {/* White outlines over the solid shape produce the weave's gaps */}
        <g fill="none" stroke="#ffffff" strokeWidth="6">
          {leaves}
          <circle cx="50" cy="50" r="21" />
        </g>
        <path d={KNOT_CENTRE} fill="#ffffff" />
      </svg>
      {/* The wordmark is Latin, and it is the one part of the sheet that must not inherit
          the Khmer stack: a Khmer face draws these letters well past a `leading-none` line
          box, dropping "CBC" onto the tagline. Its own stack keeps the two apart. */}
      <div className="flex flex-col items-start -ml-0.5" style={{ fontFamily: "'Segoe UI', system-ui, Arial, sans-serif" }}>
        <p className="text-[34px] font-black leading-none tracking-tight" style={{ color: WORDMARK_GREEN }}>CBC</p>
        <p className="text-[7.5px] font-bold tracking-[0.06em] mt-1 whitespace-nowrap" style={{ color: TAGLINE_GREY }}>CREDIT BUREAU CAMBODIA</p>
      </div>
    </div>
  )
}

// ── the A4 document ───────────────────────────────────────────────────────────
// `docRef` hands the sheet element back for PDF export; `printable` marks it as the one
// section window.print() should output — with two parties on screen, only the sheet being
// printed may carry that class.
export default function CBCReportDocument({ info, person, currency = 'USD', docRef, printable = true }) {
  // Until a bureau report has actually been read, the sheet stays an empty form: the
  // identity block reads from the customer record, so it would otherwise fill itself in
  // and imply a report backs data nobody has filed yet. What counts is report data on
  // record — not merely a file in the upload field, which may be any document at all.
  const hasReport = !!(info?.referenceNo || info?.reportDate || (info?.accounts || []).length > 0)
  const reportDate = hasReport ? info?.reportDate : null
  // Bureau reference format: MB_ + report date as DDMMYY + a 13-digit serial. A report
  // read off an uploaded PDF carries its real reference number.
  const [ry, rm, rd] = (reportDate || '').split('-')
  const refNo = !hasReport ? null
    : info?.referenceNo || `MB_${reportDate ? `${rd}${rm}${ry.slice(2)}` : ''}${hashNum(person?.enName || '', 13)}`
  const accounts = hasReport ? (info?.accounts || []) : []
  const active = accounts.filter(a => a.status !== 'Closed').map((a, i) => deriveAccount(a, info, currency, i))
  const closed = accounts.filter(a => a.status === 'Closed').map((a, i) => deriveAccount(a, info, currency, i + 100))

  const outCur = info?.totalOutstandingCurrency || 'USD'
  const outAmt = Number(info?.totalOutstanding) || 0
  const lateCount = (info?.paymentHistory24 || '').split('').filter(c => c !== '0' && !/x/i.test(c)).length

  const figure = value => (hasReport ? value : '—')
  const stats = [
    { value: figure(info?.reportInquiries ?? 0), color: 'text-green-700', label: 'ប្រវត្តិនៃការចូលឆែករបាយការណ៍ឥណទាន ក្នុងរយៈពេល ១២ ខែចុងក្រោយ' },
    // The bureau prints the live-account count zero-padded to two digits ("01").
    { value: figure(String(info?.activeAccounts ?? active.length).padStart(2, '0')), color: 'text-green-700', label: 'គណនីឥណទានកំពុងដំណើរការ', sub: 'រួមបញ្ចូលទាំង គណនីឥណទានបង់យឺត & គណនីឥណទានធានា' },
    { value: figure(info?.bouncedCheques ?? 0), color: 'text-rose-600', label: 'មូលប្បទានបត្រមិនមានប្រាក់គ្រប់គ្រាន់ក្នុងគណនី' },
    // The bureau prints a clean bad-account count in green, and only flags it red once
    // there is something to flag.
    { value: figure(info?.badAccounts ?? 0), color: (info?.badAccounts ?? 0) > 0 ? 'text-rose-600' : 'text-green-700', label: 'គណនីឥណទានខូច' },
    { value: figure(info?.guaranteedAccounts ?? 0), color: 'text-green-700', label: 'គណនីឥណទានធានា' },
    { value: figure(lateCount), color: 'text-rose-600', label: 'គណនីឥណទានបង់យឺត' },
  ]
  const outstandingRows = [
    ['ចំនួនទឹកប្រាក់ឥណទានដែលនៅជំពាក់សរុប:', hasReport ? [money(outCur === 'KHR' ? outAmt : 0, 'KHR'), money(outCur === 'USD' ? outAmt : 0, 'USD')] : ['—']],
    ['ចំនួនទឹកប្រាក់ឥណទានខូចដែលនៅជំពាក់សរុប:', [figure(money(0, 'KHR'))]],
    ['ចំនួនទឹកប្រាក់ឥណទានធានាដែលនៅជំពាក់សរុប:', [figure(money(0, 'KHR'))]],
    ['ចំនួនទឹកប្រាក់ឥណទានធានាខូចដែលនៅជំពាក់សរុប:', [figure(money(0, 'KHR'))]],
  ]

  const addr = person?.currentAddress ? formatAddress(person.currentAddress) : null
  const personRows = [
    ['ឈ្មោះជាអក្សរឡាតាំង', person?.enName],
    ['ឈ្មោះជាភាសាខ្មែរ', person?.khName],
    ['ប្រភេទអត្តសញ្ញាណ', person?.idType || 'National ID'],
    ['លេខអត្តសញ្ញាណ', person?.idNo],
    ['ថ្ងៃខែឆ្នាំកំណើត', dmy(person?.dob)],
    ['ទីកន្លែងកំណើត', info?.placeOfBirth ? `${info.placeOfBirth}, Cambodia` : null],
    ['ភេទ', person?.gender],
    ['ស្ថានភាពគ្រួសារ', person?.maritalStatus],
    ['សញ្ជាតិ', info?.nationality || 'Cambodian'],
    ['អាសយដ្ឋានបច្ចុប្បន្ន', addr ? `${addr}, Cambodia` : null],
  ].map(([label, value]) => [label, hasReport ? value : null])

  const otherIdentityDate = !hasReport ? '—'
    : accounts.length ? deriveAccount(accounts[accounts.length - 1], info, currency, 0).openDate : dmy(reportDate)

  return (
    <div
      ref={docRef}
      className={`bg-white text-slate-800 mx-auto w-full max-w-[210mm] p-4 sm:p-8 rounded-sm shadow-sm ${printable ? 'printable-area' : ''}`}
      style={{ fontFamily: "'Khmer OS', 'Noto Sans Khmer', system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 pb-3 break-inside-avoid" style={{ borderColor: GREEN }}>
        <CbcLogo />
        <div className="text-right">
          <p className="text-xl font-bold" style={{ color: GREEN }}>របាយការណ៍ឥណទានផ្ទាល់ខ្លួន</p>
          <p className="text-[12px] text-slate-500 mt-1">កាលបរិច្ឆេទទាញយករបាយការណ៍: <span className="text-slate-700 font-semibold">{dmy(reportDate)}</span></p>
          <p className="text-[12px] text-slate-500">លេខសំគាល់: <span className="text-slate-700 font-semibold">{refNo || '—'}</span></p>
        </div>
      </div>

      {/* Personal information */}
      <Band>ព័ត៌មានផ្ទាល់ខ្លួន</Band>
      <div className="px-1">
        {personRows.map(([l, v]) => <PersonRow key={l} label={l} value={v} />)}
      </div>

      {/* Summary */}
      <Band>ព័ត៌មានសង្ខេប</Band>
      <div className="grid grid-cols-3 gap-x-4 gap-y-4 py-3 text-center break-inside-avoid">
        {stats.map(s => (
          <div key={s.label} className="px-1 break-inside-avoid">
            <p className={`text-4xl font-extrabold leading-none ${s.color}`}>{s.value}</p>
            <p className="text-[12px] text-slate-600 leading-snug mt-2">{s.label}</p>
            {s.sub && <p className="text-[10px] text-slate-400 leading-snug mt-1">{s.sub}</p>}
          </div>
        ))}
      </div>
      <div className="border border-slate-300 rounded-sm overflow-hidden mt-1 break-inside-avoid">
        {outstandingRows.map(([label, values], i) => (
          <div key={label} className={`grid grid-cols-2 break-inside-avoid ${i > 0 ? 'border-t border-slate-200' : ''}`}>
            <div className="px-3 py-2.5 text-[12px] text-slate-600 bg-slate-100/70">{label}</div>
            <div className="px-3 py-2.5 text-[13px] font-semibold text-slate-800 bg-slate-50">
              {values.map((v, vi) => <div key={vi}>{v}</div>)}
            </div>
          </div>
        ))}
      </div>

      {/* Active account details */}
      <Band>ព័ត៌មានលម្អិតនៃគណនីឥណទានកំពុងដំណើរការ</Band>
      {active.length ? active.map((a, i) => <AccountBlock key={i} acct={a} />)
        : <p className="text-[13px] text-slate-400 px-1">គ្មានគណនីឥណទានកំពុងដំណើរការ។</p>}

      {/* Closed account details */}
      <Band>ព័ត៌មានលម្អិតនៃគណនីឥណទានបានបិទ</Band>
      {closed.length ? closed.map((a, i) => <AccountBlock key={i} acct={a} />)
        : <p className="text-[13px] text-slate-400 px-1">គ្មានគណនីឥណទានបានបិទ។</p>}

      {/* Other identities */}
      <Band>អត្តសញ្ញាណ និងឈ្មោះផ្សេងទៀត</Band>
      <div className="border border-slate-300 rounded-sm overflow-hidden max-w-md break-inside-avoid">
        <div className="grid grid-cols-2 bg-slate-100 text-[12px] font-semibold text-slate-600">
          <div className="px-3 py-2 border-r border-slate-200">កាលបរិច្ឆេទនៃការបញ្ចូលទិន្នន័យ</div>
          <div className="px-3 py-2">ឈ្មោះ</div>
        </div>
        <div className="grid grid-cols-2 text-[12px] border-t border-slate-200">
          <div className="px-3 py-2 border-r border-slate-200 text-slate-700">{otherIdentityDate}</div>
          <div className="px-3 py-2 font-bold text-slate-800">{(hasReport && person?.enName) || '—'}</div>
        </div>
      </div>

      {/* Declaration */}
      <Band>សេចក្ដីប្រកាស</Band>
      <p className="text-[11px] leading-relaxed text-slate-600 text-justify px-1 break-inside-avoid">
        ក្រុមហ៊ុន ក្រេឌីត ប្យួរ៉ូ ខេមបូឌា ទទួលបានព័ត៌មានទាំងនេះពីប្រភពផ្សេងៗ ហើយព័ត៌មានទាំងនេះមិនបានឆ្លុះបញ្ចាំងអំពីទស្សនៈ ឬការបកស្រាយរបស់ក្រុមហ៊ុនយើងខ្ញុំឡើយ ។
        ម្យ៉ាងវិញទៀត ក្រុមហ៊ុន ក្រេឌីត ប្យួរ៉ូ ខេមបូឌា មិនទទួលខុសត្រូវទៅលើការផ្ដល់ ឬការប្រមូលព័ត៌មានទាំងនោះ ដែលទាក់ទងទៅនឹងភាពត្រឹមត្រូវ ឬភាពពេញលេញនោះទេ ។
        ព័ត៌មានទាំងនេះត្រូវបានផ្តល់ទៅជូនអ្នកដោយផ្អែកលើមូលដ្ឋានរក្សាការសម្ងាត់ និងមិនមែនសម្រាប់ការប្រើប្រាស់ ឬការពឹងផ្អែករបស់ភាគីណាផ្សេងឡើយ លើកលែងតែសម្រាប់បុគ្គលដែលអ្នកទទួលបានការយល់ព្រមតែប៉ុណ្ណោះ ។
      </p>

      {/* Footer wedge */}
      <div className="mt-6 h-4 rounded-sm" style={{ background: `linear-gradient(90deg, #4cbf6b, ${GREEN})` }} />
    </div>
  )
}
