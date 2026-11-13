// Conta de recebimento da empresa — é para cá que a Turiva paga as comissões
// dos operadores vinculados.
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import Card, { CardBody } from '../../components/ui/Card'
import Input, { Select } from '../../components/ui/Input'
import Button from '../../components/ui/Button'

const VAZIO = { bank_name: '', bank_agency: '', bank_account_number: '', bank_account_type: '', bank_document: '', pix_key_type: '', pix_key: '' }

export default function Conta() {
  const [form, setForm] = useState(VAZIO)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let mounted = true
    api.getCompanyAccount()
      .then((data) => { if (mounted) { setForm(Object.fromEntries(Object.keys(VAZIO).map((k) => [k, data?.[k] || '']))); setLoading(false) } })
      .catch((err) => { if (mounted) { setMessage(err.message); setLoadFailed(true); setLoading(false) } })
    return () => { mounted = false }
  }, [])

  async function save(e) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      await api.saveCompanyAccount(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null])))
      setMessage('Dados de recebimento salvos.')
    } catch (err) { setMessage(err.message) } finally { setBusy(false) }
  }
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  return (
    <Card>
      <CardBody>
        <h2 className="font-semibold text-gray-900">Conta de recebimento</h2>
        <p className="text-sm text-gray-600 mt-1">
          Cadastre os dados da empresa para receber os repasses. As comissões dos operadores vinculados à empresa são pagas nesta conta.
        </p>
        {loading ? <p className="mt-4 text-sm text-gray-600">Carregando…</p> : (
          <form onSubmit={save} className="space-y-3 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Tipo da chave PIX" {...campo('pix_key_type')}>
                <option value="">Selecione</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option><option value="phone">Telefone</option><option value="random_key">Aleatória</option>
              </Select>
              <Input label="Chave PIX" {...campo('pix_key')} />
              <Input label="Banco" {...campo('bank_name')} />
              <Input label="Agência" {...campo('bank_agency')} />
              <Input label="Conta" {...campo('bank_account_number')} />
              <Select label="Tipo de conta" {...campo('bank_account_type')}>
                <option value="">Selecione</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option>
              </Select>
              <Input label="CPF ou CNPJ do titular" {...campo('bank_document')} />
            </div>
            <Button type="submit" disabled={busy || loadFailed}>{busy ? 'Salvando…' : 'Salvar dados'}</Button>
          </form>
        )}
        {message && <p role="status" className="mt-3 text-sm text-gray-700">{message}</p>}
      </CardBody>
    </Card>
  )
}
