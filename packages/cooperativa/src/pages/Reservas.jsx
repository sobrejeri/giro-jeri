import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarCheck, Clock, Users, MapPin, Car, CheckCircle2,
  RefreshCw, AlertCircle, ChevronRight, Zap, PhoneCall,
} from 'lucide-react'
import { api } from '../lib/api'

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }

function timeAgo(isoDate) {
  const diff = Math.floor((Date.now() - new Date(isoDate)) / 1000)
  if (diff < 60)  return `${diff}s atrás`
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  return `${Math.floor(diff / 3600)}h atrás`
}

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2.546 20.2A1 1 0 0 0 3.8 21.454l3.032-.892A9.957 9.957 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.966 7.966 0 0 1-4.229-1.206l-.294-.18-2.456.722.722-2.456-.18-.294A7.966 7.966 0 0 1 4.357 12c0-4.271 3.372-7.643 7.643-7.643S19.643 7.729 19.643 12 16.271 19.643 12 19.643z" />
    </svg>
  )
}

function buildWhatsAppMsg(b) {
  const clientName = b.users?.full_name || 'Cliente'
  const type = b.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const mode = b.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'
  const date = b.service_date
    ? new Date(b.service_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'
  const time = b.service_time ? b.service_time.slice(0, 5) : '—'

  let msg = `Olá ${clientName}! 👋\n\n`
  msg += `Sou da cooperativa que aceitou sua reserva na Giro Jeri.\n\n`
  msg += `📋 *Detalhes da reserva*\n`
  msg += `Código: ${b.booking_code}\n`
  msg += `Serviço: ${type} ${mode}\n`
  msg += `Data: ${date} às ${time}\n`
  msg += `Pessoas: ${b.people_count}\n`
  if (b.origin_text)      msg += `Origem: ${b.origin_text}\n`
  if (b.destination_text) msg += `Destino: ${b.destination_text}\n`
  msg += `Valor: ${fmt(b.total_amount)}\n\n`
  msg += `Vou entrar em contato para alinhar os detalhes. Qualquer dúvida, estou à disposição! 😊`

  return encodeURIComponent(msg)
}

// ── Toast simples ─────────────────────────────────────────
function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const bg = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-emerald-500' : 'bg-gray-800'

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ${bg} text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 max-w-xs text-center`}>
      {type === 'error' && <AlertCircle size={15} className="shrink-0" />}
      {type === 'success' && <CheckCircle2 size={15} className="shrink-0" />}
      {message}
    </div>
  )
}

// ── Card de corrida disponível ────────────────────────────
function PendingCard({ booking, onAccept, accepting }) {
  const type = booking.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const mode = booking.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'

  return (
    <div className="bg-white rounded-2xl border-2 border-brand/20 shadow-sm overflow-hidden">
      {/* Header urgência */}
      <div className="bg-brand/5 px-4 py-2 flex items-center justify-between border-b border-brand/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span className="text-[11px] font-bold text-brand uppercase tracking-wide">Nova solicitação</span>
        </div>
        <span className="text-[11px] text-gray-400">{timeAgo(booking.created_at)}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Tipo + modo */}
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand text-[11px] font-bold px-2 py-0.5 rounded-full">{type}</span>
          <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{mode}</span>
        </div>

        {/* Detalhes */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[13px] text-gray-700">
            <CalendarCheck size={13} className="text-gray-400 shrink-0" />
            <span className="font-semibold">
              {booking.service_date
                ? new Date(booking.service_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—'}
              {booking.service_time ? ` às ${booking.service_time.slice(0, 5)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-gray-700">
            <Users size={13} className="text-gray-400 shrink-0" />
            <span>{booking.people_count} {booking.people_count === 1 ? 'pessoa' : 'pessoas'}</span>
          </div>
          {booking.origin_text && (
            <div className="flex items-start gap-2 text-[13px] text-gray-700">
              <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="truncate">
                {booking.origin_text}
                {booking.destination_text ? ` → ${booking.destination_text}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Valor + botão */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100 gap-3">
          <div>
            <p className="text-[11px] text-gray-400">Valor da corrida</p>
            <p className="text-[20px] font-extrabold text-brand">{fmt(booking.total_amount)}</p>
          </div>
          <button
            onClick={() => onAccept(booking.id)}
            disabled={accepting}
            className="flex items-center gap-2 bg-brand text-white font-bold px-5 py-3 rounded-2xl text-[14px] active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-brand/30"
          >
            {accepting
              ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Aceitando…</>
              : <><Zap size={15} /> Aceitar</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Card de corrida aceita (minhas) ───────────────────────
function MyCard({ booking, onComplete, completing }) {
  const type = booking.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const mode = booking.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'
  const clientPhone = booking.users?.phone
  const clientName  = booking.users?.full_name || 'Cliente'

  const waNumber = clientPhone
    ? `55${clientPhone.replace(/\D/g, '')}`
    : null

  const isCompleting = completing === booking.id

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Status badge */}
      <div className="bg-emerald-50 px-4 py-2 flex items-center gap-2 border-b border-emerald-100">
        <CheckCircle2 size={13} className="text-emerald-500" />
        <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
          {booking.status_operational === 'in_progress' ? 'Em andamento' : 'Aceita'}
        </span>
        <span className="ml-auto text-[11px] font-mono text-gray-400">{booking.booking_code}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Tipo */}
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand text-[11px] font-bold px-2 py-0.5 rounded-full">{type}</span>
          <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{mode}</span>
        </div>

        {/* Cliente */}
        <div className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-gray-400">Cliente</p>
            <p className="text-[14px] font-bold text-gray-900">{clientName}</p>
            {clientPhone && <p className="text-[12px] text-gray-500">{clientPhone}</p>}
          </div>
          {clientPhone && (
            <a
              href={`tel:${clientPhone.replace(/\D/g, '')}`}
              className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 active:scale-95 transition-transform"
            >
              <PhoneCall size={16} />
            </a>
          )}
        </div>

        {/* Detalhes */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[13px] text-gray-700">
            <CalendarCheck size={13} className="text-gray-400 shrink-0" />
            <span className="font-semibold">
              {booking.service_date
                ? new Date(booking.service_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—'}
              {booking.service_time ? ` às ${booking.service_time.slice(0, 5)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-gray-700">
            <Users size={13} className="text-gray-400 shrink-0" />
            <span>{booking.people_count} {booking.people_count === 1 ? 'pessoa' : 'pessoas'}</span>
          </div>
          {booking.origin_text && (
            <div className="flex items-start gap-2 text-[13px] text-gray-700">
              <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
              <span>{booking.origin_text}{booking.destination_text ? ` → ${booking.destination_text}` : ''}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[13px]">
          <span className="text-gray-400">Valor</span>
          <span className="font-bold text-brand">{fmt(booking.total_amount)}</span>
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          {waNumber && (
            <a
              href={`https://wa.me/${waNumber}?text=${buildWhatsAppMsg(booking)}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold py-2.5 rounded-xl text-[13px] active:scale-95 transition-transform"
            >
              <WhatsAppIcon /> WhatsApp
            </a>
          )}
          <button
            onClick={() => onComplete(booking.id)}
            disabled={isCompleting}
            className="flex-1 flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-[13px] active:scale-95 transition-transform disabled:opacity-60"
          >
            {isCompleting
              ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <><Car size={14} /> Concluir</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────
export default function Reservas() {
  const [tab,       setTab]       = useState('pending')
  const [toast,     setToast]     = useState(null)
  const [accepting, setAccepting] = useState(null)
  const [completing,setCompleting]= useState(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:        ['operator-bookings'],
    queryFn:         () => api.getOperatorBookings(),
    refetchInterval: 6000,
    staleTime:       3000,
  })

  const pending = data?.pending || []
  const mine    = data?.mine    || []

  async function handleAccept(bookingId) {
    if (accepting) return
    setAccepting(bookingId)
    try {
      await api.acceptBooking(bookingId)
      queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })
      setToast({ message: 'Corrida aceita! Entre em contato com o cliente.', type: 'success' })
      setTab('mine')
    } catch (err) {
      if (err.message?.includes('já foi aceita')) {
        queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })
        setToast({ message: 'Alguém aceitou essa corrida antes de você', type: 'error' })
      } else {
        setToast({ message: err.message || 'Erro ao aceitar corrida', type: 'error' })
      }
    } finally {
      setAccepting(null)
    }
  }

  async function handleComplete(bookingId) {
    if (completing) return
    setCompleting(bookingId)
    try {
      await api.completeBooking(bookingId)
      queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })
      setToast({ message: 'Corrida concluída!', type: 'success' })
    } catch (err) {
      setToast({ message: err.message || 'Erro ao concluir', type: 'error' })
    } finally {
      setCompleting(null)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Corridas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {pending.length > 0
              ? `${pending.length} nova${pending.length > 1 ? 's' : ''} solicitaç${pending.length > 1 ? 'ões' : 'ão'} disponível${pending.length > 1 ? 'is' : ''}`
              : 'Nenhuma solicitação no momento'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors active:scale-95"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {[
          { key: 'pending', label: 'Disponíveis', count: pending.length },
          { key: 'mine',    label: 'Minhas corridas', count: mine.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.key
                  ? t.key === 'pending' ? 'bg-brand text-white' : 'bg-emerald-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw size={24} className="animate-spin" />
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarCheck size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Sem solicitações disponíveis</p>
            <p className="text-xs mt-1">Novas corridas aparecerão aqui automaticamente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((b) => (
              <PendingCard
                key={b.id}
                booking={b}
                onAccept={handleAccept}
                accepting={accepting === b.id}
              />
            ))}
          </div>
        )
      ) : (
        mine.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Car size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma corrida ativa</p>
            <p className="text-xs mt-1">As corridas que você aceitar aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-4">
            {mine.map((b) => (
              <MyCard
                key={b.id}
                booking={b}
                onComplete={handleComplete}
                completing={completing}
              />
            ))}
          </div>
        )
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
