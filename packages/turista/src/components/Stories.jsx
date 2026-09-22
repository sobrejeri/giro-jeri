import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import StoriesRow from './StoriesRow'
import StoryViewer from './StoryViewer'
import StoryPublisher from './StoryPublisher'

// ── Destaques (stories) ────────────────────────────────
// Autocontido: busca, estado, visualizador e publicação (admin) ficam aqui,
// para poder ser exibido tanto na Home quanto na Descubra.
export default function Stories({ className = '', owner = null, canManage = null }) {
  const { user } = useAuth()
  // Gerenciar (publicar/excluir): admin sempre; ou o dono do perfil (operador
  // vendo os próprios destaques). `canManage` sobrescreve quando informado.
  const isManager = canManage != null ? canManage : (user?.user_type === 'admin')
  const qc = useQueryClient()

  const { data: stories = [] } = useQuery({
    queryKey:  ['stories', owner || 'all'],
    queryFn:   () => api.getStories(owner),
    staleTime: 60_000,
  })

  const [viewerGroup, setViewerGroup]     = useState(null)
  const [showPublisher, setShowPublisher] = useState(false)

  if (stories.length === 0 && !isManager) return null

  return (
    <>
      <div className={`bg-white border-b border-gray-100 ${className}`}>
        <StoriesRow
          highlights={stories}
          onSelect={(i) => setViewerGroup(i)}
          isAdmin={isManager}
          onPublish={() => setShowPublisher(true)}
        />
      </div>

      {viewerGroup != null && (
        <StoryViewer
          highlights={stories}
          startGroup={viewerGroup}
          onClose={() => setViewerGroup(null)}
          isAdmin={isManager}
          onDelete={async (id) => {
            try { await api.deleteStoryItem(id) }
            catch (err) { alert(err?.message || 'Erro ao excluir'); return }
            qc.invalidateQueries({ queryKey: ['stories', owner || 'all'] })
            setViewerGroup(null)
          }}
        />
      )}

      {showPublisher && (
        <StoryPublisher
          highlights={stories}
          onClose={() => setShowPublisher(false)}
          onPublished={() => qc.invalidateQueries({ queryKey: ['stories', owner || 'all'] })}
        />
      )}
    </>
  )
}
