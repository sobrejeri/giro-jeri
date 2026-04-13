import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import {
  MapPin, Bell, Star, Clock, Heart, ChevronRight,
  Compass, Car, Users, CalendarCheck, Plane, ArrowRight,
  Zap, Sun, Waves, Anchor,
} from 'lucide-react'

// ── WhatsApp icon SVG ─────────────────────────────────────────────
function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z" fill="currentColor" />
    </svg>
  )
}

// ── Category → icon map ───────────────────────────────────────────
const TOUR_ICONS = {
  buggy:      Zap,
  'por-do-sol': Sun,
  lagoas:     Waves,
  barco:      Anchor,
}
const GRADIENTS = [
  'from-orange-100 to-amber-100',
  'from-sky-100 to-blue-100',
  'from-emerald-100 to-teal-100',
  'from-purple-100 to-violet-100',
]
function gi(id = '') {
  let n = 0; for (let i = 0; i < id.length; i++) n += id.charCodeAt(i)
  return n % GRADIENTS.length
}

// ── Quick actions grid ────────────────────────────────────────────
const QUICK_ACTIONS = [
  { id: 'privativo',   label: 'Passeio Privativo', sub: 'Exclusivo para seu grupo',   icon: Compass,      bg: 'bg-orange-50', color: 'text-brand',     to: '/passeios' },
  { id: 'compartilh',  label: 'Compartilhado',      sub: 'Divida com outros turistas', icon: Users,        bg: 'bg-blue-50',   color: 'text-blue-600',  to: '/passeios' },
  { id: 'transfer',    label: 'Transfer',            sub: 'Aeroporto & hotel',          icon: Plane,        bg: 'bg-teal-50',   color: 'text-teal-600',  to: '/transfers' },
  { id: 'reservas',    label: 'Minhas Reservas',     sub: 'Acompanhe seus passeios',    icon: CalendarCheck,bg: 'bg-purple-50', color: 'text-purple-600',to: '/minhas-reservas' },
]

