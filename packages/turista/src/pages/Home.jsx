import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import {
  MapPin, Compass, Car, CalendarDays, ChevronRight,
  Zap, Sun, Waves, Anchor, Star, Users
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
      className="shrink-0 w-40 md:w-auto md:shrink rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="h-24 md:h-32 bg-gradient-to-br from-orange-200 to-amber-100 flex items-center justify-center relative">
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
      {/* Mobile-only header — desktop has TopNav */}
      <div className="md:hidden bg-white px-5 pt-6 pb-4 flex items-center justify-between border-b border-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-xl flex items-center justify-center">
            <MapPin size={15} className="text-white" />
          </div>
          <span className="font-display font-bold text-gray-900">Giro Jeri</span>
        </div>
        <div className="flex items-center gap-1.5 bg-orange-50 border border-brand/20 rounded-full px-3 py-1.5">
          <MapPin size={11} className="text-brand" />
          <span className="text-xs font-semibold text-brand">Jericoacoara</span>
        </div>
      </div>

      {/* Page content wrapper */}
      <div className="md:max-w-5xl md:mx-auto md:w-full md:px-6 md:py-8">
        {/* Greeting */}
        <div className="px-5 md:px-0 mb-5 md:mb-8 md:pt-0 pt-0">
          <h1 className="text-xl md:text-3xl font-bold text-gray-900">
            Olá, {firstName}! 👋
          </h1>
          <p className="text-sm md:text-base text-gray-500 mt-0.5">Que passeio você vai fazer hoje?</p>
        </div>

        {/* Category cards */}
        <div className="px-5 md:px-0 grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 md:mb-6">
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

          <Link
            to="/passeios?modo=shared"
            className="bg-sky-50 rounded-2xl p-4 flex flex-col gap-3 min-h-[110px]"
          >
            <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
              <Users size={18} className="text-sky-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Compartilhado</p>
              <p className="text-gray-500 text-xs leading-tight mt-0.5">
                Divida com outros grupos
              </p>
            </div>
          </Link>

          <Link
            to="/minhas-reservas"
            className="bg-green-50 rounded-2xl p-4 flex flex-col gap-3 min-h-[110px]"
          >
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
              <CalendarDays size={18} className="text-green-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Minhas Reservas</p>
              <p className="text-gray-500 text-xs leading-tight mt-0.5">
                Veja seu histórico
              </p>
            </div>
          </Link>
        </div>

        {/* Promo banner */}
        <div className="mx-5 md:mx-0 mb-6 rounded-2xl overflow-hidden bg-gradient-to-r from-brand to-amber-400 p-4 md:p-6 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-white text-xs font-medium opacity-80 mb-1">🌊 Destino imperdível</p>
            <p className="text-white font-bold text-sm md:text-lg leading-tight">
              Jericoacoara é um dos melhores destinos do Brasil
            </p>
          </div>
          <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-2xl">🏖️</span>
          </div>
        </div>

        {/* Featured tours */}
        <div className="mb-6 md:mb-8">
          <div className="px-5 md:px-0 flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 md:text-lg">Passeios em destaque</h2>
            <Link to="/passeios" className="flex items-center gap-0.5 text-brand text-xs font-medium">
              Ver todos <ChevronRight size={14} />
            </Link>
          </div>

          {isLoading ? (
            <div className="px-5 md:px-0"><PageSpinner /></div>
          ) : toShow.length === 0 ? (
            <p className="px-5 md:px-0 text-sm text-gray-400">Nenhum passeio disponível.</p>
          ) : (
            <>
              {/* Mobile: horizontal scroll */}
              <div className="md:hidden flex gap-3 px-5 overflow-x-auto scrollbar-thin pb-1">
                {toShow.map((tour) => (
                  <TourCard key={tour.id} tour={tour} />
                ))}
              </div>
              {/* Desktop: grid */}
              <div className="hidden md:grid grid-cols-4 gap-4">
                {toShow.map((tour) => (
                  <TourCard key={tour.id} tour={tour} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Como funciona */}
        <div className="px-5 md:px-0 mb-6 md:mb-10">
          <h2 className="font-bold text-gray-900 mb-4 md:text-lg">Como funciona?</h2>
          <div className="space-y-3 md:grid md:grid-cols-3 md:gap-4 md:space-y-0">
            {[
              { n: 1, color: 'bg-brand',     label: 'Escolha os passeios',   desc: 'Navegue pelo catálogo e escolha o passeio ideal.' },
              { n: 2, color: 'bg-gray-800',  label: 'Configure os detalhes', desc: 'Selecione data, horário, veículo e número de pessoas.' },
              { n: 3, color: 'bg-green-500', label: 'Confirme e pague',      desc: 'Finalize a reserva com pagamento seguro via Pix ou cartão.' },
            ].map(({ n, color, label, desc }) => (
              <div key={n} className="flex items-start gap-3 md:flex-col md:gap-3 md:bg-gray-50 md:rounded-2xl md:p-4">
                <div className={`${color} w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 md:mt-0`}>
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
    </div>
  )
}
