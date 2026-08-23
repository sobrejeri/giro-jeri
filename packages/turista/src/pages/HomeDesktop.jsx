import { useState, useMemo, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import DesktopDatePicker from '../components/DesktopDatePicker'
import {
  Star, Clock, Heart, ArrowRight, Compass, Car, Calendar, Users,
  ShieldCheck, MapPin, CalendarCheck, Headphones, Lock, RefreshCcw,
  ChevronRight, ChevronDown, Instagram, Send, Sparkles, HeartHandshake, Plane,
} from 'lucide-react'

const fmtPrice   = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`
const todayIso   = () => new Date().toISOString().slice(0, 10)

// Selos do hero — atendimento é 100% pela plataforma (sem WhatsApp)
const HERO_BADGES = [
  { icon: CalendarCheck, key: 'dailyDepartures' },
  { icon: RefreshCcw,    key: 'freeCancellation' },
  { icon: Headphones,    key: 'platformSupport' },
  { icon: Lock,          key: 'secureBooking' },
]

// Benefícios — bloco de confiança
const BENEFITS = [
  { icon: Headphones,    titleKey: 'localSupportTitle',  descKey: 'localSupportDesc' },
  { icon: Sparkles,      titleKey: 'quickBookingTitle',   descKey: 'quickBookingDesc' },
  { icon: Lock,          titleKey: 'securePayment',        descKey: 'securePaymentDesc' },
  { icon: RefreshCcw,    titleKey: 'freeCancellation',     descKey: 'freeCancelDesc' },
]

// Diferenciais do transfer
const TRANSFER_PERKS = [
  { icon: Car,           key: 'comfortableVehicles' },
  { icon: Users,         key: 'experiencedDrivers' },
  { icon: Clock,         key: 'guaranteedPunctuality' },
  { icon: ShieldCheck,   key: 'onlineBooking' },
]

// Gradientes de fallback quando um tour não tem foto de capa
const FALLBACK_GRADIENTS = [
  'from-orange-400 via-orange-300 to-amber-200',
  'from-teal-500 via-cyan-400 to-blue-300',
  'from-amber-500 via-orange-400 to-pink-300',
  'from-emerald-500 via-teal-400 to-cyan-300',
  'from-rose-500 via-orange-400 to-amber-300',
  'from-indigo-500 via-purple-400 to-pink-300',
]

// Tags candidatas — pega a primeira em minúsculo pra bater com a seção
function tagFor(tour, fallback) {
  if (Array.isArray(tour.tags) && tour.tags.length) return tour.tags[0]
  return fallback
}

/* ── Card grande "Mais procurados" ─────────────────────────── */
function HeroTourCard({ tour, tag, gradient, onClick }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all"
    >
      <div className="relative h-[210px] overflow-hidden">
        {tour?.cover_image_url ? (
          <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        {tag && (
          <span className="absolute top-3 left-3 bg-brand text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-md">
            {tag}
          </span>
        )}
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <p className="font-extrabold text-[17px] leading-tight drop-shadow-md line-clamp-1">{tour?.name || t('homePg.defaultTourName')}</p>
          <p className="text-[12px] text-white/85 line-clamp-1 mt-0.5 drop-shadow">
            {tour?.short_description || t('homePg.defaultTourDesc')}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-3.5">
        <div>
          {Number(tour?.shared_price_per_person) > 0 ? (
            <>
              <p className="text-[11px] text-gray-400 leading-none">{t('homePg.fromLabel')}</p>
              <p className="text-brand font-extrabold text-[17px] leading-tight mt-0.5">
                {fmtPrice(tour.shared_price_per_person)}
                <span className="text-[11px] text-gray-400 font-medium"> {t('homePg.perPerson')}</span>
              </p>
            </>
          ) : (
            <p className="text-brand font-bold text-[14px]">{t('homePg.checkPrices')}</p>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-brand font-semibold text-[13px] border border-brand/20 bg-brand/5 hover:bg-brand/10 rounded-lg px-3 py-1.5 transition-colors">
          {t('homePg.viewDetails')} <ArrowRight size={13} />
        </span>
      </div>
    </button>
  )
}

/* ── Card menor "Experiências em destaque" ─────────────────── */
function MiniTourCard({ tour, isFav, onToggleFav, gradient, onClick }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div className="relative h-36 overflow-hidden">
        {tour?.cover_image_url ? (
          <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient}`} />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav?.(tour.id) }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/95 hover:bg-white shadow-sm flex items-center justify-center transition-colors"
        >
          <Heart size={14} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-500'} />
        </button>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-[13px] leading-tight line-clamp-1">{tour?.name}</p>
        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-1">
          {tour?.duration_hours && (
            <span className="inline-flex items-center gap-1"><Clock size={11} />{tour.duration_hours}h</span>
          )}
          {tour?.rating_average > 0 && (
            <span className="inline-flex items-center gap-1"><Star size={11} className="text-amber-400 fill-amber-400" />{tour.rating_average}</span>
          )}
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-gray-50 flex items-end justify-between gap-2">
          {Number(tour?.shared_price_per_person) > 0 ? (
            <div>
              <p className="text-[10px] text-gray-400 leading-none">{t('homePg.fromLabel')}</p>
              <p className="text-brand font-extrabold text-[15px] leading-tight mt-0.5">{fmtPrice(tour.shared_price_per_person)}</p>
            </div>
          ) : (
            <p className="text-[12px] text-brand font-bold">{t('homePg.checkPrices')}</p>
          )}
          <span className="text-[11px] text-brand font-semibold">{t('homePg.reserveArrow')}</span>
        </div>
      </div>
    </button>
  )
}

