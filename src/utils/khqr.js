import QRCode from 'qrcode'

// Builds the merchant's static KHQR. The string inside the image is a real EMVCo payload in
// the shape Bakong reads, not a decorative stand-in — so if the merchant account below is a
// Bakong-registered ID, the code a borrower scans genuinely resolves to it.
//
// What this cannot do is verify that registration: the WeBill365 connection in this app is a
// mock with no endpoint behind it (see INITIAL_INTEGRATIONS), so nothing here can ask Bakong
// whether the account exists. A code generated from a sandbox or mistyped merchant ID is
// well-formed and still scans — it just resolves to nothing. Scan a generated code once
// before any of it reaches a borrower.

// EMVCo fields are tag (2 digits) + length (2 digits) + value.
function tlv(tag, value) {
  const v = String(value ?? '')
  return `${tag}${String(v.length).padStart(2, '0')}${v}`
}

// CRC-16/CCITT-FALSE, computed over everything including the trailing "6304" tag and length.
//
// Over the UTF-8 *bytes*, not the string's UTF-16 code units. The two agree only while every
// character is ASCII, so reading the string directly produced a correct checksum in testing
// and a rejected QR the moment a merchant name carried a Khmer or Chinese character — which
// this app, with a Khmer company name on file, would hit in ordinary use.
export function crc16(input) {
  const bytes = new TextEncoder().encode(input)
  let crc = 0xffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const CURRENCY_CODE = { USD: '840', KHR: '116' }

// EMVCo caps these; an over-long company name would otherwise push the payload out of spec.
const MAX_MERCHANT_NAME = 25
const MAX_MERCHANT_CITY = 15

// Merchant name and city are forced to ASCII, which is what tags 59/60 are meant to carry and
// what every Bakong KHQR in circulation uses. It also removes a real ambiguity: EMVCo counts a
// field's length in characters while the QR transmits UTF-8 bytes, and the two part company
// the moment a character is non-ASCII — a Khmer company name would leave the declared lengths
// disagreeing with the bytes a scanner walks. Keeping these fields ASCII makes the two
// identical for the whole payload. Latin company name in, so nothing is normally lost; a name
// with nothing ASCII left falls back rather than emitting an empty required field.
// The fallback needs more than "not empty" to be worth emitting: stripping a Khmer name like
// "អាខាបារ ម.ក" leaves the bare punctuation "." , which is a technically valid tag 59 and a
// useless one to show a borrower. Anything with no letter or digit left falls back instead.
function asciiOnly(value, max, fallback) {
  const cleaned = String(value || '').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim()
  return (/[A-Za-z0-9]/.test(cleaned) ? cleaned : fallback).slice(0, max)
}

// EMVCo caps the additional-data fields too, and these carry the identifiers a settlement is
// matched back on, so they are truncated rather than allowed to push the payload out of spec.
const MAX_BILL_NUMBER = 25
const MAX_REFERENCE = 25

export function buildKhqrPayload({
  account,
  merchantName,
  merchantCity = 'Phnom Penh',
  currency = 'USD',
  billNumber = '',
  reference = '',
}) {
  const id = String(account || '').trim()
  if (!id) return ''

  // Tag 62 is what makes a code belong to one borrower rather than the whole company: the
  // loan reference rides in as the bill number and the customer code as the reference label,
  // so a payment collected against this QR comes back naming the loan it settles. Without it
  // every borrower would be scanning the same merchant code and nothing could be attributed.
  // Cleaned first, then emitted only if something survived — a value that is all punctuation
  // would otherwise be written as a present-but-empty field, which is worse than absent.
  const bill = asciiOnly(billNumber, MAX_BILL_NUMBER, '')
  const ref = asciiOnly(reference, MAX_REFERENCE, '')
  const additional = [
    bill ? tlv('01', bill) : '',
    ref ? tlv('05', ref) : '',
  ].join('')

  const body = [
    tlv('00', '01'),                                   // payload format indicator
    tlv('01', '11'),                                   // static — the same code is reusable for every installment
    // Bakong's account tag. 29 carries the account-holder ID, which is what a static
    // merchant KHQR is keyed on.
    tlv('29', tlv('00', 'kh.gov.nbc.bakong') + tlv('01', id)),
    tlv('52', '0000'),                                 // merchant category — unclassified
    tlv('53', CURRENCY_CODE[currency] || CURRENCY_CODE.USD),
    tlv('58', 'KH'),
    tlv('59', asciiOnly(merchantName, MAX_MERCHANT_NAME, 'MERCHANT')),
    tlv('60', asciiOnly(merchantCity, MAX_MERCHANT_CITY, 'Phnom Penh')),
    additional ? tlv('62', additional) : '',
  ].join('')
  const withCrcTag = `${body}6304`
  return `${withCrcTag}${crc16(withCrcTag)}`
}

// Rendered at the same 512px the uploaded image is downscaled to, on an opaque white ground
// with the quiet zone EMVCo requires — a QR without that margin will not lock on.
//
// Error correction is 'H' (recovers ~30%) rather than the usual 'M' (~15%) because the card
// this is shown in lays a currency badge over the middle of the code. At 'M' that badge eats
// most of the recovery budget and a slightly creased or poorly-lit print stops scanning; at
// 'H' the same badge covers well under half of what the code can lose.
export async function renderKhqrImage(payload) {
  if (!payload) return ''
  return QRCode.toDataURL(payload, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  })
}
