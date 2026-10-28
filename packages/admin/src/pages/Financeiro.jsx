import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, DollarSign, CreditCard, Users } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const fmt = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Eixo Y legível em qualquer magnitude: abaixo de mil mostra o valor real
// (R$122), senão "k"/"M". Antes `(v/1000).toFixed(0)` zerava tudo em "0k".
const fmtEixo = (v) => {
  const n = Number(v) || 0, a = Math.abs(n)
  if (a >= 1e6) return `R$ ${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (a >= 1e3) return `R$ ${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`
  return `R$ ${Math.round(n)}`
}

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

  // Planilha por reserva (bruto / comissão / o que fica para o Turiva).
  const { data: bookings = [], isLoading: l3 } = useQuery({
    queryKey: ['financial-bookings', period],
    queryFn:  () => api.getFinancialBookings({ period }),
  })
  const totBruto    = bookings.reduce((s, b) => s + Number(b.bruto    || 0), 0)
  const totComissao = bookings.reduce((s, b) => s + Number(b.comissao || 0), 0)
  const totTuriva   = bookings.reduce((s, b) => s + Number(b.turiva   || 0), 0)

  // Só o GANHO DO TURIVA por dia (a fatia da plataforma). O endpoint já entrega
  // comissão − gateway − afiliados consolidado em `ganho`; a tela não recalcula
  // nada. Antes plotava bruto e "líquido" — dinheiro que em sua maior parte é do
  // OPERADOR, não do Turiva — e isso confundia quem só quer ver o que fica aqui.
  const chartData = daily.map((d) => ({
    date: (() => {
      try { return format(parseISO(d.date), 'd MMM', { locale: ptBR }) } catch { return d.date }
    })(),
    ganho: Number(d.ganho),
  }))

  if (l1 || l2 || l3) return <PageSpinner />

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

      {/* HERÓI: o GANHO DO TURIVA — a fatia que fica para a plataforma, já sem a
          taxa de gateway e os afiliados. É a única métrica em destaque; o resto
          da tela só explica como se chega nela. Bruto e repasse ao operador
          saíram de vez: não são dinheiro do Turiva e só confundiam a leitura. */}
      <Card className="p-5 border border-green-500/20 bg-green-500/5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/15 flex items-center justify-center text-green-400 shrink-0">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Ganho do Turiva</p>
              <p className="text-[32px] leading-none font-extrabold text-green-400 mt-1.5">
                {summary?.dados_incompletos ? '—' : fmt(summary?.resultado_plataforma)}
              </p>
              <p className="text-[12px] text-gray-500 mt-1.5">
                {summary?.dados_incompletos
                  ? 'Período anterior ao registro de comissões — ganho indisponível.'
                  : 'Sua fatia: a comissão já descontadas a taxa de gateway e a comissão de afiliados.'}
              </p>
            </div>
          </div>
          {summary?.margem_percent != null && (
            <span className="text-sm font-bold text-green-400 bg-green-500/10 px-3 py-1.5 rounded-full">
              Margem {summary.margem_percent}%
            </span>
          )}
        </div>
      </Card>

      {/* Como se chega no ganho: a comissão (entra) menos as duas deduções que
          saem. São exatamente as linhas do "Detalhamento" abaixo, em destaque. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon={DollarSign} label="Comissão (sua fatia)" value={fmt(summary?.comissoes_plataforma)} color="text-brand"      />
        <KpiCard icon={CreditCard} label="(-) Taxa de gateway"  value={fmt(summary?.taxas)}                color="text-orange-400" />
        <KpiCard icon={Users}      label="(-) Afiliados"        value={fmt(summary?.comissoes_afiliados)}  color="text-sky-400"    />
      </div>

      {/* Gráfico: o ganho do Turiva dia a dia (o que o usuário pediu para ver). */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-300">Ganho do Turiva por dia</h2>
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
                  <linearGradient id="gGanho" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#34d399" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false}
                  tickFormatter={fmtEixo} />
                <Tooltip content={<TooltipDark />} />
                <Area type="monotone" dataKey="ganho" name="Ganho do Turiva" stroke="#34d399" strokeWidth={2} fill="url(#gGanho)" dot={false} activeDot={{ r: 4, fill: '#34d399' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      {/* Planilha por RESERVA — o detalhe que o usuário pediu, no modelo do
          ranking do dashboard: cada reserva com bruto, comissão e o que fica
          para o Turiva, fácil de acompanhar linha a linha. */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-gray-300">Reservas — detalhamento</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">Cada reserva do período: do bruto pago pelo cliente ao que fica para o Turiva.</p>
          </div>
        </CardHeader>
        <CardBody>
          {bookings.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-gray-600 text-sm">Nenhuma reserva no período</div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-700/50">
                    <th className="text-left font-medium py-2 pr-3">Reserva</th>
                    <th className="text-left font-medium py-2 px-3">Operador</th>
                    <th className="text-right font-medium py-2 px-3">Bruto</th>
                    <th className="text-right font-medium py-2 px-3">Comissão</th>
                    <th className="text-right font-medium py-2 pl-3">Turiva</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.booking_id} className="border-b border-gray-800 last:border-0">
                      <td className="py-2.5 pr-3 font-mono text-xs text-gray-400 whitespace-nowrap">{b.booking_code}</td>
                      <td className="py-2.5 px-3 text-gray-200">{b.operador}</td>
                      <td className="py-2.5 px-3 text-right text-gray-300 tabular-nums">{fmt(b.bruto)}</td>
                      <td className="py-2.5 px-3 text-right text-brand tabular-nums">{fmt(b.comissao)}</td>
                      <td className="py-2.5 pl-3 text-right text-green-400 font-semibold tabular-nums">{fmt(b.turiva)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700 font-bold">
                    <td className="py-2.5 pr-3 text-gray-400" colSpan={2}>
                      Total · {bookings.length} reserva{bookings.length !== 1 ? 's' : ''}
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-200 tabular-nums">{fmt(totBruto)}</td>
                    <td className="py-2.5 px-3 text-right text-brand tabular-nums">{fmt(totComissao)}</td>
                    <td className="py-2.5 pl-3 text-right text-green-400 tabular-nums">{fmt(totTuriva)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-600">
            "Turiva" = comissão da reserva menos a taxa de gateway e os afiliados dela. O estacionamento entra no ganho total do topo, mas não aparece aqui por não ser uma reserva com operador.
          </p>
        </CardBody>
      </Card>

      {/* Detalhamento = o P&L do Turiva: comissão − gateway − afiliados = ganho.
          Só dinheiro do Turiva; o repasse ao operador NÃO entra nesta conta. */}
      <Card>
        <CardHeader><h2 className="text-sm font-semibold text-gray-300">Como se chega no ganho do Turiva</h2></CardHeader>
        <CardBody>
          <dl className="space-y-3">
            {[
              { label: 'Comissão (sua fatia)',      value: summary?.comissoes_plataforma,            cls: 'text-gray-100 font-bold' },
              { label: '(-) Taxas de gateway',      value: `- ${fmt(summary?.taxas)}`,               cls: 'text-red-400'  },
              { label: '(-) Comissão de afiliados', value: `- ${fmt(summary?.comissoes_afiliados)}`, cls: 'text-red-400'  },
              { label: '= Ganho do Turiva',
                value: summary?.dados_incompletos ? '—' : summary?.resultado_plataforma,
                cls: 'text-green-400 font-bold text-base' },
            ].map((r) => (
              <div key={r.label} className="flex justify-between text-sm border-b border-gray-700/50 pb-3 last:border-0 last:pb-0">
                <span className="text-gray-500">{r.label}</span>
                <span className={r.cls}>{typeof r.value === 'number' ? fmt(r.value) : r.value}</span>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[11px] text-gray-600">
            O faturamento bruto e o repasse aos operadores ficam fora: não são receita do Turiva. Inclui passeios e a comissão do estacionamento.
          </p>
        </CardBody>
      </Card>

      {/* Ferramenta de manutenção: concilia a taxa real da Pagar.me (payables)
          contra o razão — mexe na "Taxa de gateway" e, logo, no ganho. Fica no
          rodapé porque é operação pontual, não um número de leitura diária. */}
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
    </div>
  )
}
