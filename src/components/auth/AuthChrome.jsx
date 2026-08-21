import { useState } from 'react'
import { Eye, EyeOff, Lock, ShieldAlert } from 'lucide-react'

// ── The furniture both pre-session screens share ─────────────────────────────
// Sign in and request access are two screens, not two modes of one form, but they are the same
// screen to look at: the same card, the same inputs, the same warnings. Kept here so the pair
// cannot drift into looking like two different applications, which is exactly what a person
// bounced between them would read as a broken login.

export const field = 'w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 focus:bg-white dark:focus:bg-slate-700 transition'
export const leadIcon = 'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none'
export const label = 'block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5'

export function PasswordField({ id, value, onChange, placeholder, autoComplete, autoFocus }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Lock className={leadIcon} />
      <input
        id={id}
        autoFocus={autoFocus}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${field} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShown(v => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// The artwork, if it is in the project — otherwise the wordmark set in type.
//
// Both paths exist because they solve different halves of the problem. The supplied PNG is the real
// mark, with its stylised "e" and its exact letterfitting, and nothing set in type reproduces that.
// But a file that is not in public/ renders as nothing at all, which is how this screen ended up
// with no mark on it. So: try the file, and set it in type when there is none.
//
// TO USE THE REAL ARTWORK: save it as one of PLATFORM_LOGO_SOURCES below, in public/. Nothing else
// changes — Vite serves public/ as-is, so it appears on the next refresh, on both doors.
const PLATFORM_LOGO_SOURCES = ['/weloan-logo.png', '/weloan-logo.svg', '/weloan365-logo.png']

export function PlatformLogo({ name, className = 'text-4xl' }) {
  // Walks the list rather than giving up on the first miss, so the mark appears whichever of the
  // usual filenames it was saved under.
  const [attempt, setAttempt] = useState(0)
  const src = PLATFORM_LOGO_SOURCES[attempt]

  if (!src) {
    // Outfit at 800 is the app's own sans at its heaviest — a geometric face with the same
    // single-storey 'a' and circular 'e' as the artwork, and already loaded (see index.html), so
    // this costs no new dependency. Tracking pulled in tight, the way the mark is drawn.
    return (
      <PlatformWordmark
        name={name}
        className={`${className} font-sans font-extrabold tracking-[-0.035em] leading-none`}
      />
    )
  }
  return (
    // The mark's second half is black, which would vanish on a dark ground — so the artwork keeps
    // the white paper it was drawn for and the plate's ring follows the theme instead.
    <span className="inline-flex items-center justify-center px-5 py-3.5 rounded-2xl bg-white ring-1 ring-slate-200 dark:ring-slate-700 shadow-sm">
      <img
        src={src}
        alt={name}
        onError={() => setAttempt(a => a + 1)}
        className="h-9 w-auto object-contain"
      />
    </span>
  )
}

// The PRODUCT's mark, above whichever card is showing. It used to be the tenant's logo, name and
// "Loan Management System" — which named the institution rather than the software, and meant the
// same install looked like a different application on each door. The bubble echoes the family's
// artwork (see integration/ProviderLogo.jsx for where the two hues come from); there is no image
// file for it, so it is drawn, which keeps it crisp at every size and adds no binary to the repo.
export function AuthBrandHeader({ name }) {
  return (
    <div className="text-center">
      <h1><PlatformLogo name={name} /></h1>
    </div>
  )
}

// The product family's wordmark, split exactly as the supplied artwork is: "We" in the family blue
// #1B2BEF, the product word in black, "365" in the mark's orange #FF5C00. The two hues are the ones
// integration/ProviderLogo.jsx already carries, sampled from the real marks, so the family reads as
// one set of products. Black becomes white on a dark ground — the only part of the mark that has to
// move, because it is the one drawn against the paper rather than against a colour.
//
// A name that is not of the We_______365 shape is left as plain text rather than force-fitted into a
// mark it does not belong to.
//
// The operator's name is editable, so a name that is not of that shape is left as plain text rather
// than being force-fitted into a mark it does not belong to.
export function PlatformWordmark({ name, className = '' }) {
  const parts = /^(we)(.+?)(365)$/i.exec(String(name || '').trim())
  if (!parts) return <span className={className}>{name}</span>
  return (
    <span className={className}>
      <span className="text-[#1B2BEF] dark:text-[#6E7BFF]">{parts[1]}</span>
      <span className="text-slate-900 dark:text-white">{parts[2]}</span>
      <span className="text-[#FF5C00] dark:text-[#FF8A3D]">{parts[3]}</span>
    </span>
  )
}

// The operator's identity, for the console's own sign-in. Deliberately NOT the tenant's logo and
// name: the account that governs a business does not belong to it, and a door wearing the
// business's mark would say the opposite before anyone had typed anything.
export function AuthOperatorHeader({ name }) {
  return (
    <div className="text-center">
      <h1><PlatformLogo name={name} /></h1>
      {/* The same artwork as the business door, with the one word that says which door this is. */}
      <p className="text-[11px] font-medium uppercase tracking-wider text-gold-800 dark:text-gold-400/80 mt-3">
        Super Admin
      </p>
    </div>
  )
}

// An explanation opened in place rather than a link that navigates. There is no mail server to
// send a reset through and no queue to file anything into beyond this browser, so a link that
// appeared to do either would be a lie.
export function Explainer({ icon: Icon, title, children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3.5 py-3 mt-4">
      <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{title}</p>
        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-1">{children}</p>
      </div>
    </div>
  )
}

// Said before the form is touched rather than after a failed attempt: where Web Crypto is
// unavailable no password can be hashed, so offering the fields without explaining that would
// send the operator round the retry loop for a deployment problem.
export function InsecureContextWarning({ what = 'Sign-in' }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3.5 py-3 mb-5">
      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
        <span className="font-bold">{what} is unavailable at this address.</span> Passwords are
        handled with the browser&rsquo;s crypto API, which works only over <code>https://</code> or{' '}
        <code>http://localhost</code>. Run <code>npm run dev</code> and open the localhost address it
        prints, or serve the built app over https.
      </p>
    </div>
  )
}

// The limit of what a browser-only account store can claim, stated rather than left to be
// inferred from the presence of a password field.
export function AuthFootnote() {
  return (
    <p className="flex items-start gap-2 text-[11px] leading-snug text-slate-500 dark:text-slate-500 mt-5">
      <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
      <span>
        Accounts and passwords are held in this browser, and there is no server to check them
        against — so anyone with developer tools on this machine can get past this screen. Treat the
        machine as the real control and keep live borrower data off shared terminals.
      </span>
    </p>
  )
}
