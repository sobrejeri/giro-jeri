import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { X, Store } from 'lucide-react'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import RegionPicker from '../RegionPicker'
import CartFab from '../CartFab'
import OfflineBanner from '../OfflineBanner'
import PullToRefresh from '../PullToRefresh'
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
  async function handleRefresh() {
    // Revalida tudo o que estiver em uso na tela atual.
    await qc.refetchQueries({ type: 'active' })
  }

  return (
    // Sem cor em nenhum tamanho: a textura de areia mora no body (index.css) e
    // só aparece se ninguém pintar por cima. Aqui não há moldura a destacar —
    // no desktop a coluna vira largura total (lg:max-w-none), então pintar o
    // pai só deixava o fundo mais escuro e sem textura.
    <div className="min-h-screen">
      <TopNav />

      <div className="relative w-full max-w-[430px] lg:max-w-none mx-auto min-h-screen lg:min-h-0 lg:bg-transparent overflow-x-hidden shadow-2xl lg:shadow-none">
        <OfflineBanner />
        <PartnerBadge />
        <div className="pb-[68px] lg:pb-0">
          <PullToRefresh onRefresh={handleRefresh}>
            <Outlet />
          </PullToRefresh>
        </div>
      </div>

      <CartFab />
      <BottomNav />
      <RegionPicker />
    </div>
  )
}
