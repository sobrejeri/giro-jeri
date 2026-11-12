import { NavLink, useLocation } from 'react-router-dom'
import { LogOut, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { AREAS, getArea } from './navigation'

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const activeArea = getArea(pathname)

  return (
    <>
      {/* Backdrop (mobile) */}
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-60 flex-shrink-0 bg-gray-900 flex flex-col border-r border-gray-800 transform transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div
          className="min-h-16 flex items-center px-4 border-b border-gray-800 gap-2.5"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <p className="font-giro font-semibold text-[14px] text-white leading-tight tracking-[0.09em]">TURIVA</p>
            <p className="text-[9px] text-gray-500 leading-none">Admin</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-gray-500 hover:text-gray-200 lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Áreas do administrador" className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin space-y-0.5">
          {AREAS.map((area) => {
            const Icon = area.icon
            const active = activeArea === area
            return (
              <NavLink
                key={area.label}
                to={area.links[0].to}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 min-h-11 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
                  active ? 'bg-brand/20 text-brand' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`}
              >
                <Icon size={17} className="shrink-0" />
                {area.label}
              </NavLink>
            )
          })}
        </nav>

        {/* User */}
        <div
          className="px-3 py-2 border-t border-gray-800"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <NavLink to="/perfil" onClick={onClose} aria-label="Abrir meu perfil" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800">
            <div className="w-7 h-7 rounded-full bg-brand/20 overflow-hidden flex items-center justify-center text-brand text-xs font-bold flex-shrink-0">
              {user?.profile_photo_url
                ? <img src={user.profile_photo_url} alt="" className="w-full h-full object-cover" />
                : (user?.full_name || 'A')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">{user?.full_name || 'Admin'}</p>
              <p className="text-xs text-gray-500">Meu perfil</p>
            </div>
          </NavLink>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
