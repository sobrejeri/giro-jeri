import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tag, ChevronDown, ChevronRight, Car, ToggleLeft, ToggleRight, Sun } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const fmt = (v) =>
  v != null && v !== ''
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'

// Retorna o percentual da temporada ativa ou futura mais próxima
function getSeasonPct(seasons) {
  if (!seasons?.length) return null
  const today = new Date().toISOString().slice(0, 10)
  // Primeiro: regra vigente
  const active = seasons.find((s) => s.start_date <= today && s.end_date >= today && s.is_active)
  if (active) return { pct: Number(active.additional_value), name: active.name }
  // Segundo: próxima futura
  const upcoming = seasons
    .filter((s) => s.start_date > today && s.is_active)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  if (upcoming) return { pct: Number(upcoming.additional_value), name: upcoming.name }
  return null
}

export default function Precos() {
  const [modal, setModal]       = useState(null)
  const [tourId, setTourId]     = useState('')
  const [regionId, setRegionId] = useState('')
  const [prices, setPrices]     = useState({})
  const [saving, setSaving]     = useState(false)
  const [expanded, setExpanded] = useState({})
  const qc = useQueryClient()

  const { data: rules = [],    isLoading: l1 } = useQuery({ queryKey: ['pricing-rules'], queryFn: () => api.getPricingRules() })
  const { data: vehicles = [], isLoading: l2 } = useQuery({ queryKey: ['vehicles'],      queryFn: () => api.getVehicles() })
  const { data: tours = [],    isLoading: l3 } = useQuery({ queryKey: ['admin-tours'],   queryFn: () => api.getTours().then((r) => r.data || r) })
  const { data: regions = [],  isLoading: l4 } = useQuery({ queryKey: ['regions'],       queryFn: () => api.getRegions() })
  const { data: seasons = [] }                  = useQuery({ queryKey: ['seasons'],       queryFn: () => api.getSeasons() })

  const season = useMemo(() => getSeasonPct(seasons), [seasons])

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }) => api.updatePricingRule(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  })

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

  const toursWithRules    = tours.filter((t) => grouped[t.id])
  const toursWithoutRules = tours.filter((t) => !grouped[t.id])

  function openPricingModal(presetTourId = '') {
    const defaultRegion = regions[0]?.id || ''
    setTourId(presetTourId)
    setRegionId(defaultRegion)
    if (presetTourId) {
      const existing = rules.filter((r) => r.service_id === presetTourId)
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
    try {
      const rows = []
      for (const [vehicleId, entry] of Object.entries(prices)) {
        const base = entry.base?.trim()
        if (!base || Number(base) <= 0) continue
        rows.push({
          vehicle_id:  vehicleId,
          base_price:  Number(base),
          existing_id: entry.existing_id || null,
        })
      }
      if (rows.length > 0) {
        await api.saveTourPricing(tourId, regionId || null, rows)
      }
      qc.invalidateQueries({ queryKey: ['pricing-rules'] })
      setModal(null)
    } catch (err) {
      alert(`Erro ao salvar: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  function toggleExpand(id) {
    setExpanded((p) => ({ ...p, [id]: !p[id] }))
  }

  if (l1 || l2 || l3 || l4) return <PageSpinner />

  const vehicleMap = Object.fromEntries(vehicles.map((v) => [v.id, v]))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-200">Motor de Preços</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Preço por veículo · por passeio
            {season && (
              <span className="ml-2 text-amber-400">
                · Alta temporada ativa: +{season.pct}% ({season.name})
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => openPricingModal('')}>
          <Plus size={16} /> Definir Preços
        </Button>
      </div>

      {/* Passeios com preços */}
      {toursWithRules.map((tour) => {
        const tourRules = grouped[tour.id] || []
        const isOpen = expanded[tour.id] !== false
        return (
          <Card key={tour.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <button onClick={() => toggleExpand(tour.id)} className="flex items-center gap-2 text-left flex-1">
                  {isOpen
                    ? <ChevronDown size={14} className="text-gray-500 shrink-0" />
                    : <ChevronRight size={14} className="text-gray-500 shrink-0" />}
                  <div>
                    <p className="text-sm font-semibold text-gray-200">{tour.name}</p>
                    <p className="text-xs text-gray-500">
                      {tourRules.filter((r) => r.is_active).length} veículo{tourRules.filter((r) => r.is_active).length !== 1 ? 's' : ''} ativo{tourRules.filter((r) => r.is_active).length !== 1 ? 's' : ''}
                      {tourRules.some((r) => !r.is_active) && ` · ${tourRules.filter((r) => !r.is_active).length} inativo${tourRules.filter((r) => !r.is_active).length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </button>
                <Button size="sm" variant="secondary" onClick={() => openPricingModal(tour.id)}>
                  <Pencil size={12} /> Editar
                </Button>
              </div>
            </CardHeader>

            {isOpen && (
              <div className="divide-y divide-gray-800">
                {tourRules.map((r) => {
                  const v = vehicleMap[r.vehicle_id]
                  const calcPeak = season && r.base_price
                    ? Math.round(Number(r.base_price) * (1 + season.pct / 100))
                    : null
                  return (
                    <div key={r.id} className={`flex items-center gap-3 px-5 py-3 transition-opacity ${r.is_active ? '' : 'opacity-40'}`}>
                      {/* Foto */}
                      <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                        {v?.image_url
                          ? <img src={v.image_url} className="w-full h-full object-cover" />
                          : <Car size={13} className="text-gray-500" />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200">{r.vehicles?.name || v?.name || '—'}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-500">Normal: <span className="text-brand font-medium">{fmt(r.base_price)}</span></span>
                          {r.high_season_price ? (
                            <span className="text-xs text-amber-400">
                              <Sun size={9} className="inline mr-0.5" />Alta: {fmt(r.high_season_price)}
                            </span>
                          ) : calcPeak ? (
                            <span className="text-xs text-amber-400/60">
                              <Sun size={9} className="inline mr-0.5" />Alta auto: {fmt(calcPeak)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Toggle ativo */}
                      <button
                        onClick={() => toggleMut.mutate({ id: r.id, is_active: !r.is_active })}
                        title={r.is_active ? 'Desativar para este passeio' : 'Ativar para este passeio'}
                        className="shrink-0"
                      >
                        {r.is_active
                          ? <ToggleRight size={22} className="text-brand" />
                          : <ToggleLeft  size={22} className="text-gray-600" />}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => confirm('Remover regra de preço?') && deleteMut.mutate(r.id)}
                        className="p-1.5 text-gray-700 hover:text-red-400 hover:bg-red-900/20 rounded-lg shrink-0"
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

      {/* Passeios sem preço */}
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

      {/* ── Modal: Definir preços por veículo ──────────────── */}
      <Modal open={!!modal?.open} onClose={() => setModal(null)} title="Definir Preços por Veículo">
        <form onSubmit={handleSave} className="space-y-5">
          <Select
            label="Passeio"
            value={tourId}
            onChange={(e) => {
              setTourId(e.target.value)
              const existing = rules.filter((r) => r.service_id === e.target.value)
              const map = {}
              for (const r of existing) {
                if (r.vehicle_id) {
                  map[r.vehicle_id] = {
                    base: r.base_price != null ? String(r.base_price) : '',
                    peak: r.high_season_price != null ? String(r.high_season_price) : '',
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
            <Select label="Região" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}

          {/* Alta temporada info */}
          {season && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
              <Sun size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300">
                <strong>Alta temporada:</strong> {season.name} · +{season.pct}%.
                Se deixar "Alta temporada" em branco, o valor será calculado automaticamente.
              </p>
            </div>
          )}

          {tourId && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Preço por veículo (privativo)
              </p>
              <p className="text-xs text-gray-500 -mt-2">
                Deixe em branco para não oferecer o veículo neste passeio.
              </p>

              {vehicles.filter((v) => v.is_tour_allowed && v.is_active).map((v) => {
                const baseVal = Number(prices[v.id]?.base || 0)
                const autoCalcPeak = season && baseVal > 0
                  ? Math.round(baseVal * (1 + season.pct / 100))
                  : null

                return (
                  <div key={v.id} className="bg-gray-800/50 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                        {v.image_url
                          ? <img src={v.image_url} className="w-full h-full object-cover" />
                          : <Car size={12} className="text-gray-500" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-200">{v.name}</p>
                        <p className="text-xs text-gray-500">Até {v.seat_capacity} pessoas</p>
                      </div>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <Input
                          label="Preço normal (R$)"
                          type="number" min={0} step={0.01}
                          placeholder="ex: 350,00"
                          value={prices[v.id]?.base || ''}
                          onChange={(e) => setPrice(v.id, 'base', e.target.value)}
                        />
                      </div>
                      {season && (
                        <div className="pb-1 text-right min-w-[110px]">
                          <p className="text-[10px] text-gray-500 mb-0.5">Alta temporada (+{season.pct}%)</p>
                          <p className="text-sm font-semibold text-amber-400">
                            {autoCalcPeak ? fmt(autoCalcPeak) : '—'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
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
