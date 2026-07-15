import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Route, ImagePlus, X, Car, Users } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select, Textarea } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

// Horários pré-definidos para o limite de solicitação (30 em 30 min, 06h–22h).
const CUTOFF_TIME_OPTIONS = (() => {
  const opts = []
  for (let h = 6; h <= 22; h++) {
    for (const m of ['00', '30']) {
      if (h === 22 && m === '30') break
      opts.push(`${String(h).padStart(2, '0')}:${m}`)
    }
  }
  return opts
})()

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    + '-' + Date.now().toString(36)
}

// Redimensiona uma imagem no navegador. Mantém transparência para PNG/WEBP/GIF
// (saída PNG); os demais formatos (JPEG, HEIC do iPhone…) viram JPEG.
function fileToResizedDataUrl(file, max = 1280, quality = 0.82) {
  const keepAlpha = /png|webp|gif/i.test(file.type || '')
  const outType   = keepAlpha ? 'image/png' : 'image/jpeg'
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale  = Math.min(1, max / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL(outType, quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

const TOUR_EMPTY = {
  name: '', short_description: '', duration_hours: 2, max_people: 10,
  is_private_enabled: true, is_shared_enabled: false,
  shared_price_per_person: '', cover_image_url: '', is_active: true,
  latitude: null, longitude: null, service_radius_km: null,
  booking_cutoff_time: '', min_advance_hours: '', region_ids: [], is_featured: false, display_order: 0,
  is_exclusive: false,
}
const TRANSFER_EMPTY = {
  name: '', short_description: '', pricing_mode: 'fixed_route', is_active: true,
  latitude: null, longitude: null, service_radius_km: null,
  booking_cutoff_time: '', min_advance_hours: '', region_ids: [],
}
const ROUTE_EMPTY   = { origin_name: '', destination_name: '', default_price: '', is_active: true, is_featured: false }
const VEHICLE_EMPTY = {
  name: '', vehicle_type: 'buggy', description: '',
  seat_capacity: 4, luggage_capacity: 4,
  is_private_allowed: true, is_shared_allowed: false,
  is_transfer_allowed: false, is_tour_allowed: true,
  is_active: true,
  latitude: null, longitude: null, service_radius_km: null,
  region_ids: [],
}

const VEHICLE_TYPES = [
  { value: 'buggy',      label: 'Buggy' },
  { value: 'jardineira', label: 'Jardineira' },
  { value: 'hilux_4x4', label: 'Hilux 4x4' },
  { value: 'boat',       label: 'Barco' },
  { value: 'van',        label: 'Van' },
  { value: 'sedan',      label: 'Sedan' },
  { value: 'suv',        label: 'SUV' },
  { value: 'other',      label: 'Outro' },
]

const TABS = [
  { key: 'tours',    label: 'Passeios'  },
  { key: 'transfers', label: 'Transfers' },
  { key: 'vehicles', label: 'Veículos'  },
]

export default function Catalogo() {
  const [tab, setTab]       = useState('tours')
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({})
  const [routeModal, setRouteModal] = useState(null)
  const [routeForm, setRouteForm]   = useState({})
  const [vehicleModal, setVehicleModal] = useState(null)
  const [vehicleForm, setVehicleForm]   = useState({})
  const [imageFile, setImageFile]   = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [vehicleImageFile, setVehicleImageFile]   = useState(null)
  const [vehicleImagePreview, setVehicleImagePreview] = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [filterRegion, setFilterRegion] = useState(null)
  const fileRef        = useRef(null)
  const vehicleFileRef = useRef(null)
  const qc = useQueryClient()

  const { data: regionData } = useQuery({
    queryKey: ['regions'],
    queryFn:  () => api.getRegions(),
  })
  const regionId = regionData?.[0]?.id
  const allRegions = Array.isArray(regionData) ? regionData.filter((r) => r.is_active) : []

  const { data: tours = [], isLoading: l1 } = useQuery({
    queryKey: ['admin-tours'],
    queryFn:  () => api.getTours(),
  })
  const { data: transfers = [], isLoading: l2 } = useQuery({
    queryKey: ['admin-transfers'],
    queryFn:  () => api.getTransfers().then((r) => r.data || r),
  })
  const { data: routes = [], isLoading: l3 } = useQuery({
    queryKey: ['admin-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })
  const { data: vehicles = [], isLoading: l4 } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  () => api.getVehicles(),
  })

  const byRegion = (item) => !filterRegion || (item.region_ids || []).includes(filterRegion)
  const filteredTours     = tours.filter(byRegion)
  const filteredTransfers = transfers.filter(byRegion)
  const filteredVehicles  = vehicles.filter(byRegion)

  function RegionTags({ ids }) {
    if (!ids?.length) return null
    const names = ids.map((id) => allRegions.find((r) => r.id === id)?.name).filter(Boolean)
    if (!names.length) return null
    return <span className="text-[10px] text-brand/60 ml-1">{names.join(' · ')}</span>
  }

  /* ── Tour mutations ──────────────────────────────────────── */
  const tourMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createTour(body) : api.updateTour(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tours'] }); setModal(null) },
  })
  const deleteTourMut = useMutation({
    mutationFn: (id) => api.deleteTour(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-tours'] }),
  })

  /* ── Transfer mutations ──────────────────────────────────── */
  const transferMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createTransfer(body) : api.updateTransfer(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-transfers'] }); setModal(null) },
    onError:   (err) => alert(err?.message || 'Erro ao salvar o transfer.'),
  })
  const routeMut = useMutation({
    mutationFn: (body) =>
      routeModal?.isNew ? api.createTransferRoute(body) : api.updateTransferRoute(routeModal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-routes'] }); setRouteModal(null) },
    onError:   (err) => alert(err?.message || 'Erro ao salvar a rota.'),
  })
  const deleteRouteMut = useMutation({
    mutationFn: (id) => api.deleteTransferRoute(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-routes'] }),
  })

  /* ── Vehicle mutations ───────────────────────────────────── */
  const vehicleMut = useMutation({
    mutationFn: (body) =>
      vehicleModal?.isNew
        ? api.createVehicle(body)
        : api.updateVehicle(vehicleModal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); setVehicleModal(null) },
    onError:   (err) => alert(`Erro ao salvar veículo: ${err.message}`),
  })
  const deleteVehicleMut = useMutation({
    mutationFn: (id) => api.deleteVehicle(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  })

  /* ── Open/close handlers ─────────────────────────────────── */
  function openNewTour() {
    setForm(TOUR_EMPTY); setImageFile(null); setImagePreview(null)
    setModal({ isNew: true })
  }
  function openEditTour(t) {
    setForm({ ...t, region_ids: t.region_ids || [] }); setImageFile(null); setImagePreview(t.cover_image_url || null)
    setModal(t)
  }
  function openNewTransfer()   { setForm(TRANSFER_EMPTY); setModal({ isNew: true, _type: 'transfer' }) }
  function openEditTransfer(t) { setForm({ ...t, region_ids: t.region_ids || [] }); setModal({ ...t, _type: 'transfer' }) }
  function openNewRoute()      { setRouteForm(ROUTE_EMPTY); setRouteModal({ isNew: true }) }
  function openEditRoute(r)    { setRouteForm({ ...r });    setRouteModal(r) }

  function openNewVehicle() {
    setVehicleForm(VEHICLE_EMPTY)
    setVehicleImageFile(null); setVehicleImagePreview(null)
    setVehicleModal({ isNew: true })
  }
  function openEditVehicle(v) {
    setVehicleForm({ ...v, region_ids: v.region_ids || [] })
    setVehicleImageFile(null); setVehicleImagePreview(v.image_url || null)
    setVehicleModal(v)
  }

  /* ── Image handling ──────────────────────────────────────── */
  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleVehicleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setVehicleImageFile(file)
    setVehicleImagePreview(URL.createObjectURL(file))
  }

  async function uploadImage(file, folder = 'tours') {
    // Converte qualquer formato (inclui HEIC do iPhone) para JPEG redimensionado
    // e envia em base64. Evita o bucket rejeitar formatos não suportados.
    const dataUrl = await fileToResizedDataUrl(file, 1280)
    const result  = await api.uploadSiteImage(dataUrl, folder)
    return result?.url || (typeof result === 'string' ? result : null)
  }

  /* ── Submit handlers ─────────────────────────────────────── */
  async function handleTourSubmit(e) {
    e.preventDefault()
    let body = {
      ...form,
      duration_hours: Number(form.duration_hours),
      max_people:     Number(form.max_people),
      display_order:  Number(form.display_order) || 0,
      is_featured:    !!form.is_featured,
    }
    if (modal?.isNew) {
      body.slug      = slugify(form.name)
      body.region_id = regionId
    }
    body.region_ids = form.region_ids || []
    if (imageFile) {
      setUploading(true)
      try { body.cover_image_url = await uploadImage(imageFile, 'tours') }
      catch { alert('Erro ao fazer upload da imagem'); setUploading(false); return }
      setUploading(false)
    }
    tourMut.mutate(body)
  }

  function handleTransferSubmit(e) {
    e.preventDefault()
    // Remove objetos de relação (joins) e campos read-only antes de salvar
    const { transfer_routes: _tr, regions: _rg, id: _id, created_at: _ca, updated_at: _ua, ...clean } = form
    transferMut.mutate(clean)
  }

  function handleRouteSubmit(e) {
    e.preventDefault()
    routeMut.mutate({ ...routeForm, default_price: Number(routeForm.default_price) })
  }

  async function handleVehicleSubmit(e) {
    e.preventDefault()

    if (!regionId) {
      alert('Nenhuma região encontrada. Execute o SQL de seed (migrations/005_seed_dados_reais.sql) no Supabase antes de criar veículos.')
      return
    }

    // Remove campos que não são colunas da tabela (joins, metadados auto)
    const { regions: _r, id: _id, created_at: _ca, updated_at: _ua, ...cleanForm } = vehicleForm
    let body = {
      ...cleanForm,
      seat_capacity:    Number(vehicleForm.seat_capacity),
      luggage_capacity: Number(vehicleForm.luggage_capacity) || 0,
      region_id:        regionId,
      region_ids:       vehicleForm.region_ids || [],
    }
    if (vehicleModal?.isNew) {
      body.slug = slugify(vehicleForm.name)
    }
    if (vehicleImageFile) {
      setUploading(true)
      try {
        body.image_url = await uploadImage(vehicleImageFile, 'vehicles')
      } catch {
        // Upload falhou — salva sem imagem
        console.warn('Upload de imagem falhou, salvando sem imagem')
      }
      setUploading(false)
    }
    vehicleMut.mutate(body)
  }

  function CidadesSelector({ value, onChange }) {
    const selected  = value || []
    const available = allRegions.filter((r) => !selected.includes(r.id))
    return (
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">
          Municípios de atuação
          <span className="ml-1 font-normal text-gray-600">(onde o serviço aparece no app)</span>
        </p>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selected.map((id) => {
              const r = allRegions.find((r) => r.id === id)
              if (!r) return null
              return (
                <span key={id} className="inline-flex items-center gap-1 bg-brand/20 text-brand text-xs font-medium px-2.5 py-1 rounded-full">
                  {r.name}
                  <button type="button" onClick={() => onChange(selected.filter((x) => x !== id))} className="ml-0.5 text-brand/60 hover:text-brand">
                    <X size={11} />
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {available.length > 0 ? (
          <select
            className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-brand"
            value=""
            onChange={(e) => { if (e.target.value) onChange([...selected, e.target.value]) }}
          >
            <option value="">+ Adicionar município…</option>
            {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : selected.length > 0 ? (
          <p className="text-xs text-gray-600">Todos os municípios adicionados</p>
        ) : (
          <p className="text-xs text-gray-600">Nenhum município disponível</p>
        )}
      </div>
    )
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

      {/* Filtro por município */}
      {allRegions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterRegion(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !filterRegion ? 'bg-brand text-white border-brand' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            Todos
          </button>
          {allRegions.map((r) => (
            <button
              key={r.id}
              onClick={() => setFilterRegion(filterRegion === r.id ? null : r.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterRegion === r.id ? 'bg-brand text-white border-brand' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Tours ──────────────────────────────────────────────── */}
      {tab === 'tours' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Passeios ({filteredTours.length}{filterRegion ? `/${tours.length}` : ''})</h2>
              <Button size="sm" onClick={openNewTour}><Plus size={14} /> Novo Passeio</Button>
            </div>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {filteredTours.map((t) => (
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
                    <RegionTags ids={t.region_ids} />
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
            {filteredTours.length === 0 && <CardBody><p className="text-sm text-gray-600">{filterRegion ? 'Nenhum passeio neste município' : 'Nenhum passeio'}</p></CardBody>}
          </div>
        </Card>
      )}

      {/* ── Transfers ──────────────────────────────────────────── */}
      {tab === 'transfers' && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-300">Transfers ({filteredTransfers.length}{filterRegion ? `/${transfers.length}` : ''})</h2>
                <Button size="sm" onClick={openNewTransfer}><Plus size={14} /> Novo Transfer</Button>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-800">
              {filteredTransfers.map((t) => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.pricing_mode}<RegionTags ids={t.region_ids} /></p>
                  </div>
                  <Badge value={String(t.is_active)} />
                  <button onClick={() => openEditTransfer(t)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
              {filteredTransfers.length === 0 && <CardBody><p className="text-sm text-gray-600">{filterRegion ? 'Nenhum transfer neste município' : 'Nenhum transfer'}</p></CardBody>}
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

      {/* ── Veículos ───────────────────────────────────────────── */}
      {tab === 'vehicles' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car size={16} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-300">Veículos ({filteredVehicles.length}{filterRegion ? `/${vehicles.length}` : ''})</h2>
              </div>
              <Button size="sm" onClick={openNewVehicle}><Plus size={14} /> Novo Veículo</Button>
            </div>
          </CardHeader>
          {l4 ? (
            <CardBody><p className="text-sm text-gray-500">Carregando…</p></CardBody>
          ) : (
            <div className="divide-y divide-gray-800">
              {filteredVehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                  {v.image_url ? (
                    <img src={v.image_url} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
                      <Car size={16} className="text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{v.name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                      <span>{VEHICLE_TYPES.find((t) => t.value === v.vehicle_type)?.label || v.vehicle_type}</span>
                      <span>·</span>
                      <Users size={10} className="text-gray-500" />
                      <span>{v.seat_capacity} pax</span>
                      {v.is_tour_allowed && <span className="text-brand/70">· Passeios</span>}
                      {v.is_transfer_allowed && <span className="text-purple-400/70">· Transfer</span>}
                      {v.is_shared_allowed && <span className="text-amber-400/70">· Compartilhado</span>}
                      <RegionTags ids={v.region_ids} />
                    </div>
                  </div>
                  <Badge value={String(v.is_active)} />
                  <div className="flex gap-1">
                    <button onClick={() => openEditVehicle(v)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => confirm(`Desativar "${v.name}"?`) && deleteVehicleMut.mutate(v.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {vehicles.length === 0 && (
                <CardBody>
                  <div className="py-8 text-center">
                    <Car size={32} className="mx-auto text-gray-700 mb-2" />
                    <p className="text-sm text-gray-600">Nenhum veículo cadastrado.</p>
                    <p className="text-xs text-gray-700 mt-1">Cadastre veículos para que apareçam nos passeios privativos.</p>
                  </div>
                </CardBody>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── Modal tour / transfer ──────────────────────────────── */}
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
            <Textarea label="Descrição" rows={2} value={form.short_description || ''} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
            <Select label="Modo de precificação" value={form.pricing_mode || 'fixed_route'} onChange={(e) => setForm({ ...form, pricing_mode: e.target.value })}>
              <option value="fixed_route">Rota tabelada</option>
              <option value="by_vehicle">Por veículo</option>
              <option value="manual_quote">Cotação manual</option>
            </Select>
            {/* Horário limite */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Horário limite de solicitação
              </label>
              <select
                value={(form.booking_cutoff_time || '').slice(0, 5)}
                onChange={(e) => setForm({ ...form, booking_cutoff_time: e.target.value || null })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              >
                <option value="">Sem restrição</option>
                {(() => {
                  const cur  = (form.booking_cutoff_time || '').slice(0, 5)
                  const list = cur && !CUTOFF_TIME_OPTIONS.includes(cur)
                    ? [cur, ...CUTOFF_TIME_OPTIONS] : CUTOFF_TIME_OPTIONS
                  return list.map((t) => <option key={t} value={t}>{t}</option>)
                })()}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Após este horário, só aceita reservas a partir do dia seguinte. Deixe em branco para não restringir.
              </p>
            </div>

            {/* Antecedência mínima */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Antecedência mínima (horas)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Padrão"
                value={form.min_advance_hours ?? ''}
                onChange={(e) => setForm({ ...form, min_advance_hours: e.target.value })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Horas mínimas entre a reserva e o passeio. Deixe em branco para usar o padrão.
              </p>
            </div>

            <CidadesSelector
              value={form.region_ids}
              onChange={(next) => setForm((f) => ({ ...f, region_ids: next }))}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Ativo (visível para turistas)</span>
            </label>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {/* Horário limite de solicitação */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Horário limite de solicitação
              </label>
              <select
                value={(form.booking_cutoff_time || '').slice(0, 5)}
                onChange={(e) => setForm({ ...form, booking_cutoff_time: e.target.value || null })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              >
                <option value="">Sem restrição</option>
                {(() => {
                  const cur  = (form.booking_cutoff_time || '').slice(0, 5)
                  const list = cur && !CUTOFF_TIME_OPTIONS.includes(cur)
                    ? [cur, ...CUTOFF_TIME_OPTIONS] : CUTOFF_TIME_OPTIONS
                  return list.map((t) => <option key={t} value={t}>{t}</option>)
                })()}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Após este horário, o sistema só aceita reservas a partir do dia seguinte. Deixe em branco para não restringir.
              </p>
            </div>

            {/* Antecedência mínima */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Antecedência mínima (horas)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Padrão"
                value={form.min_advance_hours ?? ''}
                onChange={(e) => setForm({ ...form, min_advance_hours: e.target.value })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Horas mínimas entre a reserva e o transfer. Deixe em branco para usar o padrão.
              </p>
            </div>

            <CidadesSelector
              value={form.region_ids}
              onChange={(next) => setForm((f) => ({ ...f, region_ids: next }))}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Ativo (visível para turistas)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand"
                checked={!!form.is_featured}
                onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Destaque na home (carrossel "Passeios em destaque")</span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand mt-0.5"
                checked={!!form.is_exclusive}
                onChange={(e) => setForm({ ...form, is_exclusive: e.target.checked })}
              />
              <span className="text-sm text-gray-300">
                Passeio exclusivo (venda direta)
                <span className="block text-[11px] text-gray-500">
                  Não vai ao carrinho nem forma combo — o cliente solicita direto no "Resumo da reserva", um por vez.
                </span>
              </span>
            </label>

            <Input
              label="Ordem de exibição (menor aparece primeiro)"
              type="number" min={0}
              value={form.display_order ?? 0}
              onChange={(e) => setForm({ ...form, display_order: e.target.value })}
            />

            <Button type="submit" className="w-full" disabled={tourMut.isPending || uploading}>
              {uploading ? 'Enviando imagem…' : tourMut.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        )}
      </Modal>

      {/* ── Modal rota ─────────────────────────────────────────── */}
      <Modal open={!!routeModal} onClose={() => setRouteModal(null)} title={routeModal?.isNew ? 'Nova Rota' : 'Editar Rota'} size="sm">
        <form onSubmit={handleRouteSubmit} className="space-y-4">
          <Input label="Origem" value={routeForm.origin_name || ''} onChange={(e) => setRouteForm({ ...routeForm, origin_name: e.target.value })} required />
          <Input label="Destino" value={routeForm.destination_name || ''} onChange={(e) => setRouteForm({ ...routeForm, destination_name: e.target.value })} required />
          <Input label="Preço padrão (R$)" type="number" min={0} step={0.01}
            value={routeForm.default_price || ''} onChange={(e) => setRouteForm({ ...routeForm, default_price: e.target.value })} required />
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand mt-0.5"
              checked={!!routeForm.is_featured}
              onChange={(e) => setRouteForm({ ...routeForm, is_featured: e.target.checked })}
            />
            <span className="text-sm text-gray-300">
              Destaque na home
              <span className="block text-[11px] text-gray-500">Aparece no carrossel "Serviços em destaque" do app.</span>
            </span>
          </label>
          <Button type="submit" className="w-full" disabled={routeMut.isPending}>
            {routeMut.isPending ? 'Salvando…' : 'Salvar Rota'}
          </Button>
        </form>
      </Modal>

      {/* ── Modal veículo ──────────────────────────────────────── */}
      <Modal
        open={!!vehicleModal}
        onClose={() => setVehicleModal(null)}
        title={vehicleModal?.isNew ? 'Novo Veículo' : 'Editar Veículo'}
      >
        <form onSubmit={handleVehicleSubmit} className="space-y-4">
          {/* Foto do veículo */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1.5">Foto do veículo</p>
            <input ref={vehicleFileRef} type="file" accept="image/*" className="hidden" onChange={handleVehicleFileChange} />
            {vehicleImagePreview ? (
              <div className="relative">
                <img src={vehicleImagePreview} className="w-full h-28 object-cover rounded-xl" />
                <button type="button"
                  onClick={() => { setVehicleImageFile(null); setVehicleImagePreview(null); setVehicleForm({ ...vehicleForm, image_url: '' }) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => vehicleFileRef.current?.click()}
                className="w-full h-20 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors"
              >
                <ImagePlus size={18} />
                <span className="text-xs">Clique para adicionar imagem</span>
              </button>
            )}
          </div>

          <Input
            label="Nome"
            value={vehicleForm.name || ''}
            onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
            required
          />

          <Select
            label="Tipo de veículo"
            value={vehicleForm.vehicle_type || 'buggy'}
            onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>

          <Textarea
            label="Descrição"
            rows={2}
            value={vehicleForm.description || ''}
            onChange={(e) => setVehicleForm({ ...vehicleForm, description: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Capacidade (pax)"
              type="number" min={1}
              value={vehicleForm.seat_capacity || ''}
              onChange={(e) => setVehicleForm({ ...vehicleForm, seat_capacity: e.target.value })}
              required
            />
            <Input
              label="Bagagens"
              type="number" min={0}
              value={vehicleForm.luggage_capacity || ''}
              onChange={(e) => setVehicleForm({ ...vehicleForm, luggage_capacity: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400">Disponível para</p>
            {[
              { key: 'is_tour_allowed',     label: 'Passeios privativos' },
              { key: 'is_shared_allowed',   label: 'Passeios compartilhados' },
              { key: 'is_transfer_allowed', label: 'Transfer' },
              { key: 'is_private_allowed',  label: 'Contratação privada' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-brand"
                  checked={!!vehicleForm[key]}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, [key]: e.target.checked })}
                />
                <span className="text-sm text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          <CidadesSelector
            value={vehicleForm.region_ids}
            onChange={(next) => setVehicleForm((f) => ({ ...f, region_ids: next }))}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand"
              checked={!!vehicleForm.is_active}
              onChange={(e) => setVehicleForm({ ...vehicleForm, is_active: e.target.checked })}
            />
            <span className="text-sm text-gray-300">Ativo (visível para turistas)</span>
          </label>

          <Button type="submit" className="w-full" disabled={vehicleMut.isPending || uploading}>
            {uploading ? 'Enviando imagem…' : vehicleMut.isPending ? 'Salvando…' : 'Salvar Veículo'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
