import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useRegion } from '../contexts/RegionContext'
import { api } from '../lib/api'
import {
  Route, Zap, Clock, Users, Car, ShieldCheck, Timer, Headphones,
  Calendar, Plus, Minus, Send, CheckCircle2, Info, ChevronRight, Check,
} from 'lucide-react'
import { PlaceInput, suggestVehicles, VehicleRow } from './Transfers'
import { isHighSeasonIso } from '../lib/season'
import { useCart } from '../contexts/CartContext'
import DesktopDatePicker from '../components/DesktopDatePicker'
import { format, startOfDay, addDays, isToday, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

const todayIso = () => format(new Date(), 'yyyy-MM-dd')

function dayLabel(iso, t) {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  if (isToday(d)) return t('transfersPg.today')
  if (isSameDay(d, addDays(startOfDay(new Date()), 1))) return t('transfersPg.tomorrow')
  return format(d, 'd MMM', { locale: ptBR })
}

function RouteCard({ route, bg, active, onSelect }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onSelect}
      className={`bg-white rounded-2xl overflow-hidden border shadow-sm hover:shadow-md transition-all text-left flex flex-col ${
        active ? 'border-brand ring-2 ring-brand/20' : 'border-gray-100'
      }`}
    >
      {/* Capa: foto da rota quando houver; senão o gradiente de sempre. */}
      <div className="relative h-[150px] overflow-hidden group">
        {route.cover_image_url ? (
          <img
            src={route.cover_image_url} alt="" loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${bg}`} />
        )}
        {/* Escurece a base para o texto ficar legível sobre qualquer foto. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

        <span className="absolute top-3 left-3 text-[10px] font-bold text-white bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full">
          {t('transfersPg.privateBadge')}
        </span>

        <div className="absolute bottom-3 left-4 right-4">
          <p className="text-white font-bold text-[15px] leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,.45)]">
            {route.origin_name} → {route.destination_name}
          </p>
          <div className="flex items-center gap-1 mt-1 text-white/90 text-[11px] [text-shadow:0_1px_2px_rgba(0,0,0,.4)]">
            <Users size={11} /> {t('transfersPg.upTo4Passengers')}
          </div>
        </div>
      </div>
      <div className="p-4 flex items-end justify-between gap-2 flex-1">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-400 leading-none">{t('transfersPg.startingFrom')}</p>
          <p className="text-[20px] font-extrabold text-gray-900 leading-tight mt-1">
            R$ {Number(route.default_price).toLocaleString('pt-BR')}
          </p>
        </div>
        <span className="text-[12px] font-semibold text-brand shrink-0">Selecionar →</span>
      </div>
    </button>
  )
}

export default function TransfersDesktop() {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const { token } = useAuth()
  const { upsertItem: saveCartItem } = useCart()
  const { region, userCoords, getServiceQuery } = useRegion()
  // Busca da home pode chegar com rota/data/pessoas pré-selecionadas
  const { state: navState } = useLocation()
  // Última sugestão auto-aplicada — permite seguir atualizações da sugestão
  // sem sobrescrever escolhas manuais do usuário (mesma regra do mobile).
  const autoAppliedRef = useRef(null)

  const [mode, setMode] = useState('rota')

  /* ── Rota definida ── */
  const [origin, setOrigin] = useState(navState?.origin || '')
  const [dest,   setDest]   = useState(navState?.dest   || '')
  const [date,   setDate]   = useState(navState?.date   || todayIso())
  const [time,   setTime]   = useState('08:00')
  const [people, setPeople] = useState(Number(navState?.people) || 2)
  const [cart,   setCart]   = useState({})

  /* ── Corrida personalizada ── */
  const [customOrigin,  setCustomOrigin]  = useState('')
  const [customDest,    setCustomDest]    = useState('')
  // Metadados do place escolhido na busca (place_id + coordenadas) — enviados
  // à cooperativa junto da solicitação, igual ao mobile.
  const [customOriginMeta, setCustomOriginMeta] = useState(null)
  const [customDestMeta,   setCustomDestMeta]   = useState(null)
  const [customDate,    setCustomDate]    = useState(todayIso)
  const [customTime,    setCustomTime]    = useState('08:00')
  const [customPeople,  setCustomPeople]  = useState(2)
  const [customNotes,   setCustomNotes]   = useState('')
  const [customLoading, setCustomLoading] = useState(false)
  const [customSuccess, setCustomSuccess] = useState(false)
  const [customError,   setCustomError]   = useState('')

  /* ── Queries ── */
  const { data: routesData } = useQuery({
    queryKey: ['transfer-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })
  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles', region?.id, userCoords?.lat, userCoords?.lon],
    queryFn:  () => api.getVehicles(getServiceQuery()),
  })

  const routes = Array.isArray(routesData?.routes) ? routesData.routes
               : Array.isArray(routesData) ? routesData : []
  const vehicles = (Array.isArray(vehiclesData) ? vehiclesData : vehiclesData?.vehicles || [])
                    .filter(v => v.is_transfer_allowed && v.is_active !== false)

  // Alta temporada: regras (datas exatas) p/ colorir o calendário em laranja
  // e avisar quando a data escolhida cai dentro de uma delas.
  const { data: seasonsData } = useQuery({
    queryKey: ['seasons', region?.id],
    queryFn:  () => api.getSeasons(region?.id ? { region_id: region.id } : {}),
    staleTime: 10 * 60 * 1000,
    retry: 3,
  })
  const seasons = useMemo(() => Array.isArray(seasonsData) ? seasonsData : [], [seasonsData])

  // Origem padrão quando as rotas carregam (prefere Jericoacoara)
  useEffect(() => {
    if (origin || !routes.length) return
    const opts = [...new Set(routes.map(r => r.origin_name))]
    setOrigin(opts.find(o => /jeri/i.test(o)) || opts[0] || '')
  }, [routes, origin])

  const origins = useMemo(() => {
    const set = new Set(routes.map(r => r.origin_name))
    if (origin) set.add(origin)
    return [...set]
  }, [routes, origin])
  const dests = useMemo(() => {
    const set = new Set(routes.filter(r => r.origin_name === origin).map(r => r.destination_name))
    if (dest) set.add(dest)
    return [...set]
  }, [routes, origin, dest])

  // Rotas populares — derivadas do catálogo real (aeroporto e Fortaleza primeiro)
  const popularRoutes = useMemo(() => {
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
  }, [routes])

  const matched   = useMemo(() => routes.find(r => r.origin_name === origin && r.destination_name === dest), [routes, origin, dest])
  const unitPrice = matched ? Number(matched.default_price) : null

  // Antecedência mínima (America/Fortaleza): bloqueia datas E horários
  // anteriores a "agora + N horas". Padrão 4h; a rota pode definir a sua
  // (transfers.min_advance_hours, via admin) — mesma regra do mobile.
  const DEFAULT_MIN_ADVANCE_HOURS = 4
  const bookableAfter = (hours) => {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Fortaleza',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a }, {})
    const d = new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), 0)
    d.setHours(d.getHours() + hours)
    return d
  }

  const MIN_ADVANCE_HOURS = matched?.transfers?.min_advance_hours ?? DEFAULT_MIN_ADVANCE_HOURS
  const minBookable = useMemo(() => bookableAfter(MIN_ADVANCE_HOURS), [MIN_ADVANCE_HOURS])
  const minDateIso  = format(minBookable, 'yyyy-MM-dd')
  // Horário mínimo: só restringe quando a data escolhida é o 1º dia disponível.
  const minTime = date === minDateIso ? format(minBookable, 'HH:mm') : '00:00'
  useEffect(() => {
    if (date && date < minDateIso) setDate(minDateIso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDateIso])
  useEffect(() => {
    if (date === minDateIso && time && time < minTime) setTime(minTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, minTime])
  const advanceOk = date > minDateIso || (date === minDateIso && (time || '') >= minTime)

  // Translado personalizado: sem rota, usa a antecedência padrão.
  const customMinBookable = useMemo(() => bookableAfter(DEFAULT_MIN_ADVANCE_HOURS), [])
  const customMinDateIso  = format(customMinBookable, 'yyyy-MM-dd')
  const customMinTime = customDate === customMinDateIso ? format(customMinBookable, 'HH:mm') : '00:00'
  useEffect(() => {
    if (customDate && customDate < customMinDateIso) setCustomDate(customMinDateIso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customMinDateIso])
  useEffect(() => {
    if (customDate === customMinDateIso && customTime && customTime < customMinTime) setCustomTime(customMinTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDate, customMinTime])
  const customAdvanceOk = customDate > customMinDateIso ||
    (customDate === customMinDateIso && (customTime || '') >= customMinTime)

  const suggestion = useMemo(() => suggestVehicles(vehicles, people), [vehicles, people])

  // Auto-aplica a sugestão quando o carrinho está vazio ou ainda reflete a
  // sugestão anterior — escolhas manuais são preservadas (igual ao mobile).
  useEffect(() => {
    if (!suggestion) return
    const key = `${suggestion.vehicle.id}:${suggestion.qty}`
    if (key === autoAppliedRef.current) return
    const entries = Object.entries(cart).filter(([, q]) => q > 0)
    const isEmpty = entries.length === 0
    const matchesPrevAuto = autoAppliedRef.current &&
      entries.length === 1 &&
      entries[0][0] === autoAppliedRef.current.split(':')[0] &&
      Number(entries[0][1]) === Number(autoAppliedRef.current.split(':')[1])
    if (isEmpty || matchesPrevAuto) {
      setCart({ [suggestion.vehicle.id]: suggestion.qty })
      autoAppliedRef.current = key
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion?.vehicle?.id, suggestion?.qty])

  const cartItems = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ vehicle: vehicles.find(v => v.id === id), qty }))
    .filter(x => x.vehicle)
  const cartCapacity = cartItems.reduce((s, { vehicle, qty }) => s + vehicle.seat_capacity * qty, 0)
  const cartTotal    = unitPrice ? cartItems.reduce((s, { qty }) => s + unitPrice * qty, 0) : 0
  const canBook      = !!matched && cartItems.length > 0 && cartCapacity >= people && !!time && advanceOk

  // Sugestão já é o único item do carrinho na quantidade certa
  const suggestionIsApplied = !!(suggestion &&
    cartItems.length === 1 &&
    cartItems[0].vehicle.id === suggestion.vehicle.id &&
    cartItems[0].qty === suggestion.qty)

  // Acréscimo de alta temporada / feriado já no resumo (antes de confirmar)
  const { data: surchargeData } = useQuery({
    queryKey: ['transfer-surcharge', region?.id, date, cartTotal],
    queryFn:  () => api.transferSurcharge({
      region_id:    region.id,
      service_date: date,
      subtotal:     cartTotal,
    }),
    enabled:   !!matched && cartItems.length > 0 && cartTotal > 0 && !!region?.id,
    staleTime: 30_000,
    retry:     false,
  })
  const seasonAddition = Number(surchargeData?.seasonAdditional) || 0
  const grandTotal     = Math.round((cartTotal + seasonAddition) * 100) / 100

  const canCustomBook = customOrigin.trim().length >= 2 && customDest.trim().length >= 2 && !!customTime && customAdvanceOk

  function handleConfirm() {
    if (!token) { navigate('/login', { state: { from: '/transfers' } }); return }
    if (!canBook) return
    // Pré-seleção → carrinho universal: mesma jornada do mobile (a data/hora
    // pode ser refinada lá e vários serviços saem numa única solicitação).
    saveCartItem({
      id:      matched.id,
      kind:    'transfer',
      name:    `${origin} → ${dest}`,
      origin, dest,
      dateIso: date,
      time, people,
      region_id: region?.id || null,
      booking_cutoff_time: matched?.transfers?.booking_cutoff_time || null,
      min_advance_hours:   matched?.transfers?.min_advance_hours ?? null,
      vehicles: cartItems.map(({ vehicle, qty }) => ({
        id: vehicle.id, name: vehicle.name, qty,
        price: unitPrice || 0, cap: vehicle.seat_capacity || null,
      })),
      total: cartTotal,
    })
    navigate('/carrinho')
  }

  async function handleRequestQuote() {
    if (!token) { navigate('/login', { state: { from: '/transfers' } }); return }
    if (!canCustomBook) return
    setCustomLoading(true)
    setCustomError('')
    try {
      await api.requestQuote({
        region_id:                region?.id || '',
        origin_place_name:        customOrigin.trim(),
        origin_place_id:          customOriginMeta?.place_id || undefined,
        origin_latitude:          customOriginMeta?.lat ?? undefined,
        origin_longitude:         customOriginMeta?.lon ?? undefined,
        origin_address_text:      customOriginMeta?.address || undefined,
        destination_place_name:   customDest.trim(),
        destination_place_id:     customDestMeta?.place_id || undefined,
        destination_latitude:     customDestMeta?.lat ?? undefined,
        destination_longitude:    customDestMeta?.lon ?? undefined,
        destination_address_text: customDestMeta?.address || undefined,
        service_date:             customDate,
        service_time:             customTime,
        people_count:             customPeople,
        luggage_count:            0,
        special_notes:            customNotes.trim() || undefined,
      })
      setCustomSuccess(true)
    } catch (err) {
      setCustomError(err.message || t('transfersPg.quoteError'))
    } finally {
      setCustomLoading(false)
    }
  }

  const TRUST = [
    { icon: Car,         title: t('transfersPg.trust.vehicles.title'),    desc: t('transfersPg.trust.vehicles.desc') },
    { icon: ShieldCheck, title: t('transfersPg.trust.drivers.title'),     desc: t('transfersPg.trust.drivers.desc') },
    { icon: Timer,       title: t('transfersPg.trust.punctuality.title'), desc: t('transfersPg.trust.punctuality.desc') },
    { icon: Headphones,  title: t('transfersPg.trust.support.title'),     desc: t('transfersPg.trust.support.desc') },
  ]

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-extrabold text-gray-900">{t('transfersPg.title')}</h1>
      <p className="text-gray-500 mt-1">{t('transfersPg.subtitleDesktop')}</p>

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-3 mt-6 max-w-2xl">
        <button
          onClick={() => setMode('rota')}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold transition-all ${mode === 'rota' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
        >
          <Route size={16} /> {t('transfersPg.modeRoute')}
        </button>
        <button
          onClick={() => { setMode('custom'); setCustomSuccess(false); setCustomError('') }}
          className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-bold transition-all ${mode === 'custom' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
        >
          <Zap size={16} /> {t('transfersPg.modeCustom')}
        </button>
      </div>

      {/* ── ROTA DEFINIDA ─────────────────────────────────────── */}
      {mode === 'rota' && (
        <>
          {popularRoutes.length > 0 && (
            <>
              <h2 className="text-lg font-bold text-gray-900 mt-8 mb-4">{t('transfersPg.popularRoutes')}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
                {popularRoutes.map((r, i) => (
                  <RouteCard
                    key={r.id}
                    route={r}
                    bg={GRADIENTS[i % GRADIENTS.length]}
                    active={origin === r.origin_name && dest === r.destination_name}
                    onSelect={() => { setOrigin(r.origin_name); setDest(r.destination_name); setCart({}) }}
                  />
                ))}
              </div>
            </>
          )}

          <div className="grid lg:grid-cols-3 gap-6 mt-8 items-start">
            {/* Form */}
            <div className="lg:col-span-2 space-y-5">
              {/* Rota */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">{t('transfersPg.routeSection')}</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.origin')}</label>
                    <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                      <div className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />
                      <select
                        value={origin}
                        onChange={e => { setOrigin(e.target.value); setDest(''); setCart({}) }}
                        className="flex-1 bg-transparent text-[14px] font-semibold text-gray-800 outline-none cursor-pointer"
                      >
                        {!origin && <option value="">{t('transfersPg.selectOriginOption')}</option>}
                        {origins.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.destination')}</label>
                    <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 shrink-0" />
                      <select
                        value={dest}
                        onChange={e => { setDest(e.target.value); setCart({}) }}
                        className="flex-1 bg-transparent text-[14px] font-semibold text-gray-800 outline-none cursor-pointer disabled:text-gray-400"
                        disabled={!dests.length}
                      >
                        <option value="">{dests.length ? t('transfersPg.selectDestination') : t('transfersPg.chooseOriginFirst')}</option>
                        {dests.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* Data, Horário, Passageiros */}
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.dateLabel')}</label>
                    <div className="mt-1 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                      <DesktopDatePicker valueIso={date} onChange={setDate} minIso={minDateIso} seasons={seasons} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.timeLabel')}</label>
                    <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                      <Clock size={15} className="text-brand shrink-0" />
                      <input
                        type="time"
                        value={time}
                        min={minTime}
                        onChange={e => setTime(e.target.value)}
                        className="flex-1 bg-transparent text-[14px] font-semibold text-gray-800 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.passengersSection')}</label>
                    <div className="mt-1 flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
                      <span className="text-[14px] font-semibold text-gray-800">{people}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPeople(p => Math.max(1, p - 1))} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Minus size={12} className="text-gray-600" /></button>
                        <button onClick={() => setPeople(p => Math.min(20, p + 1))} className="w-7 h-7 rounded-full bg-brand flex items-center justify-center"><Plus size={12} className="text-white" /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {!advanceOk && (
                  <p className="mt-3 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    {t('transfersPg.minAdvanceNotice', { hours: MIN_ADVANCE_HOURS, datetime: format(minBookable, "d/MM 'às' HH:mm") })}
                  </p>
                )}
                {advanceOk && isHighSeasonIso(date, seasons) && (
                  <p className="mt-3 flex items-center gap-2 text-[12px] text-amber-600">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    {t('transfersPg.highSeasonNotice')}
                  </p>
                )}
              </section>

              {/* Veículo */}
              {vehicles.length > 0 && (
                <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide px-5 pt-5 pb-3">{t('transfersPg.vehicleSection')}</p>

                  {suggestion && (
                    <div className="mx-5 mb-3 bg-orange-50 rounded-2xl p-3 border border-orange-100 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shrink-0">
                        <Car size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-gray-900">
                          {suggestion.qty > 1 ? `${suggestion.qty}x ` : ''}{suggestion.vehicle.name}
                        </p>
                        <p className="text-[11px] text-gray-400">{t('transfersPg.upToPeopleCapacity', { count: suggestion.vehicle.seat_capacity * suggestion.qty })}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {unitPrice && (
                          <span className="text-[13px] font-bold text-brand">
                            R$ {(unitPrice * suggestion.qty).toLocaleString('pt-BR')}
                          </span>
                        )}
                        {suggestionIsApplied ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                            <Check size={11} /> {t('transfersPg.selected')}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setCart({ [suggestion.vehicle.id]: suggestion.qty })
                              autoAppliedRef.current = `${suggestion.vehicle.id}:${suggestion.qty}`
                            }}
                            className="bg-brand text-white text-[11px] font-bold px-3 py-1.5 rounded-full hover:bg-brand-600 transition-colors"
                          >
                            {t('transfersPg.apply')}
                          </button>
                        )}
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

              <div className="flex items-start gap-2 px-1">
                <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-gray-400 leading-relaxed">
                  {t('transfersPg.driverInfoDesktop')}
                </p>
              </div>
            </div>

            {/* Resumo (sticky) */}
            <aside className="lg:sticky lg:top-20">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[15px] font-bold text-gray-900 mb-3">{t('transfersPg.summaryTitle')}</p>
                <div className="space-y-2.5">
                  {[
                    { dot: 'bg-brand',    label: t('transfersPg.origin'),      val: origin || '—' },
                    { dot: 'bg-gray-400', label: t('transfersPg.destination'), val: dest || '—' },
                    { icon: Calendar,     label: t('transfersPg.dateTimeRow'), val: t('transfersPg.dateTimeValue', { date: dayLabel(date, t), time: time || '—' }) },
                    { icon: Users,        label: t('transfersPg.passengersSection'), val: t('transfersPg.peopleCount', { count: people }) },
                    ...(cartItems.length ? [{ icon: Car, label: t('transfersPg.vehicleSection'), val: cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ') }] : []),
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {row.dot
                        ? <div className={`w-2.5 h-2.5 rounded-full ${row.dot} shrink-0`} />
                        : <row.icon size={14} className="text-brand shrink-0" />}
                      <div className="flex-1 flex items-center justify-between gap-3">
                        <p className="text-[12px] text-gray-400">{row.label}</p>
                        <p className="text-[12px] font-semibold text-gray-800 text-right">{row.val}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {seasonAddition > 0 && (
                  <div className="border-t border-gray-100 mt-4 pt-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-gray-400">{t('transfersPg.subtotal')}</p>
                      <p className="text-[13px] font-semibold text-gray-800">R$ {cartTotal.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-amber-600">{t('transfersPg.highSeasonFee')}</p>
                      <p className="text-[13px] font-semibold text-amber-600">+ R$ {seasonAddition.toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                )}
                <div className={`flex items-center justify-between ${seasonAddition > 0 ? 'mt-2' : 'border-t border-gray-100 mt-4 pt-3'}`}>
                  <p className="text-[13px] font-bold text-gray-900">{t('transfersPg.total')}</p>
                  <p className={`text-[20px] font-extrabold ${canBook ? 'text-brand' : 'text-gray-400'}`}>
                    {grandTotal ? `R$ ${grandTotal.toLocaleString('pt-BR')}` : '—'}
                  </p>
                </div>

                <button
                  onClick={handleConfirm}
                  disabled={!canBook}
                  className={`mt-4 w-full py-3.5 rounded-xl font-bold text-[14px] transition-all ${
                    canBook ? 'bg-brand text-white hover:bg-brand-600 active:scale-[0.98]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {!matched ? t('transfersPg.selectRoute')
                    : !cartItems.length ? t('transfersPg.selectVehicleOption')
                    : cartCapacity < people ? t('transfersPg.insufficientCapacity')
                    : !advanceOk ? t('transfersPg.minAdvanceShort', { hours: MIN_ADVANCE_HOURS })
                    : t('transfersPg.continueCta')}
                </button>
              </div>
            </aside>
          </div>
        </>
      )}

      {/* ── CORRIDA PERSONALIZADA ─────────────────────────────── */}
      {mode === 'custom' && (
        <div className="mt-8 max-w-2xl">
          {customSuccess ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t('transfersPg.quoteRequestedTitle')}</h3>
              <p className="text-[14px] text-gray-500 max-w-sm mx-auto mb-6">
                {t('transfersPg.quoteSuccessDescDesktop')}
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => navigate('/minhas-reservas')}
                  className="inline-flex items-center gap-2 bg-brand text-white font-bold px-6 py-3 rounded-xl hover:bg-brand-600 transition-colors"
                >
                  {t('transfersPg.viewQuotes')} <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => { setCustomSuccess(false); setCustomOrigin(''); setCustomDest(''); setCustomOriginMeta(null); setCustomDestMeta(null); setCustomNotes('') }}
                  className="text-[14px] text-gray-500 font-semibold hover:text-gray-700"
                >
                  {t('transfersPg.requestAnother')}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center shrink-0"><Zap size={22} className="text-brand" /></div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{t('transfersPg.modeCustom')}</h3>
                  <p className="text-[13px] text-gray-500">{t('transfersPg.customIntroDesktop')}</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.pickup')}</label>
                  <div className="mt-1">
                    <PlaceInput value={customOrigin} onChange={setCustomOrigin} onPick={setCustomOriginMeta} placeholder={t('transfersPg.placeSearchPlaceholder')} dotClass="bg-brand" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.destination')}</label>
                  <div className="mt-1">
                    <PlaceInput value={customDest} onChange={setCustomDest} onPick={setCustomDestMeta} placeholder={t('transfersPg.placeSearchPlaceholder')} dotClass="border-2 border-gray-400 bg-transparent" />
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.dateLabel')}</label>
                  <div className="mt-1 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                    <DesktopDatePicker valueIso={customDate} onChange={setCustomDate} minIso={customMinDateIso} seasons={seasons} />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.timeLabel')}</label>
                  <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                    <Clock size={15} className="text-brand shrink-0" />
                    <input type="time" value={customTime} min={customMinTime} onChange={e => setCustomTime(e.target.value)} className="flex-1 bg-transparent text-[14px] font-semibold text-gray-800 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.passengersSection')}</label>
                  <div className="mt-1 flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
                    <span className="text-[14px] font-semibold text-gray-800">{customPeople}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCustomPeople(p => Math.max(1, p - 1))} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Minus size={12} className="text-gray-600" /></button>
                      <button onClick={() => setCustomPeople(p => Math.min(20, p + 1))} className="w-7 h-7 rounded-full bg-brand flex items-center justify-center"><Plus size={12} className="text-white" /></button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.notesSection')}</label>
                <textarea
                  rows={3}
                  value={customNotes}
                  onChange={e => setCustomNotes(e.target.value)}
                  placeholder={t('transfersPg.notesPlaceholderCustom')}
                  className="mt-1 w-full text-[14px] text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-brand placeholder-gray-400"
                />
              </div>

              {!customAdvanceOk && (
                <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                  {t('transfersPg.minAdvanceNotice', { hours: DEFAULT_MIN_ADVANCE_HOURS, datetime: format(customMinBookable, "d/MM 'às' HH:mm") })}
                </p>
              )}

              {customError && (
                <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{customError}</p>
              )}

              <div className="flex items-start gap-2">
                <Info size={14} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-gray-400 leading-relaxed">
                  {t('transfersPg.priceNoteCustomDesktop')}
                </p>
              </div>

              <button
                onClick={handleRequestQuote}
                disabled={customLoading || !canCustomBook}
                className={`w-full py-3.5 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 transition-all ${
                  canCustomBook ? 'bg-brand text-white hover:bg-brand-600 active:scale-[0.98]' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send size={16} />
                {customLoading ? t('transfersPg.requesting') : t('transfersPg.requestQuote')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selo de confiança */}
      <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        {TRUST.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3 px-4 py-3">
            <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0"><Icon size={19} className="text-brand" /></div>
            <div>
              <p className="text-[13px] font-bold text-gray-900 leading-tight">{title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
