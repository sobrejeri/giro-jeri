import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, ImagePlus, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'

const MAX_VIDEO_BYTES = 50 * 1024 * 1024

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

// Composer de story efêmero (só admin). Some após 24h.
export default function LiveStoryComposer({ onClose, onDone }) {
  const { region } = useRegion()
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
      await api.addLiveStory({
        media_url: mediaUrl, media_type: mediaType, caption: caption.trim() || null,
        // Localização do story = centro da região atual, para aparecer no mapa
        // do Explorar (agrupado por localização). Backend ignora se não vier.
        latitude:  region?.center_latitude  != null ? Number(region.center_latitude)  : undefined,
        longitude: region?.center_longitude != null ? Number(region.center_longitude) : undefined,
      })
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
