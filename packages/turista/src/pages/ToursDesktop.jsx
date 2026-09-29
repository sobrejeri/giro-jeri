import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { precoDeEntrada } from '../lib/precoCartao'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'
import { useFavorites } from '../contexts/FavoritesContext'
import { somenteTransporte, capacidadeDaCombinacao } from '../lib/transporte'
import OriginPicker from '../components/OriginPicker'
import DesktopDatePicker from '../components/DesktopDatePicker'
import { duracao } from '../lib/formato'
import {
  Star, Clock, Users, Heart, Minus, Plus, Zap, Search, X,
  Check, MapPin, Car, ShieldCheck, Bus, Compass, ChevronRight,
} from 'lucide-react'

const fmtPrice = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`
const priceOf  = (v) => Number(v?.base_price || 0)

const FALLBACK_GRADIENTS = [
  'from-orange-400 via-orange-300 to-amber-200',
  'from-teal-500 via-cyan-400 to-blue-300',
  'from-amber-500 via-orange-400 to-pink-300',
  'from-emerald-500 via-teal-400 to-cyan-300',
]

const VEHICLE_FILTERS = [
  { id: 'recommended', emoji: '⭐' },
  { id: 'economico',   emoji: '💰' },
  { id: 'conforto',    emoji: '🛡️' },
]

// Sugestão de veículo ideal para N pessoas — mesma regra do celular e do
// TourDetail: menor veículo que comporta todos; senão o maior + múltiplas
// unidades. Guia/serviço adicional nunca entra (somenteTransporte).
function suggest(vehicles, people, filter = 'recommended') {
  if (!vehicles.length) return null
  const ok = somenteTransporte(vehicles)
    .filter(v => v.is_private_allowed !== false && v.is_tour_allowed !== false)
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

/* ── Card vertical estilo GetYourGuide ─────────────────────── */
function TourCard({ tour, badge, gradient, active, isFav, onToggleFav, onSelect }) {
  const { t } = useTranslation()
  const price   = Number(tour.shared_price_per_person || 0)
  const precoEntrada = precoDeEntrada(tour)
  const shared  = tour.is_shared_enabled && price > 0
  const private_ = tour.is_private_enabled

  const meta = [
    duracao(tour.duration_hours),
    private_ && shared ? t('toursPg.card.tourTypeBoth')
      : private_ ? t('toursPg.card.tourTypePrivateGroups')
      : shared ? t('toursPg.mode.shared') : null,
    tour.max_people ? t('toursPg.vehicle.upToPeople', { count: tour.max_people }) : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      onClick={() => onSelect(tour)}
      className={`group cursor-pointer bg-white rounded-2xl border shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col ${
        active ? 'border-brand ring-2 ring-brand/30 shadow-md' : 'border-gray-100'
      }`}
    >
      <div className="relative h-44 overflow-hidden">
        {tour.cover_image_url ? (
          <img
            src={tour.cover_image_url}
            alt={tour.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <Zap size={28} className="text-white/30" />
          </div>
        )}
        {badge && (
          <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm ${
            badge === t('toursPg.card.recommendedBadge') ? 'bg-white text-gray-900' : 'bg-gray-900/85 text-white'
          }`}>
            {badge}
          </span>
        )}
        {active ? (
          <span className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center shadow">
            <Check size={15} />
          </span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFav(tour.id) }}
            aria-label={t('toursPg.card.favoriteAria')}
            className="absolute top-2.5 right-2.5 w-8 h-8 bg-white/95 hover:bg-white rounded-full shadow-sm flex items-center justify-center transition-colors"
          >
            <Heart size={15} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-500'} />
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-[15px] leading-snug line-clamp-2">{tour.name}</h3>
        {meta && <p className="text-[12px] text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{meta}</p>}

        <div className="mt-auto pt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {tour.rating_average > 0 ? (
              <p className="flex items-center gap-1 text-[13px] font-semibold text-gray-800">
                {Number(tour.rating_average).toFixed(1)}
                <Star size={13} className="text-amber-400 fill-amber-400" />
                {tour.rating_count ? <span className="text-gray-400 font-normal">({tour.rating_count})</span> : null}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400">{t('toursPg.card.newBadge')}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            {precoEntrada ? (
              <>
                <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.card.fromLabel')}</p>
                <p className="text-gray-900 font-extrabold text-[17px] leading-tight">{fmtPrice(precoEntrada.valor)}</p>
                {precoEntrada.porPessoa && (
                  <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.card.perPersonSuffix')}</p>
                )}
              </>
            ) : private_ ? (
              <>
                <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.mode.private')}</p>
                <p className="text-brand font-bold text-[13px] leading-tight mt-0.5">{t('toursPg.card.viewOptions')}</p>
              </>
            ) : (
              <p className="text-gray-900 font-extrabold text-[17px]">—</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Linha de veículo no painel de detalhes (modo privativo) ── */
function VehicleRow({ vehicle, qty, onAdd, onRemove }) {
  const { t } = useTranslation()
  return (
    <div className={`bg-white p-2.5 flex items-center gap-2.5 transition-all ${qty > 0 ? 'ring-1 ring-brand/40' : ''}`}>
      <div className={`w-11 h-9 rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${vehicle.image_url ? 'bg-white' : 'bg-gray-100'}`}>
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={vehicle.name} className="w-full h-full object-contain p-0.5" />
        ) : (
          <Zap size={16} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 truncate">{vehicle.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            <Users size={10} className="text-gray-400" /> {t('tourDetailPg.capacityUpTo', { count: vehicle.seat_capacity })}
          </span>
          {vehicle.base_price ? (
            <span className="text-[11px] text-gray-500">
              R$ {Number(vehicle.base_price).toLocaleString('pt-BR')}<span className="text-gray-400"> {t('tourDetailPg.perVehicle')}</span>
            </span>
          ) : null}
        </div>
      </div>
      {qty === 0 ? (
        <button
          onClick={onAdd}
          aria-label={t('a11y.addVehicle')}
          className="w-7 h-7 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform shrink-0"
        >
          <Plus size={12} className="text-white" />
        </button>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRemove}
            aria-label={t('a11y.removeVehicle')}
            className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform"
          >
            <Minus size={10} className="text-gray-600" />
          </button>
          <span className="text-[13px] font-bold text-gray-900 w-4 text-center">{qty}</span>
          <button
            onClick={onAdd}
            aria-label={t('a11y.addVehicle')}
            className="w-6 h-6 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform"
          >
            <Plus size={10} className="text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function ToursDesktop() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const { region, userCoords, getServiceQuery } = useRegion()
  const { token } = useAuth()
  const { upsertItem: saveCartItem, items: savedCartItems } = useCart()
  const { favs, toggleFav } = useFavorites()

  const [category, setCategory] = useState('')
  const [people, setPeople]     = useState(() => Number(navState?.people) >= 1 ? Number(navState.people) : 2)
  const [date, setDate]         = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(navState?.date || '') ? navState.date : '')
  const [searchTerm, setSearchTerm] = useState('')

  // Passeio escolhido → configurador aparece à direita (não abre mais a página
  // de detalhe: serviço de um lado, detalhes do outro, antes do carrinho).
  const [selectedId, setSelectedId] = useState(navState?.selectedId || null)
  const [mode, setMode]     = useState('shared')     // 'shared' | 'private'
  const [filter, setFilter] = useState('recommended')// filtro da sugestão de veículo
  const [cart, setCart]     = useState({})           // { [vehicleId]: qty }
  const [origin, setOrigin] = useState(null)         // { name, latitude, longitude }
  const [showOriginPicker, setShowOriginPicker] = useState(false)

  const geo = getServiceQuery()
  const { data, isLoading } = useQuery({
    queryKey: ['tours', 'desktop', region?.id, geo?.lat, geo?.lon],
    queryFn:  () => api.getTours({ ...geo }),
  })
  const tours = Array.isArray(data?.tours) ? data.tours
              : Array.isArray(data)        ? data
              : []

  // Alta temporada: datas exatas em laranja no calendário.
  const { data: seasonsData } = useQuery({
    queryKey: ['seasons', region?.id],
    queryFn:  () => api.getSeasons(region?.id ? { region_id: region.id } : {}),
    staleTime: 10 * 60 * 1000,
    retry: 3,
  })
  const seasons = Array.isArray(seasonsData) ? seasonsData : []

  const cats = useMemo(() => {
    const m = new Map()
    tours.forEach((tr) => { if (tr.categories) m.set(tr.categories.id, tr.categories.name) })
    return [...m.entries()]
  }, [tours])

  const byCategory = category ? tours.filter((tr) => tr.categories?.id === category) : tours
  const list = searchTerm.trim()
    ? byCategory.filter((tr) => tr.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : byCategory

  // Categoria "carrossel próprio" (categories.is_exclusive) ganha seção separada.
  const secoesDeCategoria = useMemo(() => {
    const porId = new Map()
    for (const x of list) {
      if (!x.categories?.is_exclusive) continue
      const id = x.categories.id || x.category_id || x.categories.name
      if (!id) continue
      if (!porId.has(id)) {
        porId.set(id, { id, nome: x.categories.name || '', ordem: Number(x.categories.sort_order) || 0, passeios: [] })
      }
      porId.get(id).passeios.push(x)
    }
    return [...porId.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
  }, [list])
  const idsEmCategoria = useMemo(
    () => new Set(secoesDeCategoria.flatMap((c) => c.passeios.map((p) => p.id))),
    [secoesDeCategoria],
  )
  const tradList = list.filter((tr) => !idsEmCategoria.has(tr.id))

  // R6: cutoff de solicitação (padrão 12:00, America/Fortaleza) — passou do
  // horário, a data mínima passa a ser amanhã (o backend valida no mesmo fuso).
  const cutoffMinIso = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    const d = new Date()
    if (h * 60 + m >= 12 * 60) d.setDate(d.getDate() + 1)
    return d.toLocaleDateString('en-CA')
  }, [])
  useEffect(() => {
    if (date && date < cutoffMinIso) setDate(cutoffMinIso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoffMinIso])

  const selectedTour = useMemo(() => tours.find((tr) => tr.id === selectedId) || null, [tours, selectedId])

  // Modo inicial ao escolher um passeio: se só aceita um, usa esse; com os dois,
  // começa no compartilhado (mostra preço na hora) — igual ao TourDetail.
  useEffect(() => {
    if (!selectedTour) return
    if (!selectedTour.is_shared_enabled && selectedTour.is_private_enabled) setMode('private')
    else if (selectedTour.is_shared_enabled && !selectedTour.is_private_enabled) setMode('shared')
    else setMode('shared')
  }, [selectedTour])

  // Troca de modo zera a combinação de veículos.
  useEffect(() => { setCart({}) }, [mode, selectedId])

  // Veículos do passeio (só no privativo) — matriz do Motor de Preços, sem
  // fallback para o catálogo inteiro (mesma regra do celular / TourDetail).
  const { data: vehiclesData, isFetched: vehiclesLoaded } = useQuery({
    queryKey: ['tour-vehicles', selectedId, region?.id],
    queryFn:  () => api.getTourVehicles(selectedId, region?.id),
    enabled:  !!selectedId && mode === 'private',
    staleTime: 5 * 60 * 1000,
  })
  const vehicles = useMemo(() => somenteTransporte(vehiclesData || []), [vehiclesData])

  const suggestion = useMemo(() => suggest(vehicles, people, filter), [vehicles, people, filter])
  const sortedVehicles = useMemo(() => {
    const arr = vehicles.slice()
    if (filter === 'economico') return arr.sort((a, b) => priceOf(a) - priceOf(b))
    if (filter === 'conforto')  return arr.sort((a, b) => b.seat_capacity - a.seat_capacity)
    return arr
  }, [vehicles, filter])

  const cartItems = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([vid, qty]) => ({ vehicle: vehicles.find((x) => x.id === vid), qty }))
    .filter((x) => x.vehicle)
  const cartTotal    = cartItems.reduce((s, { vehicle, qty }) => s + (vehicle.base_price ? Number(vehicle.base_price) * qty : 0), 0)
  const cartCapacity = capacidadeDaCombinacao(cartItems)
  const cartHasItems = cartItems.length > 0

  const sharedPrice = selectedTour?.shared_price_per_person ? Number(selectedTour.shared_price_per_person) : null
  const sharedTotal = sharedPrice ? sharedPrice * people : 0

  const canAddShared  = mode === 'shared'  && sharedPrice > 0
  const canAddPrivate = mode === 'private' && cartHasItems && cartCapacity >= people
  const canAdd = canAddShared || canAddPrivate

  const grandTotal = mode === 'shared' ? sharedTotal : cartTotal

  function selectTour(tour) {
    setSelectedId(tour.id)
    setCart({})
    // Rola o topo do painel à vista em telas menores (o sticky cuida do resto).
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Selo estilo GYG: o 1º da lista é "Mais recomendado"; demais usam a 1ª tag.
  function badgeFor(tour, idx) {
    if (idx === 0 && !category) return t('toursPg.card.recommendedBadge')
    if (Array.isArray(tour.tags) && tour.tags.length) return tour.tags[0]
    return null
  }

  function handleAddToCart() {
    if (!token) { navigate('/login', { state: { from: '/passeios' } }); return }
    if (!selectedTour || !canAdd) return
    // Mesma jornada do celular: entra no carrinho universal e o horário / local
    // de saída (se ainda faltarem) são cobrados lá antes de "Solicitar tudo".
    const existing = savedCartItems.find((i) => i.id === selectedTour.id)
    saveCartItem({
      id:      selectedTour.id,
      kind:    'tour',
      name:    selectedTour.name,
      mode,
      allows_private: selectedTour.is_private_enabled !== false,
      allows_shared:  !!selectedTour.is_shared_enabled,
      shared_price_per_person: selectedTour.shared_price_per_person != null
        ? Number(selectedTour.shared_price_per_person) : null,
      cover_image_url: selectedTour.cover_image_url || null,
      booking_cutoff_time:  selectedTour.booking_cutoff_time || null,
      min_advance_hours:    selectedTour.min_advance_hours ?? null,
      service_window_start: selectedTour.service_window_start || null,
      service_window_end:   selectedTour.service_window_end   || null,
      dateIso: date || cutoffMinIso,
      time:    existing?.time || '',
      people,
      region_id:   selectedTour.region_id || selectedTour.regions?.id || region?.id || null,
      origin_text: origin?.name || existing?.origin_text || '',
      vehicles: mode === 'shared' ? [] : cartItems.map(({ vehicle, qty }) => ({
        id: vehicle.id, name: vehicle.name, qty,
        price: Number(vehicle.base_price) || 0, cap: vehicle.seat_capacity || null,
      })),
      total: grandTotal,
    })
    navigate('/carrinho')
  }

  return (
    <div className="max-w-[1520px] mx-auto px-10 xl:px-16 py-8">
      {/* ── Cabeçalho ─────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-1.5">
        <span>{t('toursPg.breadcrumbHome')}</span>
        <ChevronRight size={13} className="text-gray-300" />
        <span className="text-gray-500 font-medium">{t('toursPg.breadcrumbTours')}</span>
      </nav>
      <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight">
        {t('toursPg.page.title', { region: region?.name || 'Jericoacoara' })}
      </h1>
      <p className="text-[13px] text-gray-500 mt-1">{t('toursPg.page.subtitle')}</p>

      {/* ── Duas colunas: lista à esquerda, detalhes à direita ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px] gap-6 mt-6 items-start">
        {/* ── ESQUERDA: escolha seu passeio ── */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t('toursPg.chooseTour')}</h2>
              <p className="text-[13px] text-gray-500 mt-0.5">{t('toursPg.chooseTourSub')}</p>
            </div>
          </div>

          {/* Busca */}
          <div className="relative mt-4">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('toursPg.searchPlaceholder')}
              className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-800 placeholder-gray-400 outline-none focus:border-brand focus:bg-white transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                aria-label={t('toursPg.page.clearSearchAria')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X size={14} className="text-gray-400" />
              </button>
            )}
          </div>

          {/* Chips de categoria */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setCategory('')}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                !category ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {t('toursPg.page.allCategories')}
            </button>
            {cats.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setCategory(category === id ? '' : id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
                  category === id ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Contagem */}
          {!isLoading && (
            <p className="text-[13px] text-gray-500 mt-4 mb-3">
              <span className="font-bold text-gray-900">{list.length}</span>{' '}
              {list.length === 1 ? t('toursPg.page.result') : t('toursPg.page.results')} · {region?.name || 'Jericoacoara'}
            </p>
          )}

          {/* Grade de cards */}
          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <p className="text-gray-400 py-16 text-center border border-dashed border-gray-200 rounded-2xl mt-2">
              {searchTerm.trim()
                ? t('toursPg.page.noResultsSearch', { term: searchTerm.trim() })
                : t('toursPg.page.noResultsRegion')}
            </p>
          ) : (
            <>
              {tradList.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {tradList.map((tr, i) => (
                    <TourCard
                      key={tr.id}
                      tour={tr}
                      badge={badgeFor(tr, i)}
                      gradient={FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length]}
                      active={selectedId === tr.id}
                      isFav={favs.has(tr.id)}
                      onToggleFav={toggleFav}
                      onSelect={selectTour}
                    />
                  ))}
                </div>
              )}

              {secoesDeCategoria.map((cat) => (
                <div key={cat.id}>
                  <div className="mt-8 mb-3">
                    <h3 className="text-[17px] font-extrabold text-gray-900">{cat.nome}</h3>
                    <p className="text-[13px] text-gray-500 mt-0.5">{t('toursPg.categorySection.subtitle')}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {cat.passeios.map((tour, i) => (
                      <TourCard
                        key={tour.id}
                        tour={tour}
                        gradient={FALLBACK_GRADIENTS[(i + 1) % FALLBACK_GRADIENTS.length]}
                        active={selectedId === tour.id}
                        isFav={favs.has(tour.id)}
                        onToggleFav={toggleFav}
                        onSelect={selectTour}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>

        {/* ── DIREITA: detalhes do passeio (sticky) ── */}
        <aside className="lg:sticky lg:top-20">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[18px] font-bold text-gray-900">{t('toursPg.tourDetails')}</p>
            <p className="text-[13px] text-gray-500 mb-4">{t('toursPg.tourDetailsSub')}</p>

            {!selectedTour ? (
              /* Estado vazio */
              <div className="py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-3">
                  <Compass size={26} className="text-brand" />
                </div>
                <p className="text-[13px] text-gray-500 max-w-[240px] mx-auto leading-relaxed">
                  {t('toursPg.selectTourPrompt')}
                </p>
              </div>
            ) : (
              <>
                {/* Passeio escolhido */}
                <div className="flex items-center gap-3">
                  <div className="w-16 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                    {selectedTour.cover_image_url ? (
                      <img src={selectedTour.cover_image_url} alt={selectedTour.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-orange-400 to-amber-300 flex items-center justify-center">
                        <Zap size={18} className="text-white/40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-2">{selectedTour.name}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                      {selectedTour.duration_hours && (
                        <span className="flex items-center gap-1 text-[12px] text-gray-500"><Clock size={12} className="text-brand" /> {duracao(selectedTour.duration_hours)}</span>
                      )}
                      {selectedTour.categories?.name && (
                        <span className="text-[12px] text-gray-400">{selectedTour.categories.name}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modo: compartilhado x privativo */}
                {selectedTour.is_shared_enabled && selectedTour.is_private_enabled ? (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => setMode('shared')}
                      className={`h-10 rounded-xl text-[13px] font-bold transition-colors ${mode === 'shared' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {t('tourDetailPg.shared')}
                    </button>
                    <button
                      onClick={() => setMode('private')}
                      className={`h-10 rounded-xl text-[13px] font-bold transition-colors ${mode === 'private' ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {t('tourDetailPg.private')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 bg-orange-50 text-brand text-[12px] font-semibold px-3 py-2 rounded-lg text-center">
                    {selectedTour.is_shared_enabled ? t('tourDetailPg.sharedOnly') : t('tourDetailPg.privateOnly')}
                  </div>
                )}

                {/* Data | Pessoas */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('toursPg.dateLabel')}</label>
                    <div className="mt-1 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                      <DesktopDatePicker valueIso={date || cutoffMinIso} onChange={setDate} minIso={cutoffMinIso} seasons={seasons} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('tourDetailPg.peopleLabel')}</label>
                    <div className="mt-1 flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
                      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-gray-800"><Users size={14} className="text-gray-400" /> {people}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setPeople((p) => Math.max(1, p - 1))} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Minus size={12} className="text-gray-600" /></button>
                        <button onClick={() => setPeople((p) => p + 1)} className="w-7 h-7 rounded-full bg-brand flex items-center justify-center"><Plus size={12} className="text-white" /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Local de saída */}
                <div className="mt-3">
                  <label className="text-[11px] text-gray-400 font-semibold">{t('tourDetailPg.originLabel')}</label>
                  <button
                    onClick={() => setShowOriginPicker(true)}
                    className={`mt-1 w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-colors text-left ${
                      origin ? 'bg-white border-gray-200 hover:border-gray-300' : 'bg-brand/5 border-brand border-dashed'
                    }`}
                  >
                    <MapPin size={15} className="text-brand shrink-0" />
                    <span className={`text-[13px] font-semibold truncate ${origin ? 'text-gray-700' : 'text-brand'}`}>
                      {origin?.name || t('tourDetailPg.selectLocation')}
                    </span>
                  </button>
                </div>

                {/* ── COMPARTILHADO ── */}
                {mode === 'shared' && (
                  <div className="mt-4">
                    {sharedPrice ? (
                      <>
                        <div className="bg-brand rounded-xl p-4">
                          <p className="text-white/70 text-[12px] font-medium">{t('tourDetailPg.pricePerPerson')}</p>
                          <p className="text-white text-[26px] font-extrabold leading-tight mt-0.5">R$ {sharedPrice.toLocaleString('pt-BR')}</p>
                          <div className="flex items-center justify-between mt-3 bg-white/15 rounded-lg px-3 py-2">
                            <span className="text-white/80 text-[13px]">{people}× {t('tourDetailPg.pricePerPerson').toLowerCase()}</span>
                            <span className="text-white font-bold text-[15px]">R$ {sharedTotal.toLocaleString('pt-BR')}</span>
                          </div>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 mt-3">
                          <div className="flex items-start gap-2">
                            <Bus size={13} className="text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-blue-700 leading-relaxed">{t('tourDetailPg.sharedInfo')}</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-4 text-center">
                        <p className="text-[13px] text-gray-400">{t('tourDetailPg.sharedUnavailable')}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── PRIVATIVO ── */}
                {mode === 'private' && (
                  <div className="mt-4">
                    {suggestion && (
                      <div className="mb-3">
                        <p className="text-[12px] font-bold text-gray-500 uppercase tracking-wide mb-2">{t('toursPg.chooseVehicle')}</p>
                        <div className="flex gap-1.5 mb-2">
                          {VEHICLE_FILTERS.map(({ id: fid, emoji }) => (
                            <button
                              key={fid}
                              onClick={() => setFilter(fid)}
                              className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                                filter === fid ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              {emoji} {t(`tourDetailPg.filter.${fid}`)}
                            </button>
                          ))}
                        </div>
                        <div className="bg-white rounded-xl p-2.5 border border-gray-100 flex items-center gap-2.5">
                          <div className={`w-11 h-9 rounded-lg flex items-center justify-center overflow-hidden shrink-0 ${suggestion.vehicle.image_url ? 'bg-white' : 'bg-gray-100'}`}>
                            {suggestion.vehicle.image_url ? (
                              <img src={suggestion.vehicle.image_url} alt={suggestion.vehicle.name} className="w-full h-full object-contain p-0.5" />
                            ) : (
                              <Zap size={16} className="text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold text-gray-900 truncate">
                              {suggestion.qty > 1 ? `${suggestion.qty}x ` : ''}{suggestion.vehicle.name}
                            </p>
                            <span className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5">
                              <Users size={9} className="text-gray-400" /> {t('tourDetailPg.capacityUpTo', { count: suggestion.vehicle.seat_capacity * suggestion.qty })}
                            </span>
                          </div>
                          <button
                            onClick={() => setCart({ [suggestion.vehicle.id]: suggestion.qty })}
                            className="bg-brand text-white text-[10px] font-bold px-2.5 py-1 rounded-full active:scale-95 transition-transform shrink-0"
                          >
                            {t('tourDetailPg.apply')}
                          </button>
                        </div>
                      </div>
                    )}

                    {vehiclesLoaded && sortedVehicles.length === 0 && (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-4 text-center">
                        <p className="text-[12px] text-gray-500">{t('tourDetailPg.noVehicles')}</p>
                      </div>
                    )}

                    {sortedVehicles.length > 0 && (
                      <div>
                        <p className="text-[13px] font-semibold text-gray-700">{t('tourDetailPg.vehicleCatalog')}</p>
                        <p className="text-[11px] text-brand mt-0.5 mb-2">{t('tourDetailPg.buildCombo')}</p>
                        <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
                          {sortedVehicles.map((v) => (
                            <VehicleRow
                              key={v.id}
                              vehicle={v}
                              qty={cart[v.id] || 0}
                              onAdd={() => setCart((c) => ({ ...c, [v.id]: (c[v.id] || 0) + 1 }))}
                              onRemove={() => setCart((c) => ({ ...c, [v.id]: Math.max(0, (c[v.id] || 1) - 1) }))}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {cartHasItems && (
                      <div className={`rounded-xl p-3 border mt-3 ${cartCapacity >= people ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-[12px] font-bold text-gray-700 mb-1">
                          {cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ')}
                        </p>
                        <div className="flex items-center gap-1">
                          <Users size={11} className={cartCapacity >= people ? 'text-green-600' : 'text-red-500'} />
                          <span className={`text-[11px] font-medium ${cartCapacity >= people ? 'text-green-600' : 'text-red-500'}`}>
                            {t('tourDetailPg.paxCount', { capacity: cartCapacity, people })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Total */}
                <div className="border-t border-gray-100 mt-4 pt-3 flex items-end justify-between">
                  <p className="text-[14px] font-bold text-gray-900">{t('toursPg.estimatedTotal')}</p>
                  <p className={`text-[24px] font-extrabold ${canAdd ? 'text-brand' : 'text-gray-400'}`}>
                    R$ {(grandTotal || 0).toLocaleString('pt-BR')}
                  </p>
                </div>

                {/* Adicionar ao carrinho */}
                <button
                  onClick={handleAddToCart}
                  disabled={!canAdd}
                  className={`mt-4 w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all ${
                    canAdd ? 'bg-brand text-white hover:bg-brand-600 active:scale-[0.98] shadow-md shadow-brand/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {mode === 'private' && !cartHasItems ? t('tourDetailPg.selectVehicles')
                    : mode === 'private' && cartCapacity < people ? t('tourDetailPg.insufficientCapacity')
                    : <>{t('toursPg.actions.addToCart')} →</>}
                </button>

                <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[12px] text-gray-400">
                  <ShieldCheck size={14} className="text-emerald-500 shrink-0" /> {t('toursPg.payAfterAccept')}
                </p>

                <div className="border-t border-gray-50 mt-3 pt-3 flex items-center justify-center gap-5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1"><Users size={12} /> {t('toursPg.localOperators')}</span>
                  <span className="flex items-center gap-1"><Car size={12} /> {t('toursPg.appSupport')}</span>
                </div>
              </>
            )}
          </div>
        </aside>
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
