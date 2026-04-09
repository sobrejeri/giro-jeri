import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, DollarSign, CreditCard, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-brand font-bold">{fmt(payload[0]?.value)}</p>
    </div>
  )
}

export default function Financeiro() {
  const [period, setPeriod] = useState('month')

  const { data: summary, isLoading: loadSummary } = useQuery({
    queryKey: ['financial-summary', period],
    queryFn:  () => api.getFinancial({ period }),
  })

  const { data: daily = [], isLoading: loadDaily } = useQuery({
    queryKey: ['financial-daily', period],
    queryFn:  () => api.getFinancialDaily({ days: DAYS_BY_PERIOD[period] }),
  })

  const chartData = daily.map((d) => ({
    date: (() => {
      try { return format(parseISO(d.date), 'd MMM', { locale: ptBR }) } catch { return d.date }
    })(),
    total: Number(d.total),
  }))

  if (loadSummary || loadDaily) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
        <KpiCard icon={TrendingUp}    label="Líquido"        value={fmt(summary?.liquido)}         color="text-green-600" />
        <KpiCard icon={CreditCard}    label="Taxas Gateway"  value={fmt(summary?.taxas)}           color="text-orange-600" />
        <KpiCard icon={AlertCircle}   label="Não creditado"  value={fmt(summary?.nao_creditado)}   color="text-amber-600" />
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Faturamento Bruto</h2>
            {summary?.margem_percent !== undefined && (
              <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                Margem {summary.margem_percent}%
              </span>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
              Sem dados para este período
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBrand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FF6A00" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#FF6A00" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#FF6A00"
                  strokeWidth={2}
                  fill="url(#colorBrand)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#FF6A00' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      {/* Breakdown */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-700">Detalhamento</h2>
        </CardHeader>
        <CardBody>
          <dl className="space-y-3">
            {[
              { label: 'Receita Bruta',          value: summary?.bruto,               cls: 'text-gray-900' },
              { label: '(-) Taxas de gateway',   value: `-${fmt(summary?.taxas)}`,    cls: 'text-red-500'  },
              { label: '(-) Comissão plataforma', value: `-${fmt(summary?.comissoes_plataforma)}`, cls: 'text-red-500' },
              { label: 'Receita Líquida',        value: summary?.liquido,             cls: 'text-green-600 font-bold' },
              { label: 'Repasses efetuados',     value: summary?.repasses,            cls: 'text-gray-500' },
            ].map((r) => (
              <div key={r.label} className="flex justify-between text-sm">
                <span className="text-gray-500">{r.label}</span>
                <span className={r.cls}>{typeof r.value === 'number' ? fmt(r.value) : r.value}</span>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
    </div>
  )
}
