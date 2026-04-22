import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, QrCode, CreditCard, Smartphone,
  ShieldCheck, Lock, Check,
} from 'lucide-react'

const METHODS = [
  {
    id:       'pix',
    label:    'Pix',
    sub:      'Aprovação instantânea',
    icon:     QrCode,
    badge:    'Recomendado',
    iconBg:   'bg-orange-100',
    iconColor:'text-brand',
  },
  {
    id:       'credit',
    label:    'Cartão de crédito',
    sub:      'Parcele em até 3x sem juros',
    icon:     CreditCard,
    badge:    null,
    iconBg:   'bg-gray-100',
    iconColor:'text-gray-500',
  },
  {
    id:       'debit',
    label:    'Cartão de débito',
    sub:      'Débito direto na conta',
    icon:     Smartphone,
    badge:    null,
    iconBg:   'bg-gray-100',
    iconColor:'text-gray-500',
  },
]

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

export default function CheckoutPayment() {
  const navigate       = useNavigate()
  const { state }      = useLocation()
  const [method, setMethod] = useState('pix')
  const [loading, setLoading] = useState(false)

  if (!state) { navigate(-1); return null }

  const {
    service_name, service_type, booking_mode,
    service_date, service_time, people_count,
    total_price, region_id, service_id, vehicles,
  } = state

  const isPrivate = booking_mode === 'private'
  const subtitleParts = [service_date, service_time, `${people_count} ${people_count === 1 ? 'pessoa' : 'pessoas'}`].filter(Boolean)

  async function handleConfirm() {
    if (loading) return
    setLoading(true)
    navigate('/checkout/processando', {
      state: { ...state, payment_method: method },
    })
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      {/* Header */}
      <header className="bg-white px-4 pt-12 pb-4 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
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
              {service_type === 'tour' ? 'Passeio' : 'Transfer'}
              {isPrivate ? ' · Privativo' : ' · Compartilhado'}
            </p>
            <p className="text-[15px] font-bold text-gray-900 truncate">{service_name}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">{subtitleParts.join(' · ')}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-gray-400">Total</p>
            <p className="text-[18px] font-bold text-brand">R$ {fmt(total_price)}</p>
          </div>
        </div>

        {/* Métodos de pagamento */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
          <p className="text-[14px] font-bold text-gray-900 px-4 pt-4 pb-3">Escolha como pagar</p>
          <div className="divide-y divide-gray-50">
            {METHODS.map((m) => {
              const selected = method === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left ${
                    selected ? 'bg-orange-50/60' : 'active:bg-gray-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl ${selected ? 'bg-brand' : m.iconBg} flex items-center justify-center shrink-0 transition-colors`}>
                    <m.icon size={18} className={selected ? 'text-white' : m.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[14px] font-semibold ${selected ? 'text-gray-900' : 'text-gray-700'}`}>
                        {m.label}
                      </span>
                      {m.badge && (
                        <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-400 mt-0.5">{m.sub}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    selected ? 'border-brand bg-brand' : 'border-gray-300'
                  }`}>
                    {selected && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Segurança */}
        <div className="bg-green-50 rounded-2xl p-3.5 border border-green-100">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={16} className="text-green-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-green-900 mb-0.5">Pagamento seguro</p>
              <p className="text-[11px] text-green-700 leading-relaxed">
                Seus dados estão protegidos. Você receberá atualizações da reserva após a confirmação do pagamento.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Botão fixo */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 px-4 pt-3 pb-6 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full bg-brand text-white font-bold rounded-2xl py-4 text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-70"
        >
          <Lock size={15} className="text-white/80" />
          Confirmar pagamento · R$ {fmt(total_price)}
        </button>
        <p className="text-[10px] text-gray-400 text-center mt-2">
          Ao confirmar, você concorda com os termos de uso do Giro Jeri
        </p>
      </div>
    </div>
  )
}
