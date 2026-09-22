import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, Compass, Car, User, Sparkles } from 'lucide-react'

export default function BottomNav() {
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const { t }        = useTranslation()

  // No carrinho o menu sai de cena: a barra de resumo/pagamento fica colada
  // embaixo e o menu só roubava espaço numa tela que já é comprida.
  if (pathname === '/carrinho') return null

  // Dois itens de cada lado + um BOTÃO CENTRAL destacado (Descubra) — a tela de
  // destaque, que antes só vivia dentro da home. Reservas saiu do menu: já fica
  // no topo da home e dentro do Perfil (Minhas Reservas). Com a vaga aberta, o
  // Transfers voltou, mantendo o Descubra exatamente no centro (2 abas de cada
  // lado).
  const LADO_ESQ = [
    { to: '/',          icon: Home,    label: t('nav.home'), exact: true },
    { to: '/passeios',  icon: Compass, label: t('nav.tours') },
  ]
  const LADO_DIR = [
    { to: '/transfers', icon: Car,  label: t('nav.transfers') },
    { to: '/perfil',    icon: User, label: t('nav.profile') },
  ]

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

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white z-50 border-t border-gray-100 lg:hidden">
      <div className="flex items-end justify-around px-2 pt-1.5 pb-2">
        {LADO_ESQ.map((it) => <Aba key={it.to} {...it} />)}

        {/* Botão central destacado — abre a tela de destaque (Descubra). Sobe
            acima da barra para virar o ponto focal. Só fica LARANJA CHEIO quando
            a Descubra está ativa; fora dela é branco com o ícone laranja, para
            não parecer "selecionado" nas outras telas. */}
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

        {LADO_DIR.map((it) => <Aba key={it.to} {...it} />)}
      </div>
    </nav>
  )
}
