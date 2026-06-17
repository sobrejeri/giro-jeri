import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Clock, ArrowRight, Home, Calendar, Users } from 'lucide-react'

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

export default function CheckoutSucesso() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const { t }     = useTranslation()

  if (!state) { navigate('/'); return null }

  const {
    service_name, service_date, service_time, people_count,
    total_price, amount, booking_code, booking_id, cover_image_url,
  } = state

  const value = amount || total_price

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col">
      <main className="flex-1 px-4 pt-14 pb-10 flex flex-col items-center">

        {/* Ícone sucesso */}
        <div className="relative mb-5">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle size={40} className="text-green-500" strokeWidth={1.5} />
          </div>
          <div className="absolute inset-0 rounded-full bg-green-200 animate-ping opacity-20" />
        </div>

        <h1 className="text-[22px] font-extrabold text-gray-900 text-center leading-tight mb-1">
          {t('payment.success.title')}
        </h1>
        <p className="text-[13px] text-gray-500 text-center mb-5">
          {t('payment.success.subtitle')}
        </p>

        {/* Status aguardando cooperativa */}
        <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
          <div className="relative shrink-0 mt-0.5">
            <div className="w-8 h-8 rounded-full bg-amber-300 animate-ping absolute inset-0 opacity-50" />
            <div className="relative w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center">
              <Clock size={16} className="text-white" />
            </div>
          </div>
          <div>
            <p className="text-[14px] font-bold text-amber-900">{t('payment.success.awaitingCoop')}</p>
            <p className="text-[12px] text-amber-700 mt-0.5 leading-relaxed">
              {t('payment.success.awaitingCoopSub')}
            </p>
          </div>
        </div>

        {/* Card da reserva */}
        <div className="w-full bg-white rounded-2xl shadow-sm overflow-hidden mb-5">
          {cover_image_url && (
            <div className="h-[100px] overflow-hidden">
              <img src={cover_image_url} alt={service_name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[15px] font-bold text-gray-900 flex-1">{service_name}</p>
              <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-1 rounded-full shrink-0 whitespace-nowrap">
                {t('payment.success.statusTag')}
              </span>
            </div>

            {booking_code && (
              <div className="text-[12px] font-mono font-bold text-brand bg-brand/5 rounded-lg px-3 py-2">
                {t('payment.success.code')}: {booking_code}
              </div>
            )}

            <div className="space-y-1.5 text-[13px] text-gray-600">
              {service_date && (
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-400 shrink-0" />
                  <span>{service_date}{service_time ? ` às ${service_time}` : ''}</span>
                </div>
              )}
              {people_count && (
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-gray-400 shrink-0" />
                  <span>{people_count} {people_count === 1 ? t('payment.success.person') : t('payment.success.people')}</span>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <span className="text-[13px] text-gray-500">{t('payment.success.totalPaid')}</span>
              <span className="text-[18px] font-bold text-gray-900">R$ {fmt(value)}</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 text-center mb-6 leading-relaxed">
          {t('payment.success.followHint')}
        </p>

        <div className="w-full space-y-2.5">
          <button
            onClick={() => navigate(booking_id ? `/minhas-reservas/${booking_id}` : '/minhas-reservas')}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform"
          >
            {t('payment.success.trackBtn')} <ArrowRight size={16} />
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
          >
            <Home size={15} />
            {t('payment.success.homeBtn')}
          </button>
        </div>
      </main>
    </div>
  )
}
