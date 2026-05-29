import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, CreditCard, Building2, CheckCircle } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Input, { Select } from '../components/ui/Input'
import Button from '../components/ui/Button'

const PIX_TYPES = [
  { value: 'cpf',        label: 'CPF'            },
  { value: 'cnpj',       label: 'CNPJ'           },
  { value: 'email',      label: 'E-mail'         },
  { value: 'phone',      label: 'Telefone'       },
  { value: 'random_key', label: 'Chave aleatória'},
]

const ACCOUNT_TYPES = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Conta Poupança' },
]

const EMPTY = {
  full_name:           '',
  phone:               '',
  document_number:     '',
  birth_date:          '',
  pix_key_type:        '',
  pix_key:             '',
  bank_name:           '',
  bank_agency:         '',
  bank_account_number: '',
  bank_account_type:   '',
  bank_document:       '',
}

export default function Perfil() {
  const qc = useQueryClient()
  const [form, setForm]       = useState(EMPTY)
  const [saved, setSaved]     = useState(false)

  const { data: profile, isLoading } = useQuery({
    queryKey: ['operator-profile'],
    queryFn:  () => api.getProfile(),
  })

  useEffect(() => {
    if (!profile) return
    setForm({
      full_name:           profile.full_name           || '',
      phone:               profile.phone               || '',
      document_number:     profile.document_number     || '',
      birth_date:          profile.birth_date          || '',
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

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    saveMut.mutate({
      full_name:           form.full_name           || undefined,
      phone:               form.phone               || undefined,
      document_type:       form.document_number ? 'cpf' : undefined,
      document_number:     form.document_number     || null,
      birth_date:          form.birth_date          || null,
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
            <Input
              label="CPF"
              placeholder="000.000.000-00"
              value={form.document_number}
              onChange={(e) => set('document_number', e.target.value)}
              maxLength={14}
            />
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
                form.pix_key_type === 'cpf'        ? '000.000.000-00'        :
                form.pix_key_type === 'cnpj'       ? '00.000.000/0001-00'    :
                form.pix_key_type === 'email'      ? 'seu@email.com'         :
                form.pix_key_type === 'phone'      ? '+55 88 99999-9999'     :
                form.pix_key_type === 'random_key' ? 'Chave aleatória'       :
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
