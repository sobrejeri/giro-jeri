import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import RegionPicker from '../RegionPicker'

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#EBEBEB] lg:bg-gray-50">
      <TopNav />

      <div className="relative w-full max-w-[430px] lg:max-w-6xl mx-auto min-h-screen lg:min-h-0 bg-[#F8F8F8] lg:bg-transparent overflow-x-hidden shadow-2xl lg:shadow-none">
        <div className="pb-[68px] lg:pb-10">
          <Outlet />
        </div>
      </div>

      <BottomNav />
      <RegionPicker />
    </div>
  )
}
