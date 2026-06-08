import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Menu } from 'lucide-react'

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

export default function Header({ onMenu = () => {} }) {
  const { pathname } = useLocation()
  const { user }     = useAuth()
  const title        = TITLES[pathname] || 'Admin'

  return (
    <header className="h-16 flex items-center justify-between gap-2 px-4 sm:px-6 bg-gray-900 border-b border-gray-800 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenu}
          className="p-2 -ml-2 text-gray-400 hover:text-gray-100 hover:bg-gray-800 rounded-lg transition-colors lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-semibold text-gray-100 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-3 shrink-0">
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
