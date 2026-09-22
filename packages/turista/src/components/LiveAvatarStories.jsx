import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, Plus } from 'lucide-react'
import { useLiveStories } from '../hooks/useLiveStories'
import LiveStoryOverlay from './LiveStoryOverlay'
import LiveStoryComposer from './LiveStoryComposer'

/**
 * LiveAvatarStories — foto do perfil com anel de story (24h), estilo Instagram.
 * Toca no avatar → abre o story. Anel colorido = story novo (não visto).
 * Admin: botão "+" para adicionar, "quem viu" e excluir.
 */
export default function LiveAvatarStories({ avatarUrl, initials, isAdmin, uploadingPhoto, onPickPhoto }) {
  const qc = useQueryClient()
  const [viewerOpen, setViewerOpen]   = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const { stories, hasStories, hasUnseen, bumpSeen } = useLiveStories()

  const ring = hasStories
    ? (hasUnseen
        ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
        : 'bg-gray-300')
    : 'bg-transparent'

  return (
    <div className="relative shrink-0">
      {/* Anel + avatar */}
      <button
        onClick={() => { if (hasStories) setViewerOpen(true) }}
        className={`relative rounded-full p-[3px] ${ring} ${hasStories ? 'active:scale-95 transition-transform' : ''}`}
        aria-label={hasStories ? 'Ver story' : 'Foto do perfil'}
      >
        <div className="w-[82px] h-[82px] rounded-full bg-brand/10 flex items-center justify-center overflow-hidden ring-2 ring-white">
          {avatarUrl
            ? <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
            : <span className="text-brand font-bold text-[26px] leading-none select-none">{initials}</span>}
        </div>
      </button>

      {/* Trocar foto (admin) */}
      <button
        onClick={(e) => { e.stopPropagation(); if (!uploadingPhoto) onPickPhoto?.() }}
        className="absolute bottom-0 right-0 w-7 h-7 bg-brand rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform z-10"
        aria-label="Trocar foto"
      >
        {uploadingPhoto ? <Loader2 size={13} className="text-white animate-spin" /> : <Camera size={13} className="text-white" />}
      </button>

      {/* Adicionar story (admin) */}
      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); setComposerOpen(true) }}
          className="absolute -bottom-0.5 left-0 w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform z-10 border-2 border-white"
          aria-label="Adicionar story"
        >
          <Plus size={14} className="text-white" />
        </button>
      )}

      {viewerOpen && hasStories && (
        <LiveStoryOverlay
          stories={stories}
          avatarUrl={avatarUrl}
          isAdmin={isAdmin}
          onClose={() => setViewerOpen(false)}
          onSeen={bumpSeen}
        />
      )}

      {composerOpen && (
        <LiveStoryComposer
          onClose={() => setComposerOpen(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['liveStories'] })}
        />
      )}
    </div>
  )
}
