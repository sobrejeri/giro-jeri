import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Countdown from '../components/ui/Countdown'
import {
  Calendar, Clock, Users, Car, Search, Compass, MapPin,
  RefreshCw, AlertTriangle, Loader2, Zap, Sun, Waves, Anchor,
  ChevronLeft, ChevronRight, CalendarCheck, X, Hourglass, Banknote,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Status helpers ─────────────────────────────────────────── */
// Estende o status básico com os ramos de translado personalizado
// (is_manual_quote): awaiting_price (sem total ainda), expired, rejected —
// mantendo os estados já existentes intocados.
function resolveStatus(b) {
  const c = b.status_commercial
  const o = b.status_operational

  if (c === 'expired')                         return 'expired'
  if (c === 'rejected')                        return 'rejected'
  if (c === 'cancelled' || o === 'cancelled')  return 'cancelled'
  if (o === 'completed')                       return 'completed'
  if (o === 'in_progress')                     return 'in_progress'

  // Translado personalizado aguardando a cooperativa enviar o valor.
  if (b.is_manual_quote && c === 'awaiting_acceptance' && !b.total_amount) {
    return 'awaiting_price'
  }

  // Fluxo solicitar → aceitar → pagar:
  if (c === 'awaiting_acceptance')             return 'waiting_acceptance' // aguardando cooperativa aceitar
  if (c === 'awaiting_payment')                return 'waiting_payment'    // aceita → pague agora
  // Pago: se já há cooperativa atribuída, está confirmado; senão (fluxo antigo)
  // ainda aguarda uma cooperativa aceitar.
  if (c === 'paid')                            return o === 'assigned' ? 'confirmed' : 'waiting_acceptance'
  if (o === 'assigned')                        return 'confirmed'
  return 'waiting_payment'
}

function getStatusCfg(t) {
  return {
    awaiting_price:     { label: t('bookings.status.awaiting_price'),     bg: 'bg-amber-600',  text: 'text-white' },
    waiting_payment:     { label: t('bookings.status.waiting_payment'),    bg: 'bg-amber-600',  text: 'text-white' },
    waiting_acceptance:  { label: t('bookings.status.waiting_acceptance'), bg: 'bg-orange-500', text: 'text-white' },
    confirmed:           { label: t('bookings.status.confirmed'),          bg: 'bg-green-500',  text: 'text-white' },
    in_progress:         { label: t('bookings.status.in_progress'),       bg: 'bg-blue-500',   text: 'text-white' },
    completed:           { label: t('bookings.status.completed'),         bg: 'bg-gray-500',   text: 'text-white' },
    cancelled:           { label: t('bookings.status.cancelled'),         bg: 'bg-red-500',    text: 'text-white' },
    expired:             { label: t('bookings.status.expired'),           bg: 'bg-gray-400',   text: 'text-white' },
    rejected:            { label: t('bookings.status.rejected'),          bg: 'bg-red-600',    text: 'text-white' },
  }
}

const ACTIVE_STATUSES = ['waiting_payment', 'waiting_acceptance', 'confirmed', 'in_progress', 'awaiting_price']

const GRADIENTS = [
  ['from-orange-400', 'to-amber-300'],
  ['from-sky-400',    'to-blue-300'],
  ['from-teal-400',   'to-emerald-300'],
  ['from-violet-400', 'to-purple-300'],
]
const ICONS = [Zap, Sun, Waves, Anchor]

function gi(id = '') { let n = 0; for (const c of id) n += c.charCodeAt(0); return n % GRADIENTS.length }
function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR')}` }

// Hora-alvo ABSOLUTA derivada de quote_expires_at (ex: "14:30"), não contagem
// regressiva crua — pedido explícito do UX Expert.
function fmtAbsoluteTime(iso) {
  if (!iso) return null
  try { return format(new Date(iso), 'HH:mm') } catch { return null }
}

/* ── Cancel Dialog ──────────────────────────────────────────── */
function CancelDialog({ booking, onConfirm, onClose, loading, error }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg text-center mb-2">{t('bookings.cancel')}</h3>
        <p className="text-sm text-gray-500 text-center mb-1">
          {booking.booking_code}
        </p>
        <p className="text-xs text-gray-400 text-center mb-4">{t('bookings.cancelConfirm')}</p>
        {error && (
          <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center mb-4">{error}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 min-h-[44px] border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
          >{t('bookings.cancelClose')}</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 min-h-[44px] bg-red-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />{t('bookings.cancelling')}</> : t('bookings.cancelBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Reject Dialog (motivo opcional, sem prompt() nativo) ───── */
function RejectDialog({ booking, onConfirm, onClose, loading, error }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <X size={28} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg text-center mb-2">{t('bookings.reject.title')}</h3>
        <p className="text-sm text-gray-500 text-center mb-4">{booking.booking_code}</p>

        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {t('bookings.reject.reasonLabel')}
        </label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('bookings.reject.reasonPlaceholder')}
          className="w-full mt-1 mb-4 text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400"
        />

        {error && (
          <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center mb-4">{error}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 min-h-[44px] border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
          >{t('bookings.cancelClose')}</button>
          <button onClick={() => onConfirm(reason)} disabled={loading}
            className="flex-1 min-h-[44px] bg-red-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />{t('bookings.cancelling')}</> : t('bookings.reject.confirmBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Booking Card ───────────────────────────────────────────── */
function BookingCard({ booking, onCancel, onReject, onDetail, onPay }) {
  const { t } = useTranslation()
  const STATUS_CFG = getStatusCfg(t)
  const status  = resolveStatus(booking)
  const cfg     = STATUS_CFG[status] || STATUS_CFG.waiting_payment
  const idx     = gi(booking.id)
  const [from, to] = GRADIENTS[idx]
  const Icon    = ICONS[idx]
  const isTour  = booking.service_type === 'tour'
  const isManualQuote = !!booking.is_manual_quote

  let dateStr = '—'
  if (booking.service_date) {
    try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
  }
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const route   = booking.pickup_place_name && booking.destination_place_name
    ? `${booking.pickup_place_name} → ${booking.destination_place_name}`
    : booking.pickup_place_name
    || (booking.origin_text && booking.destination_text ? `${booking.origin_text} → ${booking.destination_text}` : booking.origin_text)
    || null

  const serviceName = booking.service_name
    || (isTour ? t('checkout.tour') : t('checkout.transfer')) + ' · ' + booking.booking_code

  const targetTime = fmtAbsoluteTime(booking.quote_expires_at)

  return (
    <div onClick={() => onDetail?.(booking.id)} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-transform cursor-pointer">
      {/* ── Hero ── */}
      <div className="relative h-[120px]">
        {booking.cover_image_url ? (
          <img src={booking.cover_image_url} alt={serviceName} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${from} ${to} flex items-center justify-center`}>
            <Icon size={44} className="text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* type badge */}
        <div className="absolute top-3 left-3">
          <span className="flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            {isTour ? <Compass size={10} /> : <Car size={10} />}
            {isTour ? t('checkout.tour') : t('checkout.transfer')}
          </span>
        </div>

        {/* status badge */}
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
        </div>

        {/* name */}
        <p className="absolute bottom-3 left-3 right-3 text-white font-bold text-[16px] leading-tight drop-shadow truncate">
          {serviceName}
        </p>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pt-3 pb-4 space-y-3">
        {/* Date / Time / People */}
        <div className="flex items-center gap-4">
          {[
            { Icon: Calendar, label: t('checkout.date'),    val: dateStr },
            { Icon: Clock,    label: t('checkout.time'),    val: timeStr },
            { Icon: Users,    label: t('checkout.people'),  val: String(booking.people_count || '—') },
          ].map(({ Icon: I, label, val }) => (
            <div key={label} className="flex items-center gap-1.5">
              <I size={13} className="text-brand shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 leading-none">{label}</p>
                <p className="text-[12px] font-semibold text-gray-900 leading-none mt-0.5">{val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Route */}
        {route && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <MapPin size={12} className="text-brand shrink-0" />
            <p className="text-[12px] text-gray-600 truncate">{route}</p>
          </div>
        )}

        {/* Aguardando preço (translado personalizado, ainda sem total) */}
        {status === 'awaiting_price' && (
          <div aria-live="polite" className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2">
            <Hourglass size={13} className="text-amber-600 shrink-0 motion-reduce:animate-none animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-amber-800 font-medium">{t('bookings.awaitingPrice.title')}</p>
              {targetTime && (
                <p className="text-[11px] text-amber-700">
                  {t('bookings.awaitingPrice.respondsBy', { time: targetTime })}
                </p>
              )}
            </div>
            {booking.quote_expires_at && <Countdown target={booking.quote_expires_at} />}
          </div>
        )}

        {/* Preço recebido aguardando pagamento (translado personalizado) */}
        {isManualQuote && status === 'waiting_payment' && (
          <div aria-live="polite" className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
            <Banknote size={13} className="text-blue-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-blue-800 font-medium">{t('bookings.priceReceived.title')}</p>
              {targetTime && (
                <p className="text-[11px] text-blue-700">
                  {t('bookings.priceReceived.payBy', { time: targetTime })}
                </p>
              )}
              {booking.quote_notes && (
                <p className="text-[11px] text-blue-700 mt-0.5 italic">“{booking.quote_notes}”</p>
              )}
            </div>
            {booking.quote_expires_at && <Countdown target={booking.quote_expires_at} />}
          </div>
        )}

        {/* Expirada */}
        {status === 'expired' && (
          <div className="bg-gray-50 rounded-xl px-3 py-2">
            <p className="text-[12px] text-gray-500">{t('bookings.expiredMsg')}</p>
          </div>
        )}

        {/* Recusada */}
        {status === 'rejected' && (
          <div className="bg-red-50 rounded-xl px-3 py-2">
            <p className="text-[12px] text-red-600 font-medium">{t('bookings.rejectedMsg')}</p>
            {booking.cancel_reason && (
              <p className="text-[11px] text-red-500 mt-0.5">“{booking.cancel_reason}”</p>
            )}
          </div>
        )}

        {/* Total + actions */}
        <div className="flex items-center justify-between pt-0.5">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">
              {status === 'awaiting_price' ? t('bookings.priceToDefine')
                : ['waiting_payment', 'waiting_acceptance'].includes(status) ? t('bookings.total')
                : t('bookings.totalPaid')}
            </p>
            <p className="text-[15px] font-bold text-gray-900 leading-none mt-0.5">
              {status === 'awaiting_price' ? '—' : fmt(booking.total_amount)}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {status === 'expired' && (
              <button
                onClick={(e) => { e.stopPropagation(); onDetail?.(booking.id) }}
                className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 min-h-[44px] rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                {t('bookings.requestAgain')}
              </button>
            )}

            {status === 'waiting_payment' && (
              <button
                onClick={(e) => { e.stopPropagation(); onPay?.(booking) }}
                className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 min-h-[44px] rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                {t('bookings.payNow')}
              </button>
            )}

            {isManualQuote && status === 'waiting_payment' && (
              <button
                onClick={(e) => { e.stopPropagation(); onReject?.(booking) }}
                className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-[12px] font-semibold px-3 py-1.5 min-h-[44px] rounded-xl active:scale-95 transition-transform"
              >
                <X size={11} /> {t('bookings.reject.action')}
              </button>
            )}

            {['waiting_payment', 'waiting_acceptance', 'confirmed', 'awaiting_price'].includes(status) && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel?.(booking) }}
                className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-[12px] font-semibold px-3 py-1.5 min-h-[44px] rounded-xl active:scale-95 transition-transform"
              >
                <X size={11} /> {t('bookings.cancelBtnShort')}
              </button>
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────── */
export default function Bookings() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const { t }       = useTranslation()

  const TABS = [
    { id: 'todos',      label: t('bookings.all')       },
    { id: 'ativos',     label: t('bookings.active')    },
    { id: 'concluidos', label: t('bookings.completed') },
    { id: 'cancelados', label: t('bookings.cancelled') },
  ]

  const location = useLocation()
  const [tab,           setTab]           = useState('todos')
  const [showSearch,    setShowSearch]    = useState(!!location.state?.q)
  const [searchTerm,    setSearchTerm]    = useState(location.state?.q || '')
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError,   setCancelError]   = useState(null)
  const [rejectTarget,  setRejectTarget]  = useState(null)
  const [rejectLoading, setRejectLoading] = useState(false)
  const [rejectError,   setRejectError]   = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
    // Atualiza enquanto houver booking de translado personalizado aguardando
    // preço ou pagamento, para o cliente ver a resposta da cooperativa sem
    // precisar atualizar a tela manualmente.
    refetchInterval: (query) => {
      const list = Array.isArray(query.state.data?.data) ? query.state.data.data
        : Array.isArray(query.state.data) ? query.state.data : []
      const hasPending = list.some((b) => {
        const s = resolveStatus(b)
        return b.is_manual_quote && (s === 'awaiting_price' || s === 'waiting_payment')
      })
      return hasPending ? 12000 : false
    },
  })

  const all = (
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data) ? data : []
  ).map(b => ({ ...b, _status: resolveStatus(b) }))

  const q = searchTerm.trim().toLowerCase()
  const filtered = all.filter(b => {
    if (q) {
      const hay = `${b.booking_code || ''} ${b.service_name || ''} ${b.origin_text || ''} ${b.destination_text || ''} ${b.pickup_place_name || ''} ${b.destination_place_name || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (tab === 'ativos')     return ACTIVE_STATUSES.includes(b._status)
    if (tab === 'concluidos') return b._status === 'completed'
    if (tab === 'cancelados') return ['cancelled', 'rejected', 'expired'].includes(b._status)
    return true
  })

  const counts = {
    ativos:     all.filter(b => ACTIVE_STATUSES.includes(b._status)).length,
    concluidos: all.filter(b => b._status === 'completed').length,
    cancelados: all.filter(b => ['cancelled', 'rejected', 'expired'].includes(b._status)).length,
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      await api.cancelBooking(cancelTarget.id, { reason: 'Cancelado pelo cliente' })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      setCancelTarget(null)
    } catch (err) {
      setCancelError(err.message || t('bookings.cancelError'))
    } finally {
      setCancelLoading(false)
    }
  }

  // Recusar a proposta de preço de um translado personalizado:
  // POST /api/bookings/:id/reject grava status_commercial='rejected' de fato
  // (sem workaround via cancel — rota dedicada implementada pelo Eng. Senior).
  async function handleRejectConfirm(reason) {
    if (!rejectTarget) return
    setRejectLoading(true)
    setRejectError(null)
    try {
      await api.rejectBooking(rejectTarget.id, reason ? { reason } : {})
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      setRejectTarget(null)
    } catch (err) {
      setRejectError(err.message || t('bookings.cancelError'))
    } finally {
      setRejectLoading(false)
    }
  }

  function handlePay(booking) {
    let dateStr = '—'
    if (booking.service_date) {
      try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
    }
    navigate('/checkout/pagamento', {
      state: {
        service_name:        booking.service_name || `${booking.service_type === 'tour' ? t('checkout.tour') : t('checkout.transfer')} · ${booking.booking_code}`,
        service_type:        booking.service_type,
        booking_mode:        booking.booking_mode || 'private',
        service_date:        dateStr,
        service_date_iso:    booking.service_date,
        service_time:        booking.service_time,
        people_count:        booking.people_count,
        total_price:         booking.total_amount,
        origin_text:         booking.origin_text || booking.pickup_place_name || null,
        destination_text:    booking.destination_text || booking.destination_place_name || null,
        cover_image_url:     booking.cover_image_url || null,
        existing_booking_id: booking.id,
      },
    })
  }

  return (
    <div className="min-h-full bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white px-4 pt-5 pb-0 sticky top-0 lg:top-14 z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)] lg:max-w-5xl lg:mx-auto">
        <div className="relative flex items-center justify-center min-h-[32px] mb-1">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label={t('bookings.back')}
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">{t('bookings.title')}</h1>
          <div className="absolute right-0 flex items-center gap-1.5">
            <button
              onClick={() => { setShowSearch((s) => !s); if (showSearch) setSearchTerm('') }}
              className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-transform ${showSearch ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              <Search size={15} />
            </button>
          </div>
        </div>
        <p className="text-[12px] text-gray-400 text-center pb-2">
          {counts.ativos > 0
            ? t('bookings.activeCountLabel', { count: counts.ativos })
            : t('bookings.noActive')}
        </p>

        {showSearch && (
          <div className="mb-3 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('bookings.searchPlaceholder')}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-[13px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand focus:bg-white"
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((tb) => {
            const count  = tb.id !== 'todos' ? counts[tb.id] : null
            const active = tab === tb.id
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`relative shrink-0 flex-1 pb-3 px-1 text-[12px] font-semibold transition-colors ${active ? 'text-brand' : 'text-gray-400'}`}
              >
                {tb.label}
                {count > 0 && (
                  <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {count}
                  </span>
                )}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />}
              </button>
            )
          })}
        </div>
      </header>

      {/* List */}
      <main className="px-4 pt-4 space-y-3 lg:max-w-5xl lg:mx-auto">
        {isLoading ? (
          <div className="py-16"><PageSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <CalendarCheck size={28} className="text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-500 mb-1">
              {all.length === 0 ? t('bookings.empty') : t('bookings.emptyHere')}
            </p>
            <p className="text-[12px] text-gray-400">
              {all.length === 0 ? t('bookings.emptyHint') : t('bookings.emptyHereHint')}
            </p>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 space-y-3">
            {filtered.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={setCancelTarget}
                onReject={setRejectTarget}
                onDetail={(id) => navigate(`/minhas-reservas/${id}`)}
                onPay={handlePay}
              />
            ))}
          </div>
        )}
      </main>

      {cancelTarget && (
        <CancelDialog
          booking={cancelTarget}
          onConfirm={handleCancelConfirm}
          onClose={() => { setCancelTarget(null); setCancelError(null) }}
          loading={cancelLoading}
          error={cancelError}
        />
      )}

      {rejectTarget && (
        <RejectDialog
          booking={rejectTarget}
          onConfirm={handleRejectConfirm}
          onClose={() => { setRejectTarget(null); setRejectError(null) }}
          loading={rejectLoading}
          error={rejectError}
        />
      )}
    </div>
  )
}
