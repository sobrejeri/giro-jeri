import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Route, ImagePlus, X } from 'lucide-react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select, Textarea } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

const TOUR_EMPTY = {
  name: '', short_description: '', duration_hours: 2, max_people: 10,
  is_private_enabled: true, is_shared_enabled: false,
  shared_price_per_person: '', cover_image_url: '', is_active: true,
}
const TRANSFER_EMPTY = { name: '', description: '', pricing_mode: 'fixed_route', is_active: true }
const ROUTE_EMPTY   = { origin_name: '', destination_name: '', default_price: '', is_active: true }

const TABS = [
  { key: 'tours',    label: 'Passeios'  },
  { key: 'transfers', label: 'Transfers' },
]

export default function Catalogo() {
  const [tab, setTab]       = useState('tours')
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({})
  const [routeModal, setRouteModal] = useState(null)
  const [routeForm, setRouteForm]   = useState({})
  const [imageFile, setImageFile]   = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading]   = useState(false)
  const fileRef = useRef(null)
  const qc = useQueryClient()

  const { data: tours = [], isLoading: l1 } = useQuery({
    queryKey: ['admin-tours'],
    queryFn:  () => api.getTours().then((r) => r.data || r),
  })
  const { data: transfers = [], isLoading: l2 } = useQuery({
    queryKey: ['admin-transfers'],
    queryFn:  () => api.getTransfers().then((r) => r.data || r),
  })
  const { data: routes = [], isLoading: l3 } = useQuery({
    queryKey: ['admin-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })

  const tourMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createTour(body) : api.updateTour(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tours'] }); setModal(null) },
  })
  const deleteTourMut = useMutation({
    mutationFn: (id) => api.deleteTour(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-tours'] }),
  })
  const transferMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createTransfer(body) : api.updateTransfer(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-transfers'] }); setModal(null) },
  })
  const routeMut = useMutation({
    mutationFn: (body) =>
      routeModal?.isNew ? api.createTransferRoute(body) : api.updateTransferRoute(routeModal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-routes'] }); setRouteModal(null) },
  })
  const deleteRouteMut = useMutation({
    mutationFn: (id) => api.deleteTransferRoute(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-routes'] }),
  })

  function openNewTour() {
    setForm(TOUR_EMPTY); setImageFile(null); setImagePreview(null)
    setModal({ isNew: true })
  }
  function openEditTour(t) {
    setForm({ ...t }); setImageFile(null); setImagePreview(t.cover_image_url || null)
    setModal(t)
  }
  function openNewTransfer()   { setForm(TRANSFER_EMPTY); setModal({ isNew: true, _type: 'transfer' }) }
  function openEditTransfer(t) { setForm({ ...t });        setModal({ ...t, _type: 'transfer' }) }
  function openNewRoute()      { setRouteForm(ROUTE_EMPTY); setRouteModal({ isNew: true }) }
  function openEditRoute(r)    { setRouteForm({ ...r });    setRouteModal(r) }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  async function uploadImage(file) {
    const ext  = file.name.split('.').pop()
    const path = `tours/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('tour-images').upload(path, file, { upsert: true })
    if (error) throw error
    return supabase.storage.from('tour-images').getPublicUrl(path).data.publicUrl
  }

  async function handleTourSubmit(e) {
    e.preventDefault()
    let body = {
      ...form,
      duration_hours: Number(form.duration_hours),
      max_people:     Number(form.max_people),
    }
    if (imageFile) {
      setUploading(true)
      try { body.cover_image_url = await uploadImage(imageFile) }
      catch { alert('Erro ao fazer upload da imagem'); setUploading(false); return }
      setUploading(false)
    }
    tourMut.mutate(body)
  }

  function handleTransferSubmit(e) {
    e.preventDefault()
    transferMut.mutate(form)
  }
  function handleRouteSubmit(e) {
    e.preventDefault()
    routeMut.mutate({ ...routeForm, default_price: Number(routeForm.default_price) })
  }

  const isTransferModal = modal?._type === 'transfer'
  const loading = l1 || l2
  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-gray-700 text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tours */}
      {tab === 'tours' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Passeios ({tours.length})</h2>
              <Button size="sm" onClick={openNewTour}><Plus size={14} /> Novo Passeio</Button>
            </div>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {tours.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                {t.cover_image_url ? (
                  <img src={t.cover_image_url} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-700 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">{t.name}</p>
                  <p className="text-xs text-gray-500">
                    {t.duration_hours}h · cap. {t.max_people}
                    {t.is_private_enabled && ' · Privativo'}
                    {t.is_shared_enabled && ' · Compartilhado'}
                  </p>
                </div>
                <Badge value={String(t.is_active)} />
                <div className="flex gap-1">
                  <button onClick={() => openEditTour(t)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => confirm('Desativar passeio?') && deleteTourMut.mutate(t.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {tours.length === 0 && <CardBody><p className="text-sm text-gray-600">Nenhum passeio</p></CardBody>}
          </div>
        </Card>
      )}

      {/* Transfers */}
      {tab === 'transfers' && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-300">Transfers ({transfers.length})</h2>
                <Button size="sm" onClick={openNewTransfer}><Plus size={14} /> Novo Transfer</Button>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-800">
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.pricing_mode}</p>
                  </div>
                  <Badge value={String(t.is_active)} />
                  <button onClick={() => openEditTransfer(t)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
              {transfers.length === 0 && <CardBody><p className="text-sm text-gray-600">Nenhum transfer</p></CardBody>}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Route size={16} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-300">Rotas Tabeladas ({routes.length})</h2>
                </div>
                <Button size="sm" variant="secondary" onClick={openNewRoute}><Plus size={14} /> Nova Rota</Button>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-800">
              {routes.map((r) => (
                <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{r.origin_name} → {r.destination_name}</p>
                    <p className="text-xs text-gray-500">{r.transfers?.name}</p>
                  </div>
                  <span className="text-sm font-bold text-brand">
                    {Number(r.default_price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => openEditRoute(r)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => confirm('Remover rota?') && deleteRouteMut.mutate(r.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {routes.length === 0 && <CardBody><p className="text-sm text-gray-600">Nenhuma rota</p></CardBody>}
            </div>
          </Card>
        </>
      )}

      {/* Modal tour / transfer */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.isNew
          ? (isTransferModal ? 'Novo Transfer' : 'Novo Passeio')
          : (isTransferModal ? 'Editar Transfer' : 'Editar Passeio')}
      >
        {isTransferModal ? (
          <form onSubmit={handleTransferSubmit} className="space-y-4">
            <Input label="Nome" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Textarea label="Descrição" rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Select label="Modo de precificação" value={form.pricing_mode || 'fixed_route'} onChange={(e) => setForm({ ...form, pricing_mode: e.target.value })}>
              <option value="fixed_route">Rota tabelada</option>
              <option value="by_vehicle">Por veículo</option>
              <option value="manual_quote">Cotação manual</option>
            </Select>
            <Button type="submit" className="w-full" disabled={transferMut.isPending}>
              {transferMut.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleTourSubmit} className="space-y-4">
            {/* Foto de capa */}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1.5">Foto de capa</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} className="w-full h-32 object-cover rounded-xl" />
                  <button type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); setForm({ ...form, cover_image_url: '' }) }}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors"
                >
                  <ImagePlus size={20} />
                  <span className="text-xs">Clique para adicionar imagem</span>
                </button>
              )}
            </div>

            <Input label="Nome" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Textarea label="Descrição" rows={2} value={form.short_description || ''} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Duração (horas)" type="number" min={0.5} step={0.5}
                value={form.duration_hours || ''} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} />
              <Input label="Capacidade máx." type="number" min={1}
                value={form.max_people || ''} onChange={(e) => setForm({ ...form, max_people: e.target.value })} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400">Modalidades</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-brand"
                  checked={!!form.is_private_enabled}
                  onChange={(e) => setForm({ ...form, is_private_enabled: e.target.checked })} />
                <span className="text-sm text-gray-300">Privativo (preço por veículo)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-brand"
                  checked={!!form.is_shared_enabled}
                  onChange={(e) => setForm({ ...form, is_shared_enabled: e.target.checked })} />
                <span className="text-sm text-gray-300">Compartilhado (preço por pessoa)</span>
              </label>
            </div>

            {form.is_shared_enabled && (
              <Input label="Preço por pessoa (compartilhado)" type="number" min={0} step={0.01}
                value={form.shared_price_per_person || ''}
                onChange={(e) => setForm({ ...form, shared_price_per_person: e.target.value })} />
            )}

            <Button type="submit" className="w-full" disabled={tourMut.isPending || uploading}>
              {uploading ? 'Enviando imagem…' : tourMut.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        )}
      </Modal>

      {/* Modal rota */}
      <Modal open={!!routeModal} onClose={() => setRouteModal(null)} title={routeModal?.isNew ? 'Nova Rota' : 'Editar Rota'} size="sm">
        <form onSubmit={handleRouteSubmit} className="space-y-4">
          <Input label="Origem" value={routeForm.origin_name || ''} onChange={(e) => setRouteForm({ ...routeForm, origin_name: e.target.value })} required />
          <Input label="Destino" value={routeForm.destination_name || ''} onChange={(e) => setRouteForm({ ...routeForm, destination_name: e.target.value })} required />
          <Input label="Preço padrão (R$)" type="number" min={0} step={0.01}
            value={routeForm.default_price || ''} onChange={(e) => setRouteForm({ ...routeForm, default_price: e.target.value })} required />
          <Button type="submit" className="w-full" disabled={routeMut.isPending}>
            {routeMut.isPending ? 'Salvando…' : 'Salvar Rota'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
