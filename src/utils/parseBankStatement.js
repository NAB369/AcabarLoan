import { openPdf, readPdfRows, rowLines, rowsText, toNumber, moneyValue } from './pdfText'

// ── Reader for an uploaded bank statement ──────────────────────────────────────
// Two things are read off a statement, and they are deliberately independent:
//
//   1. Its TEXT. This is what verifies the income: if the company the applicant declared is
//      named anywhere on the statement, the two belong together. Any statement with a text
//      layer can be checked this way, whatever its table looks like.
//
//   2. Its TRANSACTION TABLE, for the monthly money-in figures. There is no single layout
//      across Cambodian banks, so nothing anchors on a bank's own labels — the reader works
//      off rows that open with a date, and classifies each as money in or out by the running
//      balance where there is one, or by CR/DR-style keywords where there is not.
//
// The table is the fragile half, so it is optional: a layout the row reader cannot follow
// still verifies on its text. A photo or flat scan has no text layer at all — that comes
// back as null and the caller falls back to checking by hand. Nothing is ever guessed.

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const CREDIT_WORDS = /\b(cr|credit|deposit|dep|received|receipt|inward|transfer in|salary|payroll|incoming)\b/i
const DEBIT_WORDS = /\b(dr|debit|withdraw\w*|wd|atm|payment|purchase|fee|charge|outward|transfer out|outgoing)\b/i
const SALARY_WORDS = /\b(salary|salaries|payroll|wage|wages|net pay|remuneration|staff pay|monthly pay)\b/i

// Each institution with every spelling it prints of itself: the brand, the legal name, and the
// web address, since a footer often carries only the last of those.
const BANK_HINTS = [
  ['ABA Bank', /\baba\b|advanced bank of asia|ababank/i],
  ['ACLEDA Bank', /acleda/i],
  ['Canadia Bank', /canadia/i],
  ['Cambodian Public Bank (Campu)', /campu|cambodian public/i],
  ['CIMB Bank', /cimb/i],
  ['Maybank', /maybank/i],
  ['Vattanac Bank', /vattanac/i],
  ['Phillip Bank', /phillip ?bank/i],
  ['Prince Bank', /prince ?bank/i],
  ['RHB Bank', /\brhb\b/i],
  ['Sathapana Bank', /sathapana/i],
  ['Wing Bank', /wing ?bank|\bwing\b/i],
  ['Foreign Trade Bank (FTB)', /foreign trade bank|\bftb\b/i],
  ['Hattha Bank', /hattha/i],
  ['Chip Mong Bank', /chip ?mong/i],
  ['PPCBank', /ppcbank|ppc ?bank|\bppcb\b|phnom penh commercial|ភ្នំពេញ\s*ពាណិជ្ជ/i],
  ['J Trust Royal Bank', /j ?trust|jtrustroyal/i],
  ['Woori Bank', /woori/i],
  ['Bank of China', /bank of china/i],
  ['PRASAC', /prasac/i],
  ['AMK', /\bamk\b/i],
  ['LOLC', /\blolc\b/i],
  ['Amret', /amret/i],
]

// Which bank issued the statement. The issuer is named over and over — the letterhead, a
// running header or footer on every page, the web address in the small print — while a bank
// that is merely the other side of a transfer turns up once or twice in a narration. So the
// count of mentions across the whole document decides, not the order of the list above and not
// one lucky line: reading by list order is what let a PPCBank statement that mentions an
// incoming ACLEDA transfer come back as ACLEDA.
//
// A name in the letterhead is worth a run of mentions on its own, which settles the ordinary
// case where the issuer is printed once at the top and a counterparty appears in a handful of
// rows. Two candidates that come out level are left undecided rather than guessed between.
const LETTERHEAD_LINES = 12
const LETTERHEAD_WEIGHT = 25

