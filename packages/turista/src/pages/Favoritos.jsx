import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Heart } from 'lucide-react'
import { api } from '../lib/api'
import { useFavorites } from '../contexts/FavoritesContext'
import { useRegion } from '../contexts/RegionContext'
import { PageSpinner } from '../components/ui/Spinner'
import TourCard from '../components/tours/TourCard'

export default function Favoritos() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { favs, toggleFav } = useFavorites()
  const { region } = useRegion?.() || {}

  const { data, isLoading } = useQuery({
    queryKey: ['favoritos-tours'],
    queryFn:  () => api.getTours({ limit: 200 }),
    staleTime: 5 * 60_000,
  })

  const tours = Array.isArray(data?.tours) ? data.tours
              : Array.isArray(data)        ? data
              : (data?.data || [])
  const favoritos = tours.filter((tr) => favs.has(tr.id))

  return (
    <div className="min-h-screen pb-6">
      {/* Cabeçalho */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform">
            <ChevronLeft size={18} className="text-gray-700" />
          </button>
          <h1 className="flex-1 text-center font-giro font-semibold text-[20px] text-gray-900">{t('favoritesPg.title', 'Favoritos')}</h1>
          <div className="w-9" />
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : favoritos.length === 0 ? (
        <div className="px-6 pt-24 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Heart size={26} className="text-gray-300" />
          </div>
          <p className="text-[15px] font-bold text-gray-700">{t('favoritesPg.emptyTitle', 'Nada salvo ainda')}</p>
          <p className="text-[12.5px] text-gray-400 mt-1">{t('favoritesPg.emptySubtitle', 'Toque no coração de um passeio para guardá-lo aqui.')}</p>
          <button onClick={() => navigate('/passeios')}
            className="mt-5 bg-brand text-white font-bold text-[13px] px-6 py-3 rounded-2xl active:scale-95 transition-transform">
            {t('favoritesPg.explore', 'Explorar passeios')}
          </button>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <p className="text-[13px] text-gray-500 mb-3">{t('favoritesPg.count', { count: favoritos.length, defaultValue: '{{count}} salvo(s)' })}</p>
          <div className="grid grid-cols-2 gap-3 [&>*]:w-full [&>*]:min-w-0 [&>*]:max-w-none">
            {favoritos.map((tour) => (
              <TourCard
                key={tour.id}
                tour={tour}
                isFav={favs.has(tour.id)}
                onFav={() => toggleFav(tour.id)}
                onSelect={() => navigate('/passeios', { state: { selectedId: tour.id } })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
