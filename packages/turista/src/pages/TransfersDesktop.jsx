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
  Search, MapPin, ArrowUpDown,
} from 'lucide-react'
import { PlaceInput, suggestVehicles, VehicleRow, shortPlace } from './Transfers'
import { isHighSeasonIso } from '../lib/season'
import { horasDeAntecedencia, primeiroReservavel, HORAS_PADRAO_TRANSFER } from '../lib/antecedencia'
import { useCart } from '../contexts/CartContext'
import DesktopDatePicker from '../components/DesktopDatePicker'
import { format, startOfDay, addDays, isToday, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { somenteTransporte, capacidadeDaCombinacao } from '../lib/transporte'

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

// Cartão de rota (vitrine): capa com selo "Privativo" e check quando escolhido;
// título, subtítulo e preço no corpo branco embaixo (não sobre a foto).
function RouteCard({ route, bg, active, onSelect }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onSelect}
      className={`group relative bg-white rounded-2xl overflow-hidden border text-left flex flex-col transition-all ${
        active ? 'border-brand ring-2 ring-brand/30 shadow-md' : 'border-gray-100 hover:shadow-md hover:border-gray-200'
      }`}
    >
      <div className="relative h-[130px] overflow-hidden">
        {route.cover_image_url ? (
          <img
            src={route.cover_image_url} alt="" loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${bg}`} />
        )}
        <span className="absolute top-3 left-3 text-[11px] font-bold text-white bg-black/45 backdrop-blur-sm px-2.5 py-1 rounded-full">
          {t('transfersPg.privateBadge')}
        </span>
        {active && (
          <span className="absolute top-3 right-3 w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center shadow">
            <Check size={14} />
          </span>
        )}
      </div>
      <div className="p-3.5 flex flex-col flex-1">
        <p className="font-bold text-[14px] text-gray-900 leading-snug">
          {route.origin_name} → {route.destination_name}
        </p>
        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
          <Car size={11} /> {t('transfersPg.privateTransfer', 'Transfer privativo')}
        </p>
        <div className="flex items-end justify-between mt-3 pt-3 border-t border-gray-50">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">{t('transfersPg.startingFrom')}</p>
            <p className="text-[17px] font-extrabold text-gray-900 leading-tight mt-1">
              R$ {Number(route.default_price).toLocaleString('pt-BR')}
            </p>
          </div>
          <span className="text-[12px] font-bold text-brand shrink-0 flex items-center gap-1">
            {active
              ? <><Check size={13} /> {t('transfersPg.selected')}</>
              : <>{t('transfersPg.select')} →</>}
          </span>
        </div>
      </div>
    </button>
  )
}

export default function TransfersDesktop() {
  const { t } = useTranslation()
  const navigate  = useNavigate()
  const { token } = useAuth()
  const { upsertItem: saveCartItem } = useCart()
  const { region } = useRegion()
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
  const [search, setSearch] = useState('')   // busca por origem/destino na vitrine
  const [pickup, setPickup] = useState('')   // local de embarque (pousada/endereço)

  /* ── Corrida personalizada ── */
  const [customOrigin,  setCustomOrigin]  = useState('')
  const [customDest,    setCustomDest]    = useState('')
  // Metadados do place escolhido na busca (place_id + coordenadas) — enviados
  // ao operador junto da solicitação, igual ao mobile.
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
  // Memoizado: é a base de todos os recortes abaixo. Sem isso ele seria um
  // array novo a cada render e os `useMemo` que dependem dele nunca acertariam.
  const todasRotas = useMemo(
    () => Array.isArray(routesData?.routes) ? routesData.routes
        : Array.isArray(routesData) ? routesData : [],
    [routesData],
  )

  // Translado EXCLUSIVO (ex.: helicóptero) sai da lista comum e ganha vitrine
  // própria, como no celular: misturar um trecho de R$ 15.000 com um de R$ 120
  // na mesma grade confunde o cliente — e era exatamente o que esta tela fazia.
  //
  // UMA vitrine por categoria, não uma só com tudo dentro: o título é o nome da
  // categoria cadastrada no admin, então criar uma categoria nova (lancha, 4x4)
  // já nomeia a vitrine dela.
  const routes = useMemo(() => todasRotas.filter(r => !r.transfers?.is_exclusive), [todasRotas])
  const categoriasExclusivas = useMemo(() => {
    const porId = new Map()
    for (const r of todasRotas.filter(r => r.transfers?.is_exclusive)) {
      const id = r.transfer_id || r.transfers?.name || 'sem-categoria'
      if (!porId.has(id)) porId.set(id, { id, nome: r.transfers?.name || t('transfersPg.exclusiveTransfer'), rotas: [] })
      porId.get(id).rotas.push(r)
    }
    return [...porId.values()]
  }, [todasRotas, t])

  // Rota escolhida — precisa vir ANTES da consulta de veículos, que depende dela.
  //
  // Guardada por ID, não por origem/destino. Duas rotas podem ter exatamente o
  // mesmo par de nomes: "Jericoacoara → Fortaleza" existe de carro (R$ 700) e de
  // helicóptero (R$ 15.000). Comparando por nome, clicar em UMA acendia AS DUAS
  // — e, pior que o destaque duplo, o `find` devolvia sempre a primeira: quem
  // clicava no helicóptero seguia com o preço e a frota do carro.
  const [routeId, setRouteId] = useState('')
  const escolherRota = (r) => {
    setRouteId(r.id)
    setOrigin(r.origin_name)
    setDest(r.destination_name)
    setCart({})
  }

  // Inverte origem↔destino: limpa o id para o rotaEscolhida re-resolver pela
  // combinação de nomes (a volta costuma ser outra rota cadastrada).
  const inverterRota = () => {
    setRouteId('')
    setOrigin(dest)
    setDest(origin)
    setCart({})
  }

  const rotaEscolhida = useMemo(() => {
    const porId = routeId ? todasRotas.find(r => r.id === routeId) : null
    if (porId) return porId
    // Sem id — origem/destino vieram dos seletores ou da busca da home. Procura
    // só entre as COMUNS: rota exclusiva só se escolhe pelo cartão dela, senão
    // um par de nomes ambíguo poderia cair no voo sem ninguém ter pedido.
    return routes.find(r => r.origin_name === origin && r.destination_name === dest)
  }, [todasRotas, routes, routeId, origin, dest])

  // Veículos: com a rota escolhida, usa os que ATENDEM aquela rota. O endereço
  // `/routes/:id/vehicles` cruza a matriz veículo × rota E o modal da categoria
  // (terrestre / aéreo / aquático) — é o que impede o helicóptero de aparecer
  // num trecho de carro, e o buggy num trecho aéreo.
  //
  // Esta tela pedia `getVehicles` da região inteira, sempre: com uma rota
  // terrestre selecionada, o helicóptero entrava na lista junto de Hilux e
  // Jardineira. O celular já fazia certo; era só o PC que não perguntava pela
  // rota. Mesma chave e mesma consulta do celular, então as duas se juntam.
  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles', 'transfer', region?.id, rotaEscolhida?.id || null],
    queryFn:  () => rotaEscolhida?.id
      ? api.getRouteVehicles(rotaEscolhida.id, region?.id ? { region_id: region.id } : {})
      : (region?.id ? api.getVehicles({ region_id: region.id }) : Promise.resolve([])),
    enabled:  !!region?.id || !!rotaEscolhida?.id,
  })
  // `!== false`, não `truthy`: quando a rota não tem matriz de preço, a API
  // devolve a frota do modal SEM a coluna `is_transfer_allowed` no select. Com
  // o teste de verdadeiro, `undefined` reprovava e a lista abria VAZIA.
  // somenteTransporte: serviço adicional (guia, ingresso) não é veículo — não
  // entra na lista, na sugestão nem na conta de assentos.
  const vehicles = somenteTransporte(
    Array.isArray(vehiclesData) ? vehiclesData : vehiclesData?.vehicles || [],
  ).filter(v => v.is_transfer_allowed !== false && v.is_active !== false)

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

  // Vitrine de rotas: por padrão as populares. O catálogo inteiro ficava
  // invisível atrás desse corte de 8 — sem "ver todas", sem filtro, sem
  // nenhuma pista de que existiam mais. O celular já resolvia assim.
  const [routeOrigin,   setRouteOrigin]   = useState('')   // '' = todas as saídas
  const [showAllRoutes, setShowAllRoutes] = useState(false)

  // Locais de saída com pelo menos uma rota, ordenados por quantidade. Conta as
  // comuns E as exclusivas: o filtro recorta as duas vitrines ao mesmo tempo,
  // então a contagem do chip precisa refletir tudo que ele revela.
  const originOptions = useMemo(() => {
    const m = new Map()
    for (const r of todasRotas) m.set(r.origin_name, (m.get(r.origin_name) || 0) + 1)
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }))
  }, [todasRotas])

  // Filtrar por saída já é um pedido explícito: mostra TODAS daquela origem.
  const routesShown = useMemo(() => {
    if (routeOrigin) {
      return routes.filter(r => r.origin_name === routeOrigin)
        .sort((a, b) => Number(a.default_price) - Number(b.default_price))
    }
    if (showAllRoutes) {
      return [...routes].sort((a, b) =>
        a.origin_name.localeCompare(b.origin_name) || Number(a.default_price) - Number(b.default_price))
    }
    return popularRoutes
  }, [routes, routeOrigin, showAllRoutes, popularRoutes])

  // Busca por texto (origem/destino) por cima do recorte de saída/populares.
  const bateBusca = (r) => {
    const q = search.trim().toLowerCase()
    return !q || `${r.origin_name} ${r.destination_name}`.toLowerCase().includes(q)
  }
  const routesToShow = useMemo(() => routesShown.filter(bateBusca),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routesShown, search])

  // O mesmo filtro recorta as vitrines exclusivas — sem isso o turista filtra
  // "Jeri" e continua vendo voo saindo de outro lugar. Categoria que fica sem
  // nenhuma rota naquela saída some junto com o título.
  const categoriasExclusivasShown = useMemo(() => {
    if (!routeOrigin) return categoriasExclusivas
    return categoriasExclusivas
      .map(cat => ({ ...cat, rotas: cat.rotas.filter(r => r.origin_name === routeOrigin) }))
      .filter(cat => cat.rotas.length > 0)
  }, [categoriasExclusivas, routeOrigin])

  const matched   = rotaEscolhida
  const unitPrice = matched ? Number(matched.default_price) : null

  // Antecedência mínima (America/Fortaleza): bloqueia datas E horários
  // anteriores a "agora + N horas". Padrão 4h; a rota pode definir a sua
  // (transfers.min_advance_hours, via admin) — mesma regra do mobile.
  // Regra em lib/antecedencia.js — a mesma do celular e do resumo do checkout.
  // Aqui estavam 4h cravadas, enquanto o servidor usa 3h: a tela recusava
  // horários que a API aceitaria, e o cliente não tinha como saber por quê.
  const DEFAULT_MIN_ADVANCE_HOURS = HORAS_PADRAO_TRANSFER
  const MIN_ADVANCE_HOURS = horasDeAntecedencia('transfer', matched?.transfers?.min_advance_hours)
  const minBookable = useMemo(() => primeiroReservavel(MIN_ADVANCE_HOURS), [MIN_ADVANCE_HOURS])
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
  const customMinBookable = useMemo(() => primeiroReservavel(DEFAULT_MIN_ADVANCE_HOURS), [])
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
  const cartCapacity = capacidadeDaCombinacao(cartItems)
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
      origin_text: pickup.trim() || undefined,   // local de embarque (o carrinho finaliza)
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
      <nav className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-1.5">
        <span>{t('transfersPg.breadcrumbHome', 'Início')}</span>
        <ChevronRight size={13} className="text-gray-300" />
        <span className="text-gray-500 font-medium">{t('transfersPg.breadcrumbTransfers', 'Transfers')}</span>
      </nav>
      <h1 className="text-[30px] font-extrabold text-gray-900 leading-tight">{t('transfersPg.title')}</h1>
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px] gap-6 mt-6 items-start">
          {/* ── ESQUERDA: escolha sua rota ── */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{t('transfersPg.chooseRoute', 'Escolha sua rota')}</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">{t('transfersPg.chooseRouteSub', 'Transfers privativos com operadores locais')}</p>
              </div>
              {routes.length > 0 && (
                <button
                  onClick={() => { setShowAllRoutes(v => !v); setRouteOrigin('') }}
                  className="text-[13px] font-bold text-brand hover:text-brand-600 shrink-0 flex items-center gap-1"
                >
                  {showAllRoutes ? t('transfersPg.seeLess') : t('transfersPg.seeAllRoutes', { total: routes.length })}
                  {!showAllRoutes && <span aria-hidden>→</span>}
                </button>
              )}
            </div>

            {/* Busca */}
            <div className="relative mt-4">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('transfersPg.searchOriginDest', 'Buscar origem ou destino')}
                className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-800 placeholder-gray-400 outline-none focus:border-brand focus:bg-white transition-colors"
              />
            </div>

            {/* Filtros por local de saída */}
            {originOptions.length > 1 && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => { setRouteOrigin(''); setShowAllRoutes(false) }}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${routeOrigin === '' ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                >
                  {t('transfersPg.originFilterAll')}
                </button>
                {originOptions.map(({ name, count }) => (
                  <button
                    key={name}
                    onClick={() => { setRouteOrigin(v => (v === name ? '' : name)); setShowAllRoutes(false) }}
                    className={`px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${routeOrigin === name ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                  >
                    {shortPlace(name)}{' '}
                    <span className={routeOrigin === name ? 'text-white/70' : 'text-gray-400'}>{count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Grade de rotas */}
            <div className="mt-4">
              {routesToShow.length === 0 && categoriasExclusivasShown.length === 0 ? (
                <p className="text-[13px] text-gray-400 text-center py-10">
                  {search.trim() ? t('transfersPg.noRoutesSearch', 'Nenhuma rota encontrada para essa busca.') : t('transfersPg.noRoutesFromHere')}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {routesToShow.map((r, i) => (
                    <RouteCard key={r.id} route={r} bg={GRADIENTS[i % GRADIENTS.length]} active={rotaEscolhida?.id === r.id} onSelect={() => escolherRota(r)} />
                  ))}
                </div>
              )}

              {categoriasExclusivasShown.map((cat) => {
                const rotasCat = cat.rotas.filter(bateBusca)
                if (!rotasCat.length) return null
                return (
                  <div key={cat.id} className="mt-6">
                    <div className="flex items-baseline gap-2 mb-3">
                      <h3 className="text-[15px] font-bold text-gray-900">{cat.nome}</h3>
                      <span className="text-[10px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-full">{t('transfersPg.exclusiveBadge')}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {rotasCat.map((r, i) => (
                        <RouteCard key={r.id} route={r} bg={GRADIENTS[i % GRADIENTS.length]} active={rotaEscolhida?.id === r.id} onSelect={() => escolherRota(r)} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── DIREITA: detalhes da viagem (sticky) ── */}
          <aside className="lg:sticky lg:top-20">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[18px] font-bold text-gray-900">{t('transfersPg.tripDetails', 'Detalhes da viagem')}</p>
              <p className="text-[13px] text-gray-500 mb-4">{t('transfersPg.tripDetailsSub', 'Personalize seu transfer')}</p>

              {/* Rota selecionada + inverter */}
              <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">{t('transfersPg.selectedRoute', 'Rota selecionada')}</p>
              <div className="flex items-stretch gap-2">
                <div className="flex-1 space-y-2 min-w-0">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.origin')}</label>
                    <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                      <div className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />
                      <select value={origin} onChange={e => { setRouteId(''); setOrigin(e.target.value); setDest(''); setCart({}) }} className="flex-1 min-w-0 bg-transparent text-[14px] font-semibold text-gray-800 outline-none cursor-pointer">
                        {!origin && <option value="">{t('transfersPg.selectOriginOption')}</option>}
                        {origins.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.destination')}</label>
                    <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-brand">
                      <MapPin size={13} className="text-gray-400 shrink-0" />
                      <select value={dest} onChange={e => { setRouteId(''); setDest(e.target.value); setCart({}) }} disabled={!dests.length} className="flex-1 min-w-0 bg-transparent text-[14px] font-semibold text-gray-800 outline-none cursor-pointer disabled:text-gray-400">
                        <option value="">{dests.length ? t('transfersPg.selectDestination') : t('transfersPg.chooseOriginFirst')}</option>
                        {dests.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <button onClick={inverterRota} title={t('transfersPg.swap', 'Inverter origem e destino')} className="self-center w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:border-brand hover:text-brand shrink-0 transition-colors">
                  <ArrowUpDown size={15} />
                </button>
              </div>

              {/* Data | Horário */}
              <div className="grid grid-cols-2 gap-3 mt-3">
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
                    <input type="time" value={time} min={minTime} onChange={e => setTime(e.target.value)} className="flex-1 min-w-0 bg-transparent text-[14px] font-semibold text-gray-800 outline-none" />
                  </div>
                </div>
              </div>

              {/* Passageiros */}
              <div className="mt-3">
                <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.passengersSection')}</label>
                <div className="mt-1 flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2">
                  <span className="flex items-center gap-2 text-[14px] font-semibold text-gray-800"><Users size={15} className="text-gray-400" /> {t('transfersPg.peopleCount', { count: people })}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPeople(p => Math.max(1, p - 1))} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"><Minus size={12} className="text-gray-600" /></button>
                    <button onClick={() => setPeople(p => Math.min(20, p + 1))} className="w-7 h-7 rounded-full bg-brand flex items-center justify-center"><Plus size={12} className="text-white" /></button>
                  </div>
                </div>
              </div>

              {/* Local de embarque */}
              <div className="mt-3">
                <label className="text-[11px] text-gray-400 font-semibold">{t('transfersPg.pickupLabel', 'Local de embarque')}</label>
                <div className="mt-1">
                  <PlaceInput value={pickup} onChange={setPickup} placeholder={t('transfersPg.pickupPlaceholder', 'Nome da pousada ou endereço')} dotClass="bg-transparent" />
                </div>
              </div>

              {/* Avisos de antecedência / temporada */}
              {matched && !advanceOk && (
                <p className="mt-3 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {t('transfersPg.minAdvanceNotice', { hours: MIN_ADVANCE_HOURS, datetime: format(minBookable, "d/MM 'às' HH:mm") })}
                </p>
              )}
              {matched && advanceOk && isHighSeasonIso(date, seasons) && (
                <p className="mt-3 flex items-center gap-2 text-[12px] text-amber-600">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /> {t('transfersPg.highSeasonNotice')}
                </p>
              )}

              {/* Escolha o veículo */}
              {vehicles.length > 0 && (
                <div className="mt-4">
                  <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">{t('transfersPg.chooseVehicle', 'Escolha o veículo')}</p>
                  <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-hidden">
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
                </div>
              )}

              {/* Preço */}
              <div className="border-t border-gray-100 mt-4 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] text-gray-500">{t('transfersPg.privateTransfer', 'Transfer privativo')}</p>
                  <p className="text-[13px] font-semibold text-gray-800">{cartTotal ? `R$ ${cartTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</p>
                </div>
                {seasonAddition > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] text-amber-600">{t('transfersPg.highSeasonFee')}</p>
                    <p className="text-[12px] font-semibold text-amber-600">+ R$ {seasonAddition.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div className="flex items-end justify-between pt-1">
                  <div>
                    <p className="text-[14px] font-bold text-gray-900">{t('transfersPg.estimatedTotal', 'Total estimado')}</p>
                    {cartItems.length > 0 && (
                      <p className="text-[11px] text-gray-400">
                        {(() => {
                          const nv = cartItems.reduce((s, { qty }) => s + qty, 0)
                          const vw = nv === 1 ? t('transfersPg.vehicleWord', 'veículo') : t('transfersPg.vehiclesWord', 'veículos')
                          const pw = people === 1 ? t('transfersPg.passengerWord', 'passageiro') : t('transfersPg.passengersWord', 'passageiros')
                          return `${nv} ${vw} · ${people} ${pw}`
                        })()}
                      </p>
                    )}
                  </div>
                  <p className={`text-[24px] font-extrabold ${canBook ? 'text-brand' : 'text-gray-400'}`}>
                    R$ {(grandTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Solicitar transfer */}
              <button
                onClick={handleConfirm}
                disabled={!canBook}
                className={`mt-4 w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all ${canBook ? 'bg-brand text-white hover:bg-brand-600 active:scale-[0.98] shadow-md shadow-brand/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
              >
                {!matched ? t('transfersPg.selectRoute')
                  : !cartItems.length ? t('transfersPg.selectVehicleOption')
                  : cartCapacity < people ? t('transfersPg.insufficientCapacity')
                  : !advanceOk ? t('transfersPg.minAdvanceShort', { hours: MIN_ADVANCE_HOURS })
                  : <>{t('transfersPg.requestTransfer', 'Solicitar transfer')} →</>}
              </button>

              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[12px] text-gray-400">
                <ShieldCheck size={14} className="text-emerald-500 shrink-0" /> {t('transfersPg.payAfterAccept', 'Você só paga após o aceite do operador.')}
              </p>

              <div className="border-t border-gray-50 mt-3 pt-3 flex items-center justify-center gap-5 text-[11px] text-gray-400">
                <span className="flex items-center gap-1"><Users size={12} /> {t('transfersPg.localOperators', 'Operadores locais')}</span>
                <span className="flex items-center gap-1"><Headphones size={12} /> {t('transfersPg.appSupport', 'Atendimento pelo app')}</span>
              </div>
            </div>
          </aside>
        </div>
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
