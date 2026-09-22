import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Play } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useLiveStories } from '../hooks/useLiveStories'
import LiveStoryOverlay from '../components/LiveStoryOverlay'
import VerifiedBadge from '../components/VerifiedBadge'
import Stories from '../components/Stories'

// "10 mil", "1,5 mil", "1,2 mi" — número em formato compacto (pt-BR). Para a
// contagem de curtidas caber sem virar "10000".
const fmtCompacto = (n) =>
  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0)

// Perfil público da Turiva (aberto a partir do nome nas publicações do feed).
export default function PerfilPublico() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.user_type === 'admin'
  const { stories, hasStories, hasUnseen, bumpSeen } = useLiveStories()
  const [storyOpen, setStoryOpen] = useState(false)

  const { data: feed } = useQuery({ queryKey: ['feed'], queryFn: () => api.getFeed(), staleTime: 60_000 })
  const { data: highlights } = useQuery({ queryKey: ['stories'], queryFn: () => api.getStories(), staleTime: 60_000 })

  const posts = (Array.isArray(feed) ? feed : (feed?.data || [])).filter((p) => p.image_url || p.video_url)
  const avatarUrl = posts.find((p) => p.author_avatar)?.author_avatar || null
  const highlightCount = Array.isArray(highlights) ? highlights.length : 0
  // Curtidas somadas de todas as publicações (o feed já traz like_count por post).
  const totalCurtidas = posts.reduce((s, p) => s + (Number(p.like_count) || 0), 0)

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const ring = hasStories
    ? (hasUnseen ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600' : 'bg-gray-300')
    : 'bg-transparent'

  return (
    <div className="min-h-full pb-6 bg-[#f3efe9]">
      <header className="bg-white px-4 pt-5 pb-3 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="relative flex items-center justify-center min-h-[32px] max-w-lg mx-auto">
          <button onClick={() => navigate(-1)} className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95" aria-label="Voltar">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">Turiva</h1>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-3 max-w-lg mx-auto">
        {/* Cabeçalho estilo Instagram */}
        <div className="bg-white rounded-2xl shadow-sm px-5 py-5">
          <div className="flex items-center gap-5">
            <button
              onClick={() => { if (hasStories) setStoryOpen(true) }}
              className={`shrink-0 rounded-full p-[3px] ${ring} ${hasStories ? 'active:scale-95 transition-transform' : ''}`}
              aria-label={hasStories ? 'Ver story' : 'Turiva'}
            >
              <div className="w-[82px] h-[82px] rounded-full bg-brand/10 flex items-center justify-center overflow-hidden ring-2 ring-white">
                {avatarUrl
                  ? <img src={avatarUrl} alt="Turiva" className="w-full h-full object-cover" />
                  : <span className="text-brand font-bold text-[26px] leading-none">T</span>}
              </div>
            </button>
            <div className="flex-1 flex justify-around text-center pl-2">
              <div>
                <p className="text-[20px] font-extrabold text-gray-900 leading-none">{posts.length}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">publicações</p>
              </div>
              <div>
                <p className="text-[20px] font-extrabold text-gray-900 leading-none">{highlightCount}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">destaques</p>
              </div>
              <div>
                <p className="text-[20px] font-extrabold text-gray-900 leading-none">{fmtCompacto(totalCurtidas)}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">curtidas</p>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-gray-900 text-[15px] leading-tight">Turiva</p>
              <VerifiedBadge size={16} />
            </div>
            <p className="text-[12.5px] text-gray-500 mt-0.5">Passeios e Translados em Jericoacoara 🚗⛱️</p>
          </div>
        </div>

        {/* Destaques */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <Stories />
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
      </main>

      {storyOpen && hasStories && (
        <LiveStoryOverlay
          stories={stories}
          avatarUrl={avatarUrl}
          isAdmin={isAdmin}
          onClose={() => setStoryOpen(false)}
          onSeen={bumpSeen}
        />
      )}
    </div>
  )
}
