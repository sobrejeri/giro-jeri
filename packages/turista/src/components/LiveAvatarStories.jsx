import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Loader2, Plus, X, ImagePlus, Send } from 'lucide-react'
import { api } from '../lib/api'
import StoryViewer from './StoryViewer'

const SEEN_KEY = 'giro_seen_stories'
function getSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')) } catch { return new Set() }
}
function markSeen(id) {
  try {
    const s = getSeen(); s.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
  } catch { /* ignora */ }
}

// Redimensiona imagem no cliente → data URL JPEG.
function fileToDataUrl(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, max / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

const MAX_VIDEO_BYTES = 50 * 1024 * 1024

// ── Composer: adicionar story efêmero (só admin) ─────────────────────────
function LiveStoryComposer({ onClose, onDone }) {
  const fileRef = useRef(null)
  const [preview, setPreview]   = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('image')
  const [caption, setCaption]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [pct, setPct]           = useState(0)
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const isVideo = (file.type || '').startsWith('video/')
    setMediaType(isVideo ? 'video' : 'image')
    setPreview(URL.createObjectURL(file))
    setUploading(true); setPct(0)
    try {
      if (isVideo) {
        if (file.size > MAX_VIDEO_BYTES) throw new Error('Vídeo muito grande (máx. 50 MB).')
        const ct = (file.type || 'video/mp4').split(';')[0].trim()
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '')
        const { signed_url, public_url } = await api.getStorageSignedUrl({ filename: `story.${ext}`, content_type: ct })
        if (!signed_url) throw new Error('Falha ao preparar envio.')
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', signed_url)
          xhr.setRequestHeader('Content-Type', ct)
          xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100)) }
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Falha no envio (' + xhr.status + ').')))
          xhr.onerror = () => reject(new Error('Erro de rede no envio.'))
          xhr.send(file)
        })
        setMediaUrl(public_url)
      } else {
        const dataUrl = await fileToDataUrl(file)
        const result = await api.uploadSiteImage(dataUrl, 'stories')
        const url = result?.url || (typeof result === 'string' ? result : null)
        if (!url) throw new Error('Falha ao enviar imagem.')
        setMediaUrl(url)
      }
    } catch (err) {
      setError(err?.message || 'Erro ao enviar mídia.')
      setPreview(''); setMediaUrl('')
    } finally { setUploading(false); setPct(0); e.target.value = '' }
  }

  async function publish() {
    if (!mediaUrl || saving) return
    setSaving(true); setError('')
    try {
      await api.addLiveStory({ media_url: mediaUrl, media_type: mediaType, caption: caption.trim() || null })
      onDone?.()
      onClose()
    } catch (err) { setError(err?.message || 'Erro ao publicar.') }
    finally { setSaving(false) }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-[95]" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[95] max-h-[92vh] overflow-y-auto">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">Adicionar ao seu story</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} className="text-gray-500" /></button>
        </div>
        <div className="px-5 pb-8 space-y-4">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
          {preview ? (
            <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-[4/5] flex items-center justify-center">
              {mediaType === 'video'
                ? <video src={preview} className="w-full h-full object-contain" muted playsInline />
                : <img src={preview} alt="" className="w-full h-full object-contain" />}
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 text-white">
                  <Loader2 size={22} className="animate-spin" />
                  <span className="text-[12px]">{pct > 0 ? `Enviando ${pct}%` : 'Enviando…'}</span>
                </div>
              )}
              {!uploading && (
                <button onClick={() => fileRef.current?.click()} className="absolute top-2 right-2 bg-black/60 text-white text-[11px] px-3 py-1.5 rounded-full">Trocar</button>
              )}
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="w-full aspect-[4/5] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-400 active:scale-[0.99] transition-transform">
              <ImagePlus size={28} />
              <span className="text-[13px] font-medium">Selecionar foto ou vídeo</span>
              <span className="text-[11px] text-gray-400">Some após 24 horas</span>
            </button>
          )}
          {mediaUrl && (
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200}
              placeholder="Escreva uma legenda (opcional)"
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-brand/40 focus:bg-white" />
          )}
          {error && <p className="text-[12px] text-red-500">{error}</p>}
          <button onClick={publish} disabled={!mediaUrl || uploading || saving}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-2xl py-3.5 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100">
            {saving ? <><Loader2 size={16} className="animate-spin" /> Publicando…</> : <><Send size={16} /> Publicar no story</>}
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}

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
 * LiveAvatarStories — foto do perfil com anel de story (24h), estilo Instagram.
 * Toca no avatar → abre o story. Anel colorido = story novo (não visto).
 * Admin: botão "+" para adicionar, "quem viu" e excluir.
 */
export default function LiveAvatarStories({ avatarUrl, initials, isAdmin, uploadingPhoto, onPickPhoto }) {
  const qc = useQueryClient()
  const [viewerOpen, setViewerOpen]   = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [viewersFor, setViewersFor]   = useState(null)
  const [seenTick, setSeenTick]       = useState(0) // força recomputar anel

  const { data: stories = [] } = useQuery({
    queryKey: ['liveStories'],
    queryFn:  () => api.getLiveStories(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const hasStories = stories.length > 0
  const hasUnseen = useMemo(() => {
    const seen = getSeen()
    return stories.some((s) => !seen.has(s.id))
  }, [stories, seenTick])

  // Um único "grupo" para o StoryViewer (a foto do perfil = o dono).
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
    markSeen(id); setSeenTick((t) => t + 1)
    try { await api.viewLiveStory(id) } catch { /* silencioso (guest/erro) */ }
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
    setViewerOpen(false)
  }

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
        <StoryViewer
          highlights={grupo}
          startGroup={0}
          onClose={() => setViewerOpen(false)}
          isAdmin={isAdmin}
          onDelete={isAdmin ? handleDelete : undefined}
          onView={handleView}
          onShare={handleShare}
          onShowViewers={isAdmin ? ((s) => setViewersFor(s.id)) : undefined}
        />
      )}

      {composerOpen && (
        <LiveStoryComposer
          onClose={() => setComposerOpen(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['liveStories'] })}
        />
      )}

      {viewersFor && <ViewersSheet storyId={viewersFor} onClose={() => setViewersFor(null)} />}
    </div>
  )
}
