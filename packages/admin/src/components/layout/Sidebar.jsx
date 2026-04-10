import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, BookOpen, Tag, Globe, Ticket,
  Sun, BarChart3, ScrollText, Settings, LogOut,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard'    },
  { separator: true, label: 'Gestão' },
  { to: '/usuarios',     icon: Users,           label: 'Usuários'      },
  { to: '/catalogo',     icon: BookOpen,        label: 'Catálogo'      },
  { to: '/precos',       icon: Tag,             label: 'Motor de Preços'},
  { to: '/regioes',      icon: Globe,           label: 'Regiões'       },
  { separator: true, label: 'Promoções' },
  { to: '/cupons',       icon: Ticket,          label: 'Cupons'        },
  { to: '/temporada',    icon: Sun,             label: 'Alta Temporada' },
  { separator: true, label: 'Backoffice' },
  { to: '/financeiro',   icon: BarChart3,       label: 'Financeiro'    },
  { to: '/auditoria',    icon: ScrollText,      label: 'Auditoria'     },
  { to: '/configuracoes', icon: Settings,       label: 'Configurações' },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col border-r border-gray-800">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-gray-800">
        <span className="font-display font-bold text-xl text-brand">Giro Jeri</span>
        <span className="ml-2 text-xs font-semibold text-gray-500 uppercase tracking-widest">Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin space-y-0.5">
        {NAV.map((item, i) => {
          if (item.separator) {
            return (
              <p key={i} className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-600 uppercase tracking-widest">
                {item.label}
              </p>
            )
          }
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand/20 text-brand'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              <Icon size={17} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand text-xs font-bold flex-shrink-0">
            {(user?.full_name || 'A')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{user?.full_name || 'Admin'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>
    </aside>
  )
}
