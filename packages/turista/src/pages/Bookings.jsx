import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { PackageX, Search, Calendar, Clock, Users, ChevronRight, Filter, Zap, Waves, Sun, Anchor } from 'lucide-react'
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
  completed:   { label: 'Concluído',     color: 'bg-brand text-white' },
  cancelled:   { label: 'Cancelado',     color: 'bg-gray-200 text-gray-500' },
  in_progress: { label: 'Em andamento',  color: 'bg-green-100 text-green-700' },
  assigned:    { label: 'Atribuído',     color: 'bg-purple-100 text-purple-700' },
  new:         { label: 'Novo',          color: 'bg-blue-100 text-blue-700' },
}

const TOUR_ICONS = [Zap, Sun, Waves, Anchor]

function BookingCard({ booking, idx }) {
  const commercial  = STATUS_COMMERCIAL[booking.status_commercial]   || { label: booking.status_commercial, color: 'bg-gray-100 text-gray-500' }
  const operational = STATUS_OPERATIONAL[booking.status_operational] || null

  const Icon = TOUR_ICONS[idx % TOUR_ICONS.length]

  let dateStr = '—'
  if (booking.service_date) {
    try {
      dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d 'de' MMMM", { locale: ptBR })
    } catch {}
  }

  const badge = operational || commercial

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
      {/* Image area */}
      <div className="h-36 bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center relative">
        <Icon size={48} className="text-brand/15" />
        <div className="absolute top-3 right-3">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="bg-black/40 text-white text-xs font-medium px-2 py-1 rounded-lg backdrop-blur-sm">
            {booking.service_type === 'tour' ? 'Passeio' : 'Transfer'}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 bg-white">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="font-semibold text-gray-900 text-sm line-clamp-1">
              {booking.service_type === 'tour' ? 'Passeio' : 'Transfer'} — {booking.booking_code}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Calendar size={11} /> {dateStr}
              </span>
              {booking.service_time && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {booking.service_time.slice(0, 5)}
                </span>
              )}
              {booking.people_count && (
                <span className="flex items-center gap-1">
                  <Users size={11} /> {booking.people_count} pax
                </span>
              )}
            </div>
          </div>
          <p className="font-bold text-gray-900 text-base shrink-0">
            R$ {Number(booking.total_price).toLocaleString('pt-BR')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {booking.status_commercial !== 'cancelled' && (
            <button className="flex-1 h-9 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          )}
          <button className="flex-1 h-9 bg-brand/10 text-brand rounded-xl text-sm font-semibold hover:bg-brand/20 transition-colors flex items-center justify-center gap-1">
            Ver detalhes <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'paid', label: 'Pago' },
  { value: 'awaiting_payment', label: 'Ag. Pagamento' },
  { value: 'cancelled', label: 'Cancelado' },
]

export default function Bookings() {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const all = data?.bookings || data || []
  const filtered = all.filter((b) => {
    const matchStatus = !statusFilter || b.status_commercial === statusFilter
    const matchSearch = !search || b.booking_code?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

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
              placeholder="Buscar reserva..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-0.5">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold transition-colors ${
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
                <BookingCard key={b.id} booking={b} idx={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
