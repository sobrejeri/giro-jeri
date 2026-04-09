import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, CheckCircle2, UserCheck, Car } from 'lucide-react'
import { api } from '../lib/api'
import Badge from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DISPATCH_STATUSES = ['new', 'awaiting_dispatch', 'confirmed']

export default function Despacho() {
  const [date, setDate]       = useState(format(new Date(), 'yyyy-MM-dd'))
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({ real_vehicle_text: '', dispatch_notes: '' })
  const qc                    = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['dispatch', date],
    queryFn:  () => api.getOperational({ date }),
    refetchInterval: 30_000,
  })

  const assignMut = useMutation({
    mutationFn: ({ id, ...body }) => api.assignBooking(id, body),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['dispatch'] })
      setModal(null)
      setForm({ real_vehicle_text: '', dispatch_notes: '' })
    },
  })

  function changeDate(days) {
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setDate(format(d, 'yyyy-MM-dd'))
  }

  const columns = data?.columns || {}
  const pending = DISPATCH_STATUSES.flatMap((s) => columns[s] || [])

  function handleSubmit(e) {
    e.preventDefault()
    assignMut.mutate({ id: modal.id, ...form })
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
          <button onClick={() => changeDate(-1)} className="p-2 hover:bg-gray-50">
            <ChevronLeft size={15} />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 text-sm font-medium text-gray-700 focus:outline-none"
          />
          <button onClick={() => changeDate(1)} className="p-2 hover:bg-gray-50">
            <ChevronRight size={15} />
          </button>
        </div>
        <span className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900">{pending.length}</span> aguardando despacho
        </span>
      </div>

      {/* Lista */}
      {pending.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <CheckCircle2 size={40} className="mx-auto text-green-300 mb-3" />
              <p className="text-gray-500 text-sm">Todos os serviços estão despachados!</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((b) => {
            const assign = b.operational_assignments?.[0]
            return (
              <Card key={b.id} className="hover:border-brand/20 transition-colors">
                <CardBody className="flex items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-400">{b.booking_code}</span>
                      <Badge value={b.service_type} />
                      <Badge value={b.status_operational} />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{b.users?.full_name}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{b.service_time?.slice(0, 5)}</span>
                      {b.people_count && <span>{b.people_count} pax</span>}
                      <span className="font-semibold text-gray-700">{fmt(b.total_amount)}</span>
                    </div>
                    {b.pickup_place_name && (
                      <p className="text-xs text-gray-400 truncate">
                        {b.pickup_place_name}{b.destination_place_name ? ` → ${b.destination_place_name}` : ''}
                      </p>
                    )}
                    {assign?.real_vehicle_text && (
                      <div className="flex items-center gap-1 text-xs text-indigo-600">
                        <Car size={12} />
                        <span>{assign.real_vehicle_text}</span>
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={assign ? 'outline' : 'primary'}
                    onClick={() => {
                      setModal(b)
                      setForm({
                        real_vehicle_text: assign?.real_vehicle_text || '',
                        dispatch_notes:    assign?.dispatch_notes    || '',
                      })
                    }}
                  >
                    <UserCheck size={14} />
                    {assign ? 'Reatribuir' : 'Despachar'}
                  </Button>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={`Despachar — ${modal?.booking_code || ''}`}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="font-medium">{modal?.users?.full_name}</p>
            <p className="text-gray-500">{modal?.service_date} · {modal?.service_time?.slice(0, 5)} · {modal?.people_count} pax</p>
          </div>
          <Input
            label="Veículo"
            placeholder="Ex: Buggy Branco GKR-1234"
            value={form.real_vehicle_text}
            onChange={(e) => setForm({ ...form, real_vehicle_text: e.target.value })}
          />
          <Textarea
            label="Observações para o motorista"
            rows={3}
            value={form.dispatch_notes}
            onChange={(e) => setForm({ ...form, dispatch_notes: e.target.value })}
          />
          <Button type="submit" className="w-full" disabled={assignMut.isPending}>
            {assignMut.isPending ? 'Salvando…' : 'Confirmar Despacho'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
