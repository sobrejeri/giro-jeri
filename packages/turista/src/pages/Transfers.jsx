import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { useQuery }    from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth }     from '../contexts/AuthContext'
import { useRegion }   from '../contexts/RegionContext'
import { api }         from '../lib/api'
import TransfersDesktop from './TransfersDesktop'
import {
  MapPin, Calendar, Clock, Users, ChevronDown, ChevronLeft, ChevronRight,
  Minus, Plus, Car, X, Check, Info, Zap, Send, CheckCircle2, Route, Loader2,
} from 'lucide-react'
import {
  format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isBefore, addMonths, subMonths, getDay, isToday, addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Place Autocomplete (Nominatim / OpenStreetMap) ─────────── */
function usePlaceSuggestions(query) {
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!query || query.length < 3) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          q:               query,
          format:          'json',
          limit:           '6',
          addressdetails:  '1',
          countrycodes:    'br',
          'accept-language': 'pt-BR',
          viewbox:         '-41.5,-3.8,-39.5,-2.0', // bias around Jericoacoara
          bounded:         '0',
        })
        const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          headers: { 'User-Agent': 'GiroJeri/1.0 (sobrejeri@gmail.com)' },
        })
        const data = await res.json()
        setResults(data.map(p => ({
          id:    p.place_id,
          label: p.display_name.split(',').slice(0, 3).join(', '),
          full:  p.display_name,
          lat:   parseFloat(p.lat),
          lon:   parseFloat(p.lon),
        })))
      } catch { setResults([]) }
      finally  { setLoading(false) }
    }, 350)
    return () => clearTimeout(timerRef.current)
  }, [query])

  return { results, loading }
}

