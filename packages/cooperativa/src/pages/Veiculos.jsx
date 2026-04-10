import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const VEHICLE_TYPES = [
  { value: 'buggy',        label: 'Buggy'         },
  { value: 'quadricycle',  label: 'Quadriciclo'   },
  { value: 'jardineira',   label: 'Jardineira'    },
  { value: 'hilux',        label: 'Hilux / SUV'   },
  { value: 'van',          label: 'Van'           },
  { value: 'boat',         label: 'Barco'         },
  { value: 'motorbike',    label: 'Moto'          },
  { value: 'other',        label: 'Outro'         },
]

const EMPTY = { name: '', vehicle_type: 'buggy', capacity: 4, license_plate: '', is_active: true }

export default function Veiculos() {
  const [modal, setModal]   = useState(null) // null | 'new' | vehicle obj
  const [form, setForm]     = useState(EMPTY)
  const qc                  = useQueryClient()

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  () => api.getVehicles(),
  })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal === 'new' ? api.createVehicle(body) : api.updateVehicle(modal.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      setModal(null)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (v) => api.updateVehicle(v.id, { is_active: !v.is_active }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  })

  function openNew() {
    setForm(EMPTY)
    setModal('new')
  }

  function openEdit(v) {
    setForm({ name: v.name, vehicle_type: v.vehicle_type, capacity: v.capacity, license_plate: v.license_plate || '', is_active: v.is_active })
    setModal(v)
  }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({ ...form, capacity: Number(form.capacity) })
  }

  if (isLoading) return <PageSpinner />

  const active   = vehicles.filter((v) => v.is_active)
  const inactive = vehicles.filter((v) => !v.is_active)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus size={16} /> Novo Veículo
        </Button>
      </div>

      {/* Ativos */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-700">
            Ativos <span className="text-gray-400 font-normal">({active.length})</span>
          </h2>
        </CardHeader>
        {active.length === 0 ? (
          <CardBody><p className="text-sm text-gray-400">Nenhum veículo ativo.</p></CardBody>
        ) : (
          <div className="divide-y divide-gray-50">
            {active.map((v) => <VehicleRow key={v.id} v={v} onEdit={openEdit} onToggle={toggleMut.mutate} />)}
          </div>
        )}
      </Card>

      {/* Inativos */}
      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-400">
              Inativos ({inactive.length})
            </h2>
          </CardHeader>
          <div className="divide-y divide-gray-50">
            {inactive.map((v) => <VehicleRow key={v.id} v={v} onEdit={openEdit} onToggle={toggleMut.mutate} />)}
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'new' ? 'Novo Veículo' : 'Editar Veículo'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome / Identificação"
            placeholder="Ex: Buggy Branco #1"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Select
            label="Tipo"
            value={form.vehicle_type}
            onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
          <Input
            label="Capacidade (passageiros)"
            type="number"
            min={1}
            max={50}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            required
          />
          <Input
            label="Placa (opcional)"
            placeholder="ABC-1234"
            value={form.license_plate}
            onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
          />
          <Button type="submit" className="w-full" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}

function VehicleRow({ v, onEdit, onToggle }) {
  const typeLabel = VEHICLE_TYPES.find((t) => t.value === v.vehicle_type)?.label || v.vehicle_type
  return (
    <div className={`flex items-center gap-4 px-5 py-3 ${!v.is_active ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{v.name}</p>
        <p className="text-xs text-gray-400">
          {typeLabel} · {v.capacity} pax{v.license_plate ? ` · ${v.license_plate}` : ''}
        </p>
      </div>
      <button
        onClick={() => onEdit(v)}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={() => onToggle(v)}
        className={`p-1.5 rounded-lg transition-colors ${v.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
        title={v.is_active ? 'Desativar' : 'Ativar'}
      >
        {v.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
      </button>
    </div>
  )
}
