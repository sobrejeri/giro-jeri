import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, PlayCircle, Upload, Loader2,
  Eye, EyeOff, Image as ImageIcon, ChevronRight, X, Film,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardBody } from '../components/ui/Card'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const HL_EMPTY   = { title: '', cover_image_url: '', sort_order: 0, is_active: true }
const ITEM_EMPTY = { media_url: '', media_type: 'image', duration_sec: 15, sort_order: 0, display_name: '' }
const TYPE_DURATION  = { image: 15, video: 30 }
const MAX_VIDEO_BYTES = 50 * 1024 * 1024  // 50 MB — teto do bucket avatars (migration 032)

// Upload de imagem (resize no cliente → base64 → API)
function UploadBtn({ onUrl, label = 'Upload', size = 1280 }) {
  const [busy, setBusy] = useState(false)
  async function pick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file, size)
      const result  = await api.uploadSiteImage(dataUrl, 'stories')
      const url = result?.url || (typeof result === 'string' ? result : null)
      if (url) onUrl(url)
    } finally { setBusy(false); e.target.value = '' }
  }
  return (
    <label className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-brand hover:text-brand/80">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
      {label}
      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} disabled={busy} />
    </label>
  )
}

// Corta vídeo para no máximo maxSec segundos usando MediaRecorder + captureStream.
// Devolve { blob, content_type, ext }. Se o vídeo já for curto ou captureStream não
// estiver disponível, devolve o arquivo original sem modificação.
function trimVideoTo30s(file, maxSec = 30) {
  return new Promise((resolve) => {
    const fallback = () => {
      URL.revokeObjectURL(url)
      const ext = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
      resolve({ blob: file, content_type: file.type || 'video/mp4', ext })
    }
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url

    video.onerror = fallback

    video.onloadedmetadata = () => {
      if (video.duration <= maxSec) { fallback(); return }

      const captureStream = video.captureStream?.bind(video) || video.mozCaptureStream?.bind(video)
      if (!captureStream) { fallback(); return }

      video.oncanplay = () => {
        video.oncanplay = null
        const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4'
        const stream = captureStream()
        const chunks = []
        const rec = new MediaRecorder(stream, { mimeType })
        rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data) }
        rec.onstop = () => {
          URL.revokeObjectURL(url)
          const blob = new Blob(chunks, { type: mimeType })
          resolve({ blob, content_type: mimeType, ext: mimeType.includes('webm') ? 'webm' : 'mp4' })
        }
        rec.start()
        video.play()

        const timer = setTimeout(() => {
          if (rec.state === 'recording') { rec.stop(); video.pause() }
        }, maxSec * 1000)

        video.onended = () => { clearTimeout(timer); if (rec.state === 'recording') rec.stop() }
      }
    }
  })
}

