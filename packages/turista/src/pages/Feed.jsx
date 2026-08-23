import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useRegion } from '../contexts/RegionContext'
import Stories from '../components/Stories'
import VerifiedBadge from '../components/VerifiedBadge'
import FeedPublisher from '../components/FeedPublisher'
import {
  MapPin, Calendar, Clock, Heart, Share2, CalendarDays, PartyPopper,
  BadgePercent, BedDouble, UtensilsCrossed, ShoppingBag, Sparkles,
  Star, Instagram, Navigation, Globe, MessageCircle, Send, Trash2, X,
  ChevronLeft, Search, Pencil, Plus,
} from 'lucide-react'

const JERI_CENTER = { lat: -2.7939, lon: -40.5137 }

/* ── helpers ───────────────────────────────────────────── */
function fmtDate(d) {
  if (!d) return null
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function timeAgo(iso, t) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('feedPg.timeNow')
  if (min < 60) return t('feedPg.timeMinutes', { count: min })
  const h = Math.floor(min / 60)
  if (h < 24) return t('feedPg.timeHours', { count: h })
  const d = Math.floor(h / 24)
  return t('feedPg.timeDays', { count: d })
}

function WhatsAppIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z" />
    </svg>
  )
}

const CAT_ICONS = {
  hospedagem:  BedDouble,
  gastronomia: UtensilsCrossed,
  compras:     ShoppingBag,
}

function getCats(t) {
  return {
    hospedagem:  { label: t('feedPg.catStay'), Icon: BedDouble },
    gastronomia: { label: t('feedPg.catEat'),  Icon: UtensilsCrossed },
    compras:     { label: t('feedPg.catShop'), Icon: ShoppingBag },
  }
}

function getFilters(t) {
  return [
    { id: 'tudo',        label: t('feedPg.filterAll'),    Icon: Sparkles },
    { id: 'eventos',     label: t('feedPg.filterEvents'), Icon: CalendarDays },
    { id: 'promocoes',   label: t('feedPg.filterPromos'), Icon: BadgePercent },
    { id: 'hospedagem',  label: t('feedPg.catStay'),      Icon: BedDouble },
    { id: 'gastronomia', label: t('feedPg.catEat'),       Icon: UtensilsCrossed },
    { id: 'compras',     label: t('feedPg.catShop'),      Icon: ShoppingBag },
  ]
}

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

