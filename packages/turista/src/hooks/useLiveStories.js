import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { getSeen } from '../lib/liveStories'

// Compartilha o fetch dos stories efêmeros + estado do anel (novo/visto).
export function useLiveStories() {
  const { data: stories = [] } = useQuery({
    queryKey: ['liveStories'],
    queryFn:  () => api.getLiveStories(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const [tick, setTick] = useState(0)
  const hasStories = stories.length > 0
  const hasUnseen = useMemo(() => {
    const seen = getSeen()
    return stories.some((s) => !seen.has(s.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories, tick])
  return { stories, hasStories, hasUnseen, bumpSeen: () => setTick((t) => t + 1) }
}
