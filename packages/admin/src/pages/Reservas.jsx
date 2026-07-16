import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Search, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'

const STATUS_LABELS = {
  draft:            'Rascunho',
  awaiting_payment: 'Ag. pagamento',
  paid:             'Pago',
  payment_failed:   'Pgto. falhou',
  cancelled:        'Cancelado',
  refunded:         'Reembolsado',
}

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Reservas() {
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [typeFilter, setType]     = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bookings', page, search, statusFilter, typeFilter, dateFrom, dateTo],
    queryFn: () => api.getAdminBookings({
      page,
      limit: 30,
      ...(search       ? { search }                : {}),
      ...(statusFilter ? { status: statusFilter }  : {}),
      ...(typeFilter   ? { service_type: typeFilter } : {}),
      ...(dateFrom     ? { date_from: dateFrom }   : {}),
      ...(dateTo       ? { date_to: dateTo }       : {}),
    }),
    keepPreviousData: true,
  })

  const bookings = data?.data || []
  const total    = data?.total || 0
  const pages    = Math.ceil(total / 30)

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          {/* Busca */}
          <div className="relative w-full lg:flex-1 lg:min-w-52">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar por código…"
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand"
            />
          </div>

          {/* Status + Tipo: 2 colunas no mobile, automático no desktop */}
          <div className="grid grid-cols-2 gap-3 lg:flex lg:gap-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="w-full lg:w-auto h-10 pl-3 pr-8 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
            >
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => { setType(e.target.value); setPage(1) }}
              className="w-full lg:w-auto h-10 pl-3 pr-8 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
            >
              <option value="">Todos os tipos</option>
              <option value="tour">Passeios</option>
              <option value="transfer">Transfers</option>
            </select>
          </div>

          {/* Período: nunca transborda — grid [1fr auto 1fr] no mobile */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <CalendarDays size={15} className="text-gray-500 flex-shrink-0" />
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 flex-1 lg:flex lg:flex-none">
              <input
                type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                className="w-full min-w-0 lg:w-40 h-10 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
              />
              <span className="text-gray-500 text-sm text-center px-0.5">até</span>
              <input
                type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                className="w-full min-w-0 lg:w-40 h-10 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          <span className="text-sm text-gray-500 lg:ml-auto lg:self-center">{total} reservas</span>
        </div>
      </Card>

      {/* Lista (cards no mobile) */}
      <Card>
        <div className="md:hidden divide-y divide-gray-800">
          {bookings.map((b) => (
            <div key={b.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-brand">{b.booking_code}</span>
                <Badge value={b.status_commercial} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-200 text-sm truncate">{b.users?.full_name || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{b.users?.phone || b.users?.email || '—'}</p>
                </div>
                <p className="font-semibold text-gray-200 text-sm shrink-0">{fmt(b.total_amount)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${b.service_type === 'tour' ? 'bg-blue-900/40 text-blue-400' : 'bg-purple-900/40 text-purple-400'}`}>
                  {b.service_type === 'tour' ? 'Passeio' : 'Transfer'}
                </span>
                <span>{b.people_count} pax</span>
                <span>· {b.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'}</span>
                <span className="ml-auto">
                  {b.service_date ? format(parseISO(b.service_date), 'dd/MM/yyyy') : '—'}
                  {b.service_time ? ` ${b.service_time.slice(0, 5)}` : ''}
                </span>
              </div>
            </div>
          ))}
          {bookings.length === 0 && (
            <p className="px-5 py-12 text-center text-gray-600 text-sm">Nenhuma reserva encontrada.</p>
          )}
        </div>

        {/* Tabela (desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Código</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Serviço</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Valor</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-gray-750 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs font-bold text-brand">{b.booking_code}</span>
                    <p className="text-xs text-gray-600 mt-0.5">{b.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-200 text-sm">{b.users?.full_name || '—'}</p>
                    <p className="text-xs text-gray-500">{b.users?.phone || b.users?.email || '—'}</p>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.service_type === 'tour' ? 'bg-blue-900/40 text-blue-400' : 'bg-purple-900/40 text-purple-400'}`}>
                      {b.service_type === 'tour' ? 'Passeio' : 'Transfer'}
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">{b.people_count} pax</p>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">
                    {b.service_date ? format(parseISO(b.service_date), 'dd/MM/yyyy') : '—'}
                    {b.service_time && <p className="text-gray-600">{b.service_time.slice(0, 5)}</p>}
                  </td>
                  <td className="px-5 py-3 font-semibold text-gray-200">{fmt(b.total_amount)}</td>
                  <td className="px-5 py-3">
                    <Badge value={b.status_commercial} />
                  </td>
                </tr>
              ))}
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-600 text-sm">
                    Nenhuma reserva encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-30"
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <span className="text-sm text-gray-500">Pág. {page} / {pages}</span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-30"
            >
              Próxima <ChevronRight size={15} />
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}
