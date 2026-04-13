import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#EBEBEB] flex items-start justify-center">
      <div className="relative w-full max-w-[430px] min-h-screen bg-[#F8F8F8] overflow-x-hidden shadow-2xl">
        <div className="pb-[68px]">
          <Outlet />
        </div>
        <BottomNav />
      </div>
    </div>
  )
}
