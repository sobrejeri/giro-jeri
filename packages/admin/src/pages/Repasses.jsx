import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Wallet, Check, Undo2, Car, Phone, Calendar, Copy, UserCheck, AlertTriangle, ShieldCheck } from 'lucide-react'
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
//   • OPERADORES — comissão de quem aceitou e valor de quem executou, gerados
//     automaticamente quando o pagamento é aprovado (migration 080). É o
//     grosso do dinheiro no modelo em que a plataforma recebe 100% (079).
//   • MOTORISTA — pagamento de uma corrida despachada pela casa, com valor
//     combinado à mão (migration 066). Já existia.
export default function Repasses() {
  const [aba, setAba] = useState('fila')
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-fit">
          {[['fila', 'Fila de liberação'], ['conciliacao', 'Conciliação'], ['operadores', 'Operadores'], ['motoristas', 'Motoristas']].map(([id, label]) => (
            <button key={id} onClick={() => setAba(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                aba === id ? 'bg-gray-700 text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {aba === 'fila' ? <FilaLiberacao />
        : aba === 'conciliacao' ? <Conciliacao />
        : aba === 'operadores' ? <RepassesOperadores />
        : <RepassesMotorista />}
    </div>
  )
}

// ── Fila de liberação ────────────────────────────────────────────────────────
// Reservas CONCLUÍDAS com repasse do operador, ordenadas pela conclusão mais
// antiga (completed_at ASC), com paginação/ordenação no servidor. A ação
// "Liberar" (individual ou em lote) marca o repasse como PAGO — registrando um
// pagamento MANUAL feito por fora (PIX/banco), NÃO uma transferência de gateway.
// O servidor REVALIDA cada reserva antes de baixar, é idempotente e AUDITA quem
// liberou. Datas exibidas em America/Fortaleza.
function fmtDataHora(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch { return '—' }
}
function fmtR$(v) { return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }
function gwLabel(g) {
  return g === 'pagarme' ? 'Pagar.me'
    : g === 'mercado_pago' ? 'Mercado Pago'
    : g === 'manual' ? 'Manual' : (g || '—')
}
const SIT_TAG = {
  pronto_para_liberar:  ['Pronto para liberar',   'bg-green-500/15 text-green-400'],
  pago:                 ['Repassado',             'bg-gray-600/30 text-gray-300'],
  repassado_gateway:    ['Repassado (gateway)',   'bg-gray-600/30 text-gray-300'],
  aguardando_pagamento: ['Aguardando pagamento',  'bg-yellow-500/15 text-yellow-400'],
  conciliacao:          ['Conciliação',           'bg-yellow-500/15 text-yellow-400'],
  bloqueado:            ['Bloqueado',             'bg-red-500/15 text-red-400'],
  cancelado:            ['Cancelado',             'bg-red-500/15 text-red-400'],
}
function SituacaoTag({ r }) {
  const [label, cls] = SIT_TAG[r.situacao] || [r.situacao, 'bg-gray-700 text-gray-300']
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}
      title={r.motivo_bloqueio || ''}>{label}</span>
  )
}
function CardInd({ titulo, qtd, valor, destaque }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? 'border-brand/40 bg-brand/5' : 'border-gray-800 bg-gray-900/40'}`}>
      <p className="text-[11px] text-gray-500 leading-tight">{titulo}</p>
      <p className="text-lg font-bold text-gray-100">{qtd ?? '—'}</p>
      {valor != null && <p className="text-[11px] text-gray-400">{fmtR$(valor)}</p>}
    </div>
  )
}

function FilaLiberacao() {
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [conciliacao, setConciliacao] = useState(false)
  const [sel, setSel] = useState(() => new Set())   // booking_ids marcados (página atual)
  const [resultado, setResultado] = useState(null)  // resumo da última liberação
  const pageSize = 30
  const qc = useQueryClient()

  const params = {
    page, pageSize,
    ...(q ? { q } : {}),
    ...(de ? { from: de } : {}),
    ...(ate ? { to: ate } : {}),
    ...(conciliacao ? { conciliacao: '1' } : {}),
  }

  const ind  = useQuery({ queryKey: ['payout-indicadores'], queryFn: () => api.getPayoutsIndicadores() })
  const fila = useQuery({ queryKey: ['payout-fila', params], queryFn: () => api.getPayoutsFila(params) })

  const rows       = fila.data?.rows || []
  const total      = fila.data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const aviso      = fila.data?.aviso

  // A seleção é POR PÁGINA: ao trocar de página ou filtro, some. Assim o
  // "Liberar N" nunca envia ids que o admin não está mais vendo.
  useEffect(() => { setSel(new Set()) }, [page, q, de, ate, conciliacao])

  // Só reservas prontas podem ser marcadas/liberadas. A revalidação DE VERDADE
  // é no servidor — isto é só o filtro da UI para não oferecer o que não dá.
  const elegiveis   = rows.filter((r) => r.elegivel_liberar)
  const elegivelIds = elegiveis.map((r) => r.booking_id)
  const marcados    = elegiveis.filter((r) => sel.has(r.booking_id))
  const todosMarcados = elegiveis.length > 0 && marcados.length === elegiveis.length
  const valorSel    = marcados.reduce((s, r) => s + (Number(r.operador_valor) || 0), 0)

  const liberarMut = useMutation({
    mutationFn: (ids) => api.liberarRepasses({ booking_ids: ids }),
    onSuccess: (r) => {
      setResultado(r)
      setSel(new Set())
      qc.invalidateQueries({ queryKey: ['payout-fila'] })
      qc.invalidateQueries({ queryKey: ['payout-indicadores'] })
    },
    onError: (e) => alert(e?.message || 'Não foi possível liberar. Tente de novo.'),
  })

  function toggle(id) {
    setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleTodos() {
    setSel((prev) => {
      const n = new Set(prev)
      if (todosMarcados) elegivelIds.forEach((id) => n.delete(id))
      else elegivelIds.forEach((id) => n.add(id))
      return n
    })
  }
  function liberarUm(r) {
    const msg = `Liberar o repasse de ${fmtR$(r.operador_valor)} para ${r.operador?.nome || 'operador'}?\n\n`
      + 'Isto REGISTRA um pagamento MANUAL feito por fora (PIX/banco) — a plataforma '
      + 'NÃO transfere pelo gateway. A ação é revalidada e auditada no servidor.'
    if (confirm(msg)) liberarMut.mutate([r.booking_id])
  }
  function liberarLote() {
    const ids = marcados.map((r) => r.booking_id)
    if (!ids.length) return
    const msg = `Liberar ${ids.length} repasse(s) — ${fmtR$(valorSel)}?\n\n`
      + 'Registra pagamentos MANUAIS feitos por fora (PIX/banco), não transferências '
      + 'de gateway. O servidor revalida cada reserva; qualquer uma que já não esteja '
      + 'elegível é ignorada, sem baixa.'
    if (confirm(msg)) liberarMut.mutate(ids)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <CardInd titulo="Aguardando conclusão" qtd={ind.data?.aguardando_conclusao?.qtd} />
        <CardInd titulo="Prontos para liberar" qtd={ind.data?.pronto_para_liberar?.qtd} valor={ind.data?.pronto_para_liberar?.valor} destaque />
        <CardInd titulo="Repassados"           qtd={ind.data?.repassados?.qtd}          valor={ind.data?.repassados?.valor} />
        <CardInd titulo="Conciliação"          qtd={ind.data?.conciliacao?.qtd} />
        <CardInd titulo="Bloqueados"           qtd={ind.data?.bloqueados?.qtd} />
      </div>

      {aviso && (
        <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3">{aviso}</p>
      )}

      {/* Resumo da última liberação: quantas baixaram, quanto, e o que foi
          ignorado (e por quê). Se a auditoria falhou, avisa em destaque — a baixa
          é real, mas não pode ficar sem trilha em silêncio. */}
      {resultado && (
        <div className={`rounded-xl border px-4 py-3 ${resultado.auditoria_ok === false ? 'border-amber-600/50 bg-amber-900/20' : 'border-emerald-700/40 bg-emerald-900/15'}`}>
          <div className="flex items-start gap-2">
            {resultado.auditoria_ok === false
              ? <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              : <ShieldCheck  size={16} className="text-emerald-400 mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200">
                <b>{resultado.resumo?.liberados || 0}</b> repasse(s) liberado(s) · <b>{fmtR$(resultado.resumo?.total)}</b>
                {resultado.resumo?.ignorados ? <> · <span className="text-amber-400">{resultado.resumo.ignorados} ignorado(s)</span></> : null}
              </p>
              {resultado.auditoria_ok === false && (
                <p className="text-[12px] text-amber-300 mt-1">A baixa foi registrada, mas a auditoria falhou. Avise o suporte para não ficar sem trilha.</p>
              )}
              {resultado.ignorados?.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {resultado.ignorados.slice(0, 8).map((ig, i) => (
                    <li key={i} className="text-[12px] text-gray-400">
                      <span className="font-mono text-gray-300">{ig.booking_code || String(ig.booking_id || '').slice(0, 8)}</span>: {ig.motivo}
                    </li>
                  ))}
                  {resultado.ignorados.length > 8 && <li className="text-[12px] text-gray-500">…e mais {resultado.ignorados.length - 8}.</li>}
                </ul>
              )}
            </div>
            <button onClick={() => setResultado(null)} className="ml-auto text-xs text-gray-500 hover:text-gray-300 shrink-0">fechar</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Código da reserva"
          className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand" />
        <label className="text-xs text-gray-500">Conclusão de
          <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPage(1) }}
            className="ml-1 rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200" /></label>
        <label className="text-xs text-gray-500">até
          <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPage(1) }}
            className="ml-1 rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-200" /></label>
        <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={conciliacao} onChange={(e) => { setConciliacao(e.target.checked); setPage(1) }}
            className="accent-brand" />
          Conciliação (sem data de conclusão)
        </label>
      </div>

      {/* Barra de lote — só quando há seleção nesta página. */}
      {marcados.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/40 bg-brand/5 px-4 py-2.5">
          <p className="text-sm text-gray-200"><b>{marcados.length}</b> selecionado(s) · {fmtR$(valorSel)}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setSel(new Set())} className="text-xs text-gray-400 hover:text-gray-200 px-2">limpar</button>
            <Button size="sm" disabled={liberarMut.isPending} onClick={liberarLote}>
              <Check size={14} /> {liberarMut.isPending ? 'Liberando…' : `Liberar ${marcados.length}`}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-x-auto">
        {fila.isLoading ? <div className="py-10"><PageSpinner /></div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-800">
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" className="accent-brand"
                    checked={todosMarcados} disabled={elegiveis.length === 0}
                    onChange={toggleTodos} title="Marcar todos os prontos desta página" />
                </th>
                <th className="px-3 py-2">Reserva</th>
                <th className="px-3 py-2">Operador</th>
                <th className="px-3 py-2">Conclusão</th>
                <th className="px-3 py-2">Gateway</th>
                <th className="px-3 py-2 text-right">Pago</th>
                <th className="px-3 py-2 text-right">Plataforma</th>
                <th className="px-3 py-2 text-right">Operador</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-500">Nada na fila para este filtro.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.booking_id} className={`border-b border-gray-800/60 ${sel.has(r.booking_id) ? 'bg-brand/5' : ''}`}>
                  <td className="px-3 py-2">
                    {r.elegivel_liberar ? (
                      <input type="checkbox" className="accent-brand"
                        checked={sel.has(r.booking_id)} onChange={() => toggle(r.booking_id)} />
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-gray-200">{r.booking_code}</span>
                    <span className="block text-[11px] text-gray-500">{r.service_type === 'transfer' ? 'Transfer' : 'Passeio'}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-300">
                    {r.operador?.nome || '—'}
                    {/* Para onde mandar o PIX manual — só aparece nos prontos. */}
                    {r.elegivel_liberar && (
                      <span className="block mt-0.5"><ChavePix chave={r.operador?.pix_key} tipo={r.operador?.pix_key_type} /></span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtDataHora(r.completed_at)}</td>
                  <td className="px-3 py-2 text-gray-400">{gwLabel(r.gateway)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">{fmtR$(r.valor_pago)}</td>
                  <td className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">{fmtR$(r.plataforma_valor)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-200 whitespace-nowrap">{r.operador_valor != null ? fmtR$(r.operador_valor) : '—'}</td>
                  <td className="px-3 py-2"><SituacaoTag r={r} /></td>
                  <td className="px-3 py-2 text-right">
                    {r.elegivel_liberar ? (
                      <button onClick={() => liberarUm(r)} disabled={liberarMut.isPending}
                        className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-40 transition-colors">
                        Liberar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total} reserva(s){fila.isFetching ? ' · atualizando…' : ''}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded-lg bg-gray-800 disabled:opacity-40">Anterior</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 rounded-lg bg-gray-800 disabled:opacity-40">Próxima</button>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        <b>Liberar</b> registra um pagamento <b>manual</b> feito por fora (PIX/banco) — a plataforma
        não transfere pelo gateway. Cada liberação é revalidada e auditada no servidor, e é
        idempotente (dois cliques não pagam em dobro). Ordenado pela conclusão mais antiga;
        datas em America/Fortaleza.
      </p>
    </div>
  )
}

// ── Conciliação ──────────────────────────────────────────────────────────────
// Cruza o que ENTROU (pagamentos aprovados) com o que a plataforma DEVE/PAGOU
// (repasses) e mostra o que não fecha. Só leitura, sem gateway.
const CONC_LABEL = {
  pago_sem_recebimento:      'Pago sem recebimento do cliente',
  pago_reserva_revertida:    'Pago em reserva revertida',
  repasse_acima_do_recebido: 'Repasse acima do recebido',
  split_e_pendente:          'Split no ato + comissão pendente',
  aprovado_sem_repasse:      'Concluída e paga, sem repasse',
  concluido_sem_data:        'Concluída sem data de conclusão',
}
function Conciliacao() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['payout-conciliacao'],
    queryFn:  () => api.getPayoutsConciliacao(),
  })
  if (isLoading) return <PageSpinner />
  const grupos = data?.grupos || []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-400">
          Confere o que <b className="text-gray-300">entrou</b> × o que a plataforma <b className="text-gray-300">deve/pagou</b>.
          {data?.reservas_verificadas != null && (
            <span className="text-gray-600"> · {data.reservas_verificadas} reserva(s) conferidas ({data?.janela})</span>
          )}
          {isFetching && <span className="ml-2 text-xs text-gray-600">atualizando…</span>}
        </p>
        <button onClick={() => refetch()}
          className="text-xs font-semibold text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5">
          Reconferir
        </button>
      </div>

      {data?.aviso && (
        <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3">{data.aviso}</p>
      )}

      {grupos.length === 0 ? (
        <Card><CardBody>
          <p className="text-center text-gray-400 py-8 text-sm flex items-center justify-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400" /> Nada divergente — o recebido bate com o devido/pago.
          </p>
        </CardBody></Card>
      ) : grupos.map((g) => {
        const alta = g.gravidade === 'alta'
        return (
          <Card key={g.tipo}>
            <CardBody>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${alta ? 'text-red-400' : 'text-amber-400'}`}>
                  <AlertTriangle size={15} /> {CONC_LABEL[g.tipo] || g.tipo}
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${alta ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {alta ? 'risco de dinheiro' : 'operacional'}
                </span>
                <span className="text-xs text-gray-500">{g.qtd} reserva(s){g.total_valor ? ` · ${fmtR$(g.total_valor)}` : ''}</span>
              </div>
              <ul className="mt-2 divide-y divide-gray-800">
                {g.itens.map((it) => (
                  <li key={it.booking_id} className="py-2 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <span className="font-mono text-gray-200 text-[13px]">{it.booking_code || String(it.booking_id).slice(0, 8)}</span>
                      <span className="text-[11px] text-gray-500 ml-2">{it.service_type === 'transfer' ? 'Transfer' : 'Passeio'}</span>
                      <p className="text-[12px] text-gray-400 mt-0.5">{it.detalhe}</p>
                    </div>
                    {it.valor ? <span className="text-[13px] font-semibold text-gray-200 tabular-nums shrink-0">{fmtR$(it.valor)}</span> : null}
                  </li>
                ))}
                {g.qtd > g.itens.length && (
                  <li className="py-2 text-[12px] text-gray-500">…e mais {g.qtd - g.itens.length}.</li>
                )}
              </ul>
            </CardBody>
          </Card>
        )
      })}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        A conciliação <b>não</b> consulta saldo nem transferência de gateway — no modelo manual isso não existe.
        Ela confere o que está registrado no banco. <b>Risco de dinheiro</b> pede ação; <b>operacional</b> é
        ajuste de cadastro ou backfill.
      </p>
    </div>
  )
}

