import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Check, Copy, Percent } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Card, { CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDia = (iso) => (iso ? format(new Date(`${String(iso).slice(0, 10)}T12:00:00`), 'dd/MM/yyyy') : '—')

// Programa de afiliados: comissões geradas quando reservas indicadas são
// pagas (5% padrão). O repasse é MANUAL via PIX (em até 7 dias úteis) — aqui
// o admin acompanha as pendências e marca como pago após transferir.
export default function Afiliados() {
  const [status, setStatus] = useState('pending')
  const [copied, setCopied] = useState(null)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-commissions', status],
    queryFn:  () => api.getCommissions(status === 'all' ? {} : { status }),
  })

  // ── Taxa de comissão (ajuste manual do admin) ──────────
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api.getSettings() })
  const currentPct = settings?.find((x) => x.setting_key === 'affiliate_commission_percent')?.setting_value
  const [pct, setPct] = useState('')
  const [pctSaved, setPctSaved] = useState(false)
  useEffect(() => { if (currentPct != null && pct === '') setPct(String(currentPct)) }, [currentPct]) // eslint-disable-line react-hooks/exhaustive-deps

  const savePct = useMutation({
    mutationFn: () => api.updateSetting('affiliate_commission_percent', {
      setting_value: String(Math.max(0, Math.min(100, Number(pct) || 0))),
      value_type:    'number',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setPctSaved(true)
      setTimeout(() => setPctSaved(false), 2000)
    },
  })

  const payMut = useMutation({
    mutationFn: (id) => api.payCommission(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-commissions'] }),
  })

  const rows = data || []
  const totalPending = rows
    .filter((c) => c.payout_status !== 'paid')
    .reduce((s, c) => s + Number(c.commission_amount || 0), 0)

  function copyContact(c) {
    const text = `${c.affiliate?.full_name || ''} · ${c.affiliate?.email || ''} · ${c.affiliate?.phone || ''}`.trim()
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(c.id)
      setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Taxa de comissão */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-gray-300">
            <Percent size={16} className="text-orange-400" />
            <p className="font-semibold">Taxa de comissão dos afiliados</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number" min="0" max="100" step="0.5"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
            />
            <span className="text-sm text-gray-400">%</span>
            <Button
              size="sm"
              disabled={savePct.isPending || pct === '' || String(currentPct) === String(pct)}
              onClick={() => savePct.mutate()}
            >
              {pctSaved ? 'Salvo ✓' : savePct.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
          <p className="text-xs text-gray-500 basis-full">
            Vale para as PRÓXIMAS reservas pagas — comissões já geradas não mudam.
            O app do turista mostra a taxa vigente automaticamente.
          </p>
        </CardBody>
      </Card>

      {/* Filtro + resumo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {[['pending', 'Pendentes'], ['paid', 'Pagas'], ['all', 'Todas']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setStatus(id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                status === id ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {status !== 'paid' && rows.length > 0 && (
          <p className="text-sm text-gray-400">
            A repassar: <span className="font-bold text-orange-400">{fmtBRL(totalPending)}</span>
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardBody className="py-14 text-center">
            <Megaphone size={32} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400 font-medium">
              {status === 'pending' ? 'Nenhuma comissão pendente 🎉' : 'Nenhuma comissão encontrada.'}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Comissões nascem quando uma reserva indicada por um afiliado é paga.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="px-4 py-3 font-semibold">Afiliado</th>
                  <th className="px-4 py-3 font-semibold">Reserva</th>
                  <th className="px-4 py-3 font-semibold">Comissão</th>
                  <th className="px-4 py-3 font-semibold">Repasse até</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-800/40">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-100">{c.affiliate?.full_name || '—'}</p>
                      <button
                        onClick={() => copyContact(c)}
                        title="Copiar contato (para o PIX)"
                        className="text-xs text-gray-400 hover:text-orange-400 flex items-center gap-1"
                      >
                        {copied === c.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        {c.affiliate?.email || c.affiliate?.phone || 'sem contato'}
                      </button>
                      {c.affiliate?.affiliate_code && (
                        <p className="text-[11px] text-gray-500 tracking-wider">{c.affiliate.affiliate_code}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-gray-200">{c.bookings?.booking_code || '—'}</p>
                      <p className="text-xs text-gray-500">
                        {c.bookings?.service_type === 'transfer' ? 'Translado' : 'Passeio'} · {fmtBRL(c.bookings?.total_amount)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-orange-400">{fmtBRL(c.commission_amount)}</p>
                      <p className="text-xs text-gray-500">{Number(c.commission_percent)}%</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {c.payout_status === 'paid' ? fmtDia(c.payout_paid_at) : fmtDia(c.payout_due_date)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.payout_status === 'paid' ? 'success' : 'warning'}>
                        {c.payout_status === 'paid' ? 'Pago' : 'Pendente'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.payout_status !== 'paid' && (
                        <Button
                          size="sm"
                          disabled={payMut.isPending}
                          onClick={() => {
                            if (window.confirm(`Confirmar que o PIX de ${fmtBRL(c.commission_amount)} para ${c.affiliate?.full_name || 'o afiliado'} já foi feito?`)) {
                              payMut.mutate(c.id)
                            }
                          }}
                        >
                          Marcar pago
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
