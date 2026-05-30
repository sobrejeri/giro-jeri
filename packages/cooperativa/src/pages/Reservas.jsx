import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Calendar, Clock, Users, Phone, CheckCircle2, MapPin,
  MessageCircle, RefreshCw, Car, AlertCircle,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardBody } from '../components/ui/Card'

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z"/>
    </svg>
  )
}

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  try { return format(new Date(dateStr + 'T12:00:00'), "d MMM yyyy", { locale: ptBR }) } catch { return dateStr }
}

function buildWhatsAppMsg(b) {
  const clientPhone = b.users?.phone?.replace(/\D/g, '')
  const serviceName = b.service_name || (b.service_type === 'tour' ? 'Passeio' : 'Transfer')
  const msg = [
    `🏄 *GIRO JERI — Reserva Confirmada!*`,
    ``,
    `Olá *${b.users?.full_name || 'cliente'}*!`,
    `Sua reserva foi aceita e está confirmada.`,
    ``,
    `📋 *Detalhes:*`,
    `• Serviço: ${serviceName}`,
    `• Data: ${fmtDate(b.service_date)}`,
    b.service_time ? `• Horário: ${b.service_time}` : null,
    `• Pessoas: ${b.people_count}`,
    b.origin_text ? `• Saída: ${b.origin_text}` : null,
    b.destination_text ? `• Destino: ${b.destination_text}` : null,
    `• Total: ${fmt(b.total_amount)}`,
    `• Código: ${b.booking_code}`,
    ``,
    `Em breve entraremos em contato para confirmar os detalhes. Até logo! 🌊`,
  ].filter((l) => l !== null).join('\n')

  const phone = clientPhone ? `55${clientPhone}` : ''
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}

function BookingCard({ booking, onAccept, onComplete, accepting, completing }) {
  const isPending = !booking.operator_id
  const isActive  = booking.operator_id && booking.status_operational !== 'completed'

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isPending ? 'border-amber-200' : 'border-green-200'}`}>
      {/* Header */}
      <div className={`px-4 py-2.5 flex items-center justify-between ${isPending ? 'bg-amber-50' : 'bg-green-50'}`}>
        <span className={`text-[11px] font-bold uppercase tracking-wide ${isPending ? 'text-amber-700' : 'text-green-700'}`}>
          {isPending ? '⏳ Nova solicitação' : '✅ Em atendimento'}
        </span>
        <span className="text-[11px] text-gray-500 font-mono">{booking.booking_code}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Service name */}
        <div>
          <p className="text-[15px] font-bold text-gray-900">{booking.service_name || (booking.service_type === 'tour' ? 'Passeio' : 'Transfer')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {booking.service_type === 'tour' ? 'Passeio' : 'Transfer'} · {booking.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'}
          </p>
        </div>

        {/* Details row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Calendar, label: 'Data',    value: fmtDate(booking.service_date) },
            { icon: Clock,    label: 'Horário', value: booking.service_time?.slice(0,5) || 'A confirmar' },
            { icon: Users,    label: 'Pessoas', value: `${booking.people_count}` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-2.5 py-2">
              <p className="text-[10px] text-gray-400 flex items-center gap-1"><Icon size={10} />{label}</p>
              <p className="text-[12px] font-semibold text-gray-900 mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Route */}
        {(booking.origin_text || booking.destination_text) && (
          <div className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
            <MapPin size={12} className="text-gray-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-gray-600">
              {booking.origin_text}{booking.destination_text ? ` → ${booking.destination_text}` : ''}
            </p>
          </div>
        )}

        {/* Client */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400">Cliente</p>
            <p className="text-[13px] font-semibold text-gray-900">{booking.users?.full_name || '—'}</p>
            {booking.users?.phone && (
              <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                <Phone size={10} />{booking.users.phone}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400">Total</p>
            <p className="text-[15px] font-bold text-gray-900">{fmt(booking.total_amount)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {isPending && (
            <button
              onClick={() => onAccept(booking.id)}
              disabled={accepting === booking.id}
              className="flex-1 flex items-center justify-center gap-2 bg-brand text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60 hover:bg-orange-600 transition-colors"
            >
              {accepting === booking.id
                ? <RefreshCw size={14} className="animate-spin" />
                : <CheckCircle2 size={14} />}
              {accepting === booking.id ? 'Aceitando…' : 'Aceitar corrida'}
            </button>
          )}

          {isActive && (
            <>
              <a
                href={buildWhatsAppMsg(booking)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-[#25D366] text-white rounded-lg px-3 py-2.5 text-[12px] font-bold hover:bg-green-600 transition-colors"
              >
                <WhatsAppIcon /> WhatsApp
              </a>
              <button
                onClick={() => onComplete(booking.id)}
                disabled={completing === booking.id}
                className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60 hover:bg-gray-700 transition-colors"
              >
                {completing === booking.id
                  ? <RefreshCw size={14} className="animate-spin" />
                  : <CheckCircle2 size={14} />}
                {completing === booking.id ? 'Concluindo…' : 'Concluir serviço'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Reservas() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('pending')
  const [accepting, setAccepting] = useState(null)
  const [completing, setCompleting] = useState(null)
  const [error, setError] = useState(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['operator-bookings'],
    queryFn: () => api.getOperatorBookings(),
    refetchInterval: 30_000,
  })

  const pending = data?.pending || []
  const mine    = data?.mine    || []

  async function handleAccept(id) {
    setAccepting(id)
    setError(null)
    try {
      await api.acceptBooking(id)
      qc.invalidateQueries({ queryKey: ['operator-bookings'] })
    } catch (err) {
      setError(err.message || 'Erro ao aceitar reserva')
    } finally {
      setAccepting(null)
    }
  }

  async function handleComplete(id) {
    setCompleting(id)
    setError(null)
    try {
      await api.completeBooking(id)
      qc.invalidateQueries({ queryKey: ['operator-bookings'] })
    } catch (err) {
      setError(err.message || 'Erro ao concluir serviço')
    } finally {
      setCompleting(null)
    }
  }

  const TABS = [
    { id: 'pending', label: 'Novas', count: pending.length },
    { id: 'mine',    label: 'Em andamento', count: mine.length },
  ]

  const list = tab === 'pending' ? pending : mine

  if (isLoading) return <PageSpinner />

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Reservas</h1>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand transition-colors">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-brand text-white' : 'bg-gray-200 text-gray-600'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {list.length === 0 ? (
        <Card>
          <CardBody>
            <div className="text-center py-8">
              <Car size={32} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-500">
                {tab === 'pending' ? 'Nenhuma solicitação nova' : 'Nenhuma corrida em andamento'}
              </p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              onAccept={handleAccept}
              onComplete={handleComplete}
              accepting={accepting}
              completing={completing}
            />
          ))}
        </div>
      )}
    </div>
  )
}
