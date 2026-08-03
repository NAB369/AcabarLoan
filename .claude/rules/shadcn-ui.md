# shadcn/ui — base component library

shadcn/ui is the base for any **new** UI primitive going forward (button, dialog,
dropdown, select, tooltip, popover, sheet, tabs, accordion, form controls, etc.).
Tailwind CSS remains the styling layer — shadcn is just pre-built, ownable
Tailwind+Radix components copied into the repo, not an installed UI kit.

## How it's wired

- `components.json` — the CLI's config. `style: "new-york"`, `tsx: false` (this repo
  is plain JS/JSX, no TypeScript), CSS lives at `src/globals.css`, base color `slate`,
  CSS variables enabled.
- `@` resolves to `src/` (`vite.config.js` `resolve.alias`, mirrored in
  `jsconfig.json` for editor intellisense) — required for the `@/components/ui/...`
  and `@/lib/utils` imports shadcn generates.
- `src/lib/utils.js` — exports `cn()` (clsx + tailwind-merge). Every shadcn component
  uses it to merge its own classes with a caller-supplied `className`; use it the
  same way in any component you hand-write on top of shadcn primitives.
- `src/components/ui/` — where generated shadcn primitives land (currently: `button`).
  Treat these as **owned, editable source**, not a vendored dependency — shadcn's
  whole model is "copy the component in, then customize it directly." It's fine to
  edit a file in `ui/` to fit this app's needs; you don't need to route changes
  through the CLI again.
- `tailwind.config.js` — `theme.extend.colors` has the semantic tokens shadcn
  components use (`background`, `foreground`, `primary`, `secondary`, `muted`,
  `accent`, `destructive`, `border`, `input`, `ring`, `card`, `popover`), each backed
  by an HSL CSS variable, plus the `tailwindcss-animate` plugin (drives
  `animate-in`/`animate-out` + `fade-in-0`/`zoom-in-95`/`slide-in-from-*` utilities
  used by Radix-driven primitives' open/close states).
- `src/globals.css` — the `:root` / `.dark` blocks near the top define the token
  values. `--primary`/`--primary-foreground`/`--ring` are set to this app's brand
  blue (`brand-600` light / `brand-500` dark) rather than shadcn's stock near-black,
  so generated components come in on-brand.
- **Deliberately not done**: `tailwind.config.js` does **not** remap `rounded-lg`/
  `rounded-md`/`rounded-sm` to `--radius`, even though that's shadcn's standard
  fresh-project setup. This app already had 200+ pre-existing uses of those exact
  class names, and remapping them would silently reshape every one of those, not
  just new shadcn components. shadcn-generated components use Tailwind's own
  default radius scale as a result — a deliberate tradeoff, not an oversight. If a
  new shadcn component's generated code hardcodes `rounded-md`/`rounded-lg`/`sm`,
  leave it as-is; don't reintroduce the global remap to "fix" it.

## Adding a new primitive

```
npx shadcn@latest add <component>
```

This writes plain `.jsx` into `src/components/ui/` (confirmed working — `tsx: false`
in `components.json` makes the CLI emit JSX, not TSX) and pulls in whatever
`@radix-ui/react-*` package that specific primitive needs as a new dependency — you
don't need to pre-install Radix packages speculatively, only what each component
you actually add requires.

## The `accent` naming collision — already resolved, don't reintroduce it

Before this setup, `tailwind.config.js` had a **custom** `accent: { 50: ..., 950: ... }`
color scale that was a byte-for-byte duplicate of Tailwind's built-in `slate` palette.
shadcn's semantic tokens also define `accent`/`accent-foreground` (used for hover
states in menus, ghost buttons, etc. — see `src/components/ui/button.jsx`'s `outline`/
`ghost` variants). The old custom scale was removed and its one usage
(`text-accent-800` in `Layout.jsx`) was swapped for `text-slate-800` (the identical
color, from Tailwind's built-in palette) — use `slate-*` directly for that gray scale;
don't add a new custom color literally named `accent`.

## Where custom animations go

Enter/exit transitions for shadcn/Radix primitives (dialogs, dropdowns, popovers,
sheets, accordions) are already covered by the `tailwindcss-animate` plugin's
`data-[state=open]:animate-in` / `data-[state=closed]:animate-out` utility classes —
don't hand-write `@keyframes` for those. Anything genuinely custom (not a Radix
open/close state) goes in the "CUSTOM KEYFRAMES / TRANSITIONS" section of
`src/globals.css`, near the top of the file, as a named `@keyframes` + a utility
class — follow the existing `fadeIn`/`.fade-in` entry as the pattern.

## Existing hand-built components are not being migrated proactively

`src/components/shared/` (StatusBadge, Toast, Pagination, InfoCard, etc.) stays as-is
for now — this setup is additive, not a rewrite. Migrate an existing hand-built
component to a shadcn primitive only when you're already touching it for another
reason, or the user explicitly asks for that conversion.
