import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, RefreshCw, Clock, Users, Car, MapPin,
  UserCheck, Phone, TrendingUp, CalendarDays, AlertCircle, CheckCircle2,
  Loader2, MessageCircle, Send, Download, FileText,
} from 'lucide-react'
import { api } from '../lib/api'
import { downloadOrderPDF, shareOrderPDF } from '../lib/orderPDF'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'

const COLUMNS = [
  { key: 'new',               label: 'Novo',           dot: 'bg-blue-500',   bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700'   },
  { key: 'awaiting_dispatch', label: 'Ag. Despacho',   dot: 'bg-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700'  },
  { key: 'confirmed',         label: 'Confirmado',     dot: 'bg-teal-500',   bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700'   },
  { key: 'assigned',          label: 'Atribuído',      dot: 'bg-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
  { key: 'en_route',          label: 'A Caminho',      dot: 'bg-orange-500', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  { key: 'in_progress',       label: 'Em Andamento',   dot: 'bg-brand',      bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800' },
  { key: 'completed',         label: 'Concluído',      dot: 'bg-green-500',  bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700'  },
  { key: 'occurrence',        label: 'Ocorrência',     dot: 'bg-red-500',    bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700'    },
]

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function ServiceTypeChip({ type }) {
  const map = {
    tour:     { label: 'Passeio',  cls: 'bg-orange-100 text-orange-700' },
    transfer: { label: 'Transfer', cls: 'bg-blue-100 text-blue-700'     },
  }
  const { label, cls } = map[type] || { label: type, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

// ── Card arrastável ────────────────────────────────────
function BookingCard({ booking, onAssign, isDragOverlay = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: booking.id })

  const dateStr = booking.service_date
    ? format(new Date(booking.service_date + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })
    : null
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : null

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-xl border border-gray-100 overflow-hidden cursor-grab active:cursor-grabbing select-none
        transition-all hover:shadow-md hover:border-gray-200
        ${isDragging || isDragOverlay ? 'opacity-40 shadow-xl rotate-1 scale-105' : 'shadow-sm'}`}
    >
      {/* Top strip */}
      <div className="h-1 w-full bg-gradient-to-r from-brand to-orange-300" />

      <div className="p-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-1">
          <div>
            <p className="text-[11px] font-mono text-gray-400 leading-none">{booking.booking_code}</p>
            <p className="text-[13px] font-bold text-gray-900 mt-0.5 leading-tight line-clamp-1">
              {booking.users?.full_name || '—'}
            </p>
          </div>
          <ServiceTypeChip type={booking.service_type} />
        </div>

        {/* Details */}
        <div className="space-y-1">
          {(dateStr || timeStr) && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Clock size={10} className="shrink-0 text-gray-400" />
              <span className="font-medium">{dateStr}{timeStr ? ` · ${timeStr}` : ''}</span>
            </div>
          )}
          {booking.people_count && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Users size={10} className="shrink-0 text-gray-400" />
              <span>{booking.people_count} pessoas</span>
            </div>
          )}
          {booking.booking_vehicles?.[0] && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Car size={10} className="shrink-0 text-gray-400" />
              <span className="truncate">{booking.booking_vehicles[0].vehicle_name_snapshot}</span>
            </div>
          )}
          {(booking.pickup_place_name || booking.origin_text) && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <MapPin size={10} className="shrink-0 text-gray-400" />
              <span className="truncate">{booking.pickup_place_name || booking.origin_text}</span>
            </div>
          )}
          {booking.users?.phone && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Phone size={10} className="shrink-0 text-gray-400" />
              <span>{booking.users.phone}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-50">
          <span className="text-[13px] font-extrabold text-gray-800">{fmt(booking.total_amount)}</span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAssign(booking) }}
            className="flex items-center gap-1 text-[11px] font-medium text-brand hover:bg-orange-50 rounded-lg px-2 py-1 transition-colors"
            title="Despachar"
          >
            <UserCheck size={12} />
            Despachar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Coluna droppable ───────────────────────────────────
function KanbanColumn({ column, bookings, onAssign }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })
  const total = bookings.reduce((s, b) => s + Number(b.total_amount || 0), 0)

  return (
    <div className="flex-shrink-0 w-64 flex flex-col gap-2">
      {/* Column header */}
      <div className={`rounded-xl px-3 py-2 border ${column.bg} ${column.border} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${column.dot}`} />
          <span className={`text-[12px] font-bold ${column.text}`}>{column.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {bookings.length > 0 && (
            <span className="text-[10px] text-gray-400">{fmt(total)}</span>
          )}
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
            bookings.length > 0 ? `${column.dot} text-white` : 'bg-gray-200 text-gray-500'
          }`}>
            {bookings.length}
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-32 rounded-xl p-2 space-y-2 transition-all ${
          isOver
            ? 'bg-brand/5 ring-2 ring-brand/30 scale-[1.01]'
            : 'bg-gray-50/80'
        }`}
      >
        {bookings.map((b) => (
          <BookingCard key={b.id} booking={b} onAssign={onAssign} />
        ))}
        {bookings.length === 0 && (
          <div className="h-20 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-200 rounded-xl">
            <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300" />
            <span className="text-[10px] text-gray-300 font-medium">Sem reservas</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Barra de stats ─────────────────────────────────────
function StatsBar({ columns, total, isLoading }) {
  const active = (columns['assigned']?.length || 0)
    + (columns['in_progress']?.length || 0)
    + (columns['en_route']?.length || 0)
  const pending = (columns['new']?.length || 0) + (columns['awaiting_dispatch']?.length || 0)
  const completed = columns['completed']?.length || 0
  const revenue = Object.values(columns).flat()
    .reduce((s, b) => s + Number(b.total_amount || 0), 0)

  const stats = [
    { label: 'Total',     value: total,     icon: CalendarDays,  cls: 'text-gray-700',   sub: 'reservas'  },
    { label: 'Pendentes', value: pending,   icon: AlertCircle,   cls: 'text-amber-600',  sub: 'aguardando' },
    { label: 'Em curso',  value: active,    icon: Loader2,       cls: 'text-brand',       sub: 'em andamento' },
    { label: 'Concluídas',value: completed, icon: CheckCircle2,  cls: 'text-green-600',  sub: 'finalizadas' },
    { label: 'Receita',   value: fmt(revenue), icon: TrendingUp, cls: 'text-indigo-600', sub: 'total'      },
  ]

  return (
    <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-gray-100 overflow-x-auto">
      {stats.map(({ label, value, icon: Icon, cls, sub }) => (
        <div key={label} className="flex items-center gap-2.5 shrink-0 bg-gray-50 rounded-xl px-3 py-2 min-w-[110px]">
          <div className={`${cls}`}>
            <Icon size={16} className={isLoading ? 'animate-spin' : ''} />
          </div>
          <div>
            <p className={`text-[15px] font-extrabold leading-none ${cls}`}>{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Página principal ───────────────────────────────────
export default function Dashboard() {
  const [date, setDate]          = useState('all')
  const [serviceType, setType]   = useState('')
  const [activeId, setActiveId]  = useState(null)
  const [assignModal, setAssign]         = useState(null)
  const [dispatchedBooking, setDispatched] = useState(null)
  const [savedForm, setSavedForm]          = useState(null)
  const [form, setForm]                    = useState({ real_vehicle_text: '', dispatch_notes: '', driver_phone: '' })

  const qc      = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const { data, isLoading, isFetching } = useQuery({
    queryKey:       ['operational', date, serviceType],
    queryFn:        () => api.getOperational({
      ...(date !== 'all' ? { date } : {}),
      ...(serviceType ? { service_type: serviceType } : {}),
    }),
    refetchInterval: 15_000,
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status_operational }) => api.updateBookingStatus(id, { status_operational }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['operational'] }),
  })

  const assignMut = useMutation({
    mutationFn: ({ id, ...body }) => api.assignBooking(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['operational'] })
      setSavedForm({ ...form })
      setDispatched(assignModal)
      setAssign(null)
      setForm({ real_vehicle_text: '', dispatch_notes: '', driver_phone: '' })
    },
  })

  function closeDispatch() {
    setDispatched(null)
    setSavedForm(null)
  }

  const columns     = data?.columns || {}
  const allBookings = Object.values(columns).flat()
  const activeBook  = activeId ? allBookings.find((b) => b.id === activeId) : null

  function findColumn(id) {
    for (const [col, bookings] of Object.entries(columns)) {
      if (bookings.find((b) => b.id === id)) return col
    }
    return null
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return
    const fromCol = findColumn(active.id)
    const toCol   = over.id
    if (fromCol !== toCol && COLUMNS.find((c) => c.key === toCol)) {
      updateStatus.mutate({ id: active.id, status_operational: toCol })
    }
  }

  function changeDate(days) {
    const base = date === 'all' ? format(new Date(), 'yyyy-MM-dd') : date
    const d    = new Date(base + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setDate(format(d, 'yyyy-MM-dd'))
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col h-full -m-6">

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center flex-wrap gap-3 px-6 py-3 bg-white border-b border-gray-100">

        {/* Date filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate('all')}
            className={`h-9 px-3 rounded-lg text-sm font-semibold border transition-colors ${
              date === 'all'
                ? 'bg-brand text-white border-brand shadow-sm'
                : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            Todos os dias
          </button>
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-50 transition-colors text-gray-500">
              <ChevronLeft size={15} />
            </button>
            <input
              type="date"
              value={date === 'all' ? format(new Date(), 'yyyy-MM-dd') : date}
              onChange={(e) => setDate(e.target.value)}
              className={`px-2 text-sm font-medium bg-transparent focus:outline-none ${
                date === 'all' ? 'text-gray-300' : 'text-gray-700'
              }`}
            />
            <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-50 transition-colors text-gray-500">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Tipo de serviço */}
        <select
          value={serviceType}
          onChange={(e) => setType(e.target.value)}
          className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:border-brand"
        >
          <option value="">Todos os tipos</option>
          <option value="tour">Passeios</option>
          <option value="transfer">Transfers</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {isFetching && !isLoading && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Atualizando…
            </span>
          )}
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['operational'] })}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Stats bar ──────────────────────────────────── */}
      <StatsBar columns={columns} total={data?.total || 0} isLoading={isFetching && !isLoading} />

      {/* ── Kanban ──────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto overflow-y-auto bg-gray-100/50">
        <div className="flex gap-3 p-5" style={{ minWidth: 'max-content', minHeight: '100%' }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={({ active }) => setActiveId(active.id)}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            {COLUMNS.map((col) => (
              <KanbanColumn
                key={col.key}
                column={col}
                bookings={columns[col.key] || []}
                onAssign={setAssign}
              />
            ))}
            <DragOverlay dropAnimation={null}>
              {activeBook && <BookingCard booking={activeBook} isDragOverlay />}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* ── Modal Ordem de Serviço (pós-despacho) ──────── */}
      <Modal
        open={!!dispatchedBooking}
        onClose={closeDispatch}
        title="Ordem de Serviço gerada"
        size="sm"
      >
        {dispatchedBooking && savedForm && (
          <div className="space-y-4">
            {/* Resumo */}
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

            <p className="text-sm text-gray-500 text-center">
              Selecione como deseja compartilhar a Ordem de Serviço:
            </p>

            {/* Baixar PDF */}
            <button
              onClick={() => downloadOrderPDF(dispatchedBooking, savedForm)}
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

            {/* Enviar ao motorista */}
            <button
              onClick={() => shareOrderPDF(dispatchedBooking, savedForm, 'driver')}
              disabled={!savedForm.driver_phone}
              className={`w-full flex items-center gap-3 p-3.5 border rounded-xl transition-colors text-left ${
                savedForm.driver_phone
                  ? 'bg-green-50 hover:bg-green-100 border-green-200'
                  : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <MessageCircle size={16} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Enviar ao Motorista</p>
                <p className="text-xs text-green-600">
                  {savedForm.driver_phone
                    ? `WhatsApp ${savedForm.driver_phone} · baixa PDF + abre chat`
                    : 'Informe o WhatsApp do motorista no despacho'}
                </p>
              </div>
            </button>

            {/* Enviar ao cliente */}
            <button
              onClick={() => shareOrderPDF(dispatchedBooking, savedForm, 'client')}
              disabled={!dispatchedBooking.users?.phone}
              className={`w-full flex items-center gap-3 p-3.5 border rounded-xl transition-colors text-left ${
                dispatchedBooking.users?.phone
                  ? 'bg-green-50 hover:bg-green-100 border-green-200'
                  : 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="w-9 h-9 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <MessageCircle size={16} className="text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">Enviar ao Cliente</p>
                <p className="text-xs text-green-600">
                  {dispatchedBooking.users?.phone
                    ? `WhatsApp ${dispatchedBooking.users.phone} · baixa PDF + abre chat`
                    : 'Cliente sem telefone cadastrado'}
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
        onClose={() => { setAssign(null); setForm({ real_vehicle_text: '', dispatch_notes: '', driver_phone: '' }) }}
        title={`Despachar — ${assignModal?.booking_code || ''}`}
        size="md"
      >
        {assignModal && (
          <>
            {/* Resumo do serviço */}
            <div className="mb-5 rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b border-gray-200">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Resumo do serviço</span>
                <ServiceTypeChip type={assignModal.service_type} />
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Cliente</span>
                  <span className="font-semibold text-gray-900">{assignModal.users?.full_name || '—'}</span>
                </div>
                {assignModal.users?.phone && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Tel. cliente</span>
                    <a href={`https://wa.me/55${assignModal.users.phone.replace(/\D/g,'')}`}
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

            {/* Formulário */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const { driver_phone, ...rest } = form
                assignMut.mutate({ id: assignModal.id, ...rest })
              }}
              className="space-y-4"
            >
              <Input
                label="Veículo (descrição)"
                placeholder="Ex: Buggy Branco GKR-1234"
                value={form.real_vehicle_text}
                onChange={(e) => setForm({ ...form, real_vehicle_text: e.target.value })}
              />

              {/* WhatsApp do motorista */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WhatsApp do motorista
                </label>
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
                    <Send size={10} /> Mensagem de despacho será enviada automaticamente pelo WhatsApp
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
