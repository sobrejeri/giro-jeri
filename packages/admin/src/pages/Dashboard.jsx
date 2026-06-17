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
  Filter, Car, MapPin, Briefcase, Trophy, ArrowDown,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDateShort = (iso) => {
  if (!iso) return '—'
  try { return format(parseISO(iso), 'd MMM', { locale: ptBR }) } catch { return iso }
}

// Andamento operacional (status_operational) — rótulos e cores
const OP_STATUS = {
  new:               { label: 'Nova',                   dot: 'bg-gray-400',   text: 'text-gray-300',   chip: 'bg-gray-700/60' },
  awaiting_dispatch: { label: 'Aguardando cooperativa', dot: 'bg-amber-400',  text: 'text-amber-300',  chip: 'bg-amber-900/40' },
  confirmed:         { label: 'Confirmada',             dot: 'bg-blue-400',   text: 'text-blue-300',   chip: 'bg-blue-900/40' },
  assigned:          { label: 'Atribuída',              dot: 'bg-indigo-400', text: 'text-indigo-300', chip: 'bg-indigo-900/40' },
  en_route:          { label: 'A caminho',              dot: 'bg-cyan-400',   text: 'text-cyan-300',   chip: 'bg-cyan-900/40' },
  in_progress:       { label: 'Em andamento',           dot: 'bg-purple-400', text: 'text-purple-300', chip: 'bg-purple-900/40' },
  completed:         { label: 'Concluída',              dot: 'bg-green-400',  text: 'text-green-300',  chip: 'bg-green-900/40' },
  occurrence:        { label: 'Ocorrência',             dot: 'bg-red-400',    text: 'text-red-300',    chip: 'bg-red-900/40' },
}
const OP_ORDER = ['new','awaiting_dispatch','confirmed','assigned','en_route','in_progress','completed','occurrence']

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
    <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-gray-900 ${color} flex-shrink-0`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs text-gray-500 font-medium uppercase tracking-wide leading-tight">{label}</p>
        <p className={`text-xl sm:text-2xl font-bold mt-0.5 ${color} truncate`}>{value}</p>
        {sub && <p className="text-[11px] sm:text-xs text-gray-600 mt-0.5 truncate">{sub}</p>}
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
    onSuccess: (data) => { setSuccess(data); onSuccess?.() },
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

              {mut.isError && (
                <p className="text-sm text-red-400 text-center">{mut.error?.message || 'Erro ao criar reserva'}</p>
              )}
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

// ── Acompanhamento operacional (filtro por cooperativa / passeio / transfer) ──
function AcompanhamentoOperacional() {
  const [operatorId,  setOperatorId]  = useState('')
  const [serviceType, setServiceType] = useState('')   // '' | 'tour' | 'transfer'
  const [tourId,      setTourId]      = useState('')
  const [status,      setStatus]      = useState('')    // '' = todos
  const [date,        setDate]        = useState('')    // '' = todas as datas

  const { data: operatorsData } = useQuery({
    queryKey: ['admin-operators'],
    queryFn:  () => api.getUsers({ user_type: 'operator', limit: 200 }),
  })
  const operators = (operatorsData?.data || []).filter((u) => u.user_type === 'operator')

  const { data: tours = [] } = useQuery({
    queryKey: ['catalog-tours'],
    queryFn:  () => api.getTours(),
  })
  const tourName = (id) => tours.find((t) => t.id === id)?.name

  const params = { date: date || 'all' }
  if (operatorId)  params.operator_id  = operatorId
  if (serviceType) params.service_type = serviceType

  const { data: op, isLoading, isFetching } = useQuery({
    queryKey: ['admin-operational', params],
    queryFn:  () => api.getOperational(params),
    refetchInterval: 30_000,
  })

  // Base respeitando todos os filtros menos o status (para contar por status)
  let base = Object.values(op?.columns || {}).flat()
  if (tourId) base = base.filter((b) => b.service_id === tourId)

  const counts = OP_ORDER.reduce((acc, s) => {
    acc[s] = base.filter((b) => (b.status_operational || 'new') === s).length
    return acc
  }, {})

  let list = status ? base.filter((b) => (b.status_operational || 'new') === status) : base
  list = [...list].sort((a, b) =>
    `${a.service_date || ''}${a.service_time || ''}`.localeCompare(`${b.service_date || ''}${b.service_time || ''}`))

  const serviceLabel = (b) => {
    if (b.service_type === 'transfer') {
      return [b.origin_text || b.pickup_place_name, b.destination_text || b.destination_place_name]
        .filter(Boolean).join(' → ') || 'Transfer'
    }
    return tourName(b.service_id) || 'Passeio'
  }

  const selectCls = 'bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand/60'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Filter size={15} className="text-brand" /> Acompanhamento operacional
          </h2>
          {isFetching && <span className="text-[11px] text-gray-600">atualizando…</span>}
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {/* Filtros */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={selectCls}>
              <option value="">Todas as cooperativas</option>
              {operators.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
            <select
              value={serviceType}
              onChange={(e) => { setServiceType(e.target.value); if (e.target.value === 'transfer') setTourId('') }}
              className={selectCls}
            >
              <option value="">Passeios e transfers</option>
              <option value="tour">Só passeios</option>
              <option value="transfer">Só transfers</option>
            </select>
            <select
              value={tourId}
              onChange={(e) => setTourId(e.target.value)}
              disabled={serviceType === 'transfer'}
              className={`${selectCls} ${serviceType === 'transfer' ? 'opacity-40' : ''}`}
            >
              <option value="">Todos os passeios</option>
              {tours.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectCls} title="Filtrar por data (vazio = todas)" />
          </div>

          {/* Chips de status (andamento) */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setStatus('')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${status === '' ? 'bg-brand text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Todos ({base.length})
            </button>
            {OP_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(status === s ? '' : s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${status === s ? 'bg-brand text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${OP_STATUS[s].dot}`} /> {OP_STATUS[s].label} ({counts[s]})
              </button>
            ))}
          </div>

          {/* Lista */}
          {isLoading ? (
            <div className="py-10 text-center text-gray-600 text-sm">Carregando…</div>
          ) : list.length === 0 ? (
            <div className="py-10 text-center text-gray-600 text-sm">Nenhuma atividade para os filtros selecionados.</div>
          ) : (
            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {list.map((b) => {
                const st = OP_STATUS[b.status_operational || 'new'] || OP_STATUS.new
                return (
                  <div key={b.id} className="flex items-center gap-3 bg-gray-900/60 border border-gray-800 rounded-xl px-3 py-2.5">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${b.service_type === 'transfer' ? 'bg-teal-900/40 text-teal-300' : 'bg-orange-900/40 text-brand'}`}>
                      {b.service_type === 'transfer' ? <Car size={16} /> : <MapPin size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-200 truncate">{serviceLabel(b)}</p>
                        <span className="text-[10px] font-mono text-gray-500 shrink-0">{b.booking_code}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {b.users?.full_name || 'Cliente'} · {fmtDateShort(b.service_date)}{b.service_time ? ` ${String(b.service_time).slice(0, 5)}` : ''} · {b.people_count || 1}p
                      </p>
                      <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                        <Briefcase size={10} />
                        {b.operator?.full_name || <span className="text-gray-600 italic">sem cooperativa</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${st.chip} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
                      </span>
                      <p className="text-[11px] text-gray-400 mt-1">{fmt(b.total_amount)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

// ── Ranking comparativo de cooperativas ──────────────────────
function RankingCooperativas() {
  const [period, setPeriod] = useState('month') // 'month' | '30d' | 'all'
  const [sortBy, setSortBy] = useState('revenue')

  const params = {}
  const now = new Date()
  if (period === 'month') params.date_from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  else if (period === '30d') params.date_from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['operator-performance', params],
    queryFn:  () => api.getOperatorPerformance(params),
    refetchInterval: 60_000,
  })

  const operators = data?.operators || []
  const totals    = data?.totals
  const sorted    = [...operators].sort((a, b) => (Number(b[sortBy]) || 0) - (Number(a[sortBy]) || 0))
  const maxVal    = Math.max(1, ...sorted.map((o) => Number(o[sortBy]) || 0))

  const COLS = [
    { key: 'revenue',    label: 'Receita',      money: true },
    { key: 'tours',      label: 'Passeios'      },
    { key: 'transfers',  label: 'Transfers'     },
    { key: 'total',      label: 'Total'         },
    { key: 'completed',  label: 'Concluídas'    },
    { key: 'ticket_avg', label: 'Ticket médio', money: true },
  ]
  const RANK = ['bg-amber-400 text-amber-950', 'bg-gray-300 text-gray-800', 'bg-orange-700 text-orange-100']
  const PERIODS = [
    { id: 'month', label: 'Este mês' },
    { id: '30d',   label: '30 dias'  },
    { id: 'all',   label: 'Tudo'     },
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Trophy size={15} className="text-amber-400" /> Ranking de cooperativas
            {isFetching && <span className="text-[11px] text-gray-600 font-normal">atualizando…</span>}
          </h2>
          <div className="flex gap-1 bg-gray-900 rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${period === p.id ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <div className="py-10 text-center text-gray-600 text-sm">Carregando…</div>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-center text-gray-600 text-sm">Nenhuma reserva atribuída a cooperativas neste período.</div>
        ) : (
          <div className="overflow-x-auto">
            <p className="text-[11px] text-gray-600 mb-2">Toque numa coluna para ordenar. A barra compara <span className="text-gray-400 font-medium">{COLS.find((c) => c.key === sortBy)?.label}</span>.</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-[11px] uppercase tracking-wide border-b border-gray-800">
                  <th className="text-left font-medium py-2 pl-1 w-7">#</th>
                  <th className="text-left font-medium py-2">Cooperativa</th>
                  {COLS.map((c) => (
                    <th key={c.key} onClick={() => setSortBy(c.key)}
                        className={`font-medium py-2 px-2 whitespace-nowrap cursor-pointer select-none hover:text-gray-300 ${c.money ? 'text-right' : 'text-center'} ${sortBy === c.key ? 'text-brand' : ''}`}>
                      <span className="inline-flex items-center gap-1">{c.label}{sortBy === c.key && <ArrowDown size={11} />}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sorted.map((o, i) => (
                  <tr key={o.operator_id} className="hover:bg-gray-800/40">
                    <td className="py-2.5 pl-1">
                      <span className={`w-5 h-5 inline-flex items-center justify-center rounded-full text-[11px] font-bold ${RANK[i] || 'bg-gray-800 text-gray-500'}`}>{i + 1}</span>
                    </td>
                    <td className="py-2.5 pr-2 min-w-[140px]">
                      <p className="font-semibold text-gray-200 truncate max-w-[170px]">{o.name}</p>
                      <div className="mt-1 h-1 rounded-full bg-gray-800 overflow-hidden w-28">
                        <div className="h-full bg-gradient-to-r from-brand to-amber-400" style={{ width: `${Math.max(3, ((Number(o[sortBy]) || 0) / maxVal) * 100)}%` }} />
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-brand whitespace-nowrap">{fmt(o.revenue)}</td>
                    <td className="py-2.5 px-2 text-center text-gray-300">{o.tours}</td>
                    <td className="py-2.5 px-2 text-center text-gray-300">{o.transfers}</td>
                    <td className="py-2.5 px-2 text-center text-gray-300">{o.total}</td>
                    <td className="py-2.5 px-2 text-center text-gray-400">{o.completed}</td>
                    <td className="py-2.5 px-2 text-right text-gray-300 whitespace-nowrap">{fmt(o.ticket_avg)}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t border-gray-700 font-semibold text-gray-300">
                    <td></td>
                    <td className="py-2.5 text-[12px] text-gray-500">Total · {sorted.length} coop.</td>
                    <td className="py-2.5 px-2 text-right text-brand whitespace-nowrap">{fmt(totals.revenue)}</td>
                    <td className="py-2.5 px-2 text-center">{totals.tours}</td>
                    <td className="py-2.5 px-2 text-center">{totals.transfers}</td>
                    <td className="py-2.5 px-2 text-center">{totals.total}</td>
                    <td className="py-2.5 px-2 text-center">—</td>
                    <td className="py-2.5 px-2 text-right">—</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardBody>
    </Card>
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

      {/* Acompanhamento operacional — filtro por cooperativa / passeio / transfer */}
      <AcompanhamentoOperacional />

      {/* Ranking comparativo de cooperativas */}
      <RankingCooperativas />

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
