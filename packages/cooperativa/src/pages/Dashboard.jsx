import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, RefreshCw, Search, SlidersHorizontal,
  Clock, Users, MapPin, Car, Phone, UserCheck, Pencil, FileText,
  MessageCircle, Send, Download, ShoppingBag, Hourglass, Loader2,
  CheckCircle2, TrendingUp, TrendingDown,
} from 'lucide-react'
import { api } from '../lib/api'
import { downloadOrderPDF, shareOrderPDF } from '../lib/orderPDF'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const TODAY = format(new Date(), 'yyyy-MM-dd')

// Ordem do pipeline + estilos de status
const STATUS = {
  new:               { label: 'Novo',         pct: 12,  dot: 'bg-blue-500',   chip: 'bg-blue-50 text-blue-600',     bar: '#3b82f6' },
  awaiting_dispatch: { label: 'Ag. Despacho', pct: 28,  dot: 'bg-amber-500',  chip: 'bg-amber-50 text-amber-600',   bar: '#f59e0b' },
  confirmed:         { label: 'Confirmado',   pct: 42,  dot: 'bg-teal-500',   chip: 'bg-teal-50 text-teal-600',     bar: '#14b8a6' },
  assigned:          { label: 'Atribuído',    pct: 58,  dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-600', bar: '#6366f1' },
  en_route:          { label: 'A Caminho',    pct: 72,  dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-600', bar: '#f97316' },
  in_progress:       { label: 'Em Andamento', pct: 88,  dot: 'bg-brand',      chip: 'bg-orange-50 text-orange-700', bar: '#ff6a00' },
  completed:         { label: 'Concluído',    pct: 100, dot: 'bg-green-500',  chip: 'bg-green-50 text-green-600',   bar: '#22c55e' },
  occurrence:        { label: 'Ocorrência',   pct: 100, dot: 'bg-red-500',    chip: 'bg-red-50 text-red-600',       bar: '#ef4444' },
  cancelled:         { label: 'Cancelado',    pct: 0,   dot: 'bg-gray-400',   chip: 'bg-gray-100 text-gray-500',    bar: '#9ca3af' },
}

const PENDING_SET    = ['new', 'awaiting_dispatch', 'confirmed']
const DISPATCHED_SET = ['assigned', 'en_route', 'in_progress']

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-600', 'bg-purple-100 text-purple-600',
  'bg-emerald-100 text-emerald-600', 'bg-orange-100 text-orange-600',
  'bg-pink-100 text-pink-600', 'bg-indigo-100 text-indigo-600',
  'bg-teal-100 text-teal-600',
]
function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// ── Anel de progresso (SVG) ────────────────────────────
function Ring({ pct, color }) {
  const r = 15, c = 2 * Math.PI * r
  const off = c - (Math.min(pct, 100) / 100) * c
  return (
    <svg width="46" height="46" viewBox="0 0 46 46" className="shrink-0">
      <circle cx="23" cy="23" r={r} fill="none" stroke="#eef0f3" strokeWidth="4" />
      <circle
        cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform="rotate(-90 23 23)" style={{ transition: 'stroke-dashoffset .5s ease' }}
      />
      <text x="23" y="23.5" textAnchor="middle" dominantBaseline="central"
        fontSize="10" fontWeight="700" fill={color}>{Math.round(pct)}%</text>
    </svg>
  )
}

// ── Card de estatística ────────────────────────────────
function StatCard({ icon: Icon, iconBg, value, label, pct, ringColor, trend }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon size={17} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[22px] font-black text-gray-900 leading-none">{value}</span>
              {trend != null && (
                <span className={`flex items-center gap-0.5 text-[10px] font-bold ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {Math.abs(trend)}%
                </span>
              )}
            </div>
            <p className="text-[12px] text-gray-400 font-medium mt-1 truncate">{label}</p>
          </div>
        </div>
      </div>
      <Ring pct={pct} color={ringColor} />
    </div>
  )
}

// ── Linha da tabela ────────────────────────────────────
function BookingRow({ b, onAssign, cooperativa }) {
  const st       = STATUS[b.status_operational] || STATUS.new
  const name     = b.users?.full_name || '—'
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
  const dateStr  = b.service_date
    ? format(new Date(b.service_date + 'T12:00:00'), 'dd MMM yyyy', { locale: ptBR }) : '—'
  const timeStr  = b.service_time ? b.service_time.slice(0, 5) : null
  const local    = b.pickup_place_name || b.origin_text
  const dispatched = DISPATCHED_SET.includes(b.status_operational) || b.status_operational === 'completed'
  const assign     = b.operational_assignments?.[0]
  const formForOS  = {
    real_vehicle_text: assign?.real_vehicle_text || b.booking_vehicles?.[0]?.vehicle_name_snapshot || '',
    driver_name:       assign?.driver_name    || '',
    dispatch_notes:    assign?.dispatch_notes || '',
    driver_phone:      assign?.driver_phone   || '',
  }

  return (
    <tr className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors group">
      {/* Cliente */}
      <td className="py-3 pl-5 pr-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 ${avatarColor(name)}`}>
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-900 truncate">{name}</p>
            <p className="text-[11px] text-gray-400 font-mono">{b.booking_code}</p>
          </div>
        </div>
      </td>

      {/* Status + progresso */}
      <td className="py-3 px-3 min-w-[150px]">
        <div className="space-y-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${st.pct}%`, backgroundColor: st.bar }} />
          </div>
        </div>
      </td>

      {/* Data */}
      <td className="py-3 px-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5 text-[12px] text-gray-600">
          <Clock size={12} className="text-gray-400" />
          <span>{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
        </div>
        {b.people_count && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-1">
            <Users size={11} />{b.people_count} pax
          </div>
        )}
      </td>

      {/* Serviço */}
      <td className="py-3 px-3">
        <div className="flex flex-wrap gap-1">
          <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
            b.service_type === 'tour' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
          }`}>
            {b.service_type === 'tour' ? 'Passeio' : 'Transfer'}
          </span>
          {local && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-gray-500 bg-gray-100 max-w-[140px]">
              <MapPin size={10} className="shrink-0" /><span className="truncate">{local}</span>
            </span>
          )}
        </div>
      </td>

      {/* Valor */}
      <td className="py-3 px-3 text-right whitespace-nowrap">
        <span className="text-[13px] font-extrabold text-gray-800">{fmt(b.total_amount)}</span>
      </td>

      {/* Ações */}
      <td className="py-3 pl-3 pr-5">
        <div className="flex items-center justify-end gap-1">
          {dispatched && (
            <button
              onClick={() => downloadOrderPDF(b, formForOS, cooperativa)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Baixar OS em PDF"
            >
              <FileText size={15} />
            </button>
          )}
          <button
            onClick={() => onAssign(b)}
            className={`flex items-center gap-1 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors ${
              dispatched
                ? 'text-gray-500 hover:bg-gray-100 border border-gray-200'
                : 'text-white bg-brand hover:bg-brand/90'
            }`}
            title={dispatched ? 'Editar despacho' : 'Despachar'}
          >
            {dispatched ? <Pencil size={12} /> : <UserCheck size={13} />}
            {dispatched ? 'Editar' : 'Despachar'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Card mobile (mesma info da linha da tabela) ────────
function BookingCardMobile({ b, onAssign, cooperativa }) {
  const st       = STATUS[b.status_operational] || STATUS.new
  const name     = b.users?.full_name || '—'
  const dateStr  = b.service_date
    ? format(new Date(b.service_date + 'T12:00:00'), 'dd MMM', { locale: ptBR }) : '—'
  const timeStr  = b.service_time ? b.service_time.slice(0, 5) : null
  const local    = b.pickup_place_name || b.origin_text
  const dispatched = DISPATCHED_SET.includes(b.status_operational) || b.status_operational === 'completed'
  const assign     = b.operational_assignments?.[0]
  const formForOS  = {
    real_vehicle_text: assign?.real_vehicle_text || b.booking_vehicles?.[0]?.vehicle_name_snapshot || '',
    driver_name:       assign?.driver_name    || '',
    dispatch_notes:    assign?.dispatch_notes || '',
    driver_phone:      assign?.driver_phone   || '',
  }

  return (
    <div className="p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 truncate">{name}</p>
          <p className="text-[11px] text-gray-400 font-mono">{b.booking_code}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
        <span className={`px-2 py-0.5 rounded-md font-semibold ${
          b.service_type === 'tour' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {b.service_type === 'tour' ? 'Passeio' : 'Transfer'}
        </span>
        <span className="flex items-center gap-1"><Clock size={11} className="text-gray-400" />{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
        {b.people_count && <span className="flex items-center gap-1"><Users size={11} />{b.people_count} pax</span>}
        {local && (
          <span className="flex items-center gap-1 max-w-full"><MapPin size={10} className="shrink-0" /><span className="truncate">{local}</span></span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[13px] font-extrabold text-gray-800">{fmt(b.total_amount)}</span>
        <div className="flex items-center gap-1.5">
          {dispatched && (
            <button
              onClick={() => downloadOrderPDF(b, formForOS, cooperativa)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Baixar OS em PDF"
            >
              <FileText size={15} />
            </button>
          )}
          <button
            onClick={() => onAssign(b)}
            className={`flex items-center gap-1 text-[12px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors ${
              dispatched
                ? 'text-gray-500 hover:bg-gray-100 border border-gray-200'
                : 'text-white bg-brand hover:bg-brand/90'
            }`}
          >
            {dispatched ? <Pencil size={12} /> : <UserCheck size={13} />}
            {dispatched ? 'Editar' : 'Despachar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const PER_PAGE = 8

// ── Página principal ───────────────────────────────────
export default function Dashboard() {
  const [date, setDate]        = useState('all')
  const [serviceType, setType] = useState('')
  const [tab, setTab]          = useState('all')
  const [search, setSearch]    = useState('')
  const [page, setPage]        = useState(1)

  const [assignModal, setAssign]           = useState(null)
  const [dispatchedBooking, setDispatched] = useState(null)
  const [savedForm, setSavedForm]          = useState(null)
  const [form, setForm]                    = useState({ real_vehicle_text: '', driver_name: '', dispatch_notes: '', driver_phone: '' })

  const qc = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey:        ['operational', date, serviceType],
    queryFn:         () => api.getOperational({
      ...(date !== 'all' ? { date } : {}),
      ...(serviceType ? { service_type: serviceType } : {}),
    }),
    refetchInterval: 15_000,
  })

  const { data: profile } = useQuery({
    queryKey: ['operator-profile'],
    queryFn:  () => api.getProfile(),
    staleTime: 5 * 60_000,
  })

  const cooperativa = profile ? {
    full_name:         profile.full_name,
    document_type:     profile.document_type,
    document_number:   profile.document_number,
    phone:             profile.phone,
    address:           profile.address,
    cep:               profile.cep,
    profile_photo_url: profile.profile_photo_url,
  } : null

  const assignMut = useMutation({
    mutationFn: ({ id, ...body }) => api.assignBooking(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['operational'] })
      setSavedForm({ ...form })
      setDispatched(assignModal)
      setAssign(null)
      setForm({ real_vehicle_text: '', driver_name: '', dispatch_notes: '', driver_phone: '' })
    },
  })

  function closeDispatch() {
    setDispatched(null)
    setSavedForm(null)
  }

  const columns  = data?.columns || {}
  const allBooks = useMemo(() => Object.values(columns).flat(), [columns])

  // Stats
  const cNew       = columns['new']?.length || 0
  const cAwaiting  = columns['awaiting_dispatch']?.length || 0
  const cConfirmed = columns['confirmed']?.length || 0
  const cActive    = (columns['assigned']?.length || 0) + (columns['en_route']?.length || 0) + (columns['in_progress']?.length || 0)
  const cDone      = columns['completed']?.length || 0
  const total      = allBooks.length || 1
  const revenue    = allBooks.reduce((s, b) => s + Number(b.total_amount || 0), 0)

  const stats = [
    { icon: ShoppingBag, iconBg: 'bg-blue-500',   value: cNew + cAwaiting + cConfirmed, label: 'Novas / aguardando', pct: ((cNew + cAwaiting + cConfirmed) / total) * 100, ringColor: '#3b82f6' },
    { icon: Hourglass,   iconBg: 'bg-amber-500',  value: cAwaiting,                      label: 'Aguardando despacho', pct: (cAwaiting / total) * 100, ringColor: '#f59e0b' },
    { icon: Loader2,     iconBg: 'bg-brand',      value: cActive,                        label: 'Em andamento',        pct: (cActive / total) * 100,   ringColor: '#ff6a00' },
    { icon: CheckCircle2,iconBg: 'bg-green-500',  value: cDone,                          label: 'Concluídas',          pct: (cDone / total) * 100,     ringColor: '#22c55e' },
  ]

  // Filtro de aba + busca
  const filtered = useMemo(() => {
    let list = allBooks
    if (tab === 'pending')    list = list.filter((b) => PENDING_SET.includes(b.status_operational))
    if (tab === 'dispatched') list = list.filter((b) => DISPATCHED_SET.includes(b.status_operational))
    if (tab === 'done')       list = list.filter((b) => b.status_operational === 'completed')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((b) =>
        (b.users?.full_name || '').toLowerCase().includes(q) ||
        (b.booking_code || '').toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => {
      const da = `${a.service_date || '9999'} ${a.service_time || '99'}`
      const db = `${b.service_date || '9999'} ${b.service_time || '99'}`
      return da.localeCompare(db)
    })
  }, [allBooks, tab, search])

  const pageCount  = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage   = Math.min(page, pageCount)
  const pageItems  = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  const TABS = [
    { key: 'all',        label: 'Todas',       count: allBooks.length },
    { key: 'pending',    label: 'Pendentes',   count: cNew + cAwaiting + cConfirmed },
    { key: 'dispatched', label: 'Despachadas', count: cActive },
    { key: 'done',       label: 'Concluídas',  count: cDone },
  ]

  function changeDate(days) {
    const base = date === 'all' ? TODAY : date
    const d    = new Date(base + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setDate(format(d, 'yyyy-MM-dd'))
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">

      {/* ── Toolbar de data ─────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-2">
        <button
          onClick={() => setDate('all')}
          className={`h-9 px-3 rounded-lg text-sm font-semibold border transition-colors ${
            date === 'all' ? 'bg-brand text-white border-brand shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50 bg-white'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setDate(TODAY)}
          className={`h-9 px-3 rounded-lg text-sm font-semibold border transition-colors ${
            date === TODAY ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'border-gray-200 text-gray-500 hover:bg-gray-50 bg-white'
          }`}
        >
          Hoje
        </button>
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
          <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-50 text-gray-500"><ChevronLeft size={15} /></button>
          <input
            type="date"
            value={date === 'all' ? TODAY : date}
            onChange={(e) => setDate(e.target.value)}
            className={`px-2 text-sm font-medium bg-transparent focus:outline-none ${date === 'all' ? 'text-gray-300' : 'text-gray-700'}`}
          />
          <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-50 text-gray-500"><ChevronRight size={15} /></button>
        </div>
        <select
          value={serviceType}
          onChange={(e) => setType(e.target.value)}
          className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:border-brand"
        >
          <option value="">Todos os tipos</option>
          <option value="tour">Passeios</option>
          <option value="transfer">Transfers</option>
        </select>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['operational'] })}
          className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
          title="Atualizar"
        >
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Cards de estatística ────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── Tabela de reservas ──────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header da tabela */}
        <div className="px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              Movimentação de reservas
              <span className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {allBooks.length} reservas
              </span>
            </h2>
            <p className="text-[13px] text-gray-400 mt-0.5">
              Acompanhe e despache os serviços · {fmt(revenue)} em receita
            </p>
          </div>
          {isFetching && !isLoading && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Atualizando…
            </span>
          )}
        </div>

        {/* Abas + busca */}
        <div className="px-5 pb-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 max-w-full overflow-x-auto scrollbar-hide">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setPage(1) }}
                className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                  tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`text-[10px] px-1.5 rounded-full ${tab === t.key ? 'bg-brand/10 text-brand' : 'bg-gray-200 text-gray-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 border border-gray-200 rounded-lg px-3 h-9 bg-white focus-within:border-brand sm:min-w-[200px]">
            <Search size={15} className="text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Buscar cliente ou código…"
              className="flex-1 text-sm text-gray-700 bg-transparent outline-none placeholder-gray-400"
            />
          </div>
        </div>

        {/* Cards (mobile) */}
        <div className="md:hidden divide-y divide-gray-100">
          {pageItems.map((b) => (
            <BookingCardMobile key={b.id} b={b} onAssign={setAssign} cooperativa={cooperativa} />
          ))}
          {pageItems.length === 0 && (
            <div className="py-16 text-center">
              <CheckCircle2 size={36} className="mx-auto text-gray-200 mb-2" />
              <p className="text-gray-400 text-sm">Nenhuma reserva nesta visão.</p>
            </div>
          )}
        </div>

        {/* Tabela (desktop) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                <th className="text-left py-2 pl-5 pr-3 font-bold">Cliente</th>
                <th className="text-left py-2 px-3 font-bold">Status</th>
                <th className="text-left py-2 px-3 font-bold">Data</th>
                <th className="text-left py-2 px-3 font-bold">Serviço</th>
                <th className="text-right py-2 px-3 font-bold">Valor</th>
                <th className="text-right py-2 pl-3 pr-5 font-bold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((b) => <BookingRow key={b.id} b={b} onAssign={setAssign} cooperativa={cooperativa} />)}
            </tbody>
          </table>

          {pageItems.length === 0 && (
            <div className="py-16 text-center">
              <CheckCircle2 size={36} className="mx-auto text-gray-200 mb-2" />
              <p className="text-gray-400 text-sm">Nenhuma reserva nesta visão.</p>
            </div>
          )}
        </div>

        {/* Paginação */}
        {filtered.length > PER_PAGE && (
          <div className="px-5 py-3 flex items-center justify-between border-t border-gray-50">
            <span className="text-[13px] text-gray-400">Página {safePage} de {pageCount}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 text-[13px] font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={safePage >= pageCount}
                className="px-3 py-1.5 text-[13px] font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Ordem de Serviço (pós-despacho) ──────── */}
      <Modal open={!!dispatchedBooking} onClose={closeDispatch} title="Ordem de Serviço gerada" size="sm">
        {dispatchedBooking && savedForm && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <FileText size={18} className="text-green-600" />
              </div>
              <div>
                <p className="font-bold text-green-800 text-sm">Despacho confirmado!</p>
                <p className="text-green-600 text-xs mt-0.5">
                  OS Nº {dispatchedBooking.booking_code} · {dispatchedBooking.users?.full_name}
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-500 text-center">Como deseja compartilhar a Ordem de Serviço?</p>

            <button
              onClick={() => downloadOrderPDF(dispatchedBooking, savedForm, cooperativa)}
              className="w-full flex items-center gap-3 p-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors text-left"
            >
              <div className="w-9 h-9 bg-gray-200 rounded-lg flex items-center justify-center shrink-0">
                <Download size={16} className="text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Baixar PDF</p>
                <p className="text-xs text-gray-400">Salvar OS-{dispatchedBooking.booking_code}.pdf</p>
              </div>
            </button>

            <button
              onClick={() => shareOrderPDF(dispatchedBooking, savedForm, 'driver', cooperativa)}
              disabled={!savedForm.driver_phone}
              className={`w-full flex items-center gap-3 p-3.5 border rounded-xl transition-colors text-left ${
                savedForm.driver_phone ? 'bg-green-50 hover:bg-green-100 border-green-200' : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <MessageCircle size={16} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Enviar ao Motorista</p>
                <p className="text-xs text-green-600">
                  {savedForm.driver_phone ? `WhatsApp ${savedForm.driver_phone}` : 'Informe o WhatsApp do motorista no despacho'}
                </p>
              </div>
            </button>

            <button
              onClick={() => shareOrderPDF(dispatchedBooking, savedForm, 'client', cooperativa)}
              disabled={!dispatchedBooking.users?.phone}
              className={`w-full flex items-center gap-3 p-3.5 border rounded-xl transition-colors text-left ${
                dispatchedBooking.users?.phone ? 'bg-green-50 hover:bg-green-100 border-green-200' : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <MessageCircle size={16} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Enviar ao Cliente</p>
                <p className="text-xs text-green-600">
                  {dispatchedBooking.users?.phone ? `WhatsApp ${dispatchedBooking.users.phone}` : 'Cliente sem telefone cadastrado'}
                </p>
              </div>
            </button>

            <button onClick={closeDispatch} className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
              Fechar
            </button>
          </div>
        )}
      </Modal>

      {/* ── Modal de despacho ──────────────────────────── */}
      <Modal
        open={!!assignModal}
        onClose={() => { setAssign(null); setForm({ real_vehicle_text: '', driver_name: '', dispatch_notes: '', driver_phone: '' }) }}
        title={`Despachar — ${assignModal?.booking_code || ''}`}
        size="md"
      >
        {assignModal && (
          <>
            <div className="mb-5 rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-200">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Resumo do serviço</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  assignModal.service_type === 'tour' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {assignModal.service_type === 'tour' ? 'Passeio' : 'Transfer'}
                </span>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Cliente</span>
                  <span className="font-semibold text-gray-900">{assignModal.users?.full_name || '—'}</span>
                </div>
                {assignModal.users?.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Tel. cliente</span>
                    <a href={`https://wa.me/${(() => { const d = assignModal.users.phone.replace(/\D/g,''); return d.length <= 11 ? '55' + d : d })()}`}
                       target="_blank" rel="noreferrer"
                       className="font-medium text-green-600 hover:underline flex items-center gap-1">
                      <MessageCircle size={12} />{assignModal.users.phone}
                    </a>
                  </div>
                )}
                {assignModal.service_date && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Data</span>
                    <span className="font-medium text-gray-800">
                      {format(new Date(assignModal.service_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                      {assignModal.service_time ? ` às ${assignModal.service_time.slice(0, 5)}` : ''}
                    </span>
                  </div>
                )}
                {assignModal.people_count && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Pessoas</span>
                    <span className="font-medium text-gray-800">{assignModal.people_count} pessoas</span>
                  </div>
                )}
                {(assignModal.pickup_place_name || assignModal.origin_text) && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-500 shrink-0">Embarque</span>
                    <span className="font-medium text-gray-800 text-right line-clamp-1">
                      {assignModal.pickup_place_name || assignModal.origin_text}
                    </span>
                  </div>
                )}
                {(assignModal.destination_place_name || assignModal.destination_text) && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-gray-500 shrink-0">Destino</span>
                    <span className="font-medium text-gray-800 text-right line-clamp-1">
                      {assignModal.destination_place_name || assignModal.destination_text}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100 mt-1">
                  <span className="text-gray-500">Valor</span>
                  <span className="font-extrabold text-brand text-base">{fmt(assignModal.total_amount)}</span>
                </div>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                assignMut.mutate({ id: assignModal.id, ...form })
              }}
              className="space-y-4"
            >
              <Input
                label="Veículo (modelo / placa / cor)"
                placeholder="Ex: Hilux Branca · GKR-1234"
                value={form.real_vehicle_text}
                onChange={(e) => setForm({ ...form, real_vehicle_text: e.target.value })}
              />
              <Input
                label="Nome do motorista"
                placeholder="Ex: João da Silva"
                value={form.driver_name}
                onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp do motorista</label>
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand bg-white">
                  <MessageCircle size={15} className="text-green-500 shrink-0" />
                  <input
                    type="tel"
                    placeholder="(88) 99999-9999"
                    value={form.driver_phone}
                    onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
                    className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400"
                  />
                </div>
                {form.driver_phone && (
                  <p className="text-[11px] text-green-600 mt-1 flex items-center gap-1">
                    <Send size={10} /> Mensagem será enviada pelo WhatsApp
                  </p>
                )}
              </div>

              <Textarea
                label="Observações para o motorista"
                rows={2}
                placeholder="Instruções especiais, ponto de referência…"
                value={form.dispatch_notes}
                onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })}
              />

              <Button
                type="submit"
                className={`w-full flex items-center justify-center gap-2 ${form.driver_phone ? 'bg-green-600 hover:bg-green-700' : ''}`}
                disabled={assignMut.isPending}
              >
                {form.driver_phone
                  ? <><MessageCircle size={15} />{assignMut.isPending ? 'Despachando…' : 'Despachar e enviar WhatsApp'}</>
                  : <>{assignMut.isPending ? 'Despachando…' : 'Confirmar Despacho'}</>
                }
              </Button>
            </form>
          </>
        )}
      </Modal>
    </div>
  )
}
