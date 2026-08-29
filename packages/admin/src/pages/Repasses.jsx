import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Check, Undo2, Car, Phone, Calendar, Copy, UserCheck } from 'lucide-react'
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

const ROTULO_PIX = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'e-mail', phone: 'telefone', random_key: 'aleatória',
}

// Chave PIX com cópia em um clique. Ler uma chave da tela e redigitar no banco
// é onde o dinheiro vai para a conta errada — o botão existe para isso.
function ChavePix({ chave, tipo, className = '' }) {
  const [copiado, setCopiado] = useState(false)

  if (!chave) {
    return (
      <span className={`text-[11.5px] text-amber-500/90 ${className}`}>
        sem chave PIX cadastrada
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        // clipboard exige contexto seguro; sem ele o clique não pode falhar em
        // silêncio e deixar o admin achando que copiou.
        navigator.clipboard?.writeText(chave)
          .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) })
          .catch(() => alert(`Copie a chave manualmente:\n\n${chave}`))
      }}
      title="Copiar chave PIX"
      className={`inline-flex items-center gap-1.5 text-[11.5px] font-mono text-gray-300 hover:text-brand transition-colors max-w-full ${className}`}
    >
      {copiado ? <Check size={12} className="text-emerald-400 shrink-0" /> : <Copy size={12} className="shrink-0" />}
      <span className="truncate">{chave}</span>
      {tipo && <span className="text-gray-600 font-sans shrink-0">({ROTULO_PIX[tipo] || tipo})</span>}
    </button>
  )
}

