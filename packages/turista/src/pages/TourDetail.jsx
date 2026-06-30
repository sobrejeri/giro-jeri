import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useRegion } from '../contexts/RegionContext'
import { PageSpinner } from '../components/ui/Spinner'
import Card from '../components/ui/Card'
import OriginPicker from '../components/OriginPicker'
import {
  Clock, Users, ChevronLeft, CheckCircle, XCircle,
  Zap, Sun, Waves, Anchor, UserCheck,
  Plus, Minus, MapPin, Bus, Info,
} from 'lucide-react'

const CATEGORY_ICONS = {
  'buggy':      Zap,
  'por-do-sol': Sun,
  'lagoas':     Waves,
  'barco':      Anchor,
}

function fmt(value) {
  return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

const priceOf = (v) => Number(v?.base_price || 0)

function suggest(vehicles, people, filter = 'recommended') {
  if (!vehicles.length) return null
  const ok = vehicles.filter(v => v.is_private_allowed !== false && v.is_tour_allowed !== false)
  if (!ok.length) return null
  const fits = ok.filter(v => v.seat_capacity >= people)

  if (filter === 'economico') {
    const cheapestFit = fits.slice().sort((a, b) => priceOf(a) - priceOf(b))[0]
    if (cheapestFit) return { vehicle: cheapestFit, qty: 1 }
    const cheapest = ok.slice().sort((a, b) => priceOf(a) - priceOf(b))[0]
    return { vehicle: cheapest, qty: Math.ceil(people / cheapest.seat_capacity) }
  }

  if (filter === 'conforto') {
    const roomiestFit = fits.slice().sort((a, b) => b.seat_capacity - a.seat_capacity)[0]
    if (roomiestFit) return { vehicle: roomiestFit, qty: 1 }
    const biggest = ok.slice().sort((a, b) => b.seat_capacity - a.seat_capacity)[0]
    return { vehicle: biggest, qty: Math.ceil(people / biggest.seat_capacity) }
  }

  const single = fits.slice().sort((a, b) => a.seat_capacity - b.seat_capacity)[0]
  if (single) return { vehicle: single, qty: 1 }
  const biggest = ok.slice().sort((a, b) => b.seat_capacity - a.seat_capacity)[0]
  if (!biggest) return null
  return { vehicle: biggest, qty: Math.ceil(people / biggest.seat_capacity) }
}

function VehicleCard({ vehicle, qty, onAdd, onRemove }) {
  return (
    <div className={`bg-white rounded-xl p-3 border flex items-center gap-3 transition-all ${qty > 0 ? 'border-brand shadow-sm shadow-brand/10' : 'border-gray-100'}`}>
      <div className={`w-12 h-10 rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${vehicle.image_url ? 'bg-white' : 'bg-gray-100'}`}>
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={vehicle.name} className="w-full h-full object-contain p-0.5" />
        ) : (
          <Zap size={16} className="text-gray-400" />
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
          className="w-7 h-7 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform shrink-0"
        >
          <Plus size={12} className="text-white" />
        </button>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRemove}
            className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Minus size={10} className="text-gray-600" />
          </button>
          <span className="text-[13px] font-bold text-gray-900 w-4 text-center">{qty}</span>
          <button
            onClick={onAdd}
            className="w-6 h-6 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus size={10} className="text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

const FILTERS = [
  { id: 'recommended', label: 'Recomendado', emoji: '⭐' },
  { id: 'economico',   label: 'Econômico',   emoji: '💰' },
  { id: 'conforto',    label: 'Conforto',     emoji: '🛡️' },
]

export default function TourDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const location  = useLocation()
  const { token } = useAuth()
  const { region, userCoords } = useRegion()

  const [mode,   setMode]   = useState('shared')
  const [people, setPeople] = useState(location.state?.people || 2)
  const [cart,   setCart]   = useState({})
  const [filter, setFilter] = useState('recommended')
  const [origin, setOrigin] = useState(null)
  const [showOriginPicker, setShowOriginPicker] = useState(false)

  const { data: tour, isLoading } = useQuery({
    queryKey: ['tour', id],
    queryFn:  () => api.getTour(id),
  })

  const { data: vehiclesData, isFetched: vehiclesFetched } = useQuery({
    queryKey: ['tour-vehicles', id],
    queryFn:  () => api.getTourVehicles(id),
    enabled:  !!id && mode === 'private',
    staleTime: 5 * 60 * 1000,
  })

  const { data: allVehiclesData } = useQuery({
    queryKey: ['vehicles-fallback'],
    queryFn:  () => api.getVehicles({ is_active: 'true' }),
    enabled:  vehiclesFetched && (vehiclesData || []).length === 0 && mode === 'private',
    staleTime: 5 * 60 * 1000,
  })

  const vehicles = useMemo(
    () => (vehiclesData || []).length > 0 ? vehiclesData : (allVehiclesData || []),
    [vehiclesData, allVehiclesData],
  )

  useEffect(() => {
    if (!tour) return
    if (!tour.is_shared_enabled && tour.is_private_enabled) setMode('private')
    else if (tour.is_shared_enabled && !tour.is_private_enabled) setMode('shared')
  }, [tour])

  useEffect(() => { setCart({}) }, [mode])

  const IconComp = CATEGORY_ICONS[tour?.categories?.slug] || Zap

  const suggestion = useMemo(() => suggest(vehicles, people, filter), [vehicles, people, filter])

  const sortedVehicles = useMemo(() => {
    const arr = vehicles.slice()
    if (filter === 'economico') return arr.sort((a, b) => priceOf(a) - priceOf(b))
    if (filter === 'conforto')  return arr.sort((a, b) => b.seat_capacity - a.seat_capacity)
    return arr
  }, [vehicles, filter])

  const cartItems = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([vid, qty]) => ({ vehicle: vehicles.find(x => x.id === vid), qty }))
    .filter(x => x.vehicle)

  const cartTotal    = cartItems.reduce((sum, { vehicle, qty }) => sum + (vehicle.base_price ? Number(vehicle.base_price) * qty : 0), 0)
  const cartCapacity = cartItems.reduce((s, { vehicle, qty }) => s + vehicle.seat_capacity * qty, 0)
  const cartHasItems = cartItems.length > 0

  const regionId = tour?.regions?.id || tour?.region_id

  function handleContinue() {
    if (!token) {
      navigate('/login', { state: { from: `/passeios/${id}` } })
      return
    }
    if (!origin) { setShowOriginPicker(true); return }

    if (mode === 'shared') {
      const pricePerPerson = Number(tour.shared_price_per_person)
      const total = pricePerPerson * people
      navigate('/checkout/resumo', {
        state: {
          service_name:          tour.name,
          short_description:     tour.short_description || null,
          service_type:          'tour',
          booking_mode:          'shared',
          service_date:          'A confirmar',
          service_date_iso:      new Date().toISOString().split('T')[0],
          service_time:          'A confirmar',
          people_count:          people,
          price_per_person:      pricePerPerson,
          origin_text:           origin.name,
          origin_latitude:       origin.latitude,
          origin_longitude:      origin.longitude,
          total_price:           total,
          breakdown:             { [`${people}x por pessoa`]: total },
          cover_image_url:       tour.cover_image_url || null,
          region_id:             regionId,
          service_id:            tour.id,
          vehicles:              [],
          booking_cutoff_time:   tour.booking_cutoff_time || null,
          open_editing:          true,
        },
      })
    } else {
      navigate('/checkout/resumo', {
        state: {
          service_name:          tour.name,
          short_description:     tour.short_description || null,
          service_type:          'tour',
          booking_mode:          'private',
          service_date:          'A confirmar',
          service_date_iso:      new Date().toISOString().split('T')[0],
          service_time:          'A confirmar',
          people_count:          people,
          origin_text:           origin.name,
          origin_latitude:       origin.latitude,
          origin_longitude:      origin.longitude,
          vehicle_name:          cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + '),
          total_price:           cartTotal,
          breakdown:             { 'Veículos selecionados': cartTotal },
          cover_image_url:       tour.cover_image_url || null,
          region_id:             regionId,
          service_id:            tour.id,
          vehicles:              cartItems.map(({ vehicle, qty }) => ({ vehicle_id: vehicle.id, qty, unit_price: Number(vehicle.base_price) || 0 })),
          booking_cutoff_time:   tour.booking_cutoff_time || null,
          open_editing:          true,
        },
      })
    }
  }

  if (isLoading) return <PageSpinner />
  if (!tour) return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center text-gray-400">
      Passeio não encontrado.
    </div>
  )

  const sharedPrice = tour.shared_price_per_person ? Number(tour.shared_price_per_person) : null
  const sharedTotal = sharedPrice ? sharedPrice * people : 0
  const canContinueShared  = mode === 'shared' && sharedPrice > 0
  const canContinuePrivate = mode === 'private' && cartHasItems && cartCapacity >= people

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/passeios" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand mb-6 transition-colors">
        <ChevronLeft size={16} />
        Passeios
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Tour info ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <div className="h-64 md:h-80 rounded-2xl relative overflow-hidden">
            {tour.cover_image_url ? (
              <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover" />
            ) : (
              <div className="h-full bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center">
                <IconComp size={80} className="text-brand/15" />
              </div>
            )}
            {tour.highlight_badge && (
              <span className="absolute top-4 left-4 bg-brand text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                {tour.highlight_badge}
              </span>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-brand mb-2">{tour.categories?.name}</p>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-gray-900 mb-3">
              {tour.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
              {tour.duration_hours && (
                <span className="flex items-center gap-1.5"><Clock size={15} /> {tour.duration_hours}h de duração</span>
              )}
              {tour.max_people && (
                <span className="flex items-center gap-1.5"><Users size={15} /> até {tour.max_people} pessoas</span>
              )}
              {tour.difficulty_level && (
                <span className="flex items-center gap-1.5"><UserCheck size={15} /> {tour.difficulty_level}</span>
              )}
            </div>
            <p className="text-gray-600 leading-relaxed">{tour.full_description || tour.short_description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tour.includes_text && (
              <Card className="p-5">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-500" /> Incluído
                </h4>
                <ul className="space-y-1.5">
                  {tour.includes_text.split(',').map((item, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <CheckCircle size={13} className="text-green-400 mt-0.5 shrink-0" />
                      {item.trim()}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {tour.excludes_text && (
              <Card className="p-5">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <XCircle size={16} className="text-gray-400" /> Não incluído
                </h4>
                <ul className="space-y-1.5">
                  {tour.excludes_text.split(',').map((item, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <XCircle size={13} className="text-gray-300 mt-0.5 shrink-0" />
                      {item.trim()}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {tour.cancellation_policy_text && (
              <Card className="p-5">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <XCircle size={16} className="text-red-400" /> Cancelamento
                </h4>
                <p className="text-sm text-gray-600">{tour.cancellation_policy_text}</p>
              </Card>
            )}
          </div>

          {tour.tour_schedules && tour.tour_schedules.length > 0 && (
            <Card className="p-5">
              <h4 className="font-semibold text-gray-900 mb-3">Horários disponíveis</h4>
              <div className="flex flex-wrap gap-2">
                {tour.tour_schedules.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 bg-orange-50 text-brand text-sm font-medium px-3 py-1.5 rounded-full">
                    <Clock size={13} /> {s.departure_time} — {s.schedule_name}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Booking sidebar ───────────────────────── */}
        <div className="lg:col-span-1">
          <Card className="p-5 sticky top-20 space-y-4">
            <h3 className="font-semibold text-gray-900">Reservar passeio</h3>

            {tour.is_shared_enabled && tour.is_private_enabled && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode('shared')}
                  className={`h-9 rounded-xl text-sm font-medium transition-colors ${mode === 'shared' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Compartilhado
                </button>
                <button
                  onClick={() => setMode('private')}
                  className={`h-9 rounded-xl text-sm font-medium transition-colors ${mode === 'private' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Privativo
                </button>
              </div>
            )}

            {!tour.is_private_enabled && tour.is_shared_enabled && (
              <div className="bg-orange-50 text-brand text-xs font-medium px-3 py-2 rounded-lg text-center">
                Apenas compartilhado
              </div>
            )}
            {tour.is_private_enabled && !tour.is_shared_enabled && (
              <div className="bg-orange-50 text-brand text-xs font-medium px-3 py-2 rounded-lg text-center">
                Apenas privativo
              </div>
            )}

            {/* Origin */}
            <button
              onClick={() => setShowOriginPicker(true)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors text-left ${
                origin ? 'bg-white border-gray-200 hover:border-gray-300' : 'bg-brand/5 border-brand border-dashed'
              }`}
            >
              <MapPin size={15} className="text-brand shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 leading-none">Local de saída *</p>
                <p className={`text-[13px] font-semibold mt-0.5 truncate ${
                  origin ? 'text-gray-700' : 'text-brand'
                }`}>
                  {origin?.name || 'Selecionar local'}
                </p>
              </div>
            </button>

            {/* People */}
            <div>
              <p className="text-[13px] font-semibold text-gray-700 mb-2">Pessoas</p>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                <button
                  onClick={() => setPeople(p => Math.max(1, p - 1))}
                  className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-transform"
                >
                  <Minus size={14} className="text-gray-600" />
                </button>
                <span className="text-xl font-bold text-gray-900 tabular-nums">{people}</span>
                <button
                  onClick={() => setPeople(p => p + 1)}
                  className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Plus size={14} className="text-white" />
                </button>
              </div>
            </div>

            {/* ── SHARED ────────────────────── */}
            {mode === 'shared' && (
              <>
                {sharedPrice ? (
                  <>
                    <div className="bg-brand rounded-xl p-4">
                      <p className="text-white/70 text-[12px] font-medium">Preço por pessoa</p>
                      <p className="text-white text-[26px] font-extrabold leading-tight mt-0.5">
                        R$ {sharedPrice.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-white/70 text-[12px] mt-0.5">
                        {tour.name}{tour.duration_hours ? ` · ${tour.duration_hours}h` : ''}
                      </p>
                      <div className="flex items-center justify-between mt-3 bg-white/15 rounded-lg px-3 py-2">
                        <span className="text-white/80 text-[13px]">
                          {people} {people === 1 ? 'pessoa' : 'pessoas'}
                        </span>
                        <span className="text-white font-bold text-[15px]">
                          R$ {sharedTotal.toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                      <div className="flex items-start gap-2">
                        <Bus size={13} className="text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-blue-700 leading-relaxed">
                          Passeio compartilhado com outros turistas em veículo coletivo. Valor fixo por pessoa, com guia incluso.
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <p className="text-[13px] text-gray-400">Passeio não disponível em modo compartilhado.</p>
                  </div>
                )}
              </>
            )}

            {/* ── PRIVATE ───────────────────── */}
            {mode === 'private' && (
              <>
                {suggestion && (
                  <div>
                    <p className="text-[13px] font-semibold text-gray-700 mb-2">
                      Sugestão para {people} {people === 1 ? 'pessoa' : 'pessoas'}
                    </p>
                    <div className="flex gap-1.5 mb-2">
                      {FILTERS.map(({ id: fid, label, emoji }) => (
                        <button
                          key={fid}
                          onClick={() => setFilter(fid)}
                          className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                            filter === fid
                              ? 'bg-brand text-white border-brand'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {emoji} {label}
                        </button>
                      ))}
                    </div>
                    <div className="bg-white rounded-xl p-2.5 border border-gray-100 flex items-center gap-2.5">
                      <div className={`w-12 h-10 rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${suggestion.vehicle.image_url ? 'bg-white' : 'bg-gray-100'}`}>
                        {suggestion.vehicle.image_url ? (
                          <img src={suggestion.vehicle.image_url} alt={suggestion.vehicle.name} className="w-full h-full object-contain p-0.5" />
                        ) : (
                          <Zap size={16} className="text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-gray-900">
                          {suggestion.qty > 1 ? `${suggestion.qty}x ` : ''}{suggestion.vehicle.name}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Users size={9} className="text-gray-400" />
                          <span className="text-[10px] text-gray-500">
                            Até {suggestion.vehicle.seat_capacity * suggestion.qty} pessoas
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {suggestion.vehicle.base_price && (
                          <span className="text-[13px] font-bold text-brand">
                            R$ {(Number(suggestion.vehicle.base_price) * suggestion.qty).toLocaleString('pt-BR')}
                          </span>
                        )}
                        <button
                          onClick={() => setCart({ [suggestion.vehicle.id]: suggestion.qty })}
                          className="bg-brand text-white text-[10px] font-bold px-2.5 py-1 rounded-full active:scale-95 transition-transform"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {sortedVehicles.length > 0 && (
                  <div>
                    <p className="text-[13px] font-semibold text-gray-700">Catálogo de veículos</p>
                    <p className="text-[11px] text-brand mt-0.5 mb-2">Monte sua combinação ideal</p>
                    <div className="space-y-2">
                      {sortedVehicles.map(v => (
                        <VehicleCard
                          key={v.id}
                          vehicle={v}
                          qty={cart[v.id] || 0}
                          onAdd={() => setCart(c => ({ ...c, [v.id]: (c[v.id] || 0) + 1 }))}
                          onRemove={() => setCart(c => ({ ...c, [v.id]: Math.max(0, (c[v.id] || 1) - 1) }))}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {cartHasItems && (
                  <div className={`rounded-xl p-3 border ${cartCapacity >= people ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <p className="text-[12px] font-bold text-gray-700 mb-1">
                      {cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ')}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Users size={11} className={cartCapacity >= people ? 'text-green-600' : 'text-red-500'} />
                        <span className={`text-[11px] font-medium ${cartCapacity >= people ? 'text-green-600' : 'text-red-500'}`}>
                          {cartCapacity}/{people} pax
                        </span>
                      </div>
                      <span className="text-[16px] font-extrabold text-brand">
                        R$ {cartTotal.toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* CTA */}
            <button
              onClick={(canContinueShared || canContinuePrivate) ? handleContinue : undefined}
              className={`w-full py-3 rounded-xl font-bold text-[14px] transition-all ${
                (canContinueShared || canContinuePrivate)
                  ? 'bg-brand text-white shadow-md active:scale-[0.98] cursor-pointer'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {mode === 'private' && !cartHasItems
                ? 'Selecione veículos'
                : mode === 'private' && cartCapacity < people
                  ? 'Capacidade insuficiente'
                  : 'Continuar'}
            </button>
          </Card>
        </div>
      </div>

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
