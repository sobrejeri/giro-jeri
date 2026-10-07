import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

  // Conciliação da taxa REAL da Pagar.me (via payables). Dry-run primeiro.
  const [recon, setRecon]         = useState(null)
  const [reconBusy, setReconBusy] = useState(false)
  const [reconErr, setReconErr]   = useState('')
  async function rodarReconciliacao(apply) {
    setReconBusy(true); setReconErr('')
    try {
      const r = await api.reconcilePagarmeFees({ days: DAYS_BY_PERIOD[period], apply })
      setRecon(r)
    } catch (e) {
      setReconErr(e?.message || 'Falha na conciliação.')
    } finally {
      setReconBusy(false)
    }
  }

  // Flag de conciliação automática diária (aplicar). Desligada por padrão.
  const qc = useQueryClient()
  const { data: settings = [] } = useQuery({ queryKey: ['admin-settings'], queryFn: () => api.getSettings() })
  const autoOn = (settings || []).find((s) => s.setting_key === 'payment_pagarme_fee_autoreconcile')?.setting_value === 'true'
  const [autoBusy, setAutoBusy] = useState(false)
  async function toggleAuto(checked) {
    setAutoBusy(true)
    try {
      await api.updateSetting('payment_pagarme_fee_autoreconcile', { setting_value: checked ? 'true' : 'false', value_type: 'boolean' })
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
    } finally { setAutoBusy(false) }
  }

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
    // O líquido vem do razão (`booking_net`). Era `bruto * 0,93` calculado
    // aqui — 7% chutados, enquanto a comissão real é configurável por
    // operador e a taxa do gateway varia. Sem lançamento líquido no dia, a
    // série fica sem ponto em vez de inventar um.
    liquido: d.net == null ? null : Number(d.net),
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
        <KpiCard icon={DollarSign}   label="Bruto"               value={fmt(summary?.bruto)}                color="text-brand"      />
        <KpiCard icon={TrendingUp}   label="Resultado plataforma"
          value={summary?.dados_incompletos ? '—' : fmt(summary?.resultado_plataforma)}
          subLabel={summary?.dados_incompletos ? 'Sem dados de comissão neste período' : undefined}
          subValue={summary?.dados_incompletos ? 'período anterior ao registro de comissões' : undefined}
          color="text-green-400"  />
        <KpiCard icon={CreditCard}   label="Taxas gateway"       value={fmt(summary?.taxas)}                color="text-orange-400" />
        <KpiCard icon={AlertCircle}  label="Não creditado"       value={fmt(summary?.nao_creditado)}        color="text-amber-400"  />
      </div>

      {/* Receita por gateway (MP vs Pagar.me) */}
      {Array.isArray(summary?.by_gateway) && summary.by_gateway.length > 0 && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-gray-300">Receita por gateway</h2></CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summary.by_gateway.map((g) => (
                <div key={g.gateway} className="rounded-xl border border-gray-700/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-200">{g.label}</span>
                    <span className="text-[11px] text-gray-500 uppercase tracking-wide">{g.gateway}</span>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Bruto</span>
                      <span className="text-gray-100 font-semibold">{fmt(g.bruto)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">(-) Taxa gateway</span>
                      <span className="text-red-400">- {fmt(g.taxas)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-700/50 pt-2">
                      <span className="text-gray-400">Líquido</span>
                      <span className="text-green-400 font-bold">{fmt(g.liquido)}</span>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
              Inclui passeios e estacionamento. Taxa de gateway estimada pela tarifa de tabela de cada método (PIX, débito, crédito); o estacionamento não tem taxa de gateway no razão.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Conciliação da taxa real da Pagar.me (payables) */}
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-300">Conciliar taxa real — Pagar.me</h2></CardHeader>
        <CardBody>
          <p className="text-xs text-gray-500 mb-3">
            Puxa a taxa real (MDR + antecipação) dos recebíveis da Pagar.me e compara com o razão. Experimental:
            rode a <b>prévia</b> e confira contra o painel da Pagar.me antes de <b>aplicar</b>. Período: {DAYS_BY_PERIOD[period]} dias.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => rodarReconciliacao(false)} disabled={reconBusy}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 disabled:opacity-50">
              {reconBusy ? 'Processando…' : 'Prévia (dry-run)'}
            </button>
            <button onClick={() => rodarReconciliacao(true)} disabled={reconBusy || !recon || !recon.divergencias}
              className="text-sm font-semibold px-4 py-2 rounded-lg bg-brand text-white disabled:opacity-40">
              Aplicar ajustes
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-gray-400 select-none">
            <input type="checkbox" checked={autoOn} disabled={autoBusy}
              onChange={(e) => toggleAuto(e.target.checked)} className="accent-brand" />
            Aplicar automaticamente todo dia (conciliação diária às ~5h). Ligue só depois de validar a prévia.
          </label>
          {reconErr && <p className="mt-3 text-sm text-red-400">{reconErr}</p>}
          {recon && (
            <div className="mt-4 text-sm text-gray-300 space-y-1">
              <p>{recon.dry_run ? 'Prévia' : 'Aplicado'} · {recon.pagamentos_analisados} pagamentos analisados · <b>{recon.divergencias}</b> divergência(s){recon.grupos_ignorados?.length ? ` · ${recon.grupos_ignorados.length} de grupo (manual)` : ''}</p>
              {!recon.dry_run && <p className="text-green-400">Atualizados: {recon.atualizados} · ajuste total de taxa: {fmt(recon.ajuste_total_taxa)}</p>}
              {recon.itens?.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-gray-500"><tr>
                      <th className="text-left py-1 pr-3">Reserva</th>
                      <th className="text-right py-1 px-3">Taxa atual</th>
                      <th className="text-right py-1 px-3">Taxa real</th>
                      <th className="text-right py-1 pl-3">Diferença</th>
                    </tr></thead>
                    <tbody>
                      {recon.itens.map((it) => (
                        <tr key={it.payment_id} className="border-t border-gray-800">
                          <td className="py-1 pr-3 text-gray-400">{it.booking_id?.slice(0, 8)}</td>
                          <td className="py-1 px-3 text-right">{fmt(it.taxa_atual)}</td>
                          <td className="py-1 px-3 text-right text-gray-100">{fmt(it.taxa_real)}</td>
                          <td className={`py-1 pl-3 text-right ${it.diferenca >= 0 ? 'text-red-400' : 'text-green-400'}`}>{it.diferenca >= 0 ? '+' : ''}{fmt(it.diferenca)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {recon.aviso && <p className="text-[11px] text-gray-500 mt-2">{recon.aviso}</p>}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Gráfico área */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Faturamento</h2>
            {summary?.margem_percent != null && (
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
                { label: 'Receita Bruta',            value: summary?.bruto,                            cls: 'text-gray-100 font-bold' },
                { label: '(-) Repasse operadores', value: `- ${fmt(summary?.repasses)}`,             cls: 'text-red-400'  },
                { label: '(-) Taxa gateway',         value: `- ${fmt(summary?.taxas)}`,                cls: 'text-red-400'  },
                { label: '(-) Comissão afiliados',   value: `- ${fmt(summary?.comissoes_afiliados)}`,  cls: 'text-red-400'  },
                { label: '= Resultado plataforma',
                  value: summary?.dados_incompletos ? '—' : summary?.resultado_plataforma,
                  cls: 'text-green-400 font-bold text-base' },
                { label: 'Comissão plataforma (bruta)', value: summary?.comissoes_plataforma,          cls: 'text-gray-400'  },
                { label: 'A creditar',               value: summary?.nao_creditado,                    cls: 'text-amber-400'  },
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
