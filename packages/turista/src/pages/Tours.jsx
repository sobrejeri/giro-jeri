import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useFavorites } from '../contexts/FavoritesContext'
import { useCart } from '../contexts/CartContext'
import { highSeasonMonthSet, isHighSeasonIso } from '../lib/season'
import OriginPicker from '../components/OriginPicker'
import ToursDesktop from './ToursDesktop'
import {
  MapPin, Calendar, Users,
  Star, Clock, Heart, Zap, Plus, Minus, Check,
  ChevronLeft, ChevronRight, X, Info, Bus, Search,
  Flame, Sparkles, ShoppingCart, ChevronDown,
  ShieldCheck, MessageCircle, Lock, User as UserIcon,
} from 'lucide-react'
import SegmentedControl from '../components/tours/SegmentedControl'
import FilterChip from '../components/tours/FilterChip'
import SectionHeader from '../components/tours/SectionHeader'
import TourCard from '../components/tours/TourCard'
import PromoBanner from '../components/tours/PromoBanner'
import BenefitsStrip from '../components/tours/BenefitsStrip'
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

  // recommended: menor veículo que comporta todos; senão o maior + múltiplas unidades
  const single = fits.slice().sort((a, b) => a.seat_capacity - b.seat_capacity)[0]
  if (single) return { vehicle: single, qty: 1 }
  const biggest = ok.slice().sort((a, b) => b.seat_capacity - a.seat_capacity)[0]
  if (!biggest) return null
  return { vehicle: biggest, qty: Math.ceil(people / biggest.seat_capacity) }
}

