import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Check, Copy } from 'lucide-react'
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
