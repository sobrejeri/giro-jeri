import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  Calendar, Clock, Users, Car, Search, Compass, MapPin,
  Star, RefreshCw, AlertTriangle, Loader2, Zap, Sun, Waves, Anchor,
  ChevronRight, CalendarCheck, Check, X, MessageSquare,
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
  if (o === 'assigned')                        return 'confirmed'
  if (c === 'paid')                            return 'waiting_acceptance'
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
function BookingCard({ booking, onCancel, onDetail, onPay }) {
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
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-transform">
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

        {/* Total + actions */}
        <div className="flex items-center justify-between pt-0.5">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">Total pago</p>
            <p className="text-[15px] font-bold text-gray-900 leading-none mt-0.5">{fmt(booking.total_amount)}</p>
          </div>

          <div className="flex items-center gap-2">
            {status === 'waiting_payment' && (
              <button
                onClick={() => onPay?.(booking)}
                className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                Pagar agora
              </button>
            )}
            {['waiting_payment', 'waiting_acceptance', 'confirmed'].includes(status) && (
              <button
                onClick={() => onCancel?.(booking)}
                className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
              >
                <X size={11} /> Cancelar
              </button>
            )}
            <button
              onClick={() => onDetail(booking.id)}
              className="flex items-center gap-1 bg-gray-100 text-gray-600 text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
            >
              <ChevronRight size={13} /> Detalhes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Quote status helpers ───────────────────────────────────── */
const QUOTE_STATUS = {
  pending_quote: { label: 'Aguardando cotação', bg: 'bg-amber-400',  text: 'text-white', pulse: true  },
  quoted:        { label: 'Proposta recebida',  bg: 'bg-blue-500',   text: 'text-white', pulse: false },
  accepted:      { label: 'Aceita',             bg: 'bg-emerald-500',text: 'text-white', pulse: false },
  paid:          { label: 'Paga',               bg: 'bg-gray-500',   text: 'text-white', pulse: false },
  rejected:      { label: 'Recusada',           bg: 'bg-red-400',    text: 'text-white', pulse: false },
  expired:       { label: 'Expirada',           bg: 'bg-gray-300',   text: 'text-gray-600', pulse: false },
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(d + 'T12:00:00'), "d MMM", { locale: ptBR }) } catch { return d }
}

