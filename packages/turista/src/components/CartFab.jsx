import { useNavigate, useLocation } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '../contexts/CartContext'

// ── Carrinho flutuante ─────────────────────────────────────────
// Atalho para a página do carrinho (/carrinho, estilo Mercado Livre) nas
// telas principais. Badge = veículos salvos. Os dados vivem no CartContext
// (localStorage): nada se perde ao navegar ou fechar o app.
export default function CartFab() {
  const { items, count } = useCart()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  if (items.length === 0) return null
  if (
    pathname.startsWith('/checkout') || pathname.startsWith('/login') ||
    pathname.startsWith('/cadastro') || pathname.startsWith('/carrinho')
  ) return null

  // Passeios e Translados têm um resumo fixo no rodapé — o FAB sobe pra ficar
  // ACIMA dele (o resumo fica "abaixo do carrinho"). Nas demais telas fica na
  // posição normal, logo acima da barra de navegação.
  const aboveSummaryBar = pathname.startsWith('/passeios') || pathname.startsWith('/transfers')

  return (
    <button
      onClick={() => navigate('/carrinho')}
      aria-label="Abrir carrinho"
      className={`fixed z-40 right-4 lg:bottom-8 lg:right-8 w-14 h-14 rounded-full bg-brand shadow-lg shadow-brand/40 flex items-center justify-center active:scale-95 transition-transform ${
        aboveSummaryBar ? 'bottom-[150px]' : 'bottom-[86px]'
      }`}
    >
      <ShoppingCart size={22} className="text-white" />
      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white">
        {count}
      </span>
    </button>
  )
}
