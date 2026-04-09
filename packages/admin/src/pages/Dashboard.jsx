import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarCheck, Clock, XCircle, TrendingUp, DollarSign } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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

export default function Dashboard() {
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
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={CalendarCheck}
          label="Reservas hoje"
          value={stats?.reservas_hoje ?? '—'}
          color="text-blue-400"
        />
        <KpiCard
          icon={Clock}
          label="Ag. pagamento"
          value={stats?.pendencias ?? '—'}
          color="text-amber-400"
        />
        <KpiCard
          icon={XCircle}
          label="Cancelamentos hoje"
          value={stats?.cancelamentos ?? '—'}
          color="text-red-400"
        />
        <KpiCard
          icon={DollarSign}
          label="Receita hoje"
          value={fmt(stats?.valor_bruto_hoje)}
          sub={`Mês: ${fmt(stats?.valor_bruto_mes)}`}
          color="text-brand"
        />
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
            <div className="h-52 flex items-center justify-center text-gray-600 text-sm">
              Sem dados
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradBrand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FF6A00" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#FF6A00" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#4b5563' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#FF6A00"
                  strokeWidth={2}
                  fill="url(#gradBrand)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#FF6A00' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      {/* Linha financeira rápida */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Receita bruta (mês)</p>
          <p className="text-xl font-bold text-gray-100">{fmt(stats?.valor_bruto_mes)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-gray-500 mb-1">Receita líquida (mês)</p>
          <p className="text-xl font-bold text-green-400">
            {fmt((stats?.valor_bruto_mes || 0) * 0.93)}
          </p>
        </Card>
      </div>
    </div>
  )
}
