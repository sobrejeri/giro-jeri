import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenu={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
