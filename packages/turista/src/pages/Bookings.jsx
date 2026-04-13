import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  CalendarCheck, Clock, Users, Car, Search, Compass, MapPin,
  CheckCircle, XCircle, AlertCircle, Navigation, Eye,
  Star, RefreshCw, AlertTriangle, Loader2, Zap, Sun, Waves, Anchor,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Resolve dual API statuses → single combined status
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

const STATUS_CONFIG = {
  waiting_payment:    { label: 'Aguard. Pagamento',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   dot: 'bg-amber-500',  icon: AlertCircle  },
  waiting_acceptance: { label: 'Aguard. Confirmação', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     dot: 'bg-blue-500',   icon: Loader2      },
  confirmed:          { label: 'Confirmado',           color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   dot: 'bg-green-500',  icon: CheckCircle  },
  in_progress:        { label: 'Em andamento',         color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200',     dot: 'bg-teal-500',   icon: Navigation   },
  completed:          { label: 'Concluído',            color: 'text-gray-600',   bg: 'bg-gray-100 border-gray-200',    dot: 'bg-gray-400',   icon: CheckCircle  },
  cancelled:          { label: 'Cancelado',            color: 'text-red-600',    bg: 'bg-red-50 border-red-200',       dot: 'bg-red-500',    icon: XCircle      },
}

const ACTIVE_STATUSES = ['waiting_payment', 'waiting_acceptance', 'confirmed', 'in_progress']

const FILTER_TABS = [
  { id: 'todos',      label: 'Todos'     },
  { id: 'ativos',     label: 'Ativos'    },
  { id: 'concluidos', label: 'Concluídos'},
  { id: 'cancelados', label: 'Cancelados'},
]

const GRADIENTS = [
  'from-orange-100 to-amber-100',
  'from-sky-100 to-blue-100',
  'from-emerald-100 to-teal-100',
  'from-purple-100 to-violet-100',
]
const TOUR_ICONS = [Zap, Sun, Waves, Anchor]

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }

function gradientIdx(id) {
  let n = 0
  for (let i = 0; i < (id?.length || 0); i++) n += id.charCodeAt(i)
  return n % GRADIENTS.length
}

