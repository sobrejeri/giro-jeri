import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import TopNav from './TopNav'

export default function Layout() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <TopNav />
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
