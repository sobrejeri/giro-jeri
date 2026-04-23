import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Bell, Star, Clock, Heart, ChevronRight, ArrowRight,
  MapPin, Compass, Car, Users, Calendar, Zap, Plane,
} from 'lucide-react'

function WhatsAppIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z" />
    </svg>
  )
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
  const [from, to] = GRADIENTS[gi(tour.id)]
  const badgeColor = BADGE_COLORS[tour.highlight_badge] || 'bg-gray-500'

  return (
    <div
      onClick={() => navigate('/passeios', { state: { selectedId: tour.id } })}
      className="shrink-0 w-[158px] rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 active:scale-[0.96] transition-transform cursor-pointer"
    >
      <div className="h-[108px] relative overflow-hidden">
        {tour.cover_image_url ? (
          <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover" />
        ) : (
          <div className={`h-full bg-gradient-to-br ${from} ${to} flex items-center justify-center`}>
            <Zap size={36} className="text-white/20" />
          </div>
        )}
        {tour.highlight_badge && (
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
        <div className="flex items-center gap-1.5 mb-1">
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
        {tour.is_shared_enabled && tour.shared_price_per_person && (
          <p className="text-brand font-bold text-[12px]">
            R$ {Number(tour.shared_price_per_person).toLocaleString('pt-BR')}
            <span className="text-[9px] font-normal text-gray-400"> /veículo</span>
          </p>
        )}
      </div>
    </div>
  )
}

const QUICK = [
  { icon: Compass,  bg: 'bg-orange-50', ic: 'text-brand',      title: 'Passeio Privativo', desc: 'Exclusivo para seu grupo',   route: '/passeios'  },
  { icon: Users,    bg: 'bg-teal-50',   ic: 'text-teal-600',   title: 'Compartilhado',     desc: 'Divida com outros turistas', route: '/passeios'  },
  { icon: Plane,    bg: 'bg-blue-50',   ic: 'text-blue-600',   title: 'Transfer',           desc: 'Aeroporto & hotel',          route: '/transfers' },
  { icon: Calendar, bg: 'bg-purple-50', ic: 'text-purple-600', title: 'Minhas Reservas',    desc: 'Acompanhe seus passeios',    route: '/reservas'  },
]

const STEPS = [
  { n: 1, color: 'bg-brand',        title: 'Escolha seu passeio',   desc: 'Selecione o destino e tipo de reserva'     },
  { n: 2, color: 'bg-[#1A4D5F]',   title: 'Configure os detalhes', desc: 'Informe data, horário e número de pessoas' },
  { n: 3, color: 'bg-emerald-500',  title: 'Confirme e pague',      desc: 'Reserva garantida em poucos minutos'       },
]

export default function Home() {
  const navigate = useNavigate()
  const [favs, setFavs] = useState(new Set())
  const toggleFav = (id) =>
    setFavs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'home'],
    queryFn:  () => api.getTours({ limit: 12 }),
  })
  const tours    = toursData?.tours || toursData || []
  const featured = (tours.filter((t) => t.is_featured).length > 0
    ? tours.filter((t) => t.is_featured) : tours).slice(0, 10)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-white px-4 pt-5 pb-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center shrink-0">
              <Compass size={18} className="text-white" />
            </div>
            <div>
              <p className="text-[15px] font-extrabold text-gray-900 leading-tight">Giro Jeri</p>
              <p className="text-[10px] text-gray-400 leading-none mt-0.5">Passeios & Transfers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open('https://wa.me/5588999999999', '_blank')}
              className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white active:scale-95 transition-transform"
            >
              <WhatsAppIcon />
            </button>
            <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center relative active:scale-95 transition-transform">
              <Bell size={15} className="text-gray-600" />
              <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] bg-brand rounded-full" />
            </button>
          </div>
        </div>

        <button className="mt-2.5 flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1.5 active:scale-95 transition-transform">
          <MapPin size={11} className="text-brand shrink-0" />
          <span className="text-[12px] font-semibold text-gray-700">Jericoacoara, CE</span>
          <ChevronRight size={11} className="text-gray-400 ml-0.5" />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── Saudação ──────────────────────────────────────────── */}
        <div>
          <p className="text-[21px] font-extrabold text-gray-900 leading-tight">Olá, explorador! 👋</p>
          <p className="text-[13px] text-gray-500 mt-1">O que você quer reservar hoje?</p>
        </div>

        {/* ── Cards principais ──────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/passeios')}
            className="relative rounded-2xl overflow-hidden h-[110px] active:scale-[0.97] transition-transform"
            style={{ background: 'linear-gradient(135deg,#FF6A00,#FF9040)' }}
          >
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
            <div className="absolute -right-1 top-0 w-10 h-10 rounded-full bg-white/10" />
            <div className="absolute inset-0 flex flex-col justify-between p-3">
              <div className="w-8 h-8 rounded-xl bg-white/25 flex items-center justify-center">
                <Compass size={15} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-[14px]">Passeios</p>
                <p className="text-white/70 text-[10px]">Buggy · UTV · Hilux</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => navigate('/transfers')}
            className="relative rounded-2xl overflow-hidden h-[110px] active:scale-[0.97] transition-transform"
            style={{ background: 'linear-gradient(135deg,#1A4D5F,#2E7D9A)' }}
          >
            <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/10" />
            <div className="absolute -right-1 top-0 w-10 h-10 rounded-full bg-white/10" />
            <div className="absolute inset-0 flex flex-col justify-between p-3">
              <div className="w-8 h-8 rounded-xl bg-white/25 flex items-center justify-center">
                <Car size={15} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-[14px]">Transfers</p>
                <p className="text-white/70 text-[10px]">Aeroporto · Hotel</p>
              </div>
            </div>
          </button>
        </div>

        {/* ── Banner promo ──────────────────────────────────────── */}
        <button
          onClick={() => navigate('/passeios')}
          className="w-full relative rounded-2xl overflow-hidden h-[78px] active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg,#FF6A00,#FFB347)' }}
        >
          <div className="absolute right-4 top-2 w-14 h-14 rounded-full border-[3px] border-white/20" />
          <div className="absolute right-10 bottom-1 w-9 h-9 rounded-full border-2 border-white/15" />
          <div className="absolute right-2 top-6 w-7 h-7 rounded-full border border-white/20" />
          <div className="absolute inset-0 flex flex-col justify-center px-4">
            <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[9px] font-bold px-2 py-0.5 rounded-full w-fit mb-1">
              ⚡ OFERTA ESPECIAL
            </span>
            <p className="text-white font-extrabold text-[14px] leading-snug">
              Garanta sua aventura<br />em Jericoacoara!
            </p>
          </div>
        </button>

        {/* ── Acesso rápido 2×2 ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2.5">
          {QUICK.map(({ icon: Icon, bg, ic, title, desc, route }) => (
            <button
              key={title}
              onClick={() => navigate(route)}
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

        {/* ── Passeios em destaque ──────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[15px] font-bold text-gray-900">Passeios em destaque</p>
            <Link to="/passeios" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand">
              Ver todos <ArrowRight size={13} />
            </Link>
          </div>

          {isLoading ? (
            <div className="h-[160px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : featured.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum passeio disponível.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
              {featured.map((tour) => (
                <TourCard key={tour.id} tour={tour} isFav={favs.has(tour.id)} onToggleFav={toggleFav} />
              ))}
            </div>
          )}
        </section>

        {/* ── Como funciona ─────────────────────────────────────── */}
        <section className="pb-2">
          <p className="text-[15px] font-bold text-gray-900 mb-3">Como funciona?</p>
          <div className="space-y-3">
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

      </div>
    </div>
  )
}
