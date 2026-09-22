import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLiveStories } from '../hooks/useLiveStories'
import LiveStoryOverlay from './LiveStoryOverlay'
import LiveStoryComposer from './LiveStoryComposer'

/**
 * LiveStoriesRow — fileira de stories (24h) no topo da Descubra, estilo
 * Instagram: bolinha com anel colorido (novo) ou cinza (visto) + nome embaixo.
 * Hoje só a Turiva publica; admin vê "Seu story" para adicionar.
 */
export default function LiveStoriesRow({ className = '' }) {
  const { user } = useAuth()
  const isAdmin = user?.user_type === 'admin'
  const qc = useQueryClient()
  const { stories, hasStories, hasUnseen, bumpSeen } = useLiveStories()
  const [open, setOpen] = useState(false)
  const [composer, setComposer] = useState(false)

  if (!hasStories && !isAdmin) return null

  // Miniatura da bolinha: foto do perfil do admin (se logado) ou a 1ª mídia.
  const cover = user?.profile_photo_url
    || (stories.find((s) => s.media_type === 'image')?.media_url)
    || null

  const ring = hasStories
    ? (hasUnseen ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : 'bg-gray-300')
    : 'bg-gray-200'

  return (
    <div className={`bg-white ${className}`}>
      <div className="flex gap-4 overflow-x-auto px-4 py-3 scrollbar-hide">
        {/* Seu story (admin) */}
        {isAdmin && (
          <button onClick={() => setComposer(true)} className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform">
            <div className="relative w-[64px] h-[64px] rounded-full bg-gray-100 flex items-center justify-center overflow-hidden ring-2 ring-gray-200">
              {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <span className="text-brand font-bold text-[20px]">T</span>}
              <span className="absolute bottom-0 right-0 w-5 h-5 bg-brand rounded-full flex items-center justify-center border-2 border-white">
                <Plus size={12} className="text-white" />
              </span>
            </div>
            <span className="text-[11px] text-gray-600 max-w-[68px] truncate">Seu story</span>
          </button>
        )}

        {/* Story da Turiva */}
        {hasStories && (
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-1 shrink-0 active:scale-95 transition-transform">
            <div className={`rounded-full p-[2.5px] ${ring}`}>
              <div className="w-[64px] h-[64px] rounded-full bg-brand/10 flex items-center justify-center overflow-hidden ring-2 ring-white">
                {cover ? <img src={cover} alt="Turiva" className="w-full h-full object-cover" /> : <span className="text-brand font-bold text-[20px]">T</span>}
              </div>
            </div>
            <span className="text-[11px] text-gray-700 font-medium max-w-[68px] truncate">Turiva</span>
          </button>
        )}
      </div>

      {open && hasStories && (
        <LiveStoryOverlay
          stories={stories}
          avatarUrl={cover}
          isAdmin={isAdmin}
          onClose={() => setOpen(false)}
          onSeen={bumpSeen}
        />
      )}
      {composer && (
        <LiveStoryComposer onClose={() => setComposer(false)} onDone={() => qc.invalidateQueries({ queryKey: ['liveStories'] })} />
      )}
    </div>
  )
}
