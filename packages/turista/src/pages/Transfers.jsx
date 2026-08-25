import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useQuery }    from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth }     from '../contexts/AuthContext'
import { useRegion }   from '../contexts/RegionContext'
import { useCart }     from '../contexts/CartContext'
import { draftFromRoute } from '../lib/cartDraft'
import { highSeasonMonthSet } from '../lib/season'
import DateSheet from '../components/DateSheet'
import { api }         from '../lib/api'
import { getPlaceSuggestions, getPlaceDetails } from '../lib/geoServices'
import TransfersDesktop from './TransfersDesktop'
import {
  MapPin, Calendar, Clock, Users, ChevronDown, ChevronLeft, ChevronRight,
  Minus, Plus, Car, X, Check, Info, Zap, Send, CheckCircle2, Route, Loader2, Search,
  Plane,
} from 'lucide-react'
import {
  format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isBefore, addMonths, subMonths, getDay, isToday, addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Place Autocomplete (Google Places no navegador → OSM fallback) ───── */
// Google Places direto pelo SDK no browser: resultados detalhados e sem
// depender do servidor acordar (Render free). Se o Google falhar (chave
// sem billing, rede etc.), o geoServices cai sozinho para o OpenStreetMap.
function usePlaceSuggestions(query) {
  const [results,  setResults]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const timerRef = useRef(null)
  const seqRef   = useRef(0)

  useEffect(() => {
    if (!query || query.length < 1) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const seq = ++seqRef.current
      setLoading(true)
      try {
        const list = await getPlaceSuggestions(query)
        if (seq !== seqRef.current) return // digitação mais nova em andamento
        setResults((list || []).map((p) => ({
          id:       String(p.place_id),
          label:    p.main_text || p.display_name.split(',')[0],
          sublabel: p.secondary_text || '',
          full:     p.display_name,
          lat:      p.lat != null ? parseFloat(p.lat) : null,
          lon:      p.lon != null ? parseFloat(p.lon) : null,
          _source:  p._source,
        })))
      } catch {
        if (seq === seqRef.current) setResults([])
      }
      if (seq === seqRef.current) setLoading(false)
    }, 250)
    return () => clearTimeout(timerRef.current)
  }, [query])

  return { results, loading }
}

// Coordenadas/endereço de um place_id do Google (SDK no navegador).
async function resolvePlaceDetails(placeId) {
  try {
    const det = await getPlaceDetails(placeId)
    if (!det) return null
    return { lat: parseFloat(det.lat), lon: parseFloat(det.lon), address: det.address || det.name || null }
  } catch { return null }
}

