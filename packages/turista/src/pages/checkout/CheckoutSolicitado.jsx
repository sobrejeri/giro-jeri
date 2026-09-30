import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Send, Clock, ArrowRight, Home, Calendar, Users, CheckCircle2, CreditCard } from 'lucide-react'
import { api } from '../../lib/api'
import { resolveStatusReserva } from '../../lib/statusReserva'

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

/**
 * CheckoutSolicitado — tela exibida logo após o cliente SOLICITAR a reserva
 * (fluxo solicitar → operador aceita → pagar).
 *
 * A tela NÃO é mais estática: enquanto a reserva espera aceite, relê o status
 * sozinha. Assim que o operador aceita (status vira `waiting_payment`), o
 * passo a passo avança e aparece aqui mesmo um botão "Pagar agora" — antes o
 * cliente ficava preso em "aguardando aceite" e só conseguia pagar entrando
 * em Minhas Reservas.
 */
export default function CheckoutSolicitado() {
  const { t }     = useTranslation()
  const navigate  = useNavigate()
  const { state } = useLocation()

  const booking_id     = state?.booking_id
  const batchResults   = state?.batchResults
  const order_group_id = state?.order_group_id
  const isBatch        = Array.isArray(batchResults) && batchResults.length > 1

  // Acompanha o status real da reserva. Enquanto ninguém aceitou, relê a cada
  // 6s; ao aceitar (waiting_payment) ou em qualquer estado final, para de pollar.
  const { data: live } = useQuery({
    queryKey: ['booking', booking_id],
    queryFn:  () => api.getBooking(booking_id),
    enabled:  !!booking_id && !isBatch,
    refetchInterval:      (q) => (resolveStatusReserva(q.state.data) === 'waiting_acceptance' ? 6000 : false),
    refetchOnWindowFocus: true,
  })

  // Pedido em grupo (carrinho): acompanha TODAS as reservas do order_group_id.
  // Assim a tela reage quando os operadores aceitam e libera o "Pagar tudo" —
  // antes o combo ficava travado em "aguardando aceite" para sempre.
  const { data: groupList } = useQuery({
    queryKey: ['group-bookings', order_group_id],
    queryFn:  () => api.getMyBookings(),
    enabled:  !!order_group_id && isBatch,
    select:   (r) => (r?.data || []).filter((b) => b.order_group_id === order_group_id),
    refetchInterval: (q) => {
      const arr = q.state.data || []
      const anyWaiting = arr.some((b) => resolveStatusReserva(b) === 'waiting_acceptance')
      // Ainda montando (lista vazia) ou algum item sem aceite → continua pollando.
      return (arr.length === 0 || anyWaiting) ? 6000 : false
    },
    refetchOnWindowFocus: true,
  })

  if (!state) { navigate('/'); return null }

  // Estado agregado do pedido em grupo.
  const groupBookings = Array.isArray(groupList) ? groupList : []
  const groupActive   = groupBookings.filter((b) => !['cancelled', 'expired'].includes(resolveStatusReserva(b)))
  const groupPayable  = groupActive.filter((b) => resolveStatusReserva(b) === 'waiting_payment')
  const groupAllDone  = groupActive.length > 0 && groupActive.every((b) => ['confirmed', 'in_progress', 'completed'].includes(resolveStatusReserva(b)))
  const groupPayTotal = groupPayable.reduce((s, b) => s + Number(b.total_amount || 0), 0)
  const groupItems    = groupPayable.map((b) => ({
    name: b.service_name || (b.service_type === 'tour' ? t('checkoutPg.solicitado.serviceTour') : t('checkoutPg.solicitado.serviceTransfer')),
    type: b.service_type,
    amount: Number(b.total_amount || 0),
  }))

  const {
    service_name, service_date, service_time, people_count,
    total_price, display_total, amount, booking_code, booking_id: _bid, cover_image_url,
  } = state

  // Status agregado: no pedido em grupo, "aceito" = há pelo menos 1 item pronto
  // para pagar; "concluído" = todos os ativos já confirmados.
  const status    = isBatch
    ? (groupAllDone ? 'confirmed' : groupPayable.length > 0 ? 'waiting_payment' : 'waiting_acceptance')
    : (booking_id ? resolveStatusReserva(live) : 'waiting_acceptance')
  const accepted  = status === 'waiting_payment'                          // operador aceitou; falta pagar
  const done      = ['confirmed', 'in_progress', 'completed'].includes(status)
  const cancelled = status === 'cancelled' || status === 'expired'
  // Pode pagar agora nesta tela? (grupo com itens pagáveis OU reserva única aceita)
  const canPay    = isBatch ? groupPayable.length > 0 : accepted

  // Estimativa inicial (antes do grupo carregar) = soma dos itens do lote.
  const batchEstimate = Array.isArray(batchResults)
    ? batchResults.reduce((s, r) => s + Number(r.amount || 0), 0) : 0
  const value     = isBatch
    ? (groupPayTotal || groupActive.reduce((s, b) => s + Number(b.total_amount || 0), 0) || batchEstimate)
    : (live?.total_amount ?? amount ?? display_total ?? total_price)
  const payAmount = isBatch ? groupPayTotal : (Number(live?.total_amount ?? value) || 0)

  // Mesmo fluxo de pagamento do detalhe da reserva (BookingDetail.handlePay):
  // leva à tela de pagamento reaproveitando a reserva já criada.
  function handlePay() {
    // Pedido em grupo: paga TODOS os itens pagáveis de uma vez (order_group_id).
    if (isBatch) {
      if (groupPayable.length === 0) return
      navigate('/checkout/pagamento', {
        state: {
          service_name:   `${groupPayable.length} serviços`,
          service_type:   'tour',
          booking_mode:   'private',
          people_count:   groupPayable.reduce((s, b) => s + Number(b.people_count || 0), 0),
          total_price:    groupPayTotal,
          order_group_id,
          group_items:    groupItems,
        },
      })
      return
    }
    const b = live
    if (!b) return
    let dStr = service_date || '—'
    if (b.service_date) { try { dStr = format(new Date(b.service_date + 'T00:00:00'), 'd MMM', { locale: ptBR }) } catch {} }
    navigate('/checkout/pagamento', {
      state: {
        service_name:        b.booking_items?.[0]?.title_snapshot
          || service_name
          || `${b.service_type === 'tour' ? t('checkoutPg.solicitado.serviceTour') : t('checkoutPg.solicitado.serviceTransfer')} · ${b.booking_code}`,
        service_type:        b.service_type,
        booking_mode:        b.booking_mode || 'private',
        service_date:        dStr,
        service_date_iso:    b.service_date,
        service_time:        b.service_time,
        people_count:        b.people_count,
        total_price:         b.total_amount,
        origin_text:         b.origin_text || b.pickup_place_name || null,
        destination_text:    b.destination_text || b.destination_place_name || null,
        existing_booking_id: b.id,
      },
    })
  }

  const title = accepted ? t('checkoutPg.solicitado.acceptedTitle')
    : done ? t('checkoutPg.solicitado.confirmedTitle')
    : t('checkoutPg.solicitado.title')
  const subtitle = accepted ? t('checkoutPg.solicitado.acceptedSubtitle')
    : done ? t('checkoutPg.solicitado.confirmedSubtitle')
    : t('checkoutPg.solicitado.subtitle')

  const badge = accepted ? { text: t('checkoutPg.badge.accepted'),  cls: 'bg-brand/10 text-brand' }
    : done ? { text: t('checkoutPg.badge.confirmed'), cls: 'bg-emerald-100 text-emerald-700' }
    : cancelled ? { text: t('checkoutPg.badge.cancelled'), cls: 'bg-red-100 text-red-600' }
    : { text: t('checkoutPg.badge.waitingAcceptance'), cls: 'bg-amber-100 text-amber-700' }

  const step2Done = accepted || done
  const step3Done = done

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 px-4 pt-14 pb-10 flex flex-col items-center">

        {/* Ícone */}
        <div className="relative mb-5">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${accepted || done ? 'bg-emerald-100' : 'bg-brand/10'}`}>
            {accepted || done
              ? <CheckCircle2 size={38} className="text-emerald-500" strokeWidth={1.8} />
              : <Send size={36} className="text-brand" strokeWidth={1.6} />}
          </div>
          {!accepted && !done && <div className="absolute inset-0 rounded-full bg-brand/20 animate-ping opacity-20" />}
        </div>

        <h1 className="text-[22px] font-extrabold text-gray-900 text-center leading-tight mb-1">
          {title}
        </h1>
        <p className="text-[13px] text-gray-500 text-center mb-5 max-w-[300px]">
          {subtitle}
        </p>

        {/* Passo a passo */}
        <div className="w-full bg-white rounded-2xl shadow-sm p-4 mb-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 size={15} className="text-green-500" />
            </div>
            <p className="text-[13px] font-semibold text-gray-800">{t('checkoutPg.step.sent')}</p>
          </div>

          <div className="flex items-center gap-3">
            {step2Done ? (
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 size={15} className="text-green-500" />
              </div>
            ) : (
              <div className="relative w-7 h-7 shrink-0">
                <div className="absolute inset-0 rounded-full bg-amber-300 animate-ping opacity-50" />
                <div className="relative w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center">
                  <Clock size={14} className="text-white" />
                </div>
              </div>
            )}
            <p className="text-[13px] font-semibold text-gray-800">
              {step2Done ? t('checkoutPg.step.accepted') : t('checkoutPg.step.waiting')}
            </p>
          </div>

          <div className={`flex items-center gap-3 ${accepted || done ? '' : 'opacity-50'}`}>
            {step3Done ? (
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 size={15} className="text-green-500" />
              </div>
            ) : accepted ? (
              <div className="relative w-7 h-7 shrink-0">
                <div className="absolute inset-0 rounded-full bg-amber-300 animate-ping opacity-50" />
                <div className="relative w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center">
                  <span className="text-[11px] font-bold text-white">$</span>
                </div>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-gray-500">$</span>
              </div>
            )}
            <p className={`text-[13px] font-semibold ${accepted || done ? 'text-gray-800' : 'text-gray-600'}`}>{t('checkoutPg.step.pay')}</p>
          </div>
        </div>

        {/* Card da reserva */}
        <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden mb-5">
          {cover_image_url && (
            <div className="h-[100px] overflow-hidden">
              <img src={cover_image_url} alt={service_name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[15px] font-bold text-gray-900 flex-1">{service_name}</p>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 whitespace-nowrap ${badge.cls}`}>
                {badge.text}
              </span>
            </div>

            {booking_code && (
              <div className="text-[12px] font-mono font-bold text-brand bg-brand/5 rounded-lg px-3 py-2">
                {t('checkoutPg.booking.code', { code: booking_code })}
              </div>
            )}

            {Array.isArray(batchResults) && batchResults.length > 1 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 space-y-1">
                <p className="text-[11px] font-bold text-emerald-700">
                  {t('checkoutPg.batch.sentCount', { count: batchResults.length })}
                </p>
                {batchResults.map((r) => (
                  <p key={r.booking_code} className="text-[11px] text-emerald-700">
                    <span className="font-mono font-bold">{r.booking_code}</span> · {r.name}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-1.5 text-[13px] text-gray-600">
              {service_date && (
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-400 shrink-0" />
                  <span>{service_time ? t('checkoutPg.booking.dateAtTime', { date: service_date, time: service_time }) : service_date}</span>
                </div>
              )}
              {people_count && (
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-gray-400 shrink-0" />
                  <span>{t('checkoutPg.peopleCount', { count: people_count })}</span>
                </div>
              )}
            </div>

            {value > 0 && (
              <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                <span className="text-[13px] text-gray-500">{accepted ? t('checkoutPg.value.toPay') : t('checkoutPg.value.estimated')}</span>
                <span className={`text-[18px] font-bold ${accepted ? 'text-brand' : 'text-gray-900'}`}>R$ {fmt(value)}</span>
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-gray-400 text-center mb-6 leading-relaxed">
          {accepted ? t('checkoutPg.footer.acceptedNote') : t('checkoutPg.footer.note')}
        </p>

        <div className="w-full space-y-2.5">
          {canPay ? (
            <>
              <button
                onClick={handlePay}
                disabled={!isBatch && !live}
                className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                <CreditCard size={17} />
                {t('checkoutPg.button.payNow', { amount: fmt(payAmount) })}
              </button>
              <button
                onClick={() => navigate(booking_id ? `/minhas-reservas/${booking_id}` : '/minhas-reservas')}
                className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
              >
                {t('checkoutPg.button.track')} <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate(booking_id ? `/minhas-reservas/${booking_id}` : '/minhas-reservas')}
                className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform"
              >
                {t('checkoutPg.button.track')} <ArrowRight size={16} />
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
              >
                <Home size={15} />
                {t('checkoutPg.button.backHome')}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
