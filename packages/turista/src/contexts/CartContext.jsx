import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'

// ── Carrinho persistido ────────────────────────────────────────
// Guarda no aparelho (localStorage) os rascunhos de combinação que o turista
// monta — passeio + veículos + data + pessoas. Sobrevive a navegação, refresh
// e fechar o app: nada se perde. Cada item é um rascunho por serviço (a chave
// é o id do passeio); o envio da solicitação continua um por serviço, como o
// backend espera hoje (e como o motor de pernas aceita separadamente).
const STORAGE_KEY = 'turiva_cart_v1'

const CartContext = createContext(null)

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch {}
  }, [items])

  // Sincroniza um resumo leve do carrinho com o servidor (só logado), para o
  // lembrete automático de "carrinho não finalizado". Debounce para não bater a
  // cada tecla; best-effort, nunca atrapalha a navegação. A primeira montagem
  // também sincroniza — inclusive o carrinho vazio, o que limpa um lembrete
  // pendente de quem já solicitou/esvaziou.
  const primeiraSync = useRef(true)
  useEffect(() => {
    if (!localStorage.getItem('giro_token')) return // só clientes logados
    const t = setTimeout(() => {
      const summary = items.slice(0, 5).map((i) => i.name).filter(Boolean).join(', ')
      api.cartSnapshot({ item_count: items.length, summary }).catch(() => {})
    }, primeiraSync.current ? 1500 : 2500)
    primeiraSync.current = false
    return () => clearTimeout(t)
  }, [items])

  // Cria/atualiza o rascunho de um serviço (upsert pela chave id)
  const upsertItem = useCallback((item) => {
    if (!item?.id) return
    setItems((prev) => {
      const rest = prev.filter((i) => i.id !== item.id)
      return [...rest, { ...item, savedAt: Date.now() }]
    })
  }, [])

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  // Badge do FAB: número de SERVIÇOS (itens/reservas) no carrinho — cada
  // reserva pode ter vários veículos, mas conta como 1 no badge.
  const count = items.length
  const total = items.reduce((s, i) => s + (Number(i.total) || 0), 0)

  return (
    <CartContext.Provider value={{ items, count, total, upsertItem, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
