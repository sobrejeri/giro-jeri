import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useAuth } from '../contexts/AuthContext'
import { useFavorites } from '../contexts/FavoritesContext'
import InstallPrompt from '../components/InstallPrompt'
import {
  Bell, Star, Heart, ChevronRight, ArrowRight,
  MapPin, Compass, Car, Users, Calendar, Zap, Plane,
  Sparkles, CalendarCheck, HeartHandshake,
} from 'lucide-react'
import { format, startOfDay } from 'date-fns'
import HomeDesktop from './HomeDesktop'
import NotificationBell from '../components/NotificationBell'

function suggestVehicle(vehicles, people) {
  if (!vehicles.length) return null
  const single = vehicles.filter(v => v.seat_capacity >= people)
                         .sort((a, b) => a.seat_capacity - b.seat_capacity)[0]
  if (single) return { vehicle: single, qty: 1 }
  const biggest = [...vehicles].sort((a, b) => b.seat_capacity - a.seat_capacity)[0]
  if (!biggest) return null
  return { vehicle: biggest, qty: Math.ceil(people / biggest.seat_capacity) }
}

const GRADIENTS = [
  ['from-orange-400', 'to-amber-300'],
  ['from-sky-400',    'to-blue-300'],
  ['from-teal-400',   'to-emerald-300'],
  ['from-violet-400', 'to-purple-300'],
]
function gi(id = '') {
  let n = 0; for (let i = 0; i < id.length; i++) n += id.charCodeAt(i)
  return n % GRADIENTS.length
}

const BADGE_COLORS = {
  'Mais Vendido': 'bg-orange-500',
  'Imperdível':   'bg-amber-500',
  'Família':      'bg-teal-600',
  'Aventura':     'bg-green-500',
}