// Duas naturezas de repasse, e não se misturam:
//   • COOPERATIVAS — comissão de quem aceitou e valor de quem executou, gerados
//     automaticamente quando o pagamento é aprovado (migration 080). É o
//     grosso do dinheiro no modelo em que a plataforma recebe 100% (079).
//   • MOTORISTA — pagamento de uma corrida despachada pela casa, com valor
//     combinado à mão (migration 066). Já existia.
export default function Repasses() {
  const [aba, setAba] = useState('cooperativas')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-fit">
        {[['cooperativas', 'Cooperativas'], ['motoristas', 'Motoristas']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              aba === id ? 'bg-gray-700 text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {aba === 'cooperativas' ? <RepassesCooperativas /> : <RepassesMotorista />}
    </div>
  )
}

// ── Repasses às COOPERATIVAS ────────────────────────────
// Gerados sozinhos quando o pagamento é aprovado. A tela agrupa por
// cooperativa porque é assim que o repasse acontece: um PIX cobrindo várias
// reservas, não um por reserva.
function RepassesCooperativas() {
  const [status, setStatus] = useState('pending')
  const [aberto, setAberto] = useState(null)   // cooperativa expandida
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-payouts', status],
    queryFn:  () => api.getPayouts({ status }),
  })

  const baixaMut = useMutation({
    mutationFn: ({ id, body }) => api.updatePayout(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-payouts'] }),
    onError:    (e) => alert(e?.message || 'Erro ao atualizar o repasse.'),
  })
  const pagarTudoMut = useMutation({
    mutationFn: (payee_user_id) => api.payAllPayouts({ payee_user_id }),
    onSuccess:  (r) => {
      qc.invalidateQueries({ queryKey: ['admin-payouts'] })
      alert(`${r.marcados} repasse(s) marcados como pagos — ${fmtBRL(r.total)}.`)
    },
    onError: (e) => alert(e?.message || 'Erro ao dar baixa.'),
  })

  if (isLoading) return <PageSpinner />

  const payouts = data?.payouts || []
  const totais  = data?.totais  || []
  const totalGeral = totais.reduce((s, t) => s + t.total, 0)

  return (
    <div className="space-y-4">
      {data?.aviso && (
        <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 px-4 py-3">
          <p className="text-sm text-amber-300">{data.aviso}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-fit">
          {[['pending','A pagar'],['paid','Pagos'],['cancelled','Cancelados'],['todos','Todos']].map(([id,label]) => (
            <button key={id} onClick={() => setStatus(id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === id ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
              }`}>{label}</button>
          ))}
        </div>
        {status === 'pending' && totalGeral > 0 && (
          <p className="text-sm text-gray-400">
            Total a pagar: <span className="font-bold text-brand">{fmtBRL(totalGeral)}</span>
          </p>
        )}
      </div>

      {totais.length === 0 ? (
        <Card><CardBody>
          <p className="text-sm text-gray-500 text-center py-6">
            {status === 'pending' ? 'Nenhum repasse pendente.' : 'Nada aqui.'}
          </p>
        </CardBody></Card>
      ) : totais.map((t) => {
        const itens = payouts.filter((p) => (p.payee?.id || 'sem-destinatario') === (t.payee_id || 'sem-destinatario'))
        const expandido = aberto === (t.payee_id || 'sem-destinatario')
        return (
          <Card key={t.payee_id || 'sem'}>
            <CardBody>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200">{t.nome}</p>
                  <p className="text-xs text-gray-500">
                    {t.itens} reserva{t.itens === 1 ? '' : 's'}
                    {t.phone ? ` · ${t.phone}` : ''}
                    {t.documento ? ` · ${t.documento}` : ''}
                  </p>
                  {/* Para onde mandar o PIX que cobre todas as reservas dela. */}
                  {t.payee_id && <ChavePix chave={t.pix_key} tipo={t.pix_key_type} className="mt-0.5" />}
                </div>
                <p className="text-lg font-bold text-brand tabular-nums">{fmtBRL(t.total)}</p>
                <button
                  onClick={() => setAberto(expandido ? null : (t.payee_id || 'sem-destinatario'))}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-200 px-2 py-1"
                >
                  {expandido ? 'Ocultar' : 'Detalhar'}
                </button>
                {status === 'pending' && t.payee_id && (
                  <Button size="sm"
                    disabled={pagarTudoMut.isPending}
                    onClick={() => confirm(`Marcar ${fmtBRL(t.total)} como pago para ${t.nome}?`)
                      && pagarTudoMut.mutate(t.payee_id)}>
                    <Check size={14} /> Dar baixa em tudo
                  </Button>
                )}
              </div>

              {expandido && (
                <div className="mt-3 pt-3 border-t border-gray-800 divide-y divide-gray-800">
                  {itens.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-2.5 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-gray-300">
                          {p.bookings?.booking_code || '—'}
                          <span className="text-gray-500">
                            {' · '}{p.kind === 'commission' ? 'comissão' : 'execução'}
                            {p.bookings?.service_date ? ` · ${fmtDia(p.bookings.service_date)}` : ''}
                          </span>
                        </p>
                        {/* Quem foi a campo (081). Não é necessariamente quem
                            recebe: aparece para o admin conferir o serviço e,
                            quando for pagar direto a essa pessoa, ter a chave. */}
                        {p.executor?.driver_name && (
                          <div className="mt-1 pl-2 border-l-2 border-gray-800 space-y-0.5">
                            <p className="text-[11.5px] text-gray-400 flex items-center gap-1.5 flex-wrap">
                              <UserCheck
                                size={11}
                                className={p.executor.executed_confirmed_at ? 'text-emerald-500' : 'text-gray-600'}
                              />
                              executou: <span className="text-gray-300">{p.executor.driver_name}</span>
                              {p.executor.driver_document ? <span className="text-gray-600">· {p.executor.driver_document}</span> : null}
                              {p.executor.driver_phone ? <span className="text-gray-600">· {p.executor.driver_phone}</span> : null}
                              {!p.executor.executed_confirmed_at && (
                                <span className="text-amber-600/80">(do despacho, não confirmado)</span>
                              )}
                            </p>
                            <ChavePix chave={p.executor.driver_pix_key} tipo={p.executor.driver_pix_key_type} />
                          </div>
                        )}
                        {p.paid_at && (
                          <p className="text-[11px] text-emerald-500/80">pago em {fmtDia(p.paid_at)}</p>
                        )}
                      </div>
                      <span className="text-[13px] font-semibold text-gray-200 tabular-nums">{fmtBRL(p.amount)}</span>
                      {p.status === 'pending' ? (
                        <button onClick={() => baixaMut.mutate({ id: p.id, body: { status: 'paid' } })}
                          className="text-[11.5px] font-bold text-emerald-400 hover:underline">marcar pago</button>
                      ) : (
                        <button onClick={() => baixaMut.mutate({ id: p.id, body: { status: 'pending' } })}
                          className="text-[11.5px] font-bold text-gray-500 hover:text-gray-300">desfazer</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        )
      })}
    </div>
  )
}

// Repasse ao motorista (migration 066).
function RepassesMotorista() {
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
