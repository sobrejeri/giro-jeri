import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { MapPin, LogOut, User } from 'lucide-react'

export default function TopNav() {
  const { user, token, logout } = useAuth()
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
    <header className="hidden md:flex sticky top-0 z-50 bg-white border-b border-gray-100 h-14 items-center px-6">
      <Link to="/" className="flex items-center gap-2 mr-8 shrink-0">
        <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center">
          <MapPin size={13} className="text-white" />
        </div>
        <span className="font-display font-bold text-gray-900">Giro Jeri</span>
      </Link>

      <nav className="flex items-center gap-6 flex-1">
        <NavLink to="/passeios"        className={navLinkClass}>Passeios</NavLink>
        <NavLink to="/transfers"       className={navLinkClass}>Transfers</NavLink>
        {token && <NavLink to="/minhas-reservas" className={navLinkClass}>Minhas Reservas</NavLink>}
      </nav>

      <div className="flex items-center gap-3">
        {token ? (
          <>
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
            <Link to="/login"    className="text-sm font-medium text-gray-600 hover:text-gray-900">Entrar</Link>
            <Link to="/cadastro" className="inline-flex items-center gap-1.5 h-8 px-4 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors">
              <User size={13} /> Cadastrar
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
