import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  MapPin, ChevronDown, MessageCircle, SlidersHorizontal,
  Plus, Minus, ChevronRight, X, Check,
  Zap, Sun, Waves, Anchor, Clock, Users,
  Star, TrendingDown, Crown,
} from 'lucide-react'

const TOUR_ICONS = {
  'buggy':      Zap,
  'por-do-sol': Sun,
  'lagoas':     Waves,
  'barco':      Anchor,
}

const BANNERS = [
  { title: 'Conheça os passeios de Jericoacoara', sub: 'A praia mais bonita do Brasil',       from: 'from-sky-900',    to: 'to-teal-700' },
  { title: 'Pôr do sol inesquecível nas dunas',   sub: 'Uma experiência única',               from: 'from-orange-900', to: 'to-amber-600' },
  { title: 'Lagoa do Paraíso — águas cristalinas', sub: 'Reserve agora com desconto',         from: 'from-teal-800',   to: 'to-emerald-600' },
]

const DEPARTURE_OPTIONS = [
  'Jericoacoara — Centro',
  'Praia do Preá',
  'Cumbuco',
  'Fortaleza — Aeroporto',
  'Outro local',
]

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR')}` }

function computeSuggestions(vehicles, people) {
  if (!vehicles.length || !people) return []

  function fillGreedy(sorted, target) {
    const result = {}
    let remaining = target
    for (const v of sorted) {
      if (remaining <= 0) break
      const qty = Math.ceil(remaining / v.seat_capacity)
      result[v.id] = qty
      remaining -= qty * v.seat_capacity
    }
    return result
  }

  const byCapDesc   = [...vehicles].sort((a, b) => b.seat_capacity - a.seat_capacity)
  const byCheapSeat = [...vehicles].sort((a, b) =>
    Number(a.base_price) / a.seat_capacity - Number(b.base_price) / b.seat_capacity
  )

  function totalPrice(q) { return vehicles.reduce((s, v) => s + (q[v.id] || 0) * Number(v.base_price), 0) }
  function totalCap(q)   { return vehicles.reduce((s, v) => s + (q[v.id] || 0) * v.seat_capacity, 0) }
  function describe(q)   { return vehicles.filter(v => (q[v.id] || 0) > 0).map(v => `${q[v.id]}x ${v.name}`).join(' + ') }

  const rec     = fillGreedy(byCapDesc, people)
  const eco     = fillGreedy(byCheapSeat, people)
  const comfort = fillGreedy(byCapDesc, Math.ceil(people * 1.3))

  return [
    { id: 'rec', label: 'Recomendado',    Icon: Star,         bg: 'bg-brand',      combo: rec },
    { id: 'eco', label: 'Mais econômico', Icon: TrendingDown, bg: 'bg-green-500',  combo: eco },
    { id: 'com', label: 'Mais conforto',  Icon: Crown,        bg: 'bg-purple-500', combo: comfort },
  ]
    .filter(s => describe(s.combo))
    .map(s => ({ ...s, description: describe(s.combo), price: totalPrice(s.combo), capacity: totalCap(s.combo) }))
}