/* ── StarRating ────────────────────────────────────────── */
function StarRating({ value, onChange, size = 18 }) {
  const stars = [1, 2, 3, 4, 5]
  if (onChange) {
    return (
      <div className="flex gap-0.5">
        {stars.map((s) => (
          <button key={s} type="button" onClick={() => onChange(s)} className="p-0.5 active:scale-110 transition-transform">
            <Star size={size} className={s <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="flex gap-0.5 items-center">
      {stars.map((s) => (
        <Star key={s} size={size} className={s <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
      ))}
    </div>
  )
}

/* ── Comments Section ──────────────────────────────────── */
function CommentsSection({ postId, commentCount, user, open, setOpen }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const qc = useQueryClient()

  const { data: comments, isLoading } = useQuery({
    queryKey: ['comments', postId],
    queryFn:  () => api.getComments(postId),
    enabled:  open,
  })

  const addMut = useMutation({
    mutationFn: (body) => api.addComment(postId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comments', postId] }); qc.invalidateQueries({ queryKey: ['feed'] }); setText('') },
  })

  const delMut = useMutation({
    mutationFn: (id) => api.deleteComment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comments', postId] }); qc.invalidateQueries({ queryKey: ['feed'] }) },
  })

  function handleSubmit(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    addMut.mutate(body)
  }

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700">
        <MessageCircle size={15} />
        {commentCount > 0 ? t('feedPg.commentsCount', { count: commentCount }) : t('feedPg.comment')}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2.5 max-h-60 overflow-y-auto">
              {(comments || []).map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0 overflow-hidden">
                    {c.users?.profile_photo_url
                      ? <img src={c.users.profile_photo_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-500">{(c.users?.full_name || '?')[0]}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px]">
                      <span className="font-bold text-gray-900">{c.users?.full_name || t('feedPg.anonymousUser')}</span>{' '}
                      <span className="text-gray-600">{c.body}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">{timeAgo(c.created_at, t)}</span>
                      {user && c.user_id === user.id && (
                        <button onClick={() => delMut.mutate(c.id)} className="text-[10px] text-gray-400 hover:text-red-400">{t('feedPg.delete')}</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(comments || []).length === 0 && (
                <p className="text-[12px] text-gray-400 text-center py-2">{t('feedPg.noComments')}</p>
              )}
            </div>
          )}

          {user ? (
            <form onSubmit={handleSubmit} className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('feedPg.commentPlaceholder')}
                  maxLength={500}
                  className="flex-1 h-9 px-3 rounded-full bg-gray-100 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || addMut.isPending}
                  className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform"
                >
                  <Send size={14} />
                </button>
              </div>
              {addMut.isError && (
                <p className="text-[11px] text-red-500 px-1">
                  {addMut.error?.message || t('feedPg.sendError')}
                </p>
              )}
            </form>
          ) : (
            <p className="text-[12px] text-gray-400 text-center">{t('feedPg.loginToComment')}</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Review Modal ──────────────────────────────────────── */
function ReviewModal({ place, onClose, user }) {
  const { t } = useTranslation()
  const [rating, setRating]   = useState(0)
  const [comment, setComment] = useState('')
  const qc = useQueryClient()

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['reviews', place.id],
    queryFn:  () => api.getReviews(place.id),
  })

  const addMut = useMutation({
    mutationFn: (body) => api.addReview(place.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reviews', place.id] }); qc.invalidateQueries({ queryKey: ['establishments'] }); setRating(0); setComment('') },
  })

  const delMut = useMutation({
    mutationFn: (id) => api.deleteReview(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reviews', place.id] }); qc.invalidateQueries({ queryKey: ['establishments'] }) },
  })

  function handleSubmit(e) {
    e.preventDefault()
    if (rating < 1) return
    addMut.mutate({ rating, comment: comment.trim() || null })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-[15px]">{place.name}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-4 space-y-4">
          {user && (
            <form onSubmit={handleSubmit} className="space-y-3 pb-3 border-b border-gray-100">
              <p className="text-[13px] font-semibold text-gray-700">{t('feedPg.yourReview')}</p>
              <StarRating value={rating} onChange={setRating} size={28} />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('feedPg.commentOptionalPlaceholder')}
                maxLength={500}
                rows={2}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              />
              <button
                type="submit"
                disabled={rating < 1 || addMut.isPending}
                className="w-full h-10 rounded-xl bg-brand text-white text-[13px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
              >
                {addMut.isPending ? t('feedPg.sending') : t('feedPg.submitReview')}
              </button>
              {addMut.isError && (
                <p className="text-[11px] text-red-500">
                  {addMut.error?.message || t('feedPg.sendError')}
                </p>
              )}
            </form>
          )}
          {!user && (
            <p className="text-[13px] text-gray-400 text-center py-2">{t('feedPg.loginToReview')}</p>
          )}

          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (reviews || []).length > 0 ? (
            <div className="space-y-3">
              <p className="text-[13px] font-semibold text-gray-700">{t('feedPg.reviewsCount', { count: reviews.length })}</p>
              {reviews.map((r) => (
                <div key={r.id} className="flex gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0 overflow-hidden">
                    {r.users?.profile_photo_url
                      ? <img src={r.users.profile_photo_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-gray-500">{(r.users?.full_name || '?')[0]}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-bold text-gray-900">{r.users?.full_name || t('feedPg.anonymousUser')}</span>
                      <StarRating value={r.rating} size={11} />
                    </div>
                    {r.comment && <p className="text-[12px] text-gray-600 mt-0.5">{r.comment}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-gray-400">{timeAgo(r.created_at, t)}</span>
                      {user && r.user_id === user.id && (
                        <button onClick={() => delMut.mutate(r.id)} className="text-[10px] text-gray-400 hover:text-red-400">{t('feedPg.delete')}</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-gray-400 text-center py-4">{t('feedPg.noReviews')}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ── feed card (evento / promoção) ─────────────────────── */
function PostCard({ post, liked, onLike, user, isAdmin, onEdit, onDelete }) {
  const { t } = useTranslation()
  const [commentsOpen, setCommentsOpen] = useState(false)
  const isPromo  = post.kind === 'promo'
  const dateLabel = fmtDate(post.event_date)
  const validLabel = fmtDate(post.valid_until)

  function share() {
    const parts = [post.title]
    if (isPromo && post.discount_label) parts.push(`🏷️ ${post.discount_label}`)
    if (dateLabel)     parts.push(`🗓️ ${dateLabel}${post.event_time ? ` · ${post.event_time}` : ''}`)
    if (validLabel)    parts.push(t('feedPg.validUntil', { date: validLabel }))
    if (post.location) parts.push(`📍 ${post.location}`)
    const text = parts.join('\n')
    if (navigator.share) navigator.share({ title: post.title, text }).catch(() => {})
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <article className="-mx-4 bg-white">
      {/* ── Mídia full-bleed (estilo Instagram): preenche a largura toda; fundo
          desfocado completa as laterais sem cortar/ampliar a imagem ── */}
      <div className="relative w-full aspect-[4/5] overflow-hidden bg-gray-900">
        {post.image_url ? (
          <>
            <img src={post.image_url} alt="" aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60" draggable={false} />
            <img src={post.image_url} alt={post.title}
              className="relative z-10 w-full h-full object-contain" draggable={false} />
          </>
        ) : (
          <div className={`w-full h-full flex items-center justify-center p-6 ${isPromo ? 'bg-gradient-to-br from-emerald-500 to-teal-400' : 'bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]'}`}>
            <p className="text-white font-extrabold text-2xl text-center leading-tight">{post.title}</p>
          </div>
        )}

        {/* Gradiente + cabeçalho SOBRE a imagem */}
        <div className="absolute top-0 inset-x-0 h-24 z-20 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
        <div className="absolute top-3 inset-x-0 z-20 px-4 flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden border-2 border-white/70 ${isPromo ? 'bg-emerald-500' : 'bg-brand'}`}>
            {post.author_avatar ? (
              <img src={post.author_avatar} alt="" className="w-full h-full object-cover" />
            ) : isPromo ? (
              <BadgePercent size={16} className="text-white" />
            ) : (
              <MapPin size={16} className="text-white" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-white leading-tight drop-shadow flex items-center gap-1">
              Turiva <VerifiedBadge size={13} />
            </p>
            <p className="text-[11px] text-white/80 leading-tight drop-shadow">{isPromo ? t('feedPg.promoLabel') : t('feedPg.eventLabel')} · Jericoacoara</p>
          </div>
          {dateLabel && !isPromo && (
            <span className="ml-auto inline-flex items-center gap-1 bg-white/90 backdrop-blur text-brand text-[11px] font-bold px-2.5 py-1 rounded-full shadow">
              <Calendar size={12} /> {dateLabel}
            </span>
          )}
          {isPromo && post.discount_label && (
            <span className="ml-auto inline-flex items-center gap-1 bg-white/90 backdrop-blur text-emerald-600 text-[11px] font-extrabold px-2.5 py-1 rounded-full shadow">
              {post.discount_label}
            </span>
          )}
        </div>
      </div>

      {/* ── Ações (curtir · comentar · compartilhar) ── */}
      <div className="flex items-center gap-5 px-4 pt-3">
        <button onClick={onLike} className="active:scale-90 transition-transform" aria-label={t('feedPg.like')}>
          <Heart size={24} className={liked ? 'fill-red-500 text-red-500' : 'text-gray-800'} />
        </button>
        <button onClick={() => setCommentsOpen((v) => !v)} className="active:scale-90 transition-transform" aria-label={t('feedPg.comment')}>
          <MessageCircle size={23} className="text-gray-800" />
        </button>
        <button onClick={share} className="active:scale-90 transition-transform" aria-label={t('feedPg.share')}>
          <Share2 size={22} className="text-gray-800" />
        </button>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => onEdit?.(post)} className="active:scale-90 transition-transform" aria-label={t('feedPg.edit')}>
              <Pencil size={19} className="text-gray-500" />
            </button>
            <button onClick={() => onDelete?.(post)} className="active:scale-90 transition-transform" aria-label={t('feedPg.delete')}>
              <Trash2 size={19} className="text-red-400" />
            </button>
          </div>
        )}
      </div>

      {post.like_count > 0 && (
        <p className="px-4 mt-1.5 text-[13px] font-bold text-gray-900">
          {t('feedPg.likesCount', { count: post.like_count })}
        </p>
      )}

      <div className="px-4 py-3 space-y-1.5">
        <p className="text-[14px] text-gray-900">
          <span className="font-bold">Turiva</span>{' '}
          <span className="font-semibold">{post.title}</span>
        </p>
        {post.body && <p className="text-[13px] text-gray-600 whitespace-pre-line leading-relaxed">{post.body}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px] text-gray-500">
          {post.event_time && <span className="flex items-center gap-1"><Clock size={12} className="text-brand" />{post.event_time}</span>}
          {validLabel && isPromo && <span className="flex items-center gap-1"><Calendar size={12} className="text-emerald-500" />{t('feedPg.validUntil', { date: validLabel })}</span>}
          {post.location && <span className="flex items-center gap-1"><MapPin size={12} className="text-brand" />{post.location}</span>}
        </div>
        <div className="pt-1">
          <CommentsSection postId={post.id} commentCount={post.comment_count || 0} user={user}
            open={commentsOpen} setOpen={setCommentsOpen} />
        </div>
      </div>
    </article>
  )
}

/* ── estabelecimento ───────────────────────────────────── */
function PlaceCard({ place, compact = false, onReview }) {
  const { t } = useTranslation()
  const CATS = getCats(t)
  const cat = CATS[place.category] || CATS.gastronomia
  const wa  = waLink(place.whatsapp)
  const ig  = igLink(place.instagram)
  const web = place.website || null
  const km  = place.distance != null ? (place.distance / 1000) : null

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col ${compact ? 'w-64 shrink-0' : ''}`}>
      <div className="relative h-36" onClick={onReview} role="button" tabIndex={0}>
        {place.image_url
          ? <img src={place.image_url} alt={place.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-orange-300 to-amber-200 flex items-center justify-center"><cat.Icon size={30} className="text-white/60" /></div>}
        {place.is_featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
            <Star size={11} className="fill-amber-950" /> {t('feedPg.featured')}
          </span>
        )}
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-black/55 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
          <cat.Icon size={11} /> {cat.label}{place.locality ? ` · ${place.locality}` : ''}{km != null ? ` · ${km.toFixed(1)} km` : ''}
        </span>
      </div>

      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          <p className="font-bold text-gray-900 text-[14px] leading-tight flex-1">{place.name}</p>
          {place.price_range && <span className="text-[12px] font-bold text-emerald-600 shrink-0">{place.price_range}</span>}
        </div>

        {(place.avg_rating != null || place.review_count > 0) && (
          <button onClick={onReview} className="flex items-center gap-1.5 mt-1.5 group">
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map((s) => (
                <Star key={s} size={11} className={s <= Math.round(place.avg_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
              ))}
            </div>
            <span className="text-[11px] font-semibold text-gray-500 group-hover:text-brand">
              {place.avg_rating} ({place.review_count})
            </span>
          </button>
        )}
        {!place.avg_rating && !place.review_count && place.id && (
          <button onClick={onReview} className="flex items-center gap-1 mt-1.5 text-[11px] text-gray-400 hover:text-brand">
            <Star size={11} /> {t('feedPg.rate')}
          </button>
        )}

        {place.description && <p className="text-[12px] text-gray-500 mt-1 line-clamp-2">{place.description}</p>}
        {place.price_note && <p className="text-[11px] font-semibold text-emerald-600 mt-1">{place.price_note}</p>}
        <div className="flex-1" />

        <div className="flex items-center gap-2 mt-3">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
               className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-green-500 text-white text-[12px] font-bold active:scale-95 transition-transform">
              <WhatsAppIcon size={14} /> WhatsApp
            </a>
          )}
          <a href={mapLink(place)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
             className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 active:scale-95 transition-transform" aria-label={t('feedPg.map')}>
            <Navigation size={15} />
          </a>
          {ig && (
            <a href={ig} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
               className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-gray-100 text-pink-500 active:scale-95 transition-transform" aria-label="Instagram">
              <Instagram size={15} />
            </a>
          )}
          {web && (
            <a href={web} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
               className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-gray-100 text-blue-500 active:scale-95 transition-transform" aria-label={t('feedPg.website')}>
              <Globe size={15} />
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [filter, setFilter]       = useState('tudo')
  const [reviewPlace, setReviewPlace] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { user } = useAuth()
  const { userCoords, region, getServiceQuery } = useRegion()
  const qc = useQueryClient()
  const FILTERS = useMemo(() => getFilters(t), [t])

  // Publicação no feed (admin): compositor/editor. undefined = fechado,
  // null = nova publicação, objeto = editar aquele post.
  const isAdmin = user?.user_type === 'admin'
  const [composerPost, setComposerPost] = useState(undefined)
  async function handleDeletePost(post) {
    if (!confirm(t('feedPg.confirmDelete', { title: post.title }))) return
    try { await api.deletePost(post.id) } catch (err) { alert(err?.message || t('feedPg.deleteError')); return }
    qc.invalidateQueries({ queryKey: ['feed'] })
  }

  const center = (userCoords?.lat != null && userCoords?.lon != null)
    ? userCoords
    : (region?.center_latitude != null
        ? { lat: region.center_latitude, lon: region.center_longitude }
        : JERI_CENTER)

  const { data: feedData,   isLoading: loadingFeed }   = useQuery({ queryKey: ['feed'],           queryFn: () => api.getFeed() })
  const { data: placeData,  isLoading: loadingPlaces } = useQuery({ queryKey: ['establishments', region?.id], queryFn: () => api.getEstablishments(getServiceQuery()) })
  const { data: nearbyData, isLoading: loadingNearby } = useQuery({
    queryKey:  ['nearby', center.lat?.toFixed?.(3), center.lon?.toFixed?.(3)],
    queryFn:   () => api.getNearbyPlaces({ lat: center.lat, lon: center.lon }),
    staleTime: 30 * 60 * 1000,
  })

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
      const prevFeed = qc.getQueryData(['feed'])
      const prevLikes = qc.getQueryData(['my-likes'])
      const wasLiked = likedSet.has(postId)
      qc.setQueryData(['my-likes'], (old) => wasLiked ? (old || []).filter((id) => id !== postId) : [...(old || []), postId])
      qc.setQueryData(['feed'], (old) => (old || []).map((p) => p.id === postId ? { ...p, like_count: (p.like_count || 0) + (wasLiked ? -1 : 1) } : p))
      return { prevFeed, prevLikes }
    },
    onError: (_err, _postId, ctx) => {
      if (ctx?.prevFeed) qc.setQueryData(['feed'], ctx.prevFeed)
      if (ctx?.prevLikes) qc.setQueryData(['my-likes'], ctx.prevLikes)
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: ['feed'] }); qc.invalidateQueries({ queryKey: ['my-likes'] }) },
  })

  const handleLike = useCallback((postId) => {
    if (!user) return
    likeMut.mutate(postId)
  }, [user, likeMut])

  const allPosts   = Array.isArray(feedData)  ? feedData  : (feedData?.data  || [])
  const manual  = Array.isArray(placeData) ? placeData : (placeData?.data || [])
  const organic = nearbyData?.results || []
  const usingNearby = !!nearbyData?.enabled && organic.length > 0

  const allPlaces = useMemo(() => {
    const names = new Set(manual.map((p) => (p.name || '').toLowerCase().trim()))
    const extra = organic.filter((o) => !names.has((o.name || '').toLowerCase().trim()))
    return [...manual, ...extra]
  }, [manual, organic])

  // Filtro de busca em memória — bate em title/name/location/locality/address.
  const q = searchQuery.trim().toLowerCase()
  const matches = (s) => !q || String(s || '').toLowerCase().includes(q)
  const posts  = !q ? allPosts  : allPosts.filter((p) => matches(p.title) || matches(p.location) || matches(p.body))
  const places = !q ? allPlaces : allPlaces.filter((p) => matches(p.name) || matches(p.locality) || matches(p.address))

  const loadingPlacesAll = loadingPlaces || loadingNearby

  const events   = posts.filter((p) => p.kind !== 'promo')
  const promos   = posts.filter((p) => p.kind === 'promo')
  const featured = places.filter((p) => p.is_featured)

  const Loader = (
    <div className="h-40 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const renderPost = (p) => (
    <PostCard key={p.id} post={p} liked={likedSet.has(p.id)} onLike={() => handleLike(p.id)} user={user}
      isAdmin={isAdmin} onEdit={(post) => setComposerPost(post)} onDelete={handleDeletePost} />
  )
  const renderPlace = (p) => (
    <PlaceCard key={p.id} place={p} onReview={p.id ? () => setReviewPlace(p) : undefined} />
  )
  const renderPlaceCompact = (p) => (
    <PlaceCard key={p.id} place={p} compact onReview={p.id ? () => setReviewPlace(p) : undefined} />
  )

  let content
  if (filter === 'eventos') {
    content = loadingFeed ? Loader
      : events.length ? events.map(renderPost)
      : <EmptyState icon={CalendarDays} title={t('feedPg.emptyEvents.title')} sub={t('feedPg.emptyEvents.sub')} />
  } else if (filter === 'promocoes') {
    content = loadingFeed ? Loader
      : promos.length ? promos.map(renderPost)
      : <EmptyState icon={BadgePercent} title={t('feedPg.emptyPromos.title')} sub={t('feedPg.emptyPromos.sub')} />
  } else if (filter === 'hospedagem' || filter === 'gastronomia' || filter === 'compras') {
    const list = places.filter((p) => p.category === filter)
    content = (loadingPlacesAll && !list.length) ? Loader
      : list.length ? <div className="grid grid-cols-2 gap-3">{list.map(renderPlace)}</div>
      : <EmptyState icon={CAT_ICONS[filter]} title={t('feedPg.emptyCategory.title')} sub={t('feedPg.emptyCategory.sub')} />
  } else {
    const blocks = []
    if (featured.length) {
      blocks.push(
        <section key="destaques" className="space-y-3">
          <SectionTitle>⭐ {t('feedPg.sectionFeatured')}</SectionTitle>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
            {featured.map(renderPlaceCompact)}
          </div>
        </section>
      )
    }
    if (posts.length) {
      blocks.push(
        <section key="feed" className="space-y-4">
          <SectionTitle>🎉 {t('feedPg.sectionHappening')}</SectionTitle>
          {posts.map(renderPost)}
        </section>
      )
    }
    if (places.length) {
      blocks.push(
        <section key="places" className="space-y-3">
          <SectionTitle>📍 {t('feedPg.sectionPlaces')}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">{places.map(renderPlace)}</div>
        </section>
      )
    }
    content = blocks.length ? blocks
      : (loadingFeed || loadingPlacesAll) ? Loader
      : <EmptyState icon={Sparkles} title={t('feedPg.emptyAll.title')} sub={t('feedPg.emptyAll.sub')} />
  }

  return (
    <div className="min-h-full pb-24 lg:pb-10">
      <header className="bg-white px-4 pt-5 pb-3 sticky top-0 lg:top-14 z-30 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto">
          <div className="relative flex items-center justify-center min-h-[32px]">
            <button
              onClick={() => navigate(-1)}
              className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
              aria-label={t('feedPg.back')}
            >
              <ChevronLeft size={20} className="text-gray-700" />
            </button>
            <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">{t('feedPg.title')}</h1>
          </div>
        </div>
      </header>

      {/* ── Destaques (highlights) — fixos na Descubra ───────────────────── */}
      <Stories className="lg:max-w-2xl lg:mx-auto" />

      {/* ── Buscador em destaque ──────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 pt-3">
        <div className="relative">
          <Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('feedPg.searchPlaceholder')}
            className="w-full h-12 pl-12 pr-11 rounded-2xl bg-white border border-gray-200 shadow-sm text-[14px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:scale-90 transition-transform"
              aria-label={t('feedPg.clearSearch')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <p className="text-[12px] text-gray-400 text-center mt-2">{t('feedPg.subtitle')}</p>
        {isAdmin && (
          <button
            onClick={() => setComposerPost(null)}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3 text-[14px] active:scale-[0.98] transition-transform"
          >
            <Plus size={18} /> {t('feedPg.newPost')}
          </button>
        )}
      </div>

      {/* ── Filtros (cards) — abaixo do buscador ───────────────────────────── */}
      {/* Sem faixa branca: sobre o fundo de areia ela virava uma listra no meio
          da tela. As pastilhas ficam soltas, como na home. */}
      <div className="mt-3">
        <div className="max-w-2xl mx-auto px-4 py-2.5">
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {FILTERS.map(({ id, label, Icon }) => {
              const active = filter === id
              return (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                    active ? 'bg-brand text-white' : 'bg-white border border-gray-200/80 text-gray-600 active:bg-gray-50'
                  }`}
                >
                  <Icon size={13} /> {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-6">
        <>
          {content}
          {usingNearby && (
            <p className="text-center text-[10px] text-gray-300 pt-2 pb-1">
              {t('feedPg.mapAttribution')}
            </p>
          )}
        </>
      </main>

      {reviewPlace && (
        <ReviewModal place={reviewPlace} onClose={() => setReviewPlace(null)} user={user} />
      )}

      {composerPost !== undefined && (
        <FeedPublisher
          post={composerPost}
          onClose={() => setComposerPost(undefined)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['feed'] })}
        />
      )}
    </div>
  )
}
