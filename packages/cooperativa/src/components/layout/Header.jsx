import { useLocation } from 'react-router-dom'

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

export default function Header() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] || 'Cooperativa'

  return (
    <header className="h-16 flex items-center px-6 bg-white border-b border-gray-100 flex-shrink-0">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
    </header>
  )
}
