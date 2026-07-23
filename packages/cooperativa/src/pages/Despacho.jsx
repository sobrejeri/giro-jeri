import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, CheckCircle2, UserCheck, Car, Clock,
  Users, MapPin, RefreshCw, MessageCircle, FileText, Package,
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

// "Despachado" = a OS já foi preenchida (veículo/motorista atribuído). O status
// 'assigned' NÃO basta, pois também é setado no aceite — por isso uma reserva
// paga (mas sem OS) fica em "Aguardando despacho", não em "Despachados".
function hasDispatch(b) {
  const a = b.operational_assignments?.[0]
  return !!(a && (a.real_vehicle_text || a.driver_name))
}

function BookingRow({ b, onDispatch, cooperativa }) {
  const dateStr = b.service_date
    ? format(new Date(b.service_date + 'T12:00:00'), "dd/MM", { locale: ptBR }) : ''
  const local        = b.pickup_place_name || b.origin_text || ''
  const dest         = b.destination_place_name || b.destination_text || ''
  const isDispatched = hasDispatch(b)
  const assign       = b.operational_assignments?.[0]
  const formForOS    = {
    real_vehicle_text: assign?.real_vehicle_text || '',
    driver_name:       assign?.driver_name       || '',
    dispatch_notes:    assign?.dispatch_notes    || '',
    driver_phone:      assign?.driver_phone      || '',
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
            {isDispatched ? 'Editar' : 'Despachar'}
          </Button>
        </div>

        {/* Ações pós-despacho */}
        {isDispatched && (
          <div className="flex items-center gap-2 pt-2 border-t border-green-100 flex-wrap">
            <button
              onClick={() => downloadOrderPDF(b, formForOS, cooperativa)}
              className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              <FileText size={12} /> Baixar PDF
            </button>
            <button
              onClick={() => shareOrderPDF(b, formForOS, 'driver', cooperativa)}
              className="flex items-center gap-1.5 text-xs font-medium bg-green-100 hover:bg-green-200 text-green-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              <MessageCircle size={12} /> WhatsApp Motorista
            </button>
            <button
              onClick={() => shareOrderPDF(b, formForOS, 'client', cooperativa)}
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

// Agrupa uma lista de reservas por pedido (order_group_id), preservando a
// ordem de aparição. Pedido com 2+ serviços vira um bloco; o resto fica avulso.
function groupByOrder(list) {
  const byGid = new Map()
  const out = []
  for (const b of list) {
    if (b.order_group_id) {
      if (!byGid.has(b.order_group_id)) {
        const bucket = { type: 'group', gid: b.order_group_id, items: [] }
        byGid.set(b.order_group_id, bucket)
        out.push(bucket)
      }
      byGid.get(b.order_group_id).items.push(b)
    } else {
      out.push({ type: 'single', item: b })
    }
  }
  // Pedido de 1 serviço cai como avulso.
  return out.map((o) => (o.type === 'group' && o.items.length < 2) ? { type: 'single', item: o.items[0] } : o)
}

// Lista com os serviços do mesmo pedido agrupados sob um cabeçalho. O despacho
// segue POR serviço (cada um pode ter veículo/motorista diferente).
function GroupedList({ list, onDispatch, cooperativa }) {
  return (
    <div className="space-y-3">
      {groupByOrder(list).map((it) => it.type === 'group' ? (
        <div key={it.gid} className="rounded-2xl border border-brand/20 overflow-hidden">
          <div className="bg-brand/5 px-4 py-2 flex items-center justify-between border-b border-brand/10">
            <div className="flex items-center gap-2">
              <Package size={14} className="text-brand shrink-0" />
              <span className="text-[12px] font-bold text-gray-800">Pedido · {it.items.length} serviços</span>
            </div>
            <span className="text-[11px] text-gray-500 truncate max-w-[45%]">
              {it.items.find((b) => b.users?.full_name)?.users?.full_name || ''}
            </span>
          </div>
          <div className="p-2 space-y-2 bg-brand/[0.02]">
            {it.items.map((b) => (
              <BookingRow key={b.id} b={b} onDispatch={onDispatch} cooperativa={cooperativa} />
            ))}
          </div>
        </div>
      ) : (
        <BookingRow key={it.item.id} b={it.item} onDispatch={onDispatch} cooperativa={cooperativa} />
      ))}
    </div>
  )
}

export default function Despacho() {
  const [date, setDate]       = useState('all')
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({ real_vehicle_text: '', driver_name: '', dispatch_notes: '', driver_phone: '' })
  const qc                    = useQueryClient()

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dispatch', date],
    queryFn:  () => api.getOperational(date !== 'all' ? { date } : {}),
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
      qc.invalidateQueries({ queryKey: ['dispatch'] })
      setModal(null)
      setForm({ real_vehicle_text: '', driver_name: '', dispatch_notes: '', driver_phone: '' })
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
    // Puxa o veículo escolhido pelo cliente na solicitação como sugestão inicial
    // (item 10) — a coop confirma/ajusta com o modelo/placa reais.
    const selectedVehicle = (booking.booking_vehicles || [])
      .map((v) => `${v.quantity > 1 ? v.quantity + 'x ' : ''}${v.vehicle_name_snapshot || ''}`.trim())
      .filter(Boolean)
      .join(' + ')
    setModal(booking)
    setForm({
      real_vehicle_text: assign?.real_vehicle_text || selectedVehicle || '',
      driver_name:       assign?.driver_name       || '',
      dispatch_notes:    assign?.dispatch_notes    || '',
      driver_phone:      assign?.driver_phone      || '',
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    // Obrigatórios (item 9): veículo, motorista e WhatsApp do motorista.
    if (!form.real_vehicle_text.trim() || !form.driver_name.trim() || !form.driver_phone.trim()) return
    assignMut.mutate({ id: modal.id, ...form })
  }

  // Só reservas PAGAS entram no despacho (não se despacha antes do pagamento);
  // concluídas saem. "Aguardando despacho" = paga sem OS; "Despachadas" = com OS.
  const columns    = data?.columns || {}
  const paidActive = Object.values(columns).flat()
    .filter((b) => b.status_commercial === 'paid' && b.status_operational !== 'completed')
  const pending    = paidActive.filter((b) => !hasDispatch(b))
  const dispatched = paidActive.filter((b) => hasDispatch(b))

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
          <GroupedList list={pending} onDispatch={handleDispatch} cooperativa={cooperativa} />
        )}
      </div>

      {/* ── Já despachados ──────────────────────────────── */}
      {dispatched.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Despachados / Em andamento ({dispatched.length})
          </h3>
          <GroupedList list={dispatched} onDispatch={handleDispatch} cooperativa={cooperativa} />
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
          <Input label="Veículo (modelo / placa / cor) *" placeholder="Ex: Hilux Branca · GKR-1234"
            value={form.real_vehicle_text} required
            onChange={(e) => setForm({ ...form, real_vehicle_text: e.target.value })} />
          <Input label="Nome do motorista *" placeholder="Ex: João da Silva"
            value={form.driver_name} required
            onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp do motorista *</label>
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand bg-white">
              <MessageCircle size={14} className="text-green-500 shrink-0" />
              <input type="tel" placeholder="(88) 99999-9999" value={form.driver_phone} required
                onChange={(e) => setForm({ ...form, driver_phone: e.target.value })}
                className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400" />
            </div>
          </div>
          <Textarea label="Observações para o motorista" rows={2} value={form.dispatch_notes}
            onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })} />
          {(() => {
            const canDispatch = form.real_vehicle_text.trim() && form.driver_name.trim() && form.driver_phone.trim()
            return (
              <>
                {!canDispatch && (
                  <p className="text-[11px] text-amber-600">Preencha veículo, motorista e WhatsApp para confirmar o despacho.</p>
                )}
                <Button type="submit" className="w-full" disabled={assignMut.isPending || !canDispatch}>
                  {assignMut.isPending ? 'Salvando…' : 'Confirmar Despacho'}
                </Button>
              </>
            )
          })()}
        </form>
      </Modal>

    </div>
  )
}
