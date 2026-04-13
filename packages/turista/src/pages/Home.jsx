import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import {
  Bell, Star, Clock, Heart, ChevronRight, ArrowRight,
  Zap, Sun, Waves, Anchor, Car, Compass, Search,
} from 'lucide-react'

/* ── WhatsApp SVG ─────────────────────────────────────────────── */
function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z" />
    </svg>
  )
}

/* ── Category → icon + gradient ──────────────────────────────── */
const TOUR_ICONS = {
  buggy:       Zap,
  'por-do-sol': Sun,
  lagoas:      Waves,
  barco:       Anchor,
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

/* ── Category chips data ──────────────────────────────────────── */
const CATS = [
  { id: 'todos',     label: 'Todos',     Icon: Compass },
  { id: 'buggy',     label: 'Buggy',     Icon: Zap     },
  { id: 'barco',     label: 'Barco',     Icon: Anchor  },
  { id: 'lagoas',    label: 'Lagoas',    Icon: Waves   },
  { id: 'por-do-sol',label: 'Pôr do sol',Icon: Sun     },
  { id: 'transfer',  label: 'Transfer',  Icon: Car     },
]

/* ── Tour card ────────────────────────────────────────────────── */
function TourCard({ tour, isFav, onToggleFav }) {
  const navigate = useNavigate()
  const Icon  = TOUR_ICONS[tour.category?.slug] || Zap
  const [from, to] = GRADIENTS[gi(tour.id)]

  return (
    <div
      onClick={() => navigate(`/passeios/${tour.id}`)}
      className="shrink-0 w-[148px] rounded-2xl overflow-hidden bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] active:scale-[0.96] transition-transform cursor-pointer"
    >
      {/* Image area */}
      <div className={`h-[100px] bg-gradient-to-br ${from} ${to} relative flex items-end justify-start p-2.5`}>
        <Icon size={38} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20" />
        {tour.highlight_badge && (
          <span className="relative z-10 bg-white/90 text-brand text-[9px] font-bold px-2 py-[3px] rounded-full">
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

      {/* Info */}
      <div className="p-2.5">
        <p className="text-[12px] font-bold text-gray-900 leading-tight line-clamp-1 mb-1">{tour.name}</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {tour.rating_average > 0 && (
              <div className="flex items-center gap-0.5">
                <Star size={10} className="text-amber-400 fill-amber-400" />
                <span className="text-[10px] font-semibold text-gray-600">{tour.rating_average}</span>
              </div>
            )}
            {tour.duration_hours && (
              <div className="flex items-center gap-0.5 text-[10px] text-gray-400">
                <Clock size={9} />
                <span>{tour.duration_hours}h</span>
              </div>
            )}
          </div>
        </div>
        {tour.is_shared_enabled && tour.shared_price_per_person && (
          <p className="text-brand font-bold text-[12px] mt-1">
            R$ {Number(tour.shared_price_per_person).toLocaleString('pt-BR')}
            <span className="text-[9px] font-normal text-gray-400"> /pax</span>
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Main ─────────────────────────────────────────────────────── */
export default function Home() {
  const navigate  = useNavigate()
  const { user }  = useAuth()
  const firstName = user?.full_name?.split(' ')[0] || 'viajante'

  const [activeCat, setActiveCat] = useState('todos')
  const [favs, setFavs] = useState(new Set())
  const toggleFav = (id) =>
    setFavs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'home'],
    queryFn:  () => api.getTours({ limit: 12 }),
  })
  const tours = toursData?.tours || toursData || []
  const featured = (tours.filter((t) => t.is_featured).length > 0
    ? tours.filter((t) => t.is_featured) : tours).slice(0, 10)

  return (
    <div className="min-h-screen bg-[#F5F5F5]">

      {/* ── App Bar ───────────────────────────────────────────── */}
      <div
        className="px-4 pt-5 pb-5"
        style={{ background: 'linear-gradient(160deg,#FF6A00 0%,#FF9040 100%)' }}
      >
        {/* Top row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/80 text-[12px]">Olá, {firstName} 👋</p>
            <p className="text-white font-bold text-[18px] leading-tight">Explore Jericoacoara</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open('https://wa.me/5588999999999', '_blank')}
              className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
            >
              <WhatsAppIcon />
            </button>
            <button className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white relative active:scale-95 transition-transform">
              <Bell size={17} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-white rounded-full" />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <button
          onClick={() => navigate('/passeios')}
          className="w-full flex items-center gap-2.5 bg-white rounded-2xl px-4 h-11 shadow-lg shadow-black/10 active:scale-[0.98] transition-transform"
        >
          <Search size={15} className="text-gray-400 shrink-0" />
          <span className="text-[13px] text-gray-400">Buscar passeios e transfers…</span>
        </button>
      </div>

      {/* ── Category chips ────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
        {CATS.map(({ id, label, Icon }) => {
          const active = activeCat === id
          return (
            <button
              key={id}
              onClick={() => setActiveCat(id)}
              className={`shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-semibold transition-all active:scale-95 ${
                active
                  ? 'bg-brand text-white shadow-md shadow-brand/30'
                  : 'bg-white text-gray-500 shadow-sm'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Hero cards ────────────────────────────────────────── */}
      <section className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => navigate('/passeios')}
            className="relative rounded-2xl overflow-hidden h-[110px] active:scale-[0.97] transition-transform"
            style={{ background: 'linear-gradient(135deg,#FF6A00,#FF9040)' }}
          >
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
            <div className="absolute top-0 -right-2 w-12 h-12 rounded-full bg-white/10" />
            <div className="absolute inset-0 flex flex-col justify-between p-3">
              <div className="w-8 h-8 rounded-xl bg-white/25 flex items-center justify-center">
                <Compass size={15} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-[13px]">Passeios</p>
                <p className="text-white/70 text-[10px]">Buggy · Barco · UTV</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => navigate('/transfers')}
            className="relative rounded-2xl overflow-hidden h-[110px] active:scale-[0.97] transition-transform"
            style={{ background: 'linear-gradient(135deg,#1A4D5F,#2E7D9A)' }}
          >
            <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full bg-white/10" />
            <div className="absolute top-0 -right-2 w-12 h-12 rounded-full bg-white/10" />
            <div className="absolute inset-0 flex flex-col justify-between p-3">
              <div className="w-8 h-8 rounded-xl bg-white/25 flex items-center justify-center">
                <Car size={15} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-[13px]">Transfers</p>
                <p className="text-white/70 text-[10px]">Aeroporto · Hotel</p>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* ── Featured tours ────────────────────────────────────── */}
      <section className="pb-4">
        <div className="flex items-center justify-between px-4 mb-3">
          <p className="text-[15px] font-bold text-gray-900">Em destaque</p>
          <Link to="/passeios" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand">
            Ver todos <ArrowRight size={13} />
          </Link>
        </div>

        {isLoading ? (
          <div className="h-[170px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : featured.length === 0 ? (
          <p className="px-4 text-sm text-gray-400">Nenhum passeio disponível.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
            {featured.map((tour) => (
              <TourCard key={tour.id} tour={tour} isFav={favs.has(tour.id)} onToggleFav={toggleFav} />
            ))}
          </div>
        )}
      </section>

      {/* ── Transfer banner ───────────────────────────────────── */}
      <section className="px-4 pb-6">
        <button
          onClick={() => navigate('/transfers')}
          className="w-full flex items-center gap-3 bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-transform"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg,#1A4D5F,#2E7D9A)' }}>
            <Car size={20} className="text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[13px] font-bold text-gray-900">Precisa de transfer?</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Chegada e saída de Jericoacoara</p>
          </div>
          <div className="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
            <ChevronRight size={14} className="text-gray-400" />
          </div>
        </button>
      </section>

    </div>
  )
}