/* ── Card de rota de transfer em destaque (Serviços em destaque) ── */
function RouteMiniCard({ route, gradient, onClick }) {
  const { t } = useTranslation()
  const price = Number(route.default_price) || 0
  return (
    <button
      onClick={onClick}
      className="group text-left bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div className="relative h-36 overflow-hidden">
        {route.cover_image_url ? (
          <img
            src={route.cover_image_url} alt="" loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <Plane size={40} className="text-white/30" />
          </div>
        )}
        <span className="absolute top-2 left-2 bg-black/35 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
          {t('homePg.transferBadge')}
        </span>
      </div>
      <div className="p-3.5">
        <p className="font-bold text-gray-900 text-[13px] leading-tight line-clamp-2">
          {route.origin_name} → {route.destination_name}
        </p>
        <div className="mt-2.5 pt-2.5 border-t border-gray-50 flex items-end justify-between gap-2">
          {price > 0 ? (
            <div>
              <p className="text-[10px] text-gray-400 leading-none">{t('homePg.privateFromLabel')}</p>
              <p className="text-brand font-extrabold text-[15px] leading-tight mt-0.5">{fmtPrice(price)}</p>
            </div>
          ) : (
            <p className="text-[12px] text-brand font-bold">{t('homePg.checkPrices')}</p>
          )}
          <span className="text-[11px] text-brand font-semibold">{t('homePg.reserveArrow')}</span>
        </div>
      </div>
    </button>
  )
}

