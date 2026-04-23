import { useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
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
function DatePickerSheet({ value, onChange, onClose }) {
  const today = startOfDay(new Date())
  const [view, setView] = useState(startOfMonth(value))
  const days   = eachDayOfInterval({ start: startOfMonth(view), end: endOfMonth(view) })
  const offset = getDay(startOfMonth(view))
  const canPrev = !isBefore(subMonths(view, 1), startOfMonth(today))
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">Escolha a data</p>
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
          {['D','S','T','Q','Q','S','S'].map((d,i) => <div key={i} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>)}
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
          <button onClick={onClose} className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform">Confirmar</button>
        </div>
      </div>
    </>
  )
}

/* ── Vehicle row with +/- ───────────────────────────────────── */
function VehicleRow({ vehicle, qty, unitPrice, onAdd, onRemove }) {
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
          <span className="text-[11px] text-gray-400">Até {vehicle.seat_capacity} pessoas</span>
        </div>
        {unitPrice && (
          <p className="text-[11px] text-gray-500 mt-0.5">R$ {Number(unitPrice).toLocaleString('pt-BR')}<span className="text-gray-400">/veículo</span></p>
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
export default function CheckoutSummary() {
  const navigate       = useNavigate()
  const { state: ls }  = useLocation()
  const timeRef        = useRef(null)

  const isPrivateTour  = ls?.service_type === 'tour' && ls?.booking_mode === 'private'
  const isSharedTour   = ls?.service_type === 'tour' && ls?.booking_mode !== 'private'
  const isTransfer     = ls?.service_type === 'transfer'
  const hasVehicles    = isPrivateTour || isTransfer

  /* ── All hooks unconditionally ──────────────────────────── */
  const [editing,       setEditing]  = useState(false)
  const [showDatePicker, setShowDP]  = useState(false)
  const [people,   setPeople]        = useState(ls?.people_count || 2)
  const [date,     setDate]          = useState(() =>
    ls?.service_date_iso
      ? new Date(ls.service_date_iso + 'T12:00:00')
      : startOfDay(new Date())
  )
  const [time,     setTime]          = useState(
    ls?.service_time && ls.service_time !== 'A confirmar' ? ls.service_time : ''
  )
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
    if (isPrivateTour)                      return vehicle.base_price
    if (isTransfer && ls.transfer_unit_price) return ls.transfer_unit_price
    return null
  }

  const activeTotal = (() => {
    if (isPrivateTour && cartHasItems)
      return cartItems.reduce((s, { vehicle, qty }) => s + Number(vehicle.base_price) * qty, 0)
    if (isSharedTour && ls.price_per_person)
      return Number(ls.price_per_person) * people
    if (isTransfer && ls.transfer_unit_price && cartHasItems)
      return Number(ls.transfer_unit_price) * cartItems.reduce((s, { qty }) => s + qty, 0)
    return ls.total_price
  })()

  const capacityOk = !hasVehicles || (cartHasItems && cartCapacity >= people)
  const canSave    = capacityOk

  const dateLabel = isToday(date) ? 'Hoje'
    : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? 'Amanhã'
    : format(date, "d 'de' MMMM", { locale: ptBR })

  const vehicleLabel = cartHasItems
    ? cartItems.map(({ vehicle, qty }) => `${qty}x ${vehicle.name}`).join(' + ')
    : ls.vehicle_name

  const details = [
    ...(ls.origin_text      ? [{ icon: MapPin,    label: 'Saída',    value: ls.origin_text }]      : []),
    ...(ls.destination_text ? [{ icon: MapPin,    label: 'Destino',  value: ls.destination_text }] : []),
    { icon: Calendar, label: 'Data',    value: dateLabel },
    { icon: Clock,    label: 'Horário', value: time || 'A confirmar' },
    { icon: Users,    label: 'Pessoas', value: `${people} ${people === 1 ? 'pessoa' : 'pessoas'}` },
    ...(hasVehicles && vehicleLabel ? [{ icon: Car, label: 'Veículo', value: vehicleLabel }] : []),
  ]

  const paymentState = {
    region_id:    ls.region_id,
    service_type: ls.service_type,
    service_id:   ls.service_id,
    booking_mode: ls.booking_mode,
    service_date: dateLabel,
    service_time: time || 'A confirmar',
    people_count: people,
    vehicles:     cartHasItems
      ? cartItems.map(({ vehicle, qty }) => ({ vehicle_id: vehicle.id, qty }))
      : ls.vehicles,
    total_price:  activeTotal,
    service_name: ls.service_name,
  }

  const idx   = gi(ls.service_id || ls.service_name)
  const GIcon = TOUR_ICONS[idx]

  return (
    <div className="min-h-screen bg-[#F8F8F8]">

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
            {editing ? 'Editar reserva' : 'Resumo da reserva'}
          </h1>
        </div>
      </header>

      <main className="px-4 pt-4 pb-36 space-y-3">

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
                  {isTransfer ? 'Transfer' : 'Passeio'}
                </span>
                {!isTransfer && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                    {isPrivateTour ? 'Privativo' : 'Compartilhado'}
                  </span>
                )}
              </div>
              <p className="text-white font-bold text-[17px] leading-tight">{ls.service_name}</p>
            </div>
          </div>
        </div>

        {/* ── READ MODE ─────────────────────────────────────── */}
        {!editing && (
          <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-bold text-gray-900">Detalhes da reserva</h2>
              <button
                onClick={() => setEditing(true)}
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
        )}

        {/* ── EDIT MODE ─────────────────────────────────────── */}
        {editing && (
          <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] space-y-4">
            <p className="text-[15px] font-bold text-gray-900">Editar detalhes</p>

            {/* Date */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Data</p>
              <button
                onClick={() => setShowDP(true)}
                className="w-full flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
              >
                <Calendar size={15} className="text-brand shrink-0" />
                <span className="text-[14px] font-semibold text-gray-800">{dateLabel}</span>
              </button>
            </div>

            {/* Time — transfers only */}
            {isTransfer && (
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Horário</p>
                <button
                  onClick={() => timeRef.current?.showPicker?.() || timeRef.current?.focus()}
                  className="w-full flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 active:scale-[0.98] transition-transform relative"
                >
                  <Clock size={15} className="text-brand shrink-0" />
                  <span className="text-[14px] font-semibold text-gray-800">{time || 'Selecionar'}</span>
                  <input
                    ref={timeRef}
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full cursor-pointer"
                  />
                </button>
              </div>
            )}

            {/* People */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Passageiros</p>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-brand" />
                  <span className="text-[14px] font-semibold text-gray-800">
                    {people} {people === 1 ? 'pessoa' : 'pessoas'}
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
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Veículos</p>
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
                      Capacidade insuficiente para {people} {people === 1 ? 'pessoa' : 'pessoas'}. Adicione mais veículos.
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
                  <p className="text-[12px] text-gray-400 text-center py-3">Nenhum veículo disponível</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Price Breakdown */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
          <h2 className="text-[15px] font-bold text-gray-900 mb-3">Resumo de preços</h2>
          <div className="space-y-2">
            {isPrivateTour && cartHasItems ? (
              cartItems.map(({ vehicle, qty }) => (
                <div key={vehicle.id} className="flex items-center justify-between">
                  <span className="text-[13px] text-gray-500">{qty}x {vehicle.name}</span>
                  <span className="text-[13px] font-semibold text-gray-900">R$ {fmt(Number(vehicle.base_price) * qty)}</span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-gray-500">
                  {isSharedTour ? `${people}x por pessoa` : isTransfer ? 'Transfer' : 'Veículos'}
                </span>
                <span className="text-[13px] font-semibold text-gray-900">R$ {fmt(activeTotal)}</span>
              </div>
            )}
            <div className="border-t border-gray-100 pt-2 mt-1 flex items-center justify-between">
              <span className="text-[15px] font-bold text-gray-900">Total</span>
              <span className="text-[22px] font-bold text-brand">R$ {fmt(activeTotal)}</span>
            </div>
          </div>
        </div>

        {/* Cancel policy */}
        <div className="bg-blue-50 rounded-2xl p-3.5 border border-blue-100">
          <div className="flex items-start gap-2.5">
            <Shield size={15} className="text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-bold text-blue-900 mb-0.5">Política de cancelamento</p>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Cancelamento gratuito até 24h antes. Após esse prazo, pode haver cobrança de taxa.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-1">
          <AlertCircle size={13} className="text-gray-400 shrink-0" />
          <p className="text-[11px] text-gray-400">Sua reserva será enviada à cooperativa para confirmação após o pagamento.</p>
        </div>
      </main>

      {/* Fixed Bottom */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 z-30 px-4 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="mb-3">
          <p className="text-[11px] text-gray-400">Total a pagar</p>
          <p className="text-[20px] font-bold text-brand">R$ {fmt(activeTotal)}</p>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="shrink-0 px-4 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 active:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={canSave ? () => setEditing(false) : undefined}
                className={`flex-1 py-3 rounded-xl font-bold text-[14px] transition-all ${
                  canSave
                    ? 'bg-brand text-white shadow-md active:bg-orange-700 active:scale-[0.97]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Salvar alterações
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="shrink-0 px-4 py-3 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-700 active:bg-gray-50 transition-colors"
              >
                Editar
              </button>
              <button
                onClick={() => navigate('/checkout/pagamento', { state: paymentState })}
                className="flex-1 bg-brand text-white py-3 rounded-xl font-bold text-[14px] shadow-md active:bg-orange-700 active:scale-[0.97] transition-all"
              >
                Ir para pagamento
              </button>
            </>
          )}
        </div>
      </div>

      {showDatePicker && (
        <DatePickerSheet value={date} onChange={setDate} onClose={() => setShowDP(false)} />
      )}
    </div>
  )
}
