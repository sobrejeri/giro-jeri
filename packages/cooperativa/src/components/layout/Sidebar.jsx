import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Truck, Car, BarChart3, LogOut, Compass, MapPin, UserCircle, CalendarCheck, Star, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Operações'  },
  { to: '/reservas',   icon: CalendarCheck,   label: 'Solicitações'   },
  { to: '/despacho',   icon: Truck,           label: 'Despacho'   },
  { to: '/veiculos',   icon: Car,             label: 'Veículos'   },
  { to: '/passeios',   icon: Compass,         label: 'Passeios'   },
  { to: '/rotas',      icon: MapPin,          label: 'Rotas'      },
  { to: '/financeiro', icon: BarChart3,       label: 'Financeiro' },
  { to: '/reputacao',  icon: Star,            label: 'Reputação'  },
  { to: '/perfil',     icon: UserCircle,      label: 'Meu Perfil' },
]

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth()

  return (
    <>
      {/* Backdrop (mobile) */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-60 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-100 gap-2.5">
          <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <p className="font-giro font-semibold text-[14px] text-gray-900 leading-tight tracking-[0.09em]">TURIVA</p>
            <p className="text-[9px] text-gray-400 leading-none">Operacional</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 text-gray-400 hover:text-gray-600 lg:hidden"
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-brand/10 overflow-hidden flex items-center justify-center text-brand text-sm font-semibold flex-shrink-0">
              {user?.profile_photo_url
                ? <img src={user.profile_photo_url} alt="" className="w-full h-full object-cover" />
                : (user?.full_name || 'U')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name || 'Operador'}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email || ''}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
