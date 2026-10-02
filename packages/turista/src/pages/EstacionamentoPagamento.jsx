import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { FormularioCartaoPagarme } from './checkout/CheckoutPayment'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

// Pagamento da reserva de estacionamento usando o MESMO formulário de cartão da
// plataforma (Pagar.me inline: CPF, parcelas, endereço de cobrança, idempotência).
export default function EstacionamentoPagamento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const idemKey = useMemo(() => `park-pay-${id}-${(crypto?.randomUUID?.() || Date.now())}`, [id])

  const { data: r, isLoading } = useQuery({ queryKey: ['parking-res', id], queryFn: () => api.parkingReservation(id) })
  const { data: settings } = useQuery({ queryKey: ['public-settings'], queryFn: () => api.getPublicSettings() })
  const publicKey = settings?.payment_pagarme_public_key
  const maxParcelas = Number(settings?.payment_max_installments) || 12

  if (isLoading) return <p className="p-6 text-center text-gray-400 text-sm">Carregando…</p>
  if (!r) return <p className="p-6 text-center text-gray-400 text-sm">Reserva não encontrada.</p>
  const podePagar = r.status === 'accepted_awaiting_payment' && r.payment_status !== 'paid'

  // Adapta o handler do formulário padrão ao endpoint do estacionamento.
  async function onPagar(fields) {
    const resp = await api.parkingPay(id, {
      card_token: fields.card_token,
      parcelas: Number(fields.installments) || 1,
      idempotency_key: idemKey,
    })
    if (resp?.ok || resp?.already) {
      navigate('/minhas-reservas', { replace: true })
      return { status: 'approved' }
    }
    if (resp?.refund_pending) return { status: 'rejected', message_key: 'payment.rejected.generic' }
    return { status: 'rejected' }
  }

  return (
    <div className="pb-10">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95">
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Pagamento</h1>
      </header>

      <main className="px-4 pt-4 space-y-3">
        {/* Resumo */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">Estacionamento · {r.code}</p>
            <p className="text-[15px] font-bold text-gray-900">{r.units} diária(s)</p>
          </div>
          <p className="text-[18px] font-extrabold text-brand">{fmt(r.total_amount)}</p>
        </div>

        {!podePagar ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] text-amber-700">
            Esta reserva não está liberada para pagamento.
          </div>
        ) : !publicKey ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[13px] text-amber-700">
            Pagamento por cartão indisponível no momento.
          </div>
        ) : (
          <>
            <p className="text-[13px] font-bold text-gray-900 flex items-center gap-2 px-1">Pagar com cartão</p>
            <FormularioCartaoPagarme
              amount={Number(r.total_amount)}
              publicKey={publicKey}
              maxParcelas={maxParcelas}
              onPagar={onPagar}
              installmentFees={settings?.payment_installment_fees}
            />
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5 px-1">
              <ShieldCheck size={13} className="text-emerald-500" /> Pagamento seguro. O cartão vai direto ao provedor.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
