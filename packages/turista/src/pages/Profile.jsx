import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import {
  User, Mail, LogOut, ChevronRight, CalendarCheck,
  Shield, Bell, HelpCircle, Star, Camera,
} from 'lucide-react'

const MENU = [
  { icon: CalendarCheck, label: 'Minhas Reservas',         to: '/minhas-reservas' },
  { icon: Star,          label: 'Minhas Avaliações',       to: null },
  { icon: Bell,          label: 'Notificações',            to: null },
  { icon: Shield,        label: 'Privacidade e segurança', to: null },
  { icon: HelpCircle,    label: 'Ajuda e suporte',         to: null },
]

export default function Profile() {
  const { user, token, logout } = useAuth()
  const navigate  = useNavigate()
  const fileRef   = useRef(null)

  const avatarKey = `giro_avatar_${user?.id || 'guest'}`
  const [avatarUrl, setAvatarUrl] = useState(() => localStorage.getItem(avatarKey) || null)

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      setAvatarUrl(dataUrl)
      localStorage.setItem(avatarKey, dataUrl)
    }
    reader.readAsDataURL(file)
  }

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/')
  }

  const initials = user?.full_name
    ?.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || 'U'

  return (
    <div className="min-h-full bg-[#F8F8F8] pb-24">

      {/* Header */}
      <header className="bg-white px-4 pt-6 pb-4 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h1 className="text-xl font-bold text-gray-900">Perfil</h1>
      </header>

      <main className="px-4 pt-4 space-y-3 max-w-lg mx-auto">

        {token && user ? (
          /* ── Logged-in card ─────────────────────────────── */
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative mb-4">
              <div className="w-[88px] h-[88px] rounded-full bg-brand/10 flex items-center justify-center overflow-hidden ring-4 ring-white shadow-md">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-brand font-bold text-[28px] leading-none select-none">
                    {initials}
                  </span>
                )}
              </div>
              {/* Camera button */}
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 bg-brand rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform"
              >
                <Camera size={14} className="text-white" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>

            {/* Name & email */}
            <p className="font-extrabold text-gray-900 text-[18px] leading-tight break-words w-full">
              {user.full_name}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 text-gray-400">
              <Mail size={12} />
              <span className="text-[13px] break-all">{user.email}</span>
            </div>

            {/* Role badge */}
            {user.role && (
              <span className="mt-3 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-orange-50 text-brand">
                {user.role === 'admin' ? 'Administrador' : user.role === 'driver' ? 'Motorista' : 'Cliente'}
              </span>
            )}
          </div>
        ) : (
          /* ── Guest card ──────────────────────────────────── */
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <User size={32} className="text-gray-300" />
            </div>
            <p className="font-bold text-gray-800 mb-1">Faça login para continuar</p>
            <p className="text-[12px] text-gray-400 mb-5">Acesse suas reservas e histórico</p>
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
              <span className="flex-1 text-[14px] font-medium text-gray-800 text-left">{label}</span>
              <ChevronRight size={15} className="text-gray-300" />
            </button>
          ))}
        </div>

        {/* Logout */}
        {token && (
          <button
            onClick={handleLogout}
            className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center justify-center gap-2 text-red-500 font-semibold text-[14px] active:bg-red-50 transition-colors"
          >
            <LogOut size={16} /> Sair da conta
          </button>
        )}

        <p className="text-center text-[11px] text-gray-300 pb-2">Giro Jeri v2.0</p>
      </main>
    </div>
  )
}
