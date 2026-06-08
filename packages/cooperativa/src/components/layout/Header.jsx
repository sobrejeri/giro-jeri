import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'

const TITLES = {
  '/dashboard':  'Painel Operacional',
  '/cotacoes':   'Cotações de Transfer',
  '/despacho':   'Despacho',
  '/veiculos':   'Gestão de Veículos',
  '/financeiro': 'Relatório Financeiro',
  '/passeios':   'Passeios que Executo',
  '/rotas':      'Rotas de Transfer',
  '/perfil':     'Meu Perfil',
  '/reservas':   'Corridas',
}

export default function Header({ onMenu = () => {} }) {
  const { pathname } = useLocation()
  const title = TITLES[pathname] || 'Cooperativa'

  return (
    <header className="h-16 flex items-center gap-2 px-4 sm:px-6 bg-white border-b border-gray-100 flex-shrink-0">
      <button
        onClick={onMenu}
        className="p-2 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={22} />
      </button>
      <h1 className="text-lg font-semibold text-gray-900 truncate">{title}</h1>
    </header>
  )
}
