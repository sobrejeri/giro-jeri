import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  MapPin, Calendar, Clock, Heart, Share2, CalendarDays, PartyPopper,
  BadgePercent, BedDouble, UtensilsCrossed, ShoppingBag, Sparkles,
  Star, Instagram, Navigation,
} from 'lucide-react'

/* ── helpers ───────────────────────────────────────────── */
function fmtDate(d) {
  if (!d) return null
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z" />
    </svg>
  )
}

const CATS = {
  hospedagem:  { label: 'Onde ficar',  Icon: BedDouble },
  gastronomia: { label: 'Onde comer',  Icon: UtensilsCrossed },
  compras:     { label: 'Lojas',       Icon: ShoppingBag },
}

const FILTERS = [
  { id: 'tudo',        label: 'Tudo',        Icon: Sparkles },
  { id: 'eventos',     label: 'Eventos',     Icon: CalendarDays },
  { id: 'promocoes',   label: 'Promoções',   Icon: BadgePercent },
  { id: 'hospedagem',  label: 'Onde ficar',  Icon: BedDouble },
  { id: 'gastronomia', label: 'Onde comer',  Icon: UtensilsCrossed },
  { id: 'compras',     label: 'Lojas',       Icon: ShoppingBag },
]

function waLink(num) {
  const d = (num || '').replace(/\D/g, '')
  if (!d) return null
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`
}
function igLink(handle) {
  if (!handle) return null
  if (/^https?:\/\//.test(handle)) return handle
  return `https://instagram.com/${handle.replace(/^@/, '')}`
}
function mapLink(place) {
  if (place.maps_url) return place.maps_url
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} Jericoacoara`)}`
}

