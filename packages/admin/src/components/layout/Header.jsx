import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const TITLES = {
  '/dashboard':     'Dashboard',
  '/usuarios':      'Gestão de Usuários',
  '/catalogo':      'Catálogo',
  '/precos':        'Motor de Preços',
  '/regioes':       'Regiões',
  '/cupons':        'Cupons',
  '/temporada':     'Alta Temporada',
  '/financeiro':    'Financeiro',
  '/auditoria':     'Auditoria',
  '/configuracoes': 'Configurações',
  '/reservas':      'Reservas',
  '/perfil':        'Meu Perfil',
}

export default function Header() {
  const { pathname } = useLocation()
  const { user }     = useAuth()
  const title        = TITLES[pathname] || 'Admin'

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-gray-900 border-b border-gray-800 flex-shrink-0">
      <h1 className="text-lg font-semibold text-gray-100">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand text-xs font-bold">
            {(user?.full_name?.trim() || 'A')[0].toUpperCase()}
          </div>
          <span className="text-sm text-gray-400 hidden sm:block">{user?.full_name}</span>
        </div>
      </div>
    </header>
  )
}