// Upload de vídeo: corta para 30 s se necessário e envia em binário puro
// (PUT) para a URL assinada do Supabase Storage. O bucket precisa aceitar
// mime types de vídeo e tamanho > 2 MB (ver migration 032).
function VideoUploadBtn({ onUrl }) {
  const [busy,   setBusy]   = useState(false)
  const [pct,    setPct]    = useState(0)
  const [status, setStatus] = useState('')
  const [error,  setError]  = useState('')

  async function pick(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setBusy(true)
    setPct(0)
    try {
      // 1. Corta vídeo se > 30 s
      setStatus('Verificando duração…')
      const { blob, content_type, ext } = await trimVideoTo30s(file)

      // Guarda de tamanho: o bucket aceita até 50 MB
      if (blob.size > MAX_VIDEO_BYTES) {
        throw new Error('Vídeo muito grande (máx. 50 MB). Use um vídeo mais curto ou de menor resolução.')
      }

      // 2. Solicita URL assinada ao servidor
      setStatus('Preparando upload…')
      const ct = content_type.split(';')[0].trim()
      const { signed_url, public_url } = await api.getStorageSignedUrl({
        filename:     `video.${ext}`,
        content_type: ct,
      })
      if (!signed_url) throw new Error('Não foi possível gerar URL de upload')

      // 3. Envia o vídeo em binário puro via PUT (a signed_url já contém o token).
      //    O Content-Type define o tipo do objeto armazenado, para tocar no app.
      setStatus('Enviando…')
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', signed_url)
        xhr.setRequestHeader('Content-Type', ct)
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Erro ${xhr.status} ao enviar`)))
        xhr.onerror = () => reject(new Error('Falha de rede'))
        xhr.send(blob)
      })

      onUrl(public_url)
    } catch (err) {
      setError(err?.message || 'Erro ao fazer upload do vídeo')
    } finally {
      setBusy(false)
      setPct(0)
      setStatus('')
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className={`inline-flex items-center gap-1.5 cursor-pointer text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
        busy ? 'bg-brand/20 text-brand/60 cursor-not-allowed' : 'bg-brand/10 text-brand hover:bg-brand/20'
      }`}>
        {busy
          ? <><Loader2 size={14} className="animate-spin" /> {status || `Enviando ${pct}%`}</>
          : <><Upload size={14} /> Enviar vídeo</>}
        <input type="file" accept="video/mp4,video/webm,video/quicktime,video/*"
          className="hidden" onChange={pick} disabled={busy} />
      </label>
      {busy && pct > 0 && (
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-brand rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Stories() {
  const qc = useQueryClient()

  const { data: highlights = [], isLoading } = useQuery({
    queryKey: ['stories-admin'],
    queryFn:  () => api.getStories(),
  })

  // ── Highlight CRUD ─────────────────────────────────────────────────────────
  const [hlModal, setHlModal] = useState(null) // null | 'new' | highlight-object
  const [hlForm,  setHlForm]  = useState(HL_EMPTY)

  const hlSave = useMutation({
    mutationFn: (body) =>
      hlModal === 'new' ? api.createHighlight(body) : api.updateHighlight(hlModal.id, body),
    onSuccess: () => { qc.invalidateQueries(['stories-admin']); setHlModal(null) },
  })

  const hlDelete = useMutation({
    mutationFn: (id) => api.deleteHighlight(id),
    onSuccess:  () => qc.invalidateQueries(['stories-admin']),
  })

  function openNewHl()  { setHlForm(HL_EMPTY); setHlModal('new') }
  function openEditHl(h) {
    setHlForm({ title: h.title, cover_image_url: h.cover_image_url || '', sort_order: h.sort_order, is_active: h.is_active })
    setHlModal(h)
  }
  function setHl(k, v) { setHlForm((f) => ({ ...f, [k]: v })) }
  function submitHl(e) {
    e.preventDefault()
    hlSave.mutate({ ...hlForm, cover_image_url: hlForm.cover_image_url || null })
  }

  // ── Items management panel ─────────────────────────────────────────────────
  const [itemsHl,   setItemsHl]   = useState(null) // highlight whose items we're managing
  const [itemModal, setItemModal] = useState(null) // null | 'new' | item-object
  const [itemForm,  setItemForm]  = useState(ITEM_EMPTY)

  const itemSave = useMutation({
    mutationFn: (body) =>
      itemModal === 'new'
        ? api.addStoryItem(itemsHl.id, body)
        : api.updateStoryItem(itemModal.id, body),
    onSuccess: () => { qc.invalidateQueries(['stories-admin']); setItemModal(null) },
  })

  const itemDelete = useMutation({
    mutationFn: (id) => api.deleteStoryItem(id),
    onSuccess:  () => qc.invalidateQueries(['stories-admin']),
  })

  function openNewItem()   { setItemForm(ITEM_EMPTY); setItemModal('new') }
  function openEditItem(it) {
    setItemForm({
      media_url:    it.media_url    || '',
      media_type:   it.media_type   || 'image',
      duration_sec: it.duration_sec ?? 20,
      sort_order:   it.sort_order   ?? 0,
      display_name: it.display_name || '',
    })
    setItemModal(it)
  }
  function setItem(k, v) { setItemForm((f) => ({ ...f, [k]: v })) }
  function submitItem(e) {
    e.preventDefault()
    itemSave.mutate({
      media_url:    itemForm.media_url,
      media_type:   itemForm.media_type,
      duration_sec: Number(itemForm.duration_sec) || 20,
      sort_order:   Number(itemForm.sort_order)   || 0,
      display_name: itemForm.display_name || null,
    })
  }

  // Keep items panel synced after mutations
  const freshItemsHl = itemsHl
    ? (highlights.find((h) => h.id === itemsHl.id) || itemsHl)
    : null

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Destaques</h1>
          <p className="text-sm text-gray-500">
            Tópicos exibidos na home do turista, estilo Destaques do Instagram.
          </p>
        </div>
        <Button onClick={openNewHl} className="ml-auto flex items-center gap-1.5">
          <Plus size={15} /> Novo Destaque
        </Button>
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {highlights.length === 0 && (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <PlayCircle size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhum destaque criado ainda.</p>
              <p className="text-gray-600 text-xs mt-1">Crie um tópico e adicione fotos ou vídeos.</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Highlights grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {highlights.map((h) => (
          <Card key={h.id}>
            {/* Cover */}
            <div className="relative h-36 rounded-t-xl overflow-hidden bg-gray-900 flex items-center justify-center">
              {h.cover_image_url ? (
                <img src={h.cover_image_url} alt={h.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' }}>
                  <PlayCircle size={32} className="text-white/50" />
                </div>
              )}
              <span className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                h.is_active ? 'bg-emerald-500/90 text-white' : 'bg-gray-700 text-gray-300'
              }`}>
                {h.is_active ? <Eye size={10} /> : <EyeOff size={10} />}
                {h.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <span className="absolute bottom-2 left-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded-full">
                {(h.stories || []).length} {(h.stories || []).length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            <CardBody>
              <p className="font-semibold text-gray-100 truncate">{h.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">Ordem: {h.sort_order}</p>
              <div className="flex gap-1 mt-3">
                <button
                  onClick={() => { setItemsHl(h); setItemModal(null) }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-brand/10 text-brand hover:bg-brand/20 rounded-lg transition-colors"
                >
                  <Film size={13} /> Gerenciar itens <ChevronRight size={13} />
                </button>
                <button onClick={() => openEditHl(h)}
                  className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg">
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => confirm(`Excluir "${h.title}" e todos os seus itens?`) && hlDelete.mutate(h.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg">
                  <Trash2 size={14} />
                </button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* ── Highlight create/edit modal ───────────────────────────────── */}
      <Modal open={!!hlModal} onClose={() => setHlModal(null)}
        title={hlModal === 'new' ? 'Novo Destaque' : 'Editar Destaque'}>
        <form onSubmit={submitHl} className="space-y-4">
          <Input label="Nome do tópico *" value={hlForm.title}
            onChange={(e) => setHl('title', e.target.value)}
            placeholder="Ex: Passeios, Praias, Transfers" required />

          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">
              Imagem de capa (círculo)
            </label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-600 shrink-0 flex items-center justify-center"
                style={!hlForm.cover_image_url ? { background: 'linear-gradient(135deg,#f09433,#dc2743,#bc1888)' } : {}}>
                {hlForm.cover_image_url
                  ? <img src={hlForm.cover_image_url} alt="" className="w-full h-full object-cover" />
                  : <PlayCircle size={20} className="text-white/60" />}
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Input value={hlForm.cover_image_url}
                  onChange={(e) => setHl('cover_image_url', e.target.value)}
                  placeholder="URL ou envie abaixo" />
                <UploadBtn onUrl={(url) => setHl('cover_image_url', url)} label="Enviar capa" size={400} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Ordem" type="number" min={0} value={hlForm.sort_order}
              onChange={(e) => setHl('sort_order', e.target.value)} />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-300">Visível</span>
              <label className="flex items-center gap-2.5 text-sm text-gray-300 cursor-pointer mt-1">
                <input type="checkbox" checked={hlForm.is_active}
                  onChange={(e) => setHl('is_active', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-brand" />
                Ativo no app
              </label>
            </div>
          </div>

          {hlSave.isError && (
            <p className="text-sm text-red-400">{hlSave.error?.message || 'Erro ao salvar'}</p>
          )}
          <Button type="submit" className="w-full" disabled={hlSave.isPending}>
            {hlSave.isPending ? 'Salvando…' : 'Salvar Destaque'}
          </Button>
        </form>
      </Modal>

      {/* ── Items management modal ────────────────────────────────────── */}
      <Modal
        open={!!freshItemsHl}
        onClose={() => { setItemsHl(null); setItemModal(null) }}
        title={freshItemsHl ? `Itens — ${freshItemsHl.title}` : ''}
        size="lg"
      >
        {freshItemsHl && (
          <div className="space-y-4">
            {/* Existing items */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {(freshItemsHl.stories || []).length === 0 && (
                <p className="text-sm text-gray-500 text-center py-6">
                  Nenhum item ainda — adicione fotos ou vídeos abaixo.
                </p>
              )}
              {(freshItemsHl.stories || []).map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 bg-gray-800 rounded-xl px-3 py-2">
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-700 shrink-0 flex items-center justify-center">
                    {item.media_type === 'video'
                      ? <Film size={18} className="text-white/40" />
                      : item.media_url
                        ? <img src={item.media_url} alt="" className="w-full h-full object-cover" />
                        : <ImageIcon size={18} className="text-white/40" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">
                      {item.display_name || `Item ${idx + 1}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.media_type === 'video' ? 'Vídeo' : 'Imagem'} · {item.duration_sec}s · ordem {item.sort_order}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEditItem(item)}
                      className="p-1 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => confirm('Excluir este item?') && itemDelete.mutate(item.id)}
                      className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add / edit form */}
            {itemModal ? (
              <form onSubmit={submitItem} className="border border-gray-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-200">
                    {itemModal === 'new' ? 'Novo item' : 'Editar item'}
                  </p>
                  <button type="button" onClick={() => setItemModal(null)}
                    className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
                </div>

                <Select label="Tipo" value={itemForm.media_type}
                  onChange={(e) => {
                    const t = e.target.value
                    setItemForm((f) => ({ ...f, media_type: t, duration_sec: TYPE_DURATION[t] ?? f.duration_sec }))
                  }}>
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                </Select>

                <div>
                  <label className="text-sm font-medium text-gray-300 mb-1 block">
                    {itemForm.media_type === 'video' ? 'URL do vídeo' : 'Imagem'}
                  </label>
                  <Input value={itemForm.media_url}
                    onChange={(e) => setItem('media_url', e.target.value)}
                    placeholder={itemForm.media_type === 'video' ? 'https://…/video.mp4' : 'https://…'}
                    required />
                  {itemForm.media_type === 'image' && (
                    <div className="mt-1.5 flex items-center gap-3">
                      <UploadBtn onUrl={(url) => setItem('media_url', url)} label="Enviar imagem" />
                      {itemForm.media_url && (
                        <img src={itemForm.media_url} alt=""
                          className="h-10 w-16 object-cover rounded-lg"
                          onError={(e) => { e.target.style.display = 'none' }} />
                      )}
                    </div>
                  )}
                  {itemForm.media_type === 'video' && (
                    <div className="mt-1.5">
                      <VideoUploadBtn onUrl={(url) => setItem('media_url', url)} />
                    </div>
                  )}
                </div>

                <Input label="Legenda (opcional)" value={itemForm.display_name}
                  onChange={(e) => setItem('display_name', e.target.value)}
                  placeholder="Ex: Buggy ao pôr do sol" />

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Duração (s)" type="number" min={3} max={60}
                    value={itemForm.duration_sec} onChange={(e) => setItem('duration_sec', e.target.value)} />
                  <Input label="Ordem" type="number" min={0}
                    value={itemForm.sort_order} onChange={(e) => setItem('sort_order', e.target.value)} />
                </div>

                {itemSave.isError && (
                  <p className="text-xs text-red-400">{itemSave.error?.message || 'Erro ao salvar'}</p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={itemSave.isPending} className="flex-1 text-sm">
                    {itemSave.isPending ? 'Salvando…' : 'Salvar item'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setItemModal(null)} className="text-sm">
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <Button onClick={openNewItem} className="w-full flex items-center justify-center gap-2">
                <Plus size={15} /> Adicionar foto / vídeo
              </Button>
            )}
          </div>
        )}
      </Modal>

    </div>
  )
}