// ── Cancel Dialog ────────────────────────────────────────────────
function CancelDialog({ booking, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg text-center mb-2">Cancelar reserva?</h3>
        <p className="text-sm text-gray-500 text-center mb-1">
          Reserva <span className="font-semibold text-gray-700">{booking.booking_code}</span>
        </p>
        <p className="text-xs text-gray-400 text-center mb-6">
          Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 h-12 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
          >
            Voltar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-12 bg-red-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />Cancelando…</> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Booking Card ─────────────────────────────────────────────────
function BookingCard({ booking, onCancel, onDetail }) {
  const [expanded, setExpanded] = useState(false)

  const status    = resolveStatus(booking)
  const cfg       = STATUS_CONFIG[status] || STATUS_CONFIG.waiting_payment
  const StatusIcon = cfg.icon
  const gi        = gradientIdx(booking.id)
  const Icon      = TOUR_ICONS[gi]
  const isTour    = booking.service_type === 'tour'
  const canCancel = !['cancelled', 'completed', 'refunded'].includes(booking.status_commercial)

  let dateStr = '—'
  if (booking.service_date) {
    try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
  }
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const route = (booking.origin_text && booking.destination_text)
    ? `${booking.origin_text} → ${booking.destination_text}`
    : (booking.origin_text || null)

  const vehicleName = booking.booking_vehicles?.[0]?.vehicle?.name

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
      {/* Image area */}
      <div className="relative h-[100px]">
        <div className={`w-full h-full bg-gradient-to-br ${GRADIENTS[gi]} flex items-center justify-center`}>
          <Icon size={40} className="text-brand/15" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Type badge — top left */}
        <div className="absolute top-3 left-3">
          <span className="flex items-center gap-1 bg-white/90 backdrop-blur-sm text-gray-700 text-[10px] font-bold px-2 py-1 rounded-full">
            {isTour
              ? <Compass size={11} className="text-brand" />
              : <Car size={11} className="text-slate-600" />
            }
            {isTour ? 'Passeio' : 'Transfer'}
          </span>
        </div>

        {/* Status badge — top right */}
        <div className="absolute top-3 right-3">
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${ACTIVE_STATUSES.includes(status) ? 'animate-pulse' : ''}`} />
            {cfg.label}
          </span>
        </div>

        {/* Service name — bottom */}
        <div className="absolute bottom-2.5 left-3 right-3">
          <p className="text-white font-bold text-sm leading-tight drop-shadow-sm truncate">
            {isTour ? 'Passeio' : 'Transfer'} — {booking.booking_code}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* 3-col info */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { icon: CalendarCheck, label: 'Data',    value: dateStr },
            { icon: Clock,         label: 'Hora',    value: timeStr },
            { icon: Users,         label: 'Pessoas', value: `${booking.people_count || '—'}` },
          ].map(({ icon: I, label, value }) => (
            <div key={label} className="flex items-center gap-1.5">
              <I size={13} className="text-brand shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 leading-none">{label}</p>
                <p className="text-xs font-semibold text-gray-900 mt-0.5 leading-none">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Route */}
        {route && (
          <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-gray-50 rounded-xl">
            <MapPin size={13} className="text-brand shrink-0" />
            <p className="text-xs text-gray-600 leading-tight truncate">{route}</p>
          </div>
        )}

        {/* Expandable details */}
        <div className={`overflow-hidden transition-all duration-200 ${expanded ? 'max-h-24 mb-3' : 'max-h-0'}`}>
          <div className="space-y-1.5 pt-1">
            {vehicleName && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Car size={12} className="text-gray-400" />
                <span>Veículo: <span className="font-semibold text-gray-800">{vehicleName}</span></span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="text-gray-400">Código:</span>
              <span className="font-mono font-medium">{booking.booking_code}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="text-gray-400">Total:</span>
              <span className="font-semibold text-gray-800">{fmt(booking.total_price)}</span>
            </div>
          </div>
        </div>

        {/* Price + actions */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">Total</p>
            <p className="text-base font-bold text-gray-900 leading-none mt-0.5">{fmt(booking.total_price)}</p>
          </div>

          <div className="flex items-center gap-1.5">
            {status === 'completed' && (
              <button className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 text-yellow-700 px-2.5 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform">
                <Star size={11} /> Avaliar
              </button>
            )}
            {status === 'cancelled' && (
              <button className="flex items-center gap-1 bg-orange-50 border border-orange-200 text-brand px-2.5 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform">
                <RefreshCw size={11} /> Reagendar
              </button>
            )}
            {status === 'waiting_payment' && (
              <button className="flex items-center gap-1 bg-brand text-white px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-sm active:scale-95 transition-transform">
                Pagar agora
              </button>
            )}
            {canCancel && !['waiting_payment', 'completed', 'cancelled'].includes(status) && (
              <button
                onClick={() => onCancel(booking)}
                className="flex items-center gap-1 border border-gray-200 text-gray-500 px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:border-red-200 hover:text-red-500 transition-colors active:scale-95"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={() => onDetail(booking.id)}
              className="flex items-center gap-1 bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
            >
              <Eye size={11} /> Detalhes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────
export default function Bookings() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()

  const [activeTab,     setActiveTab]     = useState('todos')
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const all = (data?.bookings || data || []).map(b => ({ ...b, _status: resolveStatus(b) }))

  const filtered = all.filter(b => {
    if (activeTab === 'ativos')     return ACTIVE_STATUSES.includes(b._status)
    if (activeTab === 'concluidos') return b._status === 'completed'
    if (activeTab === 'cancelados') return b._status === 'cancelled'
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
    <div className="min-h-full bg-[#F8F8F8]">
      {/* Header */}
      <header className="bg-white px-4 pt-4 md:pt-6 pb-0 sticky top-0 md:top-14 z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Minhas Reservas</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {counts.ativos > 0
                  ? <><span className="font-semibold text-brand">{counts.ativos}</span> reserva{counts.ativos > 1 ? 's' : ''} ativa{counts.ativos > 1 ? 's' : ''}</>
                  : 'Nenhuma reserva ativa'
                }
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
              <Search size={18} />
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex">
            {FILTER_TABS.map((tab) => {
              const count = tab.id !== 'todos' ? counts[tab.id] : null
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 pb-3 text-xs font-semibold transition-colors ${isActive ? 'text-brand' : 'text-gray-400'}`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'}`}>
                      {count}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* List */}
      <main className="px-4 py-4 max-w-4xl mx-auto">
        {isLoading ? (
          <div className="py-16"><PageSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <CalendarCheck size={30} className="text-gray-300" />
            </div>
            <p className="text-sm font-semibold text-gray-500 mb-1">
              {all.length === 0 ? 'Você ainda não tem reservas.' : 'Nenhuma reserva encontrada.'}
            </p>
            <p className="text-xs text-gray-400">
              {all.length === 0 ? 'Faça sua primeira reserva de passeio ou transfer!' : 'Suas reservas aparecerão aqui.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 lg:grid-cols-3">
            {filtered.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={setCancelTarget}
                onDetail={(id) => navigate(`/minhas-reservas/${id}`)}
              />
            ))}
          </div>
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
