import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import RegionPicker from '../RegionPicker'

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#EBEBEB] lg:bg-gray-50">
      {/* Topo — só desktop real (mobile e tablet usam a BottomNav) */}
      <TopNav />

      {/* Conteúdo: moldura de celular até < lg; coluna larga só no desktop */}
      <div className="relative w-full max-w-[430px] lg:max-w-5xl mx-auto min-h-screen lg:min-h-0 bg-[#F8F8F8] lg:bg-transparent overflow-x-hidden shadow-2xl lg:shadow-none">
        <div className="pb-[68px] lg:pb-10">
          <Outlet />
        </div>
      </div>

      {/* Barra inferior — some só no desktop */}
      <BottomNav />
      <RegionPicker />
    </div>
  )
}
