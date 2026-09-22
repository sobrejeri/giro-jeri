import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLiveStories } from '../hooks/useLiveStories'
import LiveStoryOverlay from './LiveStoryOverlay'
import LiveStoryComposer from './LiveStoryComposer'

/**
 * LiveStoriesRow — fileira de stories (24h) no topo da Descubra, estilo
 * Instagram: um CÍRCULO POR AUTOR (Turiva + cada operador), com anel colorido
 * (novo) ou cinza (visto) + nome embaixo. Admin/operador veem "Seu story" para
 * publicar; o dono pode excluir e ver quem viu (o overlay cuida disso).
 */
export default function LiveStoriesRow({ className = '' }) {
  const { user } = useAuth()
  const isCreator = user?.user_type === 'admin' || user?.user_type === 'operator'
  const qc = useQueryClient()
  const { grupos, hasStories, bumpSeen } = useLiveStories()
  const [viewer, setViewer] = useState(null)   // grupo aberto no viewer
  const [composer, setComposer] = useState(false)

  if (!hasStories && !isCreator) return null

  const meuGrupo = grupos.find((g) => g.authorId === user?.id) || null
  const outros   = grupos.filter((g) => g.authorId !== user?.id)
  const meuAvatar = meuGrupo?.authorAvatar || user?.profile_photo_url || null

  const anel = (hasUnseen) =>
    hasUnseen ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : 'bg-gray-300'

  return (
    <div className={`bg-white ${className}`}>
      <div className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-hide">
        {/* Seu story (admin/operador): abre o SEU story se já houver, senão o
            compositor; o "+" sempre adiciona. */}
        {isCreator && (
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className="relative">
              <button
                onClick={() => (meuGrupo ? setViewer(meuGrupo) : setComposer(true))}
                className="block active:scale-95 transition-transform"
                aria-label="Seu story"
              >
                <div className={`rounded-full p-[2.5px] ${meuGrupo ? anel(meuGrupo.hasUnseen) : 'bg-gray-200'}`}>
                  <div className="w-[64px] h-[64px] rounded-full bg-gray-100 flex items-center justify-center overflow-hidden ring-2 ring-white">
                    {meuAvatar
                      ? <img src={meuAvatar} alt="" className="w-full h-full object-cover" />
                      : <span className="text-brand font-bold text-[20px]">{(user?.full_name || 'T')[0]}</span>}
                  </div>
                </div>
              </button>
              <button
                onClick={() => setComposer(true)}
                aria-label="Adicionar ao story"
                className="absolute bottom-0 right-0 w-5 h-5 bg-brand rounded-full flex items-center justify-center border-2 border-white active:scale-90 z-10"
              >
                <Plus size={12} className="text-white" />
              </button>
            </div>
            <span className="text-[11px] text-gray-600 max-w-[68px] truncate">Seu story</span>
          </div>
        )}

        {/* Um círculo por autor (Turiva + operadores). */}
        {outros.map((g) => (
          <button
            key={g.authorId || g.authorName}
            onClick={() => setViewer(g)}
            className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform"
          >
            <div className={`rounded-full p-[2.5px] ${anel(g.hasUnseen)}`}>
              <div className="w-[64px] h-[64px] rounded-full bg-brand/10 flex items-center justify-center overflow-hidden ring-2 ring-white">
                {g.authorAvatar
                  ? <img src={g.authorAvatar} alt={g.authorName} className="w-full h-full object-cover" />
                  : <span className="text-brand font-bold text-[20px]">{(g.authorName || 'T')[0]}</span>}
              </div>
            </div>
            <span className="text-[11px] text-gray-700 font-medium max-w-[68px] truncate">{g.authorName}</span>
          </button>
        ))}
      </div>

      {viewer && (
        <LiveStoryOverlay
          stories={viewer.stories}
          avatarUrl={viewer.authorAvatar}
          // "Gerenciar" (excluir / ver quem viu) = admin OU dono do story.
          isAdmin={user?.user_type === 'admin' || viewer.authorId === user?.id}
          onClose={() => setViewer(null)}
          onSeen={bumpSeen}
        />
      )}
      {composer && (
        <LiveStoryComposer onClose={() => setComposer(false)} onDone={() => qc.invalidateQueries({ queryKey: ['liveStories'] })} />
      )}
    </div>
  )
}
