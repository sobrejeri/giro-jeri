import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ImagePlus, Loader2, Film, Play, Pencil, Eye, EyeOff, ChevronRight, Clock } from 'lucide-react'
import { api } from '../lib/api'
import Card, { CardBody } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'

const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function imageToDataUrl(file, max = 1280, quality = 0.82) {
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

// Envia uma mídia (imagem via site-image; vídeo via signed URL) e devolve
// { url, type }. Usado no cover do destaque e nos itens.
async function uploadMedia(file, onPct) {
  const isVideo = (file.type || '').startsWith('video/')
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
      xhr.setRequestHeader('Cache-Control', 'max-age=31536000')
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable && onPct) onPct(Math.round((ev.loaded / ev.total) * 100)) }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Falha no envio (' + xhr.status + ').')))
      xhr.onerror = () => reject(new Error('Erro de rede no envio.'))
      xhr.send(file)
    })
    return { url: public_url, type: 'video' }
  }
  const dataUrl = await imageToDataUrl(file)
  const result = await api.uploadSiteImage(dataUrl, 'story')
  const url = result?.url || (typeof result === 'string' ? result : null)
  if (!url) throw new Error('Falha ao enviar imagem.')
  return { url, type: 'image' }
}

export default function StoriesOperador() {
  const qc = useQueryClient()
  const [hlModal, setHlModal] = useState(null)   // 'new' | highlight
  const [itemsHl, setItemsHl] = useState(null)   // highlight sendo gerenciado
  const [liveOpen, setLiveOpen] = useState(false) // publicar story 24h

  const { data: highlights = [], isLoading } = useQuery({
    queryKey: ['my-highlights'],
    queryFn: () => api.getMyHighlights(),
  })

  const del = useMutation({
    mutationFn: (id) => api.deleteHighlight(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-highlights'] }),
  })

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <p className="text-sm font-semibold text-gray-700">Meus destaques</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setLiveOpen(true)} className="flex items-center gap-1.5"><Clock size={15} /> Story 24h</Button>
            <Button onClick={() => setHlModal('new')} className="flex items-center gap-1.5"><Plus size={15} /> Novo Destaque</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 size={22} className="animate-spin text-brand" /></div>
        ) : highlights.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <Film size={30} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Nenhum destaque ainda. Crie um para agrupar seus stories.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {highlights.map((h) => (
              <div key={h.id} className="rounded-xl border border-gray-100 overflow-hidden bg-white">
                <div className="relative h-24 bg-gray-100 flex items-center justify-center">
                  {h.cover_image_url
                    ? <img src={h.cover_image_url} alt={h.title} className="w-full h-full object-cover" />
                    : <Film size={24} className="text-gray-300" />}
                  <span className={`absolute top-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${h.is_active ? 'bg-emerald-500/90 text-white' : 'bg-gray-600 text-gray-100'}`}>
                    {h.is_active ? <Eye size={10} /> : <EyeOff size={10} />} {h.is_active ? 'Ativo' : 'Oculto'}
                  </span>
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded-full">
                    {(h.stories || []).length} {(h.stories || []).length === 1 ? 'item' : 'itens'}
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="text-[13px] font-semibold text-gray-800 truncate">{h.title}</p>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => setItemsHl(h)} className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1.5 bg-brand/10 text-brand rounded-lg">
                      <Film size={12} /> Itens <ChevronRight size={12} />
                    </button>
                    <button onClick={() => setHlModal(h)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><Pencil size={13} /></button>
                    <button onClick={() => { if (confirm(`Excluir "${h.title}" e seus itens?`)) del.mutate(h.id) }} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>

      {hlModal && <HighlightModal hl={hlModal === 'new' ? null : hlModal} onClose={() => setHlModal(null)}
        onSaved={() => { setHlModal(null); qc.invalidateQueries({ queryKey: ['my-highlights'] }) }} />}
      {itemsHl && <ItemsModal hl={itemsHl} onClose={() => setItemsHl(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ['my-highlights'] })} />}
      {liveOpen && <LiveStoryModal onClose={() => setLiveOpen(false)} />}
    </Card>
  )
}

