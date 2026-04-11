import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  MapPin, Compass, Car, CalendarDays, ChevronRight,
  Zap, Sun, Waves, Anchor, Star, Users, CheckCircle2
} from 'lucide-react'

const TOUR_ICONS = {
  'buggy':      Zap,
  'por-do-sol': Sun,
  'lagoas':     Waves,
  'barco':      Anchor,
}

function TourCard({ tour }) {
  const Icon = TOUR_ICONS[tour.category?.slug] || Zap
  return (
    <Link
      to={`/passeios/${tour.id}`}
      className="shrink-0 w-40 rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Image */}
      <div className="h-24 bg-gradient-to-br from-orange-200 to-amber-100 flex items-center justify-center relative">
        <Icon size={32} className="text-brand/30" />
        {tour.highlight_badge && (
          <span className="absolute top-2 left-2 bg-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {tour.highlight_badge}
          </span>
        )}
      </div>
      <div className="p-2.5 bg-white">
        <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight mb-1">{tour.name}</p>
        {tour.rating_average > 0 && (
          <div className="flex items-center gap-1 mb-1">
            <Star size={10} className="text-amber-400 fill-amber-400" />
            <span className="text-[10px] text-gray-500">{tour.rating_average}</span>
          </div>
        )}
        {tour.is_shared_enabled && (
          <span className="inline-block bg-green-50 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
            R$ {Number(tour.shared_price_per_person).toFixed(0)}
          </span>
        )}
      </div>
    </Link>
  )
}

export default function Home() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'home'],
    queryFn:  () => api.getTours({ limit: 8 }),
  })

  const tours = toursData?.tours || toursData || []
  const featured = tours.filter((t) => t.is_featured).slice(0, 6)
  const toShow   = featured.length > 0 ? featured : tours.slice(0, 6)

  const firstName = user?.full_name?.split(' ')[0] || 'explorador'

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="bg-white px-5 pt-10 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-xl flex items-center justify-center">
            <MapPin size={15} className="text-white" />
          </div>
          <span className="font-display font-bold text-gray-900">Giro Jeri</span>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-100 rounded-full px-3 py-1.5">
          <MapPin size={12} className="text-brand" />
          <span className="text-xs font-medium text-gray-700">Jericoacoara</span>
        </div>
      </div>

      {/* Greeting */}
      <div className="px-5 mb-5">
        <h1 className="text-xl font-bold text-gray-900">
          Olá, {firstName}! 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Que passeio você vai fazer hoje?</p>
      </div>

      {/* Category cards */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-4">
        <Link
          to="/passeios"
          className="bg-brand rounded-2xl p-4 flex flex-col gap-3 min-h-[110px]"
        >
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <Compass size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Passeios</p>
            <p className="text-orange-100 text-xs leading-tight mt-0.5">
              Explore os melhores passeios
            </p>
          </div>
        </Link>

        <Link
          to="/transfers"
          className="bg-[#1C1C2E] rounded-2xl p-4 flex flex-col gap-3 min-h-[110px]"
        >
          <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
            <Car size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Transfers</p>
            <p className="text-gray-400 text-xs leading-tight mt-0.5">
              Conheça os melhores destinos
            </p>
          </div>
        </Link>
      </div>

      {/* Promo banner */}
      <div className="mx-5 mb-5 rounded-2xl overflow-hidden bg-gradient-to-r from-brand to-amber-400 p-4 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-white text-xs font-medium opacity-80 mb-1">🌊 Destino imperdível</p>
          <p className="text-white font-bold text-sm leading-tight">
            Jericoacoara é um dos melhores destinos do Brasil
          </p>
        </div>
        <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <span className="text-2xl">🏖️</span>
        </div>
      </div>

      {/* Quick links */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'Passeio Privativo', desc: 'Exclusivo para você', icon: Users,        to: '/passeios?modo=private', color: 'bg-orange-50' },
          { label: 'Compartilhado',     desc: 'Divida com outros',   icon: Compass,      to: '/passeios?modo=shared',  color: 'bg-sky-50' },
          { label: 'Transfer',          desc: 'Ponto a ponto',       icon: Car,          to: '/transfers',             color: 'bg-indigo-50' },
          { label: 'Minhas Reservas',   desc: 'Veja seu histórico',  icon: CalendarDays, to: '/minhas-reservas',       color: 'bg-green-50' },
        ].map(({ label, desc, icon: Icon, to, color }) => (
          <Link
            key={label}
            to={to}
            className={`${color} rounded-2xl p-3.5 flex items-start gap-3`}
          >
            <Icon size={18} className="text-brand shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-gray-900">{label}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Featured tours */}
      <div className="mb-6">
        <div className="px-5 flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">Passeios em destaque</h2>
          <Link to="/passeios" className="flex items-center gap-0.5 text-brand text-xs font-medium">
            Ver todos <ChevronRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          <div className="px-5"><PageSpinner /></div>
        ) : toShow.length === 0 ? (
          <p className="px-5 text-sm text-gray-400">Nenhum passeio disponível.</p>
        ) : (
          <div className="flex gap-3 px-5 overflow-x-auto scrollbar-thin pb-1">
            {toShow.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>
        )}
      </div>

      {/* Como funciona */}
      <div className="px-5 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">Como funciona?</h2>
        <div className="space-y-3">
          {[
            { n: 1, color: 'bg-brand',     label: 'Escolha os passeios',   desc: 'Navegue pelo catálogo e escolha o passeio ideal.' },
            { n: 2, color: 'bg-gray-800',  label: 'Configure os detalhes', desc: 'Selecione data, horário, veículo e número de pessoas.' },
            { n: 3, color: 'bg-green-500', label: 'Confirme e pague',      desc: 'Finalize a reserva com pagamento seguro via Pix ou cartão.' },
          ].map(({ n, color, label, desc }) => (
            <div key={n} className="flex items-start gap-3">
              <div className={`${color} w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5`}>
                <span className="text-white text-xs font-bold">{n}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
