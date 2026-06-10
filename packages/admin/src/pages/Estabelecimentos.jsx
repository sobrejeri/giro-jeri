import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Store, Upload, Loader2, Star,
  MapPin, Phone, Instagram, BedDouble, UtensilsCrossed, ShoppingBag,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Textarea, Select } from '../components/ui/Input'
import Card, { CardBody } from '../components/ui/Card'

const CATEGORIES = [
  { value: 'hospedagem',  label: 'Pousadas & Hotéis',   Icon: BedDouble },
  { value: 'gastronomia', label: 'Restaurantes & Bares', Icon: UtensilsCrossed },
  { value: 'compras',     label: 'Lojas & Compras',      Icon: ShoppingBag },
]
const catOf = (v) => CATEGORIES.find((c) => c.value === v) || CATEGORIES[1]

const PRICE_RANGES = ['', '$', '$$', '$$$']

const EMPTY = {
  name: '', category: 'gastronomia', description: '', image_url: '',
  whatsapp: '', instagram: '', maps_url: '', address: '',
  locality: '', price_range: '', price_note: '',
  is_featured: false, is_active: true,
}

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

export default function Estabelecimentos() {
  const [modal, setModal] = useState(null)
  const [form, setForm]   = useState(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError]   = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['establishments-admin'],
    queryFn:  () => api.getEstablishments(),
  })

  const saveMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createEstablishment(body) : api.updateEstablishment(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['establishments-admin'] }); setModal(null) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteEstablishment(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['establishments-admin'] }),
  })

  function openNew() { setForm(EMPTY); setImgError(''); setModal({ isNew: true }) }
  function openEdit(p) {
    setForm({
      name:        p.name || '',
      category:    p.category || 'gastronomia',
      description: p.description || '',
      image_url:   p.image_url || '',
      whatsapp:    p.whatsapp || '',
      instagram:   p.instagram || '',
      maps_url:    p.maps_url || '',
      address:     p.address || '',
      locality:    p.locality || '',
      price_range: p.price_range || '',
      price_note:  p.price_note || '',
      is_featured: p.is_featured ?? false,
      is_active:   p.is_active ?? true,
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
      const { url } = await api.uploadSiteImage(dataUrl, 'estabelecimento')
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
      name:        form.name,
      category:    form.category,
      description: form.description || null,
      image_url:   form.image_url || null,
      whatsapp:    form.whatsapp || null,
      instagram:   form.instagram || null,
      maps_url:    form.maps_url || null,
      address:     form.address || null,
      locality:    form.locality || null,
      price_range: form.price_range || null,
      price_note:  form.price_note || null,
      is_featured: !!form.is_featured,
      is_active:   !!form.is_active,
    })
  }

  const places = Array.isArray(data) ? data : (data?.data || [])

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Estabelecimentos</h1>
          <p className="text-sm text-gray-500">Diretório exibido na aba “Descubra a Vila”. Marque “Destaque” para anunciar no topo.</p>
        </div>
        <Button onClick={openNew} className="ml-auto"><Plus size={16} /> Novo</Button>
      </div>

      {places.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <Store size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhum estabelecimento ainda. Cadastre o primeiro!</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {places.map((p) => {
            const cat = catOf(p.category)
            return (
              <Card key={p.id} className={!p.is_active ? 'opacity-60' : ''}>
                <div className="relative h-36 rounded-t-xl overflow-hidden bg-gray-900">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-amber-300 flex items-center justify-center"><cat.Icon size={28} className="text-white/60" /></div>}
                  {p.is_featured && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-amber-400 text-amber-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      <Star size={11} className="fill-amber-950" /> Destaque
                    </span>
                  )}
                  {!p.is_active && (
                    <span className="absolute top-2 right-2 bg-gray-700 text-gray-200 text-[10px] font-bold px-2 py-0.5 rounded-full">Inativo</span>
                  )}
                </div>
                <CardBody>
                  <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1">
                    <cat.Icon size={12} /> {cat.label}{p.locality ? ` · ${p.locality}` : ''}
                  </div>
                  <p className="font-semibold text-gray-100 truncate">{p.name}</p>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-gray-600">
                    {p.whatsapp  && <Phone size={13} title={p.whatsapp} />}
                    {p.instagram && <Instagram size={13} title={p.instagram} />}
                    {(p.maps_url || p.address) && <MapPin size={13} title={p.address || 'Mapa'} />}
                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg"><Pencil size={14} /></button>
                      <button
                        onClick={() => confirm('Excluir este estabelecimento?') && deleteMut.mutate(p.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.isNew ? 'Novo Estabelecimento' : 'Editar Estabelecimento'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Imagem */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-1.5 block">Foto</label>
            <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-900 aspect-[16/9] flex items-center justify-center">
              {form.image_url
                ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                : <div className="text-gray-600 text-sm flex flex-col items-center gap-2"><Store size={28} /> Sem foto</div>}
              {uploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={24} className="text-white animate-spin" /></div>}
            </div>
            {imgError && <p className="text-xs text-red-400 mt-1.5">{imgError}</p>}
            <div className="flex items-center gap-3 mt-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-brand hover:text-brand-600">
                <Upload size={15} /> {form.image_url ? 'Trocar foto' : 'Enviar foto'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickImage} disabled={uploading} />
              </label>
              {form.image_url && (
                <button type="button" onClick={() => setForm((f) => ({ ...f, image_url: '' }))} className="text-sm text-gray-500 hover:text-red-400">Remover</button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Nome *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Pousada do Sol" required />
            <Select label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>

          <Textarea label="Descrição" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Breve descrição / diferenciais" />

          <div className="grid grid-cols-2 gap-3">
            <Input label="WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(88) 99999-9999" />
            <Input label="Instagram" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@usuario" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Localidade" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} placeholder="Ex: Jericoacoara, Preá, Jijoca…" />
            <Input label="Preço (texto livre)" value={form.price_note} onChange={(e) => setForm({ ...form, price_note: e.target.value })} placeholder="Ex: R$ 90-150/pessoa" />
          </div>

          <Input label="Endereço" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua / referência na vila" />
          <Input label="Link do mapa (opcional)" value={form.maps_url} onChange={(e) => setForm({ ...form, maps_url: e.target.value })} placeholder="https://maps.google.com/…" />

          <div className="grid grid-cols-2 gap-3 items-end">
            <Select label="Faixa de preço" value={form.price_range} onChange={(e) => setForm({ ...form, price_range: e.target.value })}>
              {PRICE_RANGES.map((p) => <option key={p} value={p}>{p === '' ? '—' : p}</option>)}
            </Select>
            <div className="flex flex-col gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-brand focus:ring-brand/30" />
                <Star size={13} className="text-amber-400" /> Destaque (anúncio)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-brand focus:ring-brand/30" />
                Ativo (visível no app)
              </label>
            </div>
          </div>

          {saveMut.isError && (
            <p className="text-sm text-red-400">{saveMut.error?.message || 'Erro ao salvar'}</p>
          )}

          <Button type="submit" className="w-full" disabled={saveMut.isPending || uploading}>
            {saveMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
