import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import { Clock, Users, Star, ArrowRight, Zap, Waves, Anchor, Sun, Car } from 'lucide-react'

const CATEGORY_ICONS = {
  'buggy':      Zap,
  'por-do-sol': Sun,
  'lagoas':     Waves,
  'barco':      Anchor,
  'transfer':   Car,
}

const CATEGORY_COLORS = {
  'buggy':      'bg-orange-100 text-orange-600',
  'por-do-sol': 'bg-amber-100 text-amber-600',
  'lagoas':     'bg-sky-100 text-sky-600',
  'barco':      'bg-emerald-100 text-emerald-600',
  'transfer':   'bg-indigo-100 text-indigo-600',
}

function TourCard({ tour }) {
  const IconComp = CATEGORY_ICONS[tour.category?.slug] || Zap
  const colorClass = CATEGORY_COLORS[tour.category?.slug] || 'bg-gray-100 text-gray-600'

  const minPrice = tour.is_shared_enabled
    ? `R$ ${Number(tour.shared_price_per_person).toFixed(0)}/pax`
    : null

  return (
    <Link
      to={`/passeios/${tour.id}`}
      className="group block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
    >
      {/* Image placeholder */}
      <div className="h-48 bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center relative">
        <IconComp size={48} className="text-brand/30" />
        {tour.highlight_badge && (
          <span className="absolute top-3 left-3 bg-brand text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            {tour.highlight_badge}
          </span>
        )}
        {tour.is_featured && !tour.highlight_badge && (
          <span className="absolute top-3 left-3 bg-brand text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            Destaque
          </span>
        )}
      </div>

      <div className="p-5">
        {/* Category */}
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full mb-3 ${colorClass}`}>
          <IconComp size={11} />
          {tour.category?.name || 'Passeio'}
        </span>

        <h3 className="font-semibold text-gray-900 leading-snug mb-2 group-hover:text-brand transition-colors line-clamp-2">
          {tour.name}
        </h3>
        <p className="text-sm text-gray-500 line-clamp-2 mb-4">
          {tour.short_description}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {tour.duration_hours && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {tour.duration_hours}h
              </span>
            )}
            {tour.max_people && (
              <span className="flex items-center gap-1">
                <Users size={12} />
                até {tour.max_people} pax
              </span>
            )}
          </div>
          {minPrice && (
            <span className="text-sm font-semibold text-brand">{minPrice}</span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function Home() {
  const navigate = useNavigate()

  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'featured'],
    queryFn:  () => api.getTours({ featured: true, limit: 4 }),
  })

  const { data: allToursData } = useQuery({
    queryKey: ['tours', 'all'],
    queryFn:  () => api.getTours({ limit: 8 }),
  })

  const featured = toursData?.tours || toursData || []
  const allTours = allToursData?.tours || allToursData || []
  const toShow   = featured.length > 0 ? featured : allTours.slice(0, 4)

  return (
    <div>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-400 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-white/20" />
          <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full bg-white/10" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 py-20 md:py-28">
          <p className="text-orange-100 font-medium mb-3 tracking-wide">Jericoacoara, Ceará</p>
          <h1 className="font-display font-bold text-4xl md:text-6xl leading-tight mb-6 max-w-2xl">
            Descubra o paraíso dos ventos
          </h1>
          <p className="text-orange-50 text-lg md:text-xl mb-10 max-w-xl leading-relaxed">
            Passeios de buggy, lagoas cristalinas, pôr do sol inesquecível e transfers
            seguros em Jericoacoara.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/passeios')}
              className="inline-flex items-center gap-2 h-12 px-7 bg-white text-brand font-semibold rounded-xl hover:bg-orange-50 transition-colors shadow-lg"
            >
              Ver Passeios
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => navigate('/transfers')}
              className="inline-flex items-center gap-2 h-12 px-7 bg-white/20 text-white font-semibold rounded-xl hover:bg-white/30 transition-colors backdrop-blur"
            >
              Transfers
            </button>
          </div>
        </div>
      </section>

      {/* Categorias rápidas */}
      <section className="max-w-6xl mx-auto px-4 -mt-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Buggy',     icon: Zap,    to: '/passeios?categoria=buggy',   color: 'from-orange-400 to-amber-400' },
            { label: 'Pôr do Sol',icon: Sun,    to: '/passeios?categoria=por-do-sol', color: 'from-amber-400 to-yellow-400' },
            { label: 'Lagoas',    icon: Waves,  to: '/passeios?categoria=lagoas',  color: 'from-sky-400 to-cyan-400' },
            { label: 'Transfers', icon: Car,    to: '/transfers',                  color: 'from-indigo-400 to-purple-400' },
          ].map(({ label, icon: Icon, to, color }) => (
            <Link
              key={label}
              to={to}
              className={`bg-gradient-to-br ${color} text-white rounded-2xl p-5 flex flex-col items-center gap-2 hover:scale-105 transition-transform shadow-md`}
            >
              <Icon size={28} />
              <span className="font-semibold text-sm">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Passeios em destaque */}
      <section className="max-w-6xl mx-auto px-4 mt-16">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="font-display font-bold text-2xl md:text-3xl text-gray-900">
              Passeios em destaque
            </h2>
            <p className="text-gray-500 mt-1">Os favoritos dos turistas em Jericoacoara</p>
          </div>
          <Link
            to="/passeios"
            className="hidden md:flex items-center gap-1.5 text-brand font-medium text-sm hover:underline"
          >
            Ver todos
            <ArrowRight size={15} />
          </Link>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : toShow.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Zap size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nenhum passeio disponível no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {toShow.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>
        )}

        <div className="text-center mt-8 md:hidden">
          <Link to="/passeios" className="text-brand font-medium text-sm hover:underline">
            Ver todos os passeios →
          </Link>
        </div>
      </section>

      {/* CTA — Transfers */}
      <section className="max-w-6xl mx-auto px-4 mt-16">
        <div className="bg-gray-900 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-display font-bold text-2xl md:text-3xl text-white mb-2">
              Precisa de transfer?
            </h3>
            <p className="text-gray-400 max-w-md">
              Fortaleza, aeroporto de Cruz, Camocim, Preá e muito mais. Rotas tabeladas ou
              cotação personalizada.
            </p>
          </div>
          <Link
            to="/transfers"
            className="shrink-0 inline-flex items-center gap-2 h-12 px-7 bg-brand text-white font-semibold rounded-xl hover:bg-brand-600 transition-colors"
          >
            Ver Transfers
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Por que Giro Jeri */}
      <section className="max-w-6xl mx-auto px-4 mt-16 mb-4">
        <h2 className="font-display font-bold text-2xl md:text-3xl text-gray-900 text-center mb-10">
          Por que escolher a Giro Jeri?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Star,   title: 'Guias experientes', desc: 'Profissionais credenciados que conhecem cada cantinho de Jericoacoara.' },
            { icon: Users,  title: 'Grupos e privativo', desc: 'Passeios compartilhados ou exclusivos para você e seu grupo.' },
            { icon: Clock,  title: 'Reserva fácil',     desc: 'Reserve em minutos, sem burocracia. Confirmação imediata.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center p-6">
              <div className="w-12 h-12 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icon size={22} className="text-brand" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">{title}</h4>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
