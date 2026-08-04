import { cn } from '@/lib/utils'

// The borrower's payment code in the KHQR presentation people actually recognise: red
// banner with the wordmark, payee under it, code below, loan reference along the bottom.
// Used on screen and on the printed schedule from the same markup, so the two cannot drift.
//
// The wordmark is set in type rather than shipped as the official logo artwork — that mark
// is NBC/Bakong's, and an app that is not a licensed KHQR issuer should not be stamping the
// real asset onto documents it generates.
//
// `framed` is what stops the card being drawn twice. A code generated here is a bare QR and
// needs the banner; an uploaded one is almost always a screenshot of a complete KHQR card
// that already carries its own banner and payee, and wrapping that produced two stacked red
// headers. An uploaded image is shown as it came in, with only the reference added beneath.
export default function KhqrCard({
  image,
  payeeName,
  currency = 'USD',
  reference,
  className = '',
  framed = true,
}) {
  if (!image) return null

  // Riel and dollar codes carry their own symbol, matching what the payer's bank app shows.
  const symbol = currency === 'KHR' ? '៛' : '$'

  const referenceLine = reference
    ? <p className="khqr-ref text-[8px] font-semibold text-slate-600 text-center leading-tight truncate">{reference}</p>
    : null

  if (!framed) {
    return (
      <div className={cn('khqr-card w-full overflow-hidden rounded-xl border border-slate-200 bg-white', className)}>
        <img
          src={image}
          alt={reference ? `KHQR payment code for ${reference}` : 'KHQR payment code'}
          className="khqr-code w-full h-auto block"
        />
        {referenceLine && <div className="px-1.5 pb-1.5 pt-1">{referenceLine}</div>}
      </div>
    )
  }

  return (
    <div className={cn('khqr-card w-full overflow-hidden rounded-xl border border-slate-200 bg-white', className)}>
      <div className="khqr-card-band bg-[#E21B23] py-1.5 flex items-center justify-center">
        <span className="khqr-wordmark text-white font-extrabold tracking-[0.12em] text-[13px] leading-none">KHQR</span>
      </div>
      <div className="khqr-card-body px-2 pt-1.5 pb-1.5">
        <p className="khqr-payee text-[10px] font-semibold text-slate-800 truncate leading-tight">{payeeName}</p>
        <div className="khqr-code-wrap relative mt-1.5">
          <img
            src={image}
            alt={reference ? `KHQR payment code for ${reference}` : 'KHQR payment code'}
            className="khqr-code w-full h-auto block"
          />
          {/* Only over a code generated here, whose error correction is set to 'H' to carry
              it. An uploaded image's recovery budget is unknown and is left alone. */}
          <span
            className="khqr-badge absolute left-1/2 top-1/2 w-[24%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-black text-white font-bold flex items-center justify-center text-[11px] leading-none"
            aria-hidden="true"
          >
            {symbol}
          </span>
        </div>
        {referenceLine && <div className="mt-1">{referenceLine}</div>}
      </div>
    </div>
  )
}
