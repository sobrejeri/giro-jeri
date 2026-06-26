import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarCheck, Users, MapPin, Car, CheckCircle2,
  RefreshCw, AlertCircle, Zap, PhoneCall, MessageCircle,
  DollarSign, Clock, Hourglass, Pencil,
} from 'lucide-react'
import { api } from '../lib/api'
import Modal from '../components/ui/Modal'
import Input, { Textarea } from '../components/ui/Input'

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }

function timeAgo(isoDate) {
  const diff = Math.floor((Date.now() - new Date(isoDate)) / 1000)
  if (diff < 60)  return `${diff}s atrás`
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  return `${Math.floor(diff / 3600)}h atrás`
}

// Hora-alvo absoluta (ex.: "14:30") derivada de quote_expires_at, com o tempo
// restante como complemento — mesmo padrão usado no app turista.
function fmtAbsoluteTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch { return null }
}

function fmtRemaining(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `faltam ${h}h${String(m).padStart(2, '0')}min` : `faltam ${Math.max(m, 1)}min`
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

// ── Card de corrida disponível (normal OU translado personalizado) ────────
function PendingCard({ booking, onAccept, onOpenPricing, accepting }) {
  const type = booking.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const mode = booking.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'
  const isManualQuote = !!booking.is_manual_quote
  const targetTime  = fmtAbsoluteTime(booking.quote_expires_at)
  const remaining    = fmtRemaining(booking.quote_expires_at)
  const route = (booking.pickup_place_name || booking.origin_text)
    ? `${booking.pickup_place_name || booking.origin_text}${(booking.destination_place_name || booking.destination_text) ? ` → ${booking.destination_place_name || booking.destination_text}` : ''}`
    : null

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden ${isManualQuote ? 'border-blue-200' : 'border-brand/20'}`}>
      {/* Header urgência */}
      <div className={`px-4 py-2 flex items-center justify-between border-b ${isManualQuote ? 'bg-blue-50 border-blue-100' : 'bg-brand/5 border-brand/10'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isManualQuote ? 'bg-blue-500' : 'bg-brand'}`} />
          <span className={`text-[11px] font-bold uppercase tracking-wide ${isManualQuote ? 'text-blue-600' : 'text-brand'}`}>
            {isManualQuote ? 'Translado personalizado' : 'Nova solicitação'}
          </span>
        </div>
        <span className="text-[11px] text-gray-400">{timeAgo(booking.created_at)}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Tipo + modo */}
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand text-[11px] font-bold px-2 py-0.5 rounded-full">{type}</span>
          <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{mode}</span>
        </div>

        {/* Cliente */}
        {(booking.users?.full_name) && (
          <p className="text-[13px] font-semibold text-gray-900">{booking.users.full_name}</p>
        )}

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
          {route && (
            <div className="flex items-start gap-2 text-[13px] text-gray-700">
              <MapPin size={13} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="truncate">{route}</span>
            </div>
          )}
          {booking.luggage_count != null && (
            <div className="flex items-center gap-2 text-[13px] text-gray-700">
              <span className="text-gray-400 text-[11px] font-semibold uppercase tracking-wide">Bagagens</span>
              <span>{booking.luggage_count}</span>
            </div>
          )}
          {booking.special_notes && (
            <p className="text-[12px] text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2">“{booking.special_notes}”</p>
          )}
        </div>

        {isManualQuote ? (
          <>
            {/* Prazo de resposta */}
            {targetTime && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                <Hourglass size={13} className="text-amber-600 shrink-0" />
                <p className="text-[12px] text-amber-700 font-medium">
                  Responda até {targetTime}{remaining ? ` · ${remaining}` : ''}
                </p>
              </div>
            )}
            <button
              onClick={() => onOpenPricing(booking)}
              disabled={accepting}
              className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3 min-h-[44px] rounded-xl text-[14px] active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-brand/30"
            >
              <DollarSign size={16} /> Aceitar e precificar
            </button>
          </>
        ) : (
          <div className="flex items-center justify-between pt-1 border-t border-gray-100 gap-3">
            <div>
              <p className="text-[11px] text-gray-400">Valor da reserva</p>
              <p className="text-[20px] font-extrabold text-brand">{fmt(booking.total_amount)}</p>
            </div>
            <button
              onClick={() => onAccept(booking.id)}
              disabled={accepting}
              className="flex items-center gap-2 bg-brand text-white font-bold px-5 py-3 min-h-[44px] rounded-2xl text-[14px] active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-brand/30"
            >
              {accepting
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Aceitando…</>
                : <><Zap size={15} /> Aceitar</>}
            </button>
          </div>
        )}

        {!isManualQuote && (
          booking.status_commercial === 'awaiting_acceptance' ? (
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
              <AlertCircle size={11} className="shrink-0" /> O cliente paga depois que você aceitar.
            </p>
          ) : (
            <p className="text-[11px] text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 size={11} className="shrink-0" /> Pagamento já realizado pelo cliente.
            </p>
          )
        )}
      </div>
    </div>
  )
}

// ── Card de corrida aceita (minhas) ───────────────────────
function MyCard({ booking, onConfirm, onStart, onComplete, onOpenRepricing, busy }) {
  const type = booking.service_type === 'tour' ? 'Passeio' : 'Transfer'
  const mode = booking.booking_mode === 'private' ? 'Privativo' : 'Compartilhado'
  const clientPhone = booking.users?.phone
  const clientName  = booking.users?.full_name || 'Cliente'
  const waNumber    = clientPhone ? `55${clientPhone.replace(/\D/g, '')}` : null
  const isSending   = busy
  const isPaid      = booking.status_commercial === 'paid'
  const isManualQuote = !!booking.is_manual_quote
  const canReprice  = isManualQuote && booking.status_commercial === 'awaiting_payment'
  const targetTime  = fmtAbsoluteTime(booking.quote_expires_at)
  const remaining   = fmtRemaining(booking.quote_expires_at)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Status badge */}
      <div className={`px-4 py-2 flex items-center gap-2 border-b ${isPaid ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
        {isPaid
          ? <CheckCircle2 size={13} className="text-emerald-500" />
          : <Clock size={13} className="text-amber-500" />}
        <span className={`text-[11px] font-bold uppercase tracking-wide ${isPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
          {booking.status_operational === 'in_progress'
            ? 'Em andamento'
            : isPaid ? 'Aceita · paga' : 'Aguardando pagamento'}
        </span>
        <span className="ml-auto text-[11px] font-mono text-gray-400">{booking.booking_code}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Tipo */}
        <div className="flex items-center gap-2">
          <span className="bg-brand/10 text-brand text-[11px] font-bold px-2 py-0.5 rounded-full">{type}</span>
          <span className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{mode}</span>
          {isManualQuote && (
            <span className="bg-blue-50 text-blue-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">Personalizado</span>
          )}
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
          {booking.quote_notes && (
            <p className="text-[12px] text-gray-500 italic bg-gray-50 rounded-lg px-3 py-2">“{booking.quote_notes}”</p>
          )}
        </div>

        <div className="flex items-center justify-between text-[13px]">
          <span className="text-gray-400">Valor</span>
          <div className="flex items-center gap-2">
            <span className="font-bold text-brand">{fmt(booking.total_amount)}</span>
            {canReprice && (
              <button
                onClick={() => onOpenRepricing(booking)}
                className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg active:scale-95 transition-transform"
              >
                <Pencil size={11} /> Corrigir
              </button>
            )}
          </div>
        </div>

        {canReprice && targetTime && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            <Hourglass size={13} className="text-amber-600 shrink-0" />
            <p className="text-[12px] text-amber-700 font-medium">
              Cliente paga até {targetTime}{remaining ? ` · ${remaining}` : ''}
            </p>
          </div>
        )}

        {/* Ações da corrida */}
        <div className="pt-1 border-t border-gray-100 space-y-2">
          {!isPaid ? (
            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
              <div className="relative shrink-0">
                <div className="w-5 h-5 rounded-full bg-amber-300 animate-ping absolute inset-0 opacity-50" />
                <div className="relative w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                  <Clock size={11} className="text-white" />
                </div>
              </div>
              <p className="text-[12px] font-semibold text-amber-700">
                Aguardando o cliente pagar para liberar o atendimento.
              </p>
            </div>
          ) : booking.status_operational === 'in_progress' ? (
            <button
              onClick={() => onComplete(booking)}
              disabled={isSending}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white font-bold py-3 min-h-[44px] rounded-xl text-[14px] active:scale-95 transition-all disabled:opacity-60"
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
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold py-3 min-h-[44px] rounded-xl text-[14px] active:scale-95 transition-all disabled:opacity-60 shadow-md shadow-green-500/20"
              >
                {isSending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><MessageCircle size={16} /> Confirmar e enviar WhatsApp</>}
              </button>
              <button
                onClick={() => onStart(booking)}
                disabled={isSending}
                className="w-full flex items-center justify-center gap-2 bg-brand/10 hover:bg-brand/20 text-brand font-bold py-2.5 min-h-[44px] rounded-xl text-[13px] active:scale-95 transition-all disabled:opacity-60"
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

// ── Modal: aceitar e precificar / corrigir preço ──────────
function PricingModal({ open, booking, mode, onClose, onSubmit, loading, error }) {
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmStep, setConfirmStep] = useState(false)

  useEffect(() => {
    if (open && booking) {
      setPrice(booking.total_amount ? String(booking.total_amount) : '')
      setNotes(booking.quote_notes || '')
      setConfirmStep(false)
    }
  }, [open, booking])

  if (!booking) return null
  const priceNum = Number(price)
  const isValid  = price !== '' && !isNaN(priceNum) && priceNum > 0
  const route = (booking.pickup_place_name || booking.origin_text)
    ? `${booking.pickup_place_name || booking.origin_text}${(booking.destination_place_name || booking.destination_text) ? ` → ${booking.destination_place_name || booking.destination_text}` : ''}`
    : '—'

  function handleSubmit(e) {
    e.preventDefault()
    if (!isValid) return
    setConfirmStep(true)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'reprice' ? 'Corrigir valor da corrida' : 'Aceitar e precificar'}
      size="sm"
    >
      {!confirmStep ? (
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium text-gray-900">{booking.users?.full_name || 'Cliente'}</p>
            <p className="text-gray-500">{route}</p>
            <p className="text-gray-500">
              {booking.service_date}{booking.service_time ? ` ${booking.service_time.slice(0, 5)}` : ''} · {booking.people_count} pax
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Valor da corrida (R$)"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              placeholder="0,00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              autoFocus
            />
            <Textarea
              label="Observações para o cliente (opcional)"
              rows={2}
              placeholder="Inclui bagagem, ar-condicionado…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {!isValid && (
              <p className="text-[12px] text-gray-400">Informe o valor para aceitar</p>
            )}
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={!isValid}
              className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold py-3 min-h-[44px] rounded-xl text-[14px] active:scale-95 transition-all disabled:opacity-40"
            >
              <DollarSign size={16} /> {mode === 'reprice' ? 'Revisar correção' : 'Revisar e confirmar'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
            <p className="text-[12px] text-blue-600 font-semibold uppercase tracking-wide mb-1">
              {mode === 'reprice' ? 'Novo valor' : 'Valor a enviar ao cliente'}
            </p>
            <p className="text-[28px] font-extrabold text-blue-700">{fmt(priceNum)}</p>
            {notes && <p className="text-[12px] text-blue-500 italic mt-2">“{notes}”</p>}
          </div>
          <p className="text-[12px] text-gray-500 text-center">
            {mode === 'reprice'
              ? 'O cliente verá o novo valor. Confirma a correção?'
              : 'Ao confirmar, você assume esta corrida e o cliente poderá pagar este valor.'}
          </p>
          {error && <p className="text-[12px] text-red-500 text-center">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmStep(false)}
              className="flex-1 min-h-[44px] border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
            >
              Voltar
            </button>
            <button
              onClick={() => onSubmit({ quoted_price: priceNum, quote_notes: notes || null })}
              disabled={loading}
              className="flex-1 min-h-[44px] bg-brand text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <CheckCircle2 size={16} />}
              {mode === 'reprice' ? 'Confirmar correção' : 'Confirmar aceite'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Página principal ──────────────────────────────────────
export default function Reservas() {
  const [tab,       setTab]      = useState('pending')
  const [toast,     setToast]    = useState(null)
  const [accepting, setAccepting]= useState(null)
  const [confirming,setConfirming]= useState(null)
  const [pricingModal, setPricingModal] = useState(null) // { booking, mode: 'accept' | 'reprice' }
  const queryClient = useQueryClient()

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey:        ['operator-bookings'],
    queryFn:         () => api.getOperatorBookings(),
    refetchInterval: 6000,
    staleTime:       3000,
  })

  const pending = data?.pending || []
  const mine    = data?.mine    || []

  const acceptMut = useMutation({
    mutationFn: ({ id, body }) => api.acceptBooking(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })
      setPricingModal(null)
      setToast({ message: 'Reserva aceita! Aguardando o cliente pagar.', type: 'success' })
      setTab('mine')
    },
    onError: (err) => setToast({ message: err.message || 'Erro ao aceitar corrida', type: 'error' }),
  })

  function openPricingModal(booking) { setPricingModal({ booking, mode: 'accept' }) }
  function openRepricingModal(booking) { setPricingModal({ booking, mode: 'reprice' }) }

  function submitPricing(body) {
    if (!pricingModal) return
    acceptMut.mutate({ id: pricingModal.booking.id, body })
  }

  async function handleAccept(bookingId) {
    if (accepting) return
    setAccepting(bookingId)
    try {
      await api.acceptBooking(bookingId)
      queryClient.invalidateQueries({ queryKey: ['operator-bookings'] })
      setToast({ message: 'Reserva aceita! Aguardando o cliente pagar.', type: 'success' })
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
            {pending.length === 0
              ? 'Nenhuma solicitação no momento'
              : `${pending.length} corrida${pending.length > 1 ? 's' : ''} disponível${pending.length > 1 ? 'is' : ''}`}
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
          { key: 'pending', label: 'Disponíveis',     count: pending.length },
          { key: 'mine',    label: 'Minhas corridas', count: mine.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1 min-h-[44px] rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
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
                onOpenPricing={openPricingModal}
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
                onConfirm={handleConfirm}
                onStart={handleStart}
                onComplete={handleComplete}
                onOpenRepricing={openRepricingModal}
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

      {/* Modal: aceitar e precificar / corrigir preço (translado personalizado) */}
      <PricingModal
        open={!!pricingModal}
        booking={pricingModal?.booking}
        mode={pricingModal?.mode}
        onClose={() => { setPricingModal(null); acceptMut.reset() }}
        onSubmit={submitPricing}
        loading={acceptMut.isPending}
        error={acceptMut.error?.message}
      />
    </div>
  )
}
