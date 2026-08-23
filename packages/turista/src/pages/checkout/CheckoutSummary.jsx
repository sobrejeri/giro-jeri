import { useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { lerOferta } from '../../lib/oferta'
import { useCart } from '../../contexts/CartContext'
import { checkoutStateFor } from '../../lib/cartCheckout'
import { getPartner as getPartnerAttribution } from '../../lib/partner'
import { getAffiliate as getAffiliateAttribution } from '../../lib/affiliate'
import {
  ChevronLeft, ChevronRight, MapPin, Calendar, Clock, Users, Car,
  Shield, AlertCircle, Pen, Zap, Sun, Waves, Anchor, Plus, Minus, Check,
} from 'lucide-react'
import {
  format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isBefore, addMonths, subMonths, getDay, isToday, addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Palette ────────────────────────────────────────────────── */
const GRADIENTS = [
  'from-orange-100 to-amber-100',
  'from-sky-100 to-blue-100',
  'from-emerald-100 to-teal-100',
  'from-purple-100 to-violet-100',
]
const TOUR_ICONS = [Zap, Sun, Waves, Anchor]
function gi(str = '') {
  let n = 0; for (let i = 0; i < str.length; i++) n += str.charCodeAt(i)
  return n % GRADIENTS.length
}
function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }

/* ── Date picker ────────────────────────────────────────────── */
function DatePickerSheet({ value, onChange, onClose, minDate: minDateProp }) {
  const { t } = useTranslation()
  const today = minDateProp || startOfDay(new Date())
  const [view, setView] = useState(startOfMonth(value))
  const days   = eachDayOfInterval({ start: startOfMonth(view), end: endOfMonth(view) })
  const offset = getDay(startOfMonth(view))
  const canPrev = !isBefore(subMonths(view, 1), startOfMonth(today))
  const weekdayLabels = [
    t('checkoutPg.weekday.sun'), t('checkoutPg.weekday.mon'), t('checkoutPg.weekday.tue'),
    t('checkoutPg.weekday.wed'), t('checkoutPg.weekday.thu'), t('checkoutPg.weekday.fri'),
    t('checkoutPg.weekday.sat'),
  ]
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">{t('checkoutPg.datePicker.title')}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-lg leading-none">×</button>
        </div>
        <div className="flex items-center justify-between px-5 mb-3">
          <button disabled={!canPrev} onClick={() => setView(m => subMonths(m, 1))}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center disabled:opacity-30 active:scale-95">
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          <p className="text-[14px] font-semibold text-gray-900 capitalize">{format(view, 'MMMM yyyy', { locale: ptBR })}</p>
          <button onClick={() => setView(m => addMonths(m, 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>
        <div className="grid grid-cols-7 px-4 mb-1">
          {weekdayLabels.map((d,i) => <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 px-4 gap-y-0.5 mb-4">
          {Array.from({ length: offset }).map((_,i) => <div key={`e${i}`} />)}
          {days.map(day => {
            const past = isBefore(day, today)
            const sel  = isSameDay(day, value)
            const tod  = isToday(day)
            return (
              <button key={day.toISOString()} disabled={past} onClick={() => { onChange(day); onClose() }}
                className={`aspect-square flex items-center justify-center rounded-full text-[13px] transition-all
                  ${sel ? 'bg-brand text-white font-bold' : ''}
                  ${!sel && tod ? 'text-brand font-bold' : ''}
                  ${!sel && !tod && !past ? 'text-gray-800 active:bg-gray-100 font-medium' : ''}
                  ${past ? 'text-gray-300 cursor-not-allowed' : ''}`}>
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
        <div className="px-4 pb-8">
          <button onClick={onClose} className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform">{t('checkoutPg.datePicker.confirm')}</button>
        </div>
      </div>
    </>
  )
}

/* ── Vehicle row with +/- ───────────────────────────────────── */
function VehicleRow({ vehicle, qty, unitPrice, onAdd, onRemove }) {
  const { t } = useTranslation()
  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
      qty > 0 ? 'border-brand bg-brand/5' : 'border-gray-100'
    }`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${qty > 0 ? 'bg-brand' : 'bg-gray-100'}`}>
        <Car size={18} className={qty > 0 ? 'text-white' : 'text-gray-400'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-gray-900 truncate">{vehicle.name}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Users size={10} className="text-gray-400" />
          <span className="text-[11px] text-gray-400">{t('checkoutPg.vehicleRow.capacity', { count: vehicle.seat_capacity })}</span>
        </div>
        {unitPrice && (
          <p className="text-[11px] text-gray-500 mt-0.5">R$ {Number(unitPrice).toLocaleString('pt-BR')}<span className="text-gray-400">{t('checkoutPg.vehicleRow.perVehicle')}</span></p>
        )}
      </div>
      {qty === 0 ? (
        <button onClick={onAdd} className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <Plus size={14} className="text-white" />
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onRemove} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
            <Minus size={11} className="text-gray-600" />
          </button>
          <span className="text-[14px] font-bold text-gray-900 w-4 text-center tabular-nums">{qty}</span>
          <button onClick={onAdd} className="w-7 h-7 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform">
            <Plus size={11} className="text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
// Wrapper: no fluxo "Solicitar tudo" a mesma rota recebe itens diferentes em
// sequência — a key força o React a remontar o formulário para cada item
// (todos os useState inicializam do location.state).
export default function CheckoutSummary() {
  const { state } = useLocation()
  const k = state?.cartBatch ? `lote-${state.cartBatch.index}-${state?.service_id}` : (state?.service_id || 'unico')
  return <CheckoutSummaryInner key={k} />
}

function CheckoutSummaryInner() {
  const { t }          = useTranslation()
  const navigate       = useNavigate()
  const { state: ls }  = useLocation()
  const { removeItem: removeCartItem } = useCart()
  const timeRef        = useRef(null)

  const isPrivateTour  = ls?.service_type === 'tour' && ls?.booking_mode === 'private'
  const isSharedTour   = ls?.service_type === 'tour' && ls?.booking_mode !== 'private'
  const isTransfer     = ls?.service_type === 'transfer'
  const hasVehicles    = isPrivateTour || isTransfer

  // ── Cutoff: passeios têm horário limite de solicitação ──
  const cutoffMins = (() => {
    if (!ls?.booking_cutoff_time) return null
    const p = ls.booking_cutoff_time.split(':')
    return parseInt(p[0]) * 60 + parseInt(p[1])
  })()
  const nowMins       = new Date().getHours() * 60 + new Date().getMinutes()
  const isAfterCutoff = cutoffMins !== null && nowMins >= cutoffMins
  const minDate       = isAfterCutoff ? addDays(startOfDay(new Date()), 1) : startOfDay(new Date())
  const cutoffLabel   = ls?.booking_cutoff_time
    ? `${ls.booking_cutoff_time.slice(0, 2)}h${ls.booking_cutoff_time.slice(3, 5)}`
    : null

  /* ── All hooks unconditionally ──────────────────────────── */
  const [editing,       setEditing]  = useState(ls?.open_editing === true)
  const [showDatePicker, setShowDP]  = useState(false)
  const [requesting,    setRequesting] = useState(false)
  const [reqError,      setReqError]   = useState('')
  const [people,   setPeople]        = useState(ls?.people_count || 2)
  const [date,     setDate]          = useState(() => {
    if (ls?.service_date_iso) {
      const d = new Date(ls.service_date_iso + 'T12:00:00')
      return isBefore(d, minDate) ? minDate : d
    }
    return minDate
  })
  const [time,     setTime]          = useState(() => {
    if (ls?.service_time && ls.service_time !== 'A confirmar') return ls.service_time
    // Padrão: 30 min a partir de agora, arredondado para próximo intervalo de 30min
    const now = new Date()
    const totalMins = now.getHours() * 60 + now.getMinutes() + 30
    const rounded   = Math.ceil(totalMins / 30) * 30
    const h = Math.floor(rounded / 60) % 24
    const m = rounded % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
  })
  const [cart,     setCart]          = useState(() => {
    const c = {}
    for (const v of ls?.vehicles || []) {
      const id = v.vehicle_id || v.vehicleId
      if (id) c[id] = (c[id] || 0) + (v.qty || 1)
    }
    return c
  })

  const { data: tourVehiclesData, isLoading: tvLoading } = useQuery({
    queryKey: ['tour-vehicles-edit', ls?.service_id],
    queryFn:  () => api.getTourVehicles(ls.service_id),
    enabled:  !!(isPrivateTour && ls?.service_id),
  })
  const { data: allVehiclesData } = useQuery({
    queryKey: ['all-vehicles'],
    queryFn:  () => api.getVehicles(),
    enabled:  isTransfer && editing,
  })

  // Recálculo autoritativo no servidor (alta temporada / feriado) — só para
  // EXIBIR exatamente o que será cobrado. Veículos vêm do estado `cart`.
  const calcVehicles = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ vehicleId: id, quantity: q }))
  const dateISO = format(date, 'yyyy-MM-dd')
  const { data: tourCalc } = useQuery({
    queryKey: ['checkout-calc', ls?.service_id, isPrivateTour ? 'private' : 'shared', dateISO, people, JSON.stringify(calcVehicles)],
    queryFn:  () => api.calculateTour(ls.service_id, {
      region_id:    ls.region_id,
      mode:         isPrivateTour ? 'private' : 'shared',
      service_date: dateISO,
      people_count: people,
      vehicles:     calcVehicles,
    }),
    enabled:   (isPrivateTour || isSharedTour) && !!ls?.service_id && !!ls?.region_id && (isSharedTour || calcVehicles.length > 0),
    staleTime: 30_000,
    retry:     false,
  })

  // Translado tabelado: alta temporada/feriado calculado sobre o subtotal real
  // (preço da rota × veículos). Translado personalizado (vem com quote_id) já
  // tem preço fechado pela cooperativa, então não recebe acréscimo automático.
  const transferQty      = calcVehicles.reduce((s, v) => s + v.quantity, 0)
  const transferSubtotal = isTransfer
    ? Math.round(Number(ls?.transfer_unit_price || 0) * transferQty * 100) / 100
    : 0
  const { data: transferCalc } = useQuery({
    queryKey: ['checkout-surcharge-transfer', ls?.region_id, dateISO, transferSubtotal],
    queryFn:  () => api.transferSurcharge({
      region_id:    ls.region_id,
      service_date: dateISO,
      subtotal:     transferSubtotal,
    }),
    enabled:   isTransfer && !ls?.quote_id && !!ls?.region_id && transferSubtotal > 0,
    staleTime: 30_000,
    retry:     false,
  })

  const serverCalc = tourCalc || transferCalc

  /* ── Cupom de desconto (criado pelo admin) ──────────────────
     Valida no servidor para mostrar o desconto na hora; a aplicação
     autoritativa acontece de novo na criação da reserva. */
  const [couponInput,   setCouponInput]   = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null) // { code, discount }
  const [couponErr,     setCouponErr]     = useState('')
  const [couponBusy,    setCouponBusy]    = useState(false)

  // Cupom que chegou por WhatsApp: já vem preenchido, senão o cliente teria de
  // decorar o código da mensagem e digitar na mão — é aí que a oferta se perde.
  useEffect(() => {
    const guardado = lerOferta()
    if (guardado) setCouponInput(guardado)
  }, [])


  /* ── Early return after hooks ────────────────────────────── */
  if (!ls) { navigate(-1); return null }

  /* ── Derived ─────────────────────────────────────────────── */
  const tourVehicleOptions = tourVehiclesData || []
  const transferVehicleOptions = (
    Array.isArray(allVehiclesData) ? allVehiclesData : allVehiclesData?.vehicles || []
  ).filter(v => v.is_transfer_allowed)
  const vehicleOptions  = isPrivateTour ? tourVehicleOptions : isTransfer ? transferVehicleOptions : []
  const vehiclesLoading = isPrivateTour && tvLoading

  const cartItems = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const vehicle = vehicleOptions.find(v => v.id === id)
      return vehicle ? { vehicle, qty } : null
    })
    .filter(Boolean)

  const cartCapacity  = cartItems.reduce((s, { vehicle, qty }) => s + vehicle.seat_capacity * qty, 0)
  const cartHasItems  = cartItems.length > 0

  const unitPriceFor = (vehicle) => {
    if (isPrivateTour)                       return vehicle.base_price ?? null
    if (isTransfer && ls.transfer_unit_price) return ls.transfer_unit_price
    return null
  }

  const hasPricing = !isPrivateTour || !cartHasItems ||
    cartItems.every(({ vehicle }) => vehicle.base_price != null && !isNaN(Number(vehicle.base_price)))

  const activeTotal = (() => {
    if (isPrivateTour && cartHasItems)
      return cartItems.reduce((s, { vehicle, qty }) => s + (Number(vehicle.base_price) || 0) * qty, 0)
    if (isSharedTour && ls.price_per_person)
      return Number(ls.price_per_person) * people
    if (isTransfer && ls.transfer_unit_price && cartHasItems)
      return Number(ls.transfer_unit_price) * cartItems.reduce((s, { qty }) => s + qty, 0)
    return ls.total_price
  })()

  // Acréscimo de data (do recálculo do servidor) e total a exibir/cobrar.
  // Passeios trazem `totalAmount` já fechado; translado tabelado soma o
  // acréscimo ao subtotal exibido.
  const dateSurcharge = Number(serverCalc?.seasonAdditional) || 0
  const baseDisplayTotal = (serverCalc && typeof serverCalc.totalAmount === 'number')
    ? serverCalc.totalAmount
    : activeTotal + dateSurcharge
  const couponDiscount = Math.min(Number(appliedCoupon?.discount) || 0, baseDisplayTotal)
  const displayTotal   = Math.round((baseDisplayTotal - couponDiscount) * 100) / 100

  async function applyCouponCode() {
    const code = couponInput.trim()
    if (!code || couponBusy) return
    setCouponBusy(true); setCouponErr('')
    try {
      const r = await api.validateCoupon({
        coupon_code:  code,
        service_type: ls.service_type,
        region_id:    ls.region_id || undefined,
        subtotal:     baseDisplayTotal,
      })
      setAppliedCoupon({ code: code.toUpperCase(), discount: Number(r?.discount) || 0 })
    } catch (err) {
      setAppliedCoupon(null)
      setCouponErr(err?.message || t('checkoutPg.coupon.invalid'))
    } finally {
      setCouponBusy(false)
    }
  }

  const capacityOk  = !hasVehicles || (cartHasItems && cartCapacity >= people)
  const canSave     = capacityOk
  const canProceed  = hasPricing && !!time

  const dateLabel = isToday(date) ? t('checkoutPg.date.today')
    : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? t('checkoutPg.date.tomorrow')
    : format(date, "d 'de' MMMM", { locale: ptBR })

  const vehicleLabel = cartHasItems
    ? cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ')
    : ls.vehicle_name

  const details = [
    ...(ls.origin_text      ? [{ icon: MapPin,    label: t('checkoutPg.labels.origin'),      value: ls.origin_text }]      : []),
    ...(ls.destination_text ? [{ icon: MapPin,    label: t('checkoutPg.labels.destination'), value: ls.destination_text }] : []),
    { icon: Calendar, label: t('checkoutPg.labels.date'), value: dateLabel },
    { icon: Clock,    label: t('checkoutPg.labels.time'), value: time || 'A confirmar' },
    { icon: Users,    label: t('checkoutPg.labels.people'), value: t('checkoutPg.peopleCount', { count: people }) },
    ...(hasVehicles && vehicleLabel ? [{ icon: Car, label: t('checkoutPg.labels.vehicle'), value: vehicleLabel }] : []),
  ]

  const paymentState = {
    region_id:       ls.region_id,
    service_type:    ls.service_type,
    service_id:      ls.service_id,
    booking_mode:    ls.booking_mode,
    service_date:    dateLabel,
    service_date_iso: format(date, 'yyyy-MM-dd'),
    service_time:    time || 'A confirmar',
    people_count:    people,
    vehicles:        cartHasItems
      ? cartItems.map(({ vehicle, qty }) => ({ vehicle_id: vehicle.id, qty, unit_price: Number(unitPriceFor(vehicle)) || 0 }))
      : ls.vehicles,
    // Cupom validado: o servidor reaplica e desconta do total autoritativo.
    coupon_code:     appliedCoupon?.code || undefined,
    // `total_price` é a BASE que o servidor usa para cobrar. Em translado é o
    // subtotal CRU (sem acréscimo) — o servidor soma a alta temporada uma única
    // vez. `display_total` é só para exibição (já com o acréscimo).
    total_price:     isTransfer ? activeTotal : baseDisplayTotal,
    display_total:   displayTotal,
    service_name:    ls.service_name,
    cover_image_url: ls.cover_image_url || undefined,
    // Venda direta (link /c/<slug>): a reserva nasce atribuída à cooperativa
    // e pronta para pagar — o servidor valida o slug.
    partner_slug:    getPartnerAttribution()?.slug || undefined,
    // Indicação de afiliado (/a/<código>): 5% de comissão quando a reserva
    // indicada é paga — o servidor resolve o código e trava autoindicação.
    affiliate_code:  getAffiliateAttribution()?.code || undefined,
  }

  // Solicita a reserva (SEM pagar). A reserva fica aguardando uma cooperativa
  // aceitar; o pagamento acontece depois, em Minhas Reservas.
  async function handleRequest() {
    if (requesting || !canProceed) return
    setRequesting(true)
    setReqError('')
    try {
      const result = await api.requestBooking(paymentState)
      // Solicitação enviada: tira o rascunho deste serviço do carrinho flutuante
      if (ls?.service_id) removeCartItem(ls.service_id)

      // Fluxo "Solicitar tudo": há mais itens na fila → próximo Resumo.
      const cb = ls?.cartBatch
      const doneResults = cb
        ? [...(cb.results || []), { name: ls.service_name, booking_code: result.booking_code }]
        : null
      if (cb && cb.index + 1 < cb.queue.length) {
        const next = cb.queue[cb.index + 1]
        navigate('/checkout/resumo', {
          replace: true,
          state: {
            ...checkoutStateFor(next),
            cartBatch: { ...cb, index: cb.index + 1, results: doneResults },
          },
        })
        return
      }

      // Venda direta (link da cooperativa): a reserva já nasce aceita — vai
      // direto para o pagamento, sem passar pela tela "aguardando aceite".
      if (result.status_commercial === 'awaiting_payment' && !doneResults) {
        navigate('/checkout/pagamento', {
          replace: true,
          state: {
            ...paymentState,
            total_price:         result.amount,
            existing_booking_id: result.booking_id,
            booking_code:        result.booking_code,
          },
        })
        return
      }

      navigate('/checkout/solicitado', {
        state: {
          ...paymentState,
          booking_id:   result.booking_id,
          booking_code: result.booking_code,
          amount:       result.amount,
          ...(doneResults ? { batchResults: doneResults } : {}),
        },
      })
    } catch (err) {
      setReqError(err?.message || t('checkoutPg.error.requestFailed'))
    } finally {
      setRequesting(false)
    }
  }

  const idx   = gi(ls.service_id || ls.service_name)
  const GIcon = TOUR_ICONS[idx]

  return (
    <div className="min-h-screen">

      {/* Header */}
      <header className="bg-white px-4 pt-12 pb-4 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => editing ? setEditing(false) : navigate(-1)}
            className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">
            {editing
              ? t('checkoutPg.header.editTitle')
              : (ls?.cartBatch
                  ? t('checkoutPg.header.confirmProgress', { current: ls.cartBatch.index + 1, total: ls.cartBatch.queue.length })
                  : t('checkoutPg.header.summaryTitle'))}
          </h1>
        </div>
      </header>

      <main className="px-4 pt-4 pb-36 space-y-3">

        {/* Cutoff banner */}
        {isAfterCutoff && cutoffLabel && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <Clock size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-amber-800">{t('checkoutPg.cutoff.title')}</p>
              <p className="text-[12px] text-amber-700 mt-0.5 leading-relaxed">
                {t('checkoutPg.cutoff.description', { time: cutoffLabel })}
              </p>
            </div>
          </div>
        )}

        {/* Service Hero */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <div className="h-[120px] relative">
            {ls.cover_image_url ? (
              <img src={ls.cover_image_url} alt={ls.service_name} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${GRADIENTS[idx]} flex items-center justify-center`}>
                <GIcon size={44} className="text-brand/15" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isTransfer ? 'bg-teal-500 text-white' : 'bg-brand text-white'}`}>
                  {isTransfer ? t('checkoutPg.serviceType.transfer') : t('checkoutPg.serviceType.tour')}
                </span>
                {!isTransfer && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                    {isPrivateTour ? t('checkoutPg.bookingMode.private') : t('checkoutPg.bookingMode.shared')}
                  </span>
                )}
              </div>
              <p className="text-white font-bold text-[17px] leading-tight">{ls.service_name}</p>
            </div>
          </div>
        </div>

        {/* Descrição do passeio / transfer */}
        {ls.short_description && (
          <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
            <p className="text-[13px] text-gray-600 leading-relaxed">{ls.short_description}</p>
          </div>
        )}

        {/* ── READ MODE ─────────────────────────────────────── */}
        {!editing && (
          <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-bold text-gray-900">{t('checkoutPg.details.title')}</h2>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-[12px] font-semibold text-brand active:opacity-70"
              >
                <Pen size={12} /> {t('checkoutPg.common.edit')}
              </button>
            </div>
            <div className="space-y-2">

              {/* Origin */}
              {ls.origin_text && (
                <div className="flex items-start gap-3 py-1">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={15} className="text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400">{t('checkoutPg.labels.origin')}</p>
                    <p className="text-[13px] font-semibold text-gray-900">{ls.origin_text}</p>
                  </div>
                </div>
              )}

              {/* Destination */}
              {ls.destination_text && (
                <div className="flex items-start gap-3 py-1">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={15} className="text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400">{t('checkoutPg.labels.destination')}</p>
                    <p className="text-[13px] font-semibold text-gray-900">{ls.destination_text}</p>
                  </div>
                </div>
              )}

              {/* Date — tappable inline */}
              <button
                onClick={() => setShowDP(true)}
                className="w-full flex items-center gap-3 py-1 active:bg-gray-50 rounded-xl transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <Calendar size={15} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400">{t('checkoutPg.labels.date')}</p>
                  <p className="text-[13px] font-semibold text-gray-900">{dateLabel}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </button>

              {/* Time — tappable inline, required */}
              <div className="relative">
                <button
                  onClick={() => timeRef.current?.showPicker?.() || timeRef.current?.focus()}
                  className={`w-full flex items-center gap-3 py-1 active:bg-gray-50 rounded-xl transition-colors text-left ${!time ? 'bg-amber-50 rounded-xl' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${!time ? 'bg-amber-100' : 'bg-orange-50'}`}>
                    <Clock size={15} className={!time ? 'text-amber-500' : 'text-brand'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400">
                      {t('checkoutPg.labels.time')} <span className="text-amber-500 font-bold">*</span>
                    </p>
                    <p className={`text-[13px] font-semibold ${time ? 'text-gray-900' : 'text-amber-500'}`}>
                      {time || t('checkoutPg.time.select')}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
                <input
                  ref={timeRef}
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full cursor-pointer"
                />
              </div>

              {/* People */}
              <div className="flex items-start gap-3 py-1">
                <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Users size={15} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-400">{t('checkoutPg.labels.people')}</p>
                  <p className="text-[13px] font-semibold text-gray-900">{t('checkoutPg.peopleCount', { count: people })}</p>
                </div>
              </div>

              {/* Vehicle */}
              {hasVehicles && vehicleLabel && (
                <div className="flex items-start gap-3 py-1">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
                    <Car size={15} className="text-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400">{t('checkoutPg.labels.vehicle')}</p>
                    <p className="text-[13px] font-semibold text-gray-900">{vehicleLabel}</p>
                  </div>
                </div>
              )}

              {/* Required hint */}
              {!time && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-1">
                  <AlertCircle size={12} className="text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-700 font-medium">{t('checkoutPg.hint.selectTime')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── EDIT MODE ─────────────────────────────────────── */}
        {editing && (
          <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] space-y-4">
            <p className="text-[15px] font-bold text-gray-900">{t('checkoutPg.editMode.title')}</p>

            {/* Date */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('checkoutPg.labels.date')}</p>
              <button
                onClick={() => setShowDP(true)}
                className="w-full flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
              >
                <Calendar size={15} className="text-brand shrink-0" />
                <span className="text-[14px] font-semibold text-gray-800">{dateLabel}</span>
              </button>
            </div>

            {/* Time — todos os tipos */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                {t('checkoutPg.labels.time')} <span className="text-amber-500">*</span>
              </p>
              <div className="relative">
                <button
                  onClick={() => timeRef.current?.showPicker?.() || timeRef.current?.focus()}
                  className="w-full flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
                >
                  <Clock size={15} className="text-brand shrink-0" />
                  <span className={`text-[14px] font-semibold ${time ? 'text-gray-800' : 'text-amber-500'}`}>
                    {time || t('checkoutPg.time.select')}
                  </span>
                </button>
                <input
                  ref={timeRef}
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full cursor-pointer"
                />
              </div>
            </div>

            {/* People */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{t('checkoutPg.labels.passengers')}</p>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-brand" />
                  <span className="text-[14px] font-semibold text-gray-800">
                    {t('checkoutPg.peopleCount', { count: people })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPeople(p => Math.max(1, p - 1))}
                    className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Minus size={12} className="text-gray-600" />
                  </button>
                  <span className="text-[16px] font-bold text-gray-900 w-5 text-center tabular-nums">{people}</span>
                  <button
                    onClick={() => setPeople(p => Math.min(20, p + 1))}
                    className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <Plus size={12} className="text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Vehicles */}
            {hasVehicles && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{t('checkoutPg.labels.vehicles')}</p>
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    capacityOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-500'
                  }`}>
                    {capacityOk
                      ? <><Check size={10} /> {cartCapacity}/{people} pax</>
                      : <><AlertCircle size={10} /> {cartCapacity}/{people} pax</>
                    }
                  </div>
                </div>

                {!capacityOk && (
                  <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2 mb-2 border border-red-100">
                    <AlertCircle size={12} className="text-red-400 shrink-0" />
                    <p className="text-[11px] text-red-600">
                      {t('checkoutPg.capacityInsufficient', { count: people })}
                    </p>
                  </div>
                )}

                {vehiclesLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : vehicleOptions.length > 0 ? (
                  <div className="space-y-2">
                    {vehicleOptions.map(v => (
                      <VehicleRow
                        key={v.id}
                        vehicle={v}
                        qty={cart[v.id] || 0}
                        unitPrice={unitPriceFor(v)}
                        onAdd={()    => setCart(c => ({ ...c, [v.id]: (c[v.id] || 0) + 1 }))}
                        onRemove={() => setCart(c => ({ ...c, [v.id]: Math.max(0, (c[v.id] || 1) - 1) }))}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-400 text-center py-3">{t('checkoutPg.vehicles.empty')}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Price Breakdown */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <h2 className="text-[15px] font-bold text-gray-900 mb-3">{t('checkoutPg.price.title')}</h2>
          {!hasPricing && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              <AlertCircle size={13} className="text-amber-500 shrink-0" />
              <p className="text-[11px] text-amber-700">{t('checkoutPg.price.notConfigured')}</p>
            </div>
          )}
          <div className="space-y-2">
            {isPrivateTour && cartHasItems ? (
              cartItems.map(({ vehicle, qty }) => (
                <div key={vehicle.id} className="flex items-center justify-between">
                  <span className="text-[13px] text-gray-500">{qty}x {vehicle.name}</span>
                  <span className="text-[13px] font-semibold text-gray-900">
                    {vehicle.base_price != null ? `R$ ${fmt(Number(vehicle.base_price) * qty)}` : '—'}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-500">
                  {isSharedTour ? t('checkoutPg.price.perPerson', { count: people }) : isTransfer ? t('checkoutPg.serviceType.transfer') : t('checkoutPg.labels.vehicles')}
                </span>
                <span className="text-[13px] font-semibold text-gray-900">R$ {fmt(activeTotal)}</span>
              </div>
            )}
            {dateSurcharge > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-amber-600">{t('checkoutPg.price.surcharge')}</span>
                <span className="text-[13px] font-semibold text-amber-600">+ R$ {fmt(dateSurcharge)}</span>
              </div>
            )}

            {/* Cupom de desconto */}
            {appliedCoupon ? (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-emerald-600 font-semibold">
                  {t('checkoutPg.coupon.applied', { code: appliedCoupon.code })}
                  <button
                    onClick={() => { setAppliedCoupon(null); setCouponInput('') }}
                    className="ml-2 text-[11px] text-gray-400 underline"
                  >
                    {t('checkoutPg.common.remove')}
                  </button>
                </span>
                <span className="text-[13px] font-semibold text-emerald-600">− R$ {fmt(couponDiscount)}</span>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponErr('') }}
                    placeholder={t('checkoutPg.coupon.placeholder')}
                    className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-[13px] text-gray-800 uppercase tracking-wide outline-none focus:ring-2 focus:ring-brand/30 placeholder:normal-case placeholder:tracking-normal"
                  />
                  <button
                    onClick={applyCouponCode}
                    disabled={!couponInput.trim() || couponBusy}
                    className="shrink-0 border border-brand/40 text-brand text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 disabled:opacity-40"
                  >
                    {couponBusy ? t('checkoutPg.coupon.validating') : t('checkoutPg.coupon.apply')}
                  </button>
                </div>
                {couponErr && <p className="text-[11px] text-red-500 mt-1">{couponErr}</p>}
              </div>
            )}

            <div className="border-t border-gray-100 pt-2 mt-1 flex items-center justify-between">
              <span className="text-[15px] font-bold text-gray-900">{t('checkoutPg.price.total')}</span>
              {hasPricing
                ? <span className="text-[22px] font-bold text-brand">R$ {fmt(displayTotal)}</span>
                : <span className="text-[14px] font-semibold text-amber-600">{t('checkoutPg.price.toBeConfirmed')}</span>
              }
            </div>
          </div>
        </div>

        {/* Cancel policy */}
        <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
          <div className="flex items-start gap-2.5">
            <Shield size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-blue-900 mb-0.5">{t('checkoutPg.policy.title')}</p>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                {t('checkoutPg.policy.description')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-1">
          <AlertCircle size={13} className="text-gray-400 shrink-0" />
          <p className="text-[11px] text-gray-400">{t('checkoutPg.notice.sentToCoops')}</p>
        </div>

        {reqError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-600">{reqError}</p>
          </div>
        )}
      </main>

      {/* Fixed Bottom */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="mb-3">
          <p className="text-[11px] text-gray-400">{t('checkoutPg.footer.estimatedTotal')}</p>
          {hasPricing
            ? <p className="text-[20px] font-bold text-brand">R$ {fmt(displayTotal)}</p>
            : <p className="text-[14px] font-semibold text-amber-600">{t('checkoutPg.footer.priceToConfirm')}</p>
          }
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="shrink-0 px-4 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 active:bg-gray-50 transition-colors"
              >
                {t('checkoutPg.common.cancel')}
              </button>
              <button
                onClick={canSave ? () => setEditing(false) : undefined}
                className={`flex-1 py-3 rounded-xl font-bold text-[14px] transition-all ${
                  canSave
                    ? 'bg-brand text-white shadow-md active:bg-orange-700 active:scale-[0.97]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {t('checkoutPg.editMode.save')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="shrink-0 px-4 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 active:bg-gray-50 transition-colors"
              >
                {t('checkoutPg.common.edit')}
              </button>
              <button
                onClick={canProceed ? handleRequest : undefined}
                disabled={!canProceed || requesting}
                className={`flex-1 py-3 rounded-xl font-bold text-[14px] transition-all ${
                  canProceed && !requesting
                    ? 'bg-brand text-white shadow-md active:bg-orange-700 active:scale-[0.97]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {requesting ? t('checkoutPg.common.sending') : !hasPricing ? t('checkoutPg.footer.noPriceConfigured') : !time ? t('checkoutPg.footer.selectTime') : t('checkoutPg.footer.requestBooking')}
              </button>
            </>
          )}
        </div>
      </div>

      {showDatePicker && (
        <DatePickerSheet value={date} onChange={setDate} onClose={() => setShowDP(false)} minDate={minDate} />
      )}
    </div>
  )
}
