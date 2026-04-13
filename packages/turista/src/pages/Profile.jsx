import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import {
  User, Mail, LogOut, ChevronRight, CalendarCheck,
  Shield, Bell, HelpCircle, Star,
} from 'lucide-react'

const MENU = [
  { icon: CalendarCheck, label: 'Minhas Reservas',        to: '/minhas-reservas' },
  { icon: Star,          label: 'Minhas Avaliações',      to: null },
  { icon: Bell,          label: 'Notificações',           to: null },
  { icon: Shield,        label: 'Privacidade e segurança',to: null },
  { icon: HelpCircle,    label: 'Ajuda e suporte',        to: null },
]

export default function Profile() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/')
  }

  const initials = user?.full_name
    ?.split(' ').slice(0, 2).map((n) => n[0].toUpperCase()).join('') || 'U'

  return (
    <div className="min-h-full bg-[#F8F8F8]">
      {/* Header */}
      <header className="bg-white px-4 pt-6 pb-4 sticky top-0 md:top-14 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h1 className="text-xl font-bold text-gray-900">Perfil</h1>
      </header>

      <main className="px-4 pt-4 pb-6 space-y-3 max-w-2xl mx-auto">
        {/* Avatar card */}
        {token && user ? (
          <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0">
              <span className="text-brand font-bold text-xl">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 truncate">{user.full_name}</p>
              <p className="text-sm text-gray-400 truncate flex items-center gap-1 mt-0.5">
                <Mail size={12} /> {user.email}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <User size={28} className="text-gray-300" />
            </div>
            <p className="font-semibold text-gray-800 mb-1">Faça login para continuar</p>
            <p className="text-xs text-gray-400 mb-4">Acesse suas reservas e histórico</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full h-11 bg-brand text-white rounded-xl font-bold text-sm active:scale-95 transition-transform"
            >
              Entrar
            </button>
          </div>
        )}

        {/* Menu */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {MENU.map(({ icon: Icon, label, to }, i) => (
            <button
              key={label}
              onClick={() => to ? navigate(to) : null}
              className={`w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-brand" />
              </div>
              <span className="flex-1 text-sm font-medium text-gray-800 text-left">{label}</span>
              <ChevronRight size={15} className="text-gray-300" />
            </button>
          ))}
        </div>

        {/* Logout */}
        {token && (
          <button
            onClick={handleLogout}
            className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center justify-center gap-2 text-red-500 font-semibold text-sm active:bg-red-50 transition-colors"
          >
            <LogOut size={16} /> Sair da conta
          </button>
        )}

        <p className="text-center text-[11px] text-gray-300">Giro Jeri v2.0</p>
      </main>
    </div>
  )
}
