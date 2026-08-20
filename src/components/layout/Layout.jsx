import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout({ children }) {
  const { state } = useApp()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // The drawer is a slide-over, so it backs out on Escape like every other overlay in the
  // app. Local state, so App.jsx's global Escape handler can't reach it.
  useEffect(() => {
    if (!mobileNavOpen) return undefined
    const handleKey = e => { if (e.key === 'Escape') setMobileNavOpen(false) }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mobileNavOpen])

  return (
    <div className="h-screen flex overflow-hidden font-sans text-slate-800 antialiased">
      {/* Off screen until it is tabbed to. Without it a keyboard user tabs the whole sidebar —
          six modules — on every single page before reaching the page they came for. */}
      <a
        href="#main-content"
        onClick={e => {
          // The href alone would put the hash in the URL, which this app reads as a route
          // (see utils/navigation) and would navigate away. Move focus directly instead.
          e.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-brand-600 focus:text-white focus:text-sm focus:font-bold focus:shadow-lg"
      >
        Skip to main content
      </a>
      {/* Only under the drawer. From md the sidebar is part of the page and dimming the
          content beside it would be dimming the page against itself. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        {/* A failed write used to be swallowed, so an install that had filled its quota kept
            accepting work and lost all of it at the next reload. A banner rather than a toast:
            this does not stop being true after four seconds. */}
        {state.storageFailed && (
          <div role="alert" className="flex items-start gap-2.5 px-4 py-2.5 bg-rose-600 text-white">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-snug">
              This browser stopped saving &mdash; its storage is full. Anything entered from now on
              will be lost when the page reloads. Export what you need, then clear space.
            </p>
          </div>
        )}
        {/* tabIndex -1 so the skip link has something to land on; it is not a Tab stop itself. */}
        <div
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900 focus:outline-none"
        >
          {children}
        </div>
      </main>
    </div>
  )
}