function TourCard({ tour, isFav, onToggleFav }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [from, to] = GRADIENTS[gi(tour.id)]
  const badgeColor = BADGE_COLORS[tour.highlight_badge] || 'bg-gray-500'

  async function handleClick() {
    if (loading) return
    setLoading(true)
    try {
      const vehicles = await api.getTourVehicles(tour.id)
      const vList    = Array.isArray(vehicles) ? vehicles : []
      const suggested = suggestVehicle(vList, 2)
      const today     = startOfDay(new Date())
      const totalPrice = suggested ? Number(suggested.vehicle.base_price) * suggested.qty : 0

      navigate('/checkout/resumo', {
        state: {
          service_name:     tour.name,
          short_description: tour.short_description || null,
          service_type:     'tour',
          booking_mode:     'private',
          service_date:     'Hoje',
          service_date_iso: format(today, 'yyyy-MM-dd'),
          service_time:     'A confirmar',
          people_count:     2,
          origin_text:      'Centro de Jericoacoara',
          vehicle_name:     suggested ? `${suggested.qty}x ${suggested.vehicle.name}` : '',
          total_price:      totalPrice,
          breakdown:        suggested ? { [`${suggested.qty}x ${suggested.vehicle.name}`]: totalPrice } : {},
          cover_image_url:       tour.cover_image_url || null,
          region_id:             tour.regions?.id,
          service_id:            tour.id,
          vehicles:              suggested ? [{ vehicle_id: suggested.vehicle.id, qty: suggested.qty }] : [],
          booking_cutoff_time:   tour.booking_cutoff_time || null,
          open_editing:          true,
        },
      })
    } catch {
      navigate('/passeios', { state: { selectedId: tour.id } })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`shrink-0 w-[158px] lg:w-auto rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 transition-transform cursor-pointer ${loading ? 'opacity-70 scale-[0.96]' : 'active:scale-[0.96]'}`}
    >
      <div className="h-[108px] lg:h-44 relative overflow-hidden">
        {tour.cover_image_url ? (
          <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`h-full bg-gradient-to-br ${from} ${to} flex items-center justify-center`}>
            <Zap size={36} className="text-white/20" />
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {tour.highlight_badge && !loading && (
          <span className={`absolute top-2 left-2 ${badgeColor} text-white text-[9px] font-bold px-2 py-[3px] rounded-full`}>
            {tour.highlight_badge}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(tour.id) }}
          className="absolute top-2 right-2 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        >
          <Heart size={11} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
        </button>
      </div>

      <div className="p-2.5">
        <p className="text-[12px] font-bold text-gray-900 leading-tight line-clamp-1 mb-1">{tour.name}</p>
        {tour.short_description ? (
          <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{tour.short_description}</p>
        ) : tour.rating_average > 0 ? (
          <div className="flex items-center gap-0.5">
            <Star size={10} className="text-amber-400 fill-amber-400" />
            <span className="text-[10px] font-semibold text-gray-600">{tour.rating_average}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const QUICK = [
  { icon: Compass,  bg: 'bg-orange-50', ic: 'text-brand',      title: 'Passeio Privativo', desc: 'Exclusivo para seu grupo',   route: '/passeios'  },
  { icon: Users,    bg: 'bg-teal-50',   ic: 'text-teal-600',   title: 'Compartilhado',     desc: 'Divida com outros turistas', route: '/passeios', state: { mode: 'shared' } },
  { icon: Plane,    bg: 'bg-blue-50',   ic: 'text-blue-600',   title: 'Transfer',           desc: 'Aeroporto & hotel',          route: '/transfers' },
  { icon: Calendar, bg: 'bg-purple-50', ic: 'text-purple-600', title: 'Minhas Reservas',    desc: 'Acompanhe seus passeios',    route: '/minhas-reservas'  },
]

function FeaturedCarousel({ items, favs, onToggleFav }) {
  const scrollRef = useRef(null)
  const idxRef    = useRef(0)
  const [dotIdx, setDotIdx]   = useState(0)
  const n = items.length

  // Duplicar slides para loop seamless
  const slides = useMemo(() => (n > 1 ? [...items, ...items] : items), [items, n])

  useEffect(() => {
    if (n <= 1) return
    const tick = () => {
      const el = scrollRef.current
      if (!el) return
      const next = idxRef.current + 1
      const child = el.children[next]
      if (!child) return
      el.scrollTo({ left: child.offsetLeft - 16, behavior: 'smooth' })
      idxRef.current = next
      setDotIdx(next % n)
      // Chegou no clone → volta instantâneo para o original (sem animação visível)
      if (next >= n) {
        setTimeout(() => {
          const orig = el.children[next - n]
          if (orig) el.scrollTo({ left: orig.offsetLeft - 16, behavior: 'instant' })
          idxRef.current = next - n
        }, 420)
      }
    }
    const t = setInterval(tick, 4000)
    return () => clearInterval(t)
  }, [n])

  if (n === 0) return null

  return (
    <div className="-mx-4">
      <div ref={scrollRef} className="flex gap-2 overflow-x-hidden px-4">
        {slides.map((tour, i) => (
          <div key={`${tour.id}-${i}`} className="shrink-0">
            <TourCard tour={tour} isFav={favs.has(tour.id)} onToggleFav={onToggleFav} />
          </div>
        ))}
      </div>
      {n > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {items.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === dotIdx ? 'w-5 bg-brand' : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const STEPS = [
  { n: 1, color: 'bg-brand',        title: 'Escolha seu passeio',   desc: 'Selecione o destino e tipo de reserva'     },
  { n: 2, color: 'bg-[#1A4D5F]',   title: 'Configure os detalhes', desc: 'Informe data, horário e número de pessoas' },
  { n: 3, color: 'bg-emerald-500',  title: 'Confirme e pague',      desc: 'Reserva garantida em poucos minutos'       },
]

export default function Home() {
  const navigate = useNavigate()
  const { region, openPicker, userCoords, getServiceQuery } = useRegion()
  const { user } = useAuth()
  const { favs, toggleFav } = useFavorites()

  const geo = getServiceQuery()
  // Arredonda as coordenadas (~1 km) na chave para o GPS não recarregar a lista
  // a cada micro-variação.
  const coarseLat = userCoords?.lat != null ? Math.round(userCoords.lat * 100) / 100 : null
  const coarseLon = userCoords?.lon != null ? Math.round(userCoords.lon * 100) / 100 : null
  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'home', region?.id, coarseLat, coarseLon],
    queryFn:  () => api.getTours({ limit: 12, ...geo }),
  })

  const tours    = toursData?.tours || toursData || []
  const featured = (tours.filter((t) => t.is_featured).length > 0
    ? tours.filter((t) => t.is_featured) : tours).slice(0, 10)

  // Cold start do Render free: avisa que o servidor está acordando
  const [slowLoad, setSlowLoad] = useState(false)
  useEffect(() => {
    if (!isLoading) { setSlowLoad(false); return }
    const t = setTimeout(() => setSlowLoad(true), 5000)
    return () => clearTimeout(t)
  }, [isLoading])

  // Banner da home configurável pelo admin
  const { data: settings } = useQuery({
    queryKey: ['public-settings'],
    queryFn:  () => api.getPublicSettings(),
    staleTime: 5 * 60 * 1000,
  })
  const bannerImg      = settings?.home_banner_image_url || null
  const bannerTitle    = settings?.home_banner_title     || null
  const bannerSubtitle = settings?.home_banner_subtitle  || null

  // Layout da home fixado no 'novo' (redesign UX) — definitivo.
  const homeLayout = 'novo'

  // Cooperativas parceiras (vitrine de confiança)
  const { data: partners = [] } = useQuery({
    queryKey: ['partners'],
    queryFn:  () => api.getPartners(),
    staleTime: 10 * 60 * 1000,
  })

  // Estado de "Minhas Reservas" na home (continuidade) — só se logado
  const { data: myBookingsRaw } = useQuery({
    queryKey: ['home-bookings'],
    queryFn:  () => api.getMyBookings(),
    enabled:  !!user,
    staleTime: 60_000,
  })
  const todayStr    = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const myBookings  = Array.isArray(myBookingsRaw) ? myBookingsRaw : (myBookingsRaw?.data || [])
  const upcomingCnt = myBookings.filter(
    (b) => (b.service_date || '') >= todayStr && b.status_commercial !== 'cancelled'
  ).length
  const reservasLabel = !user
    ? 'Entre para ver'
    : upcomingCnt > 0
      ? `${upcomingCnt} próxima${upcomingCnt > 1 ? 's' : ''}`
      : 'Sem reservas ainda'

  return (
    <>
    <div className="lg:hidden min-h-screen bg-gray-50 pb-24">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-white px-4 pt-5 pb-3 shadow-sm lg:max-w-6xl lg:mx-auto lg:mt-6 lg:rounded-2xl lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-9 h-9 rounded-xl shrink-0" />
            <div>
              <p className="font-giro font-semibold text-[17px] text-gray-900 leading-tight tracking-[0.09em]">TURIVA</p>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">Passeios & Transfers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </div>

        <button
          onClick={openPicker}
          className="mt-2.5 flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
        >
          <MapPin size={11} className="text-brand shrink-0" />
          <span className="text-[12px] font-semibold text-gray-700">{region?.name ?? 'Selecionar região'}</span>
          <ChevronRight size={11} className="text-gray-400 ml-0.5" />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4 lg:max-w-6xl lg:mx-auto lg:space-y-6 lg:pt-6 lg:px-6">

        {homeLayout === 'classico' ? (
          <>
            {/* ── Saudação ──────────────────────────────────────── */}
            <div>
              <p className="text-[21px] lg:text-3xl font-extrabold text-gray-900 leading-tight">Olá, explorador! 👋</p>
              <p className="text-[13px] lg:text-base text-gray-500 mt-1">O que você quer reservar hoje?</p>
            </div>

            {/* ── Cards principais ──────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate('/passeios')}
                className="relative rounded-2xl overflow-hidden h-[110px] lg:h-48 active:scale-[0.97] transition-transform"
                style={{ background: 'linear-gradient(135deg,#FF6A00,#FF9040)' }}
              >
                <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
                <div className="absolute -right-1 top-0 w-10 h-10 rounded-full bg-white/10" />
                <div className="absolute inset-0 flex flex-col justify-between p-3 lg:p-5">
                  <div className="w-8 h-8 rounded-xl bg-white/25 flex items-center justify-center">
                    <Compass size={15} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-[14px] lg:text-2xl">Passeios</p>
                    <p className="text-white/70 text-[10px] lg:text-sm lg:mt-1">Buggy · UTV · Hilux</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/transfers')}
                className="relative rounded-2xl overflow-hidden h-[110px] lg:h-48 active:scale-[0.97] transition-transform"
                style={{ background: 'linear-gradient(135deg,#1A4D5F,#2E7D9A)' }}
              >
                <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
                <div className="absolute -right-1 top-0 w-10 h-10 rounded-full bg-white/10" />
                <div className="absolute inset-0 flex flex-col justify-between p-3 lg:p-5">
                  <div className="w-8 h-8 rounded-xl bg-white/25 flex items-center justify-center">
                    <Car size={15} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-[14px] lg:text-2xl">Transfers</p>
                    <p className="text-white/70 text-[10px] lg:text-sm lg:mt-1">Aeroporto · Hotel</p>
                  </div>
                </div>
              </button>
            </div>

            {/* ── Acesso rápido 2×2 ─────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {QUICK.map(({ icon: Icon, bg, ic, title, desc, route, state }) => (
                <button
                  key={title}
                  onClick={() => navigate(route, state ? { state } : undefined)}
                  className="flex items-center gap-2.5 bg-white rounded-2xl p-3 shadow-sm border border-gray-100 active:scale-[0.97] transition-transform text-left"
                >
                  <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon size={17} className={ic} />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-gray-900 leading-tight">{title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* ── Heading funcional ─────────────────────────────── */}
            <div>
              <p className="text-[21px] font-extrabold text-gray-900 leading-tight">
                Vamos explorar{region?.name ? ` ${region.name}` : ''}? 🌴
              </p>
              <p className="text-[13px] text-gray-500 mt-1">Reserve passeios e translados com operadores locais.</p>
            </div>

            {/* ── Serviço: escolha principal (contraste corrigido) ─ */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">O que você procura?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => navigate('/passeios')}
                  aria-label="Ver passeios"
                  className="relative rounded-2xl overflow-hidden h-[122px] active:scale-[0.97] transition-transform text-left"
                  style={{ background: 'linear-gradient(135deg,#D94E00,#FF7A1F)' }}
                >
                  <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
                  <div className="absolute -right-1 top-0 w-10 h-10 rounded-full bg-white/10" />
                  <div className="absolute inset-0 flex flex-col justify-between p-3.5">
                    <div className="w-9 h-9 rounded-xl bg-white/25 flex items-center justify-center">
                      <Compass size={17} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-extrabold text-[15px] [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">Passeios</p>
                      <p className="text-white text-[11px] font-medium mt-0.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">Buggy · lagoas · pôr do sol</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/transfers')}
                  aria-label="Ver translados"
                  className="relative rounded-2xl overflow-hidden h-[122px] active:scale-[0.97] transition-transform text-left"
                  style={{ background: 'linear-gradient(135deg,#154457,#2E7D9A)' }}
                >
                  <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
                  <div className="absolute -right-1 top-0 w-10 h-10 rounded-full bg-white/10" />
                  <div className="absolute inset-0 flex flex-col justify-between p-3.5">
                    <div className="w-9 h-9 rounded-xl bg-white/25 flex items-center justify-center">
                      <Car size={17} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-extrabold text-[15px] [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">Translados</p>
                      <p className="text-white text-[11px] font-medium mt-0.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.28)]">Aeroporto · hotel · rotas</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* ── Continuidade + descoberta ─────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate(user ? '/minhas-reservas' : '/login')}
                className="flex flex-col justify-between bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 active:scale-[0.97] transition-transform text-left h-[88px]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                    <CalendarCheck size={16} className="text-purple-600" />
                  </div>
                  <p className="text-[13px] font-bold text-gray-900 leading-tight">Minhas Reservas</p>
                </div>
                <p className="text-[11px] font-semibold text-gray-500">{reservasLabel}</p>
              </button>

              <button
                onClick={() => navigate('/eventos')}
                className="flex flex-col justify-between bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 active:scale-[0.97] transition-transform text-left h-[88px]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                    <Sparkles size={16} className="text-brand" />
                  </div>
                  <p className="text-[13px] font-bold text-gray-900 leading-tight">Descubra a Vila</p>
                </div>
                <p className="text-[11px] text-gray-400">Eventos, promoções e lugares</p>
              </button>
            </div>
          </>
        )}

        {/* ── Passeios em destaque ──────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[15px] font-bold text-gray-900">Passeios em destaque</p>
            <Link to="/passeios" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand">
              Ver todos <ArrowRight size={13} />
            </Link>
          </div>

          {isLoading ? (
            <div className="h-[160px] flex flex-col items-center justify-center gap-2.5">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              {slowLoad && <p className="text-[11px] text-gray-400 text-center px-6">Acordando o servidor… só um instante 🌅</p>}
            </div>
          ) : featured.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum passeio disponível.</p>
          ) : (
            <>
              {/* Mobile: carousel com loop automático */}
              <div className="lg:hidden">
                <FeaturedCarousel items={featured} favs={favs} onToggleFav={toggleFav} />
              </div>
              {/* Desktop: grid estático */}
              <div className="hidden lg:grid lg:grid-cols-4 xl:grid-cols-5 lg:gap-4">
                {featured.map((tour) => (
                  <TourCard key={tour.id} tour={tour} isFav={favs.has(tour.id)} onToggleFav={toggleFav} />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── Divulgou, Ganhou (programa de afiliados) ──────────── */}
        <button
          onClick={() => navigate('/afiliado')}
          className="w-full bg-gradient-to-r from-brand to-amber-400 rounded-2xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform shadow-sm relative overflow-hidden"
        >
          <Sparkles size={56} className="absolute -right-2 -top-2 text-white/15" />
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-[20px]">🤑</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-extrabold text-white leading-tight">DIVULGOU, GANHOU</p>
            <p className="text-[11.5px] text-white/85 mt-0.5">Indique amigos e ganhe 5% de cada reserva paga</p>
          </div>
          <ArrowRight size={16} className="text-white shrink-0" />
        </button>

        {/* ── Como funciona ─────────────────────────────────────── */}
        <section className="pb-2">
          <p className="text-[15px] font-bold text-gray-900 mb-3">Como funciona?</p>
          <div className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">
            {STEPS.map(({ n, color, title, desc }) => (
              <div key={n} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className="text-white text-[12px] font-bold">{n}</span>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-gray-900">{title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {homeLayout === 'novo' && (
          <>
            {/* ── Cooperativas parceiras ────────────────────────── */}
            {partners.length > 0 && (
              <section className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                    <HeartHandshake size={17} className="text-teal-600" />
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-gray-900 leading-tight">Cooperativas parceiras</p>
                    <p className="text-[11px] text-gray-400 leading-tight">Operadores locais que realizam seus passeios</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {partners.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-full pl-1 pr-3 py-1">
                      <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden shrink-0">
                        {p.profile_photo_url
                          ? <img src={p.profile_photo_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-gray-500">{(p.full_name || '?')[0].toUpperCase()}</div>}
                      </div>
                      <span className="text-[12px] font-semibold text-gray-700">{p.full_name}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── CTA final ─────────────────────────────────────── */}
            <button
              onClick={() => navigate('/passeios')}
              className="relative w-full overflow-hidden rounded-2xl active:scale-[0.98] transition-transform text-left"
              style={{ background: 'linear-gradient(135deg,#D94E00,#FF7A1F)' }}
            >
              <div className="absolute -right-4 -top-6 w-24 h-24 rounded-full bg-white/10" />
              <div className="absolute -right-10 -bottom-8 w-28 h-28 rounded-full bg-white/10" />
              <div className="relative flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-white font-extrabold text-[16px] [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]">Bora pro paraíso? 🌅</p>
                  <p className="text-white/95 text-[12px] mt-0.5 [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]">Reserve seu passeio em poucos minutos</p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 bg-white text-brand font-bold text-[12px] px-3 py-2 rounded-xl">
                  Ver <ArrowRight size={14} />
                </span>
              </div>
            </button>
          </>
        )}

        <InstallPrompt />

      </div>
    </div>

    <div className="hidden lg:block">
      <HomeDesktop
        tours={tours} featured={featured} isLoading={isLoading} favs={favs} toggleFav={toggleFav}
        bannerImg={bannerImg} bannerTitle={bannerTitle} bannerSubtitle={bannerSubtitle}
      />
    </div>
    </>
  )
}
