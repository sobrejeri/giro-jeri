import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, QrCode, CreditCard, Smartphone, ShieldCheck, Lock, Check, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api'

const METHODS = [
  { id: 'pix',    label: 'Pix',              sub: 'Aprovação instantânea',     icon: QrCode,       badge: 'Recomendado', iconBg: 'bg-orange-100', iconColor: 'text-brand' },
  { id: 'credit', label: 'Cartão de crédito', sub: 'Em breve',                  icon: CreditCard,   badge: null,          iconBg: 'bg-gray-100',   iconColor: 'text-gray-400', disabled: true },
  { id: 'debit',  label: 'Cartão de débito',  sub: 'Em breve',                  icon: Smartphone,   badge: null,          iconBg: 'bg-gray-100',   iconColor: 'text-gray-400', disabled: true },
]

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

export default function CheckoutPayment() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const [method, setMethod] = useState('pix')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (!state) { navigate(-1); return null }

  const {
    service_name, service_type, booking_mode,
    service_date, service_date_iso, service_time,
    people_count, total_price: rawPrice, display_total, region_id, service_id,
    vehicles = [], origin_text, destination_text, cover_image_url,
    existing_booking_id, quote_id,
  } = state

  // `total_price` é a base enviada ao servidor (subtotal cru em translado).
  // `display_total` (quando vem) já inclui o acréscimo e é o que mostramos.
  const total_price  = isNaN(Number(rawPrice)) ? 0 : Number(rawPrice)
  const shownTotal   = display_total != null && !isNaN(Number(display_total))
    ? Number(display_total)
    : total_price
  const isPrivate    = booking_mode === 'private'
  const subtitleParts = [service_date, service_time, `${people_count} ${people_count === 1 ? 'pessoa' : 'pessoas'}`].filter(Boolean)

  async function handleConfirm() {
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const result = await api.createPaymentIntent({
        service_type, service_id, booking_mode,
        service_date, service_date_iso, service_time,
        people_count, region_id, vehicles,
        origin_text, destination_text,
        total_price, payment_method: method,
        service_name, cover_image_url,
        existing_booking_id: existing_booking_id || undefined,
      })

      if (!result) throw new Error('Erro ao iniciar pagamento')

      navigate('/checkout/processando', {
        state: {
          ...state,
          payment_id:        result.payment_id,
          booking_id:        result.booking_id,
          booking_code:      result.booking_code,
          amount:            result.amount,
          pix_code:          result.pix_code,
          qr_base64:         result.qr_base64,
          expires_at:        result.expires_at,
          // manual payment fields
          manual_mode:       result.manual_mode,
          pix_key_type:      result.pix_key_type,
          pix_key:           result.pix_key,
          bank_name:         result.bank_name,
          bank_agency:       result.bank_agency,
          bank_account:      result.bank_account,
          bank_account_type: result.bank_account_type,
          payment_method:    method,
        },
      })
    } catch (err) {
      setError(err.message || 'Erro ao processar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <header className="bg-white px-4 pt-12 pb-4 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Pagamento</h1>
        </div>
      </header>

      <main className="px-4 pt-4 pb-36 space-y-3">
        {/* Resumo mini */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 mb-0.5">
              {quote_id
                ? 'Translado personalizado'
                : <>{service_type === 'tour' ? 'Passeio' : 'Transfer'}{isPrivate ? ' · Privativo' : ' · Compartilhado'}</>}
            </p>
            <p className="text-[15px] font-bold text-gray-900 truncate">{service_name}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">{subtitleParts.join(' · ')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-400">Total</p>
            <p className="text-[18px] font-bold text-brand">R$ {fmt(shownTotal)}</p>
          </div>
        </div>

        {/* Métodos */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <p className="text-[14px] font-bold text-gray-900 px-4 pt-4 pb-3">Escolha como pagar</p>
          <div className="divide-y divide-gray-50">
            {METHODS.map((m) => {
              const selected = method === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => !m.disabled && setMethod(m.id)}
                  disabled={m.disabled}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left disabled:opacity-50 ${selected ? 'bg-orange-50/60' : 'active:bg-gray-50'}`}
                >
                  <div className={`w-10 h-10 rounded-xl ${selected ? 'bg-brand' : m.iconBg} flex items-center justify-center shrink-0 transition-colors`}>
                    <m.icon size={18} className={selected ? 'text-white' : m.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[14px] font-semibold ${selected ? 'text-gray-900' : 'text-gray-700'}`}>{m.label}</span>
                      {m.badge && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{m.badge}</span>}
                    </div>
                    <p className="text-[12px] text-gray-400 mt-0.5">{m.sub}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'border-brand bg-brand' : 'border-gray-300'}`}>
                    {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        <div className="bg-green-50 rounded-2xl p-3.5 border border-green-100">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-green-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-green-700 leading-relaxed">Pagamento seguro. Você receberá a confirmação da reserva após o pagamento.</p>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 px-4 pt-3 pb-6 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-70"
        >
          {loading
            ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <><Lock size={15} className="text-white/80" /> Gerar PIX · R$ {fmt(shownTotal)}</>}
        </button>
        <p className="text-[10px] text-gray-400 text-center mt-2">Ao confirmar, você concorda com os termos de uso do Giro Jeri</p>
      </div>
    </div>
  )
}
