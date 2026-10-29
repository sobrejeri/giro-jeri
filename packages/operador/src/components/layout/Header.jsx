import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import NotificationBell from '../NotificationBell'
import InboxChat from '../InboxChat'
import { useAuth } from '../../contexts/AuthContext'
import { usePendencias } from '../../lib/pendencias'

const TITLES = {
  '/dashboard':  'Operações',
  '/despacho':   'Despacho',
  '/estacionamento': 'Estacionamento',
  '/estacionamento/solicitacoes': 'Solicitações',
  '/estacionamento/reservas': 'Reservas',
  '/estacionamento/patio': 'Pátio',
  '/estacionamento/financeiro': 'Financeiro',
  '/estacionamento/meu-local': 'Meu local',
  '/veiculos':   'Gestão de Veículos',
  '/financeiro': 'Relatório Financeiro',
  '/passeios':   'Passeios que Executo',
  '/rotas':      'Rotas de Transfer',
  '/perfil':     'Meu Perfil',
  '/reservas':   'Solicitações',
}

export default function Header({ onMenu = () => {} }) {
  const { pathname } = useLocation()
  const title = TITLES[pathname] || 'Painel Operacional'
  // No celular o seletor de painel fica dentro do menu fechado: a bolinha
  // aparece também no botão do menu quando algum painel tem pendência.
  const { user } = useAuth()
  const isAdmin = user?.user_type === 'admin'
  const pendencias = usePendencias({ ativo: isAdmin })
  const temPendencia = isAdmin && (pendencias.tours > 0 || pendencias.parking > 0)

  return (
    <header className="h-16 flex items-center gap-2 px-4 sm:px-6 bg-white border-b border-gray-100 flex-shrink-0">
      <button
        onClick={onMenu}
        className="relative p-2 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors lg:hidden"
        aria-label={temPendencia ? 'Abrir menu — há solicitações pendentes' : 'Abrir menu'}
      >
        <Menu size={22} />
        {temPendencia && (
          <span data-pendente className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
        )}
      </button>
      <h1 className="text-lg font-semibold text-gray-900 truncate">{title}</h1>
      <div className="ml-auto flex items-center gap-1">
        <InboxChat />
        <NotificationBell bookingsPath="/reservas" />
      </div>
    </header>
  )
}
