import { useLocation, useNavigate, Link } from 'react-router-dom'
import { CheckCircle, Calendar, MapPin, ArrowRight, Home } from 'lucide-react'

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

export default function CheckoutSucesso() {
  const navigate  = useNavigate()
  const { state } = useLocation()

  if (!state) { navigate('/'); return null }

  const { service_name, service_date, service_time, people_count, total_price, booking_code, cover_image_url } = state

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col">
      <main className="flex-1 px-4 pt-16 pb-10 flex flex-col items-center">

        {/* Ícone sucesso */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle size={48} className="text-green-500" strokeWidth={1.5} />
          </div>
          <div className="absolute inset-0 rounded-full bg-green-200 animate-ping opacity-20" />
        </div>

        <h1 className="text-[24px] font-extrabold text-gray-900 text-center leading-tight mb-1">
          Reserva confirmada!
        </h1>
        <p className="text-[14px] text-gray-500 text-center mb-6">
          Seu pagamento foi aprovado e a reserva está garantida.
        </p>

        {/* Card da reserva */}
        <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden mb-5">
          {cover_image_url && (
            <div className="h-[120px] overflow-hidden">
              <img src={cover_image_url} alt={service_name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <p className="text-[16px] font-bold text-gray-900 flex-1">{service_name}</p>
              <span className="ml-2 bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-full shrink-0">Confirmado</span>
            </div>

            <div className="text-[12px] font-mono font-bold text-brand bg-brand/5 rounded-lg px-3 py-2">
              Código: {booking_code}
            </div>

            <div className="space-y-1.5 text-[13px] text-gray-600">
              {service_date && (
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-400 shrink-0" />
                  <span>{service_date}{service_time ? ` às ${service_time}` : ''}</span>
                </div>
              )}
              {people_count && (
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-gray-400 shrink-0" />
                  <span>{people_count} {people_count === 1 ? 'pessoa' : 'pessoas'}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <span className="text-[13px] text-gray-500">Total pago</span>
              <span className="text-[18px] font-bold text-gray-900">R$ {fmt(total_price)}</span>
            </div>
          </div>
        </div>

        <p className="text-[12px] text-gray-400 text-center mb-6">
          Você receberá atualizações pelo app. Qualquer dúvida, entre em contato pelo WhatsApp.
        </p>

        <div className="w-full space-y-2.5">
          <Link
            to="/minhas-reservas"
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform"
          >
            Ver minhas reservas <ArrowRight size={16} />
          </Link>
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            <Home size={15} />
            Voltar ao início
          </button>
        </div>
      </main>
    </div>
  )
}
