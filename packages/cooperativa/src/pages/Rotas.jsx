import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const EMPTY = {
  transfer_id: '',
  origin_name: '',
  destination_name: '',
  default_price: '',
  night_fee: '',
  extra_stop_price: '',
  is_active: true,
}

export default function Rotas() {
  const [modal, setModal] = useState(null) // null | 'new' | route obj
  const [form, setForm]   = useState(EMPTY)
  const qc                = useQueryClient()

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['catalog-routes'],
    queryFn:  () => api.getCatalogRoutes(),
  })

  const { data: transfers = [] } = useQuery({
    queryKey: ['catalog-transfers'],
    queryFn:  () => api.getCatalogTransfers(),
  })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal === 'new'
        ? api.createCatalogRoute(body)
        : api.updateCatalogRoute(modal.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-routes'] })
      setModal(null)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (r) => api.toggleCatalogRoute(r.id, !r.is_active),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['catalog-routes'] }),
  })

  function openNew() {
    setForm({ ...EMPTY, transfer_id: transfers[0]?.id || '' })
    setModal('new')
  }

  function openEdit(r) {
    setForm({
      transfer_id:      r.transfer_id || '',
      origin_name:      r.origin_name || '',
      destination_name: r.destination_name || '',
      default_price:    r.default_price || '',
      night_fee:        r.night_fee || '',
      extra_stop_price: r.extra_stop_price || '',
      is_active:        !!r.is_active,
    })
    setModal(r)
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({
      ...form,
      transfer_id:      form.transfer_id || null,
      default_price:    form.default_price !== '' ? Number(form.default_price) : null,
      night_fee:        form.night_fee !== '' ? Number(form.night_fee) : null,
      extra_stop_price: form.extra_stop_price !== '' ? Number(form.extra_stop_price) : null,
    })
  }

  if (isLoading) return <PageSpinner />

  const active   = routes.filter((r) => r.is_active)
  const inactive = routes.filter((r) => !r.is_active)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus size={16} /> Nova Rota
        </Button>
      </div>

      {/* Ativos */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-700">
            Ativas <span className="text-gray-400 font-normal">({active.length})</span>
          </h2>
        </CardHeader>
        {active.length === 0 ? (
          <CardBody><p className="text-sm text-gray-400">Nenhuma rota ativa.</p></CardBody>
        ) : (
          <div className="divide-y divide-gray-50">
            {active.map((r) => (
              <RouteRow key={r.id} r={r} onEdit={openEdit} onToggle={toggleMut.mutate} />
            ))}
          </div>
        )}
      </Card>

      {/* Inativas */}
      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-400">
              Inativas ({inactive.length})
            </h2>
          </CardHeader>
          <div className="divide-y divide-gray-50">
            {inactive.map((r) => (
              <RouteRow key={r.id} r={r} onEdit={openEdit} onToggle={toggleMut.mutate} />
            ))}
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'new' ? 'Nova Rota' : 'Editar Rota'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Serviço de transfer"
            value={form.transfer_id}
            onChange={(e) => set('transfer_id', e.target.value)}
          >
            <option value="">Selecione um serviço</option>
            {transfers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>

          <Input
            label="Origem"
            placeholder="Ex: Aeroporto de Fortaleza"
            value={form.origin_name}
            onChange={(e) => set('origin_name', e.target.value)}
            required
          />

          <Input
            label="Destino"
            placeholder="Ex: Jericoacoara"
            value={form.destination_name}
            onChange={(e) => set('destination_name', e.target.value)}
            required
          />

          <Input
            label="Preço padrão (R$)"
            type="number"
            min={0}
            step={0.01}
            placeholder="Ex: 350.00"
            value={form.default_price}
            onChange={(e) => set('default_price', e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Taxa noturna (R$)"
              type="number"
              min={0}
              step={0.01}
              placeholder="Ex: 50.00"
              value={form.night_fee}
              onChange={(e) => set('night_fee', e.target.value)}
            />
            <Input
              label="Parada extra (R$)"
              type="number"
              min={0}
              step={0.01}
              placeholder="Ex: 30.00"
              value={form.extra_stop_price}
              onChange={(e) => set('extra_stop_price', e.target.value)}
            />
          </div>

          {saveMut.isError && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">
              {saveMut.error?.message || 'Erro ao salvar'}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}

function RouteRow({ r, onEdit, onToggle }) {
  return (
    <div className={`flex items-center gap-4 px-5 py-3 ${!r.is_active ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {r.origin_name} → {r.destination_name}
        </p>
        <p className="text-xs text-gray-400">
          {r.transfers?.name || '—'}
          {r.default_price ? ` · R$ ${Number(r.default_price).toFixed(2)}` : ''}
          {r.night_fee ? ` · noturna +R$ ${Number(r.night_fee).toFixed(2)}` : ''}
        </p>
      </div>
      <button
        onClick={() => onEdit(r)}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={() => onToggle(r)}
        className={`p-1.5 rounded-lg transition-colors ${r.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
        title={r.is_active ? 'Desativar' : 'Ativar'}
      >
        {r.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
      </button>
    </div>
  )
}
