import { useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, MapPin, Calendar, Clock, Users, Car, Shield,
  AlertCircle, Pen, Zap, Sun, Waves, Anchor,
} from 'lucide-react'

const GRADIENTS = [
  'from-orange-100 to-amber-100',
  'from-sky-100 to-blue-100',
  'from-emerald-100 to-teal-100',
  'from-purple-100 to-violet-100',
]
const TOUR_ICONS = [Zap, Sun, Waves, Anchor]

function gradientIdx(str = '') {
  let n = 0
  for (let i = 0; i < str.length; i++) n += str.charCodeAt(i)
  return n % GRADIENTS.length
}

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

export default function CheckoutSummary() {
  const navigate = useNavigate()
  const { state } = useLocation()

  // Se chegou sem state, volta
  if (!state) {
    navigate(-1)
    return null
  }

  const {
    service_name,
    service_type,
    booking_mode,
    service_date,
    service_time,
    people_count,
    origin_text,
    destination_text,
    vehicle_name,
    total_price,
    breakdown,
    // dados repassados para o próximo passo
    region_id,
    service_id,
    vehicles,
  } = state

  const isTour     = service_type === 'tour'
  const isPrivate  = booking_mode === 'private'
  const gi         = gradientIdx(service_id || service_name)
  const Icon       = TOUR_ICONS[gi]

  // Linhas de detalhes da reserva
  const details = [
    ...(origin_text      ? [{ icon: MapPin,    label: 'Saída',    value: origin_text }]      : []),
    ...(destination_text ? [{ icon: MapPin,    label: 'Destino',  value: destination_text }] : []),
    { icon: Calendar, label: 'Data',    value: service_date },
    { icon: Clock,    label: 'Horário', value: service_time },
    {
      icon: Users,
      label: 'Pessoas',
      value: `${people_count} ${people_count === 1 ? 'pessoa' : 'pessoas'}`,
    },
    ...(isPrivate && vehicle_name ? [{ icon: Car, label: 'Veículo', value: vehicle_name }] : []),
  ]

  // Monta os itens do breakdown para exibição
  const breakdownEntries = breakdown ? Object.entries(breakdown) : []
  const baseEntry = breakdownEntries[0]
  const surchargeEntries = breakdownEntries.slice(1)

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
          <h1 className="text-lg font-bold text-gray-900">Resumo da reserva</h1>
        </div>
      </header>

      <main className="px-4 pt-4 pb-36 space-y-3">
        {/* Service Card */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <div className="h-[120px] relative">
            <div className={`w-full h-full bg-gradient-to-br ${GRADIENTS[gi]} flex items-center justify-center`}>
              <Icon size={44} className="text-brand/15" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isTour ? 'bg-brand text-white' : 'bg-teal-500 text-white'}`}>
                  {isTour ? 'Passeio' : 'Transfer'}
                </span>
                {isTour && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                    {isPrivate ? 'Privativo' : 'Compartilhado'}
                  </span>
                )}
              </div>
              <p className="text-white font-bold text-[17px] leading-tight">{service_name}</p>
            </div>
          </div>
        </div>

        {/* Booking Details */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-gray-900">Detalhes da reserva</h2>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-[12px] font-semibold text-brand active:opacity-70"
            >
              <Pen size={12} /> Editar
            </button>
          </div>
          <div className="space-y-3">
            {details.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon size={15} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400">{item.label}</p>
                  <p className="text-[13px] font-semibold text-gray-900">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <h2 className="text-[15px] font-bold text-gray-900 mb-3">Resumo de preços</h2>
          <div className="space-y-2">
            {baseEntry ? (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-500">{baseEntry[0]}</span>
                <span className="text-[13px] font-semibold text-gray-900">R$ {fmt(baseEntry[1])}</span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-500">
                  {isPrivate ? 'Veículos selecionados' : `${people_count}x por pessoa`}
                </span>
                <span className="text-[13px] font-semibold text-gray-900">R$ {fmt(total_price)}</span>
              </div>
            )}

            {surchargeEntries.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-[13px] text-amber-600">{k}</span>
                <span className="text-[13px] font-semibold text-amber-600">+ R$ {fmt(v)}</span>
              </div>
            ))}

            <div className="border-t border-gray-100 pt-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-bold text-gray-900">Total</span>
                <span className="text-[22px] font-bold text-brand">R$ {fmt(total_price)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cancellation Policy */}
        <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
          <div className="flex items-start gap-2.5">
            <Shield size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-blue-900 mb-0.5">Política de cancelamento</p>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Cancelamento gratuito até 24h antes do passeio. Após esse prazo, pode haver cobrança de taxa.
              </p>
            </div>
          </div>
        </div>

        {/* Security Note */}
        <div className="flex items-center gap-2 px-1">
          <AlertCircle size={13} className="text-gray-400 shrink-0" />
          <p className="text-[11px] text-gray-400">
            Sua reserva será enviada à cooperativa para confirmação após o pagamento.
          </p>
        </div>
      </main>

      {/* Fixed Bottom */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="mb-3">
          <p className="text-[11px] text-gray-400">Total a pagar</p>
          <p className="text-[20px] font-bold text-brand">R$ {fmt(total_price)}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="shrink-0 px-4 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 active:bg-gray-50 transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() =>
              navigate('/checkout/pagamento', {
                state: {
                  region_id,
                  service_type,
                  service_id,
                  booking_mode,
                  service_date,
                  service_time,
                  people_count,
                  vehicles,
                  total_price,
                  service_name,
                },
              })
            }
            className="flex-1 bg-brand text-white py-3 rounded-xl font-bold text-[14px] shadow-md active:bg-orange-700 active:scale-[0.97] transition-all"
          >
            Ir para pagamento
          </button>
        </div>
      </div>
    </div>
  )
}
