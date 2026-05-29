import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, CheckCircle, Camera, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Input, { Select } from '../components/ui/Input'
import Button from '../components/ui/Button'

const DOC_TYPES = [
  { value: 'cpf',  label: 'CPF',  placeholder: '000.000.000-00',     maxLength: 14 },
  { value: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00', maxLength: 18 },
]

const EMPTY = {
  full_name:       '',
  phone:           '',
  document_type:   'cpf',
  document_number: '',
  birth_date:      '',
}

export default function Perfil() {
  const qc      = useQueryClient()
  const fileRef = useRef(null)

  const [form, setForm]             = useState(EMPTY)
  const [saved, setSaved]           = useState(false)
  const [photoPreview, setPreview]  = useState(null)
  const [photoError, setPhotoError] = useState(null)

  const { data: me, isLoading } = useQuery({
    queryKey: ['admin-me'],
    queryFn:  () => api.me(),
  })

  const profile = me?.user || me

  useEffect(() => {
    if (!profile) return
    setForm({
      full_name:       profile.full_name       || '',
      phone:           profile.phone           || '',
      document_type:   profile.document_type   || 'cpf',
      document_number: profile.document_number || '',
      birth_date:      profile.birth_date      || '',
    })
  }, [profile])

  const saveMut = useMutation({
    mutationFn: (body) => api.updateMe(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-me'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const photoMut = useMutation({
    mutationFn: (photo_data) => api.uploadPhoto(photo_data),
    onSuccess: (data) => {
      setPhotoError(null)
      setPreview(data?.url || null)
      qc.invalidateQueries({ queryKey: ['admin-me'] })
    },
    onError: (err) => setPhotoError(err.message || 'Erro ao enviar foto'),
  })

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Imagem muito grande. Máximo 2 MB.')
      return
    }
    setPhotoError(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target.result
      setPreview(base64)
      photoMut.mutate(base64)
    }
    reader.readAsDataURL(file)
  }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({
      full_name:       form.full_name       || undefined,
      phone:           form.phone           || undefined,
      document_type:   form.document_number ? form.document_type : null,
      document_number: form.document_number || null,
      birth_date:      form.birth_date      || null,
    })
  }

  if (isLoading) return <PageSpinner />

  const currentPhoto = photoPreview || profile?.profile_photo_url
  const initials     = (form.full_name || profile?.full_name || 'A')[0].toUpperCase()
  const docMeta      = DOC_TYPES.find((d) => d.value === form.document_type) || DOC_TYPES[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-200">Dados Pessoais</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-full overflow-hidden bg-brand/20 flex items-center justify-center cursor-pointer ring-2 ring-gray-700 shadow-sm"
                >
                  {currentPhoto ? (
                    <img src={currentPhoto} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-brand">{initials}</span>
                  )}
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {photoMut.isPending
                      ? <Loader2 size={20} className="text-white animate-spin" />
                      : <Camera size={20} className="text-white" />}
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-300">Foto de perfil</p>
                <p className="text-xs text-gray-500 mt-0.5">JPG, PNG ou WebP · máx. 2 MB</p>
                {photoError && <p className="text-xs text-red-400 mt-1">{photoError}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Nome completo"
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                required
              />
              <Input
                label="E-mail"
                value={profile?.email || ''}
                readOnly
                className="opacity-50 cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Telefone / WhatsApp"
                placeholder="+55 88 99999-9999"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
              <Input
                label="Data de nascimento"
                type="date"
                value={form.birth_date}
                onChange={(e) => set('birth_date', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Select
                label="Tipo de documento"
                value={form.document_type}
                onChange={(e) => { set('document_type', e.target.value); set('document_number', '') }}
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input
                  label={docMeta.label}
                  placeholder={docMeta.placeholder}
                  value={form.document_number}
                  onChange={(e) => set('document_number', e.target.value)}
                  maxLength={docMeta.maxLength}
                />
              </div>
            </div>

          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saveMut.isPending}>
          {saveMut.isPending ? 'Salvando…' : 'Salvar alterações'}
        </Button>

        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400">
            <CheckCircle size={15} />
            Salvo com sucesso
          </span>
        )}

        {saveMut.isError && (
          <span className="text-sm text-red-400">
            {saveMut.error?.message || 'Erro ao salvar'}
          </span>
        )}
      </div>
    </form>
  )
}
