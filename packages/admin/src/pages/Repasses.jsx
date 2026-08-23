import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Check, Undo2, Car, Phone, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Card, { CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDia = (iso) => (iso ? format(new Date(`${String(iso).slice(0, 10)}T12:00:00`), 'dd/MM/yyyy') : '—')

const FILTROS = [
  { id: 'pending',   label: 'A pagar'   },
  { id: 'paid',      label: 'Pagos'     },
  { id: 'cancelled', label: 'Cancelados'},
  { id: 'all',       label: 'Todos'     },
]

// Repasse ao motorista.
//
// Quando a plataforma opera as corridas (operador da casa, sem Mercado Pago
// conectado), o valor da reserva cai inteiro na conta da plataforma e o
// pagamento ao motorista é feito FORA do sistema (PIX/dinheiro). Esta tela é o
// controle: mostra motorista, veículo, data e valor do serviço, permite
// registrar quanto foi combinado e dar baixa quando o repasse é feito.
export default function Repasses() {
  const [status, setStatus] = useState('pending')
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [editando, setEditando] = useState(null)   // id da linha em edição
  const [valor, setValor]       = useState('')
  const [obs, setObs]           = useState('')
  const qc = useQueryClient()

  const params = {
    ...(status === 'all' ? {} : { status }),
    ...(from ? { from } : {}),
    ...(to   ? { to }   : {}),
  }
  const { data, isLoading } = useQuery({
    queryKey: ['admin-driver-payouts', status, from, to],
    queryFn:  () => api.getDriverPayouts(params),
  })

  const salvar = useMutation({
    mutationFn: ({ id, body }) => api.updateDriverPayout(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-driver-payouts'] })
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
      {/* ── Cabeçalho ───────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <Wallet size={20} className="text-brand" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Repasses aos motoristas</h1>
          <p className="text-sm text-gray-400">
            Pagamento feito fora da plataforma — aqui você controla o que já pagou e o que ainda deve.
          </p>
        </div>
      </div>

      {data?.migration_pending && (
        <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3">
          Aplique a migration <strong>066</strong> no banco para ativar o controle de repasses.
        </p>
      )}

      {/* ── Totais ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardBody>
          <p className="text-xs text-gray-400">A pagar</p>
          <p className="text-2xl font-extrabold text-amber-400 mt-1">{fmtBRL(totals.pending)}</p>
        </CardBody></Card>
        <Card><CardBody>
          <p className="text-xs text-gray-400">Já repassado</p>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1">{fmtBRL(totals.paid)}</p>
        </CardBody></Card>
        <Card><CardBody>
          <p className="text-xs text-gray-400">Corridas no filtro</p>
          <p className="text-2xl font-extrabold text-white mt-1">{totals.count}</p>
        </CardBody></Card>
      </div>

      {/* ── Filtros ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                status === f.id ? 'bg-brand text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">Serviço de</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200" />
        </label>
        {(from || to) && (
          <button onClick={() => { setFrom(''); setTo('') }} className="text-xs text-gray-400 hover:text-gray-200 pb-2">
            limpar datas
          </button>
        )}
      </div>

      {/* ── Lista ───────────────────────────────────────────── */}
      {rows.length === 0 ? (
        <Card><CardBody>
          <p className="text-center text-gray-500 py-8 text-sm">
            Nenhuma corrida com motorista indicado neste filtro.
          </p>
        </CardBody></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const b = r.bookings || {}
            const emEdicao = editando === r.id
            const pago = r.driver_payout_status === 'paid'
            return (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* Motorista + serviço */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-white">{r.driver_name}</p>
                        {/* Chave canônica: o Badge já traduz e colore
                            paid/pending/cancelled. */}
                        <Badge value={r.driver_payout_status || 'pending'} />
                        {b.booking_code && (
                          <span className="text-[11px] text-gray-500 font-mono">{b.booking_code}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12.5px] text-gray-400">
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
                        <p className="text-[12px] text-gray-500 mt-1 truncate">
                          {[b.origin_text, b.destination_text].filter(Boolean).join(' → ')}
                        </p>
                      )}

                      <p className="text-[12px] text-gray-500 mt-1">
                        Valor da reserva: <span className="text-gray-300 font-semibold">{fmtBRL(b.total_amount)}</span>
                      </p>

                      {pago && r.driver_paid_at && (
                        <p className="text-[12px] text-emerald-400/80 mt-1">
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
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-right text-white"
                          />
                          <input
                            value={obs} onChange={(e) => setObs(e.target.value)}
                            placeholder="PIX, dinheiro, observação…"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setEditando(null); setValor(''); setObs('') }}
                              className="text-xs text-gray-400 hover:text-gray-200 px-2"
                            >
                              Cancelar
                            </button>
                            <Button
                              onClick={() => salvar.mutate({ id: r.id, body: { amount: valor, notes: obs } })}
                              disabled={salvar.isPending}
                            >
                              {salvar.isPending ? 'Salvando…' : 'Salvar'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[11px] text-gray-500">Repasse</p>
                          <p className={`text-xl font-extrabold ${
                            r.driver_payout_amount != null ? 'text-white' : 'text-gray-600'
                          }`}>
                            {r.driver_payout_amount != null ? fmtBRL(r.driver_payout_amount) : 'a definir'}
                          </p>
                          <div className="flex items-center justify-end gap-2 mt-2">
                            <button
                              onClick={() => abrirEdicao(r)}
                              className="text-xs text-gray-400 hover:text-gray-200 underline"
                            >
                              {r.driver_payout_amount != null ? 'editar' : 'definir valor'}
                            </button>
                            {pago ? (
                              <Button
                                variant="secondary"
                                onClick={() => salvar.mutate({ id: r.id, body: { status: 'pending' } })}
                                disabled={salvar.isPending}
                              >
                                <Undo2 size={14} /> Desfazer
                              </Button>
                            ) : (
                              <Button
                                onClick={() => salvar.mutate({ id: r.id, body: { status: 'paid' } })}
                                // Sem valor definido não faz sentido dar baixa.
                                disabled={salvar.isPending || r.driver_payout_amount == null}
                                title={r.driver_payout_amount == null ? 'Defina o valor antes de dar baixa' : ''}
                              >
                                <Check size={14} /> Marcar pago
                              </Button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
