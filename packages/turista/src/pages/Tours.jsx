import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import {
  Minus, Plus, ChevronRight, Zap, Sun, Waves, Anchor,
  Check, Users, Clock, SlidersHorizontal, X
} from 'lucide-react'

const TOUR_ICONS = {
  'buggy':      Zap,
  'por-do-sol': Sun,
  'lagoas':     Waves,
  'barco':      Anchor,
}

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR')}` }

export default function Tours() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get('modo') === 'shared' ? 'shared' : 'private'

  const [mode,      setMode]      = useState(initialMode)
  const [people,    setPeople]    = useState(2)
  const [selectedTour, setSelectedTour] = useState(null)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours'],
    queryFn:  () => api.getTours(),
  })

  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['tour-vehicles', selectedTour?.id],
    queryFn:  () => api.getTourVehicles(selectedTour.id),
    enabled:  !!selectedTour,
  })

  const tours    = toursData?.tours || toursData || []
  const vehicles = vehiclesData?.vehicles || vehiclesData || []
  const privateVehicles = vehicles.filter((v) => v.is_private_allowed)

  const suggestedVehicle = privateVehicles.find((v) => v.seat_capacity >= people)
  const displayVehicles  = privateVehicles.length > 0 ? privateVehicles : vehicles

  const tour = selectedTour
  const vehicle = selectedVehicle || suggestedVehicle

  const sharedPrice = tour?.is_shared_enabled
    ? Number(tour.shared_price_per_person) * people
    : null

  const privatePrice = vehicle
    ? Number(vehicle.base_price || 0)
    : null

  const totalPrice = mode === 'shared' ? sharedPrice : privatePrice

  function handleContinue() {
    if (!token) {
      navigate('/login')
      return
    }
    if (!tour) { alert('Selecione um passeio'); return }
    if (!date)  { alert('Informe a data'); return }
    alert(`Fluxo de pagamento em breve!\n${tour.name}\n${fmt(totalPrice)}`)
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-gray-900 text-base">Passeios</h1>
        <SlidersHorizontal size={18} className="text-gray-500" />
      </div>

      {/* Mode toggle */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setMode('private')}
            className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'private' ? 'bg-brand text-white shadow-sm' : 'text-gray-500'
            }`}
          >
            Privado
          </button>
          <button
            onClick={() => setMode('shared')}
            className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-colors ${
              mode === 'shared' ? 'bg-brand text-white shadow-sm' : 'text-gray-500'
            }`}
          >
            Compartilhado
          </button>
        </div>
      </div>

      {/* Date + Time */}
      <div className="px-4 pb-3 grid grid-cols-2 gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand w-full"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-10 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand w-full"
        />
      </div>

      {/* Escolha o passeio */}
      <div className="mb-4">
        <div className="px-4 flex items-center justify-between mb-2.5">
          <p className="font-semibold text-gray-900 text-sm">Escolha o passeio</p>
          <ChevronRight size={16} className="text-gray-400" />
        </div>
        {isLoading ? (
          <div className="px-4"><PageSpinner /></div>
        ) : (
          <div className="flex gap-3 px-4 overflow-x-auto scrollbar-thin pb-1">
            {tours.map((t) => {
              const Icon = TOUR_ICONS[t.category?.slug] || Zap
              const selected = selectedTour?.id === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTour(t); setSelectedVehicle(null) }}
                  className={`shrink-0 w-36 rounded-2xl overflow-hidden border-2 transition-all ${
                    selected ? 'border-brand shadow-md' : 'border-transparent'
                  }`}
                >
                  <div className="h-20 bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center relative">
                    <Icon size={28} className="text-brand/25" />
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-brand rounded-full flex items-center justify-center">
                        <Check size={11} className="text-white" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 bg-white text-left">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight">{t.name}</p>
                    {t.duration_hours && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-1">
                        <Clock size={9} /> {t.duration_hours}h
                      </span>
                    )}
                    {mode === 'shared' && t.is_shared_enabled && (
                      <p className="text-[10px] font-bold text-brand mt-1">
                        R$ {Number(t.shared_price_per_person).toFixed(0)}/pax
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Número de pessoas */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Número de pessoas</p>
            <p className="text-xs text-gray-400 mt-0.5">Informe quantos vão participar</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPeople((p) => Math.max(1, p - 1))}
              className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:border-brand transition-colors"
            >
              <Minus size={14} className="text-gray-600" />
            </button>
            <span className="font-bold text-gray-900 w-5 text-center">{people}</span>
            <button
              onClick={() => setPeople((p) => Math.min(20, p + 1))}
              className="w-8 h-8 rounded-full bg-brand flex items-center justify-center hover:bg-brand-600 transition-colors"
            >
              <Plus size={14} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Modo Privado — Veículos */}
      {mode === 'private' && selectedTour && (
        <>
          {/* Sugerido */}
          {suggestedVehicle && (
            <div className="px-4 mb-4">
              <p className="font-semibold text-gray-900 text-sm mb-2.5">
                Sugerido para {people} {people === 1 ? 'pessoa' : 'pessoas'}
              </p>
              <div className="bg-brand/5 border border-brand/20 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center shrink-0">
                  <Zap size={18} className="text-brand" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 text-sm">{suggestedVehicle.name}</p>
                  <p className="text-xs text-gray-500">{suggestedVehicle.seat_capacity} lugares</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-brand text-sm">{fmt(suggestedVehicle.base_price)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Catálogo de veículos */}
          <div className="px-4 mb-4">
            <p className="font-semibold text-gray-900 text-sm mb-2.5">Catálogo de veículos</p>
            {vehiclesLoading ? (
              <PageSpinner />
            ) : (
              <div className="space-y-2">
                {displayVehicles.map((v) => {
                  const sel = (selectedVehicle?.id || suggestedVehicle?.id) === v.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVehicle(v)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${
                        sel
                          ? 'border-brand bg-brand/5'
                          : 'border-gray-100 bg-white hover:border-gray-200'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sel ? 'bg-brand/15' : 'bg-gray-100'}`}>
                        <Zap size={18} className={sel ? 'text-brand' : 'text-gray-400'} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">{v.name}</p>
                        <p className="text-[11px] text-gray-400">{v.seat_capacity} lugares · {v.vehicle_type}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-sm ${sel ? 'text-brand' : 'text-gray-700'}`}>
                          {fmt(v.base_price)}
                        </p>
                        {sel && (
                          <div className="w-5 h-5 bg-brand rounded-full flex items-center justify-center ml-auto mt-1">
                            <Check size={11} className="text-white" />
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modo Compartilhado — Info */}
      {mode === 'shared' && selectedTour && tour?.is_shared_enabled && (
        <div className="px-4 mb-4">
          <div className="bg-brand rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white/70 text-xs">Preço por pessoa</p>
                <p className="text-white font-bold text-2xl">
                  R$ {Number(tour.shared_price_per_person).toFixed(0)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-white/70 text-xs">Total ({people} pax)</p>
                <p className="text-white font-bold text-xl">
                  {fmt(Number(tour.shared_price_per_person) * people)}
                </p>
              </div>
            </div>
            <p className="text-white/70 text-xs">
              No passeio compartilhado você viaja com outros grupos. Ótimo custo-benefício!
            </p>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center gap-4">
        {totalPrice ? (
          <div>
            <p className="text-xs text-gray-400">Total</p>
            <p className="font-bold text-gray-900 text-lg">{fmt(totalPrice)}</p>
          </div>
        ) : (
          <div className="flex-1">
            <p className="text-xs text-gray-400">Selecione um passeio para ver o preço</p>
          </div>
        )}
        <Button
          onClick={handleContinue}
          disabled={!selectedTour}
          className="flex-1 max-w-[160px] ml-auto"
          size="lg"
        >
          Continuar <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  )
}
