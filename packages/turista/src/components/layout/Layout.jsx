import { Outlet, useLocation } from 'react-router-dom'
import { MapPin, ChevronRight } from 'lucide-react'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import RegionPicker from '../RegionPicker'
import { useRegion } from '../../contexts/RegionContext'

export default function Layout() {
  const { region, openPicker } = useRegion()
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const hideLocationBar = isHome
    || pathname === '/passeios'
    || pathname.startsWith('/transfers')
    || pathname === '/eventos'
    || pathname.startsWith('/minhas-reservas')
    || pathname === '/perfil'

  return (
    <div className="min-h-screen bg-[#EBEBEB] lg:bg-gray-50">
      <TopNav />

      <div className="relative w-full max-w-[430px] lg:max-w-6xl mx-auto min-h-screen lg:min-h-0 bg-[#F8F8F8] lg:bg-transparent overflow-x-hidden shadow-2xl lg:shadow-none">

        {/* Barra de localização — mobile, exceto Home/Passeios/Transfers (têm a própria) */}
        {!hideLocationBar && (
          <div className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100 px-4 py-2 flex items-center">
            <button
              onClick={openPicker}
              className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
            >
              <MapPin size={11} className="text-brand shrink-0" />
              <span className="text-[12px] font-semibold text-gray-700">
                {region?.name ?? 'Selecionar região'}
              </span>
              <ChevronRight size={11} className="text-gray-400 ml-0.5" />
            </button>
          </div>
        )}

        <div className="pb-[68px] lg:pb-10">
          <Outlet />
        </div>
      </div>

      <BottomNav />
      <RegionPicker />
    </div>
  )
}
