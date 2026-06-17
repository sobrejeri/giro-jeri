import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Tag, Car, ToggleLeft, ToggleRight, Sun, Plus, Search } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Card, { CardBody } from '../components/ui/Card'

const fmt = (v) =>
  v != null && v !== ''
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'

function getSeasonPct(seasons) {
  if (!seasons?.length) return null
  const today = new Date().toISOString().slice(0, 10)
  const active = seasons.find((s) => s.is_active && s.start_date <= today && s.end_date >= today)
  if (active) return { pct: Number(active.additional_value), name: active.name }
  const upcoming = seasons
    .filter((s) => s.is_active && s.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
  if (upcoming) return { pct: Number(upcoming.additional_value), name: upcoming.name }
  return null
}

export default function Precos() {
  const [editing, setEditing] = useState(null) // { vehicle, tour, rule? }
  const [base, setBase]       = useState('')
  const [active, setActive]   = useState(true)
  const [fillRow, setFillRow] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]   = useState('')
  const [regionId, setRegionId] = useState('')
  const qc = useQueryClient()

  const { data: rules = [],    isLoading: l1 } = useQuery({ queryKey: ['pricing-rules'], queryFn: () => api.getPricingRules() })
  const { data: vehicles = [], isLoading: l2 } = useQuery({ queryKey: ['vehicles'],      queryFn: () => api.getVehicles() })
  const { data: tours = [],    isLoading: l3 } = useQuery({ queryKey: ['admin-tours'],   queryFn: () => api.getTours().then((r) => r.data || r) })
  const { data: regions = [],  isLoading: l4 } = useQuery({ queryKey: ['regions'],       queryFn: () => api.getRegions() })
  const { data: seasons = [] }                  = useQuery({ queryKey: ['seasons'],       queryFn: () => api.getSeasons() })

  const season = useMemo(() => getSeasonPct(seasons), [seasons])

  const multiRegion     = regions.length > 1
  const effectiveRegion = (multiRegion ? (regionId || regions[0]?.id) : regions[0]?.id) || null

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }) => api.updatePricingRule(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing-rules'] }),
  })

  // Matriz [vehicle_id][tour_id] = rule (filtrada pela região quando há +de 1)
  const matrix = useMemo(() => {
    const m = {}
    for (const r of rules) {
      if (!r.vehicle_id || !r.service_id) continue
      if (multiRegion && r.region_id && r.region_id !== effectiveRegion) continue
      if (!m[r.vehicle_id]) m[r.vehicle_id] = {}
      m[r.vehicle_id][r.service_id] = r
    }
    return m
  }, [rules, multiRegion, effectiveRegion])

  const eligibleVehicles = vehicles.filter((v) => v.is_tour_allowed && v.is_active)
  const eligibleTours    = tours.filter((t) => t.is_active !== false)

  const q = search.trim().toLowerCase()
  const visibleTours = q ? eligibleTours.filter((t) => t.name.toLowerCase().includes(q)) : eligibleTours

  // Estatísticas de cobertura (sobre a matriz da região, não filtrada por busca)
  const allRules    = Object.values(matrix).flatMap((o) => Object.values(o))
  const configured  = allRules.length
  const activeRules  = allRules.filter((r) => r.is_active)
  const avgPrice     = activeRules.length
    ? activeRules.reduce((s, r) => s + Number(r.base_price || 0), 0) / activeRules.length
    : 0
  const totalCombos  = eligibleVehicles.length * eligibleTours.length
  const coveragePct  = totalCombos ? Math.round((configured / totalCombos) * 100) : 0

  function openCell(vehicle, tour, rule) {
    setEditing({ vehicle, tour, rule })
    setBase(rule?.base_price != null ? String(rule.base_price) : '')
    setActive(rule ? rule.is_active : true)
    setFillRow(false)
  }

  function closeCell() {
    setEditing(null)
    setBase('')
    setActive(true)
    setFillRow(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!editing) return
    const value = base.trim()
    if (!value || Number(value) <= 0) {
      alert('Informe um preço válido.')
      return
    }
    setSaving(true)
    try {
      if (editing.rule) {
        // Edita a célula existente
        await api.updatePricingRule(editing.rule.id, {
          base_price: Number(value),
          is_active:  active,
        })
      } else if (fillRow) {
        // Preenche todos os passeios AINDA vazios deste veículo
        const emptyTours = eligibleTours.filter((t) => !matrix[editing.vehicle.id]?.[t.id])
        for (const t of emptyTours) {
          await api.saveTourPricing(t.id, effectiveRegion, [{
            vehicle_id: editing.vehicle.id, base_price: Number(value), existing_id: null,
          }])
        }
      } else {
        // Cria uma única célula
        await api.saveTourPricing(editing.tour.id, effectiveRegion, [{
          vehicle_id:  editing.vehicle.id,
          base_price:  Number(value),
          existing_id: null,
        }])
        if (!active) {
          const fresh = await api.getPricingRules()
          const created = fresh.find((r) => r.vehicle_id === editing.vehicle.id && r.service_id === editing.tour.id)
          if (created) await api.updatePricingRule(created.id, { is_active: false })
        }
      }
      qc.invalidateQueries({ queryKey: ['pricing-rules'] })
      closeCell()
    } catch (err) {
      alert(`Erro ao salvar: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editing?.rule) return
    if (!confirm('Remover este preço?')) return
    setSaving(true)
    try {
      await api.deletePricingRule(editing.rule.id)
      qc.invalidateQueries({ queryKey: ['pricing-rules'] })
      closeCell()
    } catch (err) {
      alert(`Erro ao remover: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (l1 || l2 || l3 || l4) return <PageSpinner />

  if (eligibleTours.length === 0 || eligibleVehicles.length === 0) {
    return (
      <Card>
        <CardBody>
          <div className="py-12 text-center">
            <Tag size={36} className="mx-auto text-gray-700 mb-3" />
            <p className="text-gray-500 text-sm">
              {eligibleTours.length === 0 ? 'Nenhum passeio cadastrado.' : 'Nenhum veículo cadastrado.'}
            </p>
            <p className="text-gray-600 text-xs mt-1">Cadastre em Catálogo primeiro.</p>
          </div>
        </CardBody>
      </Card>
    )
  }

  const baseNum  = Number(base || 0)
  const autoPeak = season && baseNum > 0 ? Math.round(baseNum * (1 + season.pct / 100)) : null
  const emptyForVehicle = editing && !editing.rule
    ? eligibleTours.filter((t) => !matrix[editing.vehicle.id]?.[t.id]).length
    : 0

  const thBase = 'px-3 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-900'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-200">Motor de Preços</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Linhas = veículos · Colunas = passeios. Clique numa célula para definir ou editar.
          {season && (
            <span className="ml-2 text-amber-400">· Alta temporada: +{season.pct}% ({season.name})</span>
          )}
        </p>
      </div>

      {/* Toolbar: busca · região · estatísticas */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar passeio…"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-brand/60"
          />
        </div>
        {multiRegion && (
          <select
            value={effectiveRegion || ''}
            onChange={(e) => setRegionId(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand/60"
          >
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2 ml-auto text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-gray-800 text-gray-300">Configurados: <strong className="text-gray-100">{configured}</strong>/{totalCombos}</span>
          <span className="px-2.5 py-1 rounded-full bg-gray-800 text-gray-300">Ativos: <strong className="text-green-400">{activeRules.length}</strong></span>
          <span className="px-2.5 py-1 rounded-full bg-gray-800 text-gray-300">Médio: <strong className="text-brand">{fmt(avgPrice)}</strong></span>
        </div>
      </div>

      {/* Barra de cobertura */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-brand to-amber-400" style={{ width: `${coveragePct}%` }} />
        </div>
        <span className="text-[11px] text-gray-500 shrink-0">{coveragePct}% da grade preenchida</span>
      </div>

      <Card>
        <div className="overflow-auto max-h-[70vh] rounded-2xl">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className={`sticky left-0 top-0 z-30 ${thBase} min-w-[200px]`}>Veículo</th>
                {visibleTours.map((t) => (
                  <th key={t.id} className={`sticky top-0 z-20 ${thBase} min-w-[140px]`}>{t.name}</th>
                ))}
                {visibleTours.length === 0 && (
                  <th className={`sticky top-0 z-20 ${thBase} text-gray-600 normal-case`}>Nenhum passeio para “{search}”.</th>
                )}
              </tr>
            </thead>
            <tbody>
              {eligibleVehicles.map((v) => {
                const rowCount = visibleTours.filter((t) => matrix[v.id]?.[t.id]).length
                return (
                  <tr key={v.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                    {/* Coluna fixa: veículo */}
                    <td className="sticky left-0 z-10 bg-gray-900 px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                          {v.image_url
                            ? <img src={v.image_url} className="w-full h-full object-cover" alt="" />
                            : <Car size={14} className="text-gray-500" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{v.name}</p>
                          <p className="text-[11px] text-gray-500">Até {v.seat_capacity} pax · {rowCount}/{visibleTours.length} preços</p>
                        </div>
                      </div>
                    </td>

                    {/* Colunas: cada passeio */}
                    {visibleTours.map((t) => {
                      const rule = matrix[v.id]?.[t.id]
                      const calcPeak = season && rule?.base_price
                        ? Math.round(Number(rule.base_price) * (1 + season.pct / 100))
                        : null
                      return (
                        <td key={t.id} className="px-3 py-3">
                          {rule ? (
                            <div className={`group flex items-center gap-2 transition-opacity ${rule.is_active ? '' : 'opacity-40'}`}>
                              <button
                                onClick={() => openCell(v, t, rule)}
                                className="flex-1 text-left hover:bg-gray-800 rounded-lg px-2 py-1.5 transition-colors"
                              >
                                <p className="text-sm font-semibold text-brand">{fmt(rule.base_price)}</p>
                                {calcPeak && (
                                  <p className="text-[10px] text-amber-400/70">
                                    <Sun size={8} className="inline mr-0.5" />{fmt(calcPeak)}
                                  </p>
                                )}
                              </button>
                              <button
                                onClick={() => toggleMut.mutate({ id: rule.id, is_active: !rule.is_active })}
                                title={rule.is_active ? 'Desativar' : 'Ativar'}
                                className="shrink-0"
                              >
                                {rule.is_active
                                  ? <ToggleRight size={18} className="text-brand" />
                                  : <ToggleLeft  size={18} className="text-gray-600" />}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => openCell(v, t, null)}
                              className="w-full flex items-center justify-center gap-1 px-2 py-2 text-xs text-gray-600 hover:text-brand hover:bg-gray-800 rounded-lg transition-colors"
                            >
                              <Plus size={11} /> Adicionar
                            </button>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal de edição da célula */}
      <Modal
        open={!!editing}
        onClose={closeCell}
        title={editing ? `${editing.vehicle.name} · ${editing.tour.name}` : ''}
        size="sm"
      >
        {editing && (
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="Preço normal (R$)"
              type="number" min={0} step={0.01}
              placeholder="ex: 350,00"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              autoFocus
              required
            />

            {season && (
              <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                <Sun size={14} className="text-amber-400 shrink-0" />
                <p className="text-xs text-amber-300 flex-1">
                  Alta temporada (+{season.pct}%): <strong>{autoPeak ? fmt(autoPeak) : '—'}</strong>
                </p>
              </div>
            )}

            {/* Preenchimento em lote — só ao criar */}
            {!editing.rule && emptyForVehicle > 1 && (
              <button
                type="button"
                onClick={() => setFillRow(!fillRow)}
                className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 border transition-colors ${fillRow ? 'bg-brand/10 border-brand/40' : 'bg-gray-800/50 border-transparent'}`}
              >
                <span className="text-sm text-gray-200 text-left">
                  Preencher os <strong>{emptyForVehicle}</strong> passeios vazios deste veículo
                </span>
                {fillRow
                  ? <ToggleRight size={22} className="text-brand shrink-0" />
                  : <ToggleLeft  size={22} className="text-gray-600 shrink-0" />}
              </button>
            )}

            {!fillRow && (
              <button
                type="button"
                onClick={() => setActive(!active)}
                className="w-full flex items-center justify-between bg-gray-800/50 rounded-xl px-3.5 py-2.5"
              >
                <span className="text-sm text-gray-200">
                  {active ? 'Ativo neste passeio' : 'Inativo neste passeio'}
                </span>
                {active
                  ? <ToggleRight size={22} className="text-brand" />
                  : <ToggleLeft  size={22} className="text-gray-600" />}
              </button>
            )}

            <div className="flex gap-2 pt-1">
              {editing.rule && (
                <Button type="button" variant="secondary" onClick={handleDelete} disabled={saving}>
                  <Trash2 size={14} /> Remover
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? 'Salvando…' : fillRow ? `Aplicar a ${emptyForVehicle} passeios` : 'Salvar'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
