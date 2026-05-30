import { useLocation, useNavigate, Link } from 'react-router-dom'
import { CheckCircle, Clock, Calendar, Users, ArrowRight, Home } from 'lucide-react'

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

export default function CheckoutSucesso() {
  const navigate  = useNavigate()
  const { state } = useLocation()

  if (!state) { navigate('/'); return null }

  const { service_name, service_date, service_time, people_count, total_price, booking_code, cover_image_url, booking_id } = state

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col">
      <main className="flex-1 px-4 pt-12 pb-10 flex flex-col items-center">

        {/* Success icon */}
        <div className="relative mb-5">
          <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle size={48} className="text-green-500" strokeWidth={1.5} />
          </div>
          <div className="absolute inset-0 rounded-full bg-green-200 animate-ping opacity-20" />
        </div>

        <h1 className="text-[24px] font-extrabold text-gray-900 text-center leading-tight mb-1">
          Pagamento confirmado!
        </h1>
        <p className="text-[14px] text-gray-500 text-center mb-4">
          Seu pagamento foi aprovado com sucesso.
        </p>

        {/* Status waiting badge */}
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5 w-full">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Clock size={16} className="text-amber-600" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-amber-800">Aguardando cooperativa aceitar</p>
            <p className="text-[11px] text-amber-600 mt-0.5">Você será notificado quando a corrida for aceita</p>
          </div>
        </div>

        {/* Booking card */}
        <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden mb-5">
          {cover_image_url && (
            <div className="h-[100px] overflow-hidden">
              <img src={cover_image_url} alt={service_name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 space-y-2">
            <p className="text-[15px] font-bold text-gray-900">{service_name}</p>
            <div className="text-[12px] font-mono font-bold text-brand bg-brand/5 rounded-lg px-3 py-1.5">
              Código: {booking_code}
            </div>
            <div className="flex items-center gap-4 text-[12px] text-gray-600">
              {service_date && <span className="flex items-center gap-1"><Calendar size={12} className="text-gray-400" />{service_date}</span>}
              {people_count && <span className="flex items-center gap-1"><Users size={12} className="text-gray-400" />{people_count} pessoas</span>}
            </div>
            <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
              <span className="text-[12px] text-gray-500">Total pago</span>
              <span className="text-[17px] font-bold text-gray-900">R$ {fmt(total_price)}</span>
            </div>
          </div>
        </div>

        <div className="w-full space-y-2.5">
          <Link
            to={booking_id ? `/minhas-reservas/${booking_id}` : '/minhas-reservas'}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform"
          >
            Acompanhar reserva <ArrowRight size={16} />
          </Link>
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            <Home size={15} /> Voltar ao início
          </button>
        </div>
      </main>
    </div>
  )
}
