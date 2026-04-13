import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  ChevronLeft, MapPin, Calendar, Clock, Users, Car, Shield,
  MessageCircle, CheckCircle, AlertTriangle, Phone, Copy,
  XCircle, Loader2, Zap, Sun, Waves, Anchor,
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
  if (!booking) return 'waiting_payment'
  const c = booking.status_commercial
  const o = booking.status_operational
  if (c === 'cancelled' || o === 'cancelled') return 'cancelled'
  if (o === 'completed') return 'completed'
  if (o === 'in_progress') return 'in_progress'
  if (o === 'assigned') return 'confirmed'
  if (c === 'paid' || c === 'payment_failed') return 'waiting_acceptance'
  // draft / awaiting_payment
  return 'waiting_payment'
}

const TIMELINE = [
  { key: 'waiting_payment',    label: 'Aguardando pagamento'             },
  { key: 'waiting_acceptance', label: 'Aguardando aceitação da cooperativa' },
  { key: 'confirmed',          label: 'Confirmada'                       },
  { key: 'in_progress',        label: 'Em andamento'                     },
  { key: 'completed',          label: 'Finalizada'                       },
]

const STATUS_META = {
  waiting_payment:    { label: 'Aguardando pagamento',   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100',   icon: Clock       },
  waiting_acceptance: { label: 'Ag. aceitação',          color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100',   icon: Clock       },
  confirmed:          { label: 'Confirmada',              color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100', icon: CheckCircle },
  in_progress:        { label: 'Em andamento',            color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-100',    icon: Car         },
  completed:          { label: 'Finalizada',              color: 'text-gray-600',    bg: 'bg-gray-50',    border: 'border-gray-200',    icon: CheckCircle },
  cancelled:          { label: 'Cancelada',               color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-100',     icon: XCircle     },
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
function CancelDialog({ bookingCode, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg text-center mb-2">Cancelar reserva?</h3>
        <p className="text-sm text-gray-500 text-center mb-1">
          Reserva <span className="font-semibold text-gray-700">{bookingCode}</span>
        </p>
        <p className="text-xs text-gray-400 text-center mb-6">
          Esta ação não pode ser desfeita. Verifique a política de cancelamento antes de prosseguir.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
          >
            Voltar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-12 bg-red-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />Cancelando…</> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function BookingDetail() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  const [copied,        setCopied]        = useState(false)
  const [showCancel,    setShowCancel]    = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn:  () => api.getBooking(id),
    enabled:  !!id,
  })

  const booking = data?.booking || data

  async function handleConfirmCancel() {
    setCancelLoading(true)
    try {
      await api.cancelBooking(id, { reason: 'Cancelado pelo cliente' })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['booking', id] })
      setShowCancel(false)
    } catch (err) {
      alert(err.message || 'Erro ao cancelar')
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

  if (isLoading) return (
    <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center">
      <PageSpinner />
    </div>
  )

  if (!booking) return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col items-center justify-center gap-4 text-gray-400">
      <XCircle size={48} className="text-gray-200" />
      <p className="text-sm">Reserva não encontrada.</p>
      <button onClick={() => navigate('/minhas-reservas')} className="text-brand text-sm font-semibold">
        Voltar
      </button>
    </div>
  )

  const status      = resolveStatus(booking)
  const meta        = STATUS_META[status] || STATUS_META.waiting_payment
  const StatusIcon  = meta.icon
  const currentIdx  = TIMELINE.findIndex((s) => s.key === status)
  const isCancelled = status === 'cancelled'
  const isCancellable = ['waiting_payment', 'waiting_acceptance', 'confirmed'].includes(status)

  const gradientIdx = Math.abs(booking.id?.charCodeAt?.(0) || 0) % TOUR_GRADIENTS.length
  const IconComp    = TOUR_ICONS[gradientIdx]

  let dateStr = '—'
  if (booking.service_date) {
    try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d 'de' MMMM 'de' yyyy", { locale: ptBR }) } catch {}
  }
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const isPrivate = booking.booking_mode === 'private'
  const serviceLabel = booking.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const modeLabel    = booking.service_type === 'tour'
    ? (isPrivate ? 'Privativo' : 'Compartilhado')
    : 'Transfer'

  const details = [
    { icon: Calendar, label: 'Data',     value: dateStr },
    { icon: Clock,    label: 'Horário',  value: timeStr },
    { icon: Users,    label: 'Pessoas',  value: `${booking.people_count || '—'} ${booking.people_count === 1 ? 'pessoa' : 'pessoas'}` },
    ...(booking.origin_text      ? [{ icon: MapPin, label: 'Origem',  value: booking.origin_text }]      : []),
    ...(booking.destination_text ? [{ icon: MapPin, label: 'Destino', value: booking.destination_text }] : []),
  ]

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      {/* Header */}
      <header className="bg-white px-4 pt-4 md:pt-6 pb-4 sticky top-0 md:top-14 z-40 shadow-sm">
        <div className="flex items-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="flex-1 text-base font-bold text-gray-900">Detalhes da reserva</h1>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors active:scale-95"
          >
            <Copy size={12} />
            {copied ? 'Copiado!' : booking.booking_code}
          </button>
        </div>
      </header>

      <main className="px-4 pt-4 pb-10 max-w-2xl mx-auto space-y-3">

        {/* Status Banner */}
        <div className={`${meta.bg} rounded-2xl p-4 border ${meta.border}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shrink-0`}>
              <StatusIcon size={20} className={meta.color} />
            </div>
            <div>
              <p className={`text-sm font-bold ${meta.color}`}>{meta.label}</p>
              {status === 'waiting_acceptance' && (
                <p className="text-xs text-amber-600 mt-0.5">A cooperativa tem até 20 min para confirmar</p>
              )}
              {status === 'cancelled' && (
                <p className="text-xs text-red-500 mt-0.5">Esta reserva foi cancelada</p>
              )}
            </div>
          </div>
        </div>

        {/* Service Card */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
          <div className={`h-24 bg-gradient-to-br ${TOUR_GRADIENTS[gradientIdx]} relative flex items-center justify-center`}>
            <IconComp size={40} className="text-brand/15" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
              <div>
                <p className="text-white font-bold text-base leading-tight">{serviceLabel}</p>
                <p className="text-white/80 text-xs mt-0.5">{modeLabel}</p>
              </div>
              <p className="text-white font-bold text-lg">{fmt(booking.total_price)}</p>
            </div>
          </div>
        </div>

        {/* Progress Timeline */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-4">Progresso da reserva</h2>
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
          <h2 className="text-sm font-bold text-gray-900 mb-3">Detalhes</h2>
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
            <h2 className="text-sm font-bold text-gray-900 mb-3">Veículos</h2>
            <div className="space-y-2">
              {booking.booking_vehicles.map((bv, i) => (
                <div key={i} className="flex items-center justify-between bg-brand/5 border border-brand/10 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Car size={14} className="text-brand" />
                    <span className="text-sm font-medium text-gray-900">{bv.vehicle?.name || 'Veículo'}</span>
                  </div>
                  <span className="text-xs text-brand font-bold">{bv.quantity}x · {fmt(bv.unit_price)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Special Notes */}
        {booking.special_notes && (
          <div className="bg-amber-50 rounded-2xl px-4 py-3 border border-amber-100">
            <p className="text-xs text-amber-700 font-semibold mb-0.5">Observações</p>
            <p className="text-sm text-amber-800">{booking.special_notes}</p>
          </div>
        )}

        {/* WhatsApp Support */}
        <button
          onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}`, '_blank')}
          className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:bg-gray-50 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-[#E8F8EE] flex items-center justify-center text-[#25D366] shrink-0">
            <WhatsAppIcon />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-bold text-gray-900">Suporte via WhatsApp</p>
            <p className="text-xs text-gray-400">Estamos prontos para ajudar</p>
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
            <p className="text-sm font-bold text-gray-900">Ligar para suporte</p>
            <p className="text-xs text-gray-400">{PHONE_NUMBER}</p>
          </div>
        </a>

        {/* Cancellation Policy */}
        <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
          <div className="flex items-start gap-2.5">
            <Shield size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-blue-900 mb-0.5">Política de cancelamento</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Cancelamento gratuito até 24h antes do passeio. Após esse prazo, pode haver cobrança de taxa.
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
            Cancelar reserva
          </button>
        )}
      </main>

      {/* Cancel Dialog */}
      {showCancel && (
        <CancelDialog
          bookingCode={booking.booking_code}
          onConfirm={handleConfirmCancel}
          onClose={() => setShowCancel(false)}
          loading={cancelLoading}
        />
      )}
    </div>
  )
}
