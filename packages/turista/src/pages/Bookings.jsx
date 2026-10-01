import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { resolveStatusReserva, rotuloDoTotal } from '../lib/statusReserva'
import ReviewSheet from '../components/ReviewSheet'
import { PageSpinner } from '../components/ui/Spinner'
import {
  Calendar, Clock, Users, Car, Search, Compass, MapPin,
  Star, RefreshCw, AlertTriangle, Loader2, Zap, Sun, Waves, Anchor,
  ChevronLeft, ChevronRight, CalendarCheck, Check, X, MessageSquare, Package,
  CheckCircle2, XCircle, ParkingSquare, KeyRound, LogIn,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Status helpers ─────────────────────────────────────────── */
// A regra vive em lib/statusReserva.js e é COMPARTILHADA com o detalhe da
// reserva. Havia duas cópias, elas divergiram, e uma reserva com pagamento
// recusado aparecia "Confirmado · Total pago" aqui e "Aguardando pagamento" lá.
const resolveStatus = resolveStatusReserva

function getStatusCfg(t) {
  return {
    waiting_payment:    { label: t('bookings.status.waiting_payment'),    bg: 'bg-amber-500',  text: 'text-white' },
    waiting_acceptance: { label: t('bookings.status.waiting_acceptance'), bg: 'bg-orange-400', text: 'text-white' },
    confirmed:          { label: t('bookings.status.confirmed'),          bg: 'bg-green-500',  text: 'text-white' },
    in_progress:        { label: t('bookings.status.in_progress'),        bg: 'bg-blue-500',   text: 'text-white' },
    completed:          { label: t('bookings.status.completed'),          bg: 'bg-gray-500',   text: 'text-white' },
    cancelled:          { label: t('bookings.status.cancelled'),          bg: 'bg-red-500',    text: 'text-white' },
    expired:            { label: 'Expirada',                              bg: 'bg-gray-400',   text: 'text-white' },
  }
}

// Pode avaliar? Espelha a regra do backend: reserva PAGA e já realizada
// (concluída pela coop OU com a data do serviço já passada).
function canReview(b) {
  const paid = b.status_commercial === 'paid'
  if (!paid) return false
  if (b.status_operational === 'completed') return true
  if (!b.service_date) return false
  const today = new Date().toISOString().slice(0, 10)
  return b.service_date <= today
}

const ACTIVE_STATUSES = ['waiting_payment', 'waiting_acceptance', 'confirmed', 'in_progress']
// Cotações "ativas" (entram nas abas Todas/Ativas junto das reservas)
const QUOTE_ACTIVE = ['pending_quote', 'quoted', 'accepted']

const GRADIENTS = [
  ['from-orange-400', 'to-amber-300'],
  ['from-sky-400',    'to-blue-300'],
  ['from-teal-400',   'to-emerald-300'],
  ['from-violet-400', 'to-purple-300'],
]
const ICONS = [Zap, Sun, Waves, Anchor]

function gi(id = '') { let n = 0; for (const c of id) n += c.charCodeAt(0); return n % GRADIENTS.length }
function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR')}` }

/* ── Overlay ────────────────────────────────────────────────────
 * Portal para o <body> + trava do scroll da página de trás.
 *
 * Sem o portal, um ancestral com transform/filter (o wrapper do app tem) vira
 * o bloco de contenção do `position: fixed` — o painel ia parar abaixo da
 * dobra e só o desfoque aparecia, dando a impressão de que o toque falhou.
 * A trava do scroll evita que a lista atrás role junto e leve o painel embora.
 */
function Overlay({ children }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return createPortal(children, document.body)
}

/* ── Cancel Dialog ──────────────────────────────────────────── */
function CancelDialog({ booking, onConfirm, onClose, loading, error }) {
  const { t } = useTranslation()
  return (
    <Overlay>
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg text-center mb-2">{t('bookings.cancel')}</h3>
        <p className="text-sm text-gray-500 text-center mb-1">
          {booking.booking_code}
        </p>
        <p className="text-xs text-gray-400 text-center mb-4">{t('bookings.cancelConfirm')}</p>
        {error && (
          <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center mb-4">{error}</p>
        )}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 h-12 border-2 border-gray-200 rounded-2xl text-sm font-bold text-gray-600 active:scale-95 transition-transform"
          >{t('bookings.cancelClose')}</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 h-12 bg-red-500 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" />{t('bookings.cancelling')}</> : t('bookings.cancelBtn')}
          </button>
        </div>
      </div>
    </div>
    </Overlay>
  )
}

/* ── Booking Card ───────────────────────────────────────────── */
function BookingCard({ booking, onCancel, onDetail, onPay, onReview, reviewed = false, groupSize = 0, noStretch = false }) {
  const { t } = useTranslation()
  const STATUS_CFG = getStatusCfg(t)
  const status  = resolveStatus(booking)
  const cfg     = STATUS_CFG[status] || STATUS_CFG.waiting_payment
  const idx     = gi(booking.id)
  const [from, to] = GRADIENTS[idx]
  const Icon    = ICONS[idx]
  const isTour  = booking.service_type === 'tour'

  let dateStr = '—'
  if (booking.service_date) {
    try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
  }
  const timeStr = booking.service_time ? booking.service_time.slice(0, 5) : '—'
  const route   = booking.pickup_place_name && booking.destination_place_name
    ? `${booking.pickup_place_name} → ${booking.destination_place_name}`
    : booking.pickup_place_name || null

  // Nome real do serviço quando o backend consegue resolvê-lo; o código da
  // reserva vira a linha de apoio (identifica sem roubar o lugar do nome).
  const serviceName = booking.service_name || (isTour ? 'Passeio' : 'Transfer')

  return (
    <div onClick={() => onDetail?.(booking.id)} className={`bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-transform cursor-pointer flex flex-col ${noStretch ? '' : 'h-full'}`}>
      {/* ── Hero ── */}
      <div className="relative h-[120px]">
        {booking.cover_image_url ? (
          <img src={booking.cover_image_url} alt={serviceName} className="w-full h-full object-cover" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${from} ${to} flex items-center justify-center`}>
            <Icon size={44} className="text-white/20" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* type badge */}
        <div className="absolute top-3 left-3">
          <span className="flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            {isTour ? <Compass size={10} /> : <Car size={10} />}
            {isTour ? t('checkout.tour') : t('checkout.transfer')}
          </span>
        </div>

        {/* status badge */}
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
        </div>

        {/* name + código */}
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white font-bold text-[16px] leading-tight drop-shadow truncate">
            {serviceName}
          </p>
          <p className="text-white/75 text-[11px] font-semibold leading-none mt-1 drop-shadow truncate">
            {booking.booking_code}
          </p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pt-3 pb-4 flex-1 flex flex-col gap-3">
        {/* Selo de pedido (carrinho): deixa claro que faz parte de um grupo */}
        {groupSize >= 2 && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand bg-brand/5 rounded-lg px-2.5 py-1.5">
            <Package size={12} className="shrink-0" />
            Faz parte de um pedido com {groupSize} serviços — dá pra pagar todos juntos.
          </div>
        )}

        {/* Date / Time / People */}
        <div className="flex items-center gap-4">
          {[
            { Icon: Calendar, label: t('checkout.date'),    val: dateStr },
            { Icon: Clock,    label: t('checkout.time'),    val: timeStr },
            { Icon: Users,    label: t('checkout.people'),  val: String(booking.people_count || '—') },
          ].map(({ Icon: I, label, val }) => (
            <div key={label} className="flex items-center gap-1.5">
              <I size={13} className="text-brand shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 leading-none">{label}</p>
                <p className="text-[12px] font-semibold text-gray-900 leading-none mt-0.5">{val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Route */}
        {route && (
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <MapPin size={12} className="text-brand shrink-0" />
            <p className="text-[12px] text-gray-600 truncate">{route}</p>
          </div>
        )}

        {/* Total + actions */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-0.5">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">
              {rotuloDoTotal(status, booking)}
            </p>
            <p className="text-[15px] font-bold text-gray-900 leading-none mt-0.5">{fmt(booking.total_amount)}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            {status === 'waiting_payment' && (
              <button
                onClick={(e) => { e.stopPropagation(); onPay?.(booking) }}
                className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                Pagar agora
              </button>
            )}
            {['waiting_payment', 'waiting_acceptance', 'confirmed'].includes(status) && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel?.(booking) }}
                className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
              >
                <X size={11} /> Cancelar
              </button>
            )}
            {canReview(booking) && (
              reviewed ? (
                <span className="flex items-center gap-1 text-[12px] font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl">
                  <Star size={11} className="fill-emerald-500 text-emerald-500" /> Avaliado
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onReview?.(booking) }}
                  className="flex items-center gap-1 border border-amber-200 bg-amber-50 text-amber-600 text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
                >
                  <Star size={11} className="fill-amber-400 text-amber-400" /> Avaliar
                </button>
              )
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Ícone de status por serviço (perna) — em frente ao nome ───── */
const SERVICE_STATUS = {
  waiting_acceptance: { Icon: Clock,        color: 'text-amber-500',   label: 'Aguardando' },
  waiting_payment:    { Icon: CheckCircle2, color: 'text-emerald-500', label: 'Aceito'      },
  confirmed:          { Icon: CheckCircle2, color: 'text-green-600',    label: 'Confirmado'  },
  in_progress:        { Icon: CheckCircle2, color: 'text-blue-500',     label: 'Em andamento'},
  completed:          { Icon: CheckCircle2, color: 'text-gray-400',     label: 'Concluído'   },
  cancelled:          { Icon: XCircle,      color: 'text-red-500',      label: 'Cancelado'   },
  expired:            { Icon: XCircle,      color: 'text-gray-400',     label: 'Expirado'    },
}
function serviceStatusOf(b) {
  return SERVICE_STATUS[resolveStatus(b)] || SERVICE_STATUS.waiting_acceptance
}

/* ── Resumo de um pedido (grupo de reservas do carrinho) ───────── */
function groupSummary(bookings) {
  // Itens cancelados NÃO contam no total nem no status do pedido — senão o
  // valor fica "preso" no antigo e o status vira "Em andamento" por engano.
  const cancelado = (b) => resolveStatus(b) === 'cancelled'
  const ativos = bookings.filter((b) => !cancelado(b))
  const base   = ativos.length ? ativos : bookings   // tudo cancelado → mostra estado cancelado
  const statuses = base.map(resolveStatus)
  const total = base.reduce((s, b) => s + Number(b.total_amount || 0), 0)
  const allCancelled = ativos.length === 0
  const allPay       = statuses.length > 0 && statuses.every((s) => s === 'waiting_payment')
  const allDone      = statuses.length > 0 && statuses.every((s) => ['confirmed', 'completed'].includes(s))
  const anyWaitAcc   = statuses.some((s) => s === 'waiting_acceptance')
  const payableCount = statuses.filter((s) => s === 'waiting_payment').length
  // Total que será realmente cobrado: só os itens aguardando pagamento
  // (o servidor cobra exatamente esses). Se nada estiver pagável, cai no total.
  const payableTotal = base
    .filter((b) => resolveStatus(b) === 'waiting_payment')
    .reduce((s, b) => s + Number(b.total_amount || 0), 0)
  let label = 'Em andamento', bg = 'bg-blue-500'
  if (allCancelled)    { label = 'Cancelado';           bg = 'bg-red-500'    }
  else if (allPay)     { label = 'Pronto para pagar';   bg = 'bg-amber-500'  }
  else if (allDone)    { label = 'Confirmado';          bg = 'bg-green-500'  }
  else if (anyWaitAcc) { label = 'Aguard. confirmação'; bg = 'bg-orange-400' }
  else if (payableCount > 0) { label = 'Aguard. pagamento'; bg = 'bg-amber-500' }
  return { total, label, bg, count: bookings.length, allPay, payableCount, payableTotal }
}

/* ── Card-resumo do pedido (grupo) — abre o detalhe ao tocar ───── */
function GroupCard({ bookings, onOpen, onPayGroup }) {
  const { total, label, bg, count, payableCount, payableTotal, allPay } = groupSummary(bookings)
  return (
    <div onClick={onOpen} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-brand/20 active:scale-[0.99] transition-transform cursor-pointer">
      <div className="bg-brand/5 px-4 py-2.5 flex items-center justify-between border-b border-brand/10">
        <div className="flex items-center gap-2">
          <Package size={15} className="text-brand shrink-0" />
          <span className="text-[13px] font-bold text-gray-900">Pedido · {count} serviços</span>
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full text-white ${bg}`}>{label}</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {bookings.slice(0, 3).map((b) => {
          const isTour = b.service_type === 'tour'
          const st = serviceStatusOf(b)
          let d = ''
          if (b.service_date) { try { d = format(new Date(b.service_date + 'T00:00:00'), 'd MMM', { locale: ptBR }) } catch {} }
          return (
            <div key={b.id} className="flex items-center gap-2 text-[12px] text-gray-600">
              <st.Icon size={14} className={`${st.color} shrink-0`} title={st.label} />
              <span className="truncate flex-1">{b.service_name || (isTour ? 'Passeio' : 'Transfer')} · {b.booking_code}</span>
              <span className={`text-[10px] font-bold shrink-0 ${st.color}`}>{st.label}</span>
              <span className="text-gray-400 shrink-0 w-12 text-right">{d}</span>
            </div>
          )
        })}
        {count > 3 && <p className="text-[11px] text-gray-400">+{count - 3} serviço(s)</p>}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">Total do pedido</p>
            <p className="text-[16px] font-extrabold text-gray-900 leading-none mt-0.5">{fmt(total)}</p>
          </div>
          <span className="flex items-center gap-1 text-[12px] font-bold text-brand">Ver detalhes <ChevronRight size={16} /></span>
        </div>

        {/* Pagar o pedido de uma vez — cobra só os itens aguardando pagamento.
            Aparece mesmo com 1 pendente (ex.: outro item do combo foi cancelado). */}
        {payableCount >= 1 && onPayGroup && (
          <button
            onClick={(e) => { e.stopPropagation(); onPayGroup() }}
            className="mt-1 w-full bg-brand text-white font-bold rounded-xl py-2.5 text-[13px] active:scale-[0.98] transition-transform"
          >
            {allPay && payableCount >= 2 ? 'Pagar tudo' : payableCount >= 2 ? 'Pagar os pendentes' : 'Pagar agora'} · {fmt(payableTotal)}
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Painel com as reservas que compõem o pedido ───────────────── */
function GroupDetailSheet({ bookings, onClose, onPay, onPayGroup, onCancel, onDetail, onReview, reviewedIds }) {
  const { total, allPay, count, payableCount, payableTotal } = groupSummary(bookings)
  return (
    <Overlay>
    {/* Painel de tela cheia no celular: abre já no topo da viewport, com o
        cabeçalho e o primeiro serviço visíveis sem rolar. Em telas maiores
        vira um cartão centralizado. `dvh` acompanha a barra do navegador — com
        `vh` a parte de baixo ficava fora da tela no iOS. */}
    <div className="fixed inset-0 h-[100dvh] z-[90] flex items-stretch sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-50 w-full h-full sm:h-auto sm:max-w-md sm:rounded-3xl sm:max-h-[86dvh] flex flex-col shadow-2xl">
        <div
          className="flex items-center justify-between px-5 pb-4 bg-white sm:rounded-t-3xl border-b border-gray-100 shrink-0"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2">
            <Package size={16} className="text-brand" />
            <h3 className="font-bold text-gray-900">Pedido · {count} serviços</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform">
            <X size={15} className="text-gray-500" />
          </button>
        </div>
        <div
          className="overflow-y-auto px-4 py-4 space-y-3 flex-1"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} onCancel={onCancel} onDetail={onDetail} onPay={onPay}
              onReview={onReview} reviewed={reviewedIds?.has(b.id)} noStretch />
          ))}
        </div>
        {payableCount >= 1 && (
          <div
            className="px-4 pt-4 bg-white border-t border-gray-100 shrink-0"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={onPayGroup}
              className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
            >
              {payableCount >= 2 ? `Pagar ${allPay ? 'tudo' : 'os pendentes'}` : 'Pagar agora'} · {fmt(payableTotal)}
            </button>
          </div>
        )}
      </div>
    </div>
    </Overlay>
  )
}

/* ── Avaliação (estrelas + comentário) de uma reserva realizada ── */
/* ── Quote status → badge (mesmo visual das reservas) ──────────── */
const QUOTE_BADGE = {
  pending_quote: { label: 'Aguardando preço',     bg: 'bg-amber-500', text: 'text-white', pulse: true  },
  quoted:        { label: 'Proposta recebida',    bg: 'bg-blue-500',  text: 'text-white', pulse: false },
  accepted:      { label: 'Aguardando pagamento', bg: 'bg-amber-500', text: 'text-white', pulse: false },
  paid:          { label: 'Paga',                 bg: 'bg-gray-500',  text: 'text-white', pulse: false },
  rejected:      { label: 'Recusada',             bg: 'bg-red-500',   text: 'text-white', pulse: false },
  cancelled:     { label: 'Cancelada',            bg: 'bg-red-500',   text: 'text-white', pulse: false },
  expired:       { label: 'Expirada',             bg: 'bg-gray-400',  text: 'text-white', pulse: false },
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(new Date(d + 'T12:00:00'), "d MMM", { locale: ptBR }) } catch { return d }
}

/* ── Quote Detail Dialog ────────────────────────────────────── */
function QuoteDetailDialog({ quote, onClose }) {
  const badge = QUOTE_BADGE[quote.status] || QUOTE_BADGE.pending_quote
  const rows = [
    ['Origem',      quote.origin_place_name],
    ['Destino',     quote.destination_place_name],
    ['Data',        fmtDate(quote.service_date)],
    ['Horário',     quote.service_time ? quote.service_time.slice(0, 5) : '—'],
    ['Passageiros', String(quote.people_count || 1)],
    ...(quote.quoted_price != null ? [['Valor', fmt(quote.quoted_price)]] : []),
  ]
  return (
    <Overlay>
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Car size={16} className="text-brand shrink-0" />
            <h3 className="font-bold text-gray-900 truncate">Translado personalizado</h3>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${badge.bg} ${badge.text}`}>{badge.label}</span>
        </div>
        <div className="space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3">
              <span className="text-[12px] text-gray-400">{k}</span>
              <span className="text-[13px] font-semibold text-gray-800 text-right">{v || '—'}</span>
            </div>
          ))}
          {quote.quote_notes && (
            <div className="bg-gray-50 rounded-xl px-3 py-2 mt-1">
              <p className="text-[11px] text-gray-400 mb-0.5">Observação do operador</p>
              <p className="text-[12px] text-gray-700">{quote.quote_notes}</p>
            </div>
          )}
        </div>
        <button onClick={onClose} className="w-full mt-5 h-11 bg-gray-100 text-gray-700 rounded-2xl text-sm font-bold active:scale-95 transition-transform">
          Fechar
        </button>
      </div>
    </div>
    </Overlay>
  )
}

/* ── Quote Card — mesmo formato das reservas (categoria "Translado") ── */
function QuoteCard({ quote, onAccept, onCancel, onPay, onDetail, acceptLoading, rejectLoading }) {
  const badge = QUOTE_BADGE[quote.status] || QUOTE_BADGE.pending_quote
  const idx   = gi(quote.id)
  const [from, to] = GRADIENTS[idx]

  const dateStr  = fmtDate(quote.service_date)
  const timeStr  = quote.service_time ? quote.service_time.slice(0, 5) : '—'
  const route    = `${quote.origin_place_name} → ${quote.destination_place_name}`
  const hasPrice = quote.quoted_price != null

  return (
    <div onClick={() => onDetail?.(quote)} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-transform cursor-pointer flex flex-col h-full">
      {/* ── Hero ── */}
      <div className="relative h-[120px]">
        <div className={`w-full h-full bg-gradient-to-br ${from} ${to} flex items-center justify-center`}>
          <Car size={44} className="text-white/20" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* categoria */}
        <div className="absolute top-3 left-3">
          <span className="flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            <Car size={10} /> Translado personalizado
          </span>
        </div>

        {/* status */}
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${badge.bg} ${badge.text} ${badge.pulse ? 'animate-pulse' : ''}`}>
            {badge.label}
          </span>
        </div>

        {/* rota */}
        <p className="absolute bottom-3 left-3 right-3 text-white font-bold text-[16px] leading-tight drop-shadow truncate">
          {route}
        </p>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pt-3 pb-4 flex-1 flex flex-col gap-3">
        {/* Data / Horário / Pessoas */}
        <div className="flex items-center gap-4">
          {[
            { Icon: Calendar, label: 'Data',    val: dateStr },
            { Icon: Clock,    label: 'Horário', val: timeStr },
            { Icon: Users,    label: 'Pessoas', val: String(quote.people_count || '—') },
          ].map(({ Icon: I, label, val }) => (
            <div key={label} className="flex items-center gap-1.5">
              <I size={13} className="text-brand shrink-0" />
              <div>
                <p className="text-[10px] text-gray-400 leading-none">{label}</p>
                <p className="text-[12px] font-semibold text-gray-900 leading-none mt-0.5">{val}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Observação do operador */}
        {quote.status === 'quoted' && quote.quote_notes && (
          <div className="flex items-start gap-2 bg-blue-50 rounded-xl px-3 py-2">
            <MessageSquare size={12} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[12px] text-gray-600">{quote.quote_notes}</p>
          </div>
        )}

        {/* Aguardando preço */}
        {quote.status === 'pending_quote' && (
          <div className="flex items-center gap-2 bg-amber-50 rounded-xl px-3 py-2">
            <Loader2 size={13} className="text-amber-500 shrink-0 animate-spin" />
            <p className="text-[12px] text-amber-700">Aguardando o operador enviar o valor.</p>
          </div>
        )}

        {/* Cancelada / recusada / expirada */}
        {(quote.status === 'rejected' || quote.status === 'expired' || quote.status === 'cancelled') && (
          <p className="text-[12px] text-gray-400 bg-gray-50 rounded-xl px-3 py-2">
            {quote.status === 'cancelled' ? 'Você cancelou esta solicitação.'
              : quote.status === 'rejected' ? 'Você recusou esta proposta.'
              : 'Esta cotação expirou.'}
          </p>
        )}

        {/* Total + ações (mesmo layout das reservas) */}
        <div className="mt-auto flex items-center justify-between gap-3 pt-0.5">
          <div>
            <p className="text-[10px] text-gray-400 leading-none">
              {quote.status === 'accepted' ? 'Total a pagar' : 'Valor da corrida'}
            </p>
            <p className="text-[15px] font-bold text-gray-900 leading-none mt-0.5">
              {hasPrice ? fmt(quote.quoted_price) : 'A definir'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {quote.status === 'quoted' && (
              <button
                onClick={(e) => { e.stopPropagation(); onAccept?.(quote) }}
                disabled={acceptLoading}
                className="flex items-center gap-1 bg-emerald-500 text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60 shadow-sm"
              >
                {acceptLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aceitar
              </button>
            )}
            {quote.status === 'accepted' && (
              <button
                onClick={(e) => { e.stopPropagation(); onPay?.(quote) }}
                className="bg-brand text-white text-[12px] font-bold px-3 py-1.5 rounded-xl active:scale-95 transition-transform shadow-sm shadow-brand/20"
              >
                Pagar agora
              </button>
            )}
            {['pending_quote', 'quoted', 'accepted'].includes(quote.status) && (
              <button
                onClick={(e) => { e.stopPropagation(); onCancel?.(quote) }}
                disabled={rejectLoading}
                className="flex items-center gap-1 border border-red-200 bg-red-50 text-red-600 text-[12px] font-semibold px-3 py-1.5 rounded-xl active:scale-95 transition-transform disabled:opacity-60"
              >
                <X size={11} /> Cancelar
              </button>
            )}
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────── */
// ── Reservas de estacionamento (vertical própria) ────────────────────────────
const PARK_STATUS = {
  awaiting_partner:          { label: 'Aguardando o estacionamento', cls: 'bg-amber-100 text-amber-700' },
  accepted_awaiting_payment: { label: 'Aceita · pague para confirmar', cls: 'bg-brand/10 text-brand' },
  confirmed:                 { label: 'Confirmada', cls: 'bg-emerald-100 text-emerald-700' },
  in_lot:                    { label: 'No pátio', cls: 'bg-blue-100 text-blue-700' },
  withdrawal_requested:      { label: 'Retirada solicitada', cls: 'bg-blue-100 text-blue-700' },
  withdrawal_authorized:     { label: 'Retirada autorizada', cls: 'bg-blue-100 text-blue-700' },
  completed:                 { label: 'Concluída', cls: 'bg-gray-100 text-gray-600' },
  rejected:                  { label: 'Recusada', cls: 'bg-red-100 text-red-600' },
  expired_no_answer:         { label: 'Expirada', cls: 'bg-gray-100 text-gray-500' },
  expired_no_payment:        { label: 'Expirou sem pagamento', cls: 'bg-gray-100 text-gray-500' },
  cancelled:                 { label: 'Cancelada', cls: 'bg-red-100 text-red-600' },
}
function ParkingReservas() {
  const navigate = useNavigate()
  const [pinModal, setPinModal] = useState(null) // { code, pin, expires_at }
  const queryClient = useQueryClient()
  const [cancelTarget, setCancelTarget] = useState(null)
  const { data } = useQuery({ queryKey: ['parking-my'], queryFn: () => api.parkingMyReservations(), refetchInterval: 15000 })
  const todas = data?.data || []
  const ativas = todas.filter((r) => !['completed', 'cancelled', 'rejected', 'expired_no_answer', 'expired_no_payment'].includes(r.status))
  // Concluídas e ainda sem avaliação (fecha o ciclo de reputação).
  const aAvaliar = todas.filter((r) => r.status === 'completed' && r.reviewed === false)

  const pedirRetirada = useMutation({
    mutationFn: (id) => api.parkingWithdrawal(id),
    onSuccess: (res, id) => {
      const r = ativas.find((x) => x.id === id)
      setPinModal({ code: r?.code, pin: res.pin, expires_at: res.expires_at })
    },
  })

  if (ativas.length === 0 && aAvaliar.length === 0) return null
  const dt = (s) => { try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return s } }
  const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-bold text-gray-500 flex items-center gap-1.5"><ParkingSquare size={14} className="text-brand" /> Estacionamento</p>
      {ativas.map((r) => {
        const st = PARK_STATUS[r.status] || { label: r.status, cls: 'bg-gray-100 text-gray-600' }
        const mostraEntrada = r.entry_code && ['confirmed', 'in_lot', 'withdrawal_requested'].includes(r.status)
        const podeRetirar = ['in_lot', 'withdrawal_requested'].includes(r.status)
        const podeEstender = ['confirmed', 'in_lot'].includes(r.status) && r.payment_status === 'paid'
        const podeCancelar = ['awaiting_partner', 'accepted_awaiting_payment', 'confirmed'].includes(r.status)
        return (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-bold text-brand">{r.code}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <p className="text-[12px] text-gray-500 flex items-center gap-1"><Clock size={12} className="text-brand" /> {dt(r.start_at)} → {dt(r.end_at)}</p>
              <p className="text-[14px] font-extrabold text-gray-900">{money(r.total_amount)}</p>
            </div>

            {mostraEntrada && (
              <div className="mt-2 flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1.5"><LogIn size={13} /> Código de entrada</span>
                <span className="font-mono text-[16px] font-extrabold tracking-[0.25em] text-emerald-800">{r.entry_code}</span>
              </div>
            )}

            {/* Translado sugerido (spec 3.4): leva ao fluxo de transfer existente. */}
            {['confirmed', 'in_lot'].includes(r.status) && (
              <button onClick={() => navigate('/transfers')}
                className="mt-2 w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold text-brand bg-brand/5 border border-brand/15 rounded-xl py-2 active:scale-[0.98]">
                <Car size={13} /> Precisa de translado até o pátio?
              </button>
            )}

            {r.status === 'accepted_awaiting_payment' && (
              <button
                onClick={() => navigate(`/estacionamento/${r.id}/pagar`)}
                className="mt-2 w-full bg-brand text-white font-bold rounded-xl py-2.5 text-[13px] active:scale-[0.98] transition-transform"
              >
                Pagar agora · {money(r.total_amount)}
              </button>
            )}

            {podeRetirar && (
              <button
                onClick={() => pedirRetirada.mutate(r.id)}
                disabled={pedirRetirada.isPending}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-bold rounded-xl py-2.5 text-[13px] active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {pedirRetirada.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                {r.status === 'withdrawal_requested' ? 'Ver PIN de retirada' : 'Pedir retirada'}
              </button>
            )}

            {podeEstender && (
              <button
                onClick={() => navigate(`/estacionamento/${r.id}/estender`)}
                className="mt-2 w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-semibold rounded-xl py-2.5 text-[13px] active:scale-[0.98] transition-transform"
              >
                <Clock size={14} className="text-brand" /> Estender estadia
              </button>
            )}

            {podeCancelar && (
              <button onClick={() => setCancelTarget(r)}
                className="mt-2 w-full text-center text-[12px] font-semibold text-red-500 py-1.5 active:scale-[0.98]">
                Cancelar reserva
              </button>
            )}
          </div>
        )
      })}

      {aAvaliar.map((r) => (
        <ParkingReviewCard key={`rev-${r.id}`} reserva={r}
          onDone={() => queryClient.invalidateQueries({ queryKey: ['parking-my'] })} />
      ))}

      {pinModal && <WithdrawalPinModal data={pinModal} onClose={() => setPinModal(null)} />}
      {cancelTarget && (
        <ParkingCancelModal reserva={cancelTarget} onClose={() => setCancelTarget(null)}
          onDone={() => { setCancelTarget(null); queryClient.invalidateQueries({ queryKey: ['parking-my'] }) }} />
      )}
    </div>
  )
}

// ── Cancelamento com prévia da política de reembolso ──────────────────────────
function ParkingCancelModal({ reserva, onClose, onDone }) {
  const money = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  const { data: prev, isLoading } = useQuery({
    queryKey: ['parking-refund', reserva.id],
    queryFn: () => api.parkingRefundPreview(reserva.id),
  })
  const cancelar = useMutation({
    mutationFn: () => api.parkingCancel(reserva.id),
    onSuccess: () => onDone?.(),
  })
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[16px] font-extrabold text-gray-900">Cancelar reserva?</h3>
        <p className="text-[12px] text-gray-500 font-mono mt-0.5">{reserva.code}</p>

        <div className="my-4 rounded-2xl bg-gray-50 p-3 text-[13px]">
          {isLoading ? (
            <p className="text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Calculando reembolso…</p>
          ) : !prev?.pago ? (
            <p className="text-gray-600">Esta reserva ainda não foi paga — o cancelamento é gratuito.</p>
          ) : prev.elegivel ? (
            <p className="text-emerald-700">Você está dentro do prazo: reembolso de <strong>{money(prev.valor)}</strong> será processado.</p>
          ) : (
            <p className="text-amber-700">Fora do prazo de reembolso. O cancelamento libera a vaga, mas <strong>sem devolução</strong> do valor pago.</p>
          )}
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 font-semibold rounded-xl py-3 text-[14px]">Voltar</button>
          <button onClick={() => cancelar.mutate()} disabled={cancelar.isPending}
            className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white font-bold rounded-xl py-3 text-[14px] disabled:opacity-60">
            {cancelar.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Cartão de avaliação do estacionamento (pós-conclusão) ─────────────────────
function ParkingReviewCard({ reserva, onDone }) {
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const enviar = useMutation({
    mutationFn: () => api.parkingReview(reserva.id, { rating: nota, comment: comentario.trim() || null }),
    onSuccess: () => onDone?.(),
  })
  return (
    <div className="bg-white rounded-2xl border border-brand/20 shadow-sm p-4">
      <p className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
        <ParkingSquare size={14} className="text-brand" /> Como foi o estacionamento?
      </p>
      <p className="text-[11px] text-gray-400 font-mono mt-0.5">{reserva.code}</p>
      <div className="flex items-center gap-1.5 my-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setNota(n)} aria-label={`${n} estrela(s)`}>
            <Star size={28} className={n <= nota ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
          </button>
        ))}
      </div>
      <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={500}
        placeholder="Deixe um comentário (opcional)"
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[13px] focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none" />
      <button onClick={() => enviar.mutate()} disabled={nota === 0 || enviar.isPending}
        className="mt-2 w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-xl py-2.5 text-[13px] active:scale-[0.98] disabled:opacity-50">
        {enviar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />} Enviar avaliação
      </button>
    </div>
  )
}

// ── Flutuante do PIN de retirada — segredo mostrado só ao cliente, uma vez ─────
function WithdrawalPinModal({ data, onClose }) {
  const [restante, setRestante] = useState('')
  useEffect(() => {
    const alvo = data.expires_at ? new Date(data.expires_at).getTime() : 0
    const tick = () => {
      if (!alvo) return setRestante('')
      const s = Math.max(0, Math.round((alvo - Date.now()) / 1000))
      const mm = String(Math.floor(s / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setRestante(`${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [data.expires_at])

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center mx-auto mb-3">
          <KeyRound size={22} />
        </div>
        <h3 className="text-[16px] font-extrabold text-gray-900">PIN de retirada</h3>
        <p className="text-[12px] text-gray-500 mt-1">Mostre este PIN ao atendente do estacionamento. Ele é de uso único{restante ? ` e expira em ${restante}` : ''}.</p>
        <div className="my-5 font-mono text-[40px] font-black tracking-[0.3em] text-gray-900">{data.pin}</div>
        {data.code && <p className="font-mono text-[11px] text-gray-400 -mt-3 mb-3">Reserva {data.code}</p>}
        <button onClick={onClose} className="w-full bg-gray-900 text-white font-bold rounded-xl py-3 text-[14px] active:scale-[0.99]">Fechar</button>
      </div>
    </div>,
    document.body,
  )
}

export default function Bookings() {
  const queryClient = useQueryClient()
  const navigate    = useNavigate()
  const { t }       = useTranslation()

  const TABS = [
    { id: 'todos',      label: t('bookings.all')       },
    { id: 'ativos',     label: t('bookings.active')    },
    { id: 'concluidos', label: t('bookings.completed') },
    { id: 'cancelados', label: t('bookings.cancelled') },
  ]

  const location = useLocation()
  const [tab,           setTab]           = useState('todos')
  const [showSearch,    setShowSearch]    = useState(!!location.state?.q)
  const [searchTerm,    setSearchTerm]    = useState(location.state?.q || '')
  const [cancelTarget,  setCancelTarget]  = useState(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError,   setCancelError]   = useState(null)
  const [quoteActing,   setQuoteActing]   = useState(null) // quote id being accepted/rejected
  const [quoteDetail,   setQuoteDetail]   = useState(null) // cotação aberta em "Detalhes"
  const [groupOpen,     setGroupOpen]     = useState(null) // pedido (grupo) aberto no painel

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
  })

  const { data: quotesData, isLoading: quotesLoading } = useQuery({
    queryKey: ['my-quotes'],
    queryFn:  () => api.getMyQuotes(),
    // Atualiza enquanto houver cotação aguardando preço/proposta, para o cliente
    // ver a oferta do operador sem precisar atualizar a tela.
    refetchInterval: (query) => {
      const list = Array.isArray(query.state.data) ? query.state.data : []
      return list.some(qq => qq.status === 'pending_quote' || qq.status === 'quoted') ? 12000 : false
    },
  })

  const quotes = Array.isArray(quotesData) ? quotesData : []

  // Reservas que EU já avaliei — some o botão "Avaliar" / vira "Avaliado".
  const { data: myReviews } = useQuery({
    queryKey: ['my-coop-reviews'],
    queryFn:  () => api.getMyCoopReviews(),
  })
  const reviewedIds = new Set((Array.isArray(myReviews) ? myReviews : []).map((r) => r.booking_id))
  const [reviewTarget, setReviewTarget] = useState(null) // reserva sendo avaliada

  const all = (
    Array.isArray(data?.data) ? data.data :
    Array.isArray(data) ? data : []
  ).map(b => ({ ...b, _status: resolveStatus(b) }))

  // Quantas reservas cada pedido (order_group_id) tem — para o selo de grupo.
  const groupSizes = (() => {
    const m = new Map()
    for (const b of all) if (b.order_group_id) m.set(b.order_group_id, (m.get(b.order_group_id) || 0) + 1)
    return m
  })()

  const q = searchTerm.trim().toLowerCase()
  const filtered = all.filter(b => {
    if (q) {
      const hay = `${b.booking_code || ''} ${b.service_name || ''} ${b.origin_text || ''} ${b.destination_text || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (tab === 'ativos')     return ACTIVE_STATUSES.includes(b._status)
    if (tab === 'concluidos') return b._status === 'completed'
    if (tab === 'cancelados') return b._status === 'cancelled'
    return true
  })

  const counts = {
    ativos:     all.filter(b => ACTIVE_STATUSES.includes(b._status)).length
                + quotes.filter(qq => QUOTE_ACTIVE.includes(qq.status)).length,
    concluidos: all.filter(b => b._status === 'completed').length,
    cancelados: all.filter(b => b._status === 'cancelled').length
                + quotes.filter(qq => ['cancelled', 'rejected', 'expired'].includes(qq.status)).length,
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelLoading(true)
    setCancelError(null)
    try {
      await api.cancelBooking(cancelTarget.id, { reason: 'Cancelado pelo cliente' })
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] })
      setCancelTarget(null)
    } catch (err) {
      setCancelError(err.message || 'Erro ao cancelar reserva')
    } finally {
      setCancelLoading(false)
    }
  }

  async function handleAcceptQuote(quote) {
    setQuoteActing(quote.id)
    try {
      const result = await api.acceptQuote(quote.id)
      // A cotação aceita já criou a reserva (atribuída ao operador que cotou) —
      // paga direto via existing_booking_id, sem reentrar na fila de solicitação.
      navigate('/checkout/pagamento', {
        state: {
          service_name:        `${quote.origin_place_name} → ${quote.destination_place_name}`,
          service_type:        'transfer',
          booking_mode:        'private',
          service_date:        fmtDate(quote.service_date),
          service_date_iso:    quote.service_date,
          service_time:        quote.service_time,
          people_count:        quote.people_count,
          total_price:         result.quoted_price,
          origin_text:         quote.origin_place_name,
          destination_text:    quote.destination_place_name,
          existing_booking_id: result.booking_id,
        },
      })
    } catch (err) {
      alert(err.message || 'Erro ao aceitar cotação')
    } finally {
      setQuoteActing(null)
    }
  }

  async function handleRejectQuote(quoteId) {
    setQuoteActing(quoteId)
    try {
      await api.rejectQuote(quoteId, { rejection_reason: 'Recusado pelo cliente' })
      queryClient.invalidateQueries({ queryKey: ['my-quotes'] })
    } catch (err) {
      alert(err.message || 'Erro ao recusar cotação')
    } finally {
      setQuoteActing(null)
    }
  }

  async function handleCancelQuote(quote) {
    if (!confirm('Cancelar esta solicitação de translado personalizado?')) return
    setQuoteActing(quote.id)
    try {
      await api.cancelQuote(quote.id)
      queryClient.invalidateQueries({ queryKey: ['my-quotes'] })
    } catch (err) {
      alert(err.message || 'Erro ao cancelar a solicitação')
    } finally {
      setQuoteActing(null)
    }
  }

  function handlePay(booking) {
    let dateStr = '—'
    if (booking.service_date) {
      try { dateStr = format(new Date(booking.service_date + 'T00:00:00'), "d MMM", { locale: ptBR }) } catch {}
    }
    navigate('/checkout/pagamento', {
      state: {
        service_name:        booking.service_name || `${booking.service_type === 'tour' ? 'Passeio' : 'Transfer'} · ${booking.booking_code}`,
        service_type:        booking.service_type,
        booking_mode:        booking.booking_mode || 'private',
        service_date:        dateStr,
        service_date_iso:    booking.service_date,
        service_time:        booking.service_time,
        people_count:        booking.people_count,
        total_price:         booking.total_amount,
        origin_text:         booking.origin_text || booking.pickup_place_name || null,
        destination_text:    booking.destination_text || booking.destination_place_name || null,
        cover_image_url:     booking.cover_image_url || null,
        existing_booking_id: booking.id,
      },
    })
  }

  // Carrinho universal: paga TODAS as reservas prontas do grupo num pagamento só.
  // (Só entram as 'aguardando pagamento'; o servidor recalcula o total.)
  function handlePayGroup(group) {
    const payable = group.bookings.filter((b) => resolveStatus(b) === 'waiting_payment')
    const list = payable.length ? payable : group.bookings
    navigate('/checkout/pagamento', {
      state: {
        service_name:   `${list.length} serviços`,
        service_type:   'tour',
        booking_mode:   'private',
        people_count:   list.reduce((s, b) => s + Number(b.people_count || 0), 0),
        total_price:    list.reduce((s, b) => s + Number(b.total_amount || 0), 0),
        order_group_id: group.gid,
        // Nomes/tags de cada serviço do pedido — o checkout lista item a item
        // em vez de mostrar só "N serviços".
        group_items:    list.map((b) => ({
          name: b.service_name || (b.service_type === 'tour' ? 'Passeio' : 'Transfer'),
          type: b.service_type,
          amount: Number(b.total_amount || 0),
        })),
      },
    })
  }

  // Retoma o pagamento de uma cotação já aceita (sem reaceitar)
  function handlePayQuote(quote) {
    navigate('/checkout/pagamento', {
      state: {
        service_name:        `${quote.origin_place_name} → ${quote.destination_place_name}`,
        service_type:        'transfer',
        booking_mode:        'private',
        service_date:        fmtDate(quote.service_date),
        service_date_iso:    quote.service_date,
        service_time:        quote.service_time,
        people_count:        quote.people_count,
        total_price:         quote.quoted_price,
        origin_text:         quote.origin_place_name,
        destination_text:    quote.destination_place_name,
        existing_booking_id: quote.booking_id,
      },
    })
  }

  // Cotação que já virou reserva (booking com service_id = quote.id) não deve
  // duplicar nas abas de reservas.
  const bookedServiceIds = new Set(all.map(b => b.service_id).filter(Boolean))

  // Cotações que entram nas abas Todas/Ativas (a paga já vira reserva)
  const quotesForTab = (() => {
    if (tab === 'concluidos') return []
    let list = quotes.filter(qq => qq.status !== 'paid' && !bookedServiceIds.has(qq.id))
    if (tab === 'ativos')     list = list.filter(qq => QUOTE_ACTIVE.includes(qq.status))
    if (tab === 'cancelados') list = list.filter(qq => ['cancelled', 'rejected', 'expired'].includes(qq.status))
    if (q) list = list.filter(qq => `${qq.origin_place_name || ''} ${qq.destination_place_name || ''}`.toLowerCase().includes(q))
    return list
  })()

  // Reservas do mesmo pedido (order_group_id) viram UM card-resumo; ao tocar,
  // abre o painel com as reservas que compõem o grupo. Grupo de 1 (visível na
  // aba) cai como card normal.
  const bookingItems = (() => {
    const groups = new Map()
    const singles = []
    for (const b of filtered) {
      if (b.order_group_id) {
        if (!groups.has(b.order_group_id)) groups.set(b.order_group_id, [])
        groups.get(b.order_group_id).push(b)
      } else singles.push(b)
    }
    const items = []
    for (const [gid, arr] of groups.entries()) {
      if (arr.length >= 2) {
        const ts = arr.map(b => b.created_at || '').sort().slice(-1)[0] || ''
        items.push({ kind: 'group', id: `g-${gid}`, gid, data: arr, ts })
      } else {
        items.push({ kind: 'booking', id: arr[0].id, data: arr[0], ts: arr[0].created_at || arr[0].service_date || '' })
      }
    }
    for (const b of singles) items.push({ kind: 'booking', id: b.id, data: b, ts: b.created_at || b.service_date || '' })
    return items
  })()

  // Lista unificada: reservas/grupos + cotações (cada uma com seu card/rótulo)
  const listItems = [
    ...bookingItems,
    ...quotesForTab.map(qq => ({ kind: 'quote', id: `q-${qq.id}`, data: qq, ts: qq.created_at || qq.service_date || '' })),
  ].sort((a, b) => String(b.ts).localeCompare(String(a.ts)))

  return (
    <div className="min-h-full pb-4">
      {/* Header */}
      <header className="bg-white px-4 pt-5 pb-0 sticky top-0 lg:top-[57px] z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)] lg:max-w-5xl lg:mx-auto">
        <div className="relative flex items-center justify-center min-h-[32px] mb-1">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Voltar"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">{t('bookings.title')}</h1>
          <div className="absolute right-0 flex items-center gap-1.5">
            <button
              onClick={() => { setShowSearch((s) => !s); if (showSearch) setSearchTerm('') }}
              className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-transform ${showSearch ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              <Search size={15} />
            </button>
          </div>
        </div>
        <p className="text-[12px] text-gray-400 text-center pb-2">
          {counts.ativos > 0
            ? <><span className="font-semibold text-brand">{counts.ativos}</span> reserva{counts.ativos !== 1 ? 's' : ''} ativa{counts.ativos !== 1 ? 's' : ''}</>
            : 'Nenhuma reserva ativa'}
        </p>

        {showSearch && (
          <div className="mb-3 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código, serviço ou local…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-gray-50 text-[13px] text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand focus:bg-white"
            />
          </div>
        )}

        {/* Tabs */}
        <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {TABS.map((t) => {
            const count  = t.id !== 'todos' ? counts[t.id] : null
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative shrink-0 flex-1 pb-3 px-1 text-[12px] font-semibold transition-colors ${active ? 'text-brand' : 'text-gray-400'}`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-brand text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {count}
                  </span>
                )}
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-brand" />}
              </button>
            )
          })}
        </div>
      </header>


      {/* List */}
      <main className="px-4 pt-4 space-y-3 lg:max-w-5xl lg:mx-auto">
        <ParkingReservas />
        {(isLoading || quotesLoading) ? (
          <div className="py-16"><PageSpinner /></div>
        ) : listItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <CalendarCheck size={28} className="text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-500 mb-1">
              {all.length === 0 ? 'Nenhuma reserva ainda.' : 'Nenhuma reserva aqui.'}
            </p>
            <p className="text-[12px] text-gray-400">
              {all.length === 0 ? 'Faça sua primeira reserva de passeio ou transfer!' : 'Suas reservas aparecerão aqui.'}
            </p>
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 space-y-3">
            {listItems.map((it) => it.kind === 'quote' ? (
              <QuoteCard
                key={it.id}
                quote={it.data}
                onAccept={handleAcceptQuote}
                onCancel={handleCancelQuote}
                onPay={handlePayQuote}
                onDetail={(qq) => setQuoteDetail(qq)}
                acceptLoading={quoteActing === it.data.id}
                rejectLoading={quoteActing === it.data.id}
              />
            ) : it.kind === 'group' ? (
              <GroupCard
                key={it.id}
                bookings={it.data}
                onOpen={() => setGroupOpen({ gid: it.gid, bookings: it.data })}
                onPayGroup={() => handlePayGroup({ gid: it.gid, bookings: it.data })}
              />
            ) : (
              <BookingCard
                key={it.id}
                booking={it.data}
                onCancel={setCancelTarget}
                onDetail={(id) => navigate(`/minhas-reservas/${id}`)}
                onPay={handlePay}
                onReview={setReviewTarget}
                reviewed={reviewedIds.has(it.data.id)}
                groupSize={it.data.order_group_id ? (groupSizes.get(it.data.order_group_id) || 0) : 0}
              />
            ))}
          </div>
        )}
      </main>

      {cancelTarget && (
        <CancelDialog
          booking={cancelTarget}
          onConfirm={handleCancelConfirm}
          onClose={() => { setCancelTarget(null); setCancelError(null) }}
          loading={cancelLoading}
          error={cancelError}
        />
      )}

      {quoteDetail && (
        <QuoteDetailDialog quote={quoteDetail} onClose={() => setQuoteDetail(null)} />
      )}

      {groupOpen && (
        <GroupDetailSheet
          bookings={groupOpen.bookings}
          onClose={() => setGroupOpen(null)}
          onPay={(b) => { setGroupOpen(null); handlePay(b) }}
          onPayGroup={() => { setGroupOpen(null); handlePayGroup(groupOpen) }}
          onCancel={(b) => { setGroupOpen(null); setCancelTarget(b) }}
          onDetail={(id) => { setGroupOpen(null); navigate(`/minhas-reservas/${id}`) }}
          onReview={(b) => { setGroupOpen(null); setReviewTarget(b) }}
          reviewedIds={reviewedIds}
        />
      )}

      {reviewTarget && (
        <ReviewSheet
          booking={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onDone={() => {
            setReviewTarget(null)
            queryClient.invalidateQueries({ queryKey: ['my-coop-reviews'] })
          }}
        />
      )}
    </div>
  )
}
