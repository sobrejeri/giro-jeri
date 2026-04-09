import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Globe } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

const EMPTY = { name: '', slug: '', timezone: 'America/Fortaleza', currency: 'BRL', is_active: true }

export default function Regioes() {
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState(EMPTY)
  const qc = useQueryClient()

  const { data: regions = [], isLoading } = useQuery({
    queryKey: ['regions'],
    queryFn:  () => api.getRegions(),
  })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createRegion(body) : api.updateRegion(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['regions'] }); setModal(null) },
  })

  function openNew()  { setForm(EMPTY); setModal({ isNew: true }) }
  function openEdit(r) { setForm({ name: r.name, slug: r.slug, timezone: r.timezone || 'America/Fortaleza', currency: r.currency || 'BRL', is_active: r.is_active }); setModal(r) }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate(form)
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus size={16} /> Nova Região</Button>
      </div>

      {regions.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <Globe size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma região cadastrada.</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-gray-800">
            {regions.map((r) => (
              <div key={r.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-lg bg-gray-900 flex items-center justify-center text-gray-500 flex-shrink-0">
                  <Globe size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200">{r.name}</p>
                  <p className="text-xs text-gray-500">{r.slug} · {r.timezone} · {r.currency}</p>
                </div>
                <Badge value={String(r.is_active)} />
                <button onClick={() => openEdit(r)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                  <Pencil size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Nova Região' : 'Editar Região'} size="sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jericoacoara" required />
          <Input label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="jericoacoara" required />
          <Input label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/Fortaleza" />
          <Input label="Moeda" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="BRL" />
          <Button type="submit" className="w-full" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
