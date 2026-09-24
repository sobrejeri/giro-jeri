import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Loader2, Trash2, Film, Play } from 'lucide-react'
import { api } from '../lib/api'
import Card, { CardHeader, CardBody } from './ui/Card'
import Button from './ui/Button'

const MAX_VIDEO_BYTES = 50 * 1024 * 1024

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

// Publicação do operador na Descubra — fotos/vídeos dos serviços prestados.
// Aparece no feed e no perfil público do operador, atribuída a ele.
export default function PublicarFeed({ meId }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [preview, setPreview]   = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('image')
  const [title, setTitle]       = useState('')
  const [caption, setCaption]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [pct, setPct]           = useState(0)
  const [error, setError]       = useState('')

  const { data: feed } = useQuery({ queryKey: ['feed'], queryFn: () => api.getFeed(), staleTime: 30_000 })
  const meusPosts = (Array.isArray(feed) ? feed : (feed?.data || [])).filter((p) => p.created_by_user_id === meId)

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
        const { signed_url, public_url } = await api.getStorageSignedUrl({ filename: `post.${ext}`, content_type: ct })
        if (!signed_url) throw new Error('Falha ao preparar envio.')
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', signed_url)
          xhr.setRequestHeader('Content-Type', ct)
          xhr.setRequestHeader('Cache-Control', 'max-age=31536000') // caminho único → cache longo, menos egress
          xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100)) }
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Falha no envio (' + xhr.status + ').')))
          xhr.onerror = () => reject(new Error('Erro de rede no envio.'))
          xhr.send(file)
        })
        setMediaUrl(public_url)
      } else {
        const dataUrl = await fileToDataUrl(file)
        const result = await api.uploadSiteImage(dataUrl, 'feed')
        const url = result?.url || (typeof result === 'string' ? result : null)
        if (!url) throw new Error('Falha ao enviar imagem.')
        setMediaUrl(url)
      }
    } catch (err) {
      setError(err?.message || 'Erro ao enviar mídia.')
      setPreview(''); setMediaUrl('')
    } finally { setUploading(false); setPct(0); e.target.value = '' }
  }

  const publish = useMutation({
    mutationFn: () => api.createPost({
      title: title.trim() || 'Serviço',
      body: caption.trim() || null,
      image_url: mediaType === 'image' ? mediaUrl : null,
      video_url: mediaType === 'video' ? mediaUrl : null,
      kind: 'event',
    }),
    onSuccess: () => {
      setPreview(''); setMediaUrl(''); setTitle(''); setCaption('')
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
    onError: (err) => setError(err?.message || 'Erro ao publicar.'),
  })

  const del = useMutation({
    mutationFn: (id) => api.deletePost(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })

  const canPublish = !!mediaUrl && !uploading && !publish.isPending

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ImagePlus size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Publicar na Descubra</h2>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-xs text-gray-500 mb-3">
          Mostre fotos e vídeos dos serviços que você presta. Aparece no feed e no seu
          perfil público, com o seu nome.
        </p>

        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
        {preview ? (
          <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-[4/5] flex items-center justify-center mb-3">
            {mediaType === 'video'
              ? <video src={preview} className="w-full h-full object-contain" muted playsInline />
              : <img src={preview} alt="" className="w-full h-full object-contain" />}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 text-white">
                <Loader2 size={22} className="animate-spin" />
                <span className="text-xs">{pct > 0 ? `Enviando ${pct}%` : 'Enviando…'}</span>
              </div>
            )}
            {!uploading && (
              <button onClick={() => fileRef.current?.click()} className="absolute top-2 right-2 bg-black/60 text-white text-[11px] px-3 py-1.5 rounded-full">Trocar</button>
            )}
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="w-full aspect-[4/5] max-h-64 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 active:scale-[0.99] transition-transform mb-3">
            <ImagePlus size={28} />
            <span className="text-[13px] font-medium">Selecionar foto ou vídeo</span>
          </button>
        )}

        {mediaUrl && (
          <div className="space-y-2 mb-3">
            <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Passeio de buggy" maxLength={200} />
            <Input label="Legenda (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Conte sobre o serviço" maxLength={500} />
          </div>
        )}

        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

        <Button onClick={() => { setError(''); publish.mutate() }} disabled={!canPublish} className="w-full">
          {publish.isPending ? <><Loader2 size={16} className="animate-spin" /> Publicando…</> : <><Film size={16} /> Publicar</>}
        </Button>

        {/* Minhas publicações */}
        {meusPosts.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold text-gray-500 mb-2">Minhas publicações ({meusPosts.length})</p>
            <div className="grid grid-cols-3 gap-1">
              {meusPosts.map((p) => (
                <div key={p.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={`${p.video_url}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  )}
                  {p.video_url && <span className="absolute top-1 left-1 text-white drop-shadow"><Play size={12} className="fill-white" /></span>}
                  <button
                    onClick={() => { if (confirm('Excluir esta publicação?')) del.mutate(p.id) }}
                    disabled={del.isPending}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white active:scale-90"
                    aria-label="Excluir"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
