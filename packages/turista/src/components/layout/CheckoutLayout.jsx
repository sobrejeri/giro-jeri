import { Outlet } from 'react-router-dom'

/**
 * Layout para o fluxo de checkout.
 * Mobile: full-screen sem nav bars.
 * Desktop: centralizado em 430px com fundo cinza externo, simulando app nativo.
 */
export default function CheckoutLayout() {
  return (
    <div className="min-h-screen bg-[#EBEBEB] flex items-start justify-center">
      <div className="relative w-full max-w-[430px] min-h-screen bg-[#F8F8F8] overflow-x-hidden shadow-2xl">
        <Outlet />
      </div>
    </div>
  )
}
