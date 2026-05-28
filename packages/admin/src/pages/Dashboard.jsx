import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarCheck, Clock, XCircle, TrendingUp, DollarSign,
  Plus, User, Phone, Mail, Calendar, Users, Banknote, Check,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PAYMENT_METHODS = [
  { id: 'cash',     label: 'Dinheiro' },
  { id: 'pix',      label: 'Pix'      },
  { id: 'credit',   label: 'Cartão de crédito' },
  { id: 'debit',    label: 'Cartão de débito' },
  { id: 'transfer', label: 'Transferência' },
]

const BOOKING_EMPTY = {
  customer_name: '', customer_phone: '', customer_email: '',
  service_type: 'tour', service_id: '', service_name: '',
  booking_mode: 'private',
  service_date: '', service_time: '',
  people_count: '2', total_amount: '',
  payment_method: 'cash', payment_status: 'paid',
  notes: '',
}

function KpiCard({ icon: Icon, label, value, sub, color = 'text-brand' }) {
  return (
    <Card className="p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gray-900 ${color} flex-shrink-0`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
      </div>
    </Card>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-medium text-gray-300 mb-1">{label}</p>
      <p className="text-brand font-bold">{fmt(payload[0]?.value)}</p>
    </div>
  )
}

function NovaReservaModal({ open, onClose, onSuccess }) {
  const [form, setForm] = useState(BOOKING_EMPTY)
  const [step, setStep] = useState(1) // 1=cliente, 2=serviço, 3=pagamento
  const [success, setSuccess] = useState(null)

  const { data: tours = [] } = useQuery({
    queryKey: ['catalog-tours'],
    queryFn:  () => api.getTours(),
    enabled:  open,
  })

  const mut = useMutation({
    mutationFn: (body) => api.createManualBooking(body),
    onSuccess: (data) => {
      setSuccess(data)
      onSuccess?.()
    },
    onError: (err) => alert(`Erro: ${err.message}`),
  })

  function handleClose() {
    setForm(BOOKING_EMPTY)
    setStep(1)
    setSuccess(null)
    onClose()
  }

  function setF(k, v) { setForm((f) => ({ ...f, [k]: v })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.service_date || !form.total_amount) return
    mut.mutate({ ...form, people_count: Number(form.people_count), total_amount: Number(form.total_amount) })
  }

  return (
    <Modal open={open} onClose={handleClose} title="Nova Reserva Manual" size="md">
      {success ? (
        <div className="flex flex-col items-center py-6 gap-4">
          <div className="w-16 h-16 rounded-full bg-green-900/40 flex items-center justify-center">
            <Check size={28} className="text-green-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-100">Reserva criada!</p>
            <p className="text-sm text-gray-400 mt-1">Código: <span className="font-mono text-brand">{success.booking_code}</span></p>
          </div>
          <Button onClick={handleClose} className="w-full">Fechar</Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Abas de passo */}
          <div className="flex gap-1 bg-gray-900 rounded-xl p-1">
            {['Cliente', 'Serviço', 'Pagamento'].map((label, i) => (
              <button
                key={label} type="button"
                onClick={() => setStep(i + 1)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${step === i + 1 ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>

          {/* Passo 1 — Cliente */}
          {step === 1 && (
            <div className="space-y-3">
              <Input
                label="Nome do cliente"
                value={form.customer_name}
                onChange={(e) => setF('customer_name', e.target.value)}
                placeholder="João Silva"
              />
              <Input
                label="Telefone / WhatsApp"
                value={form.customer_phone}
                onChange={(e) => setF('customer_phone', e.target.value)}
                placeholder="+55 88 99999-9999"
              />
              <Input
                label="E-mail (opcional)"
                type="email"
                value={form.customer_email}
                onChange={(e) => setF('customer_email', e.target.value)}
                placeholder="joao@email.com"
              />
              <Button type="button" className="w-full" onClick={() => setStep(2)}>
                Próximo →
              </Button>
            </div>
          )}

          {/* Passo 2 — Serviço */}
          {step === 2 && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Tipo de serviço</label>
                <div className="grid grid-cols-2 gap-2">
                  {['tour', 'transfer'].map((t) => (
                    <button
                      key={t} type="button"
                      onClick={() => setF('service_type', t)}
                      className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${form.service_type === t ? 'bg-brand text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                    >
                      {t === 'tour' ? 'Passeio' : 'Transfer'}
                    </button>
                  ))}
                </div>
              </div>

              {form.service_type === 'tour' && tours.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Passeio</label>
                  <select
                    value={form.service_id}
                    onChange={(e) => {
                      const t = tours.find((x) => x.id === e.target.value)
                      setForm((f) => ({ ...f, service_id: e.target.value, service_name: t?.name || '' }))
                    }}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-brand/60"
                  >
                    <option value="">Selecione…</option>
                    {tours.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}

              {form.service_type === 'transfer' && (
                <Input
                  label="Descrição do transfer"
                  value={form.service_name}
                  onChange={(e) => setF('service_name', e.target.value)}
                  placeholder="Ex: Aeroporto → Hotel"
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Modalidade</label>
                  <select
                    value={form.booking_mode}
                    onChange={(e) => setF('booking_mode', e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-brand/60"
                  >
                    <option value="private">Privativo</option>
                    <option value="shared">Compartilhado</option>
                  </select>
                </div>
                <Input
                  label="Nº de pessoas"
                  type="number" min="1"
                  value={form.people_count}
                  onChange={(e) => setF('people_count', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Data"
                  type="date"
                  value={form.service_date}
                  onChange={(e) => setF('service_date', e.target.value)}
                  required
                />
                <Input
                  label="Horário (opcional)"
                  type="time"
                  value={form.service_time}
                  onChange={(e) => setF('service_time', e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(1)} className="flex-1">← Voltar</Button>
                <Button type="button" className="flex-1" onClick={() => setStep(3)} disabled={!form.service_date}>Próximo →</Button>
              </div>
            </div>
          )}

          {/* Passo 3 — Pagamento */}
          {step === 3 && (
            <div className="space-y-3">
              <Input
                label="Valor total (R$)"
                type="number" min="0" step="0.01"
                value={form.total_amount}
                onChange={(e) => setF('total_amount', e.target.value)}
                placeholder="450.00"
                required
              />

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Forma de pagamento</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id} type="button"
                      onClick={() => setF('payment_method', m.id)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors text-left ${form.payment_method === m.id ? 'bg-brand text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Status do pagamento</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setF('payment_status', 'paid')}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${form.payment_status === 'paid' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                  >
                    Pago ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => setF('payment_status', 'pending')}
                    className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${form.payment_status === 'pending' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                  >
                    A receber
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Observações (opcional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setF('notes', e.target.value)}
                  rows={2}
                  placeholder="Informações adicionais…"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-brand/60 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(2)} className="flex-1">← Voltar</Button>
                <Button type="submit" className="flex-1" disabled={mut.isPending || !form.total_amount || !form.service_date}>
                  {mut.isPending ? 'Salvando…' : 'Criar reserva'}
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  )
}

export default function Dashboard() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: stats, isLoading: l1 } = useQuery({
    queryKey: ['admin-stats'],
    queryFn:  () => api.getStats(),
    refetchInterval: 60_000,
  })

  const { data: daily = [], isLoading: l2 } = useQuery({
    queryKey: ['financial-daily-30'],
    queryFn:  () => api.getFinancialDaily({ days: 30 }),
  })

  if (l1 || l2) return <PageSpinner />

  const chartData = daily.map((d) => ({
    date: (() => {
      try { return format(parseISO(d.date), 'd MMM', { locale: ptBR }) } catch { return d.date }
    })(),
    total: Number(d.total),
  }))

  return (
    <div className="space-y-6">
      {/* Header com botão de ação */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-100">Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Visão geral da operação</p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus size={15} /> Nova Reserva
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={CalendarCheck} label="Reservas hoje"       value={stats?.reservas_hoje ?? '—'}  color="text-blue-400" />
        <KpiCard icon={Clock}         label="Ag. pagamento"       value={stats?.pendencias ?? '—'}      color="text-amber-400" />
        <KpiCard icon={XCircle}       label="Cancelamentos hoje"  value={stats?.cancelamentos ?? '—'}   color="text-red-400" />
        <KpiCard icon={DollarSign}    label="Receita hoje"        value={fmt(stats?.valor_bruto_hoje)}  sub={`Mês: ${fmt(stats?.valor_bruto_mes)}`} color="text-brand" />
      </div>

      {/* Gráfico de faturamento — 30 dias */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Faturamento — últimos 30 dias</h2>
            <span className="text-xs text-gray-600">Receita bruta</span>
          </div>
        </CardHeader>
        <CardBody>
          {chartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-600 text-sm">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradBrand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FF6A00" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#FF6A00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" stroke="#FF6A00" strokeWidth={2} fill="url(#gradBrand)" dot={false} activeDot={{ r: 4, fill: '#FF6A00' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Receita bruta (mês)</p>
          <p className="text-xl font-bold text-gray-100">{fmt(stats?.valor_bruto_mes)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Receita líquida (mês)</p>
          <p className="text-xl font-bold text-green-400">{fmt((stats?.valor_bruto_mes || 0) * 0.93)}</p>
        </Card>
      </div>

      <NovaReservaModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['admin-stats'] })}
      />
    </div>
  )
}
