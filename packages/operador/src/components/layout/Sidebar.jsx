import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Truck, Car, BarChart3, LogOut, Compass, MapPin, UserCircle, CalendarCheck, Star, X, ParkingSquare, Home, Wallet, Settings, ImagePlus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

// Menu do operador de ESTACIONAMENTO (segmento parking) — espelha o mockup.
const NAV_PARKING = [
  { to: '/estacionamento',               icon: Home,          label: 'Início',       end: true },
  { to: '/estacionamento/patio',         icon: Car,           label: 'Pátio'        },
  { to: '/estacionamento/financeiro',    icon: Wallet,        label: 'Financeiro'   },
  { to: '/estacionamento/meu-local',     icon: Settings,      label: 'Meu local'    },
  { to: '/reputacao',                     icon: Star,          label: 'Avaliações'   },
  { to: '/publicacoes',                   icon: ImagePlus,        label: 'Publicações'  },
  { to: '/perfil',                       icon: UserCircle,    label: 'Meu Perfil'   },
]

// seg: em qual segmento o item aparece — 'tours' (passeios/transfers), 'parking'
// (estacionamento) ou 'both'. O admin vê tudo.
const NAV = [
  // "Solicitações" e "Despacho" foram unificados dentro de Operações (aba
  // "Novas" para aceitar/cotar + o pipeline aguardando/despachar/iniciar/concluir).
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Operações',    seg: 'tours'   },
  { to: '/estacionamento', icon: ParkingSquare, label: 'Estacionamento', seg: 'parking' },
  { to: '/veiculos',   icon: Car,             label: 'Veículos',     seg: 'tours'   },
  { to: '/passeios',   icon: Compass,         label: 'Passeios',     seg: 'tours'   },
  { to: '/rotas',      icon: MapPin,          label: 'Rotas',        seg: 'tours'   },
  { to: '/financeiro', icon: BarChart3,       label: 'Financeiro',   seg: 'tours'   },
  { to: '/reputacao',  icon: Star,            label: 'Reputação',    seg: 'tours'   },
  { to: '/publicacoes', icon: ImagePlus,         label: 'Publicações',  seg: 'both'    },
  { to: '/perfil',     icon: UserCircle,      label: 'Meu Perfil',   seg: 'both'    },
]

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout, adminPanel, setAdminPanel } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.user_type === 'admin'
  // Admin escolhe qual painel operar (passeios/translados ou estacionamento) —
  // tem acesso a tudo. Antes o filtro tinha "isAdmin || ...", então o admin via
  // TODOS os menus de uma vez, inclusive o estacionamento de outro parceiro.
  // Operador comum segue o seu operator_segment, como antes.
  const ehParking = isAdmin ? adminPanel === 'parking' : user?.operator_segment === 'parking'
  const segmento = ehParking ? 'parking' : 'tours'
  const nav = ehParking ? NAV_PARKING : NAV.filter((i) => i.seg === 'both' || i.seg === segmento)

  function trocarPainel(mode) {
    if (mode === adminPanel) return
    setAdminPanel(mode)
    navigate(mode === 'parking' ? '/estacionamento' : '/dashboard')
    onClose()
  }

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

        {/* Admin: escolhe qual painel operar (tem acesso a tudo). Operador comum
            não vê isto — segue direto o seu segmento. */}
        {isAdmin && (
          <div className="px-3 pt-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1 px-1">Painel (admin)</p>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {[['tours', 'Passeios'], ['parking', 'Estacionamento']].map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => trocarPainel(m)}
                  className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-md transition-colors ${
                    adminPanel === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          {nav.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
