import { useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

// Curtidas do feed, compartilhadas entre a Descubra e o feed dentro do perfil.
// Usa as MESMAS chaves de cache (['feed'], ['my-likes']) que a Descubra, então
// curtir num lugar reflete no outro na hora — e o número de curtidas do perfil
// (que soma like_count) fica em sincronia.
export function usePostLikes(user) {
  const qc = useQueryClient()

  const { data: myLikes } = useQuery({
    queryKey: ['my-likes'],
    queryFn:  () => api.getMyLikes(),
    enabled:  !!user,
  })
  const likedSet = useMemo(() => new Set(myLikes || []), [myLikes])

  const likeMut = useMutation({
    mutationFn: (postId) => api.likePost(postId),
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: ['feed'] })
      await qc.cancelQueries({ queryKey: ['my-likes'] })
      const prevFeed  = qc.getQueryData(['feed'])
      const prevLikes = qc.getQueryData(['my-likes'])
      const wasLiked  = new Set(prevLikes || []).has(postId)
      qc.setQueryData(['my-likes'], (old) =>
        wasLiked ? (old || []).filter((id) => id !== postId) : [...(old || []), postId])
      qc.setQueryData(['feed'], (old) => (old || []).map((p) =>
        p.id === postId ? { ...p, like_count: (p.like_count || 0) + (wasLiked ? -1 : 1) } : p))
      return { prevFeed, prevLikes }
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prevFeed)  qc.setQueryData(['feed'], ctx.prevFeed)
      if (ctx?.prevLikes) qc.setQueryData(['my-likes'], ctx.prevLikes)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['my-likes'] })
    },
  })

  const handleLike = useCallback((postId) => {
    if (!user) return
    likeMut.mutate(postId)
  }, [user, likeMut])

  return { likedSet, handleLike }
}
