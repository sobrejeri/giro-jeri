import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Play, Star, Loader2, Store } from 'lucide-react'
import { api } from '../lib/api'

// Perfil público do operador (aberto pelo nome/foto nas publicações do feed).
// Mostra as fotos/vídeos dos serviços que ele publicou. A lojinha com
// "adicionar ao carrinho" entra numa próxima fase.
export default function PerfilOperador() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: op, isLoading, isError } = useQuery({
    queryKey: ['operatorPublic', id],
    queryFn:  () => api.getOperatorPublic(id),
    enabled:  !!id,
    retry: false,
  })
  const { data: feed } = useQuery({ queryKey: ['feed'], queryFn: () => api.getFeed(), staleTime: 60_000 })

  const posts = (Array.isArray(feed) ? feed : (feed?.data || []))
    .filter((p) => p.created_by_user_id === id && (p.image_url || p.video_url))

  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div className="min-h-full pb-6 bg-[#f3efe9]">
      <header className="bg-white px-4 pt-5 pb-3 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="relative flex items-center justify-center min-h-[32px] max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95" aria-label="Voltar">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[20px] text-gray-900 tracking-wide truncate max-w-[70%]">
            {op?.full_name || 'Operador'}
          </h1>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-brand" /></div>
        ) : isError || !op ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-[14px] text-gray-600">Operador não encontrado.</p>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="bg-white rounded-2xl shadow-sm px-5 py-5">
              <div className="flex items-center gap-5">
                <div className="w-[82px] h-[82px] rounded-full bg-brand/10 flex items-center justify-center overflow-hidden ring-2 ring-gray-100 shrink-0">
                  {op.profile_photo_url
                    ? <img src={op.profile_photo_url} alt={op.full_name} className="w-full h-full object-cover" />
                    : <span className="text-brand font-bold text-[26px]">{(op.full_name || '?')[0]}</span>}
                </div>
                <div className="flex-1 flex justify-around text-center">
                  <div>
                    <p className="text-[20px] font-extrabold text-gray-900 leading-none">{posts.length}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5">publicações</p>
                  </div>
                  {op.rating_count > 0 && (
                    <div>
                      <p className="text-[20px] font-extrabold text-gray-900 leading-none flex items-center gap-0.5 justify-center">
                        {op.rating_average}<Star size={14} className="fill-amber-400 text-amber-400" />
                      </p>
                      <p className="text-[12px] text-gray-500 mt-0.5">{op.rating_count} aval.</p>
                    </div>
                  )}
                </div>
              </div>
              <p className="font-bold text-gray-900 text-[15px] mt-3">{op.full_name}</p>
              <p className="text-[12.5px] text-gray-500">Operador parceiro · Jericoacoara</p>

              {/* Lojinha (em breve) */}
              <button
                onClick={() => navigate('/passeios')}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-xl py-2.5 text-[13px] active:scale-[0.98] transition-transform"
              >
                <Store size={15} /> Ver serviços
              </button>
            </div>

            {/* Grade de publicações */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
                <span className="font-semibold text-gray-800 text-[14px]">Publicações</span>
                <span className="text-[12px] font-bold text-gray-400">{posts.length} posts</span>
              </div>
              {posts.length === 0 ? (
                <p className="text-center text-[13px] text-gray-500 py-10">Nenhuma publicação ainda.</p>
              ) : (
                <div className="grid grid-cols-3 gap-0.5 p-0.5">
                  {posts.map((p) => (
                    <button key={p.id} onClick={() => navigate('/eventos')} className="relative aspect-square bg-gray-100 overflow-hidden active:opacity-80">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.title || ''} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                        <video src={`${p.video_url}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
                      )}
                      {p.video_url && <span className="absolute top-1 right-1 text-white drop-shadow"><Play size={13} className="fill-white" /></span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
