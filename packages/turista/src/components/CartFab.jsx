import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ShoppingCart, X, Trash2, Calendar, Users, ChevronRight, Send,
} from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { checkoutStateFor } from '../lib/cartCheckout'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

function dayLabel(iso) {
  if (!iso) return '—'
  try { return format(new Date(`${iso}T12:00:00`), "d 'de' MMM", { locale: ptBR }) }
  catch { return iso }
}

// ── Carrinho flutuante ─────────────────────────────────────────
// Visível nas telas principais sempre que houver rascunho salvo (localStorage,
// via CartContext — nada se perde). "Solicitar tudo" abre o assistente: cada
// item passa pela tela de Resumo da reserva (confirma saída/data/horário/
// pessoas) e vira uma solicitação própria, em sequência, até enviar tudo.
export default function CartFab() {
  const { items, count, total, removeItem, clearCart } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null
  // Não compete com fluxos de foco (checkout/login)
  if (pathname.startsWith('/checkout') || pathname.startsWith('/login') || pathname.startsWith('/cadastro')) return null

  function resume(item) {
    setOpen(false)
    if (item.kind === 'transfer') {
      navigate('/transfers', {
        state: {
          restoreFromCart: true,
          origin: item.origin, dest: item.dest,
          date: item.dateIso, time: item.time, people: item.people,
          cartVehicles: item.vehicles,
        },
      })
    } else {
      navigate('/passeios', { state: { selectedId: item.id, restoreFromCart: true, mode: item.mode || 'private' } })
    }
  }

  // Inicia o assistente: leva o 1º item pra tela de Resumo da reserva com a
  // fila do carrinho no state; a própria tela encadeia os próximos.
  function startReview() {
    if (!user) {
      setOpen(false)
      navigate('/login', { state: { from: pathname } })
      return
    }
    const queue = [...items]
    setOpen(false)
    navigate('/checkout/resumo', {
      state: {
        ...checkoutStateFor(queue[0]),
        cartBatch: { queue, index: 0, results: [] },
      },
    })
  }

  function closeSheet() { setOpen(false) }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir carrinho"
        className="fixed z-40 bottom-[86px] right-4 lg:bottom-8 lg:right-8 w-14 h-14 rounded-full bg-brand shadow-lg shadow-brand/40 flex items-center justify-center active:scale-95 transition-transform"
      >
        <ShoppingCart size={22} className="text-white" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white">
            {count}
          </span>
        )}
      </button>

      {/* Sheet */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={closeSheet} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-w-[430px] mx-auto lg:max-w-md">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShoppingCart size={17} className="text-brand" />
                <p className="font-bold text-gray-900 text-[16px]">Seu carrinho</p>
              </div>
              <button
                onClick={closeSheet}
                aria-label="Fechar"
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95"
              >
                <X size={15} className="text-gray-600" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto px-4 py-3 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-2xl p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-bold text-gray-900 leading-tight flex-1">{item.name}</p>
                    <button
                      onClick={() => removeItem(item.id)}
                      aria-label="Remover do carrinho"
                      className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 active:scale-95"
                    >
                      <Trash2 size={13} className="text-gray-400" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11.5px] text-gray-500 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Calendar size={11} className="text-brand" />{dayLabel(item.dateIso)}</span>
                    <span className="inline-flex items-center gap-1"><Users size={11} className="text-brand" />{item.people} pessoa{item.people > 1 ? 's' : ''}</span>
                    {item.kind === 'transfer' && item.time && (
                      <span className="inline-flex items-center gap-1">🕐 {item.time}</span>
                    )}
                  </div>
                  {item.vehicles?.length > 0 && (
                    <p className="text-[12px] text-gray-600 mt-1.5">
                      {item.vehicles.map((v) => `${v.qty}x ${v.name}`).join(' + ')}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-50">
                    <p className="text-[15px] font-extrabold text-brand">{fmt(item.total)}</p>
                    <button
                      onClick={() => resume(item)}
                      className="inline-flex items-center gap-1 bg-brand text-white text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-transform"
                    >
                      Retomar <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 space-y-3 pb-[max(16px,env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">Total do carrinho</p>
                  <p className="text-[18px] font-extrabold text-gray-900">{fmt(total)}</p>
                </div>
                <button
                  onClick={() => { clearCart(); setOpen(false) }}
                  className="text-[12px] font-semibold text-gray-400 active:text-gray-600"
                >
                  Limpar carrinho
                </button>
              </div>
              <button
                onClick={startReview}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
              >
                <Send size={15} /> Solicitar tudo ({items.length} {items.length > 1 ? 'itens' : 'item'})
              </button>
              <p className="text-[10.5px] text-gray-400 text-center leading-snug">
                Você confirma os dados de cada item na tela de resumo antes de enviar — um por um, no mesmo formato de sempre.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  )
}