/* ── feed card (evento / promoção) ─────────────────────── */
function PostCard({ post }) {
  const [liked, setLiked] = useState(false)
  const isPromo  = post.kind === 'promo'
  const dateLabel = fmtDate(post.event_date)
  const validLabel = fmtDate(post.valid_until)

  function share() {
    const parts = [post.title]
    if (isPromo && post.discount_label) parts.push(`🏷️ ${post.discount_label}`)
    if (dateLabel)     parts.push(`🗓️ ${dateLabel}${post.event_time ? ` · ${post.event_time}` : ''}`)
    if (validLabel)    parts.push(`Válido até ${validLabel}`)
    if (post.location) parts.push(`📍 ${post.location}`)
    const text = parts.join('\n')
    if (navigator.share) navigator.share({ title: post.title, text }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isPromo ? 'bg-emerald-500' : 'bg-brand'}`}>
          {isPromo ? <BadgePercent size={16} className="text-white" /> : <MapPin size={16} className="text-white" />}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-gray-900 leading-tight">Giro Jeri</p>
          <p className="text-[11px] text-gray-400 leading-tight">{isPromo ? 'Promoção' : 'Evento'} · Jericoacoara</p>
        </div>
        {dateLabel && !isPromo && (
          <span className="ml-auto inline-flex items-center gap-1 bg-orange-50 text-brand text-[11px] font-bold px-2.5 py-1 rounded-full">
            <Calendar size={12} /> {dateLabel}
          </span>
        )}
        {isPromo && post.discount_label && (
          <span className="ml-auto inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[11px] font-extrabold px-2.5 py-1 rounded-full">
            {post.discount_label}
          </span>
        )}
      </div>

      {post.image_url ? (
        <img src={post.image_url} alt={post.title} className="w-full h-auto max-h-[80vh] object-cover bg-gray-100" />
      ) : (
        <div className={`w-full aspect-[4/3] flex items-center justify-center p-6 ${isPromo ? 'bg-gradient-to-br from-emerald-500 to-teal-400' : 'bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]'}`}>
          <p className="text-white font-extrabold text-2xl text-center leading-tight">{post.title}</p>
        </div>
      )}

      <div className="flex items-center gap-4 px-4 pt-3">
        <button onClick={() => setLiked((v) => !v)} className="active:scale-90 transition-transform" aria-label="Curtir">
          <Heart size={22} className={liked ? 'fill-red-500 text-red-500' : 'text-gray-700'} />
        </button>
        <button onClick={share} className="active:scale-90 transition-transform" aria-label="Compartilhar">
          <Share2 size={21} className="text-gray-700" />
        </button>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        <p className="text-[15px] font-bold text-gray-900">{post.title}</p>
        {post.body && <p className="text-[13px] text-gray-600 whitespace-pre-line leading-relaxed">{post.body}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px] text-gray-500">
          {post.event_time && <span className="flex items-center gap-1"><Clock size={12} className="text-brand" />{post.event_time}</span>}
          {validLabel && isPromo && <span className="flex items-center gap-1"><Calendar size={12} className="text-emerald-500" />Válido até {validLabel}</span>}
          {post.location && <span className="flex items-center gap-1"><MapPin size={12} className="text-brand" />{post.location}</span>}
        </div>
      </div>
    </article>
  )
}

/* ── estabelecimento ───────────────────────────────────── */
function PlaceCard({ place, compact = false }) {
  const cat = CATS[place.category] || CATS.gastronomia
  const wa = waLink(place.whatsapp)
  const ig = igLink(place.instagram)

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col ${compact ? 'w-64 shrink-0' : ''}`}>
      <div className="relative h-36">
        {place.image_url
          ? <img src={place.image_url} alt={place.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-orange-300 to-amber-200 flex items-center justify-center"><cat.Icon size={30} className="text-white/60" /></div>}
        {place.is_featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
            <Star size={11} className="fill-amber-950" /> Destaque
          </span>
        )}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-black/55 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          <cat.Icon size={11} /> {cat.label}
        </span>
      </div>

      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          <p className="font-bold text-gray-900 text-[14px] leading-tight flex-1">{place.name}</p>
          {place.price_range && <span className="text-[12px] font-bold text-emerald-600 shrink-0">{place.price_range}</span>}
        </div>
        {place.description && <p className="text-[12px] text-gray-500 mt-1 line-clamp-2 flex-1">{place.description}</p>}

        <div className="flex items-center gap-2 mt-3">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
               className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-green-500 text-white text-[12px] font-bold active:scale-95 transition-transform">
              <WhatsAppIcon size={14} /> WhatsApp
            </a>
          )}
          <a href={mapLink(place)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
             className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 active:scale-95 transition-transform" aria-label="Mapa">
            <Navigation size={15} />
          </a>
          {ig && (
            <a href={ig} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
               className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-gray-100 text-pink-500 active:scale-95 transition-transform" aria-label="Instagram">
              <Instagram size={15} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
      <Icon size={40} className="mx-auto text-gray-300 mb-3" />
      <p className="font-bold text-gray-800">{title}</p>
      <p className="text-[13px] text-gray-400 mt-1">{sub}</p>
    </div>
  )
}

function SectionTitle({ children }) {
  return <h2 className="text-[15px] font-extrabold text-gray-900 px-1">{children}</h2>
}

/* ── página ────────────────────────────────────────────── */
export default function Feed() {
  const [filter, setFilter] = useState('tudo')

  const { data: feedData,  isLoading: loadingFeed }  = useQuery({ queryKey: ['feed'],           queryFn: () => api.getFeed() })
  const { data: placeData, isLoading: loadingPlaces } = useQuery({ queryKey: ['establishments'], queryFn: () => api.getEstablishments() })

  const posts  = Array.isArray(feedData)  ? feedData  : (feedData?.data  || [])
  const places = Array.isArray(placeData) ? placeData : (placeData?.data || [])
  const isLoading = loadingFeed || loadingPlaces

  const events   = posts.filter((p) => p.kind !== 'promo')
  const promos   = posts.filter((p) => p.kind === 'promo')
  const featured = places.filter((p) => p.is_featured)

  let content
  if (isLoading) {
    content = (
      <div className="h-40 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  } else if (filter === 'eventos') {
    content = events.length
      ? events.map((p) => <PostCard key={p.id} post={p} />)
      : <EmptyState icon={CalendarDays} title="Nenhum evento ainda" sub="Volte em breve para conferir!" />
  } else if (filter === 'promocoes') {
    content = promos.length
      ? promos.map((p) => <PostCard key={p.id} post={p} />)
      : <EmptyState icon={BadgePercent} title="Nenhuma promoção ativa" sub="Fique de olho — logo aparecem ofertas!" />
  } else if (filter === 'hospedagem' || filter === 'gastronomia' || filter === 'compras') {
    const list = places.filter((p) => p.category === filter)
    content = list.length
      ? <div className="grid grid-cols-2 gap-3">{list.map((p) => <PlaceCard key={p.id} place={p} />)}</div>
      : <EmptyState icon={CATS[filter].Icon} title="Nada por aqui ainda" sub="Em breve novas recomendações na vila." />
  } else {
    // Tudo
    const blocks = []
    if (featured.length) {
      blocks.push(
        <section key="destaques" className="space-y-3">
          <SectionTitle>⭐ Destaques</SectionTitle>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
            {featured.map((p) => <PlaceCard key={p.id} place={p} compact />)}
          </div>
        </section>
      )
    }
    if (posts.length) {
      blocks.push(
        <section key="feed" className="space-y-4">
          <SectionTitle>🎉 Acontecendo na vila</SectionTitle>
          {posts.map((p) => <PostCard key={p.id} post={p} />)}
        </section>
      )
    }
    if (places.length) {
      blocks.push(
        <section key="places" className="space-y-3">
          <SectionTitle>📍 Estabelecimentos</SectionTitle>
          <div className="grid grid-cols-2 gap-3">{places.map((p) => <PlaceCard key={p.id} place={p} />)}</div>
        </section>
      )
    }
    content = blocks.length
      ? blocks
      : <EmptyState icon={Sparkles} title="Descubra a Vila em breve" sub="Eventos, promoções e recomendações da vila vão aparecer aqui." />
  }

  return (
    <div className="min-h-full bg-[#F8F8F8] lg:bg-transparent pb-24 lg:pb-10">
      <header className="bg-white px-4 pt-6 pb-3 sticky top-0 lg:top-14 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              <PartyPopper size={18} className="text-brand" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Descubra a Vila</h1>
              <p className="text-[12px] text-gray-400">Eventos, promoções e recomendações em Jericoacoara</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 mt-3 pb-1 scrollbar-hide">
            {FILTERS.map(({ id, label, Icon }) => {
              const active = filter === id
              return (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                    active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-6">
        {content}
      </main>
    </div>
  )
}
