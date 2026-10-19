import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Clock, ArrowRight, Home, Calendar, Users, Car, XCircle } from 'lucide-react'
import { trackPurchase } from '../../lib/marketing'
import { api } from '../../lib/api'
import { resolveStatusReserva } from '../../lib/statusReserva'

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

export default function CheckoutSucesso() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const { t }     = useTranslation()

  // Marketing: Purchase (Meta/GA4/Ads) uma única vez ao cair na tela de sucesso.
  // O ref evita a dupla-execução do StrictMode (dev); um refresh não dispara de
  // novo porque sem `state` a tela redireciona antes.
  const purchaseFired = useRef(false)
  useEffect(() => {
    if (purchaseFired.current || !state) return
    purchaseFired.current = true
    trackPurchase({
      value:         Number(state.amount ?? state.total_price) || undefined,
      transactionId: state.booking_code || state.booking_id || undefined,
      ids:           state.service_id ? [state.service_id] : undefined,
    })
  }, [state])

  const bookingId = state?.booking_id

  // Status AO VIVO. Antes esta tela mostrava um "Aguardando operador aceitar"
  // FIXO (vinha só do location.state) e nunca mudava — mesmo depois de o
  // operador aceitar, despachar e iniciar a corrida. Agora relê a reserva e
  // vai acompanhando (mesmo polling e mesma regra de status do detalhe).
  const { data: bookingLive } = useQuery({
    queryKey:        ['booking', bookingId],
    queryFn:         () => api.getBooking(bookingId),
    enabled:         !!bookingId,
    refetchInterval: (q) => {
      const s = resolveStatusReserva(q.state.data)
      return ['waiting_acceptance', 'waiting_payment', 'confirmed', 'in_progress'].includes(s) ? 8000 : false
    },
    refetchOnWindowFocus: true,
  })

  if (!state) { navigate('/'); return null }

  const {
    service_name, service_date, service_time, people_count,
    total_price, amount, booking_code, cover_image_url,
  } = state

  const value = amount || total_price

  // Enquanto a reserva não voltou do servidor, mostra "aguardando aceite"
  // (estado logo após pagar). Depois, o status real manda.
  const status = bookingLive ? resolveStatusReserva(bookingLive) : 'waiting_acceptance'

  // Rótulos/cores reaproveitam as chaves do detalhe da reserva (já traduzidas).
  const STATUS_META = {
    waiting_payment:    { label: t('bookingDetailPg.statusMeta.waitingPayment'),    sub: t('payment.success.awaitingCoopSub'),                                                          color: 'text-amber-900',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400',   icon: Clock },
    waiting_acceptance: { label: t('payment.success.awaitingCoop'),                 sub: t('payment.success.awaitingCoopSub'),                                                          color: 'text-amber-900',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-400',   icon: Clock },
    confirmed:          { label: t('bookingDetailPg.timeline.confirmed'),           sub: t('payment.success.confirmedSub',  { defaultValue: 'O operador confirmou sua reserva. Acompanhe os próximos passos por aqui.' }), color: 'text-emerald-900', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400', icon: CheckCircle },
    in_progress:        { label: t('bookingDetailPg.timeline.inProgress'),          sub: t('payment.success.inProgressSub', { defaultValue: 'Seu serviço começou. Bom passeio! 🌴' }),       color: 'text-blue-900',    bg: 'bg-blue-50',    border: 'border-blue-200',    dot: 'bg-blue-400',    icon: Car },
    completed:          { label: t('bookingDetailPg.timeline.completed'),           sub: t('payment.success.completedSub',  { defaultValue: 'Serviço concluído. Obrigado por viajar com a Turiva!' }), color: 'text-gray-700',    bg: 'bg-gray-50',    border: 'border-gray-200',    dot: 'bg-gray-400',    icon: CheckCircle },
    cancelled:          { label: t('bookingDetailPg.statusMeta.cancelled'),         sub: t('payment.success.cancelledSub',  { defaultValue: 'Esta reserva foi cancelada.' }),                color: 'text-red-900',     bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-400',     icon: XCircle },
  }
  const meta  = STATUS_META[status] || STATUS_META.waiting_acceptance
  const pulse = ['waiting_acceptance', 'waiting_payment', 'confirmed', 'in_progress'].includes(status)
  const StatusIcon = meta.icon

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 px-4 pt-14 pb-10 flex flex-col items-center">

        {/* Ícone sucesso */}
        <div className="relative mb-5">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle size={40} className="text-green-500" strokeWidth={1.5} />
          </div>
          <div className="absolute inset-0 rounded-full bg-green-200 animate-ping opacity-20" />
        </div>

        <h1 className="text-[22px] font-extrabold text-gray-900 text-center leading-tight mb-1">
          {t('payment.success.title')}
        </h1>
        <p className="text-[13px] text-gray-500 text-center mb-5">
          {t('payment.success.subtitle')}
        </p>

        {/* Status da reserva — AO VIVO (acompanha o operador aceitar/iniciar) */}
        <div className={`w-full ${meta.bg} border ${meta.border} rounded-2xl p-4 mb-4 flex items-start gap-3`}>
          <div className="relative shrink-0 mt-0.5">
            {pulse && <div className={`w-8 h-8 rounded-full ${meta.dot} animate-ping absolute inset-0 opacity-50`} />}
            <div className={`relative w-8 h-8 rounded-full ${meta.dot} flex items-center justify-center`}>
              <StatusIcon size={16} className="text-white" />
            </div>
          </div>
          <div>
            <p className={`text-[14px] font-bold ${meta.color}`}>{meta.label}</p>
            <p className={`text-[12px] ${meta.color} opacity-80 mt-0.5 leading-relaxed`}>
              {meta.sub}
            </p>
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
              <span className={`${meta.bg} ${meta.color} text-[10px] font-bold px-2 py-1 rounded-full shrink-0 whitespace-nowrap`}>
                {meta.label}
              </span>
            </div>

            {booking_code && (
              <div className="text-[12px] font-mono font-bold text-brand bg-brand/5 rounded-lg px-3 py-2">
                {t('payment.success.code')}: {booking_code}
              </div>
            )}

            <div className="space-y-1.5 text-[13px] text-gray-600">
              {service_date && (
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-400 shrink-0" />
                  <span>{service_date}{service_time ? ` às ${service_time}` : ''}</span>
                </div>
              )}
              {people_count && (
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-gray-400 shrink-0" />
                  <span>{people_count} {people_count === 1 ? t('payment.success.person') : t('payment.success.people')}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <span className="text-[13px] text-gray-500">{t('payment.success.totalPaid')}</span>
              <span className="text-[18px] font-bold text-gray-900">R$ {fmt(value)}</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 text-center mb-6 leading-relaxed">
          {t('payment.success.followHint')}
        </p>

        <div className="w-full space-y-2.5">
          <button
            onClick={() => navigate(bookingId ? `/minhas-reservas/${bookingId}` : '/minhas-reservas')}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform"
          >
            {t('payment.success.trackBtn')} <ArrowRight size={16} />
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            <Home size={15} />
            {t('payment.success.homeBtn')}
          </button>
        </div>
      </main>
    </div>
  )
}
