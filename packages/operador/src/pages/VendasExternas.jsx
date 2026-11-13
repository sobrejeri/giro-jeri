// Vendas externas — o operador da equipe registra o que vendeu FORA da
// plataforma (balcão, WhatsApp, indicação). Serve para a empresa acompanhar o
// desempenho completo. É só registro: não cobra nem gera comissão.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Ban, Undo2 } from 'lucide-react'
import { api } from '../lib/api'
import Card, { CardBody } from '../components/ui/Card'
import Input, { Select, Textarea } from '../components/ui/Input'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d) => { const [y, m, x] = String(d || '').slice(0, 10).split('-'); return y && m && x ? `${x}/${m}/${y}` : '—' }
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date())
const TIPO = { tour: 'Passeio', transfer: 'Translado', other: 'Outro' }
const novo = () => ({ customer_name: '', customer_phone: '', service_type: 'tour', service_description: '', service_date: hoje(), service_time: '', people_count: '1', total_amount: '', executor_name: '', notes: '' })
// "1.250,50" ou "1250.50" → 1250.5
export const lerValor = (t) => { const s = String(t).trim(); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) }

export default function VendasExternas() {
  const qc = useQueryClient()
  const { data, isPending, isError } = useQuery({ queryKey: ['external-bookings'], queryFn: api.getExternalBookings })
  const [modal, setModal] = useState(null)       // null | { venda? }
  const [form, setForm] = useState(novo())
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const rows = data?.rows || []
  const ativas = rows.filter((r) => r.status !== 'cancelled')

  const abrir = (venda = null) => {
    setErro('')
    setForm(venda ? {
      customer_name: venda.customer_name || '', customer_phone: venda.customer_phone || '', service_type: venda.service_type,
      service_description: venda.service_description || '', service_date: venda.service_date, service_time: (venda.service_time || '').slice(0, 5),
      people_count: String(venda.people_count), total_amount: String(venda.total_amount).replace('.', ','), executor_name: venda.executor_name || '', notes: venda.notes || '',
    } : novo())
    setModal({ venda })
  }
  async function executar(acao) {
    setBusy(true); setErro('')
    try { await acao(); await qc.invalidateQueries({ queryKey: ['external-bookings'] }); setModal(null) }
    catch (e) { setErro(e.message || 'Não foi possível salvar.') } finally { setBusy(false) }
  }
  const salvar = (e) => {
    e.preventDefault()
    const valor = lerValor(form.total_amount)
    if (!Number.isFinite(valor) || valor < 0) return setErro('Informe o valor da venda.')
    const body = {
      customer_name: form.customer_name.trim(), customer_phone: form.customer_phone.trim() || null,
      service_type: form.service_type, service_description: form.service_description.trim(),
      service_date: form.service_date, service_time: form.service_time || null,
      people_count: Math.max(1, parseInt(form.people_count, 10) || 1), total_amount: valor,
      executor_name: form.executor_name.trim() || null, notes: form.notes.trim() || null,
    }
    return executar(() => (modal.venda ? api.updateExternalBooking(modal.venda.id, body) : api.createExternalBooking(body)))
  }
  const campo = (k) => ({ value: form[k], onChange: (e) => setForm({ ...form, [k]: e.target.value }) })

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Vendas externas</h1>
          <p className="text-sm text-gray-600">Registre o que você vendeu fora da Turiva. A empresa acompanha junto com as reservas da plataforma.</p>
        </div>
        <Button onClick={() => abrir()} className="shrink-0"><Plus size={16} /> Registrar</Button>
      </div>

      {isPending && <p className="text-sm text-gray-600">Carregando…</p>}
      {isError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar as vendas.</p>}
      {erro && !modal && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      {data?.pendente && <Card><CardBody><p className="text-sm text-gray-700">O registro de vendas externas ainda não foi ativado. Avise a Turiva.</p></CardBody></Card>}

      {rows.length > 0 && (
        <Card><CardBody className="flex justify-between text-sm">
          <span className="text-gray-600">{ativas.length} {ativas.length === 1 ? 'venda registrada' : 'vendas registradas'}</span>
          <span className="font-semibold text-gray-900">{moeda(ativas.reduce((s, r) => s + Number(r.total_amount || 0), 0))}</span>
        </CardBody></Card>
      )}
      {data && !data.pendente && rows.length === 0 && (
        <Card><CardBody className="text-center py-8">
          <p className="font-medium text-gray-900">Nenhuma venda externa registrada</p>
          <p className="text-sm text-gray-600 mt-1">Toque em "Registrar" para lançar a primeira.</p>
        </CardBody></Card>
      )}

      <ul className="space-y-3">
        {rows.map((v) => {
          const cancelada = v.status === 'cancelled'
          return (
            <li key={v.id}><Card className={cancelada ? 'opacity-70' : ''}><CardBody>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{v.service_description}</p>
                  <p className="text-sm text-gray-600">{TIPO[v.service_type]} · {dia(v.service_date)}{v.service_time ? ` às ${v.service_time.slice(0, 5)}` : ''} · {v.people_count} {v.people_count === 1 ? 'pessoa' : 'pessoas'}</p>
                  <p className="text-sm text-gray-500 truncate">Cliente: {v.customer_name}{v.executor_name ? ` · Executou: ${v.executor_name}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold ${cancelada ? 'line-through text-gray-400' : 'text-gray-900'}`}>{moeda(v.total_amount)}</p>
                  {cancelada && <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Cancelada</span>}
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {!cancelada && <Button variant="secondary" size="sm" onClick={() => abrir(v)}><Pencil size={14} /> Editar</Button>}
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => executar(() => api.updateExternalBooking(v.id, { status: cancelada ? 'active' : 'cancelled' }))}>
                  {cancelada ? <><Undo2 size={14} /> Reativar</> : <><Ban size={14} /> Cancelar</>}
                </Button>
              </div>
            </CardBody></Card></li>
          )
        })}
      </ul>

      <Modal open={!!modal} onClose={() => !busy && setModal(null)} title={modal?.venda ? 'Editar venda externa' : 'Registrar venda externa'}>
        <form onSubmit={salvar} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="Tipo" {...campo('service_type')}>
              <option value="tour">Passeio</option><option value="transfer">Translado</option><option value="other">Outro</option>
            </Select>
            <Input label="Valor da venda (R$)" required inputMode="decimal" placeholder="0,00" {...campo('total_amount')} />
          </div>
          <Input label="Serviço vendido" required minLength={2} maxLength={300} placeholder="Ex.: Buggy Litoral Leste" {...campo('service_description')} />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1"><Input label="Data" type="date" required {...campo('service_date')} /></div>
            <Input label="Horário" type="time" {...campo('service_time')} />
            <Input label="Pessoas" type="number" min="1" required {...campo('people_count')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Cliente" required minLength={2} {...campo('customer_name')} />
            <Input label="Telefone do cliente" inputMode="tel" {...campo('customer_phone')} />
          </div>
          <Input label="Quem executou (motorista, guia…)" placeholder="Deixe em branco se foi você" {...campo('executor_name')} />
          <Textarea label="Observações" rows={2} maxLength={1000} {...campo('notes')} />
          {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModal(null)}>Voltar</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
