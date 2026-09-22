import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Home, Compass, Car, User, Sparkles, MessageCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { api } from '../../lib/api'

export default function BottomNav() {
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const { t }        = useTranslation()
  const { user }     = useAuth()

  // Admin/operador têm o menu enxuto: o foco é publicar na Descubra. Só três
  // abas — Bate-papo · Descubra · Perfil.
  const isCreator = user?.user_type === 'admin' || user?.user_type === 'operator'

  // Não lidas para o badge do Bate-papo (só admin/operador usam a aba).
  const { data: convs } = useQuery({
    queryKey: ['conversations'],
    queryFn:  () => api.getConversations(),
    enabled:  !!user && isCreator,
    refetchInterval: 20000,
  })
  const naoLidas = (Array.isArray(convs) ? convs : []).reduce((s, c) => s + (c.unread || 0), 0)

  // No carrinho o menu sai de cena: a barra de resumo/pagamento fica colada
  // embaixo e o menu só roubava espaço numa tela que já é comprida.
  if (pathname === '/carrinho') return null

  const Aba = ({ to, icon: Icon, label, exact }) => {
    const active = exact ? pathname === to : pathname.startsWith(to)
    return (
      <button
        onClick={() => navigate(to)}
        className="flex-1 min-w-0 flex flex-col items-center gap-[2px] py-1.5 px-0.5 active:scale-95 transition-transform"
      >
        <div className="w-7 h-7 rounded-full flex items-center justify-center">
          <Icon size={20}
            className={active ? 'text-brand' : 'text-gray-400'}
            strokeWidth={active ? 2.5 : 1.75}
            fill={active ? 'currentColor' : 'none'} />
        </div>
        <span className={`text-[10px] leading-tight max-w-full truncate transition-colors ${active ? 'text-brand font-semibold' : 'text-gray-400 font-medium'}`}>
          {label}
        </span>
        <span className={`h-[3px] w-5 rounded-full transition-colors ${active ? 'bg-brand' : 'bg-transparent'}`} />
      </button>
    )
  }

  const descubraAtivo = pathname.startsWith('/eventos')

  // Botão central destacado (Descubra). Sobe acima da barra para virar o ponto
  // focal. Só fica LARANJA CHEIO quando ativo; fora dele é branco com o ícone
  // laranja, para não parecer "selecionado" nas outras telas.
  const FabDescubra = (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-end">
      <button
        onClick={() => navigate('/eventos')}
        aria-label={t('nav.events')}
        aria-current={descubraAtivo ? 'page' : undefined}
        className={`-mt-7 w-14 h-14 rounded-full flex items-center justify-center ring-4 ring-white shadow-lg active:scale-95 transition-all ${
          descubraAtivo
            ? 'bg-brand text-white shadow-brand/40'
            : 'bg-white text-brand border border-brand/25 shadow-brand/15'
        }`}
      >
        <Sparkles size={24} fill="currentColor" strokeWidth={1.5} />
      </button>
      <span className={`text-[10px] leading-tight mt-1 transition-colors ${descubraAtivo ? 'text-brand font-semibold' : 'text-gray-500 font-medium'}`}>
        {t('nav.events')}
      </span>
      <span className={`h-[3px] w-5 rounded-full mt-[2px] transition-colors ${descubraAtivo ? 'bg-brand' : 'bg-transparent'}`} />
    </div>
  )

  // ── Menu de admin/operador: Bate-papo · Descubra · Perfil ──────────────────
  if (isCreator) {
    return (
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white z-50 border-t border-gray-100 lg:hidden">
        <div className="flex items-end justify-around px-2 pt-1.5 pb-2">
          {/* Bate-papo — abre a caixa de conversas (evento global). */}
          <button
            onClick={() => window.dispatchEvent(new Event('open-inbox-chat'))}
            aria-label={t('nav.chat', 'Bate-papo')}
            className="flex-1 min-w-0 flex flex-col items-center gap-[2px] py-1.5 px-0.5 active:scale-95 transition-transform"
          >
            <div className="relative w-7 h-7 rounded-full flex items-center justify-center">
              <MessageCircle size={20} className="text-gray-400" strokeWidth={1.75} />
              {naoLidas > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {naoLidas > 99 ? '99+' : naoLidas}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-tight text-gray-400 font-medium">{t('nav.chat', 'Bate-papo')}</span>
            <span className="h-[3px] w-5 rounded-full bg-transparent" />
          </button>

          {FabDescubra}

          <Aba to="/perfil" icon={User} label={t('nav.profile')} />
        </div>
      </nav>
    )
  }

  // ── Menu do turista: Início · Passeios · Descubra · Transfers · Perfil ─────
  const LADO_ESQ = [
    { to: '/',          icon: Home,    label: t('nav.home'), exact: true },
    { to: '/passeios',  icon: Compass, label: t('nav.tours') },
  ]
  const LADO_DIR = [
    { to: '/transfers', icon: Car,  label: t('nav.transfers') },
    { to: '/perfil',    icon: User, label: t('nav.profile') },
  ]

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white z-50 border-t border-gray-100 lg:hidden">
      <div className="flex items-end justify-around px-2 pt-1.5 pb-2">
        {LADO_ESQ.map((it) => <Aba key={it.to} {...it} />)}
        {FabDescubra}
        {LADO_DIR.map((it) => <Aba key={it.to} {...it} />)}
      </div>
    </nav>
  )
}
