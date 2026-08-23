import { Outlet } from 'react-router-dom'
import { MapPin, ShieldCheck } from 'lucide-react'

/**
 * Layout para o fluxo de checkout.
 * Mobile/tablet: full-screen sem nav bars (moldura de app).
 * Desktop (lg+): moldura de 430px centralizada sobre fundo cinza, com uma
 *   barra superior de marca + selo de "pagamento seguro", dando contexto de
 *   página de checkout. O fluxo interno (430px) permanece intacto.
 */
export default function CheckoutLayout() {
  return (
    // Mesma regra do Layout: no celular a textura de areia do body aparece; no
    // desktop a moldura em volta da coluna fecha um tom.
    <div className="min-h-screen lg:bg-fundo-moldura flex flex-col items-center">
      {/* Barra de topo — só desktop */}
      <div className="hidden lg:flex w-full bg-white border-b border-gray-100 px-8 py-3 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand flex items-center justify-center">
            <MapPin size={16} className="text-white" />
          </div>
          <span className="font-extrabold text-gray-900 text-[15px]">Turiva</span>
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <ShieldCheck size={16} className="text-green-500" />
          <span className="text-[13px] font-semibold">Ambiente de pagamento seguro</span>
        </div>
      </div>

      {/* Moldura do app */}
      <div className="relative w-full max-w-[430px] min-h-screen overflow-x-hidden shadow-2xl">
        <Outlet />
      </div>
    </div>
  )
}