// Valor do repasse, editável enquanto pendente. O rateio por percentual é um
// ponto de partida: a diária combinada com o motorista raramente é uma fração
// exata da reserva, e quem fecha o acerto é o admin. Já baixado vira texto —
// mudar o valor de algo pago faria a tela mentir sobre o que saiu da conta.
function ValorRepasse({ payout, onSalvar }) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')

  if (payout.status !== 'pending') {
    return <span className="text-[13px] font-semibold text-gray-200 tabular-nums">{fmtBRL(payout.amount)}</span>
  }

  if (!editando) {
    return (
      <button
        onClick={() => { setValor(String(payout.amount ?? '')); setEditando(true) }}
        title="Ajustar o valor"
        className="text-[13px] font-semibold text-gray-200 tabular-nums hover:text-brand transition-colors"
      >
        {fmtBRL(payout.amount)}
      </button>
    )
  }

  function confirmar() {
    const n = Number(String(valor).replace(',', '.'))
    // Valor inválido não pode virar 0 em silêncio: seria uma dívida apagada.
    if (!Number.isFinite(n) || n < 0) { setEditando(false); return }
    if (n !== Number(payout.amount)) onSalvar(n)
    setEditando(false)
  }

  return (
    <input
      autoFocus type="number" step="0.01" min="0"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirmar()
        if (e.key === 'Escape') setEditando(false)
      }}
      className="w-24 bg-gray-900 border border-brand/50 rounded px-2 py-1 text-[13px] text-gray-100 tabular-nums outline-none"
    />
  )
}

