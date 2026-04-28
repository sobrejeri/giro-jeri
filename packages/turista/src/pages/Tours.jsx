import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import OriginPicker from '../components/OriginPicker'
import {
  MapPin, SlidersHorizontal, Calendar, Users,
  Star, Clock, Heart, Zap, Plus, Minus, Check,
  ChevronLeft, ChevronRight, X, Info, Bus,
} from 'lucide-react'
import {
  format, startOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, isBefore, addMonths, subMonths,
  getDay, isToday, addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Gradiente fallback p/ cards sem imagem ─────────────────── */
const GRADIENTS = [
  ['from-orange-400', 'to-amber-300'],
  ['from-sky-400',    'to-blue-300'],
  ['from-teal-400',   'to-emerald-300'],
  ['from-violet-400', 'to-purple-300'],
]
function gi(id = '') {
  let n = 0; for (const c of id) n += c.charCodeAt(0); return n % GRADIENTS.length
}

/* ── Sugestão de veículo ideal para N pessoas ───────────────── */
function suggest(vehicles, people) {
  if (!vehicles.length) return null
  const ok = vehicles.filter(v => v.is_private_allowed !== false && v.is_tour_allowed !== false)
  const single = ok.filter(v => v.seat_capacity >= people)
                   .sort((a, b) => a.seat_capacity - b.seat_capacity)[0]
  if (single) return { vehicle: single, qty: 1 }
  const biggest = ok.sort((a, b) => b.seat_capacity - a.seat_capacity)[0]
  if (!biggest) return null
  return { vehicle: biggest, qty: Math.ceil(people / biggest.seat_capacity) }
}

/* ── Card de passeio na seleção horizontal ──────────────────── */
function TourPickCard({ tour, selected, onSelect, isFav, onFav }) {
  const [from, to] = GRADIENTS[gi(tour.id)]
  return (
    <div
      onClick={onSelect}
      className={`shrink-0 w-[140px] rounded-2xl overflow-hidden bg-white cursor-pointer transition-all active:scale-[0.96] ${
        selected ? 'ring-2 ring-brand shadow-md' : 'border border-gray-100 shadow-sm'
      }`}
    >
      <div className="h-[88px] relative overflow-hidden">
        {tour.cover_image_url ? (
          <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`h-full bg-gradient-to-br ${from} ${to} flex items-center justify-center`}>
            <Zap size={28} className="text-white/20" />
          </div>
        )}
        {selected && (
          <div className="absolute top-2 left-2 w-5 h-5 bg-brand rounded-full flex items-center justify-center shadow">
            <Check size={10} className="text-white" strokeWidth={3} />
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onFav() }}
          className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center"
        >
          <Heart size={10} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
        </button>
      </div>
      <div className="p-2">
        <p className="text-[11px] font-bold text-gray-900 leading-tight line-clamp-1 mb-0.5">{tour.name}</p>
        <div className="flex items-center gap-1">
          {tour.rating_average > 0 && <>
            <Star size={9} className="text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-gray-500">{tour.rating_average}</span>
          </>}
          {tour.duration_hours && <>
            <Clock size={9} className="text-gray-400 ml-0.5" />
            <span className="text-[10px] text-gray-400">{tour.duration_hours}h</span>
          </>}
        </div>
      </div>
    </div>
  )
}

