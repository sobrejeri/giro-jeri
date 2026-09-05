import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import ReviewSheet from '../components/ReviewSheet'
import {
  ChevronLeft, MapPin, Calendar, Clock, Users, Car, Shield,
  MessageCircle, CheckCircle, AlertTriangle, Phone, Copy,
  XCircle, Loader2, Zap, Sun, Waves, Anchor, Star,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const WHATSAPP_NUMBER = '5588999999999'
const PHONE_NUMBER    = '(88) 9 9999-9999'

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z" />
    </svg>
  )
}

// Map API dual-status fields to a single timeline status
function resolveStatus(booking) {
  if (!booking) return 'waiting_acceptance'
  const c = booking.status_commercial
  const o = booking.status_operational
  if (c === 'cancelled' || o === 'cancelled') return 'cancelled'
  if (o === 'completed') return 'completed'
  if (o === 'in_progress') return 'in_progress'
  // Fluxo solicitar → aceitar → pagar:
  if (c === 'awaiting_acceptance') return 'waiting_acceptance' // aguardando operador
  if (c === 'awaiting_payment' || c === 'payment_failed') return 'waiting_payment' // aceita → pague
  // Pago = dinheiro recebido, já passou da aceitação. Independente do
  // sub-estado operacional (assigned/awaiting_dispatch/new), pro cliente é
  // "confirmada". completed/in_progress já foram tratados acima.
  if (c === 'paid') return 'confirmed'
  if (o === 'assigned') return 'confirmed'
  return 'waiting_acceptance'
}

const TOUR_GRADIENTS = [
  'from-orange-100 to-amber-50',
  'from-sky-100 to-blue-50',
  'from-emerald-100 to-teal-50',
  'from-purple-100 to-violet-50',
]
const TOUR_ICONS = [Zap, Sun, Waves, Anchor]

