import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import { Clock, Users, Zap, Sun, Waves, Anchor, Car } from 'lucide-react'

const CATEGORY_ICONS = {
  'buggy':      Zap,
  'por-do-sol': Sun,
  'lagoas':     Waves,
  'barco':      Anchor,
  'transfer':   Car,
}

const CATEGORIES = [
  { slug: '',           label: 'Todos' },
  { slug: 'buggy',     label: 'Buggy' },
  { slug: 'por-do-sol',label: 'Pôr do Sol' },
  { slug: 'lagoas',    label: 'Lagoas' },
  { slug: 'barco',     label: 'Barco' },
]

function TourCard({ tour }) {
  const IconComp = CATEGORY_ICONS[tour.category?.slug] || Zap

  return (
    <Link
      to={`/passeios/${tour.id}`}
      className="group flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
    >
      <div className="h-44 bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center relative">
        <IconComp size={44} className="text-brand/20" />
        {tour.highlight_badge && (
          <span className="absolute top-3 left-3 bg-brand text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            {tour.highlight_badge}
          </span>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <p className="text-xs font-medium text-brand mb-2">{tour.category?.name || 'Passeio'}</p>
        <h3 className="font-semibold text-gray-900 mb-1.5 group-hover:text-brand transition-colors line-clamp-2 leading-snug">
          {tour.name}
        </h3>
        <p className="text-sm text-gray-500 line-clamp-3 mb-4 flex-1">{tour.short_description}</p>

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {tour.duration_hours && (
              <span className="flex items-center gap-1"><Clock size={12} /> {tour.duration_hours}h</span>
            )}
            {tour.max_people && (
              <span className="flex items-center gap-1"><Users size={12} /> até {tour.max_people} pax</span>
            )}
          </div>
          {tour.is_shared_enabled && (
            <span className="text-sm font-bold text-brand">
              R$ {Number(tour.shared_price_per_person).toFixed(0)}<span className="text-xs font-normal text-gray-400">/pax</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

export default function Tours() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoria = searchParams.get('categoria') || ''

  const { data, isLoading } = useQuery({
    queryKey: ['tours', categoria],
    queryFn:  () => api.getTours(categoria ? { category_slug: categoria } : {}),
  })

  const tours = data?.tours || data || []

  function setCategoria(slug) {
    if (slug) setSearchParams({ categoria: slug })
    else      setSearchParams({})
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl md:text-4xl text-gray-900 mb-2">
          Passeios em Jericoacoara
        </h1>
        <p className="text-gray-500">Escolha o passeio perfeito para sua viagem</p>
      </div>

      {/* Filtro por categoria */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map(({ slug, label }) => (
          <button
            key={slug}
            onClick={() => setCategoria(slug)}
            className={`h-9 px-4 rounded-full text-sm font-medium transition-colors ${
              categoria === slug
                ? 'bg-brand text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : tours.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Zap size={40} className="mx-auto mb-3 opacity-30" />
          <p>Nenhum passeio encontrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </div>
      )}
    </div>
  )
}