/* ── Card de veículo no catálogo ────────────────────────────── */
function VehicleCard({ vehicle, qty, onAdd, onRemove }) {
  const { t } = useTranslation()
  return (
    <div className={`bg-white rounded-[18px] p-3 flex items-center gap-3 transition-all duration-200 ${
      qty > 0
        ? 'ring-2 ring-brand shadow-[0_4px_20px_rgba(255,101,0,0.15)]'
        : 'shadow-[0_4px_20px_rgba(0,0,0,0.06)]'
    }`}>
      <div className={`w-16 h-14 rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${vehicle.image_url ? 'bg-white' : 'bg-gray-100'}`}>
        {vehicle.image_url ? (
          <img src={vehicle.image_url} alt={vehicle.name} className="w-full h-full object-contain p-0.5" />
        ) : (
          <Zap size={20} className="text-gray-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 truncate">{vehicle.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Users size={10} className="text-gray-400" />
          <span className="text-[11px] text-gray-500">{t('toursPg.vehicle.upToPeople', { count: vehicle.seat_capacity })}</span>
        </div>
        {vehicle.base_price && (
          <p className="text-[11px] text-gray-500 mt-0.5">
            R$ {Number(vehicle.base_price).toLocaleString('pt-BR')}
            <span className="text-gray-400"> {t('toursPg.vehicle.perVehicle')}</span>
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
function DatePickerSheet({ value, onChange, onClose, minDate, seasons, highSeasonMonths }) {
  const { t } = useTranslation()
  // R6: 'today' aqui é a data mínima selecionável — se passou do cutoff do
  // passeio, minDate já vem como amanhã e o dia de hoje fica bloqueado.
  const today = minDate || startOfDay(new Date())
  const [viewMonth, setViewMonth] = useState(startOfMonth(value))
  const WEEKDAYS = [
    t('toursPg.calendar.weekdaySun'),
    t('toursPg.calendar.weekdayMon'),
    t('toursPg.calendar.weekdayTue'),
    t('toursPg.calendar.weekdayWed'),
    t('toursPg.calendar.weekdayThu'),
    t('toursPg.calendar.weekdayFri'),
    t('toursPg.calendar.weekdaySat'),
  ]

  const days = eachDayOfInterval({
    start: startOfMonth(viewMonth),
    end:   endOfMonth(viewMonth),
  })
  const offset = getDay(startOfMonth(viewMonth))
  const canGoPrev = !isBefore(subMonths(viewMonth, 1), startOfMonth(today))

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">{t('toursPg.calendar.chooseDate')}</p>
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
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-4 gap-y-0.5 mb-4">
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {days.map((day) => {
            const past     = isBefore(day, today)
            const selected = isSameDay(day, value)
            const todayDay = isToday(day)
            const highSeason = seasons?.length
              ? isHighSeasonIso(format(day, 'yyyy-MM-dd'), seasons)
              : !!highSeasonMonths?.has(day.getMonth() + 1)
            return (
              <button
                key={day.toISOString()}
                disabled={past}
                onClick={() => { onChange(day); onClose() }}
                className={`relative aspect-square flex items-center justify-center rounded-full text-[13px] transition-all
                  ${selected  ? 'bg-brand text-white font-bold' : ''}
                  ${!selected && past ? 'text-gray-300 cursor-not-allowed' : ''}
                  ${!selected && !past && highSeason ? 'text-amber-600 font-bold' : ''}
                  ${!selected && !past && !highSeason && todayDay ? 'text-brand font-bold' : ''}
                  ${!selected && !past && !highSeason && !todayDay ? 'text-gray-800 active:bg-gray-100 font-medium' : ''}
                `}
              >
                {format(day, 'd')}
                {!selected && !past && highSeason && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-amber-500" />
                )}
              </button>
            )
          })}
        </div>

        {(seasons?.length > 0 || highSeasonMonths?.size > 0) && (
          <div className="flex items-center gap-2 px-5 pb-2 text-[11px] text-amber-600">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            {t('toursPg.calendar.highSeasonNote')}
          </div>
        )}

        <div className="px-4 pb-8">
          <button
            onClick={onClose}
            className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            {t('toursPg.calendar.confirm')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Tours() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { state: locationState } = useLocation()
  const { region, userCoords, getServiceQuery } = useRegion()

  const { items: savedCartItems, upsertItem: saveCartItem, count: cartCount } = useCart()

  // "Retomar" do carrinho flutuante: restaura o rascunho salvo (data/pessoas/
  // veículos) do passeio escolhido. Os dados vivem no localStorage (CartContext).
  const restoredItem = locationState?.restoreFromCart
    ? savedCartItems.find((i) => i.id === locationState?.selectedId)
    : null

  const [mode, setMode] = useState(locationState?.mode || 'private')
  const [selectedId, setSelectedId] = useState(locationState?.selectedId || null)
  const [people, setPeople] = useState(restoredItem?.people || 2)
  const [date, setDate] = useState(() => {
    // dateIso pode vir do rascunho do carrinho OU dos atalhos da home
    // ("Passeio hoje" / "Passeio amanhã") — sem honrar isso, o atalho abriria a
    // lista na data de hoje e o cliente teria de escolher de novo.
    const iso = restoredItem?.dateIso || locationState?.dateIso
    if (iso) {
      const d = new Date(`${iso}T12:00:00`)
      if (!Number.isNaN(d.getTime()) && !isBefore(d, startOfDay(new Date()))) return startOfDay(d)
    }
    return startOfDay(new Date())
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [filter, setFilter] = useState('recommended')
  // Pastilha ativa da lista. Já nasce alinhada ao atalho que trouxe o cliente
  // da home ("Mais vendidos", "Pôr do sol"), senão ele chegaria numa lista
  // filtrada sem nenhuma pastilha marcada e sem saber como voltar a "Todos".
  const [chip, setChip] = useState(() => {
    if (locationState?.featured) return '__featured'
    if (locationState?.tag) return `tag:${String(locationState.tag).toLowerCase()}`
    return '__all'
  })
  const [cart, setCart] = useState(() => {
    if (!restoredItem?.vehicles?.length) return {}
    const c = {}
    for (const v of restoredItem.vehicles) c[v.id] = v.qty
    return c
  })
  const { favs, toggleFav } = useFavorites()
  const [origin, setOrigin] = useState(null) // { name, latitude, longitude }
  const [showOriginPicker, setShowOriginPicker] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  /* ── Queries ──────────────────────────────────────────────── */
  const geo = getServiceQuery()
  const { data: toursData, isLoading: toursLoading } = useQuery({
    queryKey: ['tours', region?.id],
    queryFn: () => api.getTours(geo),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })
  // Alta temporada: meses com acréscimo, p/ sinalizar no calendário.
  const { data: seasonsData } = useQuery({
    queryKey: ['seasons', region?.id],
    queryFn:  () => api.getSeasons(region?.id ? { region_id: region.id } : {}),
    staleTime: 10 * 60 * 1000,
    retry: 3,               // API pode estar “acordando” (Render) — não desistir na 1ª
    refetchOnWindowFocus: true,
  })
  const highSeasonMonths = useMemo(() => highSeasonMonthSet(seasonsData || []), [seasonsData])

  // Imagem do banner: a mesma que o admin já configura para a home. Sem ela o
  // banner usa a capa de um passeio real (ver abaixo) — nada é fixo no código.
  const { data: settings } = useQuery({
    queryKey: ['public-settings'],
    queryFn:  () => api.getPublicSettings(),
    staleTime: 5 * 60 * 1000,
  })

  const allTours = toursData?.tours || toursData || []

  /* ── Pastilhas de filtro ───────────────────────────────────────────────
     Montadas a partir das etiquetas que os passeios REALMENTE têm, nunca de
     uma lista fixa: pastilha fixa vira botão morto assim que o admin renomeia
     ou aposenta uma etiqueta. "Mais vendidos" e "Exclusivos" só entram se
     houver passeio marcado como tal. */
  const chips = useMemo(() => {
    const out = [{ id: '__all', label: t('toursPg.chips.all') }]
    if (allTours.some((x) => x.is_featured)) {
      out.push({ id: '__featured', icon: Flame, label: t('toursPg.chips.bestSellers') })
    }
    const vistas = new Map()
    for (const x of allTours) {
      for (const tg of (Array.isArray(x.tags) ? x.tags : [])) {
        const rotulo = String(tg || '').trim()
        if (rotulo && !vistas.has(rotulo.toLowerCase())) vistas.set(rotulo.toLowerCase(), rotulo)
      }
    }
    for (const [chave, rotulo] of vistas) out.push({ id: `tag:${chave}`, label: rotulo })
    if (allTours.some((x) => x.is_exclusive)) {
      out.push({ id: '__exclusive', icon: Sparkles, label: t('toursPg.chips.exclusive') })
    }
    return out
  }, [allTours, t])

  // Casa na etiqueta OU no nome/descrição, porque nem todo passeio tem tag.
  const casaTag = (tour, alvo) => {
    const tags = Array.isArray(tour.tags) ? tour.tags.map((x) => String(x).toLowerCase()) : []
    return tags.some((x) => x.includes(alvo))
      || String(tour.name || '').toLowerCase().includes(alvo)
      || String(tour.short_description || '').toLowerCase().includes(alvo)
  }

  const base = useMemo(() => {
    if (chip === '__all') return allTours
    const filtra = (fn) => {
      const r = allTours.filter(fn)
      // Nunca deixa a tela vazia por causa de um atalho: as pastilhas nascem do
      // próprio dado e sempre casam, mas a etiqueta pode chegar pela navegação
      // (atalhos da home) e não corresponder a nada.
      return r.length > 0 ? r : allTours
    }
    if (chip === '__featured')  return filtra((x) => x.is_featured)
    if (chip === '__exclusive') return filtra((x) => x.is_exclusive)
    const alvo = chip.slice(4)
    return filtra((x) => casaTag(x, alvo))
  }, [allTours, chip])

  const tours = searchTerm.trim()
    ? base.filter((x) => x.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : base
  // Tradicionais entram no carrinho/combo (fluxo desta tela); exclusivos são
  // venda direta (carrossel próprio → tela de detalhes, sem carrinho).
  const tradTours      = tours.filter((t) => !t.is_exclusive)
  const exclusiveTours = tours.filter((t) => t.is_exclusive)
  // Nada vem pré-selecionado: o cliente escolhe um passeio (tradicional OU
  // exclusivo) e só então os veículos aparecem. Clicar no selecionado desmarca.
  const selectedTour = [...tradTours, ...exclusiveTours].find((t) => t.id === selectedId) || null

  // Nem todo passeio aceita os dois modos — o voo panorâmico, por exemplo, só
  // existe COMPARTILHADO. A tela abria sempre em "Privativo" e o toggle não
  // consultava as flags do passeio, então dava para comprar como privativo um
  // serviço que só é vendido por pessoa (valor e modo errados na reserva).
  // Ao abrir um passeio, alinha o modo ao que ele realmente aceita.
  useEffect(() => {
    if (!selectedTour) return
    const canPrivate = selectedTour.is_private_enabled !== false
    const canShared  = !!selectedTour.is_shared_enabled
    if (mode === 'private' && !canPrivate && canShared) setMode('shared')
    else if (mode === 'shared' && !canShared && canPrivate) setMode('private')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTour?.id])
  const vehiclesRef = useRef(null)

  // Ao selecionar um passeio, rola até os veículos (eles aparecem entre os
  // carrosseis — sem isto, um clique no carrossel exclusivo lá embaixo faz os
  // veículos surgirem fora da tela e parece que nada aconteceu).
  useEffect(() => {
    if (selectedId && vehiclesRef.current) {
      vehiclesRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedId])

  // R6: horário limite de solicitação — se já passou do cutoff do passeio,
  // a data mínima selecionável passa a ser amanhã (bloqueia "hoje").
  // O backend valida em America/Fortaleza (UTC-3); o cliente precisa usar o
  // mesmo relógio, senão um turista em outro fuso vê "hoje" disponível e leva
  // 400 no checkout.
  const cutoffMinDate = useMemo(() => {
    // Padrão: meio-dia. Passou de 12h (Fortaleza) → só a partir de amanhã.
    // Se o passeio definir um booking_cutoff_time próprio, ele tem prioridade.
    const c = selectedTour?.booking_cutoff_time || '12:00'
    const todayStart = startOfDay(new Date())
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    const nowMin    = h * 60 + m
    const cutoffMin = Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5))
    let minDate = nowMin >= cutoffMin ? addDays(todayStart, 1) : todayStart

    // Antecedência mínima por serviço (admin): se definida, a data mínima não
    // pode cair dentro da janela de antecedência (agora + N horas, Fortaleza).
    const adv = Number(selectedTour?.min_advance_hours)
    if (Number.isFinite(adv) && adv > 0) {
      const advStart = startOfDay(new Date(Date.now() + adv * 3600_000))
      if (isBefore(minDate, advStart)) minDate = advStart
    }
    return minDate
  }, [selectedTour?.booking_cutoff_time, selectedTour?.min_advance_hours])

  // Se a data selecionada ficou antes do mínimo (ex.: hoje após o cutoff),
  // empurra para a data mínima válida — evita levar "hoje" inválido ao checkout.
  useEffect(() => {
    if (isBefore(date, cutoffMinDate)) setDate(cutoffMinDate)
  }, [cutoffMinDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: vehiclesData, isFetched: vehiclesFetched } = useQuery({
    queryKey: ['tour-vehicles', selectedTour?.id],
    queryFn: () => api.getTourVehicles(selectedTour.id),
    enabled: !!selectedTour?.id && mode === 'private',
    staleTime: 30 * 1000,
  })

  // SEM fallback de "todos os veículos": o app mostra exatamente os veículos
  // ligados para o passeio no Motor de Preços. Se o passeio não tiver nenhum,
  // a lista fica vazia (com aviso) — o admin controla isso.
  const vehicles = useMemo(() => vehiclesData || [], [vehiclesData])

  /* ── Sugestão ─────────────────────────────────────────────── */
  const suggestion = useMemo(() => suggest(vehicles, people, filter), [vehicles, people, filter])

  const sortedVehicles = useMemo(() => {
    const arr = vehicles.slice()
    if (filter === 'economico') return arr.sort((a, b) => priceOf(a) - priceOf(b))
    if (filter === 'conforto')  return arr.sort((a, b) => b.seat_capacity - a.seat_capacity)
    return arr
  }, [vehicles, filter])

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

  // Monta o rascunho do carrinho a partir da PRÉ-SELEÇÃO atual (passeio +
  // veículos + pessoas). NÃO é auto-salvo: só vai pro carrinho quando o cliente
  // clica em "Continuar". Data/hora/saída são refinadas depois, no carrinho.
  const buildCartDraft = () => {
    const existing = savedCartItems.find((i) => i.id === selectedTour.id)
    return {
      id:      selectedTour.id,
      kind:    'tour',
      mode:    'private',
      name:    selectedTour.name,
      cover_image_url: selectedTour.cover_image_url || null,
      booking_cutoff_time: selectedTour.booking_cutoff_time || null,
      min_advance_hours: selectedTour.min_advance_hours ?? null,
      dateIso: format(date, 'yyyy-MM-dd'),
      time:    existing?.time || null,
      people,
      region_id:   selectedTour.regions?.id || null,
      origin_text: origin?.name || existing?.origin_text || null,
      vehicles: cartItems.map(({ vehicle, qty }) => ({
        id: vehicle.id, name: vehicle.name, qty,
        price: Number(vehicle.base_price) || 0, cap: vehicle.seat_capacity || null,
      })),
      total: cartTotal,
    }
  }

  // Passeio EXCLUSIVO (privativo): venda direta — vai direto ao Resumo da
  // reserva com os veículos escolhidos, sem passar pelo carrinho.
  const continueExclusivePrivate = () => {
    navigate('/checkout/resumo', {
      state: {
        service_name:        selectedTour.name,
        short_description:   selectedTour.short_description || null,
        service_type:        'tour',
        booking_mode:        'private',
        service_date:        t('toursPg.common.toBeConfirmed'),
        service_date_iso:    format(date, 'yyyy-MM-dd'),
        service_time:        t('toursPg.common.toBeConfirmed'),
        people_count:        people,
        origin_text:         origin?.name || null,
        origin_latitude:     origin?.latitude,
        origin_longitude:    origin?.longitude,
        vehicle_name:        cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + '),
        total_price:         cartTotal,
        breakdown:           { [t('toursPg.breakdown.vehicles')]: cartTotal },
        cover_image_url:     selectedTour.cover_image_url || null,
        region_id:           selectedTour.regions?.id,
        service_id:          selectedTour.id,
        vehicles:            cartItems.map(({ vehicle, qty }) => ({ vehicle_id: vehicle.id, qty, unit_price: Number(vehicle.base_price) || 0 })),
        booking_cutoff_time: selectedTour.booking_cutoff_time || null,
        min_advance_hours:   selectedTour.min_advance_hours ?? null,
        open_editing:        true,
      },
    })
  }

  const applySuggestion = () => {
    if (!suggestion) return
    setCart({ [suggestion.vehicle.id]: suggestion.qty })
  }

  const nomeRegiao = region?.name || 'Jericoacoara'

  // Foto do banner: a configurada no admin e, na falta dela, a capa de um
  // passeio em destaque da própria região. Nunca uma URL fixa no código —
  // seria a única imagem da tela que não acompanharia o catálogo.
  const bannerFoto = settings?.home_banner_image_url
    || allTours.find((x) => x.is_featured && x.cover_image_url)?.cover_image_url
    || allTours.find((x) => x.cover_image_url)?.cover_image_url
    || null

  const BENEFICIOS = [
    { icon: ShieldCheck,   titulo: t('toursPg.benefits.cancelTitle'),  texto: t('toursPg.benefits.cancelText') },
    { icon: MessageCircle, titulo: t('toursPg.benefits.supportTitle'), texto: t('toursPg.benefits.supportText') },
    { icon: Lock,          titulo: t('toursPg.benefits.payTitle'),     texto: t('toursPg.benefits.payText') },
  ]

  const FILTERS = [
    { id: 'recommended', label: t('toursPg.filters.recommended'), emoji: '⭐' },
    { id: 'economico',   label: t('toursPg.filters.economic'),   emoji: '💰' },
    { id: 'conforto',    label: t('toursPg.filters.comfort'),     emoji: '🛡️' },
  ]

  // Carrossel de exclusivos — renderizado ANTES dos veículos quando um exclusivo
  // está selecionado (aí os veículos ficam abaixo dele) e DEPOIS dos veículos nos
  // demais casos. Assim os veículos sempre aparecem abaixo do carrossel escolhido.
  const exclusiveCarousel = !toursLoading && exclusiveTours.length > 0 ? (
    <section>
      <SectionHeader
        icon={Sparkles}
        cor="text-violet-500"
        title={t('toursPg.exclusiveSection.title')}
        subtitle={t('toursPg.exclusiveSection.subtitle')}
        verTodosLabel={t('toursPg.seeAll')}
        onVerTodos={chip !== '__exclusive' ? () => setChip('__exclusive') : undefined}
      />
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x">
        {exclusiveTours.map((tour) => (
          <TourCard
            key={tour.id}
            tour={tour}
            mode={mode}
            selected={selectedTour?.id === tour.id}
            onSelect={() => { setSelectedId((prev) => prev === tour.id ? null : tour.id); setCart({}) }}
            isFav={favs.has(tour.id)}
            onFav={() => toggleFav(tour.id)}
          />
        ))}
      </div>
    </section>
  ) : null

  return (
    <>
    <div className="lg:hidden min-h-screen pb-28">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-white px-4 pt-5 pb-3 shadow-sm lg:max-w-6xl lg:mx-auto lg:mt-4 lg:rounded-2xl">
        <div className="relative flex items-center justify-center min-h-[32px]">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label={t('toursPg.header.back')}
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">{t('toursPg.header.title')}</h1>
          <div className="absolute right-0 flex items-center gap-2">
            <button
              onClick={() => { setShowSearch((s) => !s); if (showSearch) setSearchTerm('') }}
              className={`w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform ${showSearch ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
              aria-label={t('toursPg.header.search')}
            >
              <Search size={16} />
            </button>
            {/* Carrinho no cabeçalho: o carrinho flutuante fica sobre o
                conteúdo e some ao rolar; aqui o cliente vê o que já juntou sem
                precisar caçar o botão. */}
            <button
              onClick={() => navigate('/carrinho')}
              className="relative w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center active:scale-95 transition-transform"
              aria-label={t('toursPg.cartAria')}
            >
              <ShoppingCart size={16} />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
        {showSearch && (
          <div className="mt-2 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('toursPg.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-2 bg-gray-100 rounded-xl text-[13px] text-gray-900 placeholder-gray-400 outline-none"
            />
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-4 lg:max-w-6xl lg:mx-auto">

        {/* ── Privativo / Compartilhado ─────────────────────── */}
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { id: 'private', label: t('toursPg.mode.private'), icon: UserIcon },
            { id: 'shared',  label: t('toursPg.mode.shared'),  icon: Users },
          ]}
        />

        {/* ── Saída · Data · Pessoas ────────────────────────── */}
        <div className="flex gap-2.5">
          {/* Saída é o campo obrigatório e o mais largo: sem ele o checkout não
              fecha, então ganha borda tracejada laranja enquanto está vazio. */}
          {/* Data e Pessoas ocupam só o que o conteúdo pede (shrink-0) e a
              Saída fica com a sobra. Com os três em flex-1 o espaço era
              repartido igual e "Selecionar local" virava "Selecionar l…" ao
              lado de uma caixa de Data com folga sobrando. */}
          <button
            onClick={() => setShowOriginPicker(true)}
            className={`flex-1 min-w-0 flex items-center gap-2 rounded-[18px] px-3 py-2.5 text-left active:scale-[0.97] transition-transform ${
              origin
                ? 'bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]'
                : 'bg-brand/[0.04] border border-dashed border-brand'
            }`}
          >
            <MapPin size={15} className="text-brand shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.origin.label')}</p>
              <p className={`text-[12.5px] font-bold mt-1 leading-tight truncate ${origin ? 'text-gray-800' : 'text-brand'}`}>
                {origin?.name || t('toursPg.origin.placeholder')}
              </p>
            </div>
          </button>

          <button
            onClick={() => setShowDatePicker(true)}
            className="shrink-0 flex items-center gap-1.5 bg-white rounded-[18px] px-2.5 py-2.5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.05)] active:scale-[0.97] transition-transform"
          >
            <Calendar size={15} className="text-brand shrink-0" />
            <div>
              <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.date.label')}</p>
              <p className="text-[12.5px] font-bold text-gray-800 mt-1 leading-tight whitespace-nowrap">
                {isToday(date) ? t('toursPg.date.today')
                  : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? t('toursPg.date.tomorrow')
                  : format(date, 'd MMM', { locale: ptBR })}
              </p>
            </div>
            <ChevronDown size={12} className="text-gray-400 shrink-0" />
          </button>

          <div className="shrink-0 bg-white rounded-[18px] px-2.5 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <p className="text-[10px] text-gray-400 leading-none text-center">{t('toursPg.people.label')}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <button
                onClick={() => setPeople((p) => Math.max(1, p - 1))}
                aria-label="-"
                className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center active:scale-90 transition-transform shrink-0"
              >
                <Minus size={11} className="text-gray-600" />
              </button>
              <span className="text-[14px] font-extrabold text-gray-900 tabular-nums">{people}</span>
              <button
                onClick={() => setPeople((p) => p + 1)}
                aria-label="+"
                className="w-6 h-6 rounded-full bg-brand flex items-center justify-center active:scale-90 transition-transform shrink-0"
              >
                <Plus size={11} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Pastilhas de filtro ───────────────────────────── */}
        {chips.length > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
            {chips.map((c) => (
              <FilterChip
                key={c.id}
                icon={c.icon}
                label={c.label}
                ativo={chip === c.id}
                onClick={() => setChip(c.id)}
              />
            ))}
          </div>
        )}

        {/* ── Banner ────────────────────────────────────────
            Só aparece com foto real (do admin ou de um passeio da região):
            sem imagem seria uma caixa colorida fingindo ser fotografia. */}
        {bannerFoto && (
          <PromoBanner
            foto={bannerFoto}
            badge={t('toursPg.banner.badge')}
            titulo={t('toursPg.banner.title')}
            destaque={t('toursPg.banner.highlight', { region: nomeRegiao })}
            descricao={t('toursPg.banner.description')}
            beneficios={[t('toursPg.banner.benefit1'), t('toursPg.banner.benefit2')]}
            cta={t('toursPg.banner.cta')}
            onCta={() => { setChip('__all'); setSearchTerm('') }}
          />
        )}

        {/* ── Passeios tradicionais (carrinho/combo) ────────── */}
        <section>
          <SectionHeader
            icon={Flame}
            title={t('toursPg.favorites.title')}
            subtitle={t('toursPg.favorites.subtitle')}
            verTodosLabel={t('toursPg.seeAll')}
            onVerTodos={chip !== '__all' || searchTerm ? () => { setChip('__all'); setSearchTerm('') } : undefined}
          />
          {toursLoading ? (
            <div className="flex gap-3 -mx-4 px-4">
              {[0, 1].map((i) => (
                <div key={i} className="shrink-0 w-[44%] min-w-[166px] h-[268px] rounded-[22px] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)] animate-pulse" />
              ))}
            </div>
          ) : tradTours.length === 0 ? (
            <p className="text-[12.5px] text-gray-500 py-4">
              {searchTerm.trim() || chip !== '__all' ? t('toursPg.noResults') : t('toursPg.traditional.empty')}
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x">
              {tradTours.map((tour) => (
                <TourCard
                  key={tour.id}
                  tour={tour}
                  mode={mode}
                  selected={selectedTour?.id === tour.id}
                  onSelect={() => { setSelectedId((prev) => prev === tour.id ? null : tour.id); setCart({}) }}
                  isFav={favs.has(tour.id)}
                  onFav={() => toggleFav(tour.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Exclusivo selecionado → carrossel exclusivo ACIMA dos veículos */}
        {selectedTour?.is_exclusive && exclusiveCarousel}

        {/* âncora p/ rolar até os veículos ao selecionar um passeio */}
        <div ref={vehiclesRef} className="scroll-mt-4" />

        {/* ── Modo PRIVATIVO (só quando um passeio está selecionado) ── */}
        {selectedTour && mode === 'private' && (
          <>
            {/* Sugestões */}
            {suggestion && (
              <section>
                <p className="text-[17.5px] font-extrabold text-gray-900 mb-2.5">
                  {t('toursPg.suggestions.for')} {people} {people === 1 ? t('toursPg.common.person') : t('toursPg.common.peopleWord')}
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
                <div className="bg-white rounded-[18px] p-3 shadow-[0_4px_20px_rgba(0,0,0,0.06)] flex items-center gap-3">
                  <div className={`w-16 h-14 rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${suggestion.vehicle.image_url ? 'bg-white' : 'bg-gray-100'}`}>
                    {suggestion.vehicle.image_url ? (
                      <img src={suggestion.vehicle.image_url} alt={suggestion.vehicle.name} className="w-full h-full object-contain p-0.5" />
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
                        {t('toursPg.vehicle.upToPeople', { count: suggestion.vehicle.seat_capacity * suggestion.qty })}
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
                      {t('toursPg.actions.apply')}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Catálogo de veículos */}
            {vehicles.length > 0 && (
              <section className="pb-2">
                <p className="text-[17.5px] font-extrabold text-gray-900">{t('toursPg.catalog.title')}</p>
                <p className="text-[12px] text-gray-500 mt-1 mb-3">{t('toursPg.catalog.subtitle')}</p>
                <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:gap-2.5">
                  {sortedVehicles.map((v) => (
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

            {/* Nenhum veículo ligado para este passeio (Motor de Preços) */}
            {vehiclesFetched && vehicles.length === 0 && (
              <section className="pb-2">
                <div className="bg-white rounded-[18px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-center">
                  <p className="text-[13px] font-semibold text-gray-700">{t('toursPg.noVehicles.title')}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{t('toursPg.noVehicles.subtitle')}</p>
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
              <div className="bg-white rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
                <p className="text-[17.5px] font-extrabold text-gray-900">{t('toursPg.sharedMode.peopleTitle')}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 mb-4">{t('toursPg.sharedMode.peopleSubtitle')}</p>
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
                <div className="bg-brand rounded-[22px] p-4 shadow-[0_6px_24px_rgba(255,101,0,0.25)]">
                  <p className="text-white/70 text-[12px] font-medium">{t('toursPg.sharedMode.pricePerPerson')}</p>
                  <p className="text-white text-[30px] font-extrabold leading-tight mt-0.5">
                    R$ {pricePerPerson.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-white/70 text-[12px] mt-0.5">
                    {selectedTour.name}{selectedTour.duration_hours ? ` · ${selectedTour.duration_hours}h` : ''}
                  </p>

                  <div className="flex items-center justify-between mt-4 bg-white/15 rounded-xl px-3 py-2.5">
                    <span className="text-white/80 text-[13px]">
                      {people} {people === 1 ? t('toursPg.common.person') : t('toursPg.common.peopleWord')}
                    </span>
                    <span className="text-white font-bold text-[15px]">
                      R$ {sharedTotal.toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3 bg-white/10 rounded-xl px-3 py-2">
                    <Bus size={13} className="text-white/70 shrink-0" />
                    <span className="text-white/80 text-[11px]">
                      {t('toursPg.sharedMode.transport')}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[18px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
                  <p className="text-[13px] text-gray-500">{t('toursPg.sharedMode.unavailable')}</p>
                </div>
              )}

              {/* Como funciona */}
              {pricePerPerson && (
                <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
                  <div className="flex items-start gap-2.5">
                    <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] font-bold text-blue-900">{t('toursPg.howItWorks.title')}</p>
                      <p className="text-[11px] text-blue-700 leading-relaxed mt-0.5">
                        {t('toursPg.howItWorks.text')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {/* Sem exclusivo selecionado → carrossel exclusivo ABAIXO dos veículos */}
        {!selectedTour?.is_exclusive && exclusiveCarousel}

        {/* ── Confiança ─────────────────────────────────────
            Fecha a página logo antes do menu: é a última coisa lida por quem
            rolou tudo e ainda está em dúvida se reserva. */}
        <BenefitsStrip itens={BENEFICIOS} />

      </div>

      {/* ── Calendário ──────────────────────────────────────────── */}
      {showDatePicker && (
        <DatePickerSheet
          value={date}
          minDate={cutoffMinDate}
          seasons={seasonsData || []}
          highSeasonMonths={highSeasonMonths}
          onChange={setDate}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* ── Resumo flutuante (modo privativo) — fixo no viewport, sempre visível.
          Portal p/ document.body: o wrapper do PullToRefresh usa transform/
          will-change e prenderia o position:fixed na página (a barra sumia no
          fim do conteúdo ao rolar). Pelo portal ela cola no rodapé da tela. ── */}
      {mode === 'private' && cartHasItems && createPortal((() => {
        // Barra aparece só quando há veículo selecionado. Basta a pré-seleção
        // cobrir as pessoas; data/hora/saída são definidas depois, no carrinho.
        const canContinue = cartCapacity >= people
        return (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
            <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 flex items-center justify-between px-4 py-3">
              {/* Resumo do que está selecionado */}
              <div className="flex-1 min-w-0 mr-3">
                {cartHasItems ? (
                  <>
                    <p className="text-[13px] font-bold text-gray-900 truncate">
                      {cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ')}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} className={cartCapacity >= people ? 'text-gray-400' : 'text-red-400'} />
                        <span className={`text-[11px] font-medium ${cartCapacity >= people ? 'text-gray-500' : 'text-red-400'}`}>
                          {cartCapacity}/{people} {t('toursPg.cart.seats')}
                        </span>
                      </span>
                      {cartTotal > 0 && (
                        <span className="text-[13px] font-extrabold text-brand">
                          R$ {cartTotal.toLocaleString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-gray-400">{t('toursPg.cart.selectVehicle')}</p>
                )}
              </div>
              {/* Botão: exclusivo vai direto ao Resumo; tradicional vai ao carrinho */}
              <button
                onClick={canContinue
                  ? (selectedTour?.is_exclusive
                      ? continueExclusivePrivate
                      : () => { saveCartItem(buildCartDraft()); navigate('/carrinho') })
                  : undefined}
                className={`shrink-0 font-bold rounded-xl px-4 py-2.5 text-[13px] transition-transform ${
                  canContinue
                    ? 'bg-brand text-white active:scale-95 cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {selectedTour?.is_exclusive ? t('toursPg.actions.continue') : t('toursPg.actions.addToCart')}
              </button>
            </div>
          </div>
        )
      })(), document.body)}

      {/* ── CTA fixo (modo compartilhado) ───────────────────────── */}
      {mode === 'shared' && selectedTour?.shared_price_per_person && createPortal((() => {
        const pricePerPerson = Number(selectedTour.shared_price_per_person)
        const sharedTotal    = pricePerPerson * people
        return (
          <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
            <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-1">
                  <Users size={11} className="text-gray-400" />
                  <span className="text-[12px] text-gray-500">
                    {people} {people === 1 ? t('toursPg.common.passenger') : t('toursPg.common.passengersWord')}
                  </span>
                </div>
                <p className="text-[16px] font-extrabold text-brand mt-0.5">
                  R$ {sharedTotal.toLocaleString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => {
                  if (!origin) { setShowOriginPicker(true); return }
                  navigate('/checkout/resumo', {
                    state: {
                      service_name:     selectedTour.name,
                      short_description: selectedTour.short_description || null,
                      service_type:     'tour',
                      booking_mode:     'shared',
                      service_date:     isToday(date) ? t('toursPg.date.today')
                                          : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? t('toursPg.date.tomorrow')
                                          : format(date, "d 'de' MMMM", { locale: ptBR }),
                      service_date_iso: format(date, 'yyyy-MM-dd'),
                      service_time:     t('toursPg.common.toBeConfirmed'),
                      people_count:     people,
                      price_per_person: pricePerPerson,
                      origin_text:      origin.name,
                      origin_latitude:  origin.latitude,
                      origin_longitude: origin.longitude,
                      total_price:      sharedTotal,
                      breakdown:        { [t('toursPg.breakdown.perPerson', { count: people })]: sharedTotal },
                      cover_image_url:       selectedTour.cover_image_url || null,
                      region_id:             selectedTour.regions?.id,
                      service_id:            selectedTour.id,
                      vehicles:              [],
                      booking_cutoff_time:   selectedTour.booking_cutoff_time || null,
                      min_advance_hours:     selectedTour.min_advance_hours ?? null,
                    },
                  })
                }}
                className={`font-bold rounded-xl px-5 py-2.5 text-[13px] transition-transform shrink-0 ${
                  origin ? 'bg-brand text-white active:scale-95' : 'bg-gray-200 text-gray-400'
                }`}
              >
                {t('toursPg.actions.continue')}
              </button>
            </div>
          </div>
        )
      })(), document.body)}

      <OriginPicker
        open={showOriginPicker}
        onClose={() => setShowOriginPicker(false)}
        onSelect={setOrigin}
        region={region}
        userCoords={userCoords}
      />
    </div>

    <div className="hidden lg:block">
      <ToursDesktop />
    </div>
    </>
  )
}