function fmt(v) {
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

// ── Cancel Dialog ────────────────────────────────────────────────
function CancelDialog({ bookingCode, onConfirm, onClose, loading, error }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg text-center mb-2">{t('bookingDetailPg.cancelDialog.title')}</h3>
        <p className="text-sm text-gray-500 text-center mb-1">
          {t('bookingDetailPg.cancelDialog.reservationLabel')} <span className="font-semibold text-gray-700">{bookingCode}</span>
        </p>
        <p className="text-xs text-gray-400 text-center mb-4">
          {t('bookingDetailPg.cancelDialog.warning')}
        </p>
        {error && (
          <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center mb-4">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
          >
            {t('bookingDetailPg.actions.back')}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-12 bg-red-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />{t('bookingDetailPg.cancelDialog.cancelling')}</> : t('bookingDetailPg.cancelDialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function BookingDetail() {
  const { t }        = useTranslation()
  const { id }       = useParams()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  // Ordem do fluxo: solicitar → (operador aceita) → pagar → confirmada → ...
  const TIMELINE = [
    { key: 'waiting_acceptance', label: t('bookingDetailPg.timeline.waitingAcceptance') },
    { key: 'waiting_payment',    label: t('bookingDetailPg.timeline.payment')            },
    { key: 'confirmed',          label: t('bookingDetailPg.timeline.confirmed')          },
    { key: 'in_progress',        label: t('bookingDetailPg.timeline.inProgress')         },
    { key: 'completed',          label: t('bookingDetailPg.timeline.completed')          },
  ]

  const STATUS_META = {
    waiting_payment:    { label: t('bookingDetailPg.statusMeta.waitingPayment'),    color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100',   icon: Clock       },
    waiting_acceptance: { label: t('bookingDetailPg.statusMeta.waitingAcceptance'), color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100',   icon: Clock       },
    confirmed:          { label: t('bookingDetailPg.timeline.confirmed'),           color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: CheckCircle },
    in_progress:        { label: t('bookingDetailPg.timeline.inProgress'),          color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-100',    icon: Car         },
    completed:          { label: t('bookingDetailPg.timeline.completed'),           color: 'text-gray-600',    bg: 'bg-gray-50',    border: 'border-gray-200',    icon: CheckCircle },
    cancelled:          { label: t('bookingDetailPg.statusMeta.cancelled'),         color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-100',     icon: XCircle     },
  }

  const [copied,          setCopied]          = useState(false)
  const [showCancel,      setShowCancel]      = useState(false)
  const [cancelLoading,   setCancelLoading]   = useState(false)
  const [cancelError,     setCancelError]     = useState(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError,   setCheckoutError]   = useState(null)
  const [nowTs,           setNowTs]           = useState(() => Date.now())

  // Relógio para a contagem regressiva do prazo de pagamento (checkout parcial).
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey:        ['booking', id],
    queryFn:         () => api.getBooking(id),
    enabled:         !!id,
    refetchInterval: (q) => {
      const s = resolveStatus(q.state.data)
      return ['waiting_acceptance', 'confirmed', 'in_progress'].includes(s) ? 8000 : false
    },
  })

  const booking = data

  // ── Avaliação ───────────────────────────────────────────────────────────
  // A nota do cliente é o que forma a reputação do operador na plataforma, e
  // até agora só dava para avaliar pela LISTA de reservas. Quem terminava o
  // passeio e abria o detalhe via "Finalizada" e mais nada — nenhum caminho
  // para avaliar, justamente no momento em que a experiência está fresca.
  const [avaliando, setAvaliando] = useState(false)
  const { data: minhasAvaliacoes } = useQuery({
    queryKey: ['my-coop-reviews'],   // MESMA chave da lista de reservas
    queryFn:  () => api.getMyCoopReviews(),
    staleTime: 60_000,
  })
  const jaAvaliou = (Array.isArray(minhasAvaliacoes) ? minhasAvaliacoes : [])
    .some((r) => r.booking_id === id)

  // Mesma regra da lista: serviço pago e já realizado (concluído pelo operador,
  // ou com a data no passado — nem todo operador marca "concluir").
  const podeAvaliar = (() => {
    if (!booking || booking.status_commercial !== 'paid') return false
    if (booking.status_operational === 'completed') return true
    if (!booking.service_date) return false
    return booking.service_date <= new Date().toISOString().slice(0, 10)
  })()

  async function handleConfirmCancel() {
    setCancelLoading(true)
    setCancelError(null)
    try {
      await api.cancelBooking(id, { reason: 'Cancelado pelo cliente' })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking', id] })
      setShowCancel(false)
    } catch (err) {
      setCancelError(err.message || t('bookingDetailPg.errors.cancelFailed'))
    } finally {
      setCancelLoading(false)
    }
  }

  function handleCopy() {
    if (!booking?.booking_code) return
    navigator.clipboard.writeText(booking.booking_code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Pagamento pós-aceite: leva à tela de pagamento usando a reserva existente.
  // totalOverride: usado no checkout parcial (paga só o total das pernas aceitas).
  function handlePay(totalOverride) {
    if (!booking) return
    let dStr = '—'
    if (booking.service_date) {
      try { dStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
    }
    navigate('/checkout/pagamento', {
      state: {
        service_name:        booking.booking_items?.[0]?.title_snapshot
          || `${booking.service_type === 'tour' ? t('bookingDetailPg.service.tour') : t('bookingDetailPg.service.transfer')} · ${booking.booking_code}`,
        service_type:        booking.service_type,
        booking_mode:        booking.booking_mode || 'private',
        service_date:        dStr,
        service_date_iso:    booking.service_date,
        service_time:        booking.service_time,
        people_count:        booking.people_count,
        total_price:         totalOverride != null ? totalOverride : booking.total_amount,
        origin_text:         booking.origin_text || booking.pickup_place_name || null,
        destination_text:    booking.destination_text || booking.destination_place_name || null,
        existing_booking_id: booking.id,
      },
    })
  }

  // Checkout parcial (R3): confirma pagando só o(s) veículo(s) aceito(s); as
  // pernas ainda pendentes são canceladas no servidor. Depois segue ao pagamento
  // com o total dinâmico retornado.
  async function handleConfirmPartial() {
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const r = await api.checkoutAccepted(id)
      await queryClient.invalidateQueries({ queryKey: ['booking', id] })
      handlePay(r?.dynamic_total)
    } catch (err) {
      setCheckoutError(err.message || t('bookingDetailPg.errors.checkoutFailed'))
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <PageSpinner />
    </div>
  )

  if (!booking) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-400">
      <XCircle size={48} className="text-gray-200" />
      <p className="text-sm">{t('bookingDetailPg.notFound.message')}</p>
      <button onClick={() => navigate('/minhas-reservas')} className="text-brand text-sm font-semibold">
        {t('bookingDetailPg.actions.back')}
      </button>
    </div>
  )

  const status      = resolveStatus(booking)
  const meta        = STATUS_META[status] || STATUS_META.waiting_payment
  const StatusIcon  = meta.icon
  const currentIdx  = TIMELINE.findIndex((s) => s.key === status)
  const isCancelled = status === 'cancelled'
  const isCancellable = ['waiting_payment', 'waiting_acceptance', 'confirmed'].includes(status)

  // ── Aceite parcial (R3): alguma perna aceita, mas ainda há pendentes ──────
  const ls          = booking.legs_summary
  const isPartial   = !!ls && ls.accepted_count > 0 && ls.pending_count > 0 && status === 'waiting_acceptance'
  const acceptedTot = ls?.dynamic_total_accepted ?? 0
  // Contagem regressiva do prazo de pagamento
  const deadlineMs  = booking.payment_deadline_at ? new Date(booking.payment_deadline_at).getTime() : null
  const msLeft      = deadlineMs != null ? deadlineMs - nowTs : null
  const mmss        = msLeft != null && msLeft > 0
    ? `${String(Math.floor(msLeft / 60000)).padStart(2, '0')}:${String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0')}`
    : null

  const gradientIdx = Math.abs(booking.id?.charCodeAt?.(0) || 0) % TOUR_GRADIENTS.length
  const IconComp    = TOUR_ICONS[gradientIdx]

  let dateStr = '—'
  if (booking.service_date) {
    try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) } catch {}
  }
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const isPrivate = booking.booking_mode === 'private'
  const typeLabel    = booking.service_type === 'tour' ? t('bookingDetailPg.service.tour') : t('bookingDetailPg.service.transfer')
  // Nome real do serviço (resolvido pela API a partir do service_id); sem ele
  // fica a categoria, como era antes.
  const serviceLabel = booking.service_name || typeLabel
  const modeLabel    = booking.service_type === 'tour'
    ? (isPrivate ? t('bookingDetailPg.mode.private') : t('bookingDetailPg.mode.shared'))
    : t('bookingDetailPg.service.transfer')

  const peopleCount = booking.people_count || '—'
  const peopleValue = booking.people_count === 1
    ? t('bookingDetailPg.details.peopleCountOne', { count: peopleCount })
    : t('bookingDetailPg.details.peopleCountOther', { count: peopleCount })

  const details = [
    { icon: Calendar, label: t('bookingDetailPg.details.date'),     value: dateStr },
    { icon: Clock,    label: t('bookingDetailPg.details.time'),     value: timeStr },
    { icon: Users,    label: t('bookingDetailPg.details.people'),   value: peopleValue },
    ...(booking.pickup_place_name      ? [{ icon: MapPin, label: t('bookingDetailPg.details.origin'),      value: booking.pickup_place_name }]      : []),
    ...(booking.destination_place_name ? [{ icon: MapPin, label: t('bookingDetailPg.details.destination'), value: booking.destination_place_name }] : []),
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white px-4 pt-4 md:pt-6 pb-4 sticky top-0 md:top-14 z-40 shadow-sm">
        <div className="flex items-center gap-3 max-w-2xl lg:max-w-3xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="flex-1 font-giro font-semibold text-[20px] text-gray-900 tracking-wide text-center">{t('bookingDetailPg.header.title')}</h1>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors active:scale-95"
          >
            <Copy size={12} />
            {copied ? t('bookingDetailPg.header.copied') : booking.booking_code}
          </button>
        </div>
      </header>

      <main className="px-4 pt-4 pb-10 max-w-2xl lg:max-w-3xl mx-auto space-y-3">

        {/* Status Banner */}
        <div className={`${meta.bg} rounded-2xl p-4 border ${meta.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
              <StatusIcon size={20} className={meta.color} />
            </div>
            <div>
              <p className={`text-sm font-bold ${meta.color}`}>{meta.label}</p>
              {status === 'waiting_acceptance' && (
                <p className="text-xs text-amber-600 mt-0.5">{t('bookingDetailPg.statusBanner.waitingAcceptance')}</p>
              )}
              {status === 'waiting_payment' && (
                <p className="text-xs text-amber-600 mt-0.5">{t('bookingDetailPg.statusBanner.waitingPayment')}</p>
              )}
              {status === 'cancelled' && (
                <p className="text-xs text-red-500 mt-0.5">{t('bookingDetailPg.statusBanner.cancelled')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Aceite parcial (R3) — 1+ veículo aceito, ainda há pendentes.
            O cliente confirma e paga só o aceito, ou cancela a corrida. */}
        {isPartial && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-amber-200">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <CheckCircle size={20} className="text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">
                  {t('bookingDetailPg.partial.acceptedCount', { accepted: ls.accepted_count, total: ls.total_legs })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('bookingDetailPg.partial.confirmPrompt')} {ls.pending_count > 0 && (
                    <span className="text-amber-700">
                      {ls.pending_count > 1
                        ? t('bookingDetailPg.partial.pendingWarningPlural', { count: ls.pending_count })
                        : t('bookingDetailPg.partial.pendingWarningSingular', { count: ls.pending_count })}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {mmss ? (
              <div className="flex items-center justify-center gap-1.5 mb-3 text-amber-700">
                <Clock size={14} />
                <span className="text-sm font-bold tabular-nums">{mmss}</span>
                <span className="text-xs">{t('bookingDetailPg.partial.toConfirm')}</span>
              </div>
            ) : (
              <p className="text-center text-xs text-red-500 mb-3">{t('bookingDetailPg.partial.expired')}</p>
            )}

            {checkoutError && (
              <p className="text-xs text-red-500 text-center mb-2">{checkoutError}</p>
            )}

            <button
              onClick={handleConfirmPartial}
              disabled={checkoutLoading || !mmss}
              className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {checkoutLoading
                ? <><Loader2 size={16} className="animate-spin" /> {t('bookingDetailPg.partial.confirming')}</>
                : <>{t('bookingDetailPg.partial.confirmAndPay', { amount: fmt(acceptedTot) })}</>}
            </button>
            <button
              onClick={() => setShowCancel(true)}
              disabled={checkoutLoading}
              className="w-full mt-2 text-gray-500 font-semibold rounded-2xl py-2.5 text-sm active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {t('bookingDetailPg.partial.cancelRide')}
            </button>
          </div>
        )}

        {/* Pay CTA — operador aceitou, falta pagar */}
        {status === 'waiting_payment' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand/20">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <CheckCircle size={20} className="text-brand" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{t('bookingDetailPg.payCta.title')}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t('bookingDetailPg.payCta.subtitle')}</p>
              </div>
            </div>
            <button
              onClick={handlePay}
              className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[15px] active:scale-[0.98] transition-transform"
            >
              {t('bookingDetailPg.payCta.button', { amount: fmt(booking.total_amount) })}
            </button>
          </div>
        )}

        {/* Operator confirmed card */}
        {status === 'confirmed' && booking.operator && (
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-2">{t('bookingDetailPg.operatorCard.title')}</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">{booking.operator.full_name}</p>
                {booking.operator.phone && (
                  <p className="text-xs text-gray-500 mt-0.5">{booking.operator.phone}</p>
                )}
              </div>
              {booking.operator.phone && (
                <a
                  href={`https://wa.me/${(() => { const d = booking.operator.phone.replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d })()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 bg-[#25D366] text-white text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-transform"
                >
                  <WhatsAppIcon /> WhatsApp
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Avaliação do serviço ────────────────────────────────────────────
            Aparece só depois de o serviço ter acontecido. É o momento certo:
            o cliente acabou de voltar do passeio e está com a experiência
            fresca — antes disso não haveria o que avaliar. */}
        {podeAvaliar && (
          jaAvaliou ? (
            <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 flex items-center gap-3">
              <CheckCircle size={18} className="text-emerald-500 shrink-0" />
              <p className="text-[13px] font-semibold text-emerald-800">
                {t('bookingDetailPg.review.done')}
              </p>
            </div>
          ) : (
            <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
              <p className="text-[14px] font-bold text-gray-900">{t('bookingDetailPg.review.title')}</p>
              <p className="text-[12px] text-gray-600 mt-1 leading-snug">
                {t('bookingDetailPg.review.subtitle')}
              </p>
              <button
                onClick={() => setAvaliando(true)}
                className="mt-3 w-full bg-brand text-white font-bold rounded-xl py-3 text-[14px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Star size={16} className="fill-white" /> {t('bookingDetailPg.review.cta')}
              </button>
            </div>
          )
        )}

        {/* ── Motorista designado (despacho do operador) ──────────────────────
            O operador despacha e o cliente não via NADA: a tela ficava idêntica
            a antes, e parecia que o sistema não tinha atualizado. É a
            informação mais útil depois de pagar — quem vem buscar, em quê. */}
        {booking.dispatch && (
          <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">
              {t('bookingDetailPg.dispatchCard.title')}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                {booking.dispatch.driver_name && (
                  <p className="text-sm font-bold text-gray-900 truncate">{booking.dispatch.driver_name}</p>
                )}
                {booking.dispatch.vehicle_text && (
                  <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1.5">
                    <Car size={12} className="text-blue-500 shrink-0" />
                    {booking.dispatch.vehicle_text}
                  </p>
                )}
              </div>
              {booking.dispatch.driver_phone && (
                <a
                  href={`https://wa.me/${(() => { const d = booking.dispatch.driver_phone.replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d })()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 bg-[#25D366] text-white text-xs font-bold px-3 py-2 rounded-xl active:scale-95 transition-transform shrink-0"
                >
                  <WhatsAppIcon /> WhatsApp
                </a>
              )}
            </div>
          </div>
        )}

        {/* Waiting acceptance pulse */}
        {status === 'waiting_acceptance' && (
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100 flex items-center gap-3">
            <div className="relative shrink-0">
              <div className="w-8 h-8 rounded-full bg-amber-300 animate-ping absolute inset-0 opacity-40" />
              <div className="relative w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center">
                <Clock size={16} className="text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">{t('bookingDetailPg.waitingPulse.title')}</p>
              <p className="text-xs text-amber-600 mt-0.5">{t('bookingDetailPg.waitingPulse.subtitle')}</p>
            </div>
          </div>
        )}

        {/* Service Card */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className={`h-32 bg-gradient-to-br ${TOUR_GRADIENTS[gradientIdx]} relative flex items-center justify-center`}>
            {booking.cover_image_url ? (
              <img src={booking.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <IconComp size={40} className="text-brand/15" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <span className="absolute top-3 left-3 flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              <IconComp size={10} /> {typeLabel}
            </span>
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-bold text-base leading-tight truncate drop-shadow">{serviceLabel}</p>
                <p className="text-white/80 text-xs mt-0.5 drop-shadow">{modeLabel}</p>
              </div>
              <p className="text-white font-bold text-lg">{fmt(booking.total_amount)}</p>
            </div>
          </div>
        </div>

        {/* Progress Timeline */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4">{t('bookingDetailPg.timelineSection.title')}</h2>
            <div className="space-y-0">
              {TIMELINE.map((step, i) => {
                const isPast    = i < currentIdx
                const isCurrent = i === currentIdx
                const isFuture  = i > currentIdx
                const isLast    = i === TIMELINE.length - 1

                return (
                  <div key={step.key} className="flex gap-3">
                    {/* Dot + connector */}
                    <div className="flex flex-col items-center">
                      {isPast ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                          <CheckCircle size={12} className="text-white" />
                        </div>
                      ) : isCurrent ? (
                        <div className="relative w-5 h-5 shrink-0">
                          <div className="absolute inset-0 rounded-full bg-brand animate-ping opacity-30" />
                          <div className="relative w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0" />
                      )}
                      {!isLast && (
                        <div className={`w-0.5 h-6 mt-0.5 ${isPast ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                      )}
                    </div>

                    {/* Label */}
                    <div className={`pb-4 ${isLast ? 'pb-0' : ''} flex items-start pt-0.5`}>
                      <p className={`text-xs font-semibold leading-tight ${
                        isFuture ? 'text-gray-300' : isCurrent ? 'text-brand' : 'text-gray-700'
                      }`}>
                        {step.label}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Booking Details */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t('bookingDetailPg.detailsSection.title')}</h2>
          <div className="space-y-2.5">
            {details.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <item.icon size={13} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vehicles */}
        {booking.booking_vehicles?.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3">{t('bookingDetailPg.vehiclesSection.title')}</h2>
            <div className="space-y-2">
              {booking.booking_vehicles.map((bv, i) => (
                <div key={i} className="flex items-center justify-between bg-brand/5 border border-brand/10 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Car size={14} className="text-brand" />
                    <span className="text-sm font-medium text-gray-900">{bv.vehicle_name_snapshot || t('bookingDetailPg.vehiclesSection.defaultName')}</span>
                  </div>
                  <span className="text-xs text-brand font-bold">{t('bookingDetailPg.vehiclesSection.qtyPrice', { qty: bv.quantity, price: fmt(bv.unit_price) })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Special Notes */}
        {booking.special_notes && (
          <div className="bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
            <p className="text-xs text-amber-700 font-semibold mb-0.5">{t('bookingDetailPg.notes.title')}</p>
            <p className="text-sm text-amber-800">{booking.special_notes}</p>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-2 lg:gap-3 space-y-3 lg:space-y-0">
        {/* WhatsApp Support */}
        <button
          onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank')}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:bg-gray-50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-[#E8F8EE] flex items-center justify-center text-[#25D366] shrink-0">
            <WhatsAppIcon />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-gray-900">{t('bookingDetailPg.support.whatsappTitle')}</p>
            <p className="text-xs text-gray-400">{t('bookingDetailPg.support.whatsappSubtitle')}</p>
          </div>
          <MessageCircle size={16} className="text-gray-400" />
        </button>

        {/* Phone Support */}
        <a
          href={`tel:${PHONE_NUMBER.replace(/\D/g, '')}`}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:bg-gray-50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Phone size={16} />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-gray-900">{t('bookingDetailPg.support.phoneTitle')}</p>
            <p className="text-xs text-gray-400">{PHONE_NUMBER}</p>
          </div>
        </a>
        </div>

        {/* Cancellation Policy */}
        <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
          <div className="flex items-start gap-2.5">
            <Shield size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-blue-900 mb-0.5">{t('bookingDetailPg.policy.title')}</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                {t('bookingDetailPg.policy.text')}
              </p>
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        {isCancellable && (
          <button
            onClick={() => setShowCancel(true)}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-red-500 active:text-red-700 transition-colors"
          >
            <AlertTriangle size={15} />
            {t('bookingDetailPg.actions.cancelReservation')}
          </button>
        )}
      </main>

      {/* Cancel Dialog */}
      {avaliando && booking && (
        <ReviewSheet
          booking={booking}
          onClose={() => setAvaliando(false)}
          onDone={() => {
            setAvaliando(false)
            // Uma chave só, compartilhada com a lista: o "Avaliado" aparece
            // aqui E lá sem cada tela ter o próprio cache do mesmo dado.
            queryClient.invalidateQueries({ queryKey: ['my-coop-reviews'] })
          }}
        />
      )}

      {showCancel && (
        <CancelDialog
          bookingCode={booking.booking_code}
          onConfirm={handleConfirmCancel}
          onClose={() => { setShowCancel(false); setCancelError(null) }}
          loading={cancelLoading}
          error={cancelError}
        />
      )}
    </div>
  )
}