// ── Repasses às OPERADORES ────────────────────────────
// Gerados sozinhos quando o pagamento é aprovado. A tela agrupa por
// operador porque é assim que o repasse acontece: um PIX cobrindo várias
// reservas, não um por reserva.
// Períodos ancorados em HOJE, pela data do SERVIÇO. O acerto é feito por
// intervalo ("o que devo do mês passado"), não por quando a linha nasceu.
const hojeIso   = () => new Date().toISOString().slice(0, 10)
const maisDias  = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const inicioMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
const mesPassado = () => {
  const d = new Date()
  const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const fim = new Date(d.getFullYear(), d.getMonth(), 0)
  return [ini.toISOString().slice(0, 10), fim.toISOString().slice(0, 10)]
}
const PERIODOS = [
  { id: 'tudo',    label: 'Tudo',        range: () => ['', ''] },
  { id: 'mes',     label: 'Este mês',    range: () => [inicioMes(), hojeIso()] },
  { id: 'passado', label: 'Mês passado', range: mesPassado },
  { id: 'ult30',   label: 'Últimos 30',  range: () => [maisDias(-30), hojeIso()] },
  { id: 'prox30',  label: 'Próximos 30', range: () => [hojeIso(), maisDias(30)] },
]

// ── Por que a tela está vazia ────────────────────────────────────────────────
// Fatos do servidor, em linguagem de gente. Só aparece quando não há nada a
// mostrar: com repasse na tela, ninguém precisa de diagnóstico.
function Diagnostico() {
  const [aberto, setAberto] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['diagnostico-repasses'],
    queryFn:  () => api.diagnosticoRepasses(),
    enabled:  aberto,
  })

  if (!aberto) {
    return (
      <div className="text-center pb-2">
        <button onClick={() => setAberto(true)}
          className="text-xs font-semibold text-brand hover:underline">
          Por que está vazio?
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 border-t border-gray-800 pt-4">
      {isLoading ? (
        <p className="text-xs text-gray-500 text-center py-3">Conferindo…</p>
      ) : !data ? (
        <p className="text-xs text-gray-500 text-center py-3">Não foi possível conferir agora.</p>
      ) : (
        <>
          {data.conclusao && (
            <p className="text-sm text-gray-200 bg-gray-800/60 rounded-xl px-4 py-3 mb-3">
              {data.conclusao}
            </p>
          )}
          <ul className="space-y-1.5">
            {data.checagens?.map((c, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span className={c.ok ? 'text-emerald-500' : 'text-amber-500'}>{c.ok ? '✓' : '!'}</span>
                <span className="text-gray-400">
                  {c.item}: <span className="text-gray-200">{c.valor}</span>
                  {c.dica && <span className="block text-gray-500 mt-0.5">{c.dica}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function RepassesOperadores() {
  const [status, setStatus] = useState('pending')
  const [aberto, setAberto] = useState(null)   // operador expandida
  const [periodo, setPeriodo] = useState('tudo')
  const [de,  setDe]  = useState('')
  const [ate, setAte] = useState('')
  const qc = useQueryClient()

  function aplicarPeriodo(p) {
    const [d, a] = p.range()
    setDe(d); setAte(a); setPeriodo(p.id)
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-payouts', status, de, ate],
    queryFn:  () => api.getPayouts({ status, ...(de ? { from: de } : {}), ...(ate ? { to: ate } : {}) }),
    // Repasse nasce sozinho quando o pagamento é aprovado — inclusive por
    // webhook, com esta tela aberta. Sem recarregar, o admin veria "nenhum
    // repasse pendente" enquanto um acabou de entrar.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const baixaMut = useMutation({
    mutationFn: ({ id, body }) => api.updatePayout(id, body),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-payouts'] }),
    onError:    (e) => alert(e?.message || 'Erro ao atualizar o repasse.'),
  })
  // Repasses que faltaram em reservas já pagas. Roda sob demanda porque é
  // conserto de passado, não rotina: o caminho normal cria o repasse sozinho na
  // aprovação do pagamento.
  const backfillMut = useMutation({
    mutationFn: () => api.backfillPayouts({ dias: 90 }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['admin-payouts'] })
      alert(`${r.criados} repasse(s) criados a partir de ${r.verificados} pagamento(s) conferidos.`)
    },
    onError: (e) => alert(e?.message || 'Não foi possível gerar os repasses.'),
  })

  const pagarTudoMut = useMutation({
    // Quem tem cadastro é baixado pelo id; o motorista avulso (082), pelo nome.
    mutationFn: (t) => api.payAllPayouts(
      t.payee_id ? { payee_user_id: t.payee_id } : { payee_name: t.payee_name }),
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
        <div className="flex items-center gap-3 flex-wrap">
          {status === 'pending' && totalGeral > 0 && (
            <p className="text-sm text-gray-400">
              Total a pagar: <span className="font-bold text-brand">{fmtBRL(totalGeral)}</span>
              {isFetching && <span className="ml-2 text-xs text-gray-600">atualizando…</span>}
            </p>
          )}
          <button
            onClick={() => confirm('Conferir os pagamentos dos últimos 90 dias e criar os repasses que faltarem?\n\nNão paga ninguém e não duplica o que já existe.')
              && backfillMut.mutate()}
            disabled={backfillMut.isPending}
            className="text-xs font-semibold text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            {backfillMut.isPending ? 'Conferindo…' : 'Gerar repasses faltantes'}
          </button>
        </div>
      </div>

      {/* Período — pela data do serviço */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button key={p.id} onClick={() => aplicarPeriodo(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              periodo === p.id
                ? 'bg-brand text-white border-brand'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-gray-200'
            }`}>{p.label}</button>
        ))}
        <span className="text-xs text-gray-500 ml-1">De</span>
        <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPeriodo('') }}
          className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-brand/60" />
        <span className="text-xs text-gray-500">até</span>
        <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPeriodo('') }}
          className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-brand/60" />
      </div>

      {totais.length === 0 ? (
        <Card><CardBody>
          <p className="text-sm text-gray-500 text-center py-6">
            {status === 'pending'
              ? (de || ate ? 'Nenhum repasse pendente neste período.' : 'Nenhum repasse pendente.')
              : 'Nada aqui.'}
          </p>
          {/* Tela vazia sem explicação vira adivinhação — e custou uma sessão
              inteira. Aqui ela mesma responde por que está vazia. */}
          <Diagnostico />
        </CardBody></Card>
      ) : totais.map((t) => {
        // Mesma chave que a API usou para somar o grupo — sem isso os itens
        // detalhados não bateriam com o total mostrado logo acima deles.
        const chaveDe = (p) => (p.payee?.id
          ? p.payee.id
          : (p.payee_name ? `nome:${p.payee_name.trim().toLowerCase()}` : 'sem-destinatario'))
        const itens = payouts.filter((p) => chaveDe(p) === t.chave)
        const expandido = aberto === t.chave
        return (
          <Card key={t.chave}>
            <CardBody>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-200 flex items-center gap-2 flex-wrap">
                    {t.nome}
                    {/* Sem cadastro na plataforma: motorista que o operador
                        mandou a campo. O admin paga direto a ele. */}
                    {t.avulso && t.payee_name && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 border border-gray-700 rounded px-1.5 py-px">
                        executor
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t.itens} reserva{t.itens === 1 ? '' : 's'}
                    {t.phone ? ` · ${t.phone}` : ''}
                    {t.documento ? ` · ${t.documento}` : ''}
                  </p>
                  {/* Para onde mandar o PIX que cobre todas as reservas dele. */}
                  {(t.payee_id || t.payee_name) && (
                    <ChavePix chave={t.pix_key} tipo={t.pix_key_type} className="mt-0.5" />
                  )}
                </div>
                <p className="text-lg font-bold text-brand tabular-nums">{fmtBRL(t.total)}</p>
                <button
                  onClick={() => setAberto(expandido ? null : t.chave)}
                  className="text-xs font-semibold text-gray-400 hover:text-gray-200 px-2 py-1"
                >
                  {expandido ? 'Ocultar' : 'Detalhar'}
                </button>
                {status === 'pending' && (t.payee_id || t.payee_name) && (
                  <Button size="sm"
                    disabled={pagarTudoMut.isPending}
                    onClick={() => confirm(`Marcar ${fmtBRL(t.total)} como pago para ${t.nome}?`)
                      && pagarTudoMut.mutate(t)}>
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
                            {' · '}{p.kind === 'gateway' ? 'split (direto na conta)'
                                   : p.kind === 'commission' ? 'comissão' : 'execução'}
                            {p.bookings?.service_date ? ` · ${fmtDia(p.bookings.service_date)}` : ''}
                          </span>
                        </p>
                        {/* Serviço x repasse na MESMA linha: é a conferência que
                            o admin faz — quanto o cliente pagou e quanto foi
                            para o operador. Sem os dois lado a lado, é preciso
                            abrir a reserva para saber se o valor faz sentido. */}
                        {p.bookings?.total_amount != null && (
                          <p className="text-[11.5px] text-gray-500 mt-0.5">
                            serviço <span className="text-gray-300">{fmtBRL(p.bookings.total_amount)}</span>
                            {' · '}repasse <span className="text-gray-300">{fmtBRL(p.amount)}</span>
                            {Number(p.bookings.total_amount) > 0 && (
                              <span className="text-gray-600">
                                {' ('}{Math.round((Number(p.amount) / Number(p.bookings.total_amount)) * 100)}%{')'}
                              </span>
                            )}
                          </p>
                        )}
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
                      {/* Valor do split é o que o Mercado Pago depositou —
                          não é editável aqui. Deixar o campo aberto convidaria a
                          "corrigir" um número que a plataforma não controla, e o
                          id nem existe em booking_payouts. */}
                      {p.gateway_split ? (
                        <span className="text-sm font-bold text-gray-200 tabular-nums">{fmtBRL(p.amount)}</span>
                      ) : (
                        <ValorRepasse
                          payout={p}
                          onSalvar={(amount) =>
                            baixaMut.mutate({ id: p.id, body: { status: p.status, amount } })}
                        />
                      )}
                      {/* Split não tem baixa: o Mercado Pago já depositou. Um
                          botão "desfazer" aqui sugeriria que dá para reverter um
                          depósito que a plataforma nem fez. */}
                      {p.gateway_split ? (
                        <span className="text-[11.5px] font-bold text-emerald-500">pago pelo gateway</span>
                      ) : p.status === 'pending' ? (
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
            // Repasse só depois da reserva concluída (mesma regra do servidor).
            const concluida = b.status_operational === 'completed'
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
                                // Só dá baixa com valor definido E reserva concluída.
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
                            <p className="text-[11px] text-amber-400/90 mt-1.5 max-w-[220px]">
                              Aguardando a reserva ser concluída para liberar o repasse.
                            </p>
                          )}
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