/* ── Quote Card ─────────────────────────────────────────────── */
function QuoteCard({ quote, onAccept, onReject, acceptLoading, rejectLoading }) {
  const cfg = QUOTE_STATUS[quote.status] || QUOTE_STATUS.pending_quote

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-400 to-purple-300 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car size={14} className="text-white/90" />
            <span className="text-white font-bold text-[12px]">Corrida personalizada</span>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text} ${cfg.pulse ? 'animate-pulse' : ''}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-white font-bold text-[15px] mt-1 leading-tight truncate">
          {quote.origin_place_name} → {quote.destination_place_name}
        </p>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 pb-4 space-y-3">
        <div className="flex items-center gap-4">
          {[
            { Icon: Calendar, val: fmtDate(quote.service_date) },
            { Icon: Clock,    val: quote.service_time ? quote.service_time.slice(0,5) : '—' },
            { Icon: Users,    val: `${quote.people_count || 1}` },
          ].map(({ Icon, val }) => (
            <div key={val} className="flex items-center gap-1.5">
              <Icon size={13} className="text-brand shrink-0" />
              <p className="text-[12px] font-semibold text-gray-800">{val}</p>
            </div>
          ))}
        </div>

        {quote.status === 'pending_quote' && (
          <p className="text-[12px] text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
            Aguardando a cooperativa enviar o valor da corrida...
          </p>
        )}

        {quote.status === 'quoted' && (
          <div className="space-y-3">
            <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-blue-400">Proposta recebida</p>
                <p className="text-[20px] font-extrabold text-gray-900">
                  R$ {Number(quote.quoted_price).toLocaleString('pt-BR')}
                </p>
              </div>
              {quote.quote_notes && (
                <div className="flex items-start gap-1.5 max-w-[160px]">
                  <MessageSquare size={12} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-500 leading-snug">{quote.quote_notes}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onReject(quote.id)}
                disabled={rejectLoading}
                className="flex-1 h-11 border-2 border-red-200 text-red-500 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
              >
                <X size={14} /> Recusar
              </button>
              <button
                onClick={() => onAccept(quote)}
                disabled={acceptLoading}
                className="flex-[2] h-11 bg-emerald-500 text-white rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60 shadow-sm"
              >
                {acceptLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Aceitar e pagar
              </button>
            </div>
          </div>
        )}

        {quote.status === 'accepted' && (
          <p className="text-[12px] text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
            Cotação aceita! Aguardando confirmação do pagamento.
          </p>
        )}

        {quote.status === 'paid' && (
          <p className="text-[12px] text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
            Corrida confirmada e paga. Motorista a caminho!
          </p>
        )}

        {(quote.status === 'rejected' || quote.status === 'expired') && (
          <p className="text-[12px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
            {quote.status === 'rejected' ? 'Você recusou esta proposta.' : 'Esta cotação expirou.'}
          </p>
        )}
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
    { id: 'cotacoes',   label: 'Cotações'              },
  ]

  const [tab,           setTab]           = useState('todos')
  const [showSearch,    setShowSearch]    = useState(false)
  const [searchTerm,    setSearchTerm]    = useState('')
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError,   setCancelError]   = useState(null)
  const [quoteActing,   setQuoteActing]   = useState(null) // quote id being accepted/rejected

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ['my-quotes'],
    queryFn:  () => api.getMyQuotes(),
    refetchInterval: tab === 'cotacoes' ? 10000 : false,
  })

  const all = (
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data) ? data : []
  ).map(b => ({ ...b, _status: resolveStatus(b) }))

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
    ativos:     all.filter(b => ACTIVE_STATUSES.includes(b._status)).length,
    concluidos: all.filter(b => b._status === 'completed').length,
    cancelados: all.filter(b => b._status === 'cancelled').length,
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
      // Navigate to payment with quote_id as service_id
      navigate('/checkout/pagamento', {
        state: {
          service_name:     `Corrida personalizada: ${quote.origin_place_name} → ${quote.destination_place_name}`,
          service_type:     'transfer',
          booking_mode:     'private',
          service_date:     fmtDate(quote.service_date),
          service_date_iso: quote.service_date,
          service_time:     quote.service_time,
          people_count:     quote.people_count,
          total_price:      result.quoted_price,
          origin_text:      quote.origin_place_name,
          destination_text: quote.destination_place_name,
          service_id:       result.quote_id,
          quote_id:         result.quote_id,
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

  const quotes = Array.isArray(quotesData) ? quotesData : []
  const pendingQuotesCount = quotes.filter(q => q.status === 'quoted').length

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

  return (
    <div className="min-h-full bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white px-4 pt-5 pb-0 sticky top-0 md:top-14 z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)] md:max-w-2xl md:mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[20px] font-extrabold text-gray-900">{t('bookings.title')}</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {counts.ativos > 0
                ? <><span className="font-semibold text-brand">{counts.ativos}</span> reserva{counts.ativos !== 1 ? 's' : ''} ativa{counts.ativos !== 1 ? 's' : ''}</>
                : 'Nenhuma reserva ativa'}
            </p>
          </div>
          <button
            onClick={() => { setShowSearch((s) => !s); if (showSearch) setSearchTerm('') }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-transform ${showSearch ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
          >
            <Search size={16} />
          </button>
        </div>

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
            const count  = t.id === 'cotacoes' ? pendingQuotesCount : (t.id !== 'todos' ? counts[t.id] : null)
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

      {/* List */}
      <main className="px-4 pt-4 space-y-3 md:max-w-2xl md:mx-auto">
        {tab === 'cotacoes' ? (
          quotesLoading ? (
            <div className="py-16"><PageSpinner /></div>
          ) : quotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Car size={28} className="text-gray-300" />
              </div>
              <p className="text-[14px] font-semibold text-gray-500 mb-1">Nenhuma cotação ainda.</p>
              <p className="text-[12px] text-gray-400">Solicite uma corrida personalizada na tela de Transfers.</p>
            </div>
          ) : (
            quotes.map(q => (
              <QuoteCard
                key={q.id}
                quote={q}
                onAccept={handleAcceptQuote}
                onReject={handleRejectQuote}
                acceptLoading={quoteActing === q.id}
                rejectLoading={quoteActing === q.id}
              />
            ))
          )
        ) : isLoading ? (
          <div className="py-16"><PageSpinner /></div>
        ) : filtered.length === 0 ? (
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
          filtered.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              onCancel={setCancelTarget}
              onDetail={(id) => navigate(`/minhas-reservas/${id}`)}
              onPay={handlePay}
            />
          ))
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
    </div>
  )
}
