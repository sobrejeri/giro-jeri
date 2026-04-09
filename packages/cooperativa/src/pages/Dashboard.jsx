import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, RefreshCw, Clock, Users, Car, MapPin, UserCheck } from 'lucide-react'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'

const COLUMNS = [
  { key: 'new',               label: 'Novo',           color: 'bg-blue-400'   },
  { key: 'awaiting_dispatch', label: 'Ag. Despacho',   color: 'bg-amber-400'  },
  { key: 'confirmed',         label: 'Confirmado',     color: 'bg-teal-400'   },
  { key: 'assigned',          label: 'Atribuído',      color: 'bg-indigo-400' },
  { key: 'en_route',          label: 'A Caminho',      color: 'bg-orange-400' },
  { key: 'in_progress',       label: 'Em Andamento',   color: 'bg-brand'      },
  { key: 'completed',         label: 'Concluído',      color: 'bg-green-400'  },
  { key: 'occurrence',        label: 'Ocorrência',     color: 'bg-red-400'    },
]

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ── Card arrastável ────────────────────────────────────
function BookingCard({ booking, onAssign, isDragOverlay = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: booking.id })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-lg border border-gray-100 p-3 cursor-grab active:cursor-grabbing select-none
        transition-all hover:shadow-md hover:border-gray-200
        ${isDragging || isDragOverlay ? 'opacity-50 shadow-lg rotate-1' : 'shadow-sm'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-mono text-xs font-bold text-gray-400">{booking.booking_code}</span>
        <Badge value={booking.service_type} />
      </div>

      <p className="text-sm font-semibold text-gray-900 mb-1 leading-tight truncate">
        {booking.users?.full_name || '—'}
      </p>

      <div className="space-y-1 text-xs text-gray-500">
        {booking.service_time && (
          <div className="flex items-center gap-1.5">
            <Clock size={11} />
            <span>{booking.service_time.slice(0, 5)}</span>
          </div>
        )}
        {booking.people_count && (
          <div className="flex items-center gap-1.5">
            <Users size={11} />
            <span>{booking.people_count} pax</span>
          </div>
        )}
        {booking.booking_vehicles?.[0] && (
          <div className="flex items-center gap-1.5">
            <Car size={11} />
            <span className="truncate">{booking.booking_vehicles[0].vehicle_name_snapshot}</span>
          </div>
        )}
        {booking.pickup_place_name && (
          <div className="flex items-center gap-1.5">
            <MapPin size={11} className="flex-shrink-0" />
            <span className="truncate">{booking.pickup_place_name}</span>
          </div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-700">{fmt(booking.total_amount)}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onAssign(booking) }}
          className="p-1 text-gray-400 hover:text-brand transition-colors"
          title="Despachar"
        >
          <UserCheck size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Coluna droppable ───────────────────────────────────
function KanbanColumn({ column, bookings, onAssign }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })

  return (
    <div className="flex-shrink-0 w-60 flex flex-col">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
        <span className="text-sm font-semibold text-gray-700">{column.label}</span>
        <span className="ml-auto text-xs font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {bookings.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-24 rounded-xl p-2 space-y-2 transition-colors ${
          isOver ? 'bg-brand/5 ring-2 ring-brand/20' : 'bg-gray-100/60'
        }`}
      >
        {bookings.map((b) => (
          <BookingCard key={b.id} booking={b} onAssign={onAssign} />
        ))}
        {bookings.length === 0 && (
          <div className="h-16 flex items-center justify-center text-xs text-gray-300 border-2 border-dashed border-gray-200 rounded-lg">
            Vazio
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────
export default function Dashboard() {
  const [date, setDate]           = useState(format(new Date(), 'yyyy-MM-dd'))
  const [serviceType, setType]    = useState('')
  const [activeId, setActiveId]   = useState(null)
  const [assignModal, setAssign]  = useState(null)
  const [form, setForm]           = useState({ real_vehicle_text: '', dispatch_notes: '' })

  const qc      = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const { data, isLoading } = useQuery({
    queryKey: ['operational', date, serviceType],
    queryFn:  () => api.getOperational({ date, ...(serviceType ? { service_type: serviceType } : {}) }),
    refetchInterval: 30_000,
  })

  const updateStatus = useMutation({
    mutationFn: ({ id, status_operational }) => api.updateBookingStatus(id, { status_operational }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['operational'] }),
  })

  const assignMut = useMutation({
    mutationFn: ({ id, ...body }) => api.assignBooking(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['operational'] })
      setAssign(null)
      setForm({ real_vehicle_text: '', dispatch_notes: '' })
    },
  })

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
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setDate(format(d, 'yyyy-MM-dd'))
  }

  function handleAssignSubmit(e) {
    e.preventDefault()
    assignMut.mutate({ id: assignModal.id, ...form })
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center flex-wrap gap-3 px-6 py-3 bg-white border-b border-gray-100">
        {/* Date picker */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-50 transition-colors">
            <ChevronLeft size={15} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 text-sm font-medium text-gray-700 bg-transparent focus:outline-none"
          />
          <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-50 transition-colors">
            <ChevronRight size={15} />
          </button>
        </div>

        {/* Filtro tipo */}
        <select
          value={serviceType}
          onChange={(e) => setType(e.target.value)}
          className="h-9 pl-3 pr-8 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-brand"
        >
          <option value="">Todos</option>
          <option value="tour">Passeios</option>
          <option value="transfer">Transfers</option>
        </select>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{data?.total || 0}</span> reservas
          </span>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['operational'] })}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-5 h-full" style={{ minWidth: 'max-content' }}>
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

      {/* Modal de despacho */}
      <Modal
        open={!!assignModal}
        onClose={() => setAssign(null)}
        title={`Despachar — ${assignModal?.booking_code || ''}`}
        size="sm"
      >
        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <Input
            label="Veículo (descrição)"
            placeholder="Ex: Buggy Branco GKR-1234"
            value={form.real_vehicle_text}
            onChange={(e) => setForm({ ...form, real_vehicle_text: e.target.value })}
          />
          <Textarea
            label="Observações"
            rows={3}
            placeholder="Instruções para o motorista…"
            value={form.dispatch_notes}
            onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })}
          />
          <Button type="submit" className="w-full" disabled={assignMut.isPending}>
            {assignMut.isPending ? 'Despachando…' : 'Confirmar Despacho'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
