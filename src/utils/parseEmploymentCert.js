import { openPdf, readPdfRows, rowsText, labelledValue, labelledAmount } from './pdfText'
import { nameInText } from './parseBankStatement'
import { DOC_STATUS } from './statementIncome'

// ── Reader for an uploaded certificate of employment ───────────────────────────
// A certificate of employment is the document that says the party works where the application
// claims they work. That is a question about what the certificate says — so it is read off the
// page, never off the file name. A file called "COE_scan_final(2).pdf" is no worse evidence than
// one called after the employer, and one named after the employer is no better: the name in a
// file name was typed by whoever saved it, and the name on the page was put there by the issuer.
//
// Two things decide the verdict, and both are answered by the text:
//
//   the employer — the company the income record declares has to be named on the certificate.
//   A certificate from some other employer verifies nothing about this employment, however
//   genuine it is.
//
//   the employee — the party the income belongs to has to be named on it. A certificate for a
//   colleague of theirs is a real certificate about the wrong person.
//
// What else it states — the position, the standing, the joining date, the salary — is read for
// the reviewer to see, and never decides the verdict on its own: a certificate is evidence of
// employment, and the income figure is verified from payslips and statements.

// Labels are anchored to the start of the cell. A certificate is half prose and half table, and
// unanchored patterns pick the same word out of a sentence — "currently holds the position of"
// would answer to a Position label and hand back the sentence around it.
const EMPLOYEE_LABELS = [
  /^\s*(?:employee|staff)\s*(?:full\s*)?name\b/i,
  // A bare "Name" label, but not "Name of the company" — the employer has its own field.
  /^\s*(?:full\s*)?name\b(?!\s*of\s+(?:the\s+)?(?:company|employer|organisation|organization))/i,
]
const EMPLOYER_LABELS = [/^\s*(?:employer|company|organisation|organization)\s*name\b/i, /^\s*employer\b/i]
// A label printed as two names for the same field takes both, or the second is left behind as
// the value: "Position / Title" would otherwise read as "/ Title".
const POSITION_LABELS = [
  /^\s*position\s*(?:\/\s*(?:job\s*)?title)?/i,
  /^\s*(?:job\s*)?title\s*(?:\/\s*position)?/i,
  /^\s*designation\b/i,
]
const JOINED_LABELS = [
  /^\s*date\s*of\s*joining\b/i, /^\s*join(?:ing|ed)\s*date\b/i, /^\s*date\s*joined\b/i,
  /^\s*(?:employment\s*)?start\s*date\b/i, /^\s*date\s*of\s*(?:employment|hire)\b/i,
]
const STATUS_LABELS = [/^\s*employment\s*status\b/i, /^\s*status\s*of\s*employment\b/i]
const SALARY_LABELS = /^\s*(?:current\s+)?(?:monthly\s+|gross\s+|basic\s+|net\s+)*salary\b/i

// Where a certificate carries no Employer field at all — most are written as a letter — the
// employer is in the sentence that certifies the employment.
const EMPLOYER_PROSE = [
  /\bemployee\s+of\s+([^,.;\n]{2,60})/i,
  /\bemployed\s+(?:by|at|with)\s+([^,.;\n]{2,60})/i,
  /\bworks?\s+(?:for|at)\s+([^,.;\n]{2,60})/i,
]

// A label in a table has a short value in the next cell along; the same word inside a paragraph
// has a whole sentence after it. Anything long or many-worded came from prose, not from a field,
// and is dropped rather than shown to a reviewer as what the certificate states.
function fieldValue(rows, patterns) {
  const value = labelledValue(rows, patterns).replace(/[\s:.\-–]+$/, '').trim()
  if (!value || value.length > 60 || value.split(/\s+/).length > 8) return ''
  return value
}

function employerFromProse(text) {
  for (const re of EMPLOYER_PROSE) {
    const found = re.exec(text)?.[1]?.trim()
    if (found && found.length <= 60) return found
  }
  return ''
}