// Story efêmero de 24h (círculo no perfil). Notifica os turistas ao publicar.
function LiveStoryModal({ onClose }) {
  const fileRef = useRef(null)
  const [media, setMedia] = useState(null) // { url, type }
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(0)
  const [err, setErr] = useState('')
  const [feito, setFeito] = useState(false)

  async function onPick(e) {
    const file = e.target.files?.[0]; if (!file) return
    setErr(''); setUploading(true); setPct(0)
    try { setMedia(await uploadMedia(file, setPct)) }
    catch (ex) { setErr(ex.message || 'Falha ao enviar.') }
    finally { setUploading(false); setPct(0); e.target.value = '' }
  }

  const pub = useMutation({
    mutationFn: () => api.createLiveStory({ media_url: media.url, media_type: media.type, caption: caption.trim() || null }),
    onSuccess: () => setFeito(true),
    onError: (e) => setErr(e?.message || 'Não foi possível publicar.'),
  })

  return (
    <Modal open onClose={onClose} title="Publicar story (24h)">
      {feito ? (
        <div className="text-center py-6 space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto"><Clock size={22} /></div>
          <p className="text-sm text-gray-700">Story publicado! Fica no ar por 24h e os turistas foram avisados.</p>
          <Button onClick={onClose} className="w-full">Fechar</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPick} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full aspect-[9/16] max-h-72 border-2 border-dashed border-gray-200 rounded-xl overflow-hidden flex items-center justify-center text-gray-400 relative mx-auto">
            {media ? (
              media.type === 'video'
                ? <video src={media.url} className="w-full h-full object-contain" muted playsInline />
                : <img src={media.url} alt="" className="w-full h-full object-contain" />
            ) : <span className="flex flex-col items-center gap-1"><ImagePlus size={26} /> <span className="text-xs">Selecionar foto ou vídeo</span></span>}
            {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white"><Loader2 size={20} className="animate-spin" /> <span className="ml-2 text-xs">{pct > 0 ? `${pct}%` : ''}</span></div>}
          </button>
          <Input label="Legenda (opcional)" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Diga algo sobre o story" maxLength={200} />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button onClick={() => pub.mutate()} disabled={!media || uploading || pub.isPending} className="flex-1">
              {pub.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Publicar'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function HighlightModal({ hl, onClose, onSaved }) {
  const [title, setTitle] = useState(hl?.title || '')
  const [cover, setCover] = useState(hl?.cover_image_url || '')
  const [active, setActive] = useState(hl ? hl.is_active !== false : true)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  async function onPick(e) {
    const file = e.target.files?.[0]; if (!file) return
    if (!(file.type || '').startsWith('image/')) { setErr('A capa precisa ser uma imagem.'); e.target.value = ''; return }
    setErr(''); setUploading(true)
    try { const { url } = await uploadMedia(file); setCover(url) }
    catch (ex) { setErr(ex.message || 'Falha ao enviar a capa.') }
    finally { setUploading(false); e.target.value = '' }
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { title: title.trim(), cover_image_url: cover || null, is_active: active }
      return hl ? api.updateHighlight(hl.id, body) : api.createHighlight(body)
    },
    onSuccess: onSaved,
    onError: (e) => setErr(e?.message || 'Não foi possível salvar.'),
  })

  return (
    <Modal open onClose={onClose} title={hl ? 'Editar Destaque' : 'Novo Destaque'}>
      <div className="space-y-3">
        <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Passeio Oeste" maxLength={80} />
        <div>
          <label className="block text-[12px] font-semibold text-gray-500 mb-1">Capa</label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full h-32 border-2 border-dashed border-gray-200 rounded-xl overflow-hidden flex items-center justify-center text-gray-400 relative">
            {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : <span className="flex flex-col items-center gap-1"><ImagePlus size={24} /> <span className="text-xs">Selecionar capa</span></span>}
            {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-white" /></div>}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ativo (aparece pros turistas)
        </label>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || uploading || save.isPending} className="flex-1">
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ItemsModal({ hl, onClose, onChanged }) {
  const qc = useQueryClient()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [pct, setPct] = useState(0)
  const [err, setErr] = useState('')

  const { data: highlights = [] } = useQuery({ queryKey: ['my-highlights'], queryFn: () => api.getMyHighlights() })
  const atual = highlights.find((x) => x.id === hl.id) || hl
  const itens = atual.stories || []

  async function onPick(e) {
    const file = e.target.files?.[0]; if (!file) return
    setErr(''); setUploading(true); setPct(0)
    try {
      const { url, type } = await uploadMedia(file, setPct)
      await api.addStoryItem(hl.id, { media_url: url, media_type: type })
      qc.invalidateQueries({ queryKey: ['my-highlights'] }); onChanged?.()
    } catch (ex) { setErr(ex.message || 'Falha ao adicionar o item.') }
    finally { setUploading(false); setPct(0); e.target.value = '' }
  }

  const delItem = useMutation({
    mutationFn: (id) => api.deleteStoryItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-highlights'] }); onChanged?.() },
  })

  return (
    <Modal open onClose={onClose} title={`Itens · ${hl.title}`}>
      <div className="space-y-3">
        <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPick} />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full flex items-center justify-center gap-1.5">
          {uploading ? <><Loader2 size={15} className="animate-spin" /> {pct > 0 ? `Enviando ${pct}%` : 'Enviando…'}</> : <><Plus size={15} /> Adicionar foto/vídeo</>}
        </Button>
        {err && <p className="text-xs text-red-500">{err}</p>}
        {itens.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum item ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {itens.map((s) => (
              <div key={s.id} className="relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-100">
                {s.media_type === 'video'
                  ? <video src={`${s.media_url}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                  : <img src={s.media_url} alt="" className="w-full h-full object-cover" />}
                {s.media_type === 'video' && <span className="absolute top-1 left-1 text-white drop-shadow"><Play size={12} className="fill-white" /></span>}
                <button onClick={() => { if (confirm('Excluir este item?')) delItem.mutate(s.id) }}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
