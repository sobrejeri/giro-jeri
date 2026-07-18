import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Star, Filter, MessageSquare, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'

const fmtDate = (iso) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(iso))
  } catch { return '' }
}

function Stars({ n, size = 15 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={size}
          className={s <= n ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
      ))}
    </div>
  )
}

export default function Avaliacoes() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [operatorId, setOperatorId] = useState(searchParams.get('operator') || '') // '' = todas
  const [minRating,  setMinRating]  = useState(0)     // 0 = qualquer nota

  // Reputação por cooperativa — vira os chips de filtro
  const { data: summary } = useQuery({
    queryKey: ['reviews-summary'],
    queryFn:  () => api.getCoopReviewsSummary(),
    staleTime: 60_000,
  })
  const coops = Array.isArray(summary) ? summary : []

  const params = useMemo(() => {
    const p = { limit: 50 }
    if (operatorId) p.operator_id = operatorId
    if (minRating)  p.min_rating  = minRating
    return p
  }, [operatorId, minRating])

  const { data, isLoading } = useQuery({
    queryKey: ['reviews-list', operatorId, minRating],
    queryFn:  () => api.getCoopReviews(params),
    keepPreviousData: true,
  })
  const reviews = Array.isArray(data?.reviews) ? data.reviews : []
  const total   = data?.total ?? reviews.length

  const activeCoop = coops.find((c) => c.operator_id === operatorId)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">
      {/* Cabeçalho */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-[28px] font-extrabold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={26} className="text-brand" /> {t('reviewsPg.title')}
        </h1>
        <p className="text-[13px] text-gray-500 mt-1">
          {t('reviewsPg.subtitle')}
        </p>
      </div>

      {/* Filtro por cooperativa */}
      {coops.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1">
            <Filter size={12} /> {t('reviewsPg.filterByCoop')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setOperatorId('')}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                !operatorId ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t('reviewsPg.all')}
            </button>
            {coops.map((c) => (
              <button
                key={c.operator_id}
                onClick={() => setOperatorId(c.operator_id === operatorId ? '' : c.operator_id)}
                className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border inline-flex items-center gap-1.5 transition-colors ${
                  c.operator_id === operatorId ? 'bg-brand text-white border-brand' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {c.operator_name}
                <span className={`inline-flex items-center gap-0.5 ${c.operator_id === operatorId ? 'text-amber-200' : 'text-amber-500'}`}>
                  <Star size={11} className="fill-current" /> {c.rating_average}
                </span>
                <span className={c.operator_id === operatorId ? 'text-white/70' : 'text-gray-400'}>
                  ({c.rating_count})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtro por nota mínima */}
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">{t('reviewsPg.minRating')}</p>
        <div className="flex flex-wrap gap-2">
          {[0, 5, 4, 3].map((n) => (
            <button
              key={n}
              onClick={() => setMinRating(n)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border inline-flex items-center gap-1 transition-colors ${
                minRating === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {n === 0 ? t('reviewsPg.all') : <>{t('reviewsPg.ratingPlus', { n })} <Star size={11} className="fill-amber-400 text-amber-400" /></>}
            </button>
          ))}
        </div>
      </div>

      {/* Destaque da coop selecionada */}
      {activeCoop && (
        <div className="mb-5 rounded-2xl border border-brand/20 bg-brand/5 p-4 flex items-center gap-3">
          {activeCoop.operator_photo
            ? <img src={activeCoop.operator_photo} alt={activeCoop.operator_name} className="w-12 h-12 rounded-full object-cover" />
            : <div className="w-12 h-12 rounded-full bg-brand/15 flex items-center justify-center text-brand font-bold">
                {String(activeCoop.operator_name || 'C')[0]}
              </div>}
          <div>
            <p className="font-bold text-gray-900">{activeCoop.operator_name}</p>
            <div className="flex items-center gap-2 text-[13px] text-gray-500">
              <Stars n={Math.round(activeCoop.rating_average)} size={14} />
              <span className="font-semibold text-gray-700">{activeCoop.rating_average}</span>
              <span>· {t('reviewsPg.reviewsCount', { count: activeCoop.rating_count })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-semibold">{t('reviewsPg.empty.title')}</p>
          <p className="text-[13px] text-gray-400 mt-1">
            {t('reviewsPg.empty.subtitle')}
          </p>
        </div>
      ) : (
        <>
          <p className="text-[12px] text-gray-400 mb-3">{t('reviewsPg.reviewsCount', { count: total })}</p>
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-3">
                  {r.author_photo
                    ? <img src={r.author_photo} alt={r.author_name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-300 flex items-center justify-center text-white font-bold text-[13px] shrink-0">
                        {String(r.author_name || 'T')[0]}
                      </div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-gray-900 text-[14px] truncate">{r.author_name}</p>
                      <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(r.created_at)}</span>
                    </div>
                    <Stars n={r.rating} />
                    {r.comment && (
                      <p className="text-gray-700 text-[14px] leading-relaxed mt-2">"{r.comment}"</p>
                    )}
                    <p className="text-[12px] text-gray-400 mt-2">
                      {r.service_name}{r.operator_name ? ` · ${r.operator_name}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