export default function Tours() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [searchParams] = useSearchParams()

  const [mode,          setMode]          = useState(searchParams.get('modo') === 'shared' ? 'shared' : 'private')
  const [people,        setPeople]        = useState(2)
  const [selectedTour,  setSelectedTour]  = useState(null)
  const [vehicleQtys,   setVehicleQtys]   = useState({})
  const [date,          setDate]          = useState('')
  const [time,          setTime]          = useState('')
  const [departure,     setDeparture]     = useState('')
  const [showDeparture, setShowDeparture] = useState(false)
  const [bannerIdx,     setBannerIdx]     = useState(0)

  const [bookingError, setBookingError] = useState('')

  const { data: regionsData }                                                = useQuery({ queryKey: ['regions'],    queryFn: () => api.getRegions() })
  const { data: toursData,    isLoading: toursLoading    }                  = useQuery({ queryKey: ['tours'],      queryFn: () => api.getTours() })
  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['tour-vehicles', selectedTour?.id],
    queryFn:  () => api.getTourVehicles(selectedTour.id),
    enabled:  !!selectedTour,
  })

  const regionId = (regionsData?.regions || regionsData || [])[0]?.id
  const tours     = toursData?.tours    || toursData    || []
  const allVehicles = vehiclesData?.vehicles || vehiclesData || []
  const vehicles  = mode === 'private' ? allVehicles.filter(v => v.is_private_allowed) : allVehicles

  const suggestions = useMemo(() =>
    mode === 'private' && vehicles.length ? computeSuggestions(vehicles, people) : [],
    [vehicles, people, mode]
  )

  const totalCapacity   = useMemo(() => vehicles.reduce((s, v) => s + (vehicleQtys[v.id] || 0) * v.seat_capacity, 0), [vehicles, vehicleQtys])
  const privateTotalPrice = useMemo(() => vehicles.reduce((s, v) => s + (vehicleQtys[v.id] || 0) * Number(v.base_price), 0), [vehicles, vehicleQtys])
  const sharedTotalPrice  = selectedTour?.is_shared_enabled ? Number(selectedTour.shared_price_per_person) * people : 0
  const totalPrice        = mode === 'shared' ? sharedTotalPrice : privateTotalPrice
  const hasVehicles       = Object.values(vehicleQtys).some(q => q > 0)
  const capacityOk        = totalCapacity >= people
  const canContinue       = selectedTour && date && (mode === 'shared' ? true : hasVehicles && capacityOk)
  const summaryChips      = vehicles.filter(v => (vehicleQtys[v.id] || 0) > 0)

  function changeQty(vehicleId, delta) {
    setVehicleQtys(prev => {
      const next = Math.max(0, (prev[vehicleId] || 0) + delta)
      if (next === 0) { const { [vehicleId]: _, ...rest } = prev; return rest }
      return { ...prev, [vehicleId]: next }
    })
  }

  function selectTour(t) { setSelectedTour(t); setVehicleQtys({}); setBookingError('') }

  function handleContinue() {
    if (!token) { navigate('/login'); return }
    if (!selectedTour)                     { setBookingError('Selecione um passeio'); return }
    if (!date)                             { setBookingError('Informe a data'); return }
    if (mode === 'private' && !hasVehicles) { setBookingError('Selecione ao menos um veículo'); return }
    if (mode === 'private' && !capacityOk) { setBookingError(`Capacidade insuficiente para ${people} pessoas`); return }
    if (!regionId)                         { setBookingError('Erro: região não encontrada'); return }

    const vehicleList = Object.entries(vehicleQtys).map(([vehicleId, quantity]) => ({ vehicleId, quantity }))

    const sharedPrice  = mode === 'shared' ? Number(selectedTour.shared_price_per_person) * people : 0
    const privatePrice = mode === 'private' ? vehicles.reduce((s, v) => s + (vehicleQtys[v.id] || 0) * Number(v.base_price), 0) : 0
    const total        = mode === 'shared' ? sharedPrice : privatePrice

    const breakdown = mode === 'shared'
      ? { label: `${people} pax × R$ ${Number(selectedTour.shared_price_per_person).toFixed(0)}`, total }
      : { items: summaryChips.map(v => ({ label: `${vehicleQtys[v.id]}x ${v.name}`, value: vehicleQtys[v.id] * Number(v.base_price) })), total }

    navigate('/checkout/resumo', {
      state: {
        service_type:      'tour',
        service_id:        selectedTour.id,
        service_name:      selectedTour.name,
        booking_mode:      mode,
        service_date:      date,
        service_time:      time || '08:00',
        people_count:      people,
        vehicles:          mode === 'private' ? vehicleList : [],
        pickup_place_name: departure || undefined,
        region_id:         regionId,
        source_channel:    'app',
        breakdown,
      },
    })
  }

  return (
    <div className="flex flex-col min-h-full bg-white tap-highlight-none">

      {/* ── App Header ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-100">
        <div>
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand rounded-lg flex items-center justify-center">
                <MapPin size={13} className="text-white" />
              </div>
              <span className="font-display font-bold text-gray-900">Giro Jeri</span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="https://wa.me/5588999999999"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 bg-green-500 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
              >
                <MessageCircle size={17} className="text-white" />
              </a>
              <button className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center">
                <SlidersHorizontal size={16} className="text-gray-600" />
              </button>
            </div>
          </div>

          {/* Location picker */}
          <div className="px-4 pb-3">
            <button
              onClick={() => setShowDeparture(v => !v)}
              className="w-full flex items-center gap-2 h-10 px-4 bg-gray-50 border border-gray-200 rounded-full text-sm active:bg-gray-100 transition-colors"
            >
              <MapPin size={14} className="text-brand shrink-0" />
              <span className="flex-1 text-left text-gray-600 truncate">
                {departure ? `Saindo de: ${departure}` : 'Saindo de: Escolher local'}
              </span>
              <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${showDeparture ? 'rotate-180' : ''}`} />
            </button>
            {showDeparture && (
              <div className="mt-1 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden z-30">
                {DEPARTURE_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => { setDeparture(opt); setShowDeparture(false) }}
                    className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors ${
                      departure === opt ? 'bg-brand/5 text-brand font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <MapPin size={13} className={departure === opt ? 'text-brand' : 'text-gray-400'} />
                    {opt}
                    {departure === opt && <Check size={13} className="text-brand ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>

        {/* Mode toggle */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
            {[['private', 'Privativo'], ['shared', 'Compartilhado']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setMode(val); setVehicleQtys({}); setBookingError('') }}
                className={`flex-1 h-10 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                  mode === val ? 'bg-brand text-white shadow-md' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Banner carousel */}
        <div className="px-4 mb-4">
          <div className="relative h-36 rounded-2xl overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${BANNERS[bannerIdx].from} ${BANNERS[bannerIdx].to}`} />
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <p className="text-white font-bold text-base leading-tight drop-shadow">{BANNERS[bannerIdx].title}</p>
              <p className="text-white/70 text-xs mt-0.5">{BANNERS[bannerIdx].sub}</p>
            </div>
          </div>
          <div className="flex justify-center gap-1.5 mt-2.5">
            {BANNERS.map((_, i) => (
              <button key={i} onClick={() => setBannerIdx(i)}
                className={`rounded-full transition-all ${i === bannerIdx ? 'w-4 h-1.5 bg-brand' : 'w-1.5 h-1.5 bg-gray-300'}`}
              />
            ))}
          </div>
        </div>

        {/* Date + Time + People */}
        <div className="px-4 mb-4 grid grid-cols-3 gap-2">
          <input type="date" value={date}
            onChange={e => { setDate(e.target.value); setBookingError('') }}
            min={new Date().toISOString().split('T')[0]}
            className="h-10 px-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
          />
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            className="h-10 px-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
          />
          <div className="flex items-center gap-1.5 h-10 px-2 border border-gray-200 rounded-xl">
            <Users size={12} className="text-brand shrink-0" />
            <input type="number" min="1" max="50" value={people}
              onChange={e => setPeople(Math.max(1, Number(e.target.value) || 1))}
              className="w-full text-xs focus:outline-none"
            />
            <span className="text-[10px] text-gray-400 shrink-0">pax</span>
          </div>
        </div>

        {/* Tours carousel */}
        <div className="mb-5">
          <div className="px-4 flex items-center justify-between mb-2.5">
            <p className="font-bold text-gray-900 text-sm">Passeios disponíveis</p>
            {selectedTour && (
              <button onClick={() => { setSelectedTour(null); setVehicleQtys({}); setBookingError('') }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <X size={12} /> Limpar
              </button>
            )}
          </div>
          {toursLoading ? (
            <div className="px-4"><PageSpinner /></div>
          ) : (
            <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1">
              {tours.map(t => {
                const Icon = TOUR_ICONS[t.category?.slug] || Zap
                const selected = selectedTour?.id === t.id
                return (
                  <button key={t.id} onClick={() => selectTour(t)}
                    className={`shrink-0 w-32 rounded-2xl overflow-hidden border-2 transition-all active:scale-95 ${
                      selected ? 'border-brand shadow-lg shadow-brand/20' : 'border-gray-100'
                    }`}
                  >
                    <div className="h-20 bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center relative">
                      <Icon size={28} className="text-brand/30" />
                      {selected && (
                        <div className="absolute inset-0 bg-brand/10 flex items-center justify-center">
                          <div className="w-6 h-6 bg-brand rounded-full flex items-center justify-center shadow">
                            <Check size={12} className="text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2 bg-white text-left">
                      <p className="text-[11px] font-bold text-gray-900 line-clamp-2 leading-tight">{t.name}</p>
                      {t.duration_hours && (
                        <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                          <Clock size={8} /> {t.duration_hours}h
                        </p>
                      )}
                      {mode === 'shared' && t.is_shared_enabled && (
                        <p className="text-[10px] font-bold text-brand mt-0.5">
                          R$ {Number(t.shared_price_per_person).toFixed(0)}/pax
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* SHARED mode info */}
        {mode === 'shared' && selectedTour && selectedTour.is_shared_enabled && (
          <div className="px-4 mb-5">
            <div className="bg-gradient-to-br from-brand to-amber-500 rounded-2xl p-5">
              <p className="text-white/70 text-xs mb-3 font-medium">Passeio Compartilhado</p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/70 text-xs">por pessoa</p>
                  <p className="text-white font-bold text-3xl leading-none">R$ {Number(selectedTour.shared_price_per_person).toFixed(0)}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-xs">{people} pax · total</p>
                  <p className="text-white font-bold text-xl leading-none">{fmt(sharedTotalPrice)}</p>
                </div>
              </div>
              <p className="text-white/50 text-xs mt-3 leading-relaxed">Você viaja com outros grupos. Ótimo custo-benefício!</p>
            </div>
          </div>
        )}

        {/* PRIVATE mode: suggestions + catalog */}
        {mode === 'private' && selectedTour && (
          <>
            {vehiclesLoading ? (
              <div className="px-4 mb-5"><PageSpinner /></div>
            ) : (
              <>
                {suggestions.length > 0 && (
                  <div className="mb-5">
                    <p className="px-4 font-bold text-gray-900 text-sm mb-2.5">Sugestões rápidas</p>
                    <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-1">
                      {suggestions.map(s => {
                        const isApplied = JSON.stringify(vehicleQtys) === JSON.stringify(s.combo)
                        return (
                          <div key={s.id} className="shrink-0 w-44 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                            <div className={`${s.bg} px-3 py-1.5 flex items-center gap-1.5`}>
                              <s.Icon size={12} className="text-white" />
                              <span className="text-white text-[11px] font-bold">{s.label}</span>
                            </div>
                            <div className="p-3">
                              <p className="text-xs text-gray-800 font-semibold mb-0.5 line-clamp-2 leading-tight">{s.description}</p>
                              <p className="text-[10px] text-gray-400 mb-2.5">{s.capacity} lugares · {fmt(s.price)}</p>
                              <button
                                onClick={() => { setVehicleQtys(s.combo); setBookingError('') }}
                                className={`w-full h-7 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                                  isApplied ? 'bg-brand/10 text-brand' : 'bg-gray-900 text-white'
                                }`}
                              >
                                {isApplied ? '✓ Aplicado' : 'Aplicar'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {vehicles.length > 0 && (
                  <div className="px-4 mb-5">
                    <p className="font-bold text-gray-900 text-sm mb-3">Catálogo de veículos</p>
                    <div className="space-y-3">
                      {vehicles.map(v => {
                        const qty    = vehicleQtys[v.id] || 0
                        const capPct = people > 0 ? Math.min(100, (qty * v.seat_capacity / people) * 100) : 0
                        return (
                          <div key={v.id} className={`rounded-2xl border-2 transition-all overflow-hidden ${qty > 0 ? 'border-brand' : 'border-gray-100'}`}>
                            <div className="flex items-center gap-3 p-3.5">
                              <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${qty > 0 ? 'bg-brand/10' : 'bg-gradient-to-br from-orange-50 to-amber-50'}`}>
                                <Zap size={22} className={qty > 0 ? 'text-brand' : 'text-brand/40'} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 text-sm leading-tight">{v.name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{v.seat_capacity} lugares · {v.vehicle_type}</p>
                                <p className="text-sm font-bold text-brand mt-1">{fmt(v.base_price)}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {qty > 0 ? (
                                  <>
                                    <button onClick={() => changeQty(v.id, -1)} className="w-8 h-8 rounded-full border-2 border-gray-200 bg-white flex items-center justify-center active:scale-95">
                                      <Minus size={14} className="text-gray-600" />
                                    </button>
                                    <span className="w-5 text-center font-bold text-gray-900 text-sm">{qty}</span>
                                    <button onClick={() => changeQty(v.id, 1)} className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95">
                                      <Plus size={14} className="text-white" />
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => changeQty(v.id, 1)}
                                    className="h-9 px-4 bg-brand/10 text-brand text-sm font-bold rounded-xl active:scale-95 hover:bg-brand/20 transition-colors"
                                  >
                                    Adicionar
                                  </button>
                                )}
                              </div>
                            </div>
                            {qty > 0 && (
                              <div className="px-3.5 pb-3 flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${capPct >= 100 ? 'bg-green-500' : 'bg-brand'}`} style={{ width: `${capPct}%` }} />
                                </div>
                                <span className="text-[10px] text-gray-400 shrink-0">{qty * v.seat_capacity}/{people} pax</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {hasVehicles && !capacityOk && (
              <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                <Users size={14} className="text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">
                  Capacidade ({totalCapacity}) menor que {people} pessoas. Adicione mais veículos.
                </p>
              </div>
            )}
          </>
        )}

        <div className={`h-${bookingError ? '36' : '28'}`} />
      </div>

      {/* ── Summary Bar ── */}
      {(selectedTour || hasVehicles) && (
        <div className="fixed bottom-[68px] left-1/2 -translate-x-1/2 w-full max-w-[430px] z-30 bg-white border-t border-gray-100 shadow-[0_-6px_24px_rgba(0,0,0,0.08)] px-4 pt-3 pb-4">
          <div>
            {summaryChips.length > 0 && (
              <div className="flex gap-2 mb-2.5 overflow-x-auto scrollbar-hide">
                {summaryChips.map(v => (
                  <div key={v.id} className="shrink-0 flex items-center gap-1.5 bg-brand/10 border border-brand/20 rounded-full px-2.5 py-1">
                    <span className="text-xs font-bold text-brand">{vehicleQtys[v.id]}x</span>
                    <span className="text-xs text-gray-700 whitespace-nowrap">{v.name}</span>
                    <button onClick={() => changeQty(v.id, -(vehicleQtys[v.id]))}><X size={10} className="text-gray-400 ml-0.5" /></button>
                  </div>
                ))}
                {capacityOk && totalCapacity > 0 && (
                  <div className="shrink-0 flex items-center gap-1 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                    <Check size={10} className="text-green-500" />
                    <span className="text-xs text-green-700 font-medium">{totalCapacity} lugares</span>
                  </div>
                )}
              </div>
            )}

            {bookingError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">{bookingError}</p>
            )}

            <div className="flex items-center gap-4">
              <div className="flex-1">
                {totalPrice > 0 ? (
                  <>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Total</p>
                    <p className="text-xl font-bold text-gray-900 leading-none">{fmt(totalPrice)}</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-400">
                    {mode === 'private' ? 'Selecione os veículos' : 'Passeio selecionado'}
                  </p>
                )}
              </div>
              <button
                onClick={handleContinue}
                disabled={!canContinue}
                className={`h-12 px-6 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${
                  canContinue
                    ? 'bg-brand text-white shadow-lg shadow-brand/30'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                Continuar <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
