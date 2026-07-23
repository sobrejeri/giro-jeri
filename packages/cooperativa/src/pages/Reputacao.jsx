import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Star, MessageSquare, ShieldCheck, Award } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardBody } from '../components/ui/Card'

function Stars({ n, size = 16 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={size}
          className={s <= n ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
      ))}
    </div>
  )
}

const fmtDate = (iso) => {
  try { return format(parseISO(iso), "d 'de' MMM, yyyy", { locale: ptBR }) } catch { return '' }
}

export default function Reputacao() {
  const { data, isLoading } = useQuery({
    queryKey: ['operator-reviews'],
    queryFn:  () => api.getReviews(),
  })

  if (isLoading) return <PageSpinner />

  const summary = data?.summary || { rating_average: null, rating_count: 0, distribution: {} }
  const reviews = Array.isArray(data?.reviews) ? data.reviews : []
  const dist    = summary.distribution || {}
  const total   = summary.rating_count || 0
  const avg     = summary.rating_average

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={24} className="text-brand" /> Reputação
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Avaliações verificadas dos clientes que realizaram serviços com a sua cooperativa.
        </p>
      </div>

      {total === 0 ? (
        <Card>
          <CardBody className="py-16 text-center">
            <Award size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-semibold">Ainda não há avaliações.</p>
            <p className="text-sm text-gray-400 mt-1">
              Assim que os clientes avaliarem os serviços realizados, a nota da sua
              cooperativa aparece aqui.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Resumo: nota grande + distribuição */}
          <Card>
            <CardBody className="grid md:grid-cols-[220px_1fr] gap-6 items-center">
              <div className="text-center md:border-r md:border-gray-100 md:pr-6">
                <p className="text-5xl font-extrabold text-gray-900 leading-none">{avg}</p>
                <div className="flex justify-center mt-2">
                  <Stars n={Math.round(avg)} size={18} />
                </div>
                <p className="text-sm text-gray-400 mt-2">
                  {total} avaliação{total > 1 ? 'ões' : ''}
                </p>
              </div>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((star) => {
                  const c = dist[star] || 0
                  const pct = total ? Math.round((c / total) * 100) : 0
                  return (
                    <div key={star} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500 w-8 flex items-center gap-0.5">
                        {star} <Star size={11} className="fill-amber-400 text-amber-400" />
                      </span>
                      <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right">{c}</span>
                    </div>
                  )
                })}
              </div>
            </CardBody>
          </Card>

          {/* Lista de avaliações */}
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <MessageSquare size={14} /> Comentários dos clientes
            </h2>
            <div className="space-y-3">
              {reviews.map((r) => (
                <Card key={r.id}>
                  <CardBody className="flex items-start gap-3">
                    {r.author_photo
                      ? <img src={r.author_photo} alt={r.author_name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                      : <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-sm shrink-0">
                          {String(r.author_name || 'T')[0]}
                        </div>}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">{r.author_name}</p>
                        <span className="text-xs text-gray-400 shrink-0">{fmtDate(r.created_at)}</span>
                      </div>
                      <Stars n={r.rating} size={14} />
                      {r.comment && (
                        <p className="text-sm text-gray-700 leading-relaxed mt-2">"{r.comment}"</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">{r.service_name}</p>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
