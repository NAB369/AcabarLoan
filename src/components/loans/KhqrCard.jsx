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
  reference,
  className = '',
  framed = true,
}) {
  if (!image) return null

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
        {/* No badge overlay here: a generated code carries its currency badge inside the image
            (see renderKhqrImage), so screen, print and PDF all show identical pixels. An
            uploaded image keeps whatever its issuer put in the middle. */}
        <div className="khqr-code-wrap mt-1.5">
          <img
            src={image}
            alt={reference ? `KHQR payment code for ${reference}` : 'KHQR payment code'}
            className="khqr-code w-full h-auto block"
          />
        </div>
        {referenceLine && <div className="mt-1">{referenceLine}</div>}
      </div>
    </div>
  )
}
