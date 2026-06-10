import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Newspaper, Upload, Loader2,
  Calendar, MapPin, Eye, EyeOff,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'
import Card, { CardBody } from '../components/ui/Card'

const EMPTY = {
  title: '', body: '', image_url: '',
  event_date: '', event_time: '', location: '', is_published: true,
}

// Redimensiona/comprime imagem no cliente → data URL JPEG
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

const fmtDate = (d) => {
  try { return d ? format(parseISO(d), 'dd/MM/yyyy') : null } catch { return d }
}

export default function Feed() {
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError]   = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['feed-admin'],
    queryFn:  () => api.getFeedPosts(),
  })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createFeedPost(body) : api.updateFeedPost(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feed-admin'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteFeedPost(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['feed-admin'] }),
  })

  function openNew() { setForm(EMPTY); setImgError(''); setModal({ isNew: true }) }
  function openEdit(p) {
    setForm({
      title:        p.title || '',
      body:         p.body || '',
      image_url:    p.image_url || '',
      event_date:   p.event_date?.slice(0, 10) || '',
      event_time:   p.event_time || '',
      location:     p.location || '',
      is_published: p.is_published ?? true,
    })
    setImgError('')
    setModal(p)
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImgError('Use uma imagem JPEG, PNG ou WebP.'); return
    }
    setImgError('')
    setUploading(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      const { url } = await api.uploadSiteImage(dataUrl, 'feed')
      setForm((f) => ({ ...f, image_url: url }))
    } catch (err) {
      setImgError(err?.message || 'Falha ao enviar a imagem.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({
      title:        form.title,
      body:         form.body || null,
      image_url:    form.image_url || null,
      event_date:   form.event_date || null,
      event_time:   form.event_time || null,
      location:     form.location || null,
      is_published: !!form.is_published,
    })
  }

  const posts = Array.isArray(data) ? data : (data?.data || [])

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Feed de Eventos</h1>
          <p className="text-sm text-gray-500">Posts exibidos na aba “Eventos” do app do turista.</p>
        </div>
        <Button onClick={openNew} className="ml-auto"><Plus size={16} /> Novo Post</Button>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <Newspaper size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhum post ainda. Crie o primeiro evento da vila!</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {posts.map((p) => (
            <Card key={p.id}>
              <div className="relative h-40 rounded-t-xl overflow-hidden bg-gray-900">
                {p.image_url
                  ? <img src={p.image_url} alt={p.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]" />}
                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${p.is_published ? 'bg-emerald-500/90 text-white' : 'bg-gray-700 text-gray-200'}`}>
                  {p.is_published ? <Eye size={11} /> : <EyeOff size={11} />}
                  {p.is_published ? 'Publicado' : 'Rascunho'}
                </span>
              </div>
              <CardBody>
                <p className="font-semibold text-gray-100 truncate">{p.title}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                  {p.event_date && <span className="flex items-center gap-1"><Calendar size={12} />{fmtDate(p.event_date)}{p.event_time ? ` · ${p.event_time}` : ''}</span>}
                  {p.location && <span className="flex items-center gap-1"><MapPin size={12} />{p.location}</span>}
                </div>
                {p.body && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.body}</p>}
                <div className="flex gap-1 justify-end mt-3">
                  <button onClick={() => openEdit(p)} className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg">
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => confirm('Excluir este post? Essa ação não pode ser desfeita.') && deleteMut.mutate(p.id)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Novo Post' : 'Editar Post'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Imagem */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Imagem</label>
            <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-900 aspect-[4/3] flex items-center justify-center">
              {form.image_url
                ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                : <div className="text-gray-600 text-sm flex flex-col items-center gap-2"><Newspaper size={28} /> Sem imagem</div>}
              {uploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <Loader2 size={24} className="text-white animate-spin" />
                </div>
              )}
            </div>
            {imgError && <p className="text-xs text-red-400 mt-1.5">{imgError}</p>}
            <div className="flex items-center gap-3 mt-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-brand hover:text-brand-600">
                <Upload size={15} /> {form.image_url ? 'Trocar imagem' : 'Enviar imagem'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickImage} disabled={uploading} />
              </label>
              {form.image_url && (
                <button type="button" onClick={() => setForm((f) => ({ ...f, image_url: '' }))} className="text-sm text-gray-500 hover:text-red-400">
                  Remover
                </button>
              )}
            </div>
          </div>

          <Input
            label="Título *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex: Forró na Praça da Matriz"
            required
          />

          <Textarea
            label="Descrição"
            rows={4}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            placeholder="Conte os detalhes do evento…"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Data do evento" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            <Input label="Horário" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} placeholder="Ex: 20h" />
          </div>

          <Input label="Local" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Ex: Praça da Matriz, Jericoacoara" />

          <label className="flex items-center gap-2.5 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-brand focus:ring-brand/30"
            />
            Publicar no app (desmarque para salvar como rascunho)
          </label>

          {saveMut.isError && (
            <p className="text-sm text-red-400">{saveMut.error?.message || 'Erro ao salvar o post'}</p>
          )}

          <Button type="submit" className="w-full" disabled={saveMut.isPending || uploading}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar Post'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
