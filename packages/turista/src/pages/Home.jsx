import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import {
  Bell, Star, Clock, Heart, ChevronRight,
  Compass, Car, ArrowRight,
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
      <header className="bg-white px-4 pt-5 pb-3 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand flex items-center justify-center">
              <span className="text-white text-sm">🌴</span>
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-gray-900 leading-none">Giro Jeri</h1>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">Jericoacoara, CE</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open('https://wa.me/5588999999999', '_blank')}
              className="w-8 h-8 rounded-full bg-[#E8F8EE] flex items-center justify-center text-[#25D366] active:scale-95 transition-transform"
            >
              <WhatsAppIcon />
            </button>
            <button className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 relative active:scale-95 transition-transform">
              <Bell size={16} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-brand rounded-full" />
            </button>
          </div>
        </div>

        {/* Greeting */}
        <div>
          <p className="text-[13px] text-gray-400">Olá, {firstName} 👋</p>
          <p className="text-[17px] font-bold text-gray-900 leading-tight">O que vamos reservar?</p>
        </div>
      </header>

      {/* ── Hero CTAs ──────────────────────────────────────────── */}
      <section className="px-4 pt-4 pb-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/passeios')}
            className="relative rounded-2xl overflow-hidden h-[120px] active:scale-[0.97] transition-transform"
            style={{ background: 'linear-gradient(135deg,#FF6A00,#FF9040)' }}
          >
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
            <div className="absolute inset-0 flex flex-col justify-between p-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Compass size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-[14px]">Passeios</p>
                <p className="text-white/70 text-[11px]">Buggy · UTV · Barco</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => navigate('/transfers')}
            className="relative rounded-2xl overflow-hidden h-[120px] active:scale-[0.97] transition-transform"
            style={{ background: 'linear-gradient(135deg,#1A4D5F,#2E7D9A)' }}
          >
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
            <div className="absolute inset-0 flex flex-col justify-between p-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Car size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-white font-bold text-[14px]">Transfers</p>
                <p className="text-white/70 text-[11px]">Aeroporto · Hotel</p>
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* ── Featured Tours ─────────────────────────────────────── */}
      <section className="pt-2 pb-4">
        <div className="px-4 mb-3 flex items-center justify-between">
          <p className="text-[15px] font-bold text-gray-900">Em destaque</p>
          <Link to="/passeios" className="flex items-center gap-0.5 text-xs font-semibold text-brand">
            Ver todos <ArrowRight size={13} />
          </Link>
        </div>

        {isLoading ? (
          <div className="px-4 h-[160px] flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : featured.length === 0 ? (
          <p className="px-4 text-sm text-gray-400">Nenhum passeio disponível.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
            {featured.map((tour) => (
              <TourCard key={tour.id} tour={tour} isFav={favs.has(tour.id)} onToggleFav={toggleFav} />
            ))}
          </div>
        )}
      </section>

      {/* ── Transfers promo ────────────────────────────────────── */}
      <section className="px-4 pb-4">
        <button
          onClick={() => navigate('/transfers')}
          className="relative w-full h-[80px] rounded-2xl overflow-hidden flex items-center px-4 active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg,#1A4D5F,#2E7D9A)' }}
        >
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
          <div className="absolute right-2 bottom-0 w-14 h-14 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Car size={18} className="text-white" />
            </div>
            <div className="text-left">
              <p className="text-white font-bold text-[13px]">Precisa de transfer?</p>
              <p className="text-white/70 text-[11px]">Chegada e saída de Jericoacoara</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-white/60 ml-auto relative" />
        </button>
      </section>

    </div>
  )
}
