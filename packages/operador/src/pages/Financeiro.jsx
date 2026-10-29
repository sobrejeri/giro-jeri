import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, DollarSign, CreditCard, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import MeusRecebimentos from '../components/MeusRecebimentos'
import RepassesMotoristas from '../components/RepassesMotoristas'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Eixo Y legível em qualquer magnitude: abaixo de mil mostra o valor real
// (R$122), senão "k"/"M". Antes `(v/1000).toFixed(0)` zerava tudo em "R$ 0k".
const fmtEixo = (v) => {
  const n = Number(v) || 0, a = Math.abs(n)
  if (a >= 1e6) return `R$ ${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (a >= 1e3) return `R$ ${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return `R$ ${Math.round(n)}`
}

// Cores por gateway (pedido do negócio: Pagar.me VERDE, Mercado Pago AZUL).
// Tons mais escuros que no admin porque aqui o tema é claro (fundo branco).
// Chaves canônicas iguais às do backend (/financial-daily → gateways[].key).
const GW_META = {
  pagarme:      { label: 'Pagar.me',     color: '#16a34a' }, // verde
  mercado_pago: { label: 'Mercado Pago', color: '#2563eb' }, // azul
  manual:       { label: 'Manual',       color: '#7c3aed' }, // roxo
  outros:       { label: 'Outros',       color: '#d97706' }, // âmbar
}
const GW_FALLBACK = ['#db2777', '#0891b2', '#65a30d', '#ea580c'] // extras p/ gateways novos
const gwColor = (key, i = 0) => GW_META[key]?.color || GW_FALLBACK[i % GW_FALLBACK.length]
const gwLabel = (key, fallback) => GW_META[key]?.label || fallback || key

const PERIODS = [
  { value: 'day',   label: 'Hoje'      },
  { value: 'week',  label: 'Semana'    },
  { value: 'month', label: 'Mês'       },
  { value: 'year',  label: 'Este ano'  },
]

const DAYS_BY_PERIOD = { day: 1, week: 7, month: 30, year: 365 }

function KpiCard({ icon: Icon, label, value, color = 'text-gray-700' }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </Card>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  // Esconde as séries zeradas do dia (gateway sem recebimento); com mais de uma
  // série, mostra o total do dia embaixo.
  const shown = payload.filter((p) => Number(p.value))
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {(shown.length ? shown : payload).map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
      {payload.length > 1 && (
        <p className="text-gray-800 font-bold mt-1 pt-1 border-t border-gray-100">
          Total: {fmt(total)}
        </p>
      )}
    </div>
  )
}

export default function Financeiro() {
  const [tab, setTab]       = useState('resumo')
  const [period, setPeriod] = useState('month')

  const { data: summary, isLoading: loadSummary } = useQuery({
    queryKey: ['financial-summary', period],
    queryFn:  () => api.getFinancial({ period }),
  })

  const { data: dailyResp, isLoading: loadDaily } = useQuery({
    queryKey: ['financial-daily', period],
    queryFn:  () => api.getFinancialDaily({ days: DAYS_BY_PERIOD[period] }),
  })
  // A API devolve { series, gateways }. As guardas mantêm a tela de pé na janela
  // entre o deploy do front e o da API (a resposta antiga era um array simples).
  const series   = Array.isArray(dailyResp?.series)   ? dailyResp.series   : []
  const gateways = Array.isArray(dailyResp?.gateways) ? dailyResp.gateways : []

  // Faturamento bruto por dia, UMA SÉRIE POR GATEWAY (Pagar.me verde, MP azul…),
  // para separar os recebimentos. Cada ponto: a data formatada + o valor de cada
  // gateway (0 onde não houve, para as linhas não terem buracos).
  const chartData = series.map((d) => {
    const o = {
      date: (() => {
        try { return format(parseISO(d.date), 'd MMM', { locale: ptBR }) } catch { return d.date }
      })(),
    }
    for (const g of gateways) o[g.key] = Number(d[g.key]) || 0
    return o
  })

  return (
    <div className="space-y-5">
      {/* Abas: Resumo (o que você recebe) | Motoristas (o que você paga). */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-fit overflow-x-auto scrollbar-hide">
        {[['resumo', 'Resumo'], ['motoristas', 'Repasses a motoristas']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`shrink-0 whitespace-nowrap px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'motoristas' ? (
        <RepassesMotoristas />
      ) : (loadSummary || loadDaily) ? (
        <PageSpinner />
      ) : (
        <>
      {/* Period selector */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-fit overflow-x-auto scrollbar-hide">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`shrink-0 whitespace-nowrap px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign}    label="Bruto"          value={fmt(summary?.bruto)}          color="text-gray-700" />
        <KpiCard icon={TrendingUp}    label="Você recebe"    value={fmt((summary?.bruto || 0) - (summary?.comissoes_plataforma || 0))} color="text-green-600" />
        <KpiCard icon={CreditCard}    label="Taxas Gateway"  value={fmt(summary?.taxas)}           color="text-orange-600" />
        <KpiCard icon={AlertCircle}   label="Não creditado"  value={fmt(summary?.nao_creditado)}   color="text-amber-600" />
      </div>

      {/* Receita por gateway (MP vs Pagar.me) */}
      {Array.isArray(summary?.by_gateway) && summary.by_gateway.length > 0 && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-700">Receita por gateway</h2></CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summary.by_gateway.map((g) => (
                <div key={g.gateway} className="rounded-xl border border-gray-100 p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-800">{g.label}</span>
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">{g.gateway}</span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Bruto</span><span className="text-gray-800 font-semibold">{fmt(g.bruto)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">(-) Comissão Turiva</span><span className="text-red-500">- {fmt(g.comissao)}</span></div>
                    <div className="flex justify-between border-t border-gray-200 pt-2"><span className="text-gray-600 font-medium">Você recebe</span><span className="text-green-600 font-bold">{fmt(g.voce_recebe)}</span></div>
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">Inclui passeios e o seu estacionamento. "Você recebe" = o bruto menos a comissão da plataforma — é o que cai na sua conta. A taxa de gateway é paga pela plataforma, não sai do seu repasse.</p>
            {/* Gráfico por gateway: bruto × o que o operador RECEBE (após taxa de
                gateway E comissão da plataforma) de cada meio. */}
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.by_gateway} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmtEixo} width={64} />
                  <Tooltip formatter={(v, n) => [fmt(v), n]} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="bruto"       name="Bruto"       fill="#FF6A00" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="voce_recebe" name="Você recebe" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Gráfico: faturamento LÍQUIDO (o que o operador recebe) por dia, UMA LINHA
          POR GATEWAY, para separar os recebimentos (Pagar.me verde, MP azul…). */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Faturamento líquido por dia · por gateway</h2>
            {summary?.margem_percent !== undefined && (
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                Margem {summary.margem_percent}%
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {chartData.length === 0 || gateways.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
              Sem dados para este período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  tickFormatter={fmtEixo} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Uma Area por gateway. Dots visíveis porque com poucas reservas
                    cada série tem 1–2 pontos; sem dot um ponto isolado some. */}
                {gateways.map((g, i) => {
                  const c = gwColor(g.key, i)
                  return (
                    <Area key={g.key} type="monotone" dataKey={g.key} name={gwLabel(g.key, g.label)}
                      stroke={c} strokeWidth={2} fill={c} fillOpacity={0.1}
                      dot={{ r: 3, fill: c, strokeWidth: 0 }} activeDot={{ r: 5, fill: c }} />
                  )
                })}
              </AreaChart>
            </ResponsiveContainer>
          )}
          {gateways.length > 0 && (
            <p className="mt-3 text-[11px] text-gray-400">
              Uma linha por gateway de recebimento (passeios + o seu estacionamento). É o que você recebe (bruto menos a comissão da plataforma) por cada meio. A taxa de gateway é paga pela plataforma.
            </p>
          )}
        </CardBody>
      </Card>

      {/* O que o operador ganha — vem antes do razão da plataforma, porque é
          a pergunta dele. O "Detalhamento" abaixo é contexto. */}
      <MeusRecebimentos />

      {/* Breakdown */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Movimentação das suas reservas</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">
              O caminho do dinheiro do cliente até o repasse. O que você ganha está acima, em Meus recebimentos.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          {/* As linhas ANTES não fechavam: "Receita Bruta − taxas − comissão"
              não dava a "Receita Líquida" mostrada, porque `booking_net` é
              bruto MENOS GATEWAY apenas — a comissão não entra nessa conta. O
              rótulo dizia uma subtração que o número não fazia, e numa tela de
              dinheiro isso destrói a confiança no resto. Agora cada linha diz o
              que é, e a subtração fecha. */}
          <dl className="space-y-3">
            {[
              { label: 'Pago pelos clientes',        value: summary?.bruto,            cls: 'text-gray-900' },
              { label: '(-) Taxas do gateway',       value: `-${fmt(summary?.taxas)}`, cls: 'text-red-500'  },
              { label: '= Após as taxas',            value: summary?.liquido,          cls: 'text-gray-900 font-bold' },
              { label: 'Comissão da plataforma',     value: summary?.comissoes_plataforma, cls: 'text-gray-500' },
              { label: 'Repasses já efetuados',      value: summary?.repasses,         cls: 'text-gray-500' },
            ].map((r) => (
              <div key={r.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{r.label}</span>
                <span className={r.cls}>{typeof r.value === 'number' ? fmt(r.value) : r.value}</span>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
        </>
      )}
    </div>
  )
}
