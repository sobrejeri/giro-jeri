import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  Calendar, Clock, Users, Car, Search, Compass, MapPin,
  Star, RefreshCw, AlertTriangle, Loader2, Zap, Sun, Waves, Anchor,
  ChevronRight, CalendarCheck,
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
function CancelDialog({ booking, onConfirm, onClose, loading }) {
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
        <p className="text-xs text-gray-400 text-center mb-6">{t('bookings.cancelConfirm')}</p>
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
function BookingCard({ booking, onCancel, onDetail }) {
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
  const route   = booking.origin_text && booking.destination_text
    ? `${booking.origin_text} → ${booking.destination_text}`
    : booking.origin_text || null

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
            <p className="text-[15px] font-bold text-gray-900 leading-none mt-0.5">{fmt(booking.total_price)}</p>
          </div>

          <div className="flex items-center gap-2">
            {status === 'waiting_payment' && (
              <button className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20">
                Pagar agora
              </button>
            )}
            {status === 'completed' && (
              <button className="flex items-center gap-1 border border-yellow-200 bg-yellow-50 text-yellow-700 text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform">
                <Star size={11} /> Avaliar
              </button>
            )}
            {status === 'cancelled' && (
              <button className="flex items-center gap-1 border border-orange-200 bg-orange-50 text-brand text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform">
                <RefreshCw size={11} /> Reagendar
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

/* ── Main Page ──────────────────────────────────────────────── */
export default function Bookings() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const { t }       = useTranslation()

  const TABS = [
    { id: 'todos',      label: t('bookings.all')     },
    { id: 'ativos',     label: t('bookings.active')  },
    { id: 'concluidos', label: t('bookings.status.completed') },
    { id: 'cancelados', label: t('bookings.status.cancelled') },
  ]

  const [tab,           setTab]           = useState('todos')
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const all = (
    Array.isArray(data?.bookings) ? data.bookings :
    Array.isArray(data) ? data : []
  ).map(b => ({ ...b, _status: resolveStatus(b) }))

  const filtered = all.filter(b => {
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
    try {
      await api.cancelBooking(cancelTarget.id, { reason: 'Cancelado pelo cliente' })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      setCancelTarget(null)
    } catch (err) {
      alert(err.message || 'Erro ao cancelar reserva')
    } finally {
      setCancelLoading(false)
    }
  }

  return (
    <div className="min-h-full bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white px-4 pt-5 pb-0 sticky top-0 z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[20px] font-extrabold text-gray-900">{t('bookings.title')}</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              {counts.ativos > 0
                ? <><span className="font-semibold text-brand">{counts.ativos}</span> reserva{counts.ativos !== 1 ? 's' : ''} ativa{counts.ativos !== 1 ? 's' : ''}</>
                : 'Nenhuma reserva ativa'}
            </p>
          </div>
          <button className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 transition-transform">
            <Search size={16} className="text-gray-600" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex">
          {TABS.map((t) => {
            const count  = t.id !== 'todos' ? counts[t.id] : null
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex-1 pb-3 text-[12px] font-semibold transition-colors ${active ? 'text-brand' : 'text-gray-400'}`}
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
      <main className="px-4 pt-4 space-y-3">
        {isLoading ? (
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
            />
          ))
        )}
      </main>

      {cancelTarget && (
        <CancelDialog
          booking={cancelTarget}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelTarget(null)}
          loading={cancelLoading}
        />
      )}
    </div>
  )
}
