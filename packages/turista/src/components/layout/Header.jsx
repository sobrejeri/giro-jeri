import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'
import { MapPin, User, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function Header() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/')
  }

  const navLinkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors ${isActive ? 'text-brand' : 'text-gray-600 hover:text-gray-900'}`

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
            <MapPin size={16} className="text-white" />
          </div>
          <span className="font-display font-bold text-xl text-gray-900">Giro Jeri</span>
        </Link>

        {/* Nav — desktop */}
        <nav className="hidden md:flex items-center gap-6">
          <NavLink to="/passeios" className={navLinkClass}>Passeios</NavLink>
          <NavLink to="/transfers" className={navLinkClass}>Transfers</NavLink>
          {token && <NavLink to="/minhas-reservas" className={navLinkClass}>Minhas Reservas</NavLink>}
        </nav>

        {/* Auth — desktop */}
        <div className="hidden md:flex items-center gap-3">
          {token ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{user?.full_name?.split(' ')[0]}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 transition-colors"
              >
                <LogOut size={15} />
                Sair
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Entrar
              </Link>
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-1.5 h-9 px-4 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors"
              >
                <User size={14} />
                Cadastrar
              </Link>
            </div>
          )}
        </div>

        {/* Hamburger — mobile */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3">
          <NavLink to="/passeios"      className={navLinkClass} onClick={() => setMenuOpen(false)}>Passeios</NavLink>
          <NavLink to="/transfers"     className={navLinkClass} onClick={() => setMenuOpen(false)}>Transfers</NavLink>
          {token && (
            <NavLink to="/minhas-reservas" className={navLinkClass} onClick={() => setMenuOpen(false)}>Minhas Reservas</NavLink>
          )}
          <div className="border-t border-gray-100 pt-3 mt-1">
            {token ? (
              <button onClick={handleLogout} className="text-sm text-red-500 font-medium">Sair</button>
            ) : (
              <div className="flex gap-3">
                <Link to="/login"    className="text-sm font-medium text-gray-700" onClick={() => setMenuOpen(false)}>Entrar</Link>
                <Link to="/cadastro" className="text-sm font-medium text-brand"    onClick={() => setMenuOpen(false)}>Cadastrar</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
