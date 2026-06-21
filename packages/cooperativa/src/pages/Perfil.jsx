import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, CreditCard, Building2, CheckCircle, Camera, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Input, { Select } from '../components/ui/Input'
import Button from '../components/ui/Button'

const PIX_TYPES = [
  { value: 'cpf',        label: 'CPF'             },
  { value: 'cnpj',       label: 'CNPJ'            },
  { value: 'email',      label: 'E-mail'          },
  { value: 'phone',      label: 'Telefone'        },
  { value: 'random_key', label: 'Chave aleatória' },
]

const ACCOUNT_TYPES = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Conta Poupança' },
]

const DOC_TYPES = [
  { value: 'cpf',  label: 'CPF',  placeholder: '000.000.000-00',      maxLength: 14 },
  { value: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0001-00',  maxLength: 18 },
]

const EMPTY = {
  full_name:           '',
  phone:               '',
  document_type:       'cpf',
  document_number:     '',
  birth_date:          '',
  address:             '',
  cep:                 '',
  pix_key_type:        '',
  pix_key:             '',
  bank_name:           '',
  bank_agency:         '',
  bank_account_number: '',
  bank_account_type:   '',
  bank_document:       '',
}

export default function Perfil() {
  const qc            = useQueryClient()
  const fileRef       = useRef(null)
  const [form, setForm]           = useState(EMPTY)
  const [saved, setSaved]         = useState(false)
  const [photoPreview, setPreview] = useState(null)
  const [photoError, setPhotoError] = useState(null)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['operator-profile'],
    queryFn:  () => api.getProfile(),
  })

  useEffect(() => {
    if (!profile) return
    setForm({
      full_name:           profile.full_name           || '',
      phone:               profile.phone               || '',
      document_type:       profile.document_type       || 'cpf',
      document_number:     profile.document_number     || '',
      birth_date:          profile.birth_date          || '',
      address:             profile.address             || '',
      cep:                 profile.cep                 || '',
      pix_key_type:        profile.pix_key_type        || '',
      pix_key:             profile.pix_key             || '',
      bank_name:           profile.bank_name           || '',
      bank_agency:         profile.bank_agency         || '',
      bank_account_number: profile.bank_account_number || '',
      bank_account_type:   profile.bank_account_type   || '',
      bank_document:       profile.bank_document       || '',
    })
  }, [profile])

  const saveMut = useMutation({
    mutationFn: (body) => api.updateProfile(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operator-profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const photoMut = useMutation({
    mutationFn: (photo_data) => api.uploadPhoto(photo_data),
    onSuccess: (data) => {
      setPhotoError(null)
      setPreview(data?.url || null)
      qc.invalidateQueries({ queryKey: ['operator-profile'] })
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
      full_name:           form.full_name           || undefined,
      phone:               form.phone               || undefined,
      document_type:       form.document_number ? form.document_type : null,
      document_number:     form.document_number     || null,
      birth_date:          form.birth_date          || null,
      address:             form.address             || null,
      cep:                 form.cep                 || null,
      pix_key_type:        form.pix_key_type        || null,
      pix_key:             form.pix_key             || null,
      bank_name:           form.bank_name           || null,
      bank_agency:         form.bank_agency         || null,
      bank_account_number: form.bank_account_number || null,
      bank_account_type:   form.bank_account_type   || null,
      bank_document:       form.bank_document       || null,
    })
  }

  if (isLoading) return <PageSpinner />

  const currentPhoto = photoPreview || profile?.profile_photo_url
  const initials     = (form.full_name || profile?.full_name || 'O')[0].toUpperCase()
  const docMeta      = DOC_TYPES.find((d) => d.value === form.document_type) || DOC_TYPES[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">

      {/* Dados Pessoais */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Dados Pessoais</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-full overflow-hidden bg-brand/10 flex items-center justify-center cursor-pointer ring-2 ring-white shadow-sm"
                >
                  {currentPhoto ? (
                    <img src={currentPhoto} alt="Foto" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-brand">{initials}</span>
                  )}
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
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
                <p className="text-sm font-medium text-gray-700">Foto de perfil</p>
                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG ou WebP · máx. 2 MB</p>
                {photoError && <p className="text-xs text-red-500 mt-1">{photoError}</p>}
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
                className="bg-gray-50 cursor-not-allowed"
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

            {/* CPF / CNPJ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

            {/* Endereço */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Endereço (rua, número, bairro)"
                  placeholder="Ex: Av. Principal S/N, Centro"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </div>
              <Input
                label="CEP"
                placeholder="00000-000"
                value={form.cep}
                onChange={(e) => set('cep', e.target.value)}
                maxLength={9}
              />
            </div>

          </div>
        </CardBody>
      </Card>

      {/* Chave PIX */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Chave PIX para Recebimento</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Tipo de chave"
              value={form.pix_key_type}
              onChange={(e) => set('pix_key_type', e.target.value)}
            >
              <option value="">Selecione o tipo</option>
              {PIX_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
            <Input
              label="Chave PIX"
              placeholder={
                form.pix_key_type === 'cpf'        ? '000.000.000-00'       :
                form.pix_key_type === 'cnpj'       ? '00.000.000/0001-00'   :
                form.pix_key_type === 'email'      ? 'seu@email.com'        :
                form.pix_key_type === 'phone'      ? '+55 88 99999-9999'    :
                form.pix_key_type === 'random_key' ? 'Cole a chave aleatória' :
                'Informe a chave'
              }
              value={form.pix_key}
              onChange={(e) => set('pix_key', e.target.value)}
            />
          </div>
          {form.pix_key_type && form.pix_key && (
            <p className="mt-2 text-xs text-gray-400">
              Os repasses serão enviados para esta chave após a conclusão dos serviços.
            </p>
          )}
        </CardBody>
      </Card>

      {/* Dados Bancários */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-700">Dados Bancários</h2>
            <span className="text-xs text-gray-400 font-normal">(opcional — para TED/DOC)</span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <Input
              label="Banco"
              placeholder="Ex: Nubank, Banco do Brasil, Caixa"
              value={form.bank_name}
              onChange={(e) => set('bank_name', e.target.value)}
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Input
                label="Agência"
                placeholder="0000"
                value={form.bank_agency}
                onChange={(e) => set('bank_agency', e.target.value)}
              />
              <Input
                label="Conta"
                placeholder="00000-0"
                value={form.bank_account_number}
                onChange={(e) => set('bank_account_number', e.target.value)}
              />
              <Select
                label="Tipo"
                value={form.bank_account_type}
                onChange={(e) => set('bank_account_type', e.target.value)}
              >
                <option value="">Selecione</option>
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </div>
            <Input
              label="CPF / CNPJ do titular"
              placeholder="CPF ou CNPJ do dono da conta"
              value={form.bank_document}
              onChange={(e) => set('bank_document', e.target.value)}
              maxLength={18}
            />
          </div>
        </CardBody>
      </Card>

      {/* Ações */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saveMut.isPending}>
          {saveMut.isPending ? 'Salvando…' : 'Salvar alterações'}
        </Button>

        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle size={15} />
            Salvo com sucesso
          </span>
        )}

        {saveMut.isError && (
          <span className="text-sm text-red-500">
            {saveMut.error?.message || 'Erro ao salvar'}
          </span>
        )}
      </div>
    </form>
  )
}
