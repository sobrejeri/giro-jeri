import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useRegion } from '../../contexts/RegionContext'
import { rolarAteAncora } from '../../lib/ancora'
import { api } from '../../lib/api'
import { MapPin, LogOut, User, ChevronDown } from 'lucide-react'
import NotificationBell from '../NotificationBell'

export default function TopNav() {
  const { user, token, logout } = useAuth()
  const { region, openPicker } = useRegion()
  const { t } = useTranslation()
  const navigate = useNavigate()

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/')
  }

  // "Sobre nós" é uma SEÇÃO da home, não uma tela. Era um `<a href="#sobre">`
  // puro: em qualquer outra tela ele só carimbava a âncora na URL
  // (`/transfers#sobre`) e nada acontecia, porque o alvo não existe fora da
  // home. Agora volta para a home e rola até lá — de onde quer que se clique.
  function irParaSobre(e) {
    e.preventDefault()
    navigate('/#sobre')
    rolarAteAncora('sobre')
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
          <NavLink to="/passeios"          className={navLinkClass}>{t('nav.tours')}</NavLink>
          <NavLink to="/transfers"         className={navLinkClass}>{t('nav.transfers')}</NavLink>
          <NavLink to="/eventos"           className={navLinkClass}>{t('nav.discoverVillage')}</NavLink>
          {token && <NavLink to="/minhas-reservas" className={navLinkClass}>{t('nav.bookings')}</NavLink>}
          {token && <NavLink to="/perfil"          className={navLinkClass}>{t('nav.profile')}</NavLink>}
          <a href="/#sobre" onClick={irParaSobre} className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">{t('nav.about')}</a>
        </nav>

        {/* Chip de localização — desktop */}
        <button
          onClick={openPicker}
          className="flex items-center gap-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-3 py-1.5 transition-colors mr-3"
        >
          <MapPin size={13} className="text-brand shrink-0" />
          <span className="text-[13px] font-semibold text-gray-700 max-w-[140px] truncate">
            {region?.name ?? t('nav.selectRegion')}
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
                <LogOut size={14} /> {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900 h-8 px-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <User size={13} /> {t('nav.login')}
              </Link>
              <Link to="/passeios" className="inline-flex items-center gap-1.5 h-8 px-4 bg-brand text-white text-sm font-semibold rounded-lg hover:bg-brand-600 transition-colors shadow-sm shadow-brand/30">
                {t('nav.bookNow')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
