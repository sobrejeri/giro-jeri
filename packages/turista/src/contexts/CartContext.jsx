import { createContext, useContext, useState, useEffect, useCallback } from 'react'

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

  // Badge do FAB: total de veículos/unidades salvos no carrinho
  const count = items.reduce(
    (s, i) => s + (i.vehicles?.reduce((q, v) => q + (v.qty || 0), 0) || 1), 0,
  )
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