// ── Tour card ─────────────────────────────────────────────────────
function TourCard({ tour, isFav, onToggleFav }) {
  const navigate = useNavigate()
  const Icon   = TOUR_ICONS[tour.category?.slug] || Zap
  const idx    = gi(tour.id)

  return (
    <div
      onClick={() => navigate(`/passeios/${tour.id}`)}
      className="shrink-0 w-[160px] bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-50 cursor-pointer active:scale-[0.97] transition-transform"
    >
      <div className={`h-[100px] bg-gradient-to-br ${GRADIENTS[idx]} relative flex items-center justify-center`}>
        <Icon size={36} className="text-brand/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        {tour.highlight_badge && (
          <span className="absolute top-2 left-2 bg-brand text-white text-[9px] font-bold px-2 py-[3px] rounded-full shadow-sm">
            {tour.highlight_badge}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(tour.id) }}
          className="absolute top-2 right-2 w-6 h-6 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform"
        >
          <Heart size={11} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
        </button>
      </div>

      <div className="p-2.5">
        <p className="text-[13px] font-bold text-gray-900 mb-1 leading-tight line-clamp-1">{tour.name}</p>
        <div className="flex items-center gap-2 mb-1.5">
          {tour.rating_average > 0 && (
            <div className="flex items-center gap-0.5">
              <Star size={11} className="text-amber-400 fill-amber-400" />
              <span className="text-[11px] font-semibold text-gray-700">{tour.rating_average}</span>
            </div>
          )}
          {tour.duration_hours && (
            <div className="flex items-center gap-0.5 text-[11px] text-gray-400">
              <Clock size={10} />
              <span>{tour.duration_hours}h</span>
            </div>
          )}
        </div>
        {tour.is_shared_enabled && tour.shared_price_per_person && (
          <div className="flex items-baseline gap-1">
            <span className="text-brand font-bold text-sm">
              R$ {Number(tour.shared_price_per_person).toLocaleString('pt-BR')}
            </span>
            <span className="text-[9px] text-gray-400">/pessoa</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────
export default function Home() {
  const navigate    = useNavigate()
  const { user }    = useAuth()
  const firstName   = user?.full_name?.split(' ')[0] || 'explorador'

  const [favs, setFavs] = useState(new Set())
  const toggleFav = (id) =>
    setFavs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'home'],
    queryFn:  () => api.getTours({ limit: 8 }),
  })
  const tours    = toursData?.tours || toursData || []
  const featured = (tours.filter((t) => t.is_featured).length > 0
    ? tours.filter((t) => t.is_featured)
    : tours
  ).slice(0, 8)

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="bg-white px-5 pt-6 md:pt-4 pb-3 sticky top-0 md:top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-2.5">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
                <span className="text-white text-base">🌴</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-brand leading-none">Giro Jeri</h1>
                <p className="text-[10px] text-gray-400 leading-none mt-0.5">Passeios & Transfers</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open('https://wa.me/5588999999999', '_blank')}
                className="w-9 h-9 rounded-full bg-[#E8F8EE] flex items-center justify-center text-[#25D366] active:scale-95 transition-transform"
              >
                <WhatsAppIcon />
              </button>
              <button className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 relative active:scale-95 transition-transform">
                <Bell size={18} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full ring-2 ring-white" />
              </button>
            </div>
          </div>

          {/* Location */}
          <button className="flex items-center gap-1.5 w-full bg-[#FAFAFA] rounded-xl px-3 py-2 border border-gray-100 active:bg-gray-50 transition-colors">
            <MapPin size={13} className="text-brand" />
            <span className="text-xs text-gray-700 font-medium">Jericoacoara, CE</span>
            <ChevronRight size={13} className="text-gray-300 ml-auto" />
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        {/* ── Hero ────────────────────────────────────────────── */}
        <section className="px-4 pt-5 pb-4 bg-white">
          <h2 className="text-xl font-bold text-gray-900 leading-tight mb-0.5">
            Olá, {firstName}! 👋
          </h2>
          <p className="text-gray-500 text-sm mb-4">O que você quer reservar hoje?</p>

          <div className="grid grid-cols-2 gap-3">
            {/* Passeios */}
            <button
              onClick={() => navigate('/passeios')}
              className="relative rounded-2xl overflow-hidden h-[130px] shadow-sm active:scale-[0.97] transition-transform"
              style={{ background: 'linear-gradient(135deg,#FF6A00,#FF8C40)' }}
            >
              <div className="absolute inset-0 flex flex-col justify-between p-3.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Compass size={18} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-white font-bold text-[15px] leading-tight">Passeios</p>
                  <p className="text-white/75 text-[11px] mt-0.5">Buggy · UTV · Hilux</p>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
            </button>

            {/* Transfers */}
            <button
              onClick={() => navigate('/transfers')}
              className="relative rounded-2xl overflow-hidden h-[130px] shadow-sm active:scale-[0.97] transition-transform"
              style={{ background: 'linear-gradient(135deg,#1A4D5F,#2A7090)' }}
            >
              <div className="absolute inset-0 flex flex-col justify-between p-3.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Car size={18} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-white font-bold text-[15px] leading-tight">Transfers</p>
                  <p className="text-white/75 text-[11px] mt-0.5">Aeroporto · Hotel</p>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
            </button>
          </div>
        </section>

        {/* ── Promo Banner ─────────────────────────────────────── */}
        <section className="px-4 py-3">
          <div
            className="relative h-[88px] rounded-2xl overflow-hidden flex items-center px-4"
            style={{ background: 'linear-gradient(135deg,#FF6A00 0%,#FF8C40 50%,#FFB347 100%)' }}
          >
            <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10" />
            <div className="absolute -right-2 bottom-0 w-20 h-20 rounded-full bg-white/10" />
            <div className="relative">
              <div className="flex items-center gap-1 mb-0.5">
                <Zap size={11} className="text-yellow-300" />
                <span className="text-white/90 text-[10px] font-semibold uppercase tracking-wide">Oferta especial</span>
              </div>
              <p className="text-white font-bold text-[15px] leading-snug">
                Garanta sua aventura<br />em Jericoacoara!
              </p>
            </div>
          </div>
        </section>

        {/* ── Quick Access ─────────────────────────────────────── */}
        <section className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(a.to)}
                className="bg-white rounded-xl p-3 flex items-center gap-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-50 active:bg-gray-50 active:scale-[0.97] transition-all"
              >
                <div className={`w-9 h-9 rounded-lg ${a.bg} flex items-center justify-center shrink-0`}>
                  <a.icon size={18} className={a.color} />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight">{a.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{a.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Featured Tours ───────────────────────────────────── */}
        <section className="py-3 bg-white border-t border-gray-50 mb-2">
          <div className="px-4 mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-gray-900">Passeios em destaque</h3>
            <Link
              to="/passeios"
              className="flex items-center gap-0.5 text-xs font-semibold text-brand"
            >
              Ver todos <ArrowRight size={13} />
            </Link>
          </div>

          {isLoading ? (
            <div className="px-4 h-[160px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : featured.length === 0 ? (
            <p className="px-4 text-sm text-gray-400">Nenhum passeio disponível.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto px-4 pb-3 scrollbar-hide">
              {featured.map((tour) => (
                <TourCard
                  key={tour.id}
                  tour={tour}
                  isFav={favs.has(tour.id)}
                  onToggleFav={toggleFav}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="px-4 py-4 bg-white border-t border-gray-50 mb-2">
          <h3 className="text-[15px] font-bold text-gray-900 mb-3">Como funciona?</h3>
          <div className="space-y-3 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
            {[
              { n: '1', color: 'bg-brand',     title: 'Escolha seu passeio',   desc: 'Selecione o destino e tipo de reserva' },
              { n: '2', color: 'bg-[#1A4D5F]', title: 'Configure os detalhes', desc: 'Informe data, horário e número de pessoas' },
              { n: '3', color: 'bg-[#00C853]', title: 'Confirme e pague',      desc: 'Reserva garantida em poucos minutos' },
            ].map((s) => (
              <div key={s.n} className="flex items-center gap-3 md:flex-col md:items-start md:bg-gray-50 md:rounded-2xl md:p-4">
                <div className={`${s.color} w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold`}>
                  {s.n}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{s.title}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
