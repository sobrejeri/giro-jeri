import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, CreditCard, Building2, CheckCircle, Camera, Loader2, Wallet, AlertCircle, Link2, Copy, Check } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Input, { Select } from '../components/ui/Input'
import Button from '../components/ui/Button'

// ── Meu link de vendas (venda direta, sem fila) ────────────────
// Reservas feitas por este link nascem atribuídas ao operador e já vão
// direto para o pagamento — sem disputa com as demais.
const TURISTA_URL = import.meta.env.VITE_TURISTA_URL || 'https://sobrejeri.github.io/giro-jeri'

function MeuLink({ slug }) {
  const [copied, setCopied] = useState(false)
  if (!slug) return null
  const url = `${TURISTA_URL}/c/${slug}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* clipboard bloqueado — o campo abaixo permite copiar manualmente */ }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Meu link de vendas</h2>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-xs text-gray-500 mb-3">
          Compartilhe com seus clientes: as reservas feitas por este link chegam
          <span className="font-semibold"> direto para você</span> — sem entrar na fila
          das outros operadores — e o cliente já paga na hora.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[12px] text-gray-700 font-mono min-w-0"
          />
          <button
            type="button"
            onClick={copy}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold active:scale-95 transition-all ${
              copied ? 'bg-emerald-100 text-emerald-700' : 'bg-brand text-white'
            }`}
          >
            {copied ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar</>}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Reserve seu passeio comigo: ${url}`)}`}
            target="_blank" rel="noreferrer"
            className="shrink-0 px-3 py-2 rounded-lg text-[12px] font-bold bg-emerald-500 text-white active:scale-95 transition-all"
          >
            WhatsApp
          </a>
        </div>
      </CardBody>
    </Card>
  )
}

// ── Recebimento via Mercado Pago (split de pagamentos) ─────────
// O operador conecta a própria conta MP por OAuth; depois disso, sua parte de
// cada reserva cai direto na conta dela, já com a comissão da plataforma
// descontada automaticamente.
function MercadoPagoConnect() {
  const qc = useQueryClient()
  const [returnMsg, setReturnMsg] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [err, setErr] = useState(null)

  const { data: status, isLoading } = useQuery({
    queryKey: ['mp-status'],
    queryFn:  () => api.getMpStatus(),
  })

  // Lê o retorno do OAuth (?mp=connected | ?mp=erro) e limpa a URL.
  useEffect(() => {
    const mp = new URLSearchParams(window.location.search).get('mp')
    if (!mp) return
    setReturnMsg(mp)
    qc.invalidateQueries({ queryKey: ['mp-status'] })
    const url = new URL(window.location.href)
    url.searchParams.delete('mp'); url.searchParams.delete('motivo')
    window.history.replaceState({}, '', url.toString())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setErr(null); setConnecting(true)
    try {
      const { url } = await api.getMpConnectUrl()
      if (!url) throw new Error('Não foi possível iniciar a conexão')
      window.location.href = url
    } catch (e) {
      setErr(e.message || 'Erro ao conectar'); setConnecting(false)
    }
  }

  const disconnectMut = useMutation({
    mutationFn: () => api.disconnectMp(),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['mp-status'] }),
  })

  const connected  = !!status?.connected
  const configured = status?.configured !== false

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Recebimento via Mercado Pago</h2>
        </div>
      </CardHeader>
      <CardBody>
        {returnMsg === 'connected' && (
          <div className="mb-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
            <CheckCircle size={15} /> Conta conectada com sucesso!
          </div>
        )}
        {returnMsg === 'erro' && (
          <div className="mb-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            <AlertCircle size={15} /> Não foi possível conectar. Tente novamente.
          </div>
        )}

        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Conecte sua conta Mercado Pago para receber sua parte de cada reserva
          direto na sua conta, automaticamente, já com a comissão da plataforma
          descontada.
        </p>

        {isLoading ? (
          <p className="text-sm text-gray-400">Carregando…</p>
        ) : !configured ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            O recebimento via Mercado Pago ainda não foi habilitado pelo administrador.
          </p>
        ) : connected ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle size={15} /> Conta conectada
              {status?.mp_user_id ? <span className="text-gray-400 font-normal">· ID {status.mp_user_id}</span> : null}
            </span>
            <Button type="button" variant="secondary" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
              {disconnectMut.isPending ? 'Desconectando…' : 'Desconectar'}
            </Button>
          </div>
        ) : (
          <div>
            <Button type="button" onClick={handleConnect} disabled={connecting}>
              {connecting ? 'Abrindo Mercado Pago…' : 'Conectar Mercado Pago'}
            </Button>
            {err && <p className="text-sm text-red-500 mt-2">{err}</p>}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

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

      {/* Link de vendas direto */}
      <MeuLink slug={profile?.partner_slug} />

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
                value={form.phone || '+55 '}
                onFocus={(e) => { if (!form.phone) set('phone', '+55 ') }}
                onChange={(e) => {
                  // Mantém o prefixo +55 fixo — apaga só os dígitos depois.
                  let v = e.target.value
                  if (!v.startsWith('+55')) v = '+55 ' + v.replace(/^\+?5?5?\s?/, '')
                  set('phone', v)
                }}
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

      {/* Recebimento via Mercado Pago (split automático) */}
      <MercadoPagoConnect />

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
