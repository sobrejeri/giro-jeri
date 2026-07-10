import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  Calendar, Clock, Users, Car, Search, Compass, MapPin,
  Star, RefreshCw, AlertTriangle, Loader2, Zap, Sun, Waves, Anchor,
  ChevronLeft, ChevronRight, CalendarCheck, Check, X, MessageSquare, Package,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Status helpers ─────────────────────────────────────────── */
function resolveStatus(b) {
  const c = b.status_commercial
  const o = b.status_operational
  if (c === 'cancelled' || o === 'cancelled') return 'cancelled'
  if (o === 'completed')                       return 'completed'
  if (o === 'in_progress')                     return 'in_progress'
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
    waiting_payment:    { label: t('bookings.status.waiting_payment'),    bg: 'bg-amber-500',  text: 'text-white' },
    waiting_acceptance: { label: t('bookings.status.waiting_acceptance'), bg: 'bg-orange-400', text: 'text-white' },
    confirmed:          { label: t('bookings.status.confirmed'),          bg: 'bg-green-500',  text: 'text-white' },
    in_progress:        { label: t('bookings.status.in_progress'),        bg: 'bg-blue-500',   text: 'text-white' },
    completed:          { label: t('bookings.status.completed'),          bg: 'bg-gray-500',   text: 'text-white' },
    cancelled:          { label: t('bookings.status.cancelled'),          bg: 'bg-red-500',    text: 'text-white' },
  }
}

const ACTIVE_STATUSES = ['waiting_payment', 'waiting_acceptance', 'confirmed', 'in_progress']
// Cotações "ativas" (entram nas abas Todas/Ativas junto das reservas)
const QUOTE_ACTIVE = ['pending_quote', 'quoted', 'accepted']

const GRADIENTS = [
  ['from-orange-400', 'to-amber-300'],
  ['from-sky-400',    'to-blue-300'],
  ['from-teal-400',   'to-emerald-300'],
  ['from-violet-400', 'to-purple-300'],
]
const ICONS = [Zap, Sun, Waves, Anchor]

function gi(id = '') { let n = 0; for (const c of id) n += c.charCodeAt(0); return n % GRADIENTS.length }
function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR')}` }

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
            className="flex-1 h-12 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
          >{t('bookings.cancelClose')}</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-12 bg-red-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />{t('bookings.cancelling')}</> : t('bookings.cancelBtn')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Booking Card ───────────────────────────────────────────── */
function BookingCard({ booking, onCancel, onDetail, onPay, groupSize = 0 }) {
  const { t } = useTranslation()
  const STATUS_CFG = getStatusCfg(t)
  const status  = resolveStatus(booking)
  const cfg     = STATUS_CFG[status] || STATUS_CFG.waiting_payment
  const idx     = gi(booking.id)
  const [from, to] = GRADIENTS[idx]
  const Icon    = ICONS[idx]
  const isTour  = booking.service_type === 'tour'

  let dateStr = '—'
  if (booking.service_date) {
    try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
  }
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const route   = booking.pickup_place_name && booking.destination_place_name
    ? `${booking.pickup_place_name} → ${booking.destination_place_name}`
    : booking.pickup_place_name || null

  const serviceName = booking.service_name
    || (isTour ? 'Passeio' : 'Transfer') + ' · ' + booking.booking_code

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
        {/* Selo de pedido (carrinho): deixa claro que faz parte de um grupo */}
        {groupSize >= 2 && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand bg-brand/5 rounded-lg px-2.5 py-1.5">
            <Package size={12} className="shrink-0" />
            Faz parte de um pedido com {groupSize} serviços — dá pra pagar todos juntos.
          </div>
        )}

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

        {/* Total + actions */}
        <div className="flex items-center justify-between pt-0.5">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">
              {['waiting_payment', 'waiting_acceptance'].includes(status) ? 'Total' : 'Total pago'}
            </p>
            <p className="text-[15px] font-bold text-gray-900 leading-none mt-0.5">{fmt(booking.total_amount)}</p>
          </div>

          <div className="flex items-center gap-2">
            {status === 'waiting_payment' && (
              <button
                onClick={(e) => { e.stopPropagation(); onPay?.(booking) }}
                className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                Pagar agora
              </button>
            )}
            {['waiting_payment', 'waiting_acceptance', 'confirmed'].includes(status) && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel?.(booking) }}
                className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
              >
                <X size={11} /> Cancelar
              </button>
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Quote status → badge (mesmo visual das reservas) ──────────── */
const QUOTE_BADGE = {
  pending_quote: { label: 'Aguardando preço',     bg: 'bg-amber-500', text: 'text-white', pulse: true  },
  quoted:        { label: 'Proposta recebida',    bg: 'bg-blue-500',  text: 'text-white', pulse: false },
  accepted:      { label: 'Aguardando pagamento', bg: 'bg-amber-500', text: 'text-white', pulse: false },
  paid:          { label: 'Paga',                 bg: 'bg-gray-500',  text: 'text-white', pulse: false },
  rejected:      { label: 'Recusada',             bg: 'bg-red-500',   text: 'text-white', pulse: false },
  cancelled:     { label: 'Cancelada',            bg: 'bg-red-500',   text: 'text-white', pulse: false },
  expired:       { label: 'Expirada',             bg: 'bg-gray-400',  text: 'text-white', pulse: false },
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(d + 'T12:00:00'), "d MMM", { locale: ptBR }) } catch { return d }
}

