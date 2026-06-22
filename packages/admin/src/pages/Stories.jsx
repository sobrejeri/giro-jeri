import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, PlayCircle, Upload, Loader2,
  Eye, EyeOff, Image as ImageIcon,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select } from '../components/ui/Input'
import Card, { CardBody } from '../components/ui/Card'

const EMPTY = {
  display_name: '',
  media_url:    '',
  avatar_url:   '',
  media_type:   'image',
  duration_sec: 20,
  sort_order:   0,
  is_active:    true,
  expires_at:   '',
}

// Resize/compress image on the client → data URL JPEG (same pattern as Feed.jsx)
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

export default function Stories() {
  const [modal, setModal]         = useState(null)   // null | { isNew } | story object
  const [form, setForm]           = useState(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError]   = useState('')
  const qc = useQueryClient()

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['stories'],
    queryFn:  () => api.getStories(),
  })

  const stories = Array.isArray(data) ? data : (data?.data || [])

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createStory(body) : api.updateStory(modal.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stories'] })
      setModal(null)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteStory(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['stories'] }),
  })

  // ── Modal helpers ────────────────────────────────────────────────────────────
  function openNew() {
    setForm(EMPTY)
    setImgError('')
    setModal({ isNew: true })
  }

  function openEdit(s) {
    setForm({
      display_name: s.display_name || '',
      media_url:    s.media_url    || '',
      avatar_url:   s.avatar_url   || '',
      media_type:   s.media_type   || 'image',
      duration_sec: s.duration_sec ?? 20,
      sort_order:   s.sort_order   ?? 0,
      is_active:    s.is_active    ?? true,
      expires_at:   s.expires_at   ? s.expires_at.slice(0, 16) : '',
    })
    setImgError('')
    setModal(s)
  }

  // ── Image upload ─────────────────────────────────────────────────────────────
  async function onPickMedia(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImgError('Use uma imagem JPEG, PNG ou WebP.')
      return
    }
    setImgError('')
    setUploading(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file)
      const { url } = await api.uploadSiteImage(dataUrl, 'stories')
      setForm((f) => ({ ...f, media_url: url }))
    } catch (err) {
      setImgError(err?.message || 'Falha ao enviar a imagem.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function onPickAvatar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setImgError('Use uma imagem JPEG, PNG ou WebP para o avatar.')
      return
    }
    setImgError('')
    setUploading(true)
    try {
      const dataUrl = await fileToResizedDataUrl(file, 256, 0.85)
      const { url } = await api.uploadSiteImage(dataUrl, 'stories-avatar')
      setForm((f) => ({ ...f, avatar_url: url }))
    } catch (err) {
      setImgError(err?.message || 'Falha ao enviar o avatar.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({
      display_name: form.display_name,
      media_url:    form.media_url    || null,
      avatar_url:   form.avatar_url   || null,
      media_type:   form.media_type,
      duration_sec: Number(form.duration_sec) || 20,
      sort_order:   Number(form.sort_order)   || 0,
      is_active:    !!form.is_active,
      expires_at:   form.expires_at || null,
    })
  }

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })) }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Stories</h1>
          <p className="text-sm text-gray-500">
            Aparecem no topo do app do turista, estilo Instagram.
          </p>
        </div>
        <Button onClick={openNew} className="ml-auto">
          <Plus size={16} /> Novo Story
        </Button>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {stories.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <PlayCircle size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">
                Nenhum story ainda. Crie o primeiro!
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        /* ── Stories grid ──────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {stories.map((s) => (
            <Card key={s.id}>
              {/* Preview image */}
              <div className="relative h-40 rounded-t-xl overflow-hidden bg-gray-900 flex items-center justify-center">
                {s.media_url && s.media_type !== 'video' ? (
                  <img
                    src={s.media_url}
                    alt={s.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : s.media_url && s.media_type === 'video' ? (
                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                    <PlayCircle size={36} className="text-white/50" />
                  </div>
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center">
                    <ImageIcon size={28} className="text-white/50" />
                  </div>
                )}

                {/* Avatar overlay */}
                {s.avatar_url && (
                  <div className="absolute top-2 left-2 w-9 h-9 rounded-full border-2 border-white overflow-hidden">
                    <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Active badge */}
                <span
                  className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    s.is_active
                      ? 'bg-emerald-500/90 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}
                >
                  {s.is_active ? <Eye size={11} /> : <EyeOff size={11} />}
                  {s.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <CardBody>
                <p className="font-semibold text-gray-100 truncate">{s.display_name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="capitalize">{s.media_type === 'video' ? 'Vídeo' : 'Imagem'}</span>
                  <span>{s.duration_sec}s</span>
                  {s.sort_order != null && <span>Ordem: {s.sort_order}</span>}
                  {s.expires_at && (
                    <span>
                      Exp.: {new Date(s.expires_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>

                <div className="flex gap-1 justify-end mt-3">
                  <button
                    onClick={() => openEdit(s)}
                    className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() =>
                      confirm('Excluir este story? Esta ação não pode ser desfeita.') &&
                      deleteMut.mutate(s.id)
                    }
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

      {/* ── Create / Edit modal ───────────────────────────────────────────────── */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.isNew ? 'Novo Story' : 'Editar Story'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display name */}
          <Input
            label="Nome de exibição *"
            value={form.display_name}
            onChange={(e) => set('display_name', e.target.value)}
            placeholder="Ex: Giro Jeri"
            required
          />

          {/* Media type */}
          <Select
            label="Tipo de mídia"
            value={form.media_type}
            onChange={(e) => set('media_type', e.target.value)}
          >
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
          </Select>

          {/* Media URL + upload */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">
              {form.media_type === 'video' ? 'URL do vídeo' : 'Imagem do story'}
            </label>

            {form.media_type === 'image' && (
              <>
                <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-900 aspect-[9/16] max-h-48 flex items-center justify-center">
                  {form.media_url ? (
                    <img
                      src={form.media_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-600 text-sm flex flex-col items-center gap-2">
                      <ImageIcon size={28} />
                      Sem imagem
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 size={24} className="text-white animate-spin" />
                    </div>
                  )}
                </div>
                {imgError && (
                  <p className="text-xs text-red-400 mt-1.5">{imgError}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-brand hover:text-brand-600">
                    <Upload size={15} />
                    {form.media_url ? 'Trocar imagem' : 'Enviar imagem'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={onPickMedia}
                      disabled={uploading}
                    />
                  </label>
                  {form.media_url && (
                    <button
                      type="button"
                      onClick={() => set('media_url', '')}
                      className="text-sm text-gray-500 hover:text-red-400"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </>
            )}

            {form.media_type === 'video' && (
              <Input
                value={form.media_url}
                onChange={(e) => set('media_url', e.target.value)}
                placeholder="https://…/video.mp4"
              />
            )}
          </div>

          {/* Avatar URL + upload */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">
              Avatar (opcional — círculo sobre o story)
            </label>
            <div className="flex items-center gap-3">
              {form.avatar_url ? (
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-600 shrink-0">
                  <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center shrink-0">
                  <ImageIcon size={18} className="text-gray-600" />
                </div>
              )}
              <div className="flex flex-col gap-1.5 flex-1">
                <Input
                  value={form.avatar_url}
                  onChange={(e) => set('avatar_url', e.target.value)}
                  placeholder="URL do avatar ou envie abaixo"
                />
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-brand">
                  <Upload size={13} /> Enviar avatar
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onPickAvatar}
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Duration + sort_order */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Duração (segundos)"
              type="number"
              min={3}
              max={60}
              value={form.duration_sec}
              onChange={(e) => set('duration_sec', e.target.value)}
            />
            <Input
              label="Ordem de exibição"
              type="number"
              value={form.sort_order}
              onChange={(e) => set('sort_order', e.target.value)}
            />
          </div>

          {/* Expiry */}
          <Input
            label="Expira em (opcional)"
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => set('expires_at', e.target.value)}
          />

          {/* is_active toggle */}
          <label className="flex items-center gap-2.5 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-brand focus:ring-brand/30"
            />
            Ativo (visível no app)
          </label>

          {saveMut.isError && (
            <p className="text-sm text-red-400">
              {saveMut.error?.message || 'Erro ao salvar o story'}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={saveMut.isPending || uploading}
          >
            {saveMut.isPending ? 'Salvando…' : 'Salvar Story'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
