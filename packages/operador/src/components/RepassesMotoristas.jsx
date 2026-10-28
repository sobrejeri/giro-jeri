import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Phone, Car, Calendar, Check, Undo2 } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from './ui/Spinner'
import Card, { CardBody } from './ui/Card'
import Button from './ui/Button'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Data curta DD/MM/AAAA a partir de 'YYYY-MM-DD' ou ISO, sem o fuso trair o dia.
function fmtDia(d) {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  const [y, m, dia] = s.split('-')
  return (y && m && dia) ? `${dia}/${m}/${y}` : s
}

const FILTROS = [
  { id: 'pending',   label: 'A pagar'    },
  { id: 'paid',      label: 'Pagos'      },
  { id: 'cancelled', label: 'Cancelados' },
  { id: 'all',       label: 'Todos'      },
]

// Chip de status próprio (não depende das chaves do componente Badge).
function StatusChip({ status }) {
  const map = {
    pending:   ['Pendente',  'bg-amber-100 text-amber-700'],
    paid:      ['Pago',      'bg-green-100 text-green-700'],
    cancelled: ['Cancelado', 'bg-gray-100 text-gray-500'],
  }
  const [label, cls] = map[status] || map.pending
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>{label}</span>
}

// ── Repasses ao motorista ────────────────────────────────────────────────────
// O que ESTE operador paga aos executores (motoristas), por fora da plataforma.
// Espelha o controle que ficava no admin — agora sob o operador, que é quem faz
// o despacho e quem paga. O admin segue só como supervisão (leitura).
export default function RepassesMotoristas() {
  const [status, setStatus]     = useState('pending')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [editando, setEditando] = useState(null)
  const [valor, setValor]       = useState('')
  const [obs, setObs]           = useState('')
  const qc = useQueryClient()

  const params = {
    ...(status === 'all' ? {} : { status }),
    ...(from ? { from } : {}),
    ...(to   ? { to }   : {}),
  }
  const { data, isLoading } = useQuery({
    queryKey: ['driver-payouts', status, from, to],
    queryFn:  () => api.getDriverPayouts(params),
  })

  const salvar = useMutation({
    mutationFn: ({ id, body }) => api.updateDriverPayout(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-payouts'] })
      setEditando(null); setValor(''); setObs('')
    },
    onError: (err) => alert(err?.message || 'Não foi possível salvar o repasse.'),
  })

  if (isLoading) return <PageSpinner />

  const rows   = data?.rows   || []
  const totals = data?.totals || { pending: 0, paid: 0, count: 0 }

  function abrirEdicao(r) {
    setEditando(r.id)
    setValor(r.driver_payout_amount != null ? String(r.driver_payout_amount) : '')
    setObs(r.driver_payout_notes || '')
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <Wallet size={20} className="text-brand" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Repasses aos motoristas</h2>
          <p className="text-[13px] text-gray-500">
            Pagamento feito por você, fora da plataforma — aqui você controla o que já pagou e o que ainda deve aos seus executores.
          </p>
        </div>
      </div>

      {data?.migration_pending && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Recurso ainda não liberado no banco. Peça para aplicar a migração <strong>066</strong>.
        </p>
      )}

      {/* Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-400">A pagar</p>
          <p className="text-2xl font-extrabold text-amber-600 mt-1">{fmt(totals.pending)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-400">Já repassado</p>
          <p className="text-2xl font-extrabold text-green-600 mt-1">{fmt(totals.paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-400">Corridas no filtro</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1">{totals.count}</p>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                status === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Serviço de</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700" />
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo('') }} className="text-xs text-gray-400 hover:text-gray-700 pb-2">
            limpar datas
          </button>
        )}
      </div>

      {/* Lista */}
      {rows.length === 0 ? (
        <Card><CardBody>
          <p className="text-center text-gray-400 py-8 text-sm">
            Nenhuma corrida com motorista indicado neste filtro.
          </p>
        </CardBody></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const b = r.bookings || {}
            const emEdicao = editando === r.id
            const pago = r.driver_payout_status === 'paid'
            // Repasse só depois da reserva concluída (mesma regra do servidor).
            const concluida = b.status_operational === 'completed'
            return (
              <Card key={r.id}><CardBody>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Motorista + serviço */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900">{r.driver_name}</p>
                      <StatusChip status={r.driver_payout_status || 'pending'} />
                      {b.booking_code && (
                        <span className="text-[11px] text-gray-400 font-mono">{b.booking_code}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12.5px] text-gray-500">
                      {r.driver_phone && (
                        <span className="inline-flex items-center gap-1.5"><Phone size={12} />{r.driver_phone}</span>
                      )}
                      {r.real_vehicle_text && (
                        <span className="inline-flex items-center gap-1.5"><Car size={12} />{r.real_vehicle_text}</span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={12} />
                        {fmtDia(b.service_date)}{b.service_time ? ` · ${String(b.service_time).slice(0, 5)}` : ''}
                      </span>
                    </div>

                    {(b.origin_text || b.destination_text) && (
                      <p className="text-[12px] text-gray-400 mt-1 truncate">
                        {[b.origin_text, b.destination_text].filter(Boolean).join(' → ')}
                      </p>
                    )}

                    <p className="text-[12px] text-gray-400 mt-1">
                      Valor da reserva: <span className="text-gray-700 font-semibold">{fmt(b.total_amount)}</span>
                    </p>

                    {pago && r.driver_paid_at && (
                      <p className="text-[12px] text-green-600 mt-1">
                        Repassado em {fmtDia(r.driver_paid_at)}
                        {r.driver_payout_notes ? ` · ${r.driver_payout_notes}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Valor + ações */}
                  <div className="shrink-0 text-right">
                    {emEdicao ? (
                      <div className="flex flex-col items-end gap-2 w-[220px]">
                        <input
                          type="number" min={0} step="0.01" autoFocus
                          value={valor} onChange={(e) => setValor(e.target.value)}
                          placeholder="Valor do repasse"
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right text-gray-900"
                        />
                        <input
                          value={obs} onChange={(e) => setObs(e.target.value)}
                          placeholder="PIX, dinheiro, observação…"
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setEditando(null); setValor(''); setObs('') }}
                            className="text-xs text-gray-400 hover:text-gray-700 px-2"
                          >
                            Cancelar
                          </button>
                          <Button size="sm"
                            onClick={() => salvar.mutate({ id: r.id, body: { amount: valor, notes: obs } })}
                            disabled={salvar.isPending}
                          >
                            {salvar.isPending ? 'Salvando…' : 'Salvar'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-[11px] text-gray-400">Repasse</p>
                        <p className={`text-xl font-extrabold ${r.driver_payout_amount != null ? 'text-gray-900' : 'text-gray-300'}`}>
                          {r.driver_payout_amount != null ? fmt(r.driver_payout_amount) : 'a definir'}
                        </p>
                        <div className="flex items-center justify-end gap-2 mt-2">
                          <button
                            onClick={() => abrirEdicao(r)}
                            className="text-xs text-gray-500 hover:text-gray-800 underline"
                          >
                            {r.driver_payout_amount != null ? 'editar' : 'definir valor'}
                          </button>
                          {pago ? (
                            <Button variant="secondary" size="sm"
                              onClick={() => salvar.mutate({ id: r.id, body: { status: 'pending' } })}
                              disabled={salvar.isPending}
                            >
                              <Undo2 size={14} /> Desfazer
                            </Button>
                          ) : (
                            <Button size="sm"
                              onClick={() => salvar.mutate({ id: r.id, body: { status: 'paid' } })}
                              disabled={salvar.isPending || r.driver_payout_amount == null || !concluida}
                              title={
                                !concluida ? 'A reserva ainda não foi concluída — o repasse libera após a conclusão'
                                : r.driver_payout_amount == null ? 'Defina o valor antes de dar baixa' : ''
                              }
                            >
                              <Check size={14} /> Marcar pago
                            </Button>
                          )}
                        </div>
                        {!pago && !concluida && (
                          <p className="text-[11px] text-amber-600 mt-1.5 max-w-[220px]">
                            Aguardando a reserva ser concluída para liberar o repasse.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardBody></Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
