import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, DollarSign, CreditCard, AlertCircle, ArrowDownLeft } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PERIODS = [
  { value: 'day',   label: 'Hoje'      },
  { value: 'week',  label: 'Semana'    },
  { value: 'month', label: 'Mês'       },
  { value: 'year',  label: 'Ano'       },
]

const DAYS_BY_PERIOD = { day: 1, week: 7, month: 30, year: 365 }

function KpiCard({ icon: Icon, label, value, subValue, subLabel, color = 'text-gray-300' }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center ${color} flex-shrink-0`}>
          <Icon size={16} />
        </div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-1">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subValue && (
        <p className="text-xs text-gray-600 mt-1">{subLabel}: {subValue}</p>
      )}
    </Card>
  )
}

const TooltipDark = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function Financeiro() {
  const [period, setPeriod] = useState('month')

  const { data: summary, isLoading: l1 } = useQuery({
    queryKey: ['financial-summary', period],
    queryFn:  () => api.getFinancial({ period }),
  })

  const { data: daily = [], isLoading: l2 } = useQuery({
    queryKey: ['financial-daily', DAYS_BY_PERIOD[period]],
    queryFn:  () => api.getFinancialDaily({ days: DAYS_BY_PERIOD[period] }),
  })

  const chartData = daily.map((d) => ({
    date: (() => {
      try { return format(parseISO(d.date), 'd MMM', { locale: ptBR }) } catch { return d.date }
    })(),
    bruto: Number(d.total),
    liquido: Number(d.total) * 0.93,
  }))

  if (l1 || l2) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.value ? 'bg-gray-700 text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign}   label="Bruto"           value={fmt(summary?.bruto)}             color="text-brand"      />
        <KpiCard icon={TrendingUp}   label="Líquido"         value={fmt(summary?.liquido)}            color="text-green-400"  />
        <KpiCard icon={CreditCard}   label="Taxas"           value={fmt(summary?.taxas)}              color="text-orange-400" />
        <KpiCard icon={AlertCircle}  label="Não creditado"   value={fmt(summary?.nao_creditado)}      color="text-amber-400"  />
      </div>

      {/* Gráfico área */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Faturamento</h2>
            {summary?.margem_percent !== undefined && (
              <span className="text-xs font-medium text-green-400 bg-green-900/30 px-2 py-1 rounded-full">
                Margem {summary.margem_percent}%
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {chartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-600 text-sm">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gBruto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FF6A00" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#FF6A00" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gLiquido" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#34d399" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<TooltipDark />} />
                <Area type="monotone" dataKey="bruto"   name="Bruto"   stroke="#FF6A00" strokeWidth={2} fill="url(#gBruto)"   dot={false} />
                <Area type="monotone" dataKey="liquido" name="Líquido" stroke="#34d399" strokeWidth={2} fill="url(#gLiquido)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      {/* Breakdown detalhado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-300">Detalhamento</h2></CardHeader>
          <CardBody>
            <dl className="space-y-3">
              {[
                { label: 'Receita Bruta',           value: summary?.bruto,                         cls: 'text-gray-100 font-bold' },
                { label: '(-) Taxas gateway',       value: `- ${fmt(summary?.taxas)}`,             cls: 'text-red-400'  },
                { label: '(-) Comissão plataforma', value: `- ${fmt(summary?.comissoes_plataforma)}`, cls: 'text-red-400'  },
                { label: 'Receita Líquida',         value: summary?.liquido,                       cls: 'text-green-400 font-bold text-base' },
                { label: 'Repasses efetuados',      value: summary?.repasses,                      cls: 'text-gray-500'  },
                { label: 'A creditar',              value: summary?.nao_creditado,                 cls: 'text-amber-400'  },
              ].map((r) => (
                <div key={r.label} className="flex justify-between text-sm border-b border-gray-700/50 pb-3 last:border-0 last:pb-0">
                  <span className="text-gray-500">{r.label}</span>
                  <span className={r.cls}>{typeof r.value === 'number' ? fmt(r.value) : r.value}</span>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-300">Composição</h2></CardHeader>
          <CardBody>
            {chartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-600 text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData.slice(-14)} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#4b5563' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<TooltipDark />} />
                  <Bar dataKey="bruto"   name="Bruto"   fill="#FF6A00" opacity={0.8} radius={[3,3,0,0]} />
                  <Bar dataKey="liquido" name="Líquido" fill="#34d399" opacity={0.7} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
