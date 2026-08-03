import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="h-screen flex overflow-hidden font-sans text-slate-800 antialiased">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
          {children}
        </div>
      </main>
    </div>
  )
}
