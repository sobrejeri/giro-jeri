import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Search, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Input from '../components/ui/Input'

// Na ordem do ciclo de vida da reserva, não alfabética: é assim que a fila é
// lida. `awaiting_acceptance` entrou no enum na migration 035 e nunca chegou
// aqui — o filtro simplesmente não oferecia a fila de aceite.
const STATUS_LABELS = {
  awaiting_acceptance: 'Ag. aceite',
  draft:            'Rascunho',
  awaiting_payment: 'Ag. pagamento',
  paid:             'Pago',
  payment_failed:   'Pgto. falhou',
  cancelled:        'Cancelado',
  refunded:         'Reembolsado',
}

// `sempre: true` = aparece mesmo zerada. Ver "0 aguardando aceite" é uma
// informação útil; uma aba de "Reembolsado" vazia é só ruído.
const ABAS_STATUS = [
  { id: '',                    label: 'Todas',         sempre: true },
  { id: 'awaiting_acceptance', label: 'Ag. aceite',    sempre: true },
  { id: 'awaiting_payment',    label: 'Ag. pagamento', sempre: true },
  { id: 'paid',                label: 'Pagas',         sempre: true },
  { id: 'cancelled',           label: 'Canceladas' },
  { id: 'payment_failed',      label: 'Pgto. falhou' },
  { id: 'refunded',            label: 'Reembolsadas' },
  { id: 'draft',               label: 'Rascunho' },
]

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Reservas() {
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('')
  const [typeFilter, setType]     = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  // Uma requisição por tecla fazia respostas chegarem fora de ordem e repintar
  // a lista com o resultado de uma busca anterior. Espera a pausa.
  const [buscaAplicada, setBuscaAplicada] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery({
    queryKey: ['admin-bookings', page, buscaAplicada, statusFilter, typeFilter, dateFrom, dateTo],
    queryFn: () => api.getAdminBookings({
      page,
      limit: 30,
      ...(buscaAplicada ? { search: buscaAplicada } : {}),
      ...(statusFilter ? { status: statusFilter }  : {}),
      ...(typeFilter   ? { service_type: typeFilter } : {}),
      ...(dateFrom     ? { date_from: dateFrom }   : {}),
      ...(dateTo       ? { date_to: dateTo }       : {}),
    }),
    keepPreviousData: true,
  })

  const bookings = data?.data || []
  const total    = data?.total || 0
  const counts   = data?.counts || {}
  const pages    = Math.ceil(total / 30)

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="p-4">
        {/* Abas por status. Os três primeiros aparecem sempre — são a operação
            do dia: o que espera aceite, o que espera pagamento e o que já
            entrou. Os demais só quando existem, para a barra não encher de
            abas zeradas. */}
        <div className="flex flex-wrap gap-1 mb-3 bg-gray-900/60 p-1 rounded-xl w-fit">
          {ABAS_STATUS
            .filter(({ id, sempre }) => sempre || id === '' || (counts[id] || 0) > 0 || statusFilter === id)
            .map(({ id, label }) => {
              const n = id === '' ? counts.todos : counts[id]
              const ativa = statusFilter === id
              return (
                <button
                  key={id || 'todos'}
                  onClick={() => { setStatus(id); setPage(1) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    ativa ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {label}
                  <span className={`text-[11px] tabular-nums px-1.5 py-px rounded ${
                    ativa ? 'bg-gray-900 text-gray-300' : 'bg-gray-800 text-gray-600'
                  }`}>
                    {n ?? '—'}
                  </span>
                </button>
              )
            })}
        </div>

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
              value={typeFilter}
              onChange={(e) => { setType(e.target.value); setPage(1) }}
              className="w-full lg:w-auto h-10 pl-3 pr-8 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
            >
              <option value="">Todos os tipos</option>
              <option value="tour">Passeios</option>
              <option value="transfer">Transfers</option>
            </select>
          </div>

          {/* Período — no mobile as duas datas EMPILHAM (cada uma na sua linha,
              largura total, com rótulo De/Até). O iOS Safari não encolhe
              <input type=date> lado a lado nem com min-w-0, então uma data por
              linha é a única forma garantida de não transbordar. No desktop
              (lg) volta a ficar inline, com "até" no meio. */}
          <div className="w-full lg:w-auto grid grid-cols-1 gap-2 lg:flex lg:items-center lg:gap-2">
            <CalendarDays size={15} className="hidden lg:block text-gray-500 flex-shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 w-7 shrink-0 lg:hidden">De</span>
              <input
                type="date" value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                className="flex-1 min-w-0 lg:w-40 lg:flex-none h-10 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
              />
            </div>
            <span className="hidden lg:inline text-gray-500 text-sm">até</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 w-7 shrink-0 lg:hidden">Até</span>
              <input
                type="date" value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                className="flex-1 min-w-0 lg:w-40 lg:flex-none h-10 px-3 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-300 focus:outline-none focus:border-brand"
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
                {b.combo && (
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">
                    Combo {b.combo_total}
                  </span>
                )}
                {b.category_name && <span className="text-gray-400">{b.category_name}</span>}
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.service_type === 'tour' ? 'bg-blue-900/40 text-blue-400' : 'bg-purple-900/40 text-purple-400'}`}>
                        {b.service_type === 'tour' ? 'Passeio' : 'Transfer'}
                      </span>
                      {/* COMBO = reserva criada junto com outras no mesmo
                          carrinho. Muda a operação: cancelar ou remarcar uma
                          mexe no pedido inteiro do cliente. */}
                      {b.combo ? (
                        <span
                          className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400"
                          title={`Pedido combinado — ${b.combo_total} serviços comprados juntos`}
                        >
                          Combo {b.combo_total}
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                          Solo
                        </span>
                      )}
                      {b.modal && b.modal !== 'terrestre' && (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 capitalize">
                          {b.modal}
                        </span>
                      )}
                    </div>
                    {b.service_name && (
                      <p className="text-xs text-gray-300 mt-1 max-w-56 truncate" title={b.service_name}>
                        {b.service_name}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">
                      {b.category_name ? `${b.category_name} · ` : ''}{b.people_count} pax
                    </p>
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