function bankCandidates(head, text) {
  return BANK_HINTS
    .map(([name, re]) => {
      const mentions = (text.match(new RegExp(re.source, 'gi')) || []).length
      if (!mentions) return null
      const line = head.findIndex(l => re.test(l))
      const inLetterhead = line !== -1 && line < LETTERHEAD_LINES
      return { name, mentions, score: mentions + (inLetterhead ? LETTERHEAD_WEIGHT : 0), line: line === -1 ? Infinity : line }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.line - b.line)
}

function detectBank(head, text) {
  const scored = bankCandidates(head, text)

  if (scored.length === 0) return ''
  if (scored.length > 1 && scored[0].score === scored[1].score) return ''
  return scored[0].name
}

// Every date shape a statement is likely to print, normalised to YYYY-MM-DD. Ambiguous
// numeric dates are read day-first, which is the convention in Cambodia.
function parseDate(text) {
  const t = String(text).trim()

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    const day = parseInt(m[1], 10)
    const month = parseInt(m[2], 10)
    // A first field above 12 can only be the day; otherwise day-first is assumed.
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return null
  }

  m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{2,4})$/.exec(t)
  if (m) {
    const month = MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase())
    if (month === -1) return null
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }

  // Month name first, day second — "Feb 01, 2026" / "Feb 01 2026" — the format ABA (and
  // other banks with English-language statements) print, distinct from the day-first shape
  // above. The comma is optional because a row's date tokens are tried both joined with a
  // space and joined with nothing (see leadingDate), so "Feb01,2026" reaches here too.
  m = /^([A-Za-z]{3,9})[.]?\s*(\d{1,2}),?\s*(\d{2,4})$/.exec(t)
  if (m) {
    const month = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase())
    if (month === -1) return null
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }

  return null
}

// A row's date may be split across text items ("12", "/", "07", "/2026"), and plenty of
// layouts put a row number or a value-date column ahead of it, so the date is looked for
// over a window near the start of the row rather than only at its very first token.
function leadingDate(tokens) {
  for (let start = 0; start < Math.min(3, tokens.length); start++) {
    for (let take = 1; take <= Math.min(5, tokens.length - start); take++) {
      const slice = tokens.slice(start, start + take)
      const iso = parseDate(slice.join('')) || parseDate(slice.join(' '))
      if (iso) return { iso, consumed: start + take }
    }
  }
  return null
}

// Rows that open with a date and carry at least one amount — the statement's transaction
// lines, with the narration text and every amount kept for the classification passes.
function readTransactionRows(rows) {
  const out = []
  for (const row of rows) {
    const tokens = row.items.map(i => i.text)
    const date = leadingDate(tokens)
    if (!date) continue
    const rest = tokens.slice(date.consumed)
    const amounts = []
    const words = []
    for (const token of rest) {
      const value = moneyValue(token)
      if (value !== null) amounts.push(value)
      else words.push(token)
    }
    if (amounts.length === 0) continue
    out.push({ date: date.iso, description: words.join(' ').replace(/\s+/g, ' ').trim(), amounts })
  }
  return out
}

// True when the last amount on each row behaves like a running balance: its change from
// the previous row matches one of the other amounts printed on that row. Checked over the
// whole statement, so a stray row that doesn't line up doesn't sink the reading.
function balanceColumnFits(txns) {
  const usable = txns.filter(t => t.amounts.length >= 2)
  if (usable.length < 3) return false
  let agree = 0
  for (let i = 1; i < usable.length; i++) {
    const delta = usable[i].amounts[usable[i].amounts.length - 1] - usable[i - 1].amounts[usable[i - 1].amounts.length - 1]
    const candidates = usable[i].amounts.slice(0, -1)
    if (candidates.some(a => Math.abs(Math.abs(delta) - a) < 0.02)) agree++
  }
  return agree / (usable.length - 1) >= 0.7
}

// Which way the money went, per transaction. `null` means the row could not be classified and
// is left out of the totals rather than counted as either direction. Money out is kept as well
// as money in — the two are what let the statement be checked against its own balances.
function movement(txn, previous, useBalance) {
  if (useBalance && txn.amounts.length >= 2 && previous && previous.amounts.length >= 2) {
    const delta = txn.amounts[txn.amounts.length - 1] - previous.amounts[previous.amounts.length - 1]
    if (Math.abs(delta) < 0.02) return { direction: 'in', amount: 0 }
    return delta > 0 ? { direction: 'in', amount: delta } : { direction: 'out', amount: -delta }
  }
  const isCredit = CREDIT_WORDS.test(txn.description)
  const isDebit = DEBIT_WORDS.test(txn.description)
  if (isCredit && !isDebit) return { direction: 'in', amount: txn.amounts[0] }
  if (isDebit && !isCredit) return { direction: 'out', amount: txn.amounts[0] }
  return null
}

