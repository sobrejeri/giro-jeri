import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { getSeen } from '../lib/liveStories'

// Compartilha o fetch dos stories efêmeros + estado do anel (novo/visto).
// `stories` = lista plana; `grupos` = agrupados por AUTOR (cada operador/Turiva
// com o próprio círculo, estilo Instagram).
export function useLiveStories() {
  const { data: stories = [] } = useQuery({
    queryKey: ['liveStories'],
    queryFn:  () => api.getLiveStories(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const [tick, setTick] = useState(0)
  const hasStories = stories.length > 0

  const grupos = useMemo(() => {
    const seen = getSeen()
    const porAutor = new Map()
    for (const s of stories) {
      const key = s.author_id || 'turiva'
      if (!porAutor.has(key)) {
        porAutor.set(key, {
          authorId:     s.author_id || null,
          authorType:   s.author_type || null,
          authorName:   s.author_name || 'Turiva',
          authorAvatar: s.author_avatar || null,
          stories:      [],
        })
      }
      porAutor.get(key).stories.push(s)
    }
    const arr = [...porAutor.values()].map((g) => ({
      ...g,
      hasUnseen: g.stories.some((s) => !seen.has(s.id)),
      lastAt:    g.stories.reduce((m, s) => (s.created_at > m ? s.created_at : m), ''),
    }))
    // Não vistos primeiro; depois, mais recentes. Turiva (admin) por último
    // desempate para não roubar sempre o topo.
    arr.sort((a, b) =>
      (Number(b.hasUnseen) - Number(a.hasUnseen)) ||
      String(b.lastAt).localeCompare(String(a.lastAt)))
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, tick])

  const hasUnseen = useMemo(() => {
    const seen = getSeen()
    return stories.some((s) => !seen.has(s.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, tick])

  const grupoDe     = (authorId) => grupos.find((g) => g.authorId === authorId) || null
  const grupoTuriva = grupos.find((g) => g.authorType === 'admin') || null

  return {
    stories, grupos, grupoDe, grupoTuriva,
    hasStories, hasUnseen,
    bumpSeen: () => setTick((t) => t + 1),
  }
}