export default function HomeDesktop({
  tours = [], featured = [], isLoading, favs, toggleFav,
  bannerImg = null, bannerTitle = null, bannerSubtitle = null,
  partners = [], featuredRoutes = [],
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { region, openPicker } = useRegion()

  // Nome do lugar dinâmico — segue SEMPRE a região atual do app (localização
  // selecionada/detectada). O título do banner do admin fica só como reserva
  // quando ainda não há região, para o hero e "Mais procurados em…" baterem
  // com o lugar escolhido (ex.: Cruz → "Viva o melhor de CRUZ").
  const placeName  = region?.name || bannerTitle || 'Jericoacoara'
  const placeShort = /jericoacoara/i.test(placeName) ? 'Jeri' : placeName

  // Estado do box de busca
  const [tab,       setTab]       = useState('passeios') // 'passeios' | 'transfers'
  const [tourId,    setTourId]    = useState('')          // passeio escolhido (dropdown)
  const [tOrigin,   setTOrigin]   = useState('')          // transfer: saindo de
  const [tDest,     setTDest]     = useState('')          // transfer: para onde
  const [date,      setDate]      = useState(todayIso())
  const [people,    setPeople]    = useState(2)

  const list = useMemo(() => {
    const src = featured?.length ? featured : tours
    return (Array.isArray(src) ? src : []).filter((t) => t)
  }, [tours, featured])

  // Opções do dropdown de passeios — catálogo real da região
  const tourOptions = useMemo(() => {
    const src = (Array.isArray(tours) && tours.length ? tours : list).filter((t) => t?.id && t?.name)
    return [...src].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [tours, list])

  // Alta temporada: datas exatas em laranja no calendário da busca.
  const { data: seasonsData } = useQuery({
    queryKey: ['seasons', region?.id],
    queryFn:  () => api.getSeasons(region?.id ? { region_id: region.id } : {}),
    staleTime: 10 * 60 * 1000,
    retry: 3,
  })
  const seasons = Array.isArray(seasonsData) ? seasonsData : []

  // Rotas predefinidas de transfer — alimentam os dropdowns "Saindo de" / "Para onde?"
  const { data: routesData } = useQuery({
    queryKey: ['transfer-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })
  const routes = Array.isArray(routesData?.routes) ? routesData.routes
               : Array.isArray(routesData) ? routesData : []

  // Avaliações REAIS (mais recentes) — reputação das cooperativas. Se ainda
  // não houver nenhuma, a seção some (nada de depoimento inventado).
  const { data: reviewsData } = useQuery({
    queryKey: ['home-reviews'],
    queryFn:  () => api.getCoopReviews({ limit: 6 }),
    staleTime: 60_000,
  })
  const homeReviews = Array.isArray(reviewsData?.reviews) ? reviewsData.reviews : []
  const routeOrigins = useMemo(() => [...new Set(routes.map((r) => r.origin_name))], [routes])
  const routeDests   = useMemo(
    () => [...new Set(routes.filter((r) => r.origin_name === tOrigin).map((r) => r.destination_name))],
    [routes, tOrigin],
  )

  // Origem padrão do transfer: prefere a região atual, senão Jericoacoara
  useEffect(() => {
    if (tOrigin || !routeOrigins.length) return
    const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    setTOrigin(
      routeOrigins.find((o) => region?.name && norm(o).includes(norm(region.name)))
      || routeOrigins.find((o) => /jeri/i.test(o))
      || routeOrigins[0],
    )
  }, [routeOrigins, tOrigin, region?.name])

  // Se trocar a origem, o destino escolhido pode não existir mais na rota
  useEffect(() => {
    if (tDest && !routeDests.includes(tDest)) setTDest('')
  }, [routeDests, tDest])

  const topThree = list.slice(0, 3)
  const gridRest = list.slice(3, 9)
  const heroImg  = bannerImg || list.find((t) => t.cover_image_url)?.cover_image_url || null

  function handleSearch() {
    if (tab === 'transfers') {
      navigate('/transfers', { state: { origin: tOrigin, dest: tDest, date, people } })
    } else {
      navigate('/passeios', { state: { selectedId: tourId || undefined, date, people } })
    }
  }

  return (
    <div className="w-full">
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {heroImg ? (
          <img src={heroImg} alt={placeName} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-amber-400 to-cyan-500" />
        )}
        {/* Overlay para dar leitura */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        <div className="relative z-10 max-w-[1520px] mx-auto px-10 xl:px-16 pt-14 pb-44">
          <p className="text-orange-300 text-[19px] italic font-semibold tracking-wide drop-shadow-md">
            {t('homePg.heroPrefix')}
          </p>
          <h1 className="mt-1 text-white font-extrabold uppercase leading-[0.95] tracking-tight text-[54px] xl:text-[64px] drop-shadow-2xl break-words">
            {placeName}
          </h1>
          <p className="mt-4 text-white/90 text-[16px] leading-relaxed max-w-[440px] drop-shadow">
            {bannerSubtitle || t('homePg.heroDesc')}
          </p>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5">
            {HERO_BADGES.map(({ icon: Icon, key }) => (
              <div key={key} className="inline-flex items-center gap-2 text-white/90 text-[13px] font-medium">
                <span className="w-6 h-6 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
                  <Icon size={12} className="text-white" />
                </span>
                {t(`homePg.${key}`)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOX DE BUSCA (sobreposto) ────────────────────────── */}
      <div className="relative z-20 -mt-28 max-w-[1280px] mx-auto px-10">
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
          {/* Abas */}
          <div className="flex items-center gap-1 px-3 pt-3">
            {[
              { id: 'passeios',  icon: Compass, labelKey: 'toursCardTitle' },
              { id: 'transfers', icon: Car,     labelKey: 'transfersCardTitle' },
            ].map(({ id, icon: Icon, labelKey }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-[14px] font-semibold transition-colors ${
                    active ? 'bg-white text-brand shadow-inner border-x border-t border-gray-100' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-brand' : 'text-gray-400'} />
                  {t(`homePg.${labelKey}`)}
                </button>
              )
            })}
          </div>

          {/* Campos — min-w-0 + truncate mantêm o conteúdo dentro do box */}
          <div className="grid grid-cols-12 gap-3 p-4 pt-3 border-t border-gray-100">
            {tab === 'transfers' ? (
              <div className="col-span-3 min-w-0 flex flex-col gap-0.5 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 focus-within:border-brand transition-colors">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('homePg.leavingFrom')}</label>
                <div className="relative w-full min-w-0">
                  <select
                    value={tOrigin}
                    onChange={(e) => setTOrigin(e.target.value)}
                    className="text-[14px] font-semibold text-gray-800 bg-transparent outline-none appearance-none w-full min-w-0 truncate pr-6 cursor-pointer"
                  >
                    {routeOrigins.length === 0 && <option value="">{t('homePg.loadingRoutes')}</option>}
                    {routeOrigins.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openPicker}
                className="col-span-3 min-w-0 flex flex-col gap-0.5 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors text-left"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('homePg.leavingFrom')}</span>
                <span className="flex items-center gap-1.5 min-w-0">
                  <MapPin size={13} className="text-brand shrink-0" />
                  <span className="text-[14px] font-semibold text-gray-800 truncate">{region?.name || t('homePg.selectRegion')}</span>
                  <ChevronDown size={14} className="text-gray-400 shrink-0 ml-auto" />
                </span>
              </button>
            )}
            <div className="col-span-3 min-w-0 flex flex-col gap-0.5 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 focus-within:border-brand transition-colors">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                {tab === 'transfers' ? t('homePg.whereTo') : t('homePg.chooseTour')}
              </label>
              <div className="relative w-full min-w-0">
                {tab === 'transfers' ? (
                  <select
                    value={tDest}
                    onChange={(e) => setTDest(e.target.value)}
                    className="text-[14px] font-semibold text-gray-800 bg-transparent outline-none appearance-none w-full min-w-0 truncate pr-6 cursor-pointer"
                  >
                    <option value="">{routeDests.length ? t('homePg.selectDestination') : t('homePg.chooseOriginFirst')}</option>
                    {routeDests.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={tourId}
                    onChange={(e) => setTourId(e.target.value)}
                    className="text-[14px] font-semibold text-gray-800 bg-transparent outline-none appearance-none w-full min-w-0 truncate pr-6 cursor-pointer"
                  >
                    <option value="">{t('homePg.allTours')}</option>
                    {tourOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                  </select>
                )}
                <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="col-span-2 min-w-0 flex flex-col gap-0.5 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 focus-within:border-brand transition-colors">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('homePg.dateLabel')}</label>
              <DesktopDatePicker
                valueIso={date}
                onChange={setDate}
                minIso={todayIso()}
                seasons={seasons}
              />
            </div>
            <div className="col-span-2 min-w-0 flex flex-col gap-0.5 px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 focus-within:border-brand transition-colors">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">{t('homePg.peopleLabel')}</label>
              <div className="relative w-full min-w-0">
                <select
                  value={people}
                  onChange={(e) => setPeople(Number(e.target.value))}
                  className="text-[14px] font-semibold text-gray-800 bg-transparent outline-none appearance-none w-full min-w-0 truncate pr-6 cursor-pointer"
                >
                  {[1,2,3,4,5,6,7,8,9,10,12,15,20].map((n) => (
                    <option key={n} value={n}>{n} {t(n !== 1 ? 'homePg.personPlural' : 'homePg.personSingular')}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="col-span-2 min-w-0 flex">
              <button
                onClick={handleSearch}
                className="w-full h-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-600 text-white font-bold text-[14px] rounded-xl px-4 py-3 transition-colors shadow-md shadow-brand/30"
              >
                <span className="truncate">{t('homePg.searchNow')}</span> <ArrowRight size={16} className="shrink-0" />
              </button>
            </div>
          </div>

          {/* Selinhos abaixo do box */}
          <div className="flex items-center justify-center gap-8 text-[12px] text-gray-500 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-brand" /> {t('homePg.bestPriceGuaranteed')}</span>
            <span className="inline-flex items-center gap-1.5"><Lock size={13} className="text-brand" /> {t('homePg.securePayment')}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarCheck size={13} className="text-brand" /> {t('homePg.onlineBooking')}</span>
          </div>
        </div>
      </div>

      {/* ── MAIS PROCURADOS EM JERI ──────────────────────────── */}
      <section className="mt-14 w-full max-w-[1520px] mx-auto px-10 xl:px-16">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-[28px] font-extrabold text-gray-900 leading-tight">{t('homePg.mostSoughtTitle', { place: placeShort })}</h2>
            <p className="text-[13px] text-gray-500 mt-1">{t('homePg.mostSoughtSubtitle')}</p>
          </div>
          <Link to="/passeios" className="hidden lg:inline-flex items-center gap-1 text-[14px] font-semibold text-brand hover:gap-1.5 transition-all">
            {t('homePg.viewAllExperiences')} <ArrowRight size={16} />
          </Link>
        </div>
        {isLoading ? (
          <div className="h-56 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : topThree.length === 0 ? (
          <div className="text-center text-gray-400 py-12 border border-dashed border-gray-200 rounded-2xl">
            {t('homePg.noToursInRegion')}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {topThree.map((tour, i) => (
              <HeroTourCard
                key={tour.id}
                tour={tour}
                tag={tagFor(tour, [t('homePg.tagBestSeller'), t('homePg.tagAdventure'), t('homePg.tagSunset')][i])}
                gradient={FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length]}
                onClick={() => navigate(`/passeios/${tour.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── SERVIÇOS EM DESTAQUE (passeios + rotas de transfer) ── */}
      <section className="mt-14 w-full max-w-[1520px] mx-auto px-10 xl:px-16">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="text-[24px] font-extrabold text-gray-900">{t('homePg.featuredServicesTitle')}</h2>
            <p className="text-[13px] text-gray-500 mt-1">{t('homePg.featuredServicesSubtitle')}</p>
          </div>
          <Link to="/passeios" className="inline-flex items-center gap-1 text-[14px] font-semibold text-brand hover:gap-1.5 transition-all">
            {t('homePg.viewAllTours')} <ArrowRight size={16} />
          </Link>
        </div>
        {gridRest.length === 0 && featuredRoutes.length === 0 && !isLoading ? (
          <div className="text-center text-gray-400 py-8 border border-dashed border-gray-200 rounded-2xl">
            {t('homePg.comingSoonTours')}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {gridRest.map((tour, i) => (
              <MiniTourCard
                key={tour.id}
                tour={tour}
                isFav={favs?.has?.(tour.id)}
                onToggleFav={toggleFav}
                gradient={FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length]}
                onClick={() => navigate(`/passeios/${tour.id}`)}
              />
            ))}
            {featuredRoutes.map((r, i) => (
              <RouteMiniCard
                key={`route-${r.id}`}
                route={r}
                gradient={FALLBACK_GRADIENTS[(i + 1) % FALLBACK_GRADIENTS.length]}
                onClick={() => navigate('/transfers', { state: { origin: r.origin_name, dest: r.destination_name } })}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── FAIXA DE TRANSFERS ──────────────────────────────── */}
      <section className="mt-14 w-full max-w-[1520px] mx-auto px-10 xl:px-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d3b46] via-[#155e75] to-[#1c8ba3] p-10 lg:p-12">
          {/* Ornamentos */}
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/5" />
          <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-white/5" />

          <div className="relative grid grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-white font-extrabold text-[32px] leading-tight">
                {t('homePg.transferBannerTitle', { place: placeName })} <br /><span className="italic text-orange-300">{t('homePg.transferBannerSubtitle')}</span>
              </h2>
              <p className="text-white/85 text-[15px] mt-4 leading-relaxed max-w-md">
                {t('homePg.transferBannerDesc')}
              </p>
              <button
                onClick={() => navigate('/transfers')}
                className="mt-6 inline-flex items-center gap-2 bg-brand hover:bg-brand-600 text-white font-bold text-[14px] px-6 py-3 rounded-xl transition-colors shadow-lg shadow-black/20"
              >
                {t('homePg.viewTransfers')} <ArrowRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2.5 relative z-10">
              {TRANSFER_PERKS.map(({ icon: Icon, key }) => (
                <div key={key} className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10">
                  <div className="w-9 h-9 rounded-lg bg-brand/90 flex items-center justify-center">
                    <Icon size={17} className="text-white" />
                  </div>
                  <p className="text-white font-semibold text-[14px]">{t(`homePg.${key}`)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BENEFÍCIOS ───────────────────────────────────────── */}
      <section id="sobre" className="mt-14 w-full max-w-[1520px] mx-auto px-10 xl:px-16">
        <div className="grid grid-cols-4 gap-4">
          {BENEFITS.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="w-12 h-12 rounded-xl bg-brand/10 flex items-center justify-center mb-4">
                <Icon size={22} className="text-brand" />
              </div>
              <p className="font-extrabold text-gray-900 text-[15px]">{t(`homePg.${titleKey}`)}</p>
              <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{t(`homePg.${descKey}`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COOPERATIVAS PARCEIRAS ───────────────────────────── */}
      {partners.length > 0 && (
        <section className="mt-14 w-full max-w-[1520px] mx-auto px-10 xl:px-16">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <HeartHandshake size={20} className="text-teal-600" />
              </div>
              <div>
                <h2 className="text-[20px] font-extrabold text-gray-900 leading-tight">{t('homePg.partnersTitle')}</h2>
                <p className="text-[13px] text-gray-400">{t('homePg.partnersDescDesktop')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {partners.map((p) => (
                <Link key={p.id} to={`/avaliacoes?operator=${p.id}`}
                  className="flex items-center gap-2.5 bg-gray-50 hover:bg-gray-100 rounded-full pl-1.5 pr-4 py-1.5 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
                    {p.profile_photo_url
                      ? <img src={p.profile_photo_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-gray-500">{(p.full_name || '?')[0].toUpperCase()}</div>}
                  </div>
                  <span className="text-[13px] font-semibold text-gray-700">{p.full_name}</span>
                  {Number(p.rating_count) > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[12px] font-bold text-amber-600">
                      <Star size={11} className="fill-amber-400 text-amber-400" />
                      {p.rating_average}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── DEPOIMENTOS (REAIS) ──────────────────────────────── */}
      {homeReviews.length > 0 && (
        <section className="mt-16 w-full max-w-[1520px] mx-auto px-10 xl:px-16">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="text-[26px] font-extrabold text-gray-900">{t('homePg.testimonialsTitle')}</h2>
              <p className="text-[13px] text-gray-500 mt-1">{t('homePg.testimonialsSubtitle', { place: placeShort })}</p>
            </div>
            <Link to="/avaliacoes" className="text-[14px] font-semibold text-brand inline-flex items-center gap-1 hover:gap-1.5 transition-all">
              {t('homePg.viewMoreReviews')} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-5">
            {homeReviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col">
                <div className="flex items-center gap-1 mb-3">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} size={16}
                      className={s <= r.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
                  ))}
                </div>
                {r.comment
                  ? <p className="text-gray-700 text-[14px] leading-relaxed">"{r.comment}"</p>
                  : <p className="text-gray-400 text-[14px] italic">{t(r.rating > 1 ? 'homePg.ratedWithStarsPlural' : 'homePg.ratedWithStarsSingular', { rating: r.rating })}</p>}
                <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-3">
                  {r.author_photo
                    ? <img src={r.author_photo} alt={r.author_name} className="w-9 h-9 rounded-full object-cover" />
                    : <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-300 flex items-center justify-center text-white font-bold text-[13px]">
                        {String(r.author_name || 'T')[0]}
                      </div>}
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 leading-tight truncate">{r.author_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {r.service_name}{r.operator_name ? ` · ${r.operator_name}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── CTA FINAL ────────────────────────────────────────── */}
      <section className="mt-16 w-full max-w-[1520px] mx-auto px-10 xl:px-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1c8ba3] via-[#0d3b46] to-[#0a2e37] p-10 lg:p-12">
          <div className="absolute -top-16 -right-10 w-64 h-64 rounded-full bg-brand/20 blur-2xl" />
          <div className="relative flex items-center justify-between gap-8">
            <div className="max-w-2xl">
              <h2 className="text-white font-extrabold text-[28px] leading-tight">
                {t('homePg.ctaFinalTitle', { place: placeName })}
              </h2>
              <p className="text-white/85 text-[15px] mt-3">
                {t('homePg.ctaFinalDesc')}
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <button
                onClick={() => navigate('/passeios')}
                className="inline-flex items-center gap-2 bg-brand hover:bg-brand-600 text-white font-bold text-[15px] px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-black/30"
              >
                {t('homePg.startBooking')} <ArrowRight size={16} />
              </button>
              <div className="hidden xl:flex items-center gap-2 text-white/80 text-[12px] max-w-[180px] leading-snug">
                <Lock size={16} className="text-brand shrink-0" />
                {t('homePg.trackBookingPlatform')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="mt-16 border-t border-gray-100 pt-10 pb-8 bg-white">
        <div className="max-w-[1520px] mx-auto px-10 xl:px-16">
        <div className="grid grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-8 h-8 rounded-lg" />
              <p className="font-giro font-bold text-[15px] text-gray-900 tracking-wide">TURIVA</p>
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed">
              {t('homePg.footerDesc')}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <a href="#" className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors" aria-label="Instagram">
                <Instagram size={14} className="text-gray-600" />
              </a>
            </div>
          </div>

          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-3">{t('homePg.footerExploreTitle')}</p>
            <ul className="space-y-2 text-[13px] text-gray-500">
              <li><Link to="/passeios"  className="hover:text-brand transition-colors">{t('homePg.toursCardTitle')}</Link></li>
              <li><Link to="/transfers" className="hover:text-brand transition-colors">{t('homePg.transfersCardTitle')}</Link></li>
              <li><Link to="/eventos"   className="hover:text-brand transition-colors">{t('homePg.discoverVillage')}</Link></li>
              <li><Link to="/minhas-reservas" className="hover:text-brand transition-colors">{t('homePg.footerMyBookings')}</Link></li>
              <li><Link to="/afiliado"  className="hover:text-brand transition-colors">{t('homePg.footerAffiliate')}</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-3">{t('homePg.footerCategoriesTitle')}</p>
            <ul className="space-y-2 text-[13px] text-gray-500">
              <li><span className="hover:text-brand transition-colors cursor-pointer">{t('homePg.categoryPrivateTours')}</span></li>
              <li><span className="hover:text-brand transition-colors cursor-pointer">{t('homePg.categorySharedTours')}</span></li>
              <li><span className="hover:text-brand transition-colors cursor-pointer">{t('homePg.categoryAirportTransfer')}</span></li>
              <li><span className="hover:text-brand transition-colors cursor-pointer">{t('homePg.categoryCustomTransfer')}</span></li>
            </ul>
          </div>

          <div>
            <p className="text-[13px] font-bold text-gray-900 mb-3">{t('homePg.footerSupportTitle')}</p>
            <ul className="space-y-2 text-[13px] text-gray-500">
              <li>
                <Link to="/minhas-reservas" className="hover:text-brand transition-colors inline-flex items-center gap-1.5">
                  <Send size={12} /> {t('homePg.bookingCenter')}
                </Link>
              </li>
              <li><Link to="/termos"     className="hover:text-brand transition-colors">{t('homePg.termsOfUse')}</Link></li>
              <li><Link to="/privacidade" className="hover:text-brand transition-colors">{t('homePg.privacyPolicy')}</Link></li>
              <li>
                <button onClick={openPicker} className="hover:text-brand transition-colors inline-flex items-center gap-1.5">
                  <MapPin size={12} /> {region?.name || t('homePg.selectRegion')}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5 flex items-center justify-between text-[11px] text-gray-400">
          <p>{t('homePg.footerCopyright', { year: new Date().getFullYear() })}</p>
          <p>{t('homePg.footerMadeWithPrefix')} <span className="text-brand">♥</span> {t('homePg.footerMadeWithSuffix')}</p>
        </div>
        </div>
      </footer>
    </div>
  )
}
