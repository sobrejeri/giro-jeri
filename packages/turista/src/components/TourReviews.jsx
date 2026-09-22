import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Star } from 'lucide-react'
import { api } from '../lib/api'

// Estrelinhas (cheias/vazias) para uma nota 0..5.
function Stars({ value = 0, size = 14 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size}
          className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
      ))}
    </span>
  )
}

// Avaliações de UM passeio, exibidas na tela de detalhe (prova social).
export default function TourReviews({ tourId, ratingAverage, ratingCount }) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['tour-reviews', tourId],
    queryFn:  () => api.getCoopReviews({ service_type: 'tour', service_id: tourId, limit: 10 }),
    enabled:  !!tourId,
    staleTime: 60_000,
  })

  const reviews = Array.isArray(data) ? data : (data?.items || data?.reviews || [])
  const media   = Number(ratingAverage) || 0
  const total   = Number(ratingCount) || reviews.length

  // Sem nota e sem avaliações → não polui a tela.
  if (!isLoading && media <= 0 && reviews.length === 0) return null

  return (
    <div className="border-t border-gray-100 pt-6">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-bold text-gray-900">{t('tourDetailPg.reviews.title', 'Avaliações')}</h3>
        {media > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
            <Stars value={media} />
            <span className="font-bold text-gray-900">{media.toFixed(1).replace('.', ',')}</span>
            {total > 0 && <span className="text-gray-400">({total})</span>}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-400">{t('tourDetailPg.reviews.empty', 'Ainda sem comentários — seja o primeiro a avaliar!')}</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0 overflow-hidden flex items-center justify-center">
                {r.user?.profile_photo_url || r.author_avatar
                  ? <img src={r.user?.profile_photo_url || r.author_avatar} alt="" className="w-full h-full object-cover" />
                  : <span className="text-[13px] font-bold text-gray-500">{(r.author_name || r.user?.full_name || 'T')[0]}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-semibold text-gray-900">{r.author_name || r.user?.full_name || 'Turista'}</p>
                  <Stars value={r.rating} size={12} />
                </div>
                {r.comment_text && <p className="text-[13px] text-gray-600 leading-snug mt-0.5">{r.comment_text}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
