import { Outlet } from 'react-router-dom'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import RegionPicker from '../RegionPicker'

export default function Layout() {
  return (
    <div className="min-h-screen bg-[#EBEBEB] md:bg-gray-50">
      {/* Topo — só desktop (mobile usa a BottomNav) */}
      <TopNav />

      {/* Conteúdo: moldura de celular no mobile, coluna larga no desktop */}
      <div className="relative w-full max-w-[430px] md:max-w-5xl mx-auto min-h-screen md:min-h-0 bg-[#F8F8F8] md:bg-transparent overflow-x-hidden shadow-2xl md:shadow-none">
        <div className="pb-[68px] md:pb-10">
          <Outlet />
        </div>
      </div>

      {/* Barra inferior — só mobile */}
      <BottomNav />
      <RegionPicker />
    </div>
  )
}