// The figures a statement prints about itself: the balances it opens and closes on, and the
// credit/debit totals it foots. Read from the text, independently of the transaction rows, so
// that the reader's own arithmetic can be checked against them.
function readStatementTotals(text) {
  const lines = text.split('\n')
  const grab = re => {
    for (const line of lines) {
      const m = re.exec(line)
      if (m) {
        const value = toNumber(m[1])
        if (value !== null) return value
      }
    }
    return null
  }
  return {
    openingBalance: grab(/(?:opening|beginning|brought\s*forward|b\/?f|previous)\s*balance\D{0,24}?([\d,]+\.\d{2})/i),
    closingBalance: grab(/(?:closing|ending|carried\s*forward|c\/?f|final)\s*balance\D{0,24}?([\d,]+\.\d{2})/i),
    printedCredits: grab(/total\s*(?:credits?|deposits?|money\s*in)\D{0,24}?([\d,]+\.\d{2})/i),
    printedDebits: grab(/total\s*(?:debits?|withdrawals?|money\s*out)\D{0,24}?([\d,]+\.\d{2})/i),
  }
}

// Does the statement foot? What the reader classified is checked against what the statement
// prints about itself — its own credit total, or the movement implied by its opening and
// closing balances. A statement that does not foot either was edited or has rows the reader
// never saw, and in both cases its figures cannot carry a verification on their own.
//
// `checked: false` is not a failure: a statement that prints neither a total nor its balances
// gives nothing to check against, and saying so is not the same as saying it disagrees.
function reconcile(totals, money) {
  const out = (ok, basis, expected, actual) => ({
    checked: true, ok, basis, expected, actual,
    difference: Math.round((actual - expected) * 100) / 100,
  })
  if (!money) return { checked: false, reason: 'no transaction table could be read' }
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.005)

  if (totals.printedCredits !== null) {
    return out(near(money.totalCredits, totals.printedCredits), 'printed credit total', totals.printedCredits, money.totalCredits)
  }
  if (totals.openingBalance !== null && totals.closingBalance !== null) {
    const expected = Math.round((totals.closingBalance - totals.openingBalance) * 100) / 100
    const actual = Math.round((money.totalCredits - money.totalDebits) * 100) / 100
    return out(near(actual, expected), 'opening and closing balances', expected, actual)
  }
  return { checked: false, reason: 'the statement prints no balance or credit total to check against' }
}