/* ── Card de veículo no catálogo ────────────────────────────── */
function VehicleCard({ vehicle, qty, onAdd, onRemove }) {
  return (
    <div className={`bg-white rounded-2xl p-3 border flex items-center gap-3 transition-all ${qty > 0 ? 'border-brand shadow-sm shadow-brand/10' : 'border-gray-100'}`}>
      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={vehicle.name} className="w-full h-full object-cover" />
        ) : (
          <Zap size={20} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 truncate">{vehicle.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Users size={10} className="text-gray-400" />
          <span className="text-[11px] text-gray-500">Até {vehicle.seat_capacity} pessoas</span>
        </div>
        {vehicle.base_price && (
          <p className="text-[11px] text-gray-500 mt-0.5">
            R$ {Number(vehicle.base_price).toLocaleString('pt-BR')}
            <span className="text-gray-400"> /veículo</span>
          </p>
        )}
      </div>
      {qty === 0 ? (
        <button
          onClick={onAdd}
          className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform shrink-0"
        >
          <Plus size={14} className="text-white" />
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRemove}
            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Minus size={11} className="text-gray-600" />
          </button>
          <span className="text-[14px] font-bold text-gray-900 w-4 text-center">{qty}</span>
          <button
            onClick={onAdd}
            className="w-7 h-7 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus size={11} className="text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Calendário (bottom sheet) ──────────────────────────────── */
function DatePickerSheet({ value, onChange, onClose }) {
  const today = startOfDay(new Date())
  const [viewMonth, setViewMonth] = useState(startOfMonth(value))

  const days = eachDayOfInterval({
    start: startOfMonth(viewMonth),
    end:   endOfMonth(viewMonth),
  })
  const offset = getDay(startOfMonth(viewMonth))
  const canGoPrev = !isBefore(subMonths(viewMonth, 1), startOfMonth(today))

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">Escolha a data</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 mb-3">
          <button
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            disabled={!canGoPrev}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
          >
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          <p className="text-[14px] font-semibold text-gray-900 capitalize">
            {format(viewMonth, 'MMMM yyyy', { locale: ptBR })}
          </p>
          <button
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 px-4 mb-1">
          {['D','S','T','Q','Q','S','S'].map((d, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-4 gap-y-0.5 mb-4">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {days.map((day) => {
            const past     = isBefore(day, today)
            const selected = isSameDay(day, value)
            const todayDay = isToday(day)
            return (
              <button
                key={day.toISOString()}
                disabled={past}
                onClick={() => { onChange(day); onClose() }}
                className={`aspect-square flex items-center justify-center rounded-full text-[13px] transition-all
                  ${selected  ? 'bg-brand text-white font-bold' : ''}
                  ${!selected && todayDay ? 'text-brand font-bold' : ''}
                  ${!selected && !todayDay && !past ? 'text-gray-800 active:bg-gray-100 font-medium' : ''}
                  ${past ? 'text-gray-300 cursor-not-allowed' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>

        <div className="px-4 pb-8">
          <button
            onClick={onClose}
            className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            Confirmar
          </button>
        </div>
      </div>
    </>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Tours() {
  const navigate = useNavigate()
  const { state: locationState } = useLocation()
  const { region, userCoords, userPlace, getServiceQuery } = useRegion()

  const [mode, setMode] = useState('private')
  const [selectedId, setSelectedId] = useState(locationState?.selectedId || null)
  const [people, setPeople] = useState(2)
  const [date, setDate] = useState(startOfDay(new Date()))
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [filter, setFilter] = useState('recommended')
  const [cart, setCart] = useState({})
  const [favs, setFavs] = useState(new Set())
  const [origin, setOrigin] = useState(null) // { name, latitude, longitude }
  const [showOriginPicker, setShowOriginPicker] = useState(false)
  const originLabel = origin?.name || 'Centro de Jericoacoara'
  const toggleFav = (id) =>
    setFavs((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  /* ── Queries ──────────────────────────────────────────────── */
  const geo = getServiceQuery()
  const { data: toursData, isLoading: toursLoading } = useQuery({
    queryKey: ['tours', region?.id, userCoords?.lat, userCoords?.lon],
    queryFn: () => api.getTours(geo),
  })
  const tours = toursData?.tours || toursData || []
  const selectedTour = tours.find((t) => t.id === selectedId) || tours[0]

  const { data: vehiclesData, isFetched: vehiclesFetched } = useQuery({
    queryKey: ['tour-vehicles', selectedTour?.id],
    queryFn: () => api.getTourVehicles(selectedTour.id),
    enabled: !!selectedTour?.id && mode === 'private',
  })

  // Fallback: se o passeio não tiver regras de preço, usa todos os veículos ativos
  const { data: allVehiclesData } = useQuery({
    queryKey: ['vehicles', region?.id, userCoords?.lat, userCoords?.lon],
    queryFn: () => api.getVehicles({ is_active: 'true', ...geo }),
    enabled: vehiclesFetched && (vehiclesData || []).length === 0 && mode === 'private',
  })

  const vehicles = useMemo(
    () => (vehiclesData || []).length > 0 ? vehiclesData : (allVehiclesData || []),
    [vehiclesData, allVehiclesData],
  )

  /* ── Sugestão ─────────────────────────────────────────────── */
  const suggestion = useMemo(() => suggest(vehicles, people), [vehicles, people])

  /* ── Carrinho ─────────────────────────────────────────────── */
  const cartItems = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ vehicle: vehicles.find((x) => x.id === id), qty }))
    .filter((x) => x.vehicle)

  const cartTotal = cartItems.reduce(
    (sum, { vehicle, qty }) => sum + (vehicle.base_price ? Number(vehicle.base_price) * qty : 0),
    0,
  )
  const cartHasItems = cartItems.length > 0
  const cartCapacity = cartItems.reduce((s, { vehicle, qty }) => s + vehicle.seat_capacity * qty, 0)

  const applySuggestion = () => {
    if (!suggestion) return
    setCart({ [suggestion.vehicle.id]: suggestion.qty })
  }

  const FILTERS = [
    { id: 'recommended', label: 'Recomendado', emoji: '⭐' },
    { id: 'economico',   label: 'Econômico',   emoji: '💰' },
    { id: 'conforto',    label: 'Conforto',     emoji: '🛡️' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 pb-28">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-white px-4 pt-5 pb-3 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[20px] font-extrabold text-gray-900">Passeios</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={11} className="text-brand" />
              <span className="text-[12px] text-gray-500">
                {userPlace || (region?.name ? `${region.name}, CE` : 'Localizando…')}
              </span>
            </div>
          </div>
          <button className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center active:scale-95 transition-transform">
            <SlidersHorizontal size={15} className="text-gray-600" />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── Toggle Privativo / Compartilhado ──────────────── */}
        <div className="flex bg-gray-100 rounded-full p-1 gap-1">
          {[['private', 'Privativo'], ['shared', 'Compartilhado']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex-1 py-2 rounded-full text-[13px] font-semibold transition-all active:scale-[0.98] ${
                mode === id ? 'bg-brand text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Filtros rápidos ───────────────────────────────── */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setShowOriginPicker(true)}
            className="shrink-0 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 active:scale-95 transition-transform max-w-[180px]"
          >
            <MapPin size={11} className="text-brand shrink-0" />
            <div className="text-left min-w-0">
              <p className="text-[9px] text-gray-400 leading-none">Saída</p>
              <p className="text-[11px] font-semibold text-gray-700 mt-0.5 leading-tight truncate">{originLabel}</p>
            </div>
          </button>
          <button
            onClick={() => setShowDatePicker(true)}
            className="shrink-0 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 active:scale-95 transition-transform"
          >
            <Calendar size={11} className="text-brand" />
            <div className="text-left">
              <p className="text-[9px] text-gray-400 leading-none">Data</p>
              <p className="text-[11px] font-semibold text-gray-700 mt-0.5 leading-tight">
                {isToday(date) ? 'Hoje'
                  : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? 'Amanhã'
                  : format(date, 'd MMM', { locale: ptBR })}
              </p>
            </div>
          </button>
          <div className="shrink-0 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <Users size={11} className="text-brand" />
            <div className="text-left">
              <p className="text-[9px] text-gray-400 leading-none">Pessoas</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  onClick={() => setPeople((p) => Math.max(1, p - 1))}
                  className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center active:scale-95"
                >
                  <Minus size={8} className="text-gray-600" />
                </button>
                <span className="text-[11px] font-semibold text-gray-700 w-4 text-center tabular-nums">{people}</span>
                <button
                  onClick={() => setPeople((p) => p + 1)}
                  className="w-4 h-4 rounded-full bg-brand flex items-center justify-center active:scale-95"
                >
                  <Plus size={8} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Escolha o passeio ─────────────────────────────── */}
        <section>
          <p className="text-[14px] font-bold text-gray-900 mb-2.5">Escolha o passeio</p>
          {toursLoading ? (
            <div className="h-[130px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
              {tours.map((tour) => (
                <TourPickCard
                  key={tour.id}
                  tour={tour}
                  selected={selectedTour?.id === tour.id}
                  onSelect={() => { setSelectedId(tour.id); setCart({}) }}
                  isFav={favs.has(tour.id)}
                  onFav={() => toggleFav(tour.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── Modo PRIVATIVO ────────────────────────────────── */}
        {mode === 'private' && (
          <>
            {/* Sugestões */}
            {suggestion && (
              <section>
                <p className="text-[14px] font-bold text-gray-900 mb-2">
                  Sugestões para {people} {people === 1 ? 'pessoa' : 'pessoas'}
                </p>

                {/* Filter chips */}
                <div className="flex gap-2 mb-3">
                  {FILTERS.map(({ id, label, emoji }) => (
                    <button
                      key={id}
                      onClick={() => setFilter(id)}
                      className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all active:scale-95 ${
                        filter === id
                          ? 'bg-brand text-white border-brand'
                          : 'bg-white text-gray-500 border-gray-200'
                      }`}
                    >
                      {emoji} {label}
                    </button>
                  ))}
                </div>

                {/* Suggestion card */}
                <div className="bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
                    {suggestion.vehicle.image_url ? (
                      <img src={suggestion.vehicle.image_url} alt={suggestion.vehicle.name} className="w-full h-full object-cover" />
                    ) : (
                      <Zap size={20} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900">
                      {suggestion.qty > 1 ? `${suggestion.qty}x ` : ''}{suggestion.vehicle.name}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Users size={10} className="text-gray-400" />
                      <span className="text-[11px] text-gray-500">
                        Até {suggestion.vehicle.seat_capacity * suggestion.qty} pessoas
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {suggestion.vehicle.base_price && (
                      <span className="text-[14px] font-bold text-brand">
                        R$ {(Number(suggestion.vehicle.base_price) * suggestion.qty).toLocaleString('pt-BR')}
                      </span>
                    )}
                    <button
                      onClick={applySuggestion}
                      className="bg-brand text-white text-[11px] font-bold px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Catálogo de veículos */}
            {vehicles.length > 0 && (
              <section className="pb-2">
                <p className="text-[14px] font-bold text-gray-900">Catálogo de veículos</p>
                <p className="text-[11px] text-brand mt-0.5 mb-3">Monte sua combinação ideal</p>
                <div className="space-y-2.5">
                  {vehicles.map((v) => (
                    <VehicleCard
                      key={v.id}
                      vehicle={v}
                      qty={cart[v.id] || 0}
                      onAdd={() => setCart((c) => ({ ...c, [v.id]: (c[v.id] || 0) + 1 }))}
                      onRemove={() => setCart((c) => ({ ...c, [v.id]: Math.max(0, (c[v.id] || 1) - 1) }))}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── Modo COMPARTILHADO ────────────────────────────── */}
        {mode === 'shared' && selectedTour && (() => {
          const pricePerPerson = selectedTour.shared_price_per_person
            ? Number(selectedTour.shared_price_per_person) : null
          const sharedTotal = pricePerPerson ? pricePerPerson * people : 0

          return (
            <>
              {/* Número de pessoas */}
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <p className="text-[14px] font-bold text-gray-900">Número de pessoas</p>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-4">Preço calculado por pessoa</p>
                <div className="flex items-center justify-between px-4">
                  <button
                    onClick={() => setPeople((p) => Math.max(1, p - 1))}
                    className="w-11 h-11 rounded-full border-2 border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Minus size={16} className="text-gray-500" />
                  </button>
                  <span className="text-[34px] font-extrabold text-gray-900 tabular-nums">{people}</span>
                  <button
                    onClick={() => setPeople((p) => p + 1)}
                    className="w-11 h-11 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Plus size={16} className="text-white" />
                  </button>
                </div>
              </div>

              {/* Card de preço */}
              {pricePerPerson ? (
                <div className="bg-brand rounded-2xl p-4">
                  <p className="text-white/70 text-[12px] font-medium">Preço por pessoa</p>
                  <p className="text-white text-[30px] font-extrabold leading-tight mt-0.5">
                    R$ {pricePerPerson.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-white/70 text-[12px] mt-0.5">
                    {selectedTour.name}{selectedTour.duration_hours ? ` · ${selectedTour.duration_hours}h` : ''}
                  </p>

                  <div className="flex items-center justify-between mt-4 bg-white/15 rounded-xl px-3 py-2.5">
                    <span className="text-white/80 text-[13px]">
                      {people} {people === 1 ? 'pessoa' : 'pessoas'}
                    </span>
                    <span className="text-white font-bold text-[15px]">
                      R$ {sharedTotal.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3 bg-white/10 rounded-xl px-3 py-2">
                    <Bus size={13} className="text-white/70 shrink-0" />
                    <span className="text-white/80 text-[11px]">
                      Transporte em veículo coletivo com outros turistas
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-4 border border-gray-100">
                  <p className="text-[13px] text-gray-400">Passeio não disponível em modo compartilhado.</p>
                </div>
              )}

              {/* Como funciona */}
              {pricePerPerson && (
                <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
                  <div className="flex items-start gap-2.5">
                    <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] font-bold text-blue-900">Como funciona?</p>
                      <p className="text-[11px] text-blue-700 leading-relaxed mt-0.5">
                        O passeio é compartilhado com outros turistas em uma Jardineira.
                        Valor fixo por pessoa, com guia incluso.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        })()}

      </div>

      {/* ── Calendário ──────────────────────────────────────────── */}
      {showDatePicker && (
        <DatePickerSheet
          value={date}
          onChange={setDate}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* ── CTA fixo (modo privativo com veículos no carrinho) ── */}
      {mode === 'private' && cartHasItems && (() => {
        const canContinue = cartCapacity >= people
        return (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
            <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 flex items-center justify-between px-4 py-3">
              {/* Resumo */}
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-[13px] font-bold text-gray-900 truncate">
                  {cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ')}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Users size={11} className={canContinue ? 'text-gray-400' : 'text-red-400'} />
                  <span className={`text-[11px] font-medium ${canContinue ? 'text-gray-500' : 'text-red-400'}`}>
                    {cartCapacity}/{people}
                  </span>
                </div>
              </div>
              {/* Preço + botão */}
              <div className="flex items-center gap-3 shrink-0">
                {cartTotal > 0 && (
                  <span className={`text-[15px] font-extrabold ${canContinue ? 'text-brand' : 'text-gray-400'}`}>
                    R$ {cartTotal.toLocaleString('pt-BR')}
                  </span>
                )}
                <button
                  onClick={canContinue
                    ? () => navigate('/checkout/resumo', {
                        state: {
                          service_name:     selectedTour.name,
                          service_type:     'tour',
                          booking_mode:     'private',
                          service_date:     isToday(date) ? 'Hoje'
                                              : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? 'Amanhã'
                                              : format(date, "d 'de' MMMM", { locale: ptBR }),
                          service_date_iso: format(date, 'yyyy-MM-dd'),
                          service_time:     'A confirmar',
                          people_count:     people,
                          origin_text:      originLabel,
                          origin_latitude:  origin?.latitude  ?? null,
                          origin_longitude: origin?.longitude ?? null,
                          vehicle_name:     cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + '),
                          total_price:      cartTotal,
                          breakdown:        { 'Veículos selecionados': cartTotal },
                          cover_image_url:  selectedTour.cover_image_url || null,
                          region_id:        selectedTour.regions?.id,
                          service_id:       selectedTour.id,
                          vehicles:         cartItems.map(({ vehicle, qty }) => ({ vehicle_id: vehicle.id, qty })),
                        },
                      })
                    : undefined}
                  className={`font-bold rounded-xl px-4 py-2.5 text-[13px] transition-transform ${
                    canContinue
                      ? 'bg-brand text-white active:scale-95 cursor-pointer'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  Continuar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── CTA fixo (modo compartilhado) ───────────────────────── */}
      {mode === 'shared' && selectedTour?.shared_price_per_person && (() => {
        const pricePerPerson = Number(selectedTour.shared_price_per_person)
        const sharedTotal    = pricePerPerson * people
        return (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
            <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-1">
                  <Users size={11} className="text-gray-400" />
                  <span className="text-[12px] text-gray-500">
                    {people} {people === 1 ? 'passageiro' : 'passageiros'}
                  </span>
                </div>
                <p className="text-[16px] font-extrabold text-brand mt-0.5">
                  R$ {sharedTotal.toLocaleString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => navigate('/checkout/resumo', {
                  state: {
                    service_name:     selectedTour.name,
                    service_type:     'tour',
                    booking_mode:     'shared',
                    service_date:     isToday(date) ? 'Hoje'
                                        : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? 'Amanhã'
                                        : format(date, "d 'de' MMMM", { locale: ptBR }),
                    service_date_iso: format(date, 'yyyy-MM-dd'),
                    service_time:     'A confirmar',
                    people_count:     people,
                    price_per_person: pricePerPerson,
                    origin_text:      'Centro de Jericoacoara',
                    total_price:      sharedTotal,
                    breakdown:        { [`${people}x por pessoa`]: sharedTotal },
                    cover_image_url:  selectedTour.cover_image_url || null,
                    region_id:        selectedTour.regions?.id,
                    service_id:       selectedTour.id,
                    vehicles:         [],
                  },
                })}
                className="bg-brand text-white font-bold rounded-xl px-5 py-2.5 text-[13px] active:scale-95 transition-transform shrink-0"
              >
                Continuar
              </button>
            </div>
          </div>
        )
      })()}

      <OriginPicker
        open={showOriginPicker}
        onClose={() => setShowOriginPicker(false)}
        onSelect={setOrigin}
        region={region}
        userCoords={userCoords}
      />
    </div>
  )
}