/* ── Quote Detail Dialog ────────────────────────────────────── */
function QuoteDetailDialog({ quote, onClose }) {
  const badge = QUOTE_BADGE[quote.status] || QUOTE_BADGE.pending_quote
  const rows = [
    ['Origem',      quote.origin_place_name],
    ['Destino',     quote.destination_place_name],
    ['Data',        fmtDate(quote.service_date)],
    ['Horário',     quote.service_time ? quote.service_time.slice(0, 5) : '—'],
    ['Passageiros', String(quote.people_count || 1)],
    ...(quote.quoted_price != null ? [['Valor', fmt(quote.quoted_price)]] : []),
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Car size={16} className="text-brand shrink-0" />
            <h3 className="font-bold text-gray-900 truncate">Translado personalizado</h3>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.bg} ${badge.text}`}>{badge.label}</span>
        </div>
        <div className="space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <span className="text-[12px] text-gray-400">{k}</span>
              <span className="text-[13px] font-semibold text-gray-800 text-right">{v || '—'}</span>
            </div>
          ))}
          {quote.quote_notes && (
            <div className="bg-gray-50 rounded-xl px-3 py-2 mt-1">
              <p className="text-[11px] text-gray-400 mb-0.5">Observação da cooperativa</p>
              <p className="text-[12px] text-gray-700">{quote.quote_notes}</p>
            </div>
          )}
        </div>
        <button onClick={onClose} className="w-full mt-5 h-11 bg-gray-100 text-gray-700 rounded-2xl text-sm font-bold active:scale-95 transition-transform">
          Fechar
        </button>
      </div>
    </div>
  )
}

/* ── Quote Card — mesmo formato das reservas (categoria "Translado") ── */
function QuoteCard({ quote, onAccept, onCancel, onPay, onDetail, acceptLoading, rejectLoading }) {
  const badge = QUOTE_BADGE[quote.status] || QUOTE_BADGE.pending_quote
  const idx   = gi(quote.id)
  const [from, to] = GRADIENTS[idx]

  const dateStr  = fmtDate(quote.service_date)
  const timeStr  = quote.service_time ? quote.service_time.slice(0, 5) : '—'
  const route    = `${quote.origin_place_name} → ${quote.destination_place_name}`
  const hasPrice = quote.quoted_price != null

  return (
    <div onClick={() => onDetail?.(quote)} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-transform cursor-pointer">
      {/* ── Hero ── */}
      <div className="relative h-[120px]">
        <div className={`w-full h-full bg-gradient-to-br ${from} ${to} flex items-center justify-center`}>
          <Car size={44} className="text-white/20" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* categoria */}
        <div className="absolute top-3 left-3">
          <span className="flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            <Car size={10} /> Translado personalizado
          </span>
        </div>

        {/* status */}
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${badge.bg} ${badge.text} ${badge.pulse ? 'animate-pulse' : ''}`}>
            {badge.label}
          </span>
        </div>

        {/* rota */}
        <p className="absolute bottom-3 left-3 right-3 text-white font-bold text-[16px] leading-tight drop-shadow truncate">
          {route}
        </p>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pt-3 pb-4 space-y-3">
        {/* Data / Horário / Pessoas */}
        <div className="flex items-center gap-4">
          {[
            { Icon: Calendar, label: 'Data',    val: dateStr },
            { Icon: Clock,    label: 'Horário', val: timeStr },
            { Icon: Users,    label: 'Pessoas', val: String(quote.people_count || '—') },
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

        {/* Observação da cooperativa */}
        {quote.status === 'quoted' && quote.quote_notes && (
          <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2">
            <MessageSquare size={12} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-gray-600">{quote.quote_notes}</p>
          </div>
        )}

        {/* Aguardando preço */}
        {quote.status === 'pending_quote' && (
          <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2">
            <Loader2 size={13} className="text-amber-500 shrink-0 animate-spin" />
            <p className="text-[12px] text-amber-700">Aguardando a cooperativa enviar o valor.</p>
          </div>
        )}

        {/* Cancelada / recusada / expirada */}
        {(quote.status === 'rejected' || quote.status === 'expired' || quote.status === 'cancelled') && (
          <p className="text-[12px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
            {quote.status === 'cancelled' ? 'Você cancelou esta solicitação.'
              : quote.status === 'rejected' ? 'Você recusou esta proposta.'
              : 'Esta cotação expirou.'}
          </p>
        )}

        {/* Total + ações (mesmo layout das reservas) */}
        <div className="flex items-center justify-between pt-0.5">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">
              {quote.status === 'accepted' ? 'Total a pagar' : 'Valor da corrida'}
            </p>
            <p className="text-[15px] font-bold text-gray-900 leading-none mt-0.5">
              {hasPrice ? fmt(quote.quoted_price) : 'A definir'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {quote.status === 'quoted' && (
              <button
                onClick={(e) => { e.stopPropagation(); onAccept?.(quote) }}
                disabled={acceptLoading}
                className="flex items-center gap-1 bg-emerald-500 text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60 shadow-sm"
              >
                {acceptLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aceitar
              </button>
            )}
            {quote.status === 'accepted' && (
              <button
                onClick={(e) => { e.stopPropagation(); onPay?.(quote) }}
                className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                Pagar agora
              </button>
            )}
            {['pending_quote', 'quoted', 'accepted'].includes(quote.status) && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel?.(quote) }}
                disabled={rejectLoading}
                className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60"
              >
                <X size={11} /> Cancelar
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
  const [quoteActing,   setQuoteActing]   = useState(null) // quote id being accepted/rejected
  const [quoteDetail,   setQuoteDetail]   = useState(null) // cotação aberta em "Detalhes"

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ['my-quotes'],
    queryFn:  () => api.getMyQuotes(),
    // Atualiza enquanto houver cotação aguardando preço/proposta, para o cliente
    // ver a oferta da cooperativa sem precisar atualizar a tela.
    refetchInterval: (query) => {
      const list = Array.isArray(query.state.data) ? query.state.data : []
      return list.some(qq => qq.status === 'pending_quote' || qq.status === 'quoted') ? 12000 : false
    },
  })

  const quotes = Array.isArray(quotesData) ? quotesData : []

  const all = (
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data) ? data : []
  ).map(b => ({ ...b, _status: resolveStatus(b) }))

  // Carrinho universal: reservas do mesmo grupo (order_group_id) prontas para
  // pagamento podem ser quitadas num pagamento único ("Pagar tudo").
  const payableGroups = (() => {
    const map = new Map()
    for (const b of all) {
      if (b._status === 'waiting_payment' && b.order_group_id) {
        if (!map.has(b.order_group_id)) map.set(b.order_group_id, [])
        map.get(b.order_group_id).push(b)
      }
    }
    return [...map.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .map(([gid, arr]) => ({ gid, bookings: arr, total: arr.reduce((s, b) => s + Number(b.total_amount || 0), 0) }))
  })()

  // Quantas reservas cada pedido (order_group_id) tem — para o selo de grupo.
  const groupSizes = (() => {
    const m = new Map()
    for (const b of all) if (b.order_group_id) m.set(b.order_group_id, (m.get(b.order_group_id) || 0) + 1)
    return m
  })()

  const q = searchTerm.trim().toLowerCase()
  const filtered = all.filter(b => {
    if (q) {
      const hay = `${b.booking_code || ''} ${b.service_name || ''} ${b.origin_text || ''} ${b.destination_text || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (tab === 'ativos')     return ACTIVE_STATUSES.includes(b._status)
    if (tab === 'concluidos') return b._status === 'completed'
    if (tab === 'cancelados') return b._status === 'cancelled'
    return true
  })

  const counts = {
    ativos:     all.filter(b => ACTIVE_STATUSES.includes(b._status)).length
                + quotes.filter(qq => QUOTE_ACTIVE.includes(qq.status)).length,
    concluidos: all.filter(b => b._status === 'completed').length,
    cancelados: all.filter(b => b._status === 'cancelled').length
                + quotes.filter(qq => ['cancelled', 'rejected', 'expired'].includes(qq.status)).length,
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
      setCancelError(err.message || 'Erro ao cancelar reserva')
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleAcceptQuote(quote) {
    setQuoteActing(quote.id)
    try {
      const result = await api.acceptQuote(quote.id)
      // A cotação aceita já criou a reserva (atribuída à cooperativa que cotou) —
      // paga direto via existing_booking_id, sem reentrar na fila de solicitação.
      navigate('/checkout/pagamento', {
        state: {
          service_name:        `${quote.origin_place_name} → ${quote.destination_place_name}`,
          service_type:        'transfer',
          booking_mode:        'private',
          service_date:        fmtDate(quote.service_date),
          service_date_iso:    quote.service_date,
          service_time:        quote.service_time,
          people_count:        quote.people_count,
          total_price:         result.quoted_price,
          origin_text:         quote.origin_place_name,
          destination_text:    quote.destination_place_name,
          existing_booking_id: result.booking_id,
        },
      })
    } catch (err) {
      alert(err.message || 'Erro ao aceitar cotação')
    } finally {
      setQuoteActing(null)
    }
  }

  async function handleRejectQuote(quoteId) {
    setQuoteActing(quoteId)
    try {
      await api.rejectQuote(quoteId, { rejection_reason: 'Recusado pelo cliente' })
      queryClient.invalidateQueries({ queryKey: ['my-quotes'] })
    } catch (err) {
      alert(err.message || 'Erro ao recusar cotação')
    } finally {
      setQuoteActing(null)
    }
  }

  async function handleCancelQuote(quote) {
    if (!confirm('Cancelar esta solicitação de translado personalizado?')) return
    setQuoteActing(quote.id)
    try {
      await api.cancelQuote(quote.id)
      queryClient.invalidateQueries({ queryKey: ['my-quotes'] })
    } catch (err) {
      alert(err.message || 'Erro ao cancelar a solicitação')
    } finally {
      setQuoteActing(null)
    }
  }

  function handlePay(booking) {
    let dateStr = '—'
    if (booking.service_date) {
      try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
    }
    navigate('/checkout/pagamento', {
      state: {
        service_name:        booking.service_name || `${booking.service_type === 'tour' ? 'Passeio' : 'Transfer'} · ${booking.booking_code}`,
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

  // Carrinho universal: paga TODAS as reservas prontas do grupo num pagamento só.
  function handlePayGroup(group) {
    navigate('/checkout/pagamento', {
      state: {
        service_name:   `${group.bookings.length} serviços`,
        service_type:   'tour',
        booking_mode:   'private',
        people_count:   group.bookings.reduce((s, b) => s + Number(b.people_count || 0), 0),
        total_price:    group.total,
        order_group_id: group.gid,
      },
    })
  }

  // Retoma o pagamento de uma cotação já aceita (sem reaceitar)
  function handlePayQuote(quote) {
    navigate('/checkout/pagamento', {
      state: {
        service_name:        `${quote.origin_place_name} → ${quote.destination_place_name}`,
        service_type:        'transfer',
        booking_mode:        'private',
        service_date:        fmtDate(quote.service_date),
        service_date_iso:    quote.service_date,
        service_time:        quote.service_time,
        people_count:        quote.people_count,
        total_price:         quote.quoted_price,
        origin_text:         quote.origin_place_name,
        destination_text:    quote.destination_place_name,
        existing_booking_id: quote.booking_id,
      },
    })
  }

  // Cotação que já virou reserva (booking com service_id = quote.id) não deve
  // duplicar nas abas de reservas.
  const bookedServiceIds = new Set(all.map(b => b.service_id).filter(Boolean))

  // Cotações que entram nas abas Todas/Ativas (a paga já vira reserva)
  const quotesForTab = (() => {
    if (tab === 'concluidos') return []
    let list = quotes.filter(qq => qq.status !== 'paid' && !bookedServiceIds.has(qq.id))
    if (tab === 'ativos')     list = list.filter(qq => QUOTE_ACTIVE.includes(qq.status))
    if (tab === 'cancelados') list = list.filter(qq => ['cancelled', 'rejected', 'expired'].includes(qq.status))
    if (q) list = list.filter(qq => `${qq.origin_place_name || ''} ${qq.destination_place_name || ''}`.toLowerCase().includes(q))
    return list
  })()

  // Lista unificada: reservas + cotações (cada uma com seu card/rótulo)
  const listItems = [
    ...filtered.map(b => ({ kind: 'booking', id: b.id, data: b, ts: b.created_at || b.service_date || '' })),
    ...quotesForTab.map(qq => ({ kind: 'quote', id: `q-${qq.id}`, data: qq, ts: qq.created_at || qq.service_date || '' })),
  ].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))

  return (
    <div className="min-h-full bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white px-4 pt-5 pb-0 sticky top-0 lg:top-14 z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)] lg:max-w-5xl lg:mx-auto">
        <div className="relative flex items-center justify-center min-h-[32px] mb-1">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Voltar"
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
            ? <><span className="font-semibold text-brand">{counts.ativos}</span> reserva{counts.ativos !== 1 ? 's' : ''} ativa{counts.ativos !== 1 ? 's' : ''}</>
            : 'Nenhuma reserva ativa'}
        </p>

        {showSearch && (
          <div className="mb-3 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, serviço ou local…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-[13px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand focus:bg-white"
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((t) => {
            const count  = t.id !== 'todos' ? counts[t.id] : null
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative shrink-0 flex-1 pb-3 px-1 text-[12px] font-semibold transition-colors ${active ? 'text-brand' : 'text-gray-400'}`}
              >
                {t.label}
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

      {/* Pagar tudo — grupos do carrinho universal prontos para pagamento */}
      {payableGroups.length > 0 && (tab === 'todos' || tab === 'ativos') && (
        <div className="px-4 pt-4 lg:max-w-5xl lg:mx-auto space-y-2">
          {payableGroups.map((g) => (
            <div key={g.gid} className="flex items-center justify-between gap-3 bg-brand/5 border border-brand/20 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-900">Pague suas {g.bookings.length} reservas juntas</p>
                <p className="text-[11px] text-gray-500">Aceitas e prontas — um único pagamento de {fmt(g.total)}.</p>
              </div>
              <button
                onClick={() => handlePayGroup(g)}
                className="shrink-0 bg-brand text-white text-[12px] font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                Pagar tudo
              </button>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      <main className="px-4 pt-4 space-y-3 lg:max-w-5xl lg:mx-auto">
        {(isLoading || quotesLoading) ? (
          <div className="py-16"><PageSpinner /></div>
        ) : listItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <CalendarCheck size={28} className="text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-500 mb-1">
              {all.length === 0 ? 'Nenhuma reserva ainda.' : 'Nenhuma reserva aqui.'}
            </p>
            <p className="text-[12px] text-gray-400">
              {all.length === 0 ? 'Faça sua primeira reserva de passeio ou transfer!' : 'Suas reservas aparecerão aqui.'}
            </p>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 space-y-3">
            {listItems.map((it) => it.kind === 'quote' ? (
              <QuoteCard
                key={it.id}
                quote={it.data}
                onAccept={handleAcceptQuote}
                onCancel={handleCancelQuote}
                onPay={handlePayQuote}
                onDetail={(qq) => setQuoteDetail(qq)}
                acceptLoading={quoteActing === it.data.id}
                rejectLoading={quoteActing === it.data.id}
              />
            ) : (
              <BookingCard
                key={it.id}
                booking={it.data}
                onCancel={setCancelTarget}
                onDetail={(id) => navigate(`/minhas-reservas/${id}`)}
                onPay={handlePay}
                groupSize={it.data.order_group_id ? (groupSizes.get(it.data.order_group_id) || 0) : 0}
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

      {quoteDetail && (
        <QuoteDetailDialog quote={quoteDetail} onClose={() => setQuoteDetail(null)} />
      )}
    </div>
  )
}
