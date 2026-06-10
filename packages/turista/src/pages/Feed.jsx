import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  MapPin, Calendar, Clock, Heart, Share2, CalendarDays, PartyPopper,
} from 'lucide-react'

function fmtDate(d) {
  if (!d) return null
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function PostCard({ post }) {
  const [liked, setLiked] = useState(false)
  const dateLabel = fmtDate(post.event_date)

  function share() {
    const parts = [post.title]
    if (dateLabel)     parts.push(`🗓️ ${dateLabel}${post.event_time ? ` · ${post.event_time}` : ''}`)
    if (post.location) parts.push(`📍 ${post.location}`)
    const text = parts.join('\n')
    if (navigator.share) {
      navigator.share({ title: post.title, text }).catch(() => {})
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Cabeçalho do post */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center shrink-0">
          <MapPin size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-900 leading-tight">Giro Jeri</p>
          <p className="text-[11px] text-gray-400 leading-tight">Jericoacoara</p>
        </div>
        {dateLabel && (
          <span className="ml-auto inline-flex items-center gap-1 bg-orange-50 text-brand text-[11px] font-bold px-2.5 py-1 rounded-full">
            <Calendar size={12} /> {dateLabel}
          </span>
        )}
      </div>

      {/* Imagem */}
      {post.image_url ? (
        <img src={post.image_url} alt={post.title} className="w-full h-auto max-h-[80vh] object-cover bg-gray-100" />
      ) : (
        <div className="w-full aspect-[4/3] bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F] flex items-center justify-center p-6">
          <p className="text-white font-extrabold text-2xl text-center leading-tight">{post.title}</p>
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={() => setLiked((v) => !v)} className="active:scale-90 transition-transform" aria-label="Curtir">
          <Heart size={22} className={liked ? 'fill-red-500 text-red-500' : 'text-gray-700'} />
        </button>
        <button onClick={share} className="active:scale-90 transition-transform" aria-label="Compartilhar">
          <Share2 size={21} className="text-gray-700" />
        </button>
      </div>

      {/* Conteúdo */}
      <div className="px-4 py-3 space-y-1.5">
        <p className="text-[15px] font-bold text-gray-900">{post.title}</p>
        {post.body && (
          <p className="text-[13px] text-gray-600 whitespace-pre-line leading-relaxed">{post.body}</p>
        )}
        {(post.event_time || post.location) && (
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px] text-gray-500">
            {post.event_time && (
              <span className="flex items-center gap-1"><Clock size={12} className="text-brand" />{post.event_time}</span>
            )}
            {post.location && (
              <span className="flex items-center gap-1"><MapPin size={12} className="text-brand" />{post.location}</span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export default function Feed() {
  const { data, isLoading } = useQuery({ queryKey: ['feed'], queryFn: () => api.getFeed() })
  const posts = Array.isArray(data) ? data : (data?.data || [])

  return (
    <div className="min-h-full bg-[#F8F8F8] lg:bg-transparent pb-24 lg:pb-10">
      <header className="bg-white px-4 pt-6 pb-4 sticky top-0 lg:top-14 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-xl mx-auto flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
            <PartyPopper size={18} className="text-brand" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Eventos na Vila</h1>
            <p className="text-[12px] text-gray-400">O que vai rolar em Jericoacoara</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 space-y-4">
        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
            <CalendarDays size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-bold text-gray-800">Nenhum evento por aqui ainda</p>
            <p className="text-[13px] text-gray-400 mt-1">Volte em breve para conferir as novidades da vila!</p>
          </div>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </main>
    </div>
  )
}
