import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'
import { markSeen } from '../lib/liveStories'
import StoryViewer from './StoryViewer'

// ── Folha "quem viu" (admin) ─────────────────────────────────────────────
function ViewersSheet({ storyId, onClose }) {
  const { data: viewers = [], isLoading } = useQuery({
    queryKey: ['storyViewers', storyId],
    queryFn:  () => api.getLiveStoryViewers(storyId),
    enabled:  !!storyId,
  })
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-[115]" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[115] h-[60vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <p className="text-[15px] font-bold text-gray-900">Visualizações · {viewers.length}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={15} className="text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="text-center text-[13px] text-gray-400 py-10">Carregando…</p>
          ) : viewers.length === 0 ? (
            <p className="text-center text-[13px] text-gray-400 py-10">Ninguém viu ainda.</p>
          ) : viewers.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50">
              <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                {v.avatar ? <img src={v.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-[14px] font-bold text-gray-500">{(v.name || '?')[0]}</span>}
              </div>
              <p className="flex-1 text-[14px] font-semibold text-gray-800 truncate">{v.name}</p>
              <span className="text-[11px] text-gray-400">{new Date(v.viewed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}

/**
 * LiveStoryOverlay — abre os stories efêmeros SOBRE a tela atual (portal),
 * sem navegar. Reutilizado no perfil e no feed.
 *
 * Props: stories[], avatarUrl, isAdmin, onClose, onSeen()
 */
export default function LiveStoryOverlay({ stories = [], avatarUrl, isAdmin = false, onClose, onSeen }) {
  const qc = useQueryClient()
  const [viewersFor, setViewersFor] = useState(null)

  const grupo = [{
    id: 'perfil',
    title: 'Turiva',
    cover_image_url: avatarUrl || null,
    stories: stories.map((s) => ({
      id: s.id,
      media_url: s.media_url,
      media_type: s.media_type,
      display_name: s.caption,
      caption: s.caption,
      duration_sec: s.duration_sec,
      view_count: s.view_count,
      avatar_url: avatarUrl || null,
    })),
  }]

  async function handleView(id) {
    markSeen(id); onSeen?.()
    try { await api.viewLiveStory(id) } catch { /* silencioso */ }
  }
  async function handleShare(story) {
    const url = story.media_url
    try {
      if (navigator.share) await navigator.share({ title: 'Turiva', text: story.caption || 'Confira!', url })
      else { await navigator.clipboard?.writeText(url); alert('Link copiado!') }
    } catch { /* cancelado */ }
  }
  async function handleDelete(id) {
    try { await api.deleteLiveStory(id) }
    catch (err) { alert(err?.message || 'Erro ao excluir'); return }
    qc.invalidateQueries({ queryKey: ['liveStories'] })
    onClose()
  }

  if (!stories.length) return null

  return (
    <>
      <StoryViewer
        highlights={grupo}
        startGroup={0}
        onClose={onClose}
        isAdmin={isAdmin}
        onDelete={isAdmin ? handleDelete : undefined}
        onView={handleView}
        onShare={handleShare}
        onShowViewers={isAdmin ? ((s) => setViewersFor(s.id)) : undefined}
      />
      {viewersFor && <ViewersSheet storyId={viewersFor} onClose={() => setViewersFor(null)} />}
    </>
  )
}
