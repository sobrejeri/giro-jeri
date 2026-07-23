import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Globe, Search, X, Loader, MapPin, CircleDot } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Card, { CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { LocationSearch, MapPreview } from '../components/LocationPicker'

const EMPTY = {
  name: '', slug: '', timezone: 'America/Fortaleza', currency: 'BRL',
  is_active: true,
  center_latitude: '', center_longitude: '', service_radius_km: 100,
}

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

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
    onError: (err) => alert(`Erro ao salvar: ${err.message}`),
  })

  function openNew()   { setForm(EMPTY); setModal({ isNew: true }) }
  function openEdit(r) {
    setForm({
      name: r.name, slug: r.slug,
      timezone: r.timezone || 'America/Fortaleza', currency: r.currency || 'BRL',
      is_active: r.is_active,
      center_latitude:   r.center_latitude  ?? '',
      center_longitude:  r.center_longitude ?? '',
      service_radius_km: r.service_radius_km ?? 100,
    })
    setModal(r)
  }

  function handleLocationPick(result) {
    const lat  = parseFloat(result.lat)
    const lon  = parseFloat(result.lon)
    const city = result.display_name.split(',')[0].trim()
    setForm((f) => ({
      ...f,
      center_latitude:  lat,
      center_longitude: lon,
      name: f.name || city,
      slug: f.slug || slugify(city),
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const body = {
      ...form,
      center_latitude:   form.center_latitude  !== '' ? Number(form.center_latitude)  : null,
      center_longitude:  form.center_longitude !== '' ? Number(form.center_longitude) : null,
      service_radius_km: Number(form.service_radius_km),
    }
    saveMut.mutate(body)
  }

  const lat = parseFloat(form.center_latitude)
  const lon = parseFloat(form.center_longitude)
  const hasCoords = !isNaN(lat) && !isNaN(lon)

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
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <span className="text-xs text-gray-500">{r.slug} · {r.timezone}</span>
                    {r.center_latitude && r.center_longitude && (
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <MapPin size={10} />
                        {Number(r.center_latitude).toFixed(4)}, {Number(r.center_longitude).toFixed(4)}
                        {r.service_radius_km && <span className="text-gray-700">· {r.service_radius_km} km</span>}
                      </span>
                    )}
                  </div>
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

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Nova Região' : 'Editar Região'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Busca de localização */}
          <LocationSearch onSelect={handleLocationPick} />

          {/* Preview do mapa */}
          {hasCoords && (
            <MapPreview lat={lat} lon={lon} radius={Number(form.service_radius_km) || 100} />
          )}

          {/* Coordenadas salvas */}
          {hasCoords && (
            <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-4 py-3">
              <CircleDot size={14} className="text-brand shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Coordenadas selecionadas</p>
                <p className="text-sm font-mono text-gray-200">
                  {lat.toFixed(6)}, {lon.toFixed(6)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, center_latitude: '', center_longitude: '' }))}
                className="ml-auto p-1 text-gray-600 hover:text-gray-400"
              >
                <X size={13} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jericoacoara" required />
            <Input label="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="jericoacoara" required />
          </div>

          {/* Raio de cobertura */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-400">Raio de cobertura</label>
              <span className="text-sm font-bold text-brand">{form.service_radius_km} km</span>
            </div>
            <input
              type="range"
              min={20} max={300} step={10}
              value={form.service_radius_km}
              onChange={(e) => setForm({ ...form, service_radius_km: Number(e.target.value) })}
              className="w-full accent-brand"
            />
            <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
              <span>20 km</span><span>150 km</span><span>300 km</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Timezone" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/Fortaleza" />
            <Input label="Moeda" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="BRL" />
          </div>

          <Button type="submit" className="w-full" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
