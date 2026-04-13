import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  PackageX, Search, Calendar, Clock, Users, ChevronRight, Filter,
  Zap, Waves, Sun, Anchor, X, AlertTriangle, Loader2,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_COMMERCIAL = {
  draft:            { label: 'Rascunho',      color: 'bg-gray-100 text-gray-500' },
  awaiting_payment: { label: 'Ag. Pagamento', color: 'bg-amber-100 text-amber-700' },
  paid:             { label: 'Pago',          color: 'bg-green-100 text-green-700' },
  payment_failed:   { label: 'Falhou',        color: 'bg-red-100 text-red-500' },
  cancelled:        { label: 'Cancelado',     color: 'bg-gray-100 text-gray-500' },
  refunded:         { label: 'Reembolsado',   color: 'bg-indigo-100 text-indigo-600' },
}

const STATUS_OPERATIONAL = {
  completed:   { label: 'Concluído',    color: 'bg-brand text-white' },
  cancelled:   { label: 'Cancelado',   color: 'bg-gray-200 text-gray-500' },
  in_progress: { label: 'Em andamento', color: 'bg-green-100 text-green-700' },
  assigned:    { label: 'Atribuído',   color: 'bg-purple-100 text-purple-700' },
  new:         { label: 'Novo',        color: 'bg-blue-100 text-blue-700' },
}

const TOUR_ICONS = [Zap, Sun, Waves, Anchor]

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR')}` }

// ── Cancel Confirm Dialog ────────────────────────────────────────
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
          Esta ação não pode ser desfeita. Verifique a política de cancelamento antes de prosseguir.
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
function BookingCard({ booking, idx, onCancel, onDetail }) {
  const commercial  = STATUS_COMMERCIAL[booking.status_commercial]   || { label: booking.status_commercial, color: 'bg-gray-100 text-gray-500' }
  const operational = STATUS_OPERATIONAL[booking.status_operational] || null
  const Icon = TOUR_ICONS[idx % TOUR_ICONS.length]
  const canCancel = !['cancelled', 'refunded'].includes(booking.status_commercial)

  let dateStr = '—'
  if (booking.service_date) {
    try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d 'de' MMMM", { locale: ptBR }) } catch {}
  }

  const badge = operational || commercial

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
      <div className="h-36 bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center relative">
        <Icon size={48} className="text-brand/15" />
        <div className="absolute top-3 right-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.color}`}>{badge.label}</span>
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="bg-black/40 text-white text-xs font-medium px-2 py-1 rounded-lg backdrop-blur-sm">
            {booking.service_type === 'tour' ? 'Passeio' : 'Transfer'}
          </span>
        </div>
      </div>

      <div className="p-4 bg-white">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="font-semibold text-gray-900 text-sm line-clamp-1">
              {booking.service_type === 'tour' ? 'Passeio' : 'Transfer'} — {booking.booking_code}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1"><Calendar size={11} /> {dateStr}</span>
              {booking.service_time && (
                <span className="flex items-center gap-1"><Clock size={11} /> {booking.service_time.slice(0,5)}</span>
              )}
              {booking.people_count && (
                <span className="flex items-center gap-1"><Users size={11} /> {booking.people_count} pax</span>
              )}
            </div>
          </div>
          <p className="font-bold text-gray-900 text-base shrink-0">{fmt(booking.total_price)}</p>
        </div>

        <div className="flex items-center gap-2">
          {canCancel && (
            <button
              onClick={() => onCancel(booking)}
              className="flex-1 h-9 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors active:scale-95"
            >
              Cancelar
            </button>
          )}
          <button
            onClick={() => onDetail(booking.id)}
            className="flex-1 h-9 bg-brand/10 text-brand rounded-xl text-sm font-semibold hover:bg-brand/20 transition-colors flex items-center justify-center gap-1 active:scale-95"
          >
            Ver detalhes <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status filters ───────────────────────────────────────────────
const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'paid',             label: 'Pago' },
  { value: 'awaiting_payment', label: 'Ag. Pagamento' },
  { value: 'cancelled',        label: 'Cancelado' },
]

// ── Main Page ────────────────────────────────────────────────────
export default function Bookings() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()

  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('')
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const all      = data?.bookings || data || []
  const filtered = all.filter(b => {
    const matchStatus = !statusFilter || b.status_commercial === statusFilter
    const matchSearch = !search || b.booking_code?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

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
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="sticky top-0 md:top-14 z-10 bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center justify-between">
        <h1 className="font-bold text-gray-900 text-base">Minhas Reservas</h1>
        <Filter size={18} className="text-gray-500" />
      </div>

      <div className="md:max-w-4xl md:mx-auto md:w-full md:px-6 md:py-6">
        {/* Search + Filter */}
        <div className="px-4 md:px-0 pt-4 pb-3 space-y-2">
          <div className="flex items-center gap-2.5 h-11 px-3.5 bg-gray-50 rounded-xl border border-gray-100">
            <Search size={15} className="text-gray-400 shrink-0" />
            <input
              className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
              placeholder="Buscar por código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')}><X size={14} className="text-gray-400" /></button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold transition-colors active:scale-95 ${
                  statusFilter === value ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 px-4 md:px-0 pb-4">
          {isLoading ? (
            <PageSpinner />
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <PackageX size={48} className="mx-auto mb-4 text-gray-200" />
              <p className="text-gray-500 text-sm mb-1">
                {all.length === 0 ? 'Você ainda não tem reservas.' : 'Nenhuma reserva encontrada.'}
              </p>
              {all.length === 0 && (
                <p className="text-xs text-gray-400">Faça sua primeira reserva de passeio ou transfer!</p>
              )}
            </div>
          ) : (
            <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0 lg:grid-cols-3">
              {filtered.map((b, i) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  idx={i}
                  onCancel={setCancelTarget}
                  onDetail={(id) => navigate(`/minhas-reservas/${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancel confirm dialog */}
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