// Reads an uploaded certificate. Returns what the page states, or `null` when the file has no
// text layer to state it in — a photo or a flat scan, which the caller treats as "confirm it by
// hand" and never as a certificate that failed.
export async function parseEmploymentCert(file) {
  try {
    if (!file || !/\.pdf$/i.test(file.name || '')) return null
    const pdf = await openPdf(file)
    const rows = await readPdfRows(pdf)

    const text = rowsText(rows)
    if (text.trim().length < 20) return null

    const analysis = {
      source: 'parsed',
      text,
      employee: fieldValue(rows, EMPLOYEE_LABELS),
      employer: fieldValue(rows, EMPLOYER_LABELS) || employerFromProse(text),
      position: fieldValue(rows, POSITION_LABELS),
      joinedOn: fieldValue(rows, JOINED_LABELS),
      employmentStatus: fieldValue(rows, STATUS_LABELS),
      salary: labelledAmount(rows, SALARY_LABELS),
    }

    if (import.meta.env?.DEV) {
      console.debug('[employment certificate reader]', { file: file.name, ...analysis, text: undefined })
    }

    return analysis
  } catch {
    return null
  }
}

// Which of the two names the certificate carries. `true`/`false` per name, and `null` where
// there is nothing on the income record to look for — an unanswerable check is not a failed one.
export function employmentCertNames(analysis, ctx = {}) {
  const text = analysis?.text || ''
  const employer = ctx.companyName || ''
  const candidates = (ctx.borrowerNames || []).filter(Boolean)
  const employeeMatch = candidates.find(name => nameInText(name, text))
  return {
    employer,
    employerNamed: nameInText(employer, text),
    employee: employeeMatch || candidates[0] || '',
    employeeNamed: candidates.length === 0 || !text ? null : !!employeeMatch,
  }
}

// What the certificate was found to say, for the Description column — the names it carries and
// the employment it certifies. Written lowercase, to be sentence-cased by the caller.
export function describeEmploymentCert(analysis, ctx = {}) {
  if (!analysis) return 'no text layer to read the employer or the employee off'
  const { employer, employerNamed, employee, employeeNamed } = employmentCertNames(analysis, ctx)
  return [
    employerNamed === null ? '' : `${employerNamed ? 'names' : 'does not name'} ${employer}`,
    employeeNamed === null ? '' : employeeNamed ? `certifies ${employee}` : `does not name ${employee}`,
    analysis.position && `as ${analysis.position}`,
    analysis.employmentStatus && analysis.employmentStatus.toLowerCase(),
    analysis.joinedOn && `since ${analysis.joinedOn}`,
    analysis.salary > 0 && `states a salary of ${analysis.salary.toFixed(2)}`,
  ].filter(Boolean).join(' · ')
}

// The verdict on one certificate. Three of the four document states are reachable — a
// certificate says whether the employment is what was declared, not what the income is, so
// there is no "Verified Lower" for it to come back with:
//
//   Verified            — the certificate names the declared employer and the party
//   Partially Verified  — it names one of them, or there is nothing on the record to check
//                         the other against
//   Unverified          — it names neither, or nothing could be read off the file
export function assessEmploymentCert(analysis, ctx = {}) {
  const out = (state, reason) => ({ state, reason, verified: null })
  if (!analysis) {
    return out(
      DOC_STATUS.unverified,
      'The certificate has no text layer to read — it is a scan or a photo, so confirm the'
      + ' employer and the employee on it by hand',
    )
  }

  const { employer, employerNamed, employee, employeeNamed } = employmentCertNames(analysis, ctx)
  const states = describeEmploymentCert(analysis, ctx)

  if (employerNamed === null && employeeNamed === null) {
    return out(
      DOC_STATUS.partial,
      `The certificate reads — ${states} — but the income record names neither an employer nor a`
      + ' party to check it against',
    )
  }
  if (employerNamed === false && employeeNamed === false) {
    return out(
      DOC_STATUS.unverified,
      `The certificate names neither ${employer} nor ${employee} — it is a certificate for some`
      + ' other employment, so it evidences nothing about this one',
    )
  }
  if (employerNamed === false) {
    return out(
      DOC_STATUS.partial,
      `The certificate certifies ${employee} but does not name ${employer} — the employer it was`
      + ' issued by is not the one on the income record',
    )
  }
  if (employeeNamed === false) {
    return out(
      DOC_STATUS.partial,
      `The certificate is issued by ${employer} but does not name ${employee} — it certifies`
      + " somebody else's employment there",
    )
  }
  if (employerNamed === null || employeeNamed === null) {
    const missing = employerNamed === null ? 'employer' : 'party'
    return out(
      DOC_STATUS.partial,
      `${states.charAt(0).toUpperCase()}${states.slice(1)} — the income record carries no`
      + ` ${missing} to check the other half against`,
    )
  }
  return out(DOC_STATUS.verified, `${states.charAt(0).toUpperCase()}${states.slice(1)}`)
}
