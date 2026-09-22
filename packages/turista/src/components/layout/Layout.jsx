import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, Store } from 'lucide-react'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import RegionPicker from '../RegionPicker'
import CartFab from '../CartFab'
import PushPrompt from '../PushPrompt'
import InstallBar from '../InstallBar'
import OfflineBanner from '../OfflineBanner'
import PullToRefresh from '../PullToRefresh'
import InboxChat from '../InboxChat'
import { useAuth } from '../../contexts/AuthContext'
import { getPartner, clearPartner } from '../../lib/partner'

// Selo de venda direta: enquanto ativo, toda solicitação vai atribuída à
// operador do link (sem fila). O X remove a atribuição.
function PartnerBadge() {
  const [partner, setPartnerState] = useState(getPartner)
  if (!partner) return null
  return (
    <div className="sticky top-0 z-40 bg-emerald-600 text-white px-4 py-2 flex items-center gap-2">
      {partner.photo
        ? <img src={partner.photo} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
        : <Store size={14} className="shrink-0" />}
      <p className="text-[12px] font-semibold flex-1 truncate">
        Reservando com <span className="font-bold">{partner.name}</span>
      </p>
      <button
        onClick={() => { clearPartner(); setPartnerState(null) }}
        aria-label="Sair do link do operador"
        className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center active:scale-95"
      >
        <X size={12} />
      </button>
    </div>
  )
}

export default function Layout() {
  const qc = useQueryClient()
  const { user } = useAuth()
  // Admin/operador têm o menu enxuto (Descubra · Bate-papo · Perfil); a aba
  // "Bate-papo" abre esta caixa global por evento, de qualquer tela.
  const isCreator = user?.user_type === 'admin' || user?.user_type === 'operator'
  async function handleRefresh() {
    // Revalida tudo o que estiver em uso na tela atual.
    await qc.refetchQueries({ type: 'active' })
    // Telas que embaralham conteúdo (ex.: o feed da Descubra) trocam a ordem a
    // cada "puxar para atualizar".
    window.dispatchEvent(new Event('app:pull-refresh'))
  }

  return (
    // Sem cor em nenhum tamanho: a textura de areia mora no body (index.css) e
    // só aparece se ninguém pintar por cima. Aqui não há moldura a destacar —
    // no desktop a coluna vira largura total (lg:max-w-none), então pintar o
    // pai só deixava o fundo mais escuro e sem textura.
    <div className="min-h-screen">
      <TopNav />

      {/* overflow-x-hidden segura a moldura de 430px no celular, mas no desktop
          ele transformava esta div em caixa de rolagem (overflow-y vira `auto`
          quando o outro eixo não é `visible`). Com isso, todo header `sticky
          lg:top-14` das páginas passava a medir o offset contra ESTA div em vez
          da viewport — e, como o TopNav é sticky em fluxo, os 56px eram contados
          duas vezes e o header descia por cima do conteúdo, cortando o topo do
          primeiro card. No desktop a moldura não existe, então não há o que
          esconder: devolvemos overflow visível e o sticky volta a se ancorar na
          viewport. */}
      <div className="relative w-full max-w-[430px] lg:max-w-none mx-auto min-h-screen lg:min-h-0 lg:bg-transparent overflow-x-hidden lg:overflow-x-visible shadow-2xl lg:shadow-none">
        <OfflineBanner />
        <PartnerBadge />
        <InstallBar />
        <div className="pb-[68px] lg:pb-0">
          <PullToRefresh onRefresh={handleRefresh}>
            <Outlet />
          </PullToRefresh>
        </div>
      </div>

      <CartFab />
      <BottomNav />
      {/* Caixa de conversas global para admin/operador — aberta pela aba Bate-papo. */}
      {isCreator && <InboxChat variant="listener" />}
      <PushPrompt />
      <RegionPicker />
    </div>
  )
}
