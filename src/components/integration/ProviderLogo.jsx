// Provider wordmarks, drawn as text rather than shipped as image files: they stay crisp at
// every size the page uses them, follow the dark theme, and keep no binary assets in the
// repo. To use a provider's real artwork instead, replace its branch with an <img> — the
// call sites only pass an id and a size.
// `xs` exists for the logo tiles on the Integrations landing page and its provider
// catalogue, where the mark has to sit inside a fixed square without spilling out.
const SIZES = {
  xs: { text: 'text-[11px]' },
  sm: { text: 'text-sm' },
  md: { text: 'text-lg' },
  lg: { text: 'text-2xl' },
}

export default function ProviderLogo({ id, name, size = 'md' }) {
  const s = SIZES[size] || SIZES.md

  // WeBill365: "WeBill" in the brand blue, "365" in the mark's orange, on the card's own
  // background rather than a coloured chip. Both hues are lifted on a dark card.
  if (id === 'webill365') {
    return (
      <span
        role="img"
        aria-label={name}
        className={`inline-flex items-baseline font-extrabold tracking-tight leading-none ${s.text}`}
      >
        <span className="text-[#1B2BEF] dark:text-[#6E7BFF]">WeBill</span>
        <span className="text-[#FF5C00] dark:text-[#FF8A3D]">365</span>
      </span>
    )
  }

  if (id === 'weums') {
    return (
      <span
        role="img"
        aria-label={name}
        className={`inline-flex items-baseline font-extrabold tracking-tight leading-none ${s.text}`}
      >
        {/* The mark's blue is set against white; on a dark card it is lifted so it stays
            legible without losing the brand hue. */}
        <span className="text-[#1B2BEF] dark:text-[#6E7BFF]">We</span>
        <span className="text-slate-900 dark:text-white">UMS</span>
      </span>
    )
  }

  // WeInvoice: "We" in the same brand blue as its sibling products, "Invoice" in the
  // mark's dark green. The green is lifted on a dark card so it stays legible.
  if (id === 'weinvoice365') {
    return (
      <span role="img" aria-label={name} className={`inline-flex items-baseline font-extrabold tracking-tight leading-none ${s.text}`}>
        <span className="text-[#1B2BEF] dark:text-[#6E7BFF]">We</span>
        <span className="text-[#0B5D3B] dark:text-emerald-400">Invoice</span>
      </span>
    )
  }

  if (id === 'bakong') {
    return (
      <span role="img" aria-label={name} className={`inline-flex items-baseline font-extrabold tracking-tight leading-none ${s.text}`}>
        <span className="text-[#003A70] dark:text-sky-300">BA</span>
        <span className="text-[#E01A2B]">KONG</span>
      </span>
    )
  }

  // The bureau is known by its initials in every report it issues, and they are what fits
  // a logo tile — the full name is beside the mark wherever this is used.
  if (id === 'cbc') {
    return (
      <span role="img" aria-label={name} className={`inline-flex items-baseline font-extrabold tracking-tight leading-none ${s.text}`}>
        <span className="text-[#0B4F9E] dark:text-sky-300">CBC</span>
      </span>
    )
  }

  if (id === 'telegram') {
    return (
      <span role="img" aria-label={name} className={`font-extrabold tracking-tight leading-none ${s.text} text-[#229ED9]`}>
        Telegram
      </span>
    )
  }

  // A provider with no wordmark of its own falls back to its plain name, kept inside
  // whatever box it is dropped into.
  return (
    <span className={`font-bold tracking-tight text-center leading-tight max-w-full truncate ${s.text} text-slate-700 dark:text-slate-200`}>
      {name}
    </span>
  )
}
