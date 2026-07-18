import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X, ImagePlus, Loader2, Plus, Check, Film } from 'lucide-react'
import { api } from '../lib/api'

const MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50 MB — teto do bucket

// Redimensiona uma imagem no cliente e devolve um data URL JPEG (base64).
function fileToResizedDataUrl(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale  = Math.min(1, max / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * StoryPublisher — publicação de stories estilo Instagram (somente admin).
 *
 * Fluxo: envia a mídia (foto ou vídeo) → escolhe o destaque (existente ou novo)
 * → publica. Reaproveita os endpoints já protegidos por requireAdmin na API.
 *
 * Props:
 *   highlights   — destaques existentes [{ id, title, ... }]
 *   onClose      — fecha o painel
 *   onPublished  — chamado após publicar com sucesso (para refazer o fetch)
 */
export default function StoryPublisher({ highlights = [], onClose, onPublished }) {
  const { t } = useTranslation()
  const fileRef = useRef(null)

  const [mediaUrl,  setMediaUrl]  = useState('')
  const [mediaType, setMediaType] = useState('image')
  const [preview,   setPreview]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [pct,       setPct]       = useState(0)
  const [error,     setError]     = useState('')

  const [target,   setTarget]   = useState(highlights.length ? 'existing' : 'new')
  const [hlId,     setHlId]     = useState(highlights[0]?.id || '')
  const [newTitle, setNewTitle] = useState('')
  const [caption,  setCaption]  = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    const isVideo = (file.type || '').startsWith('video/')
    setMediaType(isVideo ? 'video' : 'image')
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    setPct(0)
    try {
      if (isVideo) {
        if (file.size > MAX_VIDEO_BYTES) {
          throw new Error(t('publisherCmp.errors.videoTooLarge'))
        }
        const ct  = (file.type || 'video/mp4').split(';')[0].trim()
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '')
        const { signed_url, public_url } = await api.getStorageSignedUrl({
          filename: `story.${ext}`, content_type: ct,
        })
        if (!signed_url) throw new Error(t('publisherCmp.errors.uploadUrl'))
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', signed_url)
          xhr.setRequestHeader('Content-Type', ct)
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100))
          }
          xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(t('publisherCmp.errors.uploadStatus', { status: xhr.status }))))
          xhr.onerror = () => reject(new Error(t('publisherCmp.errors.network')))
          xhr.send(file)
        })
        setMediaUrl(public_url)
      } else {
        const dataUrl = await fileToResizedDataUrl(file)
        const result  = await api.uploadSiteImage(dataUrl, 'stories')
        const url = result?.url || (typeof result === 'string' ? result : null)
        if (!url) throw new Error(t('publisherCmp.errors.uploadImage'))
        setMediaUrl(url)
      }
    } catch (err) {
      setError(err?.message || t('publisherCmp.errors.sendMedia'))
      setPreview('')
      setMediaUrl('')
    } finally {
      setUploading(false)
      setPct(0)
      e.target.value = ''
    }
  }

  const publish = useMutation({
    mutationFn: async () => {
      let targetId = hlId
      if (target === 'new') {
        const hl = await api.createHighlight({
          title:           newTitle.trim(),
          cover_image_url: mediaType === 'image' ? mediaUrl : null,
        })
        targetId = hl.id
      }
      return api.addStoryItem(targetId, {
        media_url:    mediaUrl,
        media_type:   mediaType,
        duration_sec: mediaType === 'video' ? 30 : 15,
        display_name: caption.trim() || null,
      })
    },
    onSuccess: () => { onPublished?.(); onClose() },
    onError:   (err) => setError(err?.message || t('publisherCmp.errors.publish')),
  })

  const canPublish =
    !!mediaUrl && !uploading &&
    (target === 'existing' ? !!hlId : newTitle.trim().length > 0) &&
    !publish.isPending

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[60]" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[60] max-h-[92vh] overflow-y-auto">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">{t('publisherCmp.title.publishStory')}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 pb-8 space-y-4">
          {/* 1. Mídia */}
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
          {preview ? (
            <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-[4/5] flex items-center justify-center">
              {mediaType === 'video'
                ? <video src={preview} className="w-full h-full object-contain" muted playsInline />
                : <img src={preview} alt="" className="w-full h-full object-contain" />}
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 text-white">
                  <Loader2 size={22} className="animate-spin" />
                  <span className="text-[12px]">{pct > 0 ? t('publisherCmp.status.uploadingPercent', { pct }) : t('publisherCmp.status.uploading')}</span>
                </div>
              )}
              {!uploading && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute top-2 right-2 bg-black/60 text-white text-[11px] px-3 py-1.5 rounded-full"
                >
                  {t('publisherCmp.action.change')}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/5] border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-400 active:scale-[0.99] transition-transform"
            >
              <ImagePlus size={28} />
              <span className="text-[13px] font-medium">{t('publisherCmp.action.selectMedia')}</span>
              <span className="text-[11px] text-gray-400">{t('publisherCmp.hint.mediaFormats')}</span>
            </button>
          )}

          {/* 2. Destaque */}
          {mediaUrl && (
            <>
              <div>
                <p className="text-[13px] font-semibold text-gray-900 mb-2">{t('publisherCmp.label.addToHighlight')}</p>
                <div className="flex gap-2 mb-2">
                  {highlights.length > 0 && (
                    <button
                      onClick={() => setTarget('existing')}
                      className={`flex-1 text-[12px] font-medium py-2 rounded-xl border transition-colors ${
                        target === 'existing' ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      {t('publisherCmp.option.existing')}
                    </button>
                  )}
                  <button
                    onClick={() => setTarget('new')}
                    className={`flex-1 text-[12px] font-medium py-2 rounded-xl border transition-colors ${
                      target === 'new' ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1"><Plus size={12} /> {t('publisherCmp.option.newHighlight')}</span>
                  </button>
                </div>

                {target === 'existing' ? (
                  <div className="flex flex-wrap gap-2">
                    {highlights.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => setHlId(h.id)}
                        className={`inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border transition-colors ${
                          hlId === h.id ? 'border-brand bg-brand/10 text-brand' : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {hlId === h.id && <Check size={12} />}
                        {h.title}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    maxLength={80}
                    placeholder={t('publisherCmp.field.highlightNamePlaceholder')}
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-brand/40 focus:bg-white"
                  />
                )}
              </div>

              {/* 3. Legenda */}
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={80}
                placeholder={t('publisherCmp.field.captionPlaceholder')}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 text-[14px] text-gray-900 placeholder-gray-400 outline-none focus:border-brand/40 focus:bg-white"
              />
            </>
          )}

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          {/* Publicar */}
          <button
            onClick={() => { setError(''); publish.mutate() }}
            disabled={!canPublish}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-2xl py-3.5 active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100"
          >
            {publish.isPending
              ? <><Loader2 size={16} className="animate-spin" /> {t('publisherCmp.action.publishing')}</>
              : <><Film size={16} /> {t('publisherCmp.action.publish')}</>}
          </button>
        </div>
      </div>
    </>
  )
}
