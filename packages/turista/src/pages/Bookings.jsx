import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import { Calendar, Clock, Users, ArrowRight, PackageX } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const STATUS_COMMERCIAL = {
  draft:            { label: 'Rascunho',        color: 'bg-gray-100 text-gray-600' },
  awaiting_payment: { label: 'Ag. Pagamento',   color: 'bg-amber-100 text-amber-700' },
  paid:             { label: 'Pago',             color: 'bg-green-100 text-green-700' },
  payment_failed:   { label: 'Pagto. Falhou',   color: 'bg-red-100 text-red-600' },
  cancelled:        { label: 'Cancelado',        color: 'bg-gray-100 text-gray-500' },
  refunded:         { label: 'Reembolsado',      color: 'bg-indigo-100 text-indigo-600' },
}

const STATUS_OPERATIONAL = {
  new:               { label: 'Novo',            color: 'bg-blue-100 text-blue-700' },
  awaiting_dispatch: { label: 'Ag. Despacho',    color: 'bg-yellow-100 text-yellow-700' },
  confirmed:         { label: 'Confirmado',       color: 'bg-teal-100 text-teal-700' },
  assigned:          { label: 'Atribuído',        color: 'bg-purple-100 text-purple-700' },
  en_route:          { label: 'A Caminho',        color: 'bg-orange-100 text-orange-700' },
  in_progress:       { label: 'Em Andamento',     color: 'bg-brand/10 text-brand' },
  completed:         { label: 'Concluído',        color: 'bg-green-100 text-green-700' },
  cancelled:         { label: 'Cancelado',        color: 'bg-red-100 text-red-500' },
}

function BookingCard({ booking }) {
  const commercial  = STATUS_COMMERCIAL[booking.status_commercial]  || { label: booking.status_commercial, color: 'bg-gray-100 text-gray-600' }
  const operational = STATUS_OPERATIONAL[booking.status_operational] || null

  const serviceDate = booking.service_date
    ? format(new Date(booking.service_date), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : '—'

  return (
    <Link to={`/minhas-reservas/${booking.id}`}>
      <Card className="p-5 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-xs font-mono text-gray-400">{booking.booking_code}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${commercial.color}`}>
                {commercial.label}
              </span>
              {operational && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${operational.color}`}>
                  {operational.label}
                </span>
              )}
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">
              {booking.service_type === 'tour' ? 'Passeio' : 'Transfer'}
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {serviceDate}
              </span>
              {booking.service_time && (
                <span className="flex items-center gap-1.5">
                  <Clock size={13} />
                  {booking.service_time.slice(0, 5)}
                </span>
              )}
              {booking.people_count && (
                <span className="flex items-center gap-1.5">
                  <Users size={13} />
                  {booking.people_count} pax
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-gray-900">
              R$ {Number(booking.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <ArrowRight size={16} className="text-gray-300 ml-auto mt-2" />
          </div>
        </div>
      </Card>
    </Link>
  )
}

export default function Bookings() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const bookings = data?.bookings || data || []

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl text-gray-900 mb-1">Minhas Reservas</h1>
        <p className="text-gray-500">Histórico de passeios e transfers reservados</p>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : bookings.length === 0 ? (
        <div className="text-center py-20">
          <PackageX size={48} className="mx-auto mb-4 text-gray-200" />
          <p className="text-gray-500 mb-4">Você ainda não tem reservas.</p>
          <Link
            to="/passeios"
            className="inline-flex items-center gap-2 h-10 px-5 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand-600 transition-colors"
          >
            Explorar passeios
            <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  )
}
