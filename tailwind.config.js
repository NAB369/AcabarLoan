import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e8f0fa',
          100: '#c5d9f2',
          200: '#9bbde8',
          300: '#6a9cdb',
          400: '#3d7bcd',
          500: '#1559b8',
          600: '#0047ab',
          700: '#003a8f',
          800: '#002d73',
          900: '#002057',
          950: '#001333',
        },
        gold: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#ffd700',
          600: '#e6c200',
          700: '#ca9a04',
          800: '#a16207',
          900: '#854d0e',
          950: '#713f12',
        },
        // shadcn/ui semantic tokens — driven by the CSS variables defined in
        // src/globals.css (:root / .dark). `accent` here replaces the old
        // accent-50..950 scale, which was a byte-for-byte duplicate of Tailwind's
        // built-in `slate` palette (use `slate-*` directly for that instead) and
        // would otherwise collide with shadcn's semantic `accent` token used by
        // every generated component (menus, hover states, etc.).
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans:  ['Outfit', 'Kantumruy Pro', 'sans-serif'],
        serif: ['Libre Baskerville', 'Georgia', 'serif'],
        // `font-khmer` is used on the Khmer-script fields and cells (chart of accounts,
        // employee names) to put the Khmer face first rather than relying on fallback.
        khmer: ['Kantumruy Pro', 'Outfit', 'sans-serif'],
      },
      // Radix-driven components (Accordion, Collapsible) animate against their
      // own measured height, exposed as this CSS var — shadcn's standard keyframes.
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
