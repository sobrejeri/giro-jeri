import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Compass, Car, User, Sparkles, Store, Plus, CalendarCheck } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export default function BottomNav() {
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const { t }        = useTranslation()
  const { user }     = useAuth()

  // Admin/operador têm o menu enxuto: Lojinha · Descubra · Publicar · Reservas · Perfil.
  const isCreator = user?.user_type === 'admin' || user?.user_type === 'operator'

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

  // Botão central destacado: NOVA PUBLICAÇÃO (admin/operador). Abre a Descubra
  // já com o compositor aberto (via ?novo=1).
  const FabPublicar = (
    <div className="flex-1 min-w-0 flex flex-col items-center justify-end">
      <button
        onClick={() => navigate('/eventos?novo=1')}
        aria-label={t('feedPg.newPost', 'Nova publicação')}
        className="-mt-7 w-14 h-14 rounded-full flex items-center justify-center ring-4 ring-white shadow-lg active:scale-95 transition-all bg-brand text-white shadow-brand/40"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>
      <span className="text-[10px] leading-tight mt-1 text-gray-500 font-medium">Publicar</span>
      <span className="h-[3px] w-5 rounded-full mt-[2px] bg-transparent" />
    </div>
  )

  // ── Menu admin/operador: Bate-papo · Descubra · [Publicar] · Lojinha · Perfil ──
  if (isCreator) {
    return (
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white z-50 border-t border-gray-100 lg:hidden">
        <div className="flex items-end justify-around px-2 pt-1.5 pb-2">
          <Aba to="/passeios" icon={Store} label="Lojinha" />
          <Aba to="/eventos" icon={Sparkles} label={t('nav.events')} />

          {FabPublicar}

          <Aba to="/minhas-reservas" icon={CalendarCheck} label={t('nav.bookings', 'Reservas')} />
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
