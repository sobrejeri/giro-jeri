import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

const empty = { bank_name: '', bank_agency: '', bank_account_number: '', bank_account_type: '', bank_document: '', pix_key_type: '', pix_key: '' }
const fields = [['bank_name', 'Banco'], ['bank_agency', 'Agência'], ['bank_account_number', 'Conta'], ['bank_document', 'CPF ou CNPJ do titular'], ['pix_key', 'Chave PIX']]
export default function Empresa() {
  const { user, token, logout } = useAuth()
  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!token || user?.user_type !== 'company') return
    let mounted = true
    api.getCompanyAccount().then(data => { if (mounted) { setForm(Object.fromEntries(Object.keys(empty).map(k => [k, data?.[k] || '']))); setLoading(false) } }).catch(err => { if (mounted) { setMessage(err.message); setLoadFailed(true); setLoading(false) } })
    return () => { mounted = false }
  }, [token, user?.user_type])
  if (!token) return <Navigate to="/login" replace />
  if (user?.user_type !== 'company') return <Navigate to="/" replace />
  async function save(e) {
    e.preventDefault(); setBusy(true); setMessage('')
    try { await api.saveCompanyAccount(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]))); setMessage('Dados de recebimento salvos.') }
    catch (err) { setMessage(err.message) } finally { setBusy(false) }
  }
  const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 bg-white'
  return <main className="min-h-screen bg-gray-50 p-4 flex justify-center"><section className="w-full max-w-xl mt-8">
    <div className="flex items-center justify-between gap-4"><h1 className="text-xl font-bold text-gray-900">{user.full_name}</h1><button onClick={logout} className="text-sm text-orange-600">Sair</button></div>
    <div className="bg-white border rounded-xl p-5 mt-5"><h2 className="font-semibold">Conta de recebimento</h2><p className="text-sm text-gray-600 mt-2">Cadastre os dados da empresa para receber os repasses. As comissões dos operadores vinculados à empresa são pagas nesta conta.</p>
    {loading ? <p className="mt-4 text-sm">Carregando…</p> : <form onSubmit={save} className="space-y-3 mt-4">
      {fields.map(([key, label]) => <label key={key} className="block text-sm text-gray-700">{label}<input className={input} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <label className="block text-sm text-gray-700">Tipo de conta<select className={input} value={form.bank_account_type} onChange={e => setForm({ ...form, bank_account_type: e.target.value })}><option value="">Selecione</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option></select></label>
      <label className="block text-sm text-gray-700">Tipo da chave PIX<select className={input} value={form.pix_key_type} onChange={e => setForm({ ...form, pix_key_type: e.target.value })}><option value="">Selecione</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random_key">Aleatória</option></select></label>
      <button className="bg-orange-600 text-white rounded-lg px-4 py-2 disabled:opacity-50" disabled={busy || loadFailed}>{busy ? 'Salvando…' : 'Salvar dados'}</button>
    </form>}{message && <p role="status" className="mt-3 text-sm text-gray-700">{message}</p>}</div>
    <CompanyCommissions key={user.id} />
  </section></main>
}


const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const payoutStatus = { pending: 'Pendente', paid: 'Pago', cancelled: 'Cancelado' }

function CompanyCommissions() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    api.getCompanyCommissions().then(result => {
      if (active) setRows(result?.rows || [])
    }).catch(() => {
      if (active) setError(true)
    })
    return () => { active = false }
  }, [])

  return (
    <section className="bg-white border rounded-xl p-5 mt-5" aria-label="Comissões da empresa">
      <h2 className="font-semibold">Comissões da empresa</h2>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">Não foi possível carregar as comissões.</p>}
      {!error && rows === null && <p className="mt-2 text-sm text-gray-600">Carregando comissões…</p>}
      {rows?.length === 0 && <p className="mt-2 text-sm text-gray-600">Nenhuma comissão registrada.</p>}
      {rows?.length > 0 && <>
        <p className="mt-2 text-sm text-gray-600">Até 50 lançamentos mais recentes.</p>
        <ul className="divide-y mt-2">
          {rows.map(row => (
            <li key={row.id} className="flex justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{row.bookings?.booking_code || 'Reserva'}</p>
                <p className="text-gray-600">{row.operator?.full_name || 'Operador indisponível'}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{currency.format(row.amount)}</p>
                <p className="text-gray-600">{payoutStatus[row.status] || row.status}</p>
              </div>
            </li>
          ))}
        </ul>
      </>}
    </section>
  )
}
