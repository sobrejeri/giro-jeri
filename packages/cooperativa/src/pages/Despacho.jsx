import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, CheckCircle2, UserCheck, Car, Clock,
  Users, MapPin, RefreshCw, MessageCircle, FileText,
} from 'lucide-react'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import { downloadOrderPDF, shareOrderPDF } from '../lib/orderPDF'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PENDING_STATUSES    = ['new', 'awaiting_dispatch', 'confirmed']
const DISPATCHED_STATUSES = ['assigned', 'en_route', 'in_progress']

function BookingRow({ b, onDispatch }) {
  const dateStr = b.service_date
    ? format(new Date(b.service_date + 'T12:00:00'), "dd/MM", { locale: ptBR }) : ''
  const local        = b.pickup_place_name || b.origin_text || ''
  const dest         = b.destination_place_name || b.destination_text || ''
  const isDispatched = DISPATCHED_STATUSES.includes(b.status_operational)
  const assign       = b.operational_assignments?.[0]
  const formForOS    = {
    real_vehicle_text: assign?.real_vehicle_text || '',
    dispatch_notes:    assign?.dispatch_notes    || '',
    driver_phone:      '',
  }

  return (
    <Card className={`transition-colors ${isDispatched ? 'border-green-200 bg-green-50/30' : 'hover:border-brand/20'}`}>
      <CardBody className="space-y-3">
        {/* Info principal */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-gray-400">{b.booking_code}</span>
              <Badge value={b.service_type} />
              {isDispatched && (
                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={9} /> Despachado
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900">{b.users?.full_name || '—'}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
              {dateStr && (
                <span className="flex items-center gap-1">
                  <Clock size={10} />{dateStr}{b.service_time ? ` · ${b.service_time.slice(0,5)}` : ''}
                </span>
              )}
              {b.people_count && <span className="flex items-center gap-1"><Users size={10} />{b.people_count} pax</span>}
              <span className="font-semibold text-gray-700">{fmt(b.total_amount)}</span>
            </div>
            {local && (
              <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                <MapPin size={9} />{local}{dest ? ` → ${dest}` : ''}
              </p>
            )}
            {assign?.real_vehicle_text && (
              <div className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                <Car size={11} />{assign.real_vehicle_text}
              </div>
            )}
          </div>

          <Button size="sm" variant={isDispatched ? 'outline' : 'primary'} onClick={() => onDispatch(b)}>
            <UserCheck size={13} />
            {isDispatched ? 'Reatribuir' : 'Despachar'}
          </Button>
        </div>

        {/* Ações pós-despacho */}
        {isDispatched && (
          <div className="flex items-center gap-2 pt-2 border-t border-green-100 flex-wrap">
            <button
              onClick={() => downloadOrderPDF(b, formForOS)}
              className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              <FileText size={12} /> Baixar PDF
            </button>
            <button
              onClick={() => shareOrderPDF(b, formForOS, 'driver')}
              className="flex items-center gap-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              <MessageCircle size={12} /> WhatsApp Motorista
            </button>
            <button
              onClick={() => shareOrderPDF(b, formForOS, 'client')}
              disabled={!b.users?.phone}
              className="flex items-center gap-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <MessageCircle size={12} /> WhatsApp Cliente
            </button>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export default function Despacho() {
  const [date, setDate]       = useState('all')
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({ real_vehicle_text: '', dispatch_notes: '', driver_phone: '' })
  const qc                    = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dispatch', date],
    queryFn:  () => api.getOperational(date !== 'all' ? { date } : {}),
    refetchInterval: 15_000,
  })

  const assignMut = useMutation({
    mutationFn: ({ id, ...body }) => api.assignBooking(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['dispatch'] })
      setModal(null)
      setForm({ real_vehicle_text: '', dispatch_notes: '', driver_phone: '' })
    },
  })

  function changeDate(days) {
    const base = date === 'all' ? format(new Date(), 'yyyy-MM-dd') : date
    const d    = new Date(base + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setDate(format(d, 'yyyy-MM-dd'))
  }

  function handleDispatch(booking) {
    const assign = booking.operational_assignments?.[0]
    setModal(booking)
    setForm({
      real_vehicle_text: assign?.real_vehicle_text || '',
      dispatch_notes:    assign?.dispatch_notes    || '',
      driver_phone:      '',
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    const { driver_phone, ...rest } = form
    assignMut.mutate({ id: modal.id, ...rest })
  }

  const columns    = data?.columns || {}
  const allBooks   = Object.values(columns).flat()
  const pending    = PENDING_STATUSES.flatMap((s) => columns[s] || [])
  const dispatched = DISPATCHED_STATUSES.flatMap((s) => columns[s] || [])

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">

      {/* ── Filtro de data ──────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
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
          <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-50 text-gray-500">
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
          <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-50 text-gray-500">
            <ChevronRight size={15} />
          </button>
        </div>
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{pending.length}</span> aguardando ·{' '}
          <span className="font-semibold text-green-600">{dispatched.length}</span> despachados
        </span>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['dispatch'] })}
          className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Aguardando despacho ─────────────────────────── */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
          Aguardando despacho ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <Card>
            <CardBody>
              <div className="py-8 text-center">
                <CheckCircle2 size={36} className="mx-auto text-green-300 mb-2" />
                <p className="text-gray-500 text-sm">Todos os serviços estão despachados!</p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((b) => (
              <BookingRow key={b.id} b={b} onDispatch={handleDispatch} />
            ))}
          </div>
        )}
      </div>

      {/* ── Já despachados ──────────────────────────────── */}
      {dispatched.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Despachados / Em andamento ({dispatched.length})
          </h3>
          <div className="space-y-3">
            {dispatched.map((b) => (
              <BookingRow key={b.id} b={b} onDispatch={handleDispatch} />
            ))}
          </div>
        </div>
      )}

      {/* ── Modal de despacho ──────────────────────────── */}
      <Modal open={!!modal} onClose={() => setModal(null)}
        title={`Despachar — ${modal?.booking_code || ''}`} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          {modal && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1 border border-gray-200">
              <p className="font-bold text-gray-900">{modal.users?.full_name}</p>
              <p className="text-gray-500">
                {modal.service_date
                  ? format(new Date(modal.service_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })
                  : '—'}
                {modal.service_time ? ` · ${modal.service_time.slice(0,5)}` : ''}
                {modal.people_count ? ` · ${modal.people_count} pax` : ''}
              </p>
              <p className="font-bold text-brand">{fmt(modal.total_amount)}</p>
            </div>
          )}
          <Input label="Veículo (descrição)" placeholder="Ex: Buggy Branco GKR-1234"
            value={form.real_vehicle_text}
            onChange={(e) => setForm({ ...form, real_vehicle_text: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp do motorista</label>
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand bg-white">
              <MessageCircle size={14} className="text-green-500 shrink-0" />
              <input type="tel" placeholder="(88) 99999-9999" value={form.driver_phone}
                onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
                className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
            </div>
          </div>
          <Textarea label="Observações para o motorista" rows={2} value={form.dispatch_notes}
            onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })} />
          <Button type="submit" className="w-full" disabled={assignMut.isPending}>
            {assignMut.isPending ? 'Salvando…' : 'Confirmar Despacho'}
          </Button>
        </form>
      </Modal>

    </div>
  )
}
