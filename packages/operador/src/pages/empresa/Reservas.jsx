// Reservas e desempenho da equipe: reservas da plataforma + vendas externas
// registradas pelos operadores, com quem vendeu e quem executou.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import Card, { CardBody } from '../../components/ui/Card'
import Input, { Select } from '../../components/ui/Input'

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dia = (d) => { const [y, m, x] = String(d || '').slice(0, 10).split('-'); return y && m && x ? `${x}/${m}/${y}` : '—' }
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date())
const mesAtual = () => {
  const h = hoje(); const [y, m] = h.split('-').map(Number)
  return { from: `${h.slice(0, 8)}01`, to: `${h.slice(0, 8)}${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` }
}

// Situação da linha, em palavras de quem administra a equipe.
export function situacao(r) {
  if (r.status_commercial === 'cancelled') return ['Cancelada', 'bg-gray-100 text-gray-500']
  if (r.status_commercial === 'refunded') return ['Reembolsada', 'bg-purple-100 text-purple-700']
  if (r.origem === 'externa') return ['Registrada', 'bg-sky-100 text-sky-700']
  if (r.status_operational === 'completed') return ['Concluída', 'bg-green-100 text-green-700']
  if (r.status_commercial === 'paid') return ['Paga', 'bg-teal-100 text-teal-700']
  if (r.status_commercial === 'awaiting_payment' || r.status_commercial === 'payment_failed') return ['Aguardando pagamento', 'bg-amber-100 text-amber-700']
  return ['Em andamento', 'bg-amber-100 text-amber-700']
}

function Numero({ rotulo, valor, detalhe }) {
  return (
    <Card><CardBody className="!py-3">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <p className="text-lg font-bold text-gray-900 leading-tight">{valor}</p>
      {detalhe && <p className="text-xs text-gray-500 mt-0.5">{detalhe}</p>}
    </CardBody></Card>
  )
}

export default function Reservas() {
  const [periodo, setPeriodo] = useState(mesAtual)
  const [operador, setOperador] = useState('')
  const [origem, setOrigem] = useState('')
  const { data, isPending, isError } = useQuery({
    queryKey: ['company-bookings', periodo.from, periodo.to],
    queryFn: () => api.getCompanyBookings(periodo),
    enabled: !!periodo.from && !!periodo.to && periodo.from <= periodo.to,
    placeholderData: (prev) => prev,
  })
  const total = data?.total
  const rows = (data?.rows || []).filter((r) => (!operador || r.vendedor_id === operador) && (!origem || r.origem === origem))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Reservas e desempenho</h2>
        <p className="text-sm text-gray-600">Reservas da plataforma e vendas externas da equipe, pela data do serviço.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="De" type="date" value={periodo.from} max={periodo.to} onChange={(e) => setPeriodo({ ...periodo, from: e.target.value })} />
        <Input label="Até" type="date" value={periodo.to} min={periodo.from} onChange={(e) => setPeriodo({ ...periodo, to: e.target.value })} />
      </div>

      {isError && <p role="alert" className="text-sm text-red-700">Não foi possível carregar as reservas.</p>}
      {isPending && <p className="text-sm text-gray-600">Carregando…</p>}
      {data?.pendente && <Card><CardBody><p className="text-sm text-gray-700">As reservas da equipe ainda não estão disponíveis para a sua empresa. Avise a Turiva.</p></CardBody></Card>}

      {total && !data.pendente && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Numero rotulo="Vendido na plataforma" valor={moeda(total.vendido_plataforma)} detalhe={`${total.reservas} ${total.reservas === 1 ? 'reserva paga' : 'reservas pagas'}`} />
            <Numero rotulo="Vendido por fora" valor={moeda(total.vendido_externo)} detalhe={`${total.externas} ${total.externas === 1 ? 'venda' : 'vendas'}`} />
            <Numero rotulo="Total da equipe" valor={moeda(total.vendido_plataforma + total.vendido_externo)} />
            <Numero rotulo="Comissão da empresa" valor={moeda(total.comissao)} detalhe="das reservas da plataforma" />
          </div>

          {data.operadores.length > 0 && (
            <Card aria-label="Desempenho por operador"><CardBody>
              <h3 className="font-semibold text-gray-900 text-sm">Por operador</h3>
              <ul className="divide-y divide-gray-100 mt-1">
                {data.operadores.map((o) => (
                  <li key={o.operator_id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{o.nome}{o.removido && <span className="ml-1.5 text-xs font-normal text-gray-500">(removido)</span>}</p>
                      <p className="text-xs text-gray-500">{o.reservas} na plataforma · {o.externas} por fora</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900">{moeda(o.vendido_plataforma + o.vendido_externo)}</p>
                      <p className="text-xs text-gray-500">comissão {moeda(o.comissao)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody></Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select label="Operador" value={operador} onChange={(e) => setOperador(e.target.value)}>
              <option value="">Todos</option>
              {data.operadores.map((o) => <option key={o.operator_id} value={o.operator_id}>{o.nome}</option>)}
            </Select>
            <Select label="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="">Todas</option><option value="plataforma">Plataforma</option><option value="externa">Por fora</option>
            </Select>
          </div>

          {rows.length === 0 && <Card><CardBody className="text-center py-6"><p className="text-sm text-gray-600">Nenhuma reserva neste período.</p></CardBody></Card>}
          <ul className="space-y-3">
            {rows.map((r) => {
              const [rotulo, cor] = situacao(r)
              return (
                <li key={`${r.origem}-${r.id}`}><Card className={r.conta ? '' : 'opacity-75'}><CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{r.servico}</p>
                      <p className="text-sm text-gray-600">{dia(r.service_date)}{r.service_time ? ` às ${r.service_time.slice(0, 5)}` : ''} · {r.people_count} {r.people_count === 1 ? 'pessoa' : 'pessoas'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900">{moeda(r.valor)}</p>
                      {r.comissao != null && <p className="text-xs text-gray-500">comissão {moeda(r.comissao)}</p>}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-sm">
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Vendeu</dt><dd className="text-gray-800 truncate">{r.vendedor}</dd></div>
                    <div className="min-w-0"><dt className="text-xs text-gray-500">Executou</dt><dd className="text-gray-800 truncate">{r.executor || <span className="text-gray-400">{r.origem === 'externa' ? 'O próprio operador' : 'A definir'}</span>}</dd></div>
                  </dl>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{rotulo}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.origem === 'externa' ? 'bg-gray-100 text-gray-600' : 'bg-brand/10 text-brand'}`}>
                      {r.origem === 'externa' ? 'Por fora' : `Plataforma · ${r.codigo}`}
                    </span>
                    {r.cliente && <span className="text-xs text-gray-500 truncate">Cliente: {r.cliente}</span>}
                  </div>
                </CardBody></Card></li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
