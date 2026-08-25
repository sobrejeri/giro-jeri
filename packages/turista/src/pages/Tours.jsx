import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useFavorites } from '../contexts/FavoritesContext'
import { useCart } from '../contexts/CartContext'
import { draftFromTour } from '../lib/cartDraft'
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


/* ── Folha do passeio ─────────────────────────────────────────────
   Tocar num cartão abre esta folha com o que o cliente precisa para decidir —
   foto, duração, dificuldade, o que inclui e o preço — e o botão de adicionar
   logo abaixo. Antes o toque só marcava o cartão e a ação ficava numa barra no
   rodapé, longe do que tinha acabado de ser tocado.
   Veículos, data e horário não aparecem aqui: são definidos no carrinho. */
function TourSheet({ tour, mode, people, onPeople, inCart, onAdd, onClose }) {
  const { t } = useTranslation()
  if (!tour) return null

  const dur = Number(tour.duration_hours) || null
  const durLabel = dur ? (dur < 1 ? `${Math.round(dur * 60)}min` : Number.isInteger(dur) ? `${dur}h` : `${Math.floor(dur)}h${String(Math.round((dur % 1) * 60)).padStart(2, '0')}`) : null
  const cap = Number(tour.max_people) || null
  const compartilhado = mode === 'shared' && tour.shared_price_per_person
  const preco = compartilhado ? Number(tour.shared_price_per_person) : Number(tour.from_price) || null
  const precoLabel = compartilhado ? t('toursPg.card.perPerson') : t('toursPg.card.startingAt')

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/45 z-[70]" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[70] max-h-[88dvh] flex flex-col shadow-2xl">
        <div className="relative shrink-0">
          <div className="h-[168px] bg-gradient-to-br from-orange-400 to-amber-300 rounded-t-3xl overflow-hidden">
            {tour.cover_image_url && (
              <img src={tour.cover_image_url} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          </div>
          <button
            onClick={onClose}
            aria-label={t('toursPg.calendar.close', 'Fechar')}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <X size={16} className="text-gray-700" />
          </button>
          {tour.is_exclusive && (
            <span className="absolute top-3 left-3 bg-brand text-white text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full">
              {t('toursPg.card.badgeExclusive')}
            </span>
          )}
        </div>

        <div className="overflow-y-auto px-5 pt-4 pb-4 flex-1">
          <p className="text-[19px] font-extrabold text-gray-900 leading-tight">{tour.name}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {durLabel && (
              <span className="inline-flex items-center gap-1 text-[12.5px] text-gray-600">
                <Clock size={13} className="text-brand" /> {durLabel}
              </span>
            )}
            {tour.difficulty_level && (
              <span className="text-[12.5px] text-gray-600">{tour.difficulty_level}</span>
            )}
            {cap && (
              <span className="inline-flex items-center gap-1 text-[12.5px] text-gray-600">
                <Users size={13} className="text-gray-400" /> {t('toursPg.card.capacity', { count: cap })}
              </span>
            )}
          </div>

          {(tour.full_description || tour.short_description) && (
            <p className="text-[13px] text-gray-600 leading-relaxed mt-3 whitespace-pre-line">
              {tour.full_description || tour.short_description}
            </p>
          )}

          {/* Pessoas: é o único dado que muda o preço mostrado aqui. O resto
              (veículos, data, horário, saída) fica para o carrinho. */}
          <div className="mt-4">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
              {t('toursPg.common.peopleWord')}
            </p>
            <div className="mt-1.5 inline-flex items-center gap-3 bg-gray-50 rounded-2xl px-2 py-1.5">
              <button
                onClick={() => onPeople(Math.max(1, people - 1))}
                aria-label="Menos uma pessoa"
                className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center active:scale-95"
              >
                <Minus size={14} className="text-gray-600" />
              </button>
              <span className="text-[16px] font-bold text-gray-900 w-6 text-center tabular-nums">{people}</span>
              <button
                onClick={() => onPeople(people + 1)}
                aria-label="Mais uma pessoa"
                className="w-9 h-9 rounded-full bg-brand flex items-center justify-center active:scale-95"
              >
                <Plus size={14} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        <div
          className="shrink-0 border-t border-gray-100 px-5 pt-3 flex items-center gap-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="min-w-0">
            <p className="text-[10.5px] text-gray-400 leading-none">
              {preco ? precoLabel : ''}
            </p>
            <p className="text-[18px] font-extrabold text-brand leading-tight mt-0.5">
              {preco
                ? `R$ ${(compartilhado ? preco * people : preco).toLocaleString('pt-BR')}`
                : t('toursPg.card.onRequest')}
            </p>
          </div>
          <button
            onClick={onAdd}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            {inCart ? <Check size={16} strokeWidth={3} /> : <ShoppingCart size={16} />}
            {compartilhado ? t('toursPg.actions.continue') : t('toursPg.actions.addToCart')}
          </button>
        </div>
      </div>
    </>,
    document.body,
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

  const { items: savedCartItems, upsertItem: saveCartItem, removeItem: dropCartItem, count: cartCount } = useCart()

  // Marcar vários passeios direto da vitrine: entra no carrinho como rascunho
  // (sem data/veículos ainda) e o carrinho cobra o que falta antes de
  // solicitar. Tocar de novo desmarca. Não mexe no passeio selecionado — dá
  // para montar o combo sem perder o que já estava configurado na tela.
  const cartIds = useMemo(() => new Set(savedCartItems.map((i) => i.id)), [savedCartItems])
  const toggleCart = useCallback((tour) => {
    if (cartIds.has(tour.id)) dropCartItem(tour.id)
    else saveCartItem(draftFromTour(tour, { region_id: region?.id || null }))
  }, [cartIds, dropCartItem, saveCartItem, region?.id])

  // "Retomar" do carrinho flutuante: restaura o rascunho salvo (data/pessoas/
  // veículos) do passeio escolhido. Os dados vivem no localStorage (CartContext).
  const restoredItem = locationState?.restoreFromCart
    ? savedCartItems.find((i) => i.id === locationState?.selectedId)
    : null

  const [mode, setMode] = useState(locationState?.mode || 'private')
  const [selectedId, setSelectedId] = useState(locationState?.selectedId || null)
  const [sheetTourId, setSheetTourId] = useState(null)  // passeio aberto na folha
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
  // O `date` acima sempre tem um valor (hoje, como padrão de exibição). Este
  // marca se o CLIENTE de fato escolheu — sem ele, o compartilhado deixaria
  // passar uma reserva para hoje que ninguém confirmou, agora que o seletor de
  // data saiu do topo da tela.
  const [dataEscolhida, setDataEscolhida] = useState(
    !!(restoredItem?.dateIso || locationState?.dateIso),
  )
  const escolherData = (d) => { setDate(d); setDataEscolhida(true) }
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

  // Sempre lista — ver a mesma defesa em Home.jsx.
  const allTours = Array.isArray(toursData?.tours) ? toursData.tours
                 : Array.isArray(toursData)        ? toursData
                 : []

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
    // A etiqueta pode chegar pela navegação (atalhos "Pôr do sol"/"Lagoas" da
    // home) e casar por NOME ou descrição, sem existir em `tags` — aí não
    // haveria pastilha para ela e o cliente veria a lista filtrada sem nenhuma
    // pastilha marcada, sem entender por que faltam passeios nem como voltar.
    if (chip.startsWith('tag:') && !out.some((c) => c.id === chip)) {
      out.splice(1, 0, { id: chip, label: locationState?.tag || chip.slice(4) })
    }
    return out
  }, [allTours, chip, locationState?.tag, t])

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
  // CATEGORIA com carrossel próprio (categories.is_exclusive, migration 071) —
  // mesma lógica já usada nos translados. A categoria tira o passeio da lista
  // comum e ganha uma vitrine só dela, com o nome da categoria de título.
  //
  // É independente de `tours.is_exclusive`: aquele decide o FLUXO DE VENDA
  // (venda direta, sem carrinho); este decide apenas ONDE o passeio aparece.
  // Um passeio pode ter os dois, um só, ou nenhum.
  const temCarrosselProprio = (x) => !!x.categories?.is_exclusive

  const categoriasCarrossel = useMemo(() => {
    const porId = new Map()
    for (const x of tours) {
      if (!temCarrosselProprio(x)) continue
      const id = x.category_id || x.categories?.id || x.categories?.name
      if (!id) continue
      if (!porId.has(id)) {
        porId.set(id, {
          id,
          nome:  x.categories?.name || '',
          ordem: Number(x.categories?.sort_order) || 0,
          passeios: [],
        })
      }
      porId.get(id).passeios.push(x)
    }
    // Ordem definida no admin; empate resolvido pelo nome para a vitrine não
    // trocar de posição a cada carregamento.
    return [...porId.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
  }, [tours])

  const idsEmCarrossel = useMemo(
    () => new Set(categoriasCarrossel.flatMap((c) => c.passeios.map((p) => p.id))),
    [categoriasCarrossel],
  )

  // Tradicionais entram no carrinho/combo (fluxo desta tela); exclusivos são
  // venda direta (carrossel próprio → tela de detalhes, sem carrinho).
  // Quem já está numa vitrine de categoria sai das duas listas — senão o mesmo
  // passeio apareceria duas vezes na tela.
  const tradTours      = tours.filter((t) => !t.is_exclusive && !idsEmCarrossel.has(t.id))
  const exclusiveTours = tours.filter((t) =>  t.is_exclusive && !idsEmCarrossel.has(t.id))
  const emCategorias   = categoriasCarrossel.flatMap((c) => c.passeios)
  // Nada vem pré-selecionado: o cliente escolhe um passeio (tradicional OU
  // exclusivo) e só então os veículos aparecem. Clicar no selecionado desmarca.
  const selectedTour = [...tradTours, ...exclusiveTours, ...emCategorias]
    .find((t) => t.id === selectedId) || null

  const sheetTour = [...tradTours, ...exclusiveTours, ...emCategorias]
    .find((t) => t.id === sheetTourId) || null

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
  //
  // `Array.isArray` e não `|| []`: qualquer resposta que não seja lista (um
  // objeto de erro devolvido com 200, por exemplo) é truthy e passava direto,
  // e o `.slice()` logo abaixo derrubava a tela inteira. Mesma guarda que o
  // resto do arquivo já usa para as outras listas.
  const vehicles = useMemo(
    () => (Array.isArray(vehiclesData) ? vehiclesData : vehiclesData?.vehicles || []),
    [vehiclesData],
  )

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

  // Rascunho do carrinho. Guarda só o que o cliente realmente escolheu nesta
  // tela: o passeio e o número de pessoas (da folha). Data, horário, local de
  // saída e veículos nascem VAZIOS — são pedidos no carrinho, que já trava o
  // "Solicitar" enquanto faltar qualquer um deles.
  //
  // Um rascunho já existente é preservado: se o cliente voltar à vitrine e
  // tocar de novo no mesmo passeio, o que ele preencheu no carrinho continua lá
  // em vez de ser zerado.
  const buildCartDraft = () => {
    const existing = savedCartItems.find((i) => i.id === selectedTour.id)
    return {
      id:      selectedTour.id,
      kind:    'tour',
      // Privativo x compartilhado é escolhido no carrinho; aqui só viaja o que
      // o passeio aceita, para o carrinho não oferecer um modo que não existe.
      mode:    existing?.mode
                 || (selectedTour.is_private_enabled === false && selectedTour.is_shared_enabled ? 'shared' : 'private'),
      allows_private: selectedTour.is_private_enabled !== false,
      allows_shared:  !!selectedTour.is_shared_enabled,
      shared_price_per_person: selectedTour.shared_price_per_person != null
                                 ? Number(selectedTour.shared_price_per_person) : null,
      name:    selectedTour.name,
      cover_image_url: selectedTour.cover_image_url || null,
      booking_cutoff_time: selectedTour.booking_cutoff_time || null,
      min_advance_hours: selectedTour.min_advance_hours ?? null,
      service_window_start: selectedTour.service_window_start || null,
      service_window_end:   selectedTour.service_window_end   || null,
      dateIso: existing?.dateIso || '',
      time:    existing?.time || '',
      people,
      region_id:   selectedTour.regions?.id || null,
      origin_text: existing?.origin_text || '',
      vehicles: existing?.vehicles || [],
      total:    Number(existing?.total) || 0,
    }
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
            onSelect={() => { setSelectedId(tour.id); setSheetTourId(tour.id); setCart({}) }}
            isFav={favs.has(tour.id)}
            onFav={() => toggleFav(tour.id)}
            inCart={cartIds.has(tour.id)}
            onToggleCart={() => toggleCart(tour)}
          />
        ))}
      </div>
    </section>
  ) : null

  // Uma vitrine por categoria marcada, com o NOME da categoria no título —
  // igual aos translados. Ficam logo abaixo da lista comum, antes do bloco do
  // passeio selecionado.
  const carrosseisDeCategoria = !toursLoading && categoriasCarrossel.length > 0 ? (
    categoriasCarrossel.map((cat) => (
      <section key={cat.id}>
        <SectionHeader
          icon={Sparkles}
          cor="text-violet-500"
          title={cat.nome}
          subtitle={t('toursPg.categorySection.subtitle')}
        />
        <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x">
          {cat.passeios.map((tour) => (
            <TourCard
              key={tour.id}
              tour={tour}
              mode={mode}
              selected={selectedTour?.id === tour.id}
              onSelect={() => { setSelectedId(tour.id); setSheetTourId(tour.id); setCart({}) }}
              isFav={favs.has(tour.id)}
              onFav={() => toggleFav(tour.id)}
              inCart={cartIds.has(tour.id)}
              onToggleCart={() => toggleCart(tour)}
            />
          ))}
        </div>
      </section>
    ))
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

        {/* Saída, data e pessoas saíram DESTA tela.
            A vitrine só apresenta os passeios; quem cobra os dados da reserva é
            o carrinho, onde os três já são obrigatórios para poder solicitar
            (`itemMissing` em lib/cartCheckout). Mesma decisão já tomada para os
            veículos — juntar tudo num lugar só evita o cliente preencher aqui,
            preencher de novo lá, e as duas respostas divergirem.
            O modo COMPARTILHADO é a exceção: ele não passa pelo carrinho (vai
            direto ao Resumo), então pede saída e data no próprio bloco dele,
            mais abaixo. */}


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

        {/* ── Faixa ilustrativa ─────────────────────────────
            Só aparece com foto real (do admin ou de um passeio da região):
            sem imagem seria uma caixa colorida fingindo ser fotografia. */}
        {bannerFoto && (
          <PromoBanner
            foto={bannerFoto}
            badge={t('toursPg.banner.badge')}
            titulo={t('toursPg.banner.title')}
            destaque={t('toursPg.banner.highlight', { region: nomeRegiao })}
            onCta={() => { setChip('__all'); setSearchTerm('') }}
          />
        )}

        {/* ── Passeios tradicionais (carrinho/combo) ─────────
            Escondida quando não sobrou nenhum tradicional MAS há exclusivos na
            tela: com a pastilha "Exclusivos" ligada, esta seção anunciava
            "nenhum passeio encontrado" logo acima de uma fileira de passeios.
            A mensagem de vazio só faz sentido quando a tela está mesmo vazia. */}
        {(tradTours.length > 0 || (exclusiveTours.length === 0 && emCategorias.length === 0) || toursLoading) && (
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
                  onSelect={() => { setSelectedId(tour.id); setSheetTourId(tour.id); setCart({}) }}
                  isFav={favs.has(tour.id)}
                  onFav={() => toggleFav(tour.id)}
                  inCart={cartIds.has(tour.id)}
                  onToggleCart={() => toggleCart(tour)}
                />
              ))}
            </div>
          )}
        </section>
        )}

        {/* Vitrines por categoria (categories.is_exclusive) */}
        {carrosseisDeCategoria}

        {/* Exclusivo selecionado → carrossel exclusivo ACIMA dos veículos */}
        {selectedTour?.is_exclusive && exclusiveCarousel}

        {/* âncora p/ rolar até os veículos ao selecionar um passeio */}
        <div ref={vehiclesRef} className="scroll-mt-4" />


        {/* ── Modo COMPARTILHADO ────────────────────────────── */}
        {mode === 'shared' && selectedTour && (() => {
          const pricePerPerson = selectedTour.shared_price_per_person
            ? Number(selectedTour.shared_price_per_person) : null
          const sharedTotal = pricePerPerson ? pricePerPerson * people : 0

          return (
            <>
              {/* Saída e data — só no COMPARTILHADO.
                  Este modo não passa pelo carrinho (vai direto ao Resumo), então
                  é aqui que os dois campos obrigatórios são pedidos. No
                  privativo eles não existem nesta tela: quem cobra é o carrinho.
                  Ficam junto do passeio escolhido, e não no topo, porque só
                  fazem sentido depois de escolher o quê. */}
              <div className="bg-white rounded-[22px] p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)] space-y-2.5">
                <button
                  onClick={() => setShowOriginPicker(true)}
                  className={`w-full flex items-center gap-2.5 rounded-[18px] px-3.5 py-2.5 text-left active:scale-[0.98] transition-transform ${
                    origin ? 'bg-gray-50' : 'bg-brand/[0.04] border border-dashed border-brand'
                  }`}
                >
                  <MapPin size={16} className="text-brand shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.origin.label')}</p>
                    <p className={`text-[13px] font-bold mt-1 leading-tight truncate ${origin ? 'text-gray-800' : 'text-brand'}`}>
                      {origin?.name || t('toursPg.origin.placeholder')}
                    </p>
                  </div>
                  <ChevronDown size={13} className="text-gray-400 shrink-0" />
                </button>

                <button
                  onClick={() => setShowDatePicker(true)}
                  className={`w-full flex items-center gap-2.5 rounded-[18px] px-3.5 py-2.5 text-left active:scale-[0.98] transition-transform ${
                    dataEscolhida ? 'bg-gray-50' : 'bg-brand/[0.04] border border-dashed border-brand'
                  }`}
                >
                  <Calendar size={16} className="text-brand shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.date.label')}</p>
                    <p className={`text-[13px] font-bold mt-1 leading-tight truncate ${dataEscolhida ? 'text-gray-800' : 'text-brand'}`}>
                      {!dataEscolhida ? t('toursPg.date.placeholder')
                        : isToday(date) ? t('toursPg.date.today')
                        : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? t('toursPg.date.tomorrow')
                        : format(date, 'd MMM', { locale: ptBR })}
                    </p>
                  </div>
                  <ChevronDown size={13} className="text-gray-400 shrink-0" />
                </button>
              </div>

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
          onChange={escolherData}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {/* ── Resumo flutuante (modo privativo) — fixo no viewport, sempre visível.
          Portal p/ document.body: o wrapper do PullToRefresh usa transform/
          will-change e prenderia o position:fixed na página (a barra sumia no
          fim do conteúdo ao rolar). Pelo portal ela cola no rodapé da tela. ── */}

      {/* Folha do passeio: abre ao tocar num cartão. Substitui a antiga barra
          flutuante do modo privativo — a ação agora fica junto da informação. */}
      <TourSheet
        tour={sheetTour}
        mode={mode}
        people={people}
        onPeople={setPeople}
        inCart={sheetTour ? cartIds.has(sheetTour.id) : false}
        onClose={() => setSheetTourId(null)}
        onAdd={() => {
          // Todo passeio passa pelo carrinho — privativo e compartilhado. O
          // modo é escolhido lá, junto dos veículos, porque é ele que decide
          // se há veículo a escolher.
          saveCartItem(buildCartDraft())
          setSheetTourId(null)
          navigate('/carrinho')
        }}
      />

      {/* ── CTA fixo (modo compartilhado) ───────────────────────── */}

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