export function PlaceInput({ value, onChange, onPick, placeholder, dotClass }) {
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

  async function handlePick(r) {
    onChange(r.label)
    setOpen(false)
    if (!onPick) return
    // Para resultados do Google, busca lat/lon via Places Details.
    // Para Nominatim, lat/lon já vem na própria resposta.
    let lat = r.lat, lon = r.lon, address = r.full
    if (r._source === 'google' && r.id) {
      const det = await resolvePlaceDetails(r.id)
      if (det) { lat = det.lat; lon = det.lon; address = det.address || r.full }
    }
    onPick({ place_id: r._source === 'google' ? r.id : null, label: r.label, address, lat, lon })
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); onPick?.(null); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 text-[13px] text-gray-800 bg-transparent outline-none placeholder-gray-400"
        />
        {loading
          ? <Loader2 size={13} className="animate-spin text-gray-400 shrink-0" />
          : value
            ? <button onClick={() => { onChange(''); onPick?.(null); setOpen(false) }} className="shrink-0">
                <X size={13} className="text-gray-400" />
              </button>
            : <Search size={13} className="text-gray-400 shrink-0" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {results.map(r => (
            <button key={r.id} onClick={() => handlePick(r)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100 border-b border-gray-50 last:border-0"
            >
              <MapPin size={13} className="text-brand shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[12px] text-gray-700 leading-snug truncate">{r.label}</p>
                {r.sublabel && <p className="text-[10px] text-gray-400 leading-snug truncate">{r.sublabel}</p>}
              </div>
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

// Atalho de carrinho sobre a foto da rota: dá para marcar várias rotas de uma
// vez sem configurar cada uma. Data, horário e veículos ficam para o carrinho.
function CartToggle({ inCart, onToggle }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      aria-label={inCart ? 'Remover do carrinho' : 'Adicionar ao carrinho'}
      aria-pressed={!!inCart}
      className={`absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-all ${
        inCart ? 'bg-brand text-white' : 'bg-white/90 backdrop-blur-sm text-gray-600'
      }`}
    >
      {inCart ? <Check size={15} strokeWidth={3} /> : <Plus size={16} strokeWidth={2.5} />}
    </button>
  )
}

// `full` = ocupa a largura da célula (grade "todas as rotas"); sem ele mantém
// a largura fixa do carrossel horizontal.
function PresetCard({ route, bg, active, onSelect, full = false, inCart, onToggleCart }) {
  const { t } = useTranslation()
  const img = route.cover_image_url
  return (
    <button
      onClick={onSelect}
      className={`${full ? 'w-full' : 'flex-none w-[168px]'} rounded-2xl overflow-hidden bg-white shadow-sm border active:scale-[0.97] transition-transform text-left ${active ? 'border-brand ring-2 ring-brand/20' : 'border-black/5'}`}
    >
      {/* Capa: foto da rota quando houver; senão o gradiente de sempre. */}
      <div className="relative h-[104px] overflow-hidden">
        {img ? (
          <img src={img} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${bg}`} />
        )}
        {/* Escurece a base para o texto ficar legível sobre qualquer foto. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

        <span className="absolute top-2 left-2 text-[9px] font-bold text-white bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full">
          {t('transfersPg.privateBadge')}
        </span>

        <div className="absolute bottom-2 left-2.5 right-2.5">
          <p className="text-white font-bold text-[12.5px] leading-tight [text-shadow:0_1px_3px_rgba(0,0,0,.45)]">
            {shortPlace(route.origin_name)} → {shortPlace(route.destination_name)}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <Users size={9} className="text-white/80" />
            <span className="text-[10px] text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.4)]">{t('transfersPg.upTo4')}</span>
          </div>
        </div>

        {onToggleCart && <CartToggle inCart={inCart} onToggle={onToggleCart} />}
      </div>

      <div className="px-3 py-2 flex items-end justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[9px] text-gray-400 leading-none">{t('transfersPg.startingFrom')}</p>
          <p className="text-[14px] font-extrabold text-gray-900 leading-tight mt-0.5">
            R$ {Number(route.default_price).toLocaleString('pt-BR')}
          </p>
        </div>
        <ChevronRight size={14} className="text-brand shrink-0 mb-0.5" />
      </div>
    </button>
  )
}


/* ── Card de translado exclusivo (helicóptero) ──────────────────
 * Mesma linguagem visual das rotas comuns — foto de capa, rótulo sobre a
 * imagem e preço no rodapé —, com o selo "Exclusivo" e o preço por voo em vez
 * do "a partir de". Sem foto cadastrada, cai num gradiente de céu com o ícone
 * do avião, para não virar um cartão vazio no meio dos que têm imagem.
 */
function ExclusiveCard({ route, active, onSelect, inCart, onToggleCart }) {
  const img = route.cover_image_url
  return (
    <button
      onClick={onSelect}
      className={`flex-none w-[190px] rounded-2xl overflow-hidden bg-white shadow-sm border active:scale-[0.97] transition-transform text-left ${active ? 'border-brand ring-2 ring-brand/20' : 'border-black/5'}`}
    >
      <div className="relative h-[104px] overflow-hidden">
        {img ? (
          <img src={img} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-sky-400 to-indigo-300 flex items-center justify-center">
            <Plane size={34} className="text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

        <span className="absolute top-2 left-2 text-[9px] font-bold text-white bg-white/25 backdrop-blur-sm px-2 py-0.5 rounded-full">
          Exclusivo
        </span>

        <div className="absolute bottom-2 left-2.5 right-2.5">
          <p className="text-[9.5px] text-white/80 leading-none [text-shadow:0_1px_2px_rgba(0,0,0,.4)]">
            {shortPlace(route.origin_name)}
          </p>
          <p className="text-white font-bold text-[12.5px] leading-tight mt-0.5 [text-shadow:0_1px_3px_rgba(0,0,0,.45)]">
            {shortPlace(route.destination_name)}
          </p>
        </div>

        {onToggleCart && <CartToggle inCart={inCart} onToggle={onToggleCart} />}
      </div>

      <div className="px-3 py-2 flex items-end justify-between gap-1">
        <div className="min-w-0">
          <p className="text-[14px] font-extrabold text-brand leading-tight">
            R$ {Number(route.default_price).toLocaleString('pt-BR')}
          </p>
          <p className="text-[9px] text-gray-400 leading-none mt-0.5">por voo · até 3 pax</p>
        </div>
        <ChevronRight size={14} className="text-brand shrink-0 mb-0.5" />
      </div>
    </button>
  )
}

/* ── Route picker (bottom sheet) ────────────────────────────── */
function RouteSheet({ title, options, selected, onSelect, onClose }) {
  return createPortal(
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
    </>,
    document.body,
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
  const { t } = useTranslation()
  return (
    <div className={`flex items-center gap-3 px-4 py-3 transition-all border-l-4 ${qty > 0 ? 'border-brand bg-brand/5' : 'border-transparent'}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${qty > 0 ? 'bg-brand' : 'bg-gray-100'}`}>
        <Car size={18} className={qty > 0 ? 'text-white' : 'text-gray-400'} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[13px] font-bold text-gray-900 truncate">{vehicle.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Users size={10} className="text-gray-400" />
          <span className="text-[11px] text-gray-400">{t('transfersPg.upToPeopleCapacity', { count: vehicle.seat_capacity })}</span>
        </div>
        {unitPrice && (
          <p className="text-[11px] text-gray-500 mt-0.5">
            R$ {Number(unitPrice).toLocaleString('pt-BR')}<span className="text-gray-400"> {t('transfersPg.perVehicle')}</span>
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
  const { t } = useTranslation()
  const navigate  = useNavigate()
  // Busca da home pode chegar com rota/data/pessoas pré-selecionadas
  const { state: navState } = useLocation()
  const { upsertItem: saveCartItem, items: savedCartItems, removeItem: dropCartItem } = useCart()

  // Marcar rotas direto da vitrine, várias de uma vez. Entra como rascunho —
  // o carrinho é quem cobra veículos, data, horário e pessoas. Tocar de novo
  // desmarca. Não mexe na rota selecionada logo abaixo.
  const cartIds = useMemo(() => new Set(savedCartItems.map((i) => i.id)), [savedCartItems])
  const toggleRouteInCart = useCallback((route) => {
    if (cartIds.has(route.id)) dropCartItem(route.id)
    else saveCartItem(draftFromRoute(route, {
      region_id: region?.id || null,
      shortName: (o, d) => `${shortPlace(o)} → ${shortPlace(d)}`,
    }))
  }, [cartIds, dropCartItem, saveCartItem, region?.id])
  const { token } = useAuth()
  const { region, userCoords, getServiceQuery } = useRegion()
  const timeRef      = useRef(null)
  const customTimeRef = useRef(null)
  // Tracks the last suggestion we auto-applied so we know when to follow updates
  const autoAppliedRef = useRef(null) // "vehicleId:qty"

  // mode: 'rota' | 'custom'
  const [mode, setMode] = useState('rota')
  const [showSearch, setShowSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const [origin,     setOrigin]     = useState(navState?.origin || 'Jericoacoara')
  const [dest,       setDest]       = useState(navState?.dest   || '')
  const [date,       setDate]       = useState(() => {
    const d = navState?.date ? new Date(`${navState.date}T12:00:00`) : new Date()
    return startOfDay(Number.isNaN(d.getTime()) ? new Date() : d)
  })
  const [time,       setTime]       = useState(navState?.time || '08:00')
  const [people,     setPeople]     = useState(Number(navState?.people) || 2)
  const [cart,       setCart]       = useState(() => {  // vehicleId → qty
    // "Retomar" do carrinho flutuante: restaura os veículos salvos da rota
    if (navState?.restoreFromCart && Array.isArray(navState.cartVehicles)) {
      const c = {}
      for (const v of navState.cartVehicles) c[v.id] = v.qty
      return c
    }
    return {}
  })
  const [notes,      setNotes]      = useState('')
  const [showDate,   setShowDate]   = useState(false)
  const [showOrigin, setShowOrigin] = useState(false)
  const [showDest,   setShowDest]   = useState(false)
  const [loading,    setLoading]    = useState(false)

  // Custom ride state
  const [customOrigin,   setCustomOrigin]   = useState('')
  const [customDest,     setCustomDest]     = useState('')
  // Metadados do place picado (place_id + coordenadas) — quando o usuário escolhe
  // um item da busca do Maps, guardamos pra mandar para a cooperativa junto da
  // solicitação. Se digitar livre sem selecionar, segue só com o texto mesmo.
  const [customOriginMeta, setCustomOriginMeta] = useState(null)
  const [customDestMeta,   setCustomDestMeta]   = useState(null)
  const [customDate,     setCustomDate]     = useState(startOfDay(new Date()))
  const [customTime,     setCustomTime]     = useState('08:00')
  const [customPeople,   setCustomPeople]   = useState(2)
  const [customNotes,    setCustomNotes]    = useState('')
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customLoading,  setCustomLoading]  = useState(false)
  const [customSuccess,  setCustomSuccess]  = useState(false)
  const [customError,    setCustomError]    = useState('')

  async function handleRequestQuote() {
    if (!token) { navigate('/login', { state: { from: '/transfers' } }); return }
    if (!customOrigin.trim() || !customDest.trim() || !customTime) return
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
        service_date:             format(customDate, 'yyyy-MM-dd'),
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

  const customDateLabel = isToday(customDate) ? t('transfersPg.today')
    : isSameDay(customDate, addDays(startOfDay(new Date()), 1)) ? t('transfersPg.tomorrow')
    : format(customDate, 'd MMM', { locale: ptBR })

  /* ── Queries ── */
  const { data: routesData } = useQuery({
    queryKey: ['transfer-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })
  const todasRotas = Array.isArray(routesData?.routes) ? routesData.routes
                   : Array.isArray(routesData) ? routesData : []

  // Translado EXCLUSIVO (ex.: helicóptero) sai da lista comum e ganha carrossel
  // próprio: misturar um trecho de R$ 3.000 com um de R$ 200 na mesma lista
  // confunde o cliente — e a cooperativa que só opera helicóptero recebe
  // solicitação de buggy. Mesma separação dos passeios exclusivos.
  const rotasExclusivas = todasRotas.filter((r) => r.transfers?.is_exclusive)
  const routes          = todasRotas.filter((r) => !r.transfers?.is_exclusive)

  // UM carrossel por categoria, não um só com tudo dentro.
  //
  // Antes as rotas exclusivas iam todas para o mesmo carrossel, com o nome da
  // PRIMEIRA delas no título. Com só uma categoria exclusiva funcionava por
  // coincidência; ao criar a segunda (lancha, buggy 4x4…), as rotas das duas
  // apareceriam juntas sob o nome de uma delas.
  const categoriasExclusivas = useMemo(() => {
    const porId = new Map()
    for (const r of rotasExclusivas) {
      const id = r.transfer_id || r.transfers?.name || 'sem-categoria'
      if (!porId.has(id)) {
        porId.set(id, { id, nome: r.transfers?.name || 'Translado exclusivo', rotas: [] })
      }
      porId.get(id).rotas.push(r)
    }
    return [...porId.values()]
  }, [rotasExclusivas])

  // Alta temporada: meses com acréscimo, p/ sinalizar no calendário.
  const { data: seasonsData } = useQuery({
    queryKey: ['seasons', region?.id],
    queryFn:  () => api.getSeasons(region?.id ? { region_id: region.id } : {}),
    staleTime: 10 * 60 * 1000,
    retry: 3,               // API pode estar “acordando” (Render) — não desistir na 1ª
    refetchOnWindowFocus: true,
  })
  const highSeasonMonths = useMemo(() => highSeasonMonthSet(seasonsData || []), [seasonsData])

  const origins    = useMemo(() => [...new Set(routes.map(r => r.origin_name))], [routes])
  const dests      = useMemo(() => routes.filter(r => r.origin_name === origin).map(r => r.destination_name), [routes, origin])
  // Procura em TODAS as rotas: o carrossel de translado exclusivo também define
  // origem/destino, e sem isso a rota aérea ficava "não encontrada" (sem preço).
  // Já `origins`/`dests` acima usam só as comuns — rota exclusiva não entra nos
  // seletores manuais, ela é escolhida pelo carrossel.
  const matched    = useMemo(
    () => todasRotas.find(r => r.origin_name === origin && r.destination_name === dest),
    [todasRotas, origin, dest],
  )
  const unitPrice  = matched ? Number(matched.default_price) : null

  // Veículos: com a rota escolhida, usa os que ATENDEM aquela rota (matriz
  // veículo × rota). É o que impede pedir buggy num trecho de helicóptero — e
  // o contrário. Sem rota ainda, mostra a lista geral da região.
  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles', 'transfer', region?.id, matched?.id || null],
    queryFn:  () => matched?.id
      ? api.getRouteVehicles(matched.id, region?.id ? { region_id: region.id } : {})
      : (region?.id ? api.getVehicles({ region_id: region.id }) : Promise.resolve([])),
    enabled:  !!region?.id || !!matched?.id,
  })
  const vehicles = (Array.isArray(vehiclesData) ? vehiclesData : vehiclesData?.vehicles || [])
                    .filter(v => v.is_transfer_allowed !== false && v.is_active !== false)
  const popularRoutes = useMemo(() => pickPopularRoutes(routes), [routes])

  // Vitrine de rotas: por padrão mostra as populares num carrossel. O turista
  // pode filtrar pelo local de saída ou abrir a lista completa — antes só as 8
  // primeiras apareciam e as demais ficavam invisíveis, sem nenhuma pista de
  // que existiam.
  const [routeOrigin,   setRouteOrigin]   = useState('')     // '' = todas as saídas
  const [showAllRoutes, setShowAllRoutes] = useState(false)

  // Locais de saída com pelo menos uma rota, ordenados por quantidade. Conta
  // as comuns E as exclusivas: o filtro vale para os dois carrosséis ao mesmo
  // tempo, então a contagem do chip precisa refletir tudo que ele revela.
  const originOptions = useMemo(() => {
    const m = new Map()
    for (const r of todasRotas) m.set(r.origin_name, (m.get(r.origin_name) || 0) + 1)
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [todasRotas])

  // Filtrar por saída já é um pedido explícito: mostra todas daquela origem.
  const routesShown = useMemo(() => {
    if (routeOrigin) {
      return routes
        .filter(r => r.origin_name === routeOrigin)
        .sort((a, b) => Number(a.default_price) - Number(b.default_price))
    }
    if (showAllRoutes) {
      return [...routes].sort((a, b) =>
        a.origin_name.localeCompare(b.origin_name) || Number(a.default_price) - Number(b.default_price))
    }
    return popularRoutes
  }, [routes, routeOrigin, showAllRoutes, popularRoutes])

  const routesExpanded = !!routeOrigin || showAllRoutes

  // O mesmo filtro de saída recorta os carrosséis exclusivos — sem isso o
  // turista filtrava "Jeri" e continuava vendo voos partindo de outro lugar.
  // Categoria que fica sem nenhuma rota naquela saída some junto com o título.
  const categoriasExclusivasShown = useMemo(() => {
    if (!routeOrigin) return categoriasExclusivas
    return categoriasExclusivas
      .map(cat => ({ ...cat, rotas: cat.rotas.filter(r => r.origin_name === routeOrigin) }))
      .filter(cat => cat.rotas.length > 0)
  }, [categoriasExclusivas, routeOrigin])

  const exclusivasShown = categoriasExclusivasShown.flatMap(c => c.rotas)

  // Antecedência mínima (America/Fortaleza): bloqueia datas E horários
  // anteriores a "agora + N horas". Padrão 4h; a rota selecionada pode definir
  // a sua própria antecedência (transfers.min_advance_hours, via admin).
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

  // Rota definida: usa a antecedência da rota (senão o padrão).
  const MIN_ADVANCE_HOURS = matched?.transfers?.min_advance_hours ?? DEFAULT_MIN_ADVANCE_HOURS
  const minBookable = useMemo(() => bookableAfter(MIN_ADVANCE_HOURS), [MIN_ADVANCE_HOURS])
  const minDate = useMemo(() => startOfDay(minBookable), [minBookable])
  // Horário mínimo: só restringe quando a data escolhida é o 1º dia disponível.
  const minTime = isSameDay(date, minDate) ? format(minBookable, 'HH:mm') : '00:00'

  useEffect(() => {
    if (isBefore(date, minDate)) setDate(minDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate])
  // Se a data é o dia mínimo e o horário ficou antes do limite, empurra o horário.
  useEffect(() => {
    if (isSameDay(date, minDate) && time && time < minTime) setTime(minTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, minTime])

  // TRANSFER PERSONALIZADO (customDate/customTime): sem rota, usa o padrão.
  const customMinBookable = useMemo(() => bookableAfter(DEFAULT_MIN_ADVANCE_HOURS), [])
  const customMinDate = useMemo(() => startOfDay(customMinBookable), [customMinBookable])
  const customMinTime = isSameDay(customDate, customMinDate) ? format(customMinBookable, 'HH:mm') : '00:00'
  useEffect(() => {
    if (isBefore(customDate, customMinDate)) setCustomDate(customMinDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customMinDate])
  useEffect(() => {
    if (isSameDay(customDate, customMinDate) && customTime && customTime < customMinTime) setCustomTime(customMinTime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDate, customMinTime])

  const customChosen = (() => {
    const [th, tm] = String(customTime || '00:00').split(':').map(Number)
    const d = new Date(customDate); d.setHours(th || 0, tm || 0, 0, 0); return d
  })()
  const customAdvanceOk = customChosen >= customMinBookable
  const canCustomBook = customOrigin.trim().length >= 2 && customDest.trim().length >= 2 && !!customTime && customAdvanceOk

  const suggestion = useMemo(() => suggestVehicles(vehicles, people), [vehicles, people])

  // Auto-apply the suggestion when it first appears or changes (people/vehicle list update).
  // Only overrides the cart if it's empty or still matches what we previously auto-applied
  // — user's manual choices are preserved.
  useEffect(() => {
    if (!suggestion) return
    const key = `${suggestion.vehicle.id}:${suggestion.qty}`
    if (key === autoAppliedRef.current) return
    const cartEntries = Object.entries(cart).filter(([, q]) => q > 0)
    const isEmpty = cartEntries.length === 0
    const matchesPrevAuto = autoAppliedRef.current &&
      cartEntries.length === 1 &&
      cartEntries[0][0] === autoAppliedRef.current.split(':')[0] &&
      Number(cartEntries[0][1]) === Number(autoAppliedRef.current.split(':')[1])
    if (isEmpty || matchesPrevAuto) {
      setCart({ [suggestion.vehicle.id]: suggestion.qty })
      autoAppliedRef.current = key
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion?.vehicle?.id, suggestion?.qty])

  const cartItems    = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => ({ vehicle: vehicles.find(v => v.id === id), qty }))
    .filter(x => x.vehicle)
  const cartCapacity = cartItems.reduce((s, { vehicle, qty }) => s + vehicle.seat_capacity * qty, 0)
  const cartTotal    = unitPrice ? cartItems.reduce((s, { qty }) => s + unitPrice * qty, 0) : 0
  const cartHasItems = cartItems.length > 0

  // Monta o rascunho do carrinho a partir da PRÉ-SELEÇÃO (rota definida +
  // veículos + pessoas). NÃO é auto-salvo: só vai pro carrinho no "Continuar".
  // Data/hora são refinadas depois, na edição dentro do carrinho.
  const buildCartDraft = () => ({
    id:      matched.id,
    kind:    'transfer',
    name:    `${shortPlace(origin)} → ${shortPlace(dest)}`,
    origin, dest,
    dateIso: format(date, 'yyyy-MM-dd'),
    time, people,
    region_id: region?.id || null,
    booking_cutoff_time: matched?.transfers?.booking_cutoff_time || null,
    min_advance_hours: matched?.transfers?.min_advance_hours ?? null,
    service_window_start: matched?.transfers?.service_window_start || null,
    service_window_end:   matched?.transfers?.service_window_end   || null,
    vehicles: cartItems.map(({ vehicle, qty }) => ({
      id: vehicle.id, name: vehicle.name, qty,
      price: unitPrice || 0, cap: vehicle.seat_capacity || null,
    })),
    total: cartTotal,
  })
  // Basta a rota + veículos cobrindo as pessoas; o horário é definido no carrinho.
  // Data+hora escolhidas como wall-clock, p/ conferir a antecedência de 4h.
  const chosenDateTime = useMemo(() => {
    const [th, tm] = String(time || '00:00').split(':').map(Number)
    const d = new Date(date); d.setHours(th || 0, tm || 0, 0, 0); return d
  }, [date, time])
  const advanceOk    = chosenDateTime >= minBookable
  const canBook      = !!matched && cartHasItems && cartCapacity >= people && advanceOk

  // True when suggestion is already the only item in cart at the right qty
  const suggestionIsApplied = !!(suggestion &&
    cartItems.length === 1 &&
    cartItems[0].vehicle.id === suggestion.vehicle.id &&
    cartItems[0].qty === suggestion.qty)

  // Acréscimo de alta temporada / feriado NÃO é mais calculado aqui: a data
  // final é definida no carrinho, então é lá que o total com temporada é
  // computado. Nesta pré-seleção mostra-se só o total dos veículos.

  const dateLabel = isToday(date) ? t('transfersPg.today')
    : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? t('transfersPg.tomorrow')
    : format(date, 'd MMM', { locale: ptBR })

  async function handleConfirm() {
    if (!token) { navigate('/login', { state: { from: '/transfers' } }); return }
    if (!canBook) return
    // Pré-seleção → carrinho: continua a solicitação (data/hora/edição) lá.
    saveCartItem(buildCartDraft())
    navigate('/carrinho')
  }

  return (
    <>
    <div className="lg:hidden min-h-screen pb-28">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-3 shadow-sm lg:max-w-3xl lg:mx-auto lg:mt-4 lg:rounded-2xl">
        <div className="relative flex items-center justify-center min-h-[32px]">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label={t('transfersPg.back')}
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">{t('transfersPg.title')}</h1>
          <div className="absolute right-0 flex items-center gap-1.5">
            <button
              onClick={() => { setShowSearch((s) => !s); if (showSearch) setSearchTerm('') }}
              className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-transform ${showSearch ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
              aria-label={t('transfersPg.searchReservation')}
            >
              <Search size={15} />
            </button>
          </div>
        </div>
        <p className="text-[12px] text-gray-400 text-center mt-1">{t('transfersPg.subtitle')}</p>

        {showSearch && (
          <form
            onSubmit={(e) => { e.preventDefault(); const q = searchTerm.trim(); if (q) navigate('/minhas-reservas', { state: { q } }) }}
            className="mt-2 relative"
          >
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('transfersPg.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-2 bg-gray-100 rounded-xl text-[13px] text-gray-900 placeholder-gray-400 outline-none"
            />
          </form>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setMode('rota')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all ${
              mode === 'rota' ? 'bg-brand text-white shadow-sm' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <Route size={13} />
            {t('transfersPg.modeRoute')}
          </button>
          <button
            onClick={() => { setMode('custom'); setCustomSuccess(false); setCustomError('') }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold transition-all ${
              mode === 'custom' ? 'bg-brand text-white shadow-sm' : 'bg-gray-100 text-gray-500'
            }`}
          >
            <Zap size={13} />
            {t('transfersPg.modeCustom')}
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
              <p className="text-[18px] font-extrabold text-gray-900 mb-2">{t('transfersPg.quoteRequestedTitle')}</p>
              <p className="text-[13px] text-gray-500 max-w-[240px] mb-6">
                {t('transfersPg.quoteSuccessDesc')}
              </p>
              <button
                onClick={() => navigate('/minhas-reservas')}
                className="bg-brand text-white font-bold rounded-2xl px-6 py-3 text-[14px] active:scale-95 transition-transform"
              >
                {t('transfersPg.viewQuotes')}
              </button>
              <button
                onClick={() => { setCustomSuccess(false); setCustomOrigin(''); setCustomDest(''); setCustomOriginMeta(null); setCustomDestMeta(null); setCustomNotes('') }}
                className="mt-3 text-[13px] text-gray-400 underline"
              >
                {t('transfersPg.requestAnother')}
              </button>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
                <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  {t('transfersPg.customIntro')}
                </p>
              </div>

              {/* Origin / Dest */}
              <section className="bg-white rounded-2xl border border-gray-100 relative overflow-visible">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.routeSection')}</p>
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.pickup')}</label>
                    <div className="mt-1">
                      <PlaceInput
                        value={customOrigin}
                        onChange={setCustomOrigin}
                        onPick={setCustomOriginMeta}
                        placeholder={t('transfersPg.placeSearchPlaceholder')}
                        dotClass="bg-brand"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{t('transfersPg.destination')}</label>
                    <div className="mt-1">
                      <PlaceInput
                        value={customDest}
                        onChange={setCustomDest}
                        onPick={setCustomDestMeta}
                        placeholder={t('transfersPg.placeSearchPlaceholder')}
                        dotClass="border-2 border-gray-400 bg-transparent"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Data & Horário */}
              <section className="bg-white rounded-2xl border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.dateTimeSection')}</p>
                <div className="flex gap-2 px-4 pb-4">
                  <button onClick={() => setShowCustomDate(true)}
                    className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform">
                    <Calendar size={13} className="text-brand" />
                    <div className="text-left">
                      <p className="text-[9px] text-gray-400 leading-none">{t('transfersPg.dateLabel')}</p>
                      <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{customDateLabel}</p>
                    </div>
                  </button>
                  <button onClick={() => customTimeRef.current?.showPicker?.() || customTimeRef.current?.focus()}
                    className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform relative">
                    <Clock size={13} className="text-brand" />
                    <div className="text-left flex-1">
                      <p className="text-[9px] text-gray-400 leading-none">{t('transfersPg.timeLabel')}</p>
                      <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{customTime || t('transfersPg.select')}</p>
                    </div>
                    <input
                      ref={customTimeRef}
                      type="time"
                      value={customTime}
                      min={customMinTime}
                      onChange={e => setCustomTime(e.target.value)}
                      className="absolute inset-0 opacity-0 w-full cursor-pointer"
                    />
                  </button>
                </div>
              </section>

              {/* Passageiros */}
              <section className="bg-white rounded-2xl border border-gray-100">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.passengersSection')}</p>
                <div className="flex items-center justify-between px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-brand" />
                    <p className="text-[13px] font-bold text-gray-900">{t('transfersPg.passengersCount', { count: customPeople })}</p>
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
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.notesSection')}</p>
                <div className="px-4 pb-4">
                  <textarea
                    rows={3}
                    value={customNotes}
                    onChange={e => setCustomNotes(e.target.value)}
                    placeholder={t('transfersPg.notesPlaceholderCustom')}
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
                  {t('transfersPg.priceNoteCustom')}
                </p>
              </div>
            </>
          )}

          {showCustomDate && (
            <DateSheet value={customDate} onChange={setCustomDate} onClose={() => setShowCustomDate(false)} minDate={customMinDate} seasons={seasonsData || []} highSeasonMonths={highSeasonMonths} />
          )}
        </div>
      )}

      {/* ── FIXED ROUTE FORM ─────────────────────────────────── */}
      {mode === 'rota' && (
      <><div className="px-4 pt-4 space-y-3 lg:max-w-3xl lg:mx-auto">

        {/* ROTAS POPULARES */}
        {routes.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[13px] font-bold text-gray-700">
              {routeOrigin ? `Saindo de ${shortPlace(routeOrigin)}` : t('transfersPg.popularRoutes')}
            </p>
            {routes.length > popularRoutes.length && !routeOrigin && (
              <button
                onClick={() => setShowAllRoutes((v) => !v)}
                className="text-[11px] font-bold text-brand active:scale-95 transition-transform"
              >
                {showAllRoutes ? 'Ver menos' : `Ver todas (${routes.length})`}
              </button>
            )}
          </div>

          {/* Filtro por local de saída — só faz sentido com mais de uma saída */}
          {originOptions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2.5" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setRouteOrigin('')}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                  routeOrigin === '' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                Todas
              </button>
              {originOptions.map(({ name, count }) => (
                <button
                  key={name}
                  onClick={() => { setRouteOrigin((v) => (v === name ? '' : name)); setShowAllRoutes(false) }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                    routeOrigin === name ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {shortPlace(name)} <span className={routeOrigin === name ? 'text-white/70' : 'text-gray-400'}>{count}</span>
                </button>
              ))}
            </div>
          )}

          {routesShown.length === 0 ? (
            // Silencia o aviso quando a saída só tem voo exclusivo — ele
            // aparece logo abaixo, e dizer "nenhuma rota" seria mentira.
            exclusivasShown.length === 0 && (
              <p className="text-[12px] text-gray-400 bg-white/60 rounded-xl px-3 py-3">
                Nenhuma rota saindo daqui por enquanto.
              </p>
            )
          ) : routesExpanded ? (
            // Expandida: grade, para dar pra bater o olho em todas de uma vez.
            <div className="grid grid-cols-2 gap-3">
              {routesShown.map((r, i) => (
                <PresetCard
                  key={r.id}
                  route={r}
                  full
                  bg={GRADIENTS[i % GRADIENTS.length]}
                  active={origin === r.origin_name && dest === r.destination_name}
                  onSelect={() => { setOrigin(r.origin_name); setDest(r.destination_name); setCart({}) }}
                  inCart={cartIds.has(r.id)}
                  onToggleCart={() => toggleRouteInCart(r)}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
              {routesShown.map((r, i) => (
                <PresetCard
                  key={r.id}
                  route={r}
                  bg={GRADIENTS[i % GRADIENTS.length]}
                  active={origin === r.origin_name && dest === r.destination_name}
                  onSelect={() => { setOrigin(r.origin_name); setDest(r.destination_name); setCart({}) }}
                  inCart={cartIds.has(r.id)}
                  onToggleCart={() => toggleRouteInCart(r)}
                />
              ))}
            </div>
          )}
        </div>
        )}

        {/* TRANSLADOS EXCLUSIVOS (helicóptero) — carrossel separado, para não
            misturar com as rotas comuns nem no preço nem na operação. */}
        {categoriasExclusivasShown.map((cat) => (
          <div key={cat.id}>
            <div className="flex items-baseline justify-between mb-2.5">
              {/* O título é o NOME DA CATEGORIA cadastrada no admin: criar uma
                  categoria nova já nomeia o carrossel dela. */}
              <p className="text-[13px] font-bold text-gray-700">{cat.nome}</p>
              <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                Exclusivo
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
              {cat.rotas.map((r) => (
                <ExclusiveCard
                  key={r.id}
                  route={r}
                  active={origin === r.origin_name && dest === r.destination_name}
                  onSelect={() => { setOrigin(r.origin_name); setDest(r.destination_name); setCart({}) }}
                  inCart={cartIds.has(r.id)}
                  onToggleCart={() => toggleRouteInCart(r)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* ROTA */}
        <section className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.routeSection')}</p>

          <button onClick={() => setShowOrigin(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-50 active:bg-gray-50">
            <div className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-[10px] text-gray-400">{t('transfersPg.origin')}</p>
              <p className={`text-[13px] font-semibold ${origin ? 'text-gray-900' : 'text-gray-400'}`}>
                {origin || t('transfersPg.selectOrigin')}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          </button>

          <button onClick={() => dests.length ? setShowDest(true) : null}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-100 active:bg-gray-50">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-[10px] text-gray-400">{t('transfersPg.destination')}</p>
              <p className={`text-[13px] font-semibold ${dest ? 'text-gray-900' : 'text-gray-400'}`}>
                {dest || (dests.length ? t('transfersPg.selectDestination') : t('transfersPg.chooseOriginFirst'))}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          </button>
        </section>

        {/* DATA & HORÁRIO */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.dateTimeSection')}</p>
          <div className="flex gap-2 px-4 pb-4">
            <button onClick={() => setShowDate(true)}
              className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform">
              <Calendar size={13} className="text-brand" />
              <div className="text-left">
                <p className="text-[9px] text-gray-400 leading-none">{t('transfersPg.dateLabel')}</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{dateLabel}</p>
              </div>
            </button>
            <button onClick={() => timeRef.current?.showPicker?.() || timeRef.current?.focus()}
              className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform relative">
              <Clock size={13} className="text-brand" />
              <div className="text-left flex-1">
                <p className="text-[9px] text-gray-400 leading-none">{t('transfersPg.timeLabel')}</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{time || t('transfersPg.select')}</p>
              </div>
              <input
                ref={timeRef}
                type="time"
                value={time}
                min={minTime}
                onChange={e => setTime(e.target.value)}
                className="absolute inset-0 opacity-0 w-full cursor-pointer"
              />
            </button>
          </div>
          {!advanceOk && (
            <p className="px-4 pb-3 -mt-1 text-[11px] text-amber-600">
              {t('transfersPg.minAdvanceNotice', { hours: MIN_ADVANCE_HOURS, datetime: format(minBookable, "d/MM 'às' HH:mm") })}
            </p>
          )}
        </section>

        {/* PASSAGEIROS */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.passengersSection')}</p>
          <div className="flex items-center justify-between px-4 pb-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand" />
              <div>
                <p className="text-[13px] font-bold text-gray-900">{t('transfersPg.passengersCount', { count: people })}</p>
                <p className="text-[10px] text-gray-400">{t('transfersPg.passengersNote')}</p>
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
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.vehicleSection')}</p>

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
                      {t('transfersPg.upToPeopleCapacity', { count: suggestion.vehicle.seat_capacity * suggestion.qty })}
                    </span>
                  </div>
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
                      className="bg-brand text-white text-[11px] font-bold px-3 py-1.5 rounded-full active:scale-95 transition-transform"
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

        {/* OBSERVAÇÕES */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">{t('transfersPg.notesBaggageSection')}</p>
          <div className="px-4 pb-4">
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={t('transfersPg.notesPlaceholderRoute')}
              className="w-full text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400"
            />
          </div>
        </section>

        {/* RESUMO */}
        {matched && (
          <section className="bg-white rounded-2xl border border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-3">{t('transfersPg.summaryTitle')}</p>
            <div className="px-4 pb-4 space-y-2.5">
              {[
                { dot: 'bg-brand',    label: t('transfersPg.origin'),      val: origin },
                { dot: 'bg-gray-400', label: t('transfersPg.destination'), val: dest   },
                { icon: Users,        label: t('transfersPg.passengersSection'), val: t('transfersPg.peopleCount', { count: people }) },
                ...(cartItems.length ? [{ icon: Car, label: t('transfersPg.vehicleSection'), val: cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ') }] : []),
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
              <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                <p className="text-[13px] font-bold text-gray-900">{t('transfersPg.vehiclesTotal')}</p>
                <p className="text-[16px] font-extrabold text-brand">R$ {cartTotal ? cartTotal.toLocaleString('pt-BR') : '—'}</p>
              </div>
              <p className="text-[11px] text-gray-400 leading-snug">
                {t('transfersPg.summaryFootnote')}
              </p>
            </div>
          </section>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 px-1">
          <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-400 leading-relaxed">
            {t('transfersPg.driverInfoRoute')}
          </p>
        </div>
      </div>

      {/* Bottom CTA — resumo fixo no viewport, só quando há veículo selecionado.
          Portal p/ document.body: o wrapper do PullToRefresh usa transform/
          will-change e prenderia o position:fixed na página (a barra sumia no
          fim do conteúdo). */}
      {cartHasItems && createPortal(
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
        <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 flex items-center justify-between px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400">{t('transfersPg.vehiclesTotal')}</p>
            <p className={`text-[16px] font-extrabold ${canBook ? 'text-brand' : 'text-gray-400'}`}>
              {cartTotal
                ? `R$ ${cartTotal.toLocaleString('pt-BR')}`
                : matched ? t('transfersPg.selectVehicle') : t('transfersPg.selectRoute')}
            </p>
          </div>
          <button
            onClick={canBook ? handleConfirm : undefined}
            disabled={loading}
            className={`font-bold rounded-xl px-5 py-2.5 text-[13px] transition-transform ${
              canBook ? 'bg-brand text-white active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? t('transfersPg.wait') : t('transfersPg.addToCart')}
          </button>
        </div>
        </div>,
        document.body,
      )}

      {/* Sheets */}
      {showDate   && <DateSheet value={date} onChange={setDate} onClose={() => setShowDate(false)} minDate={minDate} seasons={seasonsData || []} highSeasonMonths={highSeasonMonths} />}
      {showOrigin && <RouteSheet title={t('transfersPg.chooseOrigin')} options={origins} selected={origin} onSelect={v => { setOrigin(v); setDest(''); setCart({}) }} onClose={() => setShowOrigin(false)} />}
      {showDest   && <RouteSheet title={t('transfersPg.chooseDestination')} options={dests} selected={dest} onSelect={v => { setDest(v); setCart({}) }} onClose={() => setShowDest(false)} />}
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
            {customLoading ? t('transfersPg.requesting') : t('transfersPg.requestQuote')}
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
