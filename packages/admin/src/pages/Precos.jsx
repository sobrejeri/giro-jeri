import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tag } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const EMPTY = {
  vehicle_id: '',
  tour_id: '',
  region_id: '',
  price: '',
  pricing_mode: 'per_vehicle',
  min_people: '',
  max_people: '',
}

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Precos() {
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState(EMPTY)
  const qc = useQueryClient()

  const { data: rules = [], isLoading: l1 }     = useQuery({ queryKey: ['pricing-rules'],  queryFn: () => api.getPricingRules() })
  const { data: vehicles = [], isLoading: l2 }  = useQuery({ queryKey: ['vehicles'],        queryFn: () => api.getVehicles() })
  const { data: tours = [], isLoading: l3 }     = useQuery({ queryKey: ['admin-tours'],     queryFn: () => api.getTours().then((r) => r.data || r) })
  const { data: regions = [], isLoading: l4 }   = useQuery({ queryKey: ['regions'],         queryFn: () => api.getRegions() })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createPricingRule(body) : api.updatePricingRule(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pricing-rules'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.deletePricingRule(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  })

  function openNew()  { setForm(EMPTY); setModal({ isNew: true }) }
  function openEdit(r) { setForm({ ...r, price: r.price || '' }); setModal(r) }

  function handleSubmit(e) {
    e.preventDefault()
    const body = {
      ...form,
      price:       Number(form.price),
      min_people:  form.min_people ? Number(form.min_people) : null,
      max_people:  form.max_people ? Number(form.max_people) : null,
      vehicle_id:  form.vehicle_id  || null,
      tour_id:     form.tour_id     || null,
      region_id:   form.region_id   || null,
    }
    saveMut.mutate(body)
  }

  if (l1 || l2 || l3 || l4) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus size={16} /> Nova Regra</Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <Tag size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma regra de preço configurada.</p>
              <p className="text-gray-600 text-xs mt-1">As regras definem preços por veículo, passeio e região.</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Veículo</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Passeio</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Região</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Modo</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Preço</th>
                  <th className="px-5 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-750 transition-colors">
                    <td className="px-5 py-3 text-gray-300">{r.vehicles?.name || '—'}</td>
                    <td className="px-5 py-3 text-gray-300">{r.tours?.name    || '—'}</td>
                    <td className="px-5 py-3 text-gray-300">{r.regions?.name  || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{r.pricing_mode}</td>
                    <td className="px-5 py-3 text-right font-bold text-brand">{fmt(r.price)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(r)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => confirm('Remover regra?') && deleteMut.mutate(r.id)}
                          className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Nova Regra de Preço' : 'Editar Regra'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Veículo (opcional)" value={form.vehicle_id || ''} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
              <option value="">Todos</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Select label="Passeio (opcional)" value={form.tour_id || ''} onChange={(e) => setForm({ ...form, tour_id: e.target.value })}>
              <option value="">Todos</option>
              {tours.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
          <Select label="Região (opcional)" value={form.region_id || ''} onChange={(e) => setForm({ ...form, region_id: e.target.value })}>
            <option value="">Todas</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select label="Modo de precificação" value={form.pricing_mode} onChange={(e) => setForm({ ...form, pricing_mode: e.target.value })}>
            <option value="per_vehicle">Por veículo</option>
            <option value="fixed">Fixo</option>
            <option value="override">Override</option>
          </Select>
          <Input label="Preço (R$)" type="number" min={0} step={0.01} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Min. pessoas" type="number" min={1} value={form.min_people || ''} onChange={(e) => setForm({ ...form, min_people: e.target.value })} placeholder="Opcional" />
            <Input label="Máx. pessoas" type="number" min={1} value={form.max_people || ''} onChange={(e) => setForm({ ...form, max_people: e.target.value })} placeholder="Opcional" />
          </div>
          <Button type="submit" className="w-full" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar Regra'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
