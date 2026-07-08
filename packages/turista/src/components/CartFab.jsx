import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ShoppingCart, X, Trash2, Calendar, Users, ChevronRight,
  Loader2, CheckCircle2, AlertTriangle, Send,
} from 'lucide-react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

function dayLabel(iso) {
  if (!iso) return '—'
  try { return format(new Date(`${iso}T12:00:00`), "d 'de' MMM", { locale: ptBR }) }
  catch { return iso }
}

// Monta o corpo da solicitação (POST /api/payments/request) a partir do
// rascunho salvo. O servidor recalcula o total autoritativo (temporada etc.)
// e valida o cutoff — aqui só refletimos o que o turista montou.
function payloadFor(item) {
  const base = {
    service_type:     item.kind === 'transfer' ? 'transfer' : 'tour',
    service_id:       item.id,
    booking_mode:     item.mode === 'shared' ? 'shared' : 'private',
    service_date_iso: item.dateIso,
    people_count:     item.people || 1,
    region_id:        item.region_id || undefined,
    total_price:      Number(item.total) || 0,
    vehicles: (item.vehicles || []).map((v) => ({
      vehicle_id: v.id, qty: v.qty, unit_price: Number(v.price) || 0,
    })),
  }
  if (item.kind === 'transfer') {
    base.service_time     = item.time || undefined
    base.origin_text      = item.origin || undefined
    base.destination_text = item.dest || undefined
  } else {
    base.origin_text = item.origin_text || 'Centro de Jericoacoara'
  }
  return base
}

// ── Carrinho flutuante ─────────────────────────────────────────
// Visível nas telas principais sempre que houver rascunho salvo (localStorage,
// via CartContext — nada se perde). "Solicitar tudo" envia o carrinho inteiro
// num toque: cada item vira uma solicitação própria (as cooperativas aceitam
// separadamente, como no modelo de pernas), com progresso e resultado por item.
export default function CartFab() {
  const { items, count, total, removeItem, clearCart } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  // Envio em lote
  const [batch, setBatch]           = useState(null) // snapshot dos itens no envio
  const [results, setResults]       = useState({})   // id → {status, code?, msg?}
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone]             = useState(false)

  if (items.length === 0 && !batch) return null
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

  async function submitAll() {
    if (submitting) return
    if (!user) {
      setOpen(false)
      navigate('/login', { state: { from: pathname } })
      return
    }
    const snapshot = [...items]
    setBatch(snapshot)
    setSubmitting(true)
    setDone(false)
    const res = {}
    for (const item of snapshot) {
      res[item.id] = { status: 'sending' }
      setResults({ ...res })
      try {
        const r = await api.requestBooking(payloadFor(item))
        res[item.id] = { status: 'ok', code: r?.booking_code }
        removeItem(item.id) // enviado → sai do carrinho
      } catch (err) {
        res[item.id] = { status: 'error', msg: err?.message || 'Erro ao solicitar' }
      }
      setResults({ ...res })
    }
    setSubmitting(false)
    setDone(true)
  }

  function closeSheet() {
    if (submitting) return
    setOpen(false)
    if (done) { setBatch(null); setResults({}); setDone(false) }
  }

  const showList = batch || items
  const okCount  = Object.values(results).filter((r) => r.status === 'ok').length
  const errCount = Object.values(results).filter((r) => r.status === 'error').length
  const inBatch  = submitting || done

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
                <p className="font-bold text-gray-900 text-[16px]">
                  {done ? 'Solicitações enviadas' : 'Seu carrinho'}
                </p>
              </div>
              <button
                onClick={closeSheet}
                aria-label="Fechar"
                disabled={submitting}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 disabled:opacity-40"
              >
                <X size={15} className="text-gray-600" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto px-4 py-3 space-y-3">
              {showList.map((item) => {
                const st = results[item.id]
                return (
                  <div key={item.id} className={`border rounded-2xl p-3.5 shadow-sm ${st?.status === 'ok' ? 'border-emerald-200 bg-emerald-50/40' : st?.status === 'error' ? 'border-red-200 bg-red-50/40' : 'border-gray-100'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-bold text-gray-900 leading-tight flex-1">{item.name}</p>
                      {!inBatch && (
                        <button
                          onClick={() => removeItem(item.id)}
                          aria-label="Remover do carrinho"
                          className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 active:scale-95"
                        >
                          <Trash2 size={13} className="text-gray-400" />
                        </button>
                      )}
                      {st?.status === 'sending' && <Loader2 size={16} className="text-brand animate-spin shrink-0" />}
                      {st?.status === 'ok' && <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />}
                      {st?.status === 'error' && <AlertTriangle size={16} className="text-red-500 shrink-0" />}
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
                    {st?.status === 'ok' && st.code && (
                      <p className="text-[11px] font-semibold text-emerald-600 mt-1.5">Solicitação {st.code} enviada ✓</p>
                    )}
                    {st?.status === 'error' && (
                      <p className="text-[11px] font-semibold text-red-500 mt-1.5">{st.msg}</p>
                    )}
                    <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-50">
                      <p className="text-[15px] font-extrabold text-brand">{fmt(item.total)}</p>
                      {!inBatch && (
                        <button
                          onClick={() => resume(item)}
                          className="inline-flex items-center gap-1 bg-brand text-white text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-transform"
                        >
                          Retomar <ChevronRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 space-y-3 pb-[max(16px,env(safe-area-inset-bottom))]">
              {done ? (
                <>
                  <p className="text-[13px] text-gray-600 text-center">
                    {okCount > 0 && <span className="font-bold text-emerald-600">{okCount} enviada{okCount > 1 ? 's' : ''} ✓</span>}
                    {okCount > 0 && errCount > 0 && ' · '}
                    {errCount > 0 && <span className="font-bold text-red-500">{errCount} com erro (segue no carrinho)</span>}
                  </p>
                  <button
                    onClick={() => { closeSheet(); navigate('/minhas-reservas') }}
                    className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
                  >
                    Acompanhar em Minhas Reservas
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wide">Total do carrinho</p>
                      <p className="text-[18px] font-extrabold text-gray-900">{fmt(total)}</p>
                    </div>
                    {!submitting && (
                      <button
                        onClick={() => { clearCart(); setOpen(false) }}
                        className="text-[12px] font-semibold text-gray-400 active:text-gray-600"
                      >
                        Limpar carrinho
                      </button>
                    )}
                  </div>
                  <button
                    onClick={submitAll}
                    disabled={submitting || items.length === 0}
                    className="w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    {submitting
                      ? <><Loader2 size={16} className="animate-spin" /> Enviando solicitações…</>
                      : <><Send size={15} /> Solicitar tudo ({items.length} {items.length > 1 ? 'itens' : 'item'})</>}
                  </button>
                  <p className="text-[10.5px] text-gray-400 text-center leading-snug">
                    Cada item vira uma solicitação própria — as cooperativas aceitam separadamente e você acompanha tudo em Minhas Reservas.
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
