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
  name: '',
  category_id: '',
  duration_hours: '',
  min_people: 1,
  max_people: 10,
  is_shared_enabled: true,
  shared_price_per_person: '',
  is_private_enabled: false,
  is_featured: false,
  highlight_badge: '',
  short_description: '',
  includes_text: '',
  cancellation_policy_text: '',
  is_active: true,
}

export default function Passeios() {
  const [modal, setModal] = useState(null) // null | 'new' | tour obj
  const [form, setForm]   = useState(EMPTY)
  const qc                = useQueryClient()

  const { data: tours = [], isLoading } = useQuery({
    queryKey: ['catalog-tours'],
    queryFn:  () => api.getCatalogTours(),
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn:  () => api.getCategories(),
  })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal === 'new'
        ? api.createCatalogTour(body)
        : api.updateCatalogTour(modal.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog-tours'] })
      setModal(null)
    },
  })

  const toggleMut = useMutation({
    mutationFn: (t) => api.toggleCatalogTour(t.id, !t.is_active),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['catalog-tours'] }),
  })

  function openNew() {
    setForm(EMPTY)
    setModal('new')
  }

  function openEdit(t) {
    setForm({
      name:                     t.name || '',
      category_id:              t.category_id || '',
      duration_hours:           t.duration_hours || '',
      min_people:               t.min_people || 1,
      max_people:               t.max_people || 10,
      is_shared_enabled:        !!t.is_shared_enabled,
      shared_price_per_person:  t.shared_price_per_person || '',
      is_private_enabled:       !!t.is_private_enabled,
      is_featured:              !!t.is_featured,
      highlight_badge:          t.highlight_badge || '',
      short_description:        t.short_description || '',
      includes_text:            t.includes_text || '',
      cancellation_policy_text: t.cancellation_policy_text || '',
      is_active:                !!t.is_active,
    })
    setModal(t)
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({
      ...form,
      category_id:             form.category_id || null,
      duration_hours:          form.duration_hours !== '' ? Number(form.duration_hours) : null,
      min_people:              Number(form.min_people),
      max_people:              Number(form.max_people),
      shared_price_per_person: form.shared_price_per_person !== '' ? Number(form.shared_price_per_person) : null,
    })
  }

  if (isLoading) return <PageSpinner />

  const active   = tours.filter((t) => t.is_active)
  const inactive = tours.filter((t) => !t.is_active)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus size={16} /> Novo Passeio
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
          <CardBody><p className="text-sm text-gray-400">Nenhum passeio ativo.</p></CardBody>
        ) : (
          <div className="divide-y divide-gray-50">
            {active.map((t) => (
              <TourRow key={t.id} t={t} onEdit={openEdit} onToggle={toggleMut.mutate} />
            ))}
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
            {inactive.map((t) => (
              <TourRow key={t.id} t={t} onEdit={openEdit} onToggle={toggleMut.mutate} />
            ))}
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === 'new' ? 'Novo Passeio' : 'Editar Passeio'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome do passeio"
            placeholder="Ex: Passeio de Buggy nas Lagoas"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />

          <Select
            label="Categoria"
            value={form.category_id}
            onChange={(e) => set('category_id', e.target.value)}
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Duração (h)"
              type="number"
              min={0.5}
              step={0.5}
              placeholder="Ex: 3"
              value={form.duration_hours}
              onChange={(e) => set('duration_hours', e.target.value)}
            />
            <Input
              label="Mín. pessoas"
              type="number"
              min={1}
              value={form.min_people}
              onChange={(e) => set('min_people', e.target.value)}
            />
            <Input
              label="Máx. pessoas"
              type="number"
              min={1}
              value={form.max_people}
              onChange={(e) => set('max_people', e.target.value)}
            />
          </div>

          {/* Compartilhado */}
          <div className="flex items-center gap-3">
            <input
              id="shared"
              type="checkbox"
              checked={form.is_shared_enabled}
              onChange={(e) => set('is_shared_enabled', e.target.checked)}
              className="w-4 h-4 accent-brand"
            />
            <label htmlFor="shared" className="text-sm font-medium text-gray-700">
              Modo compartilhado habilitado
            </label>
          </div>

          {form.is_shared_enabled && (
            <Input
              label="Preço por pessoa (R$)"
              type="number"
              min={0}
              step={0.01}
              placeholder="Ex: 150.00"
              value={form.shared_price_per_person}
              onChange={(e) => set('shared_price_per_person', e.target.value)}
            />
          )}

          {/* Privativo */}
          <div className="flex items-center gap-3">
            <input
              id="private"
              type="checkbox"
              checked={form.is_private_enabled}
              onChange={(e) => set('is_private_enabled', e.target.checked)}
              className="w-4 h-4 accent-brand"
            />
            <label htmlFor="private" className="text-sm font-medium text-gray-700">
              Modo privativo habilitado
            </label>
          </div>

          {/* Destaque */}
          <div className="flex items-center gap-3">
            <input
              id="featured"
              type="checkbox"
              checked={form.is_featured}
              onChange={(e) => set('is_featured', e.target.checked)}
              className="w-4 h-4 accent-brand"
            />
            <label htmlFor="featured" className="text-sm font-medium text-gray-700">
              Exibir em destaque
            </label>
          </div>

          <Input
            label="Badge de destaque (opcional)"
            placeholder="Ex: Mais vendido"
            value={form.highlight_badge}
            onChange={(e) => set('highlight_badge', e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição curta</label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              placeholder="Resumo em 1-2 frases"
              value={form.short_description}
              onChange={(e) => set('short_description', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              O que inclui <span className="font-normal text-gray-400">(separado por vírgulas)</span>
            </label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              placeholder="Ex: Guia, Seguro, Água"
              value={form.includes_text}
              onChange={(e) => set('includes_text', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Política de cancelamento</label>
            <textarea
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              placeholder="Ex: Cancelamento gratuito até 24h antes"
              value={form.cancellation_policy_text}
              onChange={(e) => set('cancellation_policy_text', e.target.value)}
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

function TourRow({ t, onEdit, onToggle }) {
  const modeLabel = [
    t.is_shared_enabled && 'Compartilhado',
    t.is_private_enabled && 'Privativo',
  ].filter(Boolean).join(' · ') || '—'

  return (
    <div className={`flex items-center gap-4 px-5 py-3 ${!t.is_active ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
          {t.highlight_badge && (
            <span className="text-[10px] font-semibold bg-brand/10 text-brand px-2 py-0.5 rounded-full shrink-0">
              {t.highlight_badge}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">
          {t.categories?.name || t.category?.name || 'Sem categoria'}
          {t.duration_hours ? ` · ${t.duration_hours}h` : ''}
          {' · '}{modeLabel}
          {t.shared_price_per_person ? ` · R$ ${Number(t.shared_price_per_person).toFixed(2)}/pax` : ''}
        </p>
      </div>
      <button
        onClick={() => onEdit(t)}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={() => onToggle(t)}
        className={`p-1.5 rounded-lg transition-colors ${t.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
        title={t.is_active ? 'Desativar' : 'Ativar'}
      >
        {t.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
      </button>
    </div>
  )
}
