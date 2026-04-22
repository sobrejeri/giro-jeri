import { useState, useRef, useMemo } from 'react'
import { useQuery }    from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth }     from '../contexts/AuthContext'
import { api }         from '../lib/api'
import {
  MapPin, Calendar, Clock, Users, ChevronDown, ChevronLeft, ChevronRight,
  Minus, Plus, Car, X, Check, Info,
} from 'lucide-react'
import {
  format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isBefore, addMonths, subMonths, getDay, isToday, addDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

/* ── Date picker (bottom sheet) ─────────────────────────────── */
function DateSheet({ value, onChange, onClose }) {
  const today  = startOfDay(new Date())
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
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={14} className="text-gray-500" /></button>
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
          {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
          {days.map(day => {
            const past = isBefore(day, today)
            const sel  = isSameDay(day, value)
            return (
              <button key={day.toISOString()} disabled={past} onClick={() => { onChange(day); onClose() }}
                className={`aspect-square flex items-center justify-center rounded-full text-[13px] transition-all
                  ${sel ? 'bg-brand text-white font-bold' : ''}
                  ${!sel && isToday(day) ? 'text-brand font-bold' : ''}
                  ${!sel && !isToday(day) && !past ? 'text-gray-800 active:bg-gray-100 font-medium' : ''}
                  ${past ? 'text-gray-300 cursor-not-allowed' : ''}`}
              >{format(day, 'd')}</button>
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

/* ── Route picker (bottom sheet) ────────────────────────────── */
function RouteSheet({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-[16px] font-bold text-gray-900">{title}</p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={14} className="text-gray-500" /></button>
        </div>
        <div className="px-4 pb-8 space-y-2 max-h-72 overflow-y-auto">
          {options.map(opt => (
            <button key={opt} onClick={() => { onSelect(opt); onClose() }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all active:scale-[0.98] ${selected === opt ? 'border-brand bg-orange-50' : 'border-gray-100 bg-white'}`}
            >
              <div className="flex items-center gap-3">
                <MapPin size={14} className={selected === opt ? 'text-brand' : 'text-gray-400'} />
                <span className={`text-[13px] font-semibold ${selected === opt ? 'text-brand' : 'text-gray-800'}`}>{opt}</span>
              </div>
              {selected === opt && <Check size={14} className="text-brand" />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* ── Vehicle row ─────────────────────────────────────────────── */
function VehicleRow({ vehicle, price, selected, onSelect }) {
  return (
    <button onClick={onSelect}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-all active:scale-[0.99] ${selected ? 'bg-brand/5 border-l-4 border-brand' : 'border-l-4 border-transparent'}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? 'bg-brand' : 'bg-gray-100'}`}>
        <Car size={18} className={selected ? 'text-white' : 'text-gray-400'} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className={`text-[13px] font-bold truncate ${selected ? 'text-gray-900' : 'text-gray-800'}`}>{vehicle.name}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Até {vehicle.seat_capacity} pessoas</p>
      </div>
      {price && (
        <span className={`text-[14px] font-bold shrink-0 ${selected ? 'text-brand' : 'text-gray-700'}`}>
          R$ {Number(price).toLocaleString('pt-BR')}
        </span>
      )}
    </button>
  )
}

/* ── Main ───────────────────────────────────────────────────── */
export default function Transfers() {
  const navigate  = useNavigate()
  const { token } = useAuth()
  const timeRef   = useRef(null)

  const [origin,       setOrigin]       = useState('Jericoacoara')
  const [dest,         setDest]         = useState('')
  const [date,         setDate]         = useState(startOfDay(new Date()))
  const [time,         setTime]         = useState('08:00')
  const [people,       setPeople]       = useState(2)
  const [selectedVId,  setSelectedVId]  = useState(null)
  const [notes,        setNotes]        = useState('')
  const [showDate,     setShowDate]     = useState(false)
  const [showOrigin,   setShowOrigin]   = useState(false)
  const [showDest,     setShowDest]     = useState(false)
  const [loading,      setLoading]      = useState(false)

  /* ── Queries ── */
  const { data: routesData } = useQuery({
    queryKey: ['transfer-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })
  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  () => api.getVehicles ? api.getVehicles() : Promise.resolve([]),
  })

  const routes   = Array.isArray(routesData?.routes) ? routesData.routes
                 : Array.isArray(routesData) ? routesData : []
  const vehicles = (Array.isArray(vehiclesData) ? vehiclesData : vehiclesData?.vehicles || [])
                    .filter(v => v.is_transfer_allowed)

  const origins   = useMemo(() => [...new Set(routes.map(r => r.origin_name))], [routes])
  const dests     = useMemo(() => routes.filter(r => r.origin_name === origin).map(r => r.destination_name), [routes, origin])
  const matched   = useMemo(() => routes.find(r => r.origin_name === origin && r.destination_name === dest), [routes, origin, dest])
  const price     = matched ? Number(matched.default_price) : null
  const selV      = vehicles.find(v => v.id === selectedVId)
  const canBook   = !!matched && !!selectedVId && !!time

  const dateLabel = isToday(date) ? 'Hoje'
    : isSameDay(date, addDays(startOfDay(new Date()), 1)) ? 'Amanhã'
    : format(date, 'd MMM', { locale: ptBR })

  async function handleConfirm() {
    if (!token) { navigate('/login'); return }
    if (!canBook) return
    navigate('/checkout/resumo', {
      state: {
        service_name:        `Transfer ${origin} → ${dest}`,
        service_type:        'transfer',
        booking_mode:        'private',
        service_date:        dateLabel,
        service_time:        time,
        people_count:        people,
        origin_text:         origin,
        destination_text:    dest,
        vehicle_name:        selV?.name,
        total_price:         price,
        breakdown:           { 'Transfer': price },
        region_id:           matched?.transfer_id,
        service_id:          matched?.id,
        vehicles:            selV ? [{ vehicle_id: selV.id, qty: 1 }] : [],
      },
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white px-4 pt-5 pb-3 shadow-sm">
        <h1 className="text-[20px] font-extrabold text-gray-900">Transfer</h1>
        <p className="text-[12px] text-gray-400 mt-0.5">Transporte privativo com motorista</p>
      </div>

      <div className="px-4 pt-4 space-y-3">

        {/* ROTA */}
        <section className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Rota</p>

          <button onClick={() => setShowOrigin(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-50 active:bg-gray-50">
            <div className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-[10px] text-gray-400">Origem</p>
              <p className={`text-[13px] font-semibold ${origin ? 'text-gray-900' : 'text-gray-400'}`}>
                {origin || 'Selecione o ponto de partida'}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          </button>

          <button onClick={() => dests.length ? setShowDest(true) : null}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-gray-100 active:bg-gray-50">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 shrink-0" />
            <div className="flex-1 text-left">
              <p className="text-[10px] text-gray-400">Destino</p>
              <p className={`text-[13px] font-semibold ${dest ? 'text-gray-900' : 'text-gray-400'}`}>
                {dest || (dests.length ? 'Selecione o destino' : 'Escolha a origem primeiro')}
              </p>
            </div>
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          </button>
        </section>

        {/* DATA & HORÁRIO */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Data & Horário</p>
          <div className="flex gap-2 px-4 pb-4">
            <button onClick={() => setShowDate(true)}
              className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform">
              <Calendar size={13} className="text-brand" />
              <div className="text-left">
                <p className="text-[9px] text-gray-400 leading-none">Data</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{dateLabel}</p>
              </div>
            </button>
            <button onClick={() => timeRef.current?.showPicker?.() || timeRef.current?.focus()}
              className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform relative">
              <Clock size={13} className="text-brand" />
              <div className="text-left flex-1">
                <p className="text-[9px] text-gray-400 leading-none">Horário</p>
                <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{time || 'Selecionar'}</p>
              </div>
              <input
                ref={timeRef}
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="absolute inset-0 opacity-0 w-full cursor-pointer"
              />
            </button>
          </div>
        </section>

        {/* PASSAGEIROS */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Passageiros</p>
          <div className="flex items-center justify-between px-4 pb-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-brand" />
              <div>
                <p className="text-[13px] font-bold text-gray-900">{people} passageiro{people !== 1 ? 's' : ''}</p>
                <p className="text-[10px] text-gray-400">Passageiros adicionais a combinar</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPeople(p => Math.max(1, p - 1))}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
                <Minus size={12} className="text-gray-600" />
              </button>
              <span className="text-[15px] font-bold text-gray-900 w-5 text-center tabular-nums">{people}</span>
              <button onClick={() => setPeople(p => Math.min(20, p + 1))}
                className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform">
                <Plus size={12} className="text-white" />
              </button>
            </div>
          </div>
        </section>

        {/* VEÍCULO */}
        {vehicles.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Veículo</p>
            <div className="divide-y divide-gray-50">
              {vehicles.map(v => (
                <VehicleRow
                  key={v.id}
                  vehicle={v}
                  price={price}
                  selected={selectedVId === v.id}
                  onSelect={() => setSelectedVId(v.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* OBSERVAÇÕES */}
        <section className="bg-white rounded-2xl border border-gray-100">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Observações & Bagagens</p>
          <div className="px-4 pb-4">
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: 2 malas grandes, precisamos de cadeirinha..."
              className="w-full text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400"
            />
          </div>
        </section>

        {/* RESUMO */}
        {matched && (
          <section className="bg-white rounded-2xl border border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-3">Resumo do transfer</p>
            <div className="px-4 pb-4 space-y-2.5">
              {[
                { dot: 'bg-brand',    label: 'Origem',      val: origin },
                { dot: 'bg-gray-400', label: 'Destino',     val: dest   },
                { icon: Calendar,     label: 'Data & Hora', val: `${dateLabel} às ${time || '—'}` },
                { icon: Users,        label: 'Passageiros', val: `${people} pessoa${people !== 1 ? 's' : ''}` },
                ...(selV ? [{ icon: Car, label: 'Veículo', val: selV.name }] : []),
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  {row.dot
                    ? <div className={`w-2.5 h-2.5 rounded-full ${row.dot} shrink-0`} />
                    : <row.icon size={13} className="text-brand shrink-0" />}
                  <div className="flex-1 flex items-center justify-between">
                    <p className="text-[12px] text-gray-400">{row.label}</p>
                    <p className="text-[12px] font-semibold text-gray-800">{row.val}</p>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                <p className="text-[13px] font-bold text-gray-900">Total</p>
                <p className="text-[16px] font-extrabold text-brand">R$ {price?.toLocaleString('pt-BR') ?? '—'}</p>
              </div>
            </div>
          </section>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 px-1">
          <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Motorista aparecerá no local de embarque com placa identificada.
            Cancelamento gratuito até 24h antes.
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 pb-3 z-40">
        <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-100 flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[10px] text-gray-400">Total estimado</p>
            <p className={`text-[16px] font-extrabold ${canBook ? 'text-brand' : 'text-gray-400'}`}>
              {price ? `R$ ${price.toLocaleString('pt-BR')}` : 'Selecione a rota'}
            </p>
          </div>
          <button
            onClick={canBook ? handleConfirm : undefined}
            disabled={loading}
            className={`font-bold rounded-xl px-5 py-2.5 text-[13px] transition-transform ${
              canBook ? 'bg-brand text-white active:scale-95' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {loading ? 'Aguarde…' : 'Confirmar Transfer'}
          </button>
        </div>
      </div>

      {/* Sheets */}
      {showDate   && <DateSheet value={date} onChange={setDate} onClose={() => setShowDate(false)} />}
      {showOrigin && <RouteSheet title="Escolha a origem" options={origins} selected={origin} onSelect={v => { setOrigin(v); setDest('') }} onClose={() => setShowOrigin(false)} />}
      {showDest   && <RouteSheet title="Escolha o destino" options={dests} selected={dest} onSelect={setDest} onClose={() => setShowDest(false)} />}
    </div>
  )
}
