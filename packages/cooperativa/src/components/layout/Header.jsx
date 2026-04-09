import { useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'

const TITLES = {
  '/dashboard':  'Painel Operacional',
  '/cotacoes':   'Cotações de Transfer',
  '/despacho':   'Despacho',
  '/veiculos':   'Gestão de Veículos',
  '/financeiro': 'Relatório Financeiro',
}

export default function Header() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] || 'Cooperativa'

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-gray-100 flex-shrink-0">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
        <Bell size={18} />
      </button>
    </header>
  )
}