export function PlaceInput({ value, onChange, placeholder, dotClass }) {
  const [open, setOpen]  = useState(false)
  const wrapRef          = useRef(null)
  const { results, loading } = usePlaceSuggestions(open ? value : '')

  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 text-[13px] text-gray-800 bg-transparent outline-none placeholder-gray-400"
        />
        {loading && <Loader2 size={13} className="animate-spin text-gray-400 shrink-0" />}
        {value && !loading && (
          <button onClick={() => { onChange(''); setOpen(false) }} className="shrink-0">
            <X size={13} className="text-gray-400" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => { onChange(r.label); setOpen(false) }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50 last:border-0"
            >
              <MapPin size={13} className="text-brand shrink-0 mt-0.5" />
              <span className="text-[12px] text-gray-700 leading-snug">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Rotas populares (derivadas do catálogo real) ───────────── */
const GRADIENTS = [
  'from-orange-400 to-amber-300',
  'from-purple-400 to-violet-300',
  'from-blue-400 to-sky-300',
  'from-teal-400 to-emerald-300',
  'from-sky-400 to-cyan-300',
  'from-indigo-400 to-blue-300',
  'from-rose-400 to-pink-300',
  'from-emerald-400 to-green-300',
]

const shortPlace = (s = '') =>
  s.replace('Aeroporto de Jericoacoara (Cruz)', 'Aeroporto JJD')
   .replace('Jericoacoara', 'Jeri')

// Aeroporto e Fortaleza primeiro; depois por menor preço
function pickPopularRoutes(routes) {
  if (!routes.length) return []
  const score = (r) => {
    const s = `${r.origin_name} ${r.destination_name}`.toLowerCase()
    if (s.includes('aeroporto')) return 0
    if (s.includes('fortaleza')) return 1
    return 2
  }
  return [...routes]
    .sort((a, b) => score(a) - score(b) || Number(a.default_price) - Number(b.default_price))
    .slice(0, 8)
}

function PresetCard({ route, bg, active, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`flex-none w-[150px] rounded-2xl overflow-hidden shadow-sm border active:scale-95 transition-transform text-left ${active ? 'border-brand ring-2 ring-brand/20' : 'border-black/5'}`}
    >
      <div className={`bg-gradient-to-br ${bg} px-3 pt-2.5 pb-2`}>
        <span className="inline-block text-[9px] font-bold text-white bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full mb-1.5">
          Privativo
        </span>
        <p className="text-white font-bold text-[12px] leading-tight">
          {shortPlace(route.origin_name)} → {shortPlace(route.destination_name)}
        </p>
        <div className="flex items-center gap-1 mt-1">
          <Users size={9} className="text-white/70" />
          <span className="text-[10px] text-white/80">Até 4</span>
        </div>
      </div>
      <div className="bg-white px-3 py-2">
        <p className="text-[9px] text-gray-400">Privativo a partir de</p>
        <p className="text-[13px] font-extrabold text-gray-900">
          R$ {Number(route.default_price).toLocaleString('pt-BR')}
        </p>
      </div>
    </button>
  )
}

/* ── Date picker (bottom sheet) ─────────────────────────────── */
function DateSheet({ value, onChange, onClose }) {
  const today  = startOfDay(new Date())
  const [view, setView] = useState(startOfMonth(value))
  const days   = eachDayOfInterval({ start: startOfMonth(view), end: endOfMonth(view) })
  const offset = getDay(startOfMonth(view))
  const canPrev = !isBefore(subMonths(view, 1), startOfMonth(today))
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">Escolha a data</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={14} className="text-gray-500" /></button>
        </div>
        <div className="flex items-center justify-between px-5 mb-3">
          <button disabled={!canPrev} onClick={() => setView(m => subMonths(m, 1))}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30 active:scale-95">
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          <p className="text-[14px] font-semibold text-gray-900 capitalize">{format(view, 'MMMM yyyy', { locale: ptBR })}</p>
          <button onClick={() => setView(m => addMonths(m, 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
        <div className="grid grid-cols-7 px-4 mb-1">
          {['D','S','T','Q','Q','S','S'].map((d,i) => <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 px-4 gap-y-0.5 mb-4">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {days.map(day => {
            const past = isBefore(day, today)
            const sel  = isSameDay(day, value)
            return (
              <button key={day.toISOString()} disabled={past} onClick={() => { onChange(day); onClose() }}
                className={`aspect-square flex items-center justify-center rounded-full text-[13px] transition-all
                  ${sel ? 'bg-brand text-white font-bold' : ''}
                  ${!sel && isToday(day) ? 'text-brand font-bold' : ''}
                  ${!sel && !isToday(day) && !past ? 'text-gray-800 active:bg-gray-100 font-medium' : ''}
                  ${past ? 'text-gray-300 cursor-not-allowed' : ''}`}
              >{format(day, 'd')}</button>
            )
          })}
        </div>
        <div className="px-4 pb-8">
          <button onClick={onClose} className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform">Confirmar</button>
        </div>
      </div>
    </>
  )
}

/* ── Route picker (bottom sheet) ────────────────────────────── */
function RouteSheet({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">{title}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={14} className="text-gray-500" /></button>
        </div>
        <div className="px-4 pb-8 space-y-2 max-h-72 overflow-y-auto">
          {options.map(opt => (
            <button key={opt} onClick={() => { onSelect(opt); onClose() }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] ${selected === opt ? 'border-brand bg-orange-50' : 'border-gray-100 bg-white'}`}
            >
              <div className="flex items-center gap-3">
                <MapPin size={14} className={selected === opt ? 'text-brand' : 'text-gray-400'} />
                <span className={`text-[13px] font-semibold ${selected === opt ? 'text-brand' : 'text-gray-800'}`}>{opt}</span>
              </div>
              {selected === opt && <Check size={14} className="text-brand" />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* ── Vehicle suggestion ─────────────────────────────────────── */
export function suggestVehicles(vehicles, people) {
  if (!vehicles.length) return null
  const single = vehicles.filter(v => v.seat_capacity >= people)
                         .sort((a, b) => a.seat_capacity - b.seat_capacity)[0]
  if (single) return { vehicle: single, qty: 1 }
  const biggest = [...vehicles].sort((a, b) => b.seat_capacity - a.seat_capacity)[0]
  if (!biggest) return null
  return { vehicle: biggest, qty: Math.ceil(people / biggest.seat_capacity) }
}

/* ── Vehicle row with qty controls ──────────────────────────── */
export function VehicleRow({ vehicle, unitPrice, qty, onAdd, onRemove }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-all border-l-4 ${qty > 0 ? 'border-brand bg-brand/5' : 'border-transparent'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${qty > 0 ? 'bg-brand' : 'bg-gray-100'}`}>
        <Car size={18} className={qty > 0 ? 'text-white' : 'text-gray-400'} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[13px] font-bold text-gray-900 truncate">{vehicle.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Users size={10} className="text-gray-400" />
          <span className="text-[11px] text-gray-400">Até {vehicle.seat_capacity} pessoas</span>
        </div>
        {unitPrice && (
          <p className="text-[11px] text-gray-500 mt-0.5">
            R$ {Number(unitPrice).toLocaleString('pt-BR')}<span className="text-gray-400"> /veículo</span>
          </p>
        )}
      </div>
      {qty === 0 ? (
        <button onClick={onAdd}
          className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <Plus size={14} className="text-white" />
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onRemove}
            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
            <Minus size={11} className="text-gray-600" />
          </button>
          <span className="text-[14px] font-bold text-gray-900 w-4 text-center tabular-nums">{qty}</span>
          <button onClick={onAdd}
            className="w-7 h-7 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform">
            <Plus size={11} className="text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Transfers() {
  const navigate  = useNavigate()
  const { token } = useAuth()
  const { region, userCoords, getServiceQuery } = useRegion()
  const timeRef      = useRef(null)
  const customTimeRef = useRef(null)

  // mode: 'rota' | 'custom'
  const [mode, setMode] = useState('rota')

  const [origin,     setOrigin]     = useState('Jericoacoara')
  const [dest,       setDest]       = useState('')
  const [date,       setDate]       = useState(startOfDay(new Date()))
  const [time,       setTime]       = useState('08:00')
  const [people,     setPeople]     = useState(2)
  const [cart,       setCart]       = useState({})   // vehicleId → qty
  const [notes,      setNotes]      = useState('')
  const [showDate,   setShowDate]   = useState(false)
  const [showOrigin, setShowOrigin] = useState(false)
  const [showDest,   setShowDest]   = useState(false)
  const [loading,    setLoading]    = useState(false)

  // Custom ride state
  const [customOrigin,   setCustomOrigin]   = useState('')
  const [customDest,     setCustomDest]     = useState('')
  const [customDate,     setCustomDate]     = useState(startOfDay(new Date()))
  const [customTime,     setCustomTime]     = useState('08:00')
  const [customPeople,   setCustomPeople]   = useState(2)
  const [customNotes,    setCustomNotes]    = useState('')
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customLoading,  setCustomLoading]  = useState(false)
  const [customSuccess,  setCustomSuccess]  = useState(false)
  const [customError,    setCustomError]    = useState('')

  async function handleRequestQuote() {
    if (!token) { navigate('/login'); return }
    if (!customOrigin.trim() || !customDest.trim() || !customTime) return
    setCustomLoading(true)
    setCustomError('')
    try {
      await api.requestQuote({
        region_id:              region?.id || '',
        origin_place_name:      customOrigin.trim(),
        destination_place_name: customDest.trim(),
        service_date:           format(customDate, 'yyyy-MM-dd'),
        service_time:           customTime,
        people_count:           customPeople,
        luggage_count:          0,
        special_notes:          customNotes.trim() || undefined,
      })
      setCustomSuccess(true)
    } catch (err) {
      setCustomError(err.message || 'Erro ao solicitar cotação')
    } finally {
      setCustomLoading(false)
    }
  }

  const customDateLabel = isToday(customDate) ? 'Hoje'
    : isSameDay(customDate, addDays(startOfDay(new Date()), 1)) ? 'Amanhã'
    : format(customDate, 'd MMM', { locale: ptBR })

  const canCustomBook = customOrigin.trim().length >= 2 && customDest.trim().length >= 2 && !!customTime

  /* ── Queries ── */
  const { data: routesData } = useQuery({
    queryKey: ['transfer-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })
  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles', region?.id, userCoords?.lat, userCoords?.lon],
    queryFn:  () => api.getVehicles ? api.getVehicles(getServiceQuery()) : Promise.resolve([]),
  })

  const routes   = Array.isArray(routesData?.routes) ? routesData.routes
                 : Array.isArray(routesData) ? routesData : []
  const vehicles = (Array.isArray(vehiclesData) ? vehiclesData : vehiclesData?.vehicles || [])
                    .filter(v => v.is_transfer_allowed)

  const origins    = useMemo(() => [...new Set(routes.map(r => r.origin_name))], [routes])
  const dests      = useMemo(() => routes.filter(r => r.origin_name === origin).map(r => r.destination_name), [routes, origin])
  const matched    = useMemo(() => routes.find(r => r.origin_name === origin && r.destination_name === dest), [routes, origin, dest])
  const unitPrice  = matched ? Number(matched.default_price) : null
  const popularRoutes = useMemo(() => pickPopularRoutes(routes), [routes])

  const suggestion = useMemo(() => suggestVehicles(vehicles, people), [vehicles, people])

  const cartItems    = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ vehicle: vehicles.find(v => v.id === id), qty }))
    .filter(x => x.vehicle)
  const cartCapacity = cartItems.reduce((s, { vehicle, qty }) => s + vehicle.seat_capacity * qty, 0)
  const cartTotal    = unitPrice ? cartItems.reduce((s, { qty }) => s + unitPrice * qty, 0) : 0
  const cartHasItems = cartItems.length > 0
  const canBook      = !!matched && cartHasItems && cartCapacity >= people && !!time

  // Acréscimo de alta temporada / feriado já no resumo (antes de confirmar)
  const { data: surchargeData } = useQuery({
    queryKey: ['transfer-surcharge', region?.id, format(date, 'yyyy-MM-dd'), cartTotal],
    queryFn:  () => api.transferSurcharge({
      region_id:    region.id,
      service_date: format(date, 'yyyy-MM-dd'),
      subtotal:     cartTotal,
    }),
    enabled:   !!matched && cartHasItems && cartTotal > 0 && !!region?.id,
    staleTime: 30_000,
    retry:     false,
  })
  const seasonAddition = Number(surchargeData?.seasonAdditional) || 0
  const grandTotal     = Math.round((cartTotal + seasonAddition) * 100) / 100

  const dateLabel = isToday(date) ? 'Hoje'
    : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? 'Amanhã'
    : format(date, 'd MMM', { locale: ptBR })

  async function handleConfirm() {
    if (!token) { navigate('/login'); return }
    if (!canBook) return
    navigate('/checkout/resumo', {
      state: {
        service_name:        `Transfer ${origin} → ${dest}`,
        service_type:        'transfer',
        booking_mode:        'private',
        service_date:        dateLabel,
        service_date_iso:    format(date, 'yyyy-MM-dd'),
        service_time:        time,
        people_count:        people,
        origin_text:         origin,
        destination_text:    dest,
        vehicle_name:        cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + '),
        total_price:         cartTotal,
        transfer_unit_price: unitPrice,
        breakdown:           { 'Veículos': cartTotal },
        region_id:           region?.id || null,
        service_id:          matched?.id,
        vehicles:            cartItems.map(({ vehicle, qty }) => ({ vehicle_id: vehicle.id, qty })),
        booking_cutoff_time: matched?.transfers?.booking_cutoff_time || null,
      },
    })
  }

  return (
    <>
    <div className="lg:hidden min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-3 shadow-sm lg:max-w-3xl lg:mx-auto lg:mt-4 lg:rounded-2xl">
        <h1 className="text-[20px] font-extrabold text-gray-900">Transfer</h1>
        <p className="text-[12px] text-gray-400 mt-0.5">Transporte privativo com motorista</p>

        {/* Mode toggle */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setMode('rota')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all ${
              mode === 'rota' ? 'bg-brand text-white shadow-sm' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <Route size={13} />
            Rota definida
          </button>
          <button
            onClick={() => { setMode('custom'); setCustomSuccess(false); setCustomError('') }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all ${
              mode === 'custom' ? 'bg-brand text-white shadow-sm' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <Zap size={13} />
            Translado personalizado
          </button>
        </div>
      </div>

      {/* ── CUSTOM RIDE FORM ─────────────────────────────────── */}
      {mode === 'custom' && (
        <div className="px-4 pt-4 space-y-3 lg:max-w-3xl lg:mx-auto">
          {customSuccess ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <p className="text-[18px] font-extrabold text-gray-900 mb-2">Cotação solicitada!</p>
              <p className="text-[13px] text-gray-500 max-w-[240px] mb-6">
                A cooperativa irá analisar e enviar um valor para você confirmar.
              </p>
              <button
                onClick={() => navigate('/minhas-reservas')}
                className="bg-brand text-white font-bold rounded-2xl px-6 py-3 text-[14px] active:scale-95 transition-transform"
              >
                Ver minhas cotações
              </button>
              <button
                onClick={() => { setCustomSuccess(false); setCustomOrigin(''); setCustomDest(''); setCustomNotes('') }}
                className="mt-3 text-[13px] text-gray-400 underline"
              >
                Solicitar outra corrida
              </button>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  Informe os pontos de embarque e destino. A cooperativa confirma e envia o valor da corrida para você.
                </p>
              </div>

              {/* Origin / Dest */}
              <section className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Rota</p>
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Embarque</label>
                    <div className="mt-1">
                      <PlaceInput
                        value={customOrigin}
                        onChange={setCustomOrigin}
                        placeholder="Ex: Hotel Jeri Beach"
                        dotClass="bg-brand"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Destino</label>
                    <div className="mt-1">
                      <PlaceInput
                        value={customDest}
                        onChange={setCustomDest}
                        placeholder="Ex: Aeroporto de Jericoacoara"
                        dotClass="border-2 border-gray-400 bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Data & Horário */}
              <section className="bg-white rounded-2xl border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Data & Horário</p>
                <div className="flex gap-2 px-4 pb-4">
                  <button onClick={() => setShowCustomDate(true)}
                    className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform">
                    <Calendar size={13} className="text-brand" />
                    <div className="text-left">
                      <p className="text-[9px] text-gray-400 leading-none">Data</p>
                      <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{customDateLabel}</p>
                    </div>
                  </button>
                  <button onClick={() => customTimeRef.current?.showPicker?.() || customTimeRef.current?.focus()}
                    className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform relative">
                    <Clock size={13} className="text-brand" />
                    <div className="text-left flex-1">
                      <p className="text-[9px] text-gray-400 leading-none">Horário</p>
                      <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{customTime || 'Selecionar'}</p>
                    </div>
                    <input
                      ref={customTimeRef}
                      type="time"
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full cursor-pointer"
                    />
                  </button>
                </div>
              </section>

              {/* Passageiros */}
              <section className="bg-white rounded-2xl border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Passageiros</p>
                <div className="flex items-center justify-between px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-brand" />
                    <p className="text-[13px] font-bold text-gray-900">{customPeople} passageiro{customPeople !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCustomPeople(p => Math.max(1, p - 1))}
                      className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
                      <Minus size={12} className="text-gray-600" />
                    </button>
                    <span className="text-[15px] font-bold text-gray-900 w-5 text-center tabular-nums">{customPeople}</span>
                    <button onClick={() => setCustomPeople(p => Math.min(20, p + 1))}
                      className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform">
                      <Plus size={12} className="text-white" />
                    </button>
                  </div>
                </div>
              </section>

              {/* Observações */}
              <section className="bg-white rounded-2xl border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Observações</p>
                <div className="px-4 pb-4">
                  <textarea
                    rows={3}
                    value={customNotes}
                    onChange={e => setCustomNotes(e.target.value)}
                    placeholder="Ex: 2 malas grandes, voo às 14h, precisamos de cadeirinha..."
                    className="w-full text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400"
                  />
                </div>
              </section>

              {customError && (
                <p className="text-[12px] text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{customError}</p>
              )}

              <div className="flex items-start gap-2 px-1">
                <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Valor a combinar. A cooperativa irá confirmar a corrida e enviar o preço para sua aprovação.
                </p>
              </div>
            </>
          )}

          {showCustomDate && (
            <DateSheet value={customDate} onChange={setCustomDate} onClose={() => setShowCustomDate(false)} />
          )}
        </div>
      )}

      {/* ── FIXED ROUTE FORM ─────────────────────────────────── */}
      {mode === 'rota' && (
      <><div className="px-4 pt-4 space-y-3 lg:max-w-3xl lg:mx-auto">

        {/* ROTAS POPULARES */}
        {popularRoutes.length > 0 && (
        <div>
          <p className="text-[13px] font-bold text-gray-700 mb-2.5">Rotas populares</p>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
            {popularRoutes.map((r, i) => (
              <PresetCard
                key={r.id}
                route={r}
                bg={GRADIENTS[i % GRADIENTS.length]}
                active={origin === r.origin_name && dest === r.destination_name}
                onSelect={() => { setOrigin(r.origin_name); setDest(r.destination_name); setCart({}) }}
              />
            ))}
          </div>
        </div>
        )}

        {/* ROTA */}
        <section className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Rota</p>

          <button onClick={() => setShowOrigin(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-50 active:bg-gray-50">
            <div className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-[10px] text-gray-400">Origem</p>
              <p className={`text-[13px] font-semibold ${origin ? 'text-gray-900' : 'text-gray-400'}`}>
                {origin || 'Selecione o ponto de partida'}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          </button>

          <button onClick={() => dests.length ? setShowDest(true) : null}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-100 active:bg-gray-50">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-[10px] text-gray-400">Destino</p>
              <p className={`text-[13px] font-semibold ${dest ? 'text-gray-900' : 'text-gray-400'}`}>
                {dest || (dests.length ? 'Selecione o destino' : 'Escolha a origem primeiro')}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          </button>
        </section>

        {/* DATA & HORÁRIO */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Data & Horário</p>
          <div className="flex gap-2 px-4 pb-4">
            <button onClick={() => setShowDate(true)}
              className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform">
              <Calendar size={13} className="text-brand" />
              <div className="text-left">
                <p className="text-[9px] text-gray-400 leading-none">Data</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{dateLabel}</p>
              </div>
            </button>
            <button onClick={() => timeRef.current?.showPicker?.() || timeRef.current?.focus()}
              className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform relative">
              <Clock size={13} className="text-brand" />
              <div className="text-left flex-1">
                <p className="text-[9px] text-gray-400 leading-none">Horário</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{time || 'Selecionar'}</p>
              </div>
              <input
                ref={timeRef}
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="absolute inset-0 opacity-0 w-full cursor-pointer"
              />
            </button>
          </div>
        </section>

        {/* PASSAGEIROS */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Passageiros</p>
          <div className="flex items-center justify-between px-4 pb-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand" />
              <div>
                <p className="text-[13px] font-bold text-gray-900">{people} passageiro{people !== 1 ? 's' : ''}</p>
                <p className="text-[10px] text-gray-400">Passageiros adicionais a combinar</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPeople(p => Math.max(1, p - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
                <Minus size={12} className="text-gray-600" />
              </button>
              <span className="text-[15px] font-bold text-gray-900 w-5 text-center tabular-nums">{people}</span>
              <button onClick={() => setPeople(p => Math.min(20, p + 1))}
                className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform">
                <Plus size={12} className="text-white" />
              </button>
            </div>
          </div>
        </section>

        {/* VEÍCULO */}
        {vehicles.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Veículo</p>

            {/* Sugestão */}
            {suggestion && (
              <div className="mx-4 mb-3 bg-orange-50 rounded-2xl p-3 border border-orange-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shrink-0">
                  <Car size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-900">
                    {suggestion.qty > 1 ? `${suggestion.qty}x ` : ''}{suggestion.vehicle.name}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Users size={10} className="text-gray-400" />
                    <span className="text-[11px] text-gray-400">
                      Até {suggestion.vehicle.seat_capacity * suggestion.qty} pessoas
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {unitPrice && (
                    <span className="text-[13px] font-bold text-brand">
                      R$ {(unitPrice * suggestion.qty).toLocaleString('pt-BR')}
                    </span>
                  )}
                  <button
                    onClick={() => setCart({ [suggestion.vehicle.id]: suggestion.qty })}
                    className="bg-brand text-white text-[11px] font-bold px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-50">
              {vehicles.map(v => (
                <VehicleRow
                  key={v.id}
                  vehicle={v}
                  unitPrice={unitPrice}
                  qty={cart[v.id] || 0}
                  onAdd={() => setCart(c => ({ ...c, [v.id]: (c[v.id] || 0) + 1 }))}
                  onRemove={() => setCart(c => ({ ...c, [v.id]: Math.max(0, (c[v.id] || 1) - 1) }))}
                />
              ))}
            </div>
          </section>
        )}

        {/* OBSERVAÇÕES */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Observações & Bagagens</p>
          <div className="px-4 pb-4">
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: 2 malas grandes, precisamos de cadeirinha..."
              className="w-full text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400"
            />
          </div>
        </section>

        {/* RESUMO */}
        {matched && (
          <section className="bg-white rounded-2xl border border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-3">Resumo do transfer</p>
            <div className="px-4 pb-4 space-y-2.5">
              {[
                { dot: 'bg-brand',    label: 'Origem',      val: origin },
                { dot: 'bg-gray-400', label: 'Destino',     val: dest   },
                { icon: Calendar,     label: 'Data & Hora', val: `${dateLabel} às ${time || '—'}` },
                { icon: Users,        label: 'Passageiros', val: `${people} pessoa${people !== 1 ? 's' : ''}` },
                ...(cartItems.length ? [{ icon: Car, label: 'Veículo', val: cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ') }] : []),
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  {row.dot
                    ? <div className={`w-2.5 h-2.5 rounded-full ${row.dot} shrink-0`} />
                    : <row.icon size={13} className="text-brand shrink-0" />}
                  <div className="flex-1 flex items-center justify-between">
                    <p className="text-[12px] text-gray-400">{row.label}</p>
                    <p className="text-[12px] font-semibold text-gray-800">{row.val}</p>
                  </div>
                </div>
              ))}
              {seasonAddition > 0 && (
                <>
                  <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                    <p className="text-[12px] text-gray-400">Subtotal</p>
                    <p className="text-[13px] font-semibold text-gray-800">R$ {cartTotal.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] text-amber-600">Alta temporada / feriado</p>
                    <p className="text-[13px] font-semibold text-amber-600">+ R$ {seasonAddition.toLocaleString('pt-BR')}</p>
                  </div>
                </>
              )}
              <div className={`flex items-center justify-between ${seasonAddition > 0 ? 'pt-0.5' : 'border-t border-gray-100 pt-2'}`}>
                <p className="text-[13px] font-bold text-gray-900">Total</p>
                <p className="text-[16px] font-extrabold text-brand">R$ {grandTotal ? grandTotal.toLocaleString('pt-BR') : '—'}</p>
              </div>
            </div>
          </section>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 px-1">
          <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Motorista aparecerá no local de embarque com placa identificada.
            Cancelamento gratuito até 24h antes.
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
        <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10px] text-gray-400">Total estimado{seasonAddition > 0 ? ' · com alta temporada' : ''}</p>
            <p className={`text-[16px] font-extrabold ${canBook ? 'text-brand' : 'text-gray-400'}`}>
              {grandTotal ? `R$ ${grandTotal.toLocaleString('pt-BR')}` : 'Selecione a rota'}
            </p>
          </div>
          <button
            onClick={canBook ? handleConfirm : undefined}
            disabled={loading}
            className={`font-bold rounded-xl px-5 py-2.5 text-[13px] transition-transform ${
              canBook ? 'bg-brand text-white active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? 'Aguarde…' : 'Confirmar Transfer'}
          </button>
        </div>
      </div>

      {/* Sheets */}
      {showDate   && <DateSheet value={date} onChange={setDate} onClose={() => setShowDate(false)} />}
      {showOrigin && <RouteSheet title="Escolha a origem" options={origins} selected={origin} onSelect={v => { setOrigin(v); setDest(''); setCart({}) }} onClose={() => setShowOrigin(false)} />}
      {showDest   && <RouteSheet title="Escolha o destino" options={dests} selected={dest} onSelect={v => { setDest(v); setCart({}) }} onClose={() => setShowDest(false)} />}
    </> )} {/* end mode === 'rota' */}

      {/* Bottom CTA — Custom ride */}
      {mode === 'custom' && !customSuccess && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
          <button
            onClick={canCustomBook ? handleRequestQuote : undefined}
            disabled={customLoading || !canCustomBook}
            className={`w-full font-bold rounded-2xl py-4 text-[14px] flex items-center justify-center gap-2 transition-transform shadow-xl ${
              canCustomBook ? 'bg-brand text-white active:scale-[0.98] shadow-brand/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Send size={16} />
            {customLoading ? 'Solicitando…' : 'Solicitar cotação'}
          </button>
        </div>
      )}
    </div>

    <div className="hidden lg:block">
      <TransfersDesktop />
    </div>
    </>
  )
}
