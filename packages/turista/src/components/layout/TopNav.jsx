import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useRegion } from '../../contexts/RegionContext'
import { api } from '../../lib/api'
import { MapPin, LogOut, User, ChevronDown } from 'lucide-react'
import NotificationBell from '../NotificationBell'

export default function TopNav() {
  const { user, token, logout } = useAuth()
  const { region, openPicker } = useRegion()
  const navigate = useNavigate()

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/')
  }

  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors px-1 pb-0.5 border-b-2 ${
      isActive ? 'text-brand border-brand' : 'text-gray-500 border-transparent hover:text-gray-900'
    }`

  return (
    <header className="hidden lg:block sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-[1520px] mx-auto h-14 flex items-center px-6 xl:px-10">
        <Link to="/" className="flex items-center gap-2 mr-8 shrink-0">
          <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-7 h-7 rounded-lg shrink-0" />
          <div>
            <p className="font-giro font-semibold text-[13px] text-gray-900 leading-tight tracking-[0.09em]">TURIVA</p>
            <p className="text-[9px] text-gray-400 leading-none">Passeios & Transfers</p>
          </div>
        </Link>

        <nav className="flex items-center gap-6 flex-1">
          <NavLink to="/passeios"          className={navLinkClass}>Passeios</NavLink>
          <NavLink to="/transfers"         className={navLinkClass}>Transfers</NavLink>
          <NavLink to="/eventos"           className={navLinkClass}>Descubra a Vila</NavLink>
          {token && <NavLink to="/minhas-reservas" className={navLinkClass}>Reservas</NavLink>}
          {token && <NavLink to="/perfil"          className={navLinkClass}>Perfil</NavLink>}
          <a href="#sobre" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Sobre nós</a>
        </nav>

        {/* Chip de localização — desktop */}
        <button
          onClick={openPicker}
          className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 transition-colors mr-3"
        >
          <MapPin size={13} className="text-brand shrink-0" />
          <span className="text-[13px] font-semibold text-gray-700 max-w-[140px] truncate">
            {region?.name ?? 'Selecionar região'}
          </span>
          <ChevronDown size={12} className="text-gray-400" />
        </button>

        <div className="flex items-center gap-3">
          {token ? (
            <>
              <NotificationBell />
              <span className="text-sm text-gray-600">{user?.full_name?.split(' ')[0]}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors"
              >
                <LogOut size={14} /> Sair
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 h-8 px-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <User size={13} /> Entrar
              </Link>
              <Link to="/passeios" className="inline-flex items-center gap-1.5 h-8 px-4 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors shadow-sm shadow-brand/30">
                Reservar agora
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
