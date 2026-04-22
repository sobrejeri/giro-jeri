import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  MapPin, SlidersHorizontal, Calendar, Users,
  Star, Clock, Heart, Zap, Plus, Minus, Check,
} from 'lucide-react'

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
        {tour.shared_price_per_person && (
          <p className="text-brand font-bold text-[12px] mt-1">
            R$ {Number(tour.shared_price_per_person).toLocaleString('pt-BR')}
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Card de veículo no catálogo ────────────────────────────── */
function VehicleCard({ vehicle, qty, onAdd, onRemove }) {
  return (
    <div className="bg-white rounded-2xl p-3 border border-gray-100 flex items-center gap-3">
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

/* ── Main ───────────────────────────────────────────────────── */
export default function Tours() {
  const navigate = useNavigate()

  const [mode, setMode] = useState('private')
  const [selectedId, setSelectedId] = useState(null)
  const [people, setPeople] = useState(2)
  const [filter, setFilter] = useState('recommended')
  const [cart, setCart] = useState({})
  const [favs, setFavs] = useState(new Set())
  const toggleFav = (id) =>
    setFavs((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  /* ── Queries ──────────────────────────────────────────────── */
  const { data: toursData, isLoading: toursLoading } = useQuery({
    queryKey: ['tours'],
    queryFn: () => api.getTours(),
  })
  const tours = toursData?.tours || toursData || []
  const selectedTour = tours.find((t) => t.id === selectedId) || tours[0]

  const { data: vehiclesData } = useQuery({
    queryKey: ['tour-vehicles', selectedTour?.id],
    queryFn: () => api.getTourVehicles(selectedTour.id),
    enabled: !!selectedTour?.id && mode === 'private',
  })
  const vehicles = useMemo(() => vehiclesData || [], [vehiclesData])

  /* ── Sugestão ─────────────────────────────────────────────── */
  const suggestion = useMemo(() => suggest(vehicles, people), [vehicles, people])

  /* ── Carrinho ─────────────────────────────────────────────── */
  const cartTotal = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .reduce((sum, [id, q]) => {
      const v = vehicles.find((x) => x.id === id)
      return sum + (v?.base_price ? Number(v.base_price) * q : 0)
    }, 0)
  const cartHasItems = Object.values(cart).some((q) => q > 0)

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
              <span className="text-[12px] text-gray-500">Jericoacoara, CE</span>
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
          <button className="shrink-0 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 active:scale-95 transition-transform">
            <MapPin size={11} className="text-brand" />
            <div className="text-left">
              <p className="text-[9px] text-gray-400 leading-none">Saída</p>
              <p className="text-[11px] font-semibold text-gray-700 mt-0.5 leading-tight">Centro de Jericoacoara</p>
            </div>
          </button>
          <button className="shrink-0 flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 active:scale-95 transition-transform">
            <Calendar size={11} className="text-brand" />
            <div className="text-left">
              <p className="text-[9px] text-gray-400 leading-none">Data</p>
              <p className="text-[11px] font-semibold text-gray-700 mt-0.5 leading-tight">Hoje</p>
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
        {mode === 'shared' && selectedTour && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[14px] font-bold text-gray-900">Passeio compartilhado</p>
            <p className="text-[12px] text-gray-500 mt-1 mb-3">Divida com outros turistas e pague menos</p>
            {selectedTour.shared_price_per_person ? (
              <>
                <div className="flex items-center justify-between py-2 border-t border-gray-100">
                  <span className="text-[13px] text-gray-600">Preço por pessoa</span>
                  <span className="text-[14px] font-bold text-gray-900">
                    R$ {Number(selectedTour.shared_price_per_person).toLocaleString('pt-BR')}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/passeios/${selectedTour.id}`, { state: { mode: 'shared', people } })}
                  className="w-full mt-3 bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
                >
                  Reservar compartilhado
                </button>
              </>
            ) : (
              <p className="text-[13px] text-gray-400">Passeio não disponível em modo compartilhado.</p>
            )}
          </div>
        )}

      </div>

      {/* ── CTA fixo (modo privativo com veículos no carrinho) ── */}
      {mode === 'private' && cartHasItems && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
          <button
            onClick={() => navigate(`/passeios/${selectedTour?.id}`, { state: { cart, people, mode: 'private' } })}
            className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-[15px] shadow-xl shadow-brand/30 active:scale-[0.98] transition-transform flex items-center justify-between px-5"
          >
            <span>Continuar reserva</span>
            <span className="text-[14px] font-extrabold">
              {cartTotal > 0 ? `R$ ${cartTotal.toLocaleString('pt-BR')}` : '→'}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
