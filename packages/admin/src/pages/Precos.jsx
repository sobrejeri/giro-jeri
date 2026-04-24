import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tag, ChevronDown, ChevronRight, Car } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

const fmt = (v) =>
  v != null && v !== ''
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'

export default function Precos() {
  const [modal, setModal]         = useState(null) // null | { tourId, regionId, isNew }
  const [tourId, setTourId]       = useState('')
  const [regionId, setRegionId]   = useState('')
  const [prices, setPrices]       = useState({}) // { [vehicleId]: { base: '', peak: '' } }
  const [saving, setSaving]       = useState(false)
  const [expanded, setExpanded]   = useState({})
  const qc = useQueryClient()

  const { data: rules = [],    isLoading: l1 } = useQuery({ queryKey: ['pricing-rules'], queryFn: () => api.getPricingRules() })
  const { data: vehicles = [], isLoading: l2 } = useQuery({ queryKey: ['vehicles'],      queryFn: () => api.getVehicles() })
  const { data: tours = [],    isLoading: l3 } = useQuery({ queryKey: ['admin-tours'],   queryFn: () => api.getTours().then((r) => r.data || r) })
  const { data: regions = [],  isLoading: l4 } = useQuery({ queryKey: ['regions'],       queryFn: () => api.getRegions() })

  const deleteMut = useMutation({
    mutationFn: (id) => api.deletePricingRule(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  })

  // Agrupa regras por service_id (tour)
  const grouped = useMemo(() => {
    const map = {}
    for (const r of rules) {
      const key = r.service_id || '__global__'
      if (!map[key]) map[key] = []
      map[key].push(r)
    }
    return map
  }, [rules])

  // Monta lista de tours que aparecem nas regras + outros tours ainda sem regra
  const toursWithRules  = tours.filter((t) => grouped[t.id])
  const toursWithoutRules = tours.filter((t) => !grouped[t.id])

  function openPricingModal(presetTourId = '') {
    const defaultRegion = regions[0]?.id || ''
    setTourId(presetTourId)
    setRegionId(defaultRegion)

    // Pré-popula preços existentes para o passeio
    if (presetTourId) {
      const existing = rules.filter((r) => r.service_id === presetTourId)
      const map = {}
      for (const r of existing) {
        if (r.vehicle_id) {
          map[r.vehicle_id] = {
            base:       r.base_price != null ? String(r.base_price) : '',
            peak:       r.high_season_price != null ? String(r.high_season_price) : '',
            existing_id: r.id,
          }
        }
      }
      setPrices(map)
    } else {
      setPrices({})
    }
    setModal({ open: true })
  }

  function setPrice(vehicleId, field, value) {
    setPrices((p) => ({
      ...p,
      [vehicleId]: { ...(p[vehicleId] || {}), [field]: value },
    }))
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!tourId) return
    setSaving(true)

    const rows = []
    for (const [vehicleId, entry] of Object.entries(prices)) {
      const base = entry.base?.trim()
      if (!base || Number(base) <= 0) continue
      rows.push({
        vehicle_id:        vehicleId,
        base_price:        Number(base),
        high_season_price: entry.peak && Number(entry.peak) > 0 ? Number(entry.peak) : null,
        existing_id:       entry.existing_id || null,
      })
    }

    if (rows.length > 0) {
      await api.saveTourPricing(tourId, regionId || null, rows)
    }

    qc.invalidateQueries({ queryKey: ['pricing-rules'] })
    setSaving(false)
    setModal(null)
  }

  function toggleExpand(tourId) {
    setExpanded((p) => ({ ...p, [tourId]: !p[tourId] }))
  }

  if (l1 || l2 || l3 || l4) return <PageSpinner />

  const tourMap = Object.fromEntries(tours.map((t) => [t.id, t]))
  const vehicleMap = Object.fromEntries(vehicles.map((v) => [v.id, v]))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-200">Preços por Passeio</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure o preço de cada veículo para cada passeio
          </p>
        </div>
        <Button onClick={() => openPricingModal('')}>
          <Plus size={16} /> Definir Preços
        </Button>
      </div>

      {/* Passeios com preços configurados */}
      {toursWithRules.length > 0 && (
        <div className="space-y-3">
          {toursWithRules.map((tour) => {
            const tourRules = grouped[tour.id] || []
            const isOpen = expanded[tour.id] !== false // expandido por padrão
            return (
              <Card key={tour.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleExpand(tour.id)}
                      className="flex items-center gap-2 text-left"
                    >
                      {isOpen
                        ? <ChevronDown size={14} className="text-gray-500 shrink-0" />
                        : <ChevronRight size={14} className="text-gray-500 shrink-0" />
                      }
                      <div>
                        <p className="text-sm font-semibold text-gray-200">{tour.name}</p>
                        <p className="text-xs text-gray-500">{tourRules.length} veículo{tourRules.length !== 1 ? 's' : ''} precificado{tourRules.length !== 1 ? 's' : ''}</p>
                      </div>
                    </button>
                    <Button size="sm" variant="secondary" onClick={() => openPricingModal(tour.id)}>
                      <Pencil size={12} /> Editar Preços
                    </Button>
                  </div>
                </CardHeader>

                {isOpen && (
                  <div className="divide-y divide-gray-800">
                    {tourRules.map((r) => {
                      const v = vehicleMap[r.vehicle_id]
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
                            {v?.image_url
                              ? <img src={v.image_url} className="w-full h-full rounded-lg object-cover" />
                              : <Car size={13} className="text-gray-500" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-200">{r.vehicles?.name || v?.name || '—'}</p>
                            {r.high_season_price && (
                              <p className="text-xs text-amber-400/80">
                                Alta temporada: {fmt(r.high_season_price)}
                              </p>
                            )}
                          </div>
                          <span className="text-sm font-bold text-brand">{fmt(r.base_price)}</span>
                          <button
                            onClick={() => confirm('Remover regra de preço?') && deleteMut.mutate(r.id)}
                            className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Passeios SEM preços */}
      {toursWithoutRules.length > 0 && (
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Passeios sem preço configurado
            </p>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {toursWithoutRules.map((tour) => (
              <div key={tour.id} className="flex items-center gap-3 px-5 py-3">
                <Tag size={14} className="text-gray-600 shrink-0" />
                <p className="flex-1 text-sm text-gray-400">{tour.name}</p>
                <button
                  onClick={() => openPricingModal(tour.id)}
                  className="text-xs text-brand font-medium hover:underline"
                >
                  + Definir preços
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {rules.length === 0 && tours.length === 0 && (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <Tag size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhum passeio cadastrado.</p>
              <p className="text-gray-600 text-xs mt-1">Crie passeios em Catálogo primeiro.</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Modal: Definir preços para um passeio ──────────── */}
      <Modal
        open={!!modal?.open}
        onClose={() => setModal(null)}
        title="Definir Preços por Veículo"
      >
        <form onSubmit={handleSave} className="space-y-5">
          {/* Seleciona passeio */}
          <Select
            label="Passeio"
            value={tourId}
            onChange={(e) => {
              setTourId(e.target.value)
              // Pré-popula preços existentes
              const existing = rules.filter((r) => r.service_id === e.target.value)
              const map = {}
              for (const r of existing) {
                if (r.vehicle_id) {
                  map[r.vehicle_id] = {
                    base:        r.base_price != null ? String(r.base_price) : '',
                    peak:        r.high_season_price != null ? String(r.high_season_price) : '',
                    existing_id: r.id,
                  }
                }
              }
              setPrices(map)
            }}
            required
          >
            <option value="">Selecione o passeio…</option>
            {tours.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>

          {regions.length > 1 && (
            <Select
              label="Região"
              value={regionId}
              onChange={(e) => setRegionId(e.target.value)}
            >
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}

          {/* Preço por veículo */}
          {tourId && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Preço por veículo (privativo)
              </p>
              <p className="text-xs text-gray-500 -mt-2">
                Deixe em branco para não oferecer o veículo neste passeio.
              </p>

              {vehicles.filter((v) => v.is_tour_allowed && v.is_active).map((v) => (
                <div key={v.id} className="bg-gray-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
                      {v.image_url
                        ? <img src={v.image_url} className="w-full h-full rounded-lg object-cover" />
                        : <Car size={12} className="text-gray-500" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-200">{v.name}</p>
                      <p className="text-xs text-gray-500">Até {v.seat_capacity} pessoas</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="Preço normal (R$)"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="ex: 350,00"
                      value={prices[v.id]?.base || ''}
                      onChange={(e) => setPrice(v.id, 'base', e.target.value)}
                    />
                    <Input
                      label="Alta temporada (R$)"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="opcional"
                      value={prices[v.id]?.peak || ''}
                      onChange={(e) => setPrice(v.id, 'peak', e.target.value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={saving || !tourId}>
            {saving ? 'Salvando…' : 'Salvar Preços'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
