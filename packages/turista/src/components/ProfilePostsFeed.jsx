import { useRef, useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { PostCard } from '../pages/Feed'
import { usePostLikes } from '../hooks/usePostLikes'

// Feed vertical DENTRO do perfil (estilo Instagram): abre ao tocar numa
// publicação da grade, já posicionado no post tocado, com as publicações do
// próprio perfil — sem sair para a Descubra. Reusa o PostCard da Descubra e as
// curtidas compartilhadas (usePostLikes), então curtir aqui reflete lá e no
// total de curtidas do perfil.
export default function ProfilePostsFeed({ posts, startId, onClose, user, title }) {
  const { likedSet, handleLike } = usePostLikes(user)
  const itemRefs = useRef({})

  // Abre já rolado até a publicação tocada.
  useEffect(() => {
    const el = itemRefs.current[startId]
    if (el) el.scrollIntoView({ block: 'start' })
  }, [startId])

  // Trava o fundo enquanto o overlay está aberto.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <header className="bg-white px-4 pt-5 pb-3 border-b border-gray-100 shrink-0">
        <div className="relative flex items-center justify-center min-h-[32px] max-w-lg mx-auto">
          <button onClick={onClose} className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95" aria-label="Voltar">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <div className="text-center leading-tight">
            {title && <p className="text-[11px] text-gray-400 font-medium -mb-0.5">{title}</p>}
            <h1 className="font-giro font-semibold text-[17px] text-gray-900">Publicações</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-4 py-2 space-y-2">
          {(posts || []).map((p) => (
            <div key={p.id} ref={(el) => { itemRefs.current[p.id] = el }} className="scroll-mt-2">
              <PostCard post={p} liked={likedSet.has(p.id)} onLike={() => handleLike(p.id)} user={user} isAdmin={false} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
