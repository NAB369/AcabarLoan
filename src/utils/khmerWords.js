// Khmer number-to-words, for the "ជាលាយលក្ខណ៍អក្សរ" (in words) blank that a printed loan
// agreement carries beside every figure. A contract states the amount twice — in digits and in
// words — so that a digit altered after signing contradicts the sentence next to it; a printed
// form that fills only the digits leaves the protection the second field exists to give.

const ONES = ['សូន្យ', 'មួយ', 'ពីរ', 'បី', 'បួន', 'ប្រាំ', 'ប្រាំមួយ', 'ប្រាំពីរ', 'ប្រាំបី', 'ប្រាំបួន']
const TENS = ['', 'ដប់', 'ម្ភៃ', 'សាមសិប', 'សែសិប', 'ហាសិប', 'ហុកសិប', 'ចិតសិប', 'ប៉ែតសិប', 'កៅសិប']

// Khmer counts in units of ten thousand and a hundred thousand (ម៉ឺន, សែន) as well as the
// hundreds and thousands English stops at, so the scales are walked explicitly rather than
// grouped in threes the way a Latin-language converter would.
const SCALES = [[100000, 'សែន'], [10000, 'ម៉ឺន'], [1000, 'ពាន់'], [100, 'រយ']]

function below1e6(n) {
  let rest = n
  let out = ''
  for (const [value, name] of SCALES) {
    const count = Math.floor(rest / value)
    if (count > 0) {
      out += ONES[count] + name
      rest -= count * value
    }
  }
  if (rest >= 10) {
    out += TENS[Math.floor(rest / 10)]
    rest %= 10
  }
  if (rest > 0) out += ONES[rest]
  return out
}

export function khmerNumberWords(value) {
  const whole = Math.floor(Math.abs(Number(value) || 0))
  if (whole === 0) return ONES[0]
  const millions = Math.floor(whole / 1000000)
  if (millions > 0) return khmerNumberWords(millions) + 'លាន' + below1e6(whole % 1000000)
  return below1e6(whole)
}

// The riel carries no subunit in day-to-day MFI practice (see currencyDecimals in format.js), so
// only a dollar amount ever reaches the សេន clause.
export function khmerMoneyWords(amount, currency = 'USD') {
  const value = Math.abs(Number(amount) || 0)
  const unit = currency === 'KHR' ? 'រៀល' : 'ដុល្លារអាមេរិក'
  const whole = Math.floor(value)
  const cents = Math.round((value - whole) * 100)
  const words = khmerNumberWords(whole) + unit
  if (currency === 'KHR' || cents === 0) return words
  return `${words}${khmerNumberWords(cents)}សេន`
}
