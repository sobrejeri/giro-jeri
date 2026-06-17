import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarCheck, Users, MapPin, Car, CheckCircle2,
  RefreshCw, AlertCircle, Zap, PhoneCall, MessageCircle,
  DollarSign, Send,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { api } from '../lib/api'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }

function fmtQuoteDate(s) {
  try { return format(parseISO(s), "dd/MM 'às' HH:mm", { locale: ptBR }) } catch { return s }
}

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

function buildConfirmMsg(b) {
  const name = b.users?.full_name?.split(' ')[0] || 'Cliente'
  const type = b.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const mode = b.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'
  const date = b.service_date
    ? new Date(b.service_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'
  const time  = b.service_time ? b.service_time.slice(0, 5) : '—'
  const local = b.origin_text || b.pickup_place_name || ''
  const dest  = b.destination_text || b.destination_place_name || ''

  const lines = [
    `🌴 *Olá, ${name}! Sua reserva foi confirmada!*`,
    ``,
    `📋 *Código:* ${b.booking_code}`,
    `🚗 *Serviço:* ${type} ${mode}`,
    `📅 *Data:* ${date} às ${time}`,
    `👥 *Pessoas:* ${b.people_count}`,
    local ? `📍 *Embarque:* ${local}` : null,
    dest  ? `🏁 *Destino:* ${dest}`  : null,
    `💰 *Valor:* ${fmt(b.total_amount)} ✅ PAGO`,
    ``,
    `Em breve enviaremos os dados do veículo e motorista. Qualquer dúvida estamos à disposição! 😊`,
    `_Giro Jeri — Passeios & Transfers_`,
  ].filter(Boolean).join('\n')

  return encodeURIComponent(lines)
}

function buildWhatsAppMsg(b) {
  return buildConfirmMsg(b)
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
function MyCard({ booking, onConfirm, onStart, onComplete, busy }) {
  const type = booking.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const mode = booking.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'
  const clientPhone = booking.users?.phone
  const clientName  = booking.users?.full_name || 'Cliente'
  const waNumber    = clientPhone ? `55${clientPhone.replace(/\D/g, '')}` : null
  const isSending   = busy

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
          {(booking.origin_text || booking.pickup_place_name) && (
            <div className="flex items-start gap-2 text-[13px] text-gray-700">
              <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
              <span>
                {booking.origin_text || booking.pickup_place_name}
                {(booking.destination_text || booking.destination_place_name)
                  ? ` → ${booking.destination_text || booking.destination_place_name}` : ''}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[13px]">
          <span className="text-gray-400">Valor</span>
          <span className="font-bold text-brand">{fmt(booking.total_amount)}</span>
        </div>

        {/* Ações da corrida */}
        <div className="pt-1 border-t border-gray-100 space-y-2">
          {booking.status_operational === 'in_progress' ? (
            <button
              onClick={() => onComplete(booking)}
              disabled={isSending}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl text-[14px] active:scale-95 transition-all disabled:opacity-60"
            >
              {isSending
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><CheckCircle2 size={16} /> Concluir corrida</>}
            </button>
          ) : (
            <>
              <button
                onClick={() => onConfirm(booking)}
                disabled={isSending}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold py-3 rounded-xl text-[14px] active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-green-500/20"
              >
                {isSending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><MessageCircle size={16} /> Confirmar e enviar WhatsApp</>}
              </button>
              <button
                onClick={() => onStart(booking)}
                disabled={isSending}
                className="w-full flex items-center justify-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand font-bold py-2.5 rounded-xl text-[13px] active:scale-95 transition-all disabled:opacity-60"
              >
                <Zap size={15} /> Iniciar corrida
              </button>
              {!waNumber && (
                <p className="text-[11px] text-center text-gray-400">
                  Cliente sem WhatsApp cadastrado — a reserva será enviada para despacho mesmo assim
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Card de cotação (rota personalizada) ──────────────────
function QuoteRequestCard({ quote, onQuote }) {
  const name   = quote.client_name || quote.users?.full_name || quote.user_name || 'Cliente'
  const origin = quote.origin_place_name || quote.origin_description || '—'
  const dest   = quote.destination_place_name || quote.destination_description || '—'
  const notes  = quote.special_notes || quote.client_notes
  const ppl    = quote.people_count || quote.passengers
  const isQuoted = quote.status === 'quoted'

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${isQuoted ? 'border-blue-100' : 'border-brand/20'}`}>
      <div className={`px-4 py-2 flex items-center justify-between border-b ${isQuoted ? 'bg-blue-50 border-blue-100' : 'bg-brand/5 border-brand/10'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isQuoted ? 'bg-blue-400' : 'bg-brand animate-pulse'}`} />
          <span className={`text-[11px] font-bold uppercase tracking-wide ${isQuoted ? 'text-blue-600' : 'text-brand'}`}>
            {isQuoted ? 'Aguardando cliente' : 'Nova cotação'}
          </span>
        </div>
        <span className="text-[11px] text-gray-400">{timeAgo(quote.created_at)}</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand text-[11px] font-bold px-2 py-0.5 rounded-full">Transfer</span>
          <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">Rota personalizada</span>
        </div>

        <div className="bg-gray-50 rounded-xl px-3 py-2">
          <p className="text-[11px] text-gray-400">Cliente</p>
          <p className="text-[14px] font-bold text-gray-900">{name}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-start gap-2 text-[13px] text-gray-700">
            <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
            <span>{origin} → {dest}</span>
          </div>
          <div className="flex items-center gap-4 text-[13px] text-gray-700">
            <span className="flex items-center gap-1.5">
              <CalendarCheck size={13} className="text-gray-400" />
              {quote.service_date}{quote.service_time ? ` ${quote.service_time.slice(0, 5)}` : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Users size={13} className="text-gray-400" />
              {ppl} pax
            </span>
          </div>
        </div>

        {notes && (
          <p className="text-[12px] text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2">“{notes}”</p>
        )}

        <div className="pt-1 border-t border-gray-100">
          {isQuoted ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-gray-400">Valor enviado</p>
                <p className="text-[18px] font-extrabold text-blue-600">{fmt(quote.quoted_price)}</p>
              </div>
              {quote.expires_at && (
                <div className="text-right text-[11px] text-gray-400">
                  <p>Expira</p>
                  <p>{fmtQuoteDate(quote.expires_at)}</p>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => onQuote(quote)}
              className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3 rounded-xl text-[14px] active:scale-95 transition-all shadow-md shadow-brand/30"
            >
              <DollarSign size={16} /> Enviar valor da corrida
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────
export default function Reservas() {
  const [tab,        setTab]       = useState('pending')
  const [toast,      setToast]     = useState(null)
  const [accepting,  setAccepting] = useState(null)
  const [confirming, setConfirming]= useState(null)
  const [quoteModal, setQuoteModal]= useState(null)
  const [price,      setPrice]     = useState('')
  const [notes,      setNotes]     = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:        ['operator-bookings'],
    queryFn:         () => api.getOperatorBookings(),
    refetchInterval: 6000,
    staleTime:       3000,
  })

  // Cotações de rota personalizada (mesma tela das corridas) —
  // a view v_quotes_dashboard já traz todas as cotações ativas (não pagas/canceladas)
  const { data: pendingQuotesRaw } = useQuery({
    queryKey:        ['quotes-pending'],
    queryFn:         () => api.getPendingQuotes(),
    refetchInterval: 20000,
  })

  const pending = data?.pending || []
  const mine    = data?.mine    || []
  const allQuotes     = Array.isArray(pendingQuotesRaw) ? pendingQuotesRaw : (pendingQuotesRaw?.data || [])
  const pendingQuotes = allQuotes.filter((q) => q.status === 'pending_quote')
  const quotedQuotes  = allQuotes.filter((q) => q.status === 'quoted')

  const setQuoteMut = useMutation({
    mutationFn: ({ id, quoted_price, quote_notes }) =>
      api.setQuotePrice(id, { quoted_price: Number(quoted_price), quote_notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes-pending'] })
      setQuoteModal(null); setPrice(''); setNotes('')
      setToast({ message: 'Cotação enviada ao cliente!', type: 'success' })
    },
    onError: (err) => setToast({ message: err.message || 'Erro ao enviar cotação', type: 'error' }),
  })

  function openQuoteModal(quote) { setQuoteModal(quote); setPrice(''); setNotes('') }

  function submitQuote(e) {
    e.preventDefault()
    if (!price || isNaN(Number(price)) || Number(price) <= 0) return
    setQuoteMut.mutate({ id: quoteModal.id, quoted_price: price, quote_notes: notes })
  }

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

  async function handleConfirm(booking) {
    if (confirming) return
    setConfirming(booking.id)
    try {
      // 1. Muda status para aguardar despacho
      await api.confirmBooking(booking.id)
      queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })

      // 2. Abre WhatsApp com os dados da reserva (se cliente tem telefone)
      const phone = booking.users?.phone
      if (phone) {
        const intl = `55${phone.replace(/\D/g, '')}`
        window.open(`https://wa.me/${intl}?text=${buildConfirmMsg(booking)}`, '_blank')
      }

      setToast({ message: 'Reserva enviada para despacho! WhatsApp aberto.', type: 'success' })
    } catch (err) {
      setToast({ message: err.message || 'Erro ao confirmar', type: 'error' })
    } finally {
      setConfirming(null)
    }
  }

  async function handleStart(booking) {
    if (confirming) return
    setConfirming(booking.id)
    try {
      await api.startBooking(booking.id)
      queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })
      setToast({ message: 'Corrida iniciada!', type: 'success' })
    } catch (err) {
      setToast({ message: err.message || 'Erro ao iniciar corrida', type: 'error' })
    } finally {
      setConfirming(null)
    }
  }

  async function handleComplete(booking) {
    if (confirming) return
    setConfirming(booking.id)
    try {
      await api.completeBooking(booking.id)
      queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })
      setToast({ message: 'Corrida concluída! 🎉', type: 'success' })
    } catch (err) {
      setToast({ message: err.message || 'Erro ao concluir corrida', type: 'error' })
    } finally {
      setConfirming(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Corridas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {pending.length === 0 && pendingQuotes.length === 0
              ? 'Nenhuma solicitação no momento'
              : [
                  pending.length > 0 ? `${pending.length} corrida${pending.length > 1 ? 's' : ''} disponível${pending.length > 1 ? 'is' : ''}` : null,
                  pendingQuotes.length > 0 ? `${pendingQuotes.length} cotaç${pendingQuotes.length > 1 ? 'ões' : 'ão'} a responder` : null,
                ].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          onClick={() => {
            refetch()
            queryClient.invalidateQueries({ queryKey: ['quotes-pending'] })
          }}
          disabled={isFetching}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors active:scale-95"
        >
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {[
          { key: 'pending',  label: 'Disponíveis',     short: 'Disponíveis', count: pending.length },
          { key: 'cotacoes', label: 'Cotações',        short: 'Cotações',    count: pendingQuotes.length },
          { key: 'mine',     label: 'Minhas corridas', short: 'Minhas',      count: mine.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
            {t.count > 0 && (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.key
                  ? t.key === 'mine' ? 'bg-emerald-500 text-white' : 'bg-brand text-white'
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
      ) : tab === 'cotacoes' ? (
        pendingQuotes.length === 0 && quotedQuotes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma cotação no momento</p>
            <p className="text-xs mt-1">Pedidos de corrida com rota personalizada aparecerão aqui</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingQuotes.map((q) => (
              <QuoteRequestCard key={q.id} quote={q} onQuote={openQuoteModal} />
            ))}
            {quotedQuotes.length > 0 && (
              <>
                <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide pt-2">
                  Aguardando resposta do cliente
                </p>
                {quotedQuotes.map((q) => (
                  <QuoteRequestCard key={q.id} quote={q} onQuote={openQuoteModal} />
                ))}
              </>
            )}
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
                onConfirm={handleConfirm}
                onStart={handleStart}
                onComplete={handleComplete}
                busy={confirming === b.id}
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

      {/* Modal: definir valor da cotação */}
      <Modal open={!!quoteModal} onClose={() => setQuoteModal(null)} title="Definir valor da corrida" size="sm">
        {quoteModal && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium text-gray-900">
                {quoteModal.client_name || quoteModal.users?.full_name || quoteModal.user_name || 'Cliente'}
              </p>
              <p className="text-gray-500">
                {(quoteModal.origin_place_name || quoteModal.origin_description)} → {(quoteModal.destination_place_name || quoteModal.destination_description)}
              </p>
              <p className="text-gray-500">
                {quoteModal.service_date}{quoteModal.service_time ? ` ${quoteModal.service_time.slice(0, 5)}` : ''} · {quoteModal.people_count || quoteModal.passengers} pax
              </p>
            </div>

            <form onSubmit={submitQuote} className="space-y-3">
              <Input
                label="Valor da corrida (R$)"
                type="number"
                min="1"
                step="0.01"
                placeholder="0,00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                autoFocus
              />
              <Textarea
                label="Observações para o cliente"
                rows={2}
                placeholder="Inclui bagagem, ar-condicionado…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button
                type="submit"
                disabled={setQuoteMut.isPending}
                className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3 rounded-xl text-[14px] active:scale-95 transition-all disabled:opacity-60"
              >
                <Send size={16} /> {setQuoteMut.isPending ? 'Enviando…' : 'Enviar cotação ao cliente'}
              </button>
            </form>
          </div>
        )}
      </Modal>
    </div>
  )
}