// Account holder and account number, read from the statement's header block rather than its
// transaction table. The issuing bank is looked for over the whole document — see detectBank.
function readHeader(rows, text) {
  const head = rowLines(rows).slice(0, 40)
  const find = re => {
    for (const line of head) {
      const m = re.exec(line)
      if (m && m[1] && m[1].trim()) return m[1].trim()
    }
    return ''
  }
  return {
    bank: detectBank(head, text),
    // "holder name" tried before the two single words alone, so ABA's "Account Holder Name"
    // label is matched whole rather than leaving "Name" stuck to the front of the value.
    accountName: find(/account\s*(?:holder\s*name|name|holder)\s*[:\-]?\s*(.+)$/i) || find(/^name\s*[:\-]\s*(.+)$/i),
    accountNumber: find(/account\s*(?:number|no\.?|#)\s*[:\-]?\s*([\dX*\s-]{6,})$/i),
  }
}

// Per-month money in, the salary slice of it, and money out, in calendar order. Money out is
// summarised per month as well as in total because the expense verification reads the spending
// of one month against the next — a single total over the whole period cannot show that.
function summariseMonths(credits, salaryCredits, debits) {
  const months = new Map()
  const bump = (date, field, amount) => {
    const key = date.slice(0, 7)
    const row = months.get(key) || { month: key, credits: 0, salary: 0, debits: 0, count: 0, debitCount: 0 }
    row[field] += amount
    if (field === 'credits') row.count += 1
    if (field === 'debits') row.debitCount += 1
    months.set(key, row)
  }
  credits.forEach(c => bump(c.date, 'credits', c.amount))
  salaryCredits.forEach(c => bump(c.date, 'salary', c.amount))
  debits.forEach(d => bump(d.date, 'debits', d.amount))
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
}

function buildSummary(txns) {
  const useBalance = balanceColumnFits(txns)

  const credits = []
  const debits = []
  let classified = 0
  for (let i = 0; i < txns.length; i++) {
    const moved = movement(txns[i], txns[i - 1], useBalance)
    if (!moved) continue
    classified++
    if (!(moved.amount > 0)) continue
    const row = { date: txns[i].date, description: txns[i].description, amount: moved.amount }
    if (moved.direction === 'out') debits.push(row)
    else credits.push(row)
  }
  // A statement the reader could follow in neither direction says nothing about either income
  // or spending. One that shows only money out still verifies an expense, so the two sides are
  // no longer gated on the deposits alone.
  if (credits.length === 0 && debits.length === 0) return null

  // A recurring credit of a near-identical amount is treated as salary even when the
  // narration never says so — the pattern is the evidence.
  const recurring = new Set()
  credits.forEach((a, i) => credits.forEach((b, j) => {
    if (i >= j) return
    if (a.date.slice(0, 7) === b.date.slice(0, 7)) return
    if (Math.abs(a.amount - b.amount) <= Math.max(a.amount, b.amount) * 0.05) { recurring.add(i); recurring.add(j) }
  }))
  const salaryCredits = credits.filter((c, i) => SALARY_WORDS.test(c.description) || recurring.has(i))

  const months = summariseMonths(credits, salaryCredits, debits)
  // A statement usually opens and closes mid-month, and those part months would drag the
  // average down. With four or more months on file the outer two are dropped; with fewer,
  // every month has to count or there would be nothing left to average.
  const basis = months.length >= 4 ? months.slice(1, -1) : months
  const average = arr => (arr.length ? arr.reduce((s, m) => s + m.credits, 0) / arr.length : 0)
  const averageSalary = arr => (arr.length ? arr.reduce((s, m) => s + m.salary, 0) / arr.length : 0)

  return {
    periodFrom: months[0]?.month || '',
    periodTo: months[months.length - 1]?.month || '',
    months,
    monthsUsed: basis.map(m => m.month),
    // Every money-in row, kept as well as the monthly totals: a declared income is often paid
    // as one deposit among many, and only the individual amounts can show that.
    credits,
    // Every money-out row too. The expense verification reads what the borrower actually spends
    // off these, the same way the income side reads the deposits.
    debits,
    totalCredits: Math.round(credits.reduce((s, c) => s + c.amount, 0) * 100) / 100,
    totalDebits: Math.round(debits.reduce((s, d) => s + d.amount, 0) * 100) / 100,
    transactionCount: txns.length,
    creditCount: credits.length,
    // Share of transaction rows the reader could put a direction to. A low figure means the
    // layout only partly matched, which the panel surfaces rather than hides.
    coverage: txns.length ? Math.round((classified / txns.length) * 100) : 0,
    method: useBalance ? 'balance' : 'keyword',
    averageMonthlyCredits: Math.round(average(basis) * 100) / 100,
    averageMonthlySalary: Math.round(averageSalary(basis) * 100) / 100,
  }
}

// The bank a file names in its own name. This is all that is left for a statement with no text
// layer at all — a photo or a flat scan, which never reaches the reader below.
export function detectBankFromFileName(fileName) {
  const name = fileName || ''
  return detectBank([name], name)
}

// A bank whose letterhead is a logo image prints its name nowhere in the page text, so the
// two places a PDF still gives itself away are read as well: the document information
// dictionary (Title, Author, Producer — the reporting system that generated the statement) and
// the targets of any links on it, which point at the bank's own site.
async function documentMeta(pdf) {
  try {
    const { info, metadata } = await pdf.getMetadata()
    const fields = info ? Object.values(info) : []
    const xmp = metadata?.getAll ? Object.values(metadata.getAll()) : []
    return [...fields, ...xmp].filter(v => typeof v === 'string').join(' ')
  } catch {
    return ''
  }
}

async function linkTargets(pdf) {
  const urls = []
  for (let n = 1; n <= Math.min(2, pdf.numPages); n++) {
    try {
      const annotations = await (await pdf.getPage(n)).getAnnotations()
      annotations.forEach(a => { if (a.url) urls.push(a.url); if (a.unsafeUrl) urls.push(a.unsafeUrl) })
    } catch {
      // A page whose annotations cannot be read simply contributes nothing.
    }
  }
  return urls.join(' ')
}

// Reads an uploaded bank statement. Returns its text plus, when the transaction table could
// be followed, the monthly money-in figures. `null` means the file has no text layer at all
// — a photo or a flat scan — which callers treat as "check it by hand", never as an error.
export async function parseBankStatement(file) {
  try {
    if (!file || !/\.pdf$/i.test(file.name || '')) return null
    const pdf = await openPdf(file)
    const rows = await readPdfRows(pdf)

    const text = rowsText(rows)
    if (text.trim().length < 40) return null

    const txns = readTransactionRows(rows)
    const money = txns.length >= 3 ? buildSummary(txns) : null
    const header = readHeader(rows, text)
    const printed = readStatementTotals(text)
    const reconciliation = reconcile(printed, money)

    // The page text is the best evidence of the issuer, but a logo-image letterhead leaves none
    // of it there. The fallbacks run in order of how directly each speaks for the document
    // itself: its own metadata, then where its links point, then what it was named on download.
    const fileName = file.name || ''
    const fallbacks = header.bank ? [] : [await documentMeta(pdf), await linkTargets(pdf), fileName]
    const bank = header.bank || fallbacks.map(src => detectBank([src], src)).find(Boolean) || ''

    if (import.meta.env?.DEV) {
      console.debug('[statement reader]', {
        file: fileName,
        bank,
        bankCandidatesInText: bankCandidates(text.split('\n').slice(0, LETTERHEAD_LINES).map(l => l.trim()), text),
        bankFromMetadata: fallbacks[0],
        bankFromLinks: fallbacks[1],
        firstLines: text.split('\n').slice(0, 15).map(l => l.trim()),
        // What the deposit check has to work with. No credits here is why a statement that
        // plainly shows a salary still reads Unverified.
        transactionRowsFound: txns.length,
        money: money && {
          averageMonthlyCredits: money.averageMonthlyCredits,
          averageMonthlySalary: money.averageMonthlySalary,
          totalCredits: money.totalCredits,
          totalDebits: money.totalDebits,
          coverage: money.coverage,
          method: money.method,
          months: money.months,
          credits: money.credits,
        },
        printed,
        reconciliation,
      })
    }

    return {
      source: 'parsed',
      text,
      ...header,
      bank,
      months: [],
      monthsUsed: [],
      credits: [],
      debits: [],
      transactionCount: txns.length,
      creditCount: 0,
      coverage: 0,
      averageMonthlyCredits: 0,
      averageMonthlySalary: 0,
      ...(money || {}),
      printed,
      reconciliation,
    }
  } catch {
    return null
  }
}

/* ---------------------------------------------------------------- *
 * Consumers of a stored analysis                                   *
 * ---------------------------------------------------------------- */

// The statement readings across every bank statement filed against one income entry,
// combined into a single view: months are merged (two statements covering the same month are
// added together, e.g. two accounts) and the text layers are concatenated, so the company
// name counts as found if it appears on any of the statements filed.
export function combineStatementAnalyses(documents) {
  const analyses = (documents || []).filter(d => d.docType === 'Bank Statement' && d.analysis).map(d => d.analysis)
  if (analyses.length === 0) return null

  const months = new Map()
  for (const a of analyses) {
    for (const m of a.months || []) {
      const row = months.get(m.month) || { month: m.month, credits: 0, salary: 0, debits: 0, count: 0, debitCount: 0 }
      row.credits += m.credits
      row.salary += m.salary
      row.debits += m.debits || 0
      row.count += m.count
      row.debitCount += m.debitCount || 0
      months.set(m.month, row)
    }
  }
  const ordered = [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
  const basis = ordered.length >= 4 ? ordered.slice(1, -1) : ordered
  const mean = (arr, key) => (arr.length ? arr.reduce((s, m) => s + m[key], 0) / arr.length : 0)

  return {
    statements: analyses.length,
    banks: [...new Set(analyses.map(a => a.bank).filter(Boolean))],
    accountNames: [...new Set(analyses.map(a => a.accountName).filter(Boolean))],
    text: analyses.map(a => a.text || '').join(' \n '),
    months: ordered,
    monthsUsed: basis.map(m => m.month),
    credits: analyses.flatMap(a => a.credits || []),
    debits: analyses.flatMap(a => a.debits || []),
    averageMonthlyCredits: Math.round(mean(basis, 'credits') * 100) / 100,
    averageMonthlySalary: Math.round(mean(basis, 'salary') * 100) / 100,
    // The weakest reading across the statements filed, since a set of statements is only as
    // trustworthy as its worst member: one that does not foot taints the combined figures.
    coverage: analyses.some(a => typeof a.coverage === 'number')
      ? Math.min(...analyses.filter(a => typeof a.coverage === 'number').map(a => a.coverage))
      : null,
    reconciliation: analyses.map(a => a.reconciliation).find(r => r?.checked && !r.ok)
      || analyses.map(a => a.reconciliation).find(r => r?.checked)
      || { checked: false, reason: 'no statement prints a balance or credit total to check against' },
    seeded: analyses.every(a => a.source === 'seeded'),
  }
}

const NAME_STOPWORDS = /^(the|and|co|ltd|plc|inc|llc|pte|company|limited|cambodia|khmer|group|holding|holdings|investment|investments|trading|services|service|enterprise|enterprises)$/

// The words that identify a company name, with legal suffixes, the country and other filler
// dropped so they cannot carry a match on their own — half of Phnom Penh is
// "(Cambodia) Investment Co., Ltd". A dotted initialism keeps its letters as one word, so
// "K.S.I.G.N (CAMBODIA) INVESTMENT Co.Ltd" identifies as {ksign}.
function nameTokens(value) {
  const collapsed = String(value).replace(/\b((?:[A-Za-z]\.){2,}[A-Za-z]?)/g, m => m.replace(/\./g, ''))
  const words = collapsed.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const distinctive = words.filter(w => w.length > 2 && !NAME_STOPWORDS.test(w))
  // A name made up entirely of filler still has to identify something, so fall back to the
  // words themselves before giving up on it.
  return new Set(distinctive.length ? distinctive : words.filter(w => w.length > 2))
}

// Whether a name the application declared — a company or a person — is printed anywhere in a
// document's text. This is what a document-level name check comes down to: a page that carries
// the name is evidence the two belong together, wherever on it the name appears.
//
// Matched on identifying words rather than the whole string, so "ABC Trading Co., Ltd." on the
// application is found in "ABC TRADING CO LTD" on the page, and "Mr. CHAN SOPHEAK" answers to
// "Chan Sopheak". Returns null when there is nothing to compare: no name on file, or no text
// read off the document.
export function nameInText(name, documentText) {
  if (!name || !documentText) return null
  const wanted = nameTokens(name)
  if (wanted.size === 0) return null
  const present = nameTokens(documentText)
  if (present.size === 0) return null
  const found = [...wanted].filter(w => present.has(w)).length
  // A long name is matched on half its identifying words, since a document rarely prints a
  // company's full registered name and will not print half of it by coincidence either. A short
  // one has to match outright: "ABA Bank" identifies as {aba, bank}, and half of that is "bank",
  // which appears on every page that mentions a bank transfer.
  return wanted.size <= 2 ? found === wanted.size : found / wanted.size >= 0.5
}

// The same check, named for the statement case it was written for: a salary narration, the
// account title or a standing-order reference carrying the declared employer.
export function companyNameOnStatement(company, statementText) {
  return nameInText(company, statementText)
}

// Month key → "May 2026", for the per-month table.
export function formatMonth(key) {
  const [year, month] = String(key).split('-')
  const index = parseInt(month, 10) - 1
  if (!year || Number.isNaN(index) || index < 0 || index > 11) return key
  return `${MONTH_NAMES[index].charAt(0).toUpperCase()}${MONTH_NAMES[index].slice(1)} ${year}`
}
