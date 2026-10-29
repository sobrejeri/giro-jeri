import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import SeloDoApp from '../SeloDoApp'

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenu={() => setNavOpen(true)} />
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 scrollbar-thin"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <Outlet />
        </main>
      </div>
      {/* Número de não lidas no ícone do app instalado. */}
      <SeloDoApp />
    </div>
  )
}
