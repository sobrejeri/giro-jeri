import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { X, ImagePlus, Loader2, CalendarDays, BadgePercent, Film, ChevronLeft } from 'lucide-react'
import { api } from '../lib/api'

const MAX_VIDEO_BYTES = 60 * 1024 * 1024 // 60 MB

// Redimensiona a imagem no cliente e devolve um data URL JPEG (base64).
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
 * FeedPublisher — compositor/editor de posts do Descubra (admin/operador).
 * Fluxo estilo Instagram em 2 passos: 1) escolher a mídia (galeria) + prévia →
 * "Avançar"; 2) legenda/detalhes → "Compartilhar". Editar começa no passo 2.
 * post = null → criar; post = objeto → editar.
 */
export default function FeedPublisher({ post, onClose, onSaved }) {
  const { t } = useTranslation()
  const editing = !!post?.id
  const fileRef = useRef(null)
  const videoRef = useRef(null)

  const [step, setStep] = useState(editing ? 'details' : 'media')  // 'media' | 'details'

  const [kind,     setKind]     = useState(post?.kind || 'event')
  const [title,    setTitle]    = useState(post?.title || '')
  const [body,     setBody]     = useState(post?.body || '')
  const [imageUrl, setImageUrl] = useState(post?.image_url || '')
  const [preview,  setPreview]  = useState(post?.image_url || '')
  const [uploading, setUploading] = useState(false)
  const [error,    setError]    = useState('')
  const [videoUrl,      setVideoUrl]      = useState(post?.video_url || '')
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [videoPct,       setVideoPct]       = useState(0)

  const [eventDate,     setEventDate]     = useState(post?.event_date || '')
  const [eventTime,     setEventTime]     = useState(post?.event_time || '')
  const [location,      setLocation]      = useState(post?.location || '')
  const [discountLabel, setDiscountLabel] = useState(post?.discount_label || '')
  const [validUntil,    setValidUntil]    = useState(post?.valid_until || '')

  const isPromo = kind === 'promo'
  const temMidia = !!(imageUrl || videoUrl || preview)
  const ocupado  = uploading || uploadingVideo

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setUploading(true)
    setPreview(URL.createObjectURL(file))
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      const result  = await api.uploadSiteImage(dataUrl, 'feed')
      const url = result?.url || (typeof result === 'string' ? result : null)
      if (!url) throw new Error(t('publisherCmp.errors.uploadImage'))
      setImageUrl(url)
    } catch (err) {
      setError(err?.message || t('publisherCmp.errors.sendImage'))
      setPreview(post?.image_url || '')
      setImageUrl(post?.image_url || '')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleVideo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    if (file.size > MAX_VIDEO_BYTES) {
      setError('Vídeo muito grande (máx. 60 MB). Use um vídeo mais curto ou de menor resolução.')
      e.target.value = ''
      return
    }
    setUploadingVideo(true)
    setVideoPct(0)
    try {
      const ct  = (file.type || 'video/mp4').split(';')[0].trim()
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
      const { signed_url, public_url } = await api.getStorageSignedUrl({ filename: `feed-video.${ext}`, content_type: ct })
      if (!signed_url) throw new Error('Não foi possível gerar URL de upload')
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', signed_url)
        xhr.setRequestHeader('Content-Type', ct)
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setVideoPct(Math.round((ev.loaded / ev.total) * 100)) }
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Erro ${xhr.status} ao enviar`)))
        xhr.onerror = () => reject(new Error('Falha de rede'))
        xhr.send(file)
      })
      setVideoUrl(public_url)
    } catch (err) {
      setError(err?.message || 'Erro ao enviar o vídeo')
    } finally {
      setUploadingVideo(false)
      setVideoPct(0)
      e.target.value = ''
    }
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        kind,
        title:          title.trim(),
        body:           body.trim() || null,
        image_url:      imageUrl || null,
        video_url:      videoUrl || null,
        location:       location.trim() || null,
        is_published:   true,
        event_date:     !isPromo ? (eventDate || null) : null,
        event_time:     !isPromo ? (eventTime.trim() || null) : null,
        discount_label:  isPromo ? (discountLabel.trim() || null) : null,
        valid_until:     isPromo ? (validUntil || null) : null,
      }
      return editing ? api.updatePost(post.id, payload) : api.createPost(payload)
    },
    onSuccess: () => { onSaved?.(); onClose() },
    onError:   (err) => setError(err?.message || t('publisherCmp.errors.publish')),
  })

  const canSave = title.trim().length > 0 && !ocupado && !save.isPending

  // Inputs de arquivo (ficam montados nos dois passos).
  const inputs = (
    <>
      <input ref={fileRef}  type="file" accept="image/*" onChange={handleFile}  className="hidden" />
      <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" onChange={handleVideo} className="hidden" />
    </>
  )

  // Portal p/ document.body: escapa do wrapper do PullToRefresh (transform),
  // que prenderia o position:fixed e abriria o compositor no fim da página.
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-[70]" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[70] max-h-[94vh] flex flex-col overflow-hidden">
        <div className="flex justify-center pt-3 pb-1 shrink-0"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>

        {/* ── Cabeçalho: [voltar/X] · "Novo post" · [Avançar] ─────────────── */}
        <div className="grid grid-cols-[40px_1fr_auto] items-center px-4 py-2 border-b border-gray-100 shrink-0">
          {step === 'media' || editing ? (
            <button onClick={() => (step === 'details' && !editing ? setStep('media') : onClose())}
              className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95"
              aria-label={t('publisherCmp.close', 'Fechar')}>
              {step === 'details' && !editing
                ? <ChevronLeft size={22} className="text-gray-700" />
                : <X size={20} className="text-gray-600" />}
            </button>
          ) : (
            <button onClick={() => setStep('media')} className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95" aria-label="Voltar">
              <ChevronLeft size={22} className="text-gray-700" />
            </button>
          )}

          <p className="text-center text-[16px] font-bold text-gray-900">
            {editing ? t('publisherCmp.title.editPost') : t('publisherCmp.newPost', 'Novo post')}
          </p>

          {step === 'media' ? (
            <button onClick={() => temMidia && !ocupado && setStep('details')} disabled={!temMidia || ocupado}
              className="text-[15px] font-bold text-brand pr-1 disabled:opacity-30 active:scale-95">
              {t('publisherCmp.next', 'Avançar')}
            </button>
          ) : <span className="w-2" />}
        </div>

        {/* ── PASSO 1: mídia (galeria) ─────────────────────────────────────── */}
        {step === 'media' ? (
          <div className="px-5 py-4 space-y-3 overflow-y-auto">
            <button onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/5] rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50 relative active:scale-[0.99] transition-transform">
              {videoUrl ? (
                <video src={videoUrl} className="w-full h-full object-cover bg-black" muted playsInline />
              ) : preview ? (
                <img src={preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center text-gray-400">
                  <ImagePlus size={32} className="mx-auto mb-1.5" />
                  <p className="text-[13px] font-medium text-gray-500">{t('publisherCmp.pickFromGallery', 'Selecionar da galeria')}</p>
                  <p className="text-[11px]">{t('publisherCmp.pickHint', 'Toque para escolher uma foto')}</p>
                </div>
              )}
              {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 size={26} className="text-white animate-spin" /></div>}
            </button>

            {/* Trocar foto + vídeo (reels) */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={ocupado}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 active:scale-[0.99] transition-transform disabled:opacity-60">
                <ImagePlus size={15} className="text-brand" /> {preview ? t('publisherCmp.changePhoto', 'Trocar foto') : t('publisherCmp.photo', 'Foto')}
              </button>
              <button type="button" onClick={() => videoRef.current?.click()} disabled={uploadingVideo}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 active:scale-[0.99] transition-transform disabled:opacity-60">
                {uploadingVideo
                  ? <><Loader2 size={15} className="animate-spin" /> {videoPct}%</>
                  : <><Film size={15} className="text-brand" /> {videoUrl ? t('publisherCmp.changeVideo', 'Trocar vídeo') : t('publisherCmp.video', 'Vídeo (reels)')}</>}
              </button>
            </div>
            {videoUrl && (
              <button type="button" onClick={() => setVideoUrl('')} className="text-[12px] font-semibold text-red-500 active:opacity-70">
                {t('publisherCmp.removeVideo', 'Remover vídeo')}
              </button>
            )}
            <p className="text-[11px] text-gray-400">{t('publisherCmp.videoNote', 'Opcional: com vídeo, o post vira um reels. Máx. 60 MB.')}</p>
            {error && <p className="text-[12px] text-red-500">{error}</p>}
          </div>
        ) : (
        /* ── PASSO 2: legenda + detalhes ────────────────────────────────── */
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              {/* Prévia + legenda (estilo Instagram) */}
              <div className="flex gap-3">
                <button onClick={() => setStep('media')}
                  className="w-[76px] h-[95px] rounded-xl overflow-hidden bg-gray-100 shrink-0 relative">
                  {videoUrl
                    ? <video src={videoUrl} className="w-full h-full object-cover bg-black" muted playsInline />
                    : preview
                      ? <img src={preview} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-gray-300"><ImagePlus size={22} /></div>}
                  {videoUrl && <span className="absolute bottom-1 right-1"><Film size={13} className="text-white drop-shadow" /></span>}
                </button>
                <textarea value={title} onChange={e => setTitle(e.target.value)} rows={4}
                  placeholder={t('publisherCmp.captionPlaceholder', 'Adicione uma legenda...')}
                  className="flex-1 text-[14px] resize-none focus:outline-none placeholder-gray-400" />
              </div>

              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2">
                {[{ k: 'event', label: t('publisherCmp.kind.event'), Icon: CalendarDays }, { k: 'promo', label: t('publisherCmp.kind.promo'), Icon: BadgePercent }].map(({ k, label, Icon }) => (
                  <button key={k} onClick={() => setKind(k)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold border transition-colors ${
                      kind === k ? (k === 'promo' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-brand text-white border-brand') : 'bg-white text-gray-500 border-gray-200'
                    }`}>
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>

              {/* Campos por tipo */}
              {!isPromo ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('publisherCmp.field.eventDate')}</label>
                    <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('publisherCmp.field.eventTime')}</label>
                    <input value={eventTime} onChange={e => setEventTime(e.target.value)} placeholder={t('publisherCmp.field.eventTimePlaceholder')}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-brand" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('publisherCmp.field.discountLabel')}</label>
                    <input value={discountLabel} onChange={e => setDiscountLabel(e.target.value)} placeholder={t('publisherCmp.field.discountPlaceholder')}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-brand" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold">{t('publisherCmp.field.validUntil')}</label>
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-brand" />
                  </div>
                </div>
              )}

              {/* Local */}
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder={t('publisherCmp.field.locationPlaceholder')}
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-brand" />

              {/* Descrição (opcional) — detalhe extra além da legenda. */}
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={2}
                placeholder={t('publisherCmp.field.descriptionPlaceholder')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-[14px] resize-none focus:outline-none focus:border-brand" />

              {error && <p className="text-[12px] text-red-500">{error}</p>}
            </div>

            <div className="px-5 pb-8 pt-2 border-t border-gray-100 bg-white shrink-0">
              <button onClick={() => save.mutate()} disabled={!canSave}
                className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2">
                {save.isPending
                  ? <><Loader2 size={16} className="animate-spin" /> {t('publisherCmp.action.publishing')}</>
                  : (editing ? t('publisherCmp.action.saveChanges') : t('publisherCmp.action.share', 'Compartilhar'))}
              </button>
            </div>
          </>
        )}
        {inputs}
      </div>
    </>,
    document.body,
  )
}
