import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Input, { Select } from '../components/ui/Input'
import Card from '../components/ui/Card'
import {
  Clock, Users, ChevronLeft, CheckCircle, XCircle,
  Zap, Sun, Waves, Anchor, Car, Calendar, UserCheck
} from 'lucide-react'

const CATEGORY_ICONS = {
  'buggy':      Zap,
  'por-do-sol': Sun,
  'lagoas':     Waves,
  'barco':      Anchor,
}

function fmt(value) {
  return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

export default function TourDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { token } = useAuth()

  const [mode,      setMode]      = useState('shared')  // 'shared' | 'private'
  const [people,    setPeople]    = useState(2)
  const [vehicleId, setVehicleId] = useState('')
  const [date,      setDate]      = useState('')
  const [time,      setTime]      = useState('')
  const [calcResult,setCalcResult]= useState(null)
  const [calcLoading,setCalcLoading]=useState(false)
  const [calcError, setCalcError] = useState('')

  const { data: tour, isLoading } = useQuery({
    queryKey: ['tour', id],
    queryFn:  () => api.getTour(id),
  })

  const { data: vehiclesData } = useQuery({
    queryKey: ['tour-vehicles', id],
    queryFn:  () => api.getTourVehicles(id),
    enabled:  !!id,
  })

  const vehicles = vehiclesData?.vehicles || vehiclesData || []
  const privateVehicles = vehicles.filter((v) => v.is_private_allowed)

  const IconComp = CATEGORY_ICONS[tour?.category?.slug] || Zap

  async function handleCalculate(e) {
    e.preventDefault()
    if (!date || !time) return
    setCalcError('')
    setCalcLoading(true)
    try {
      const body = { service_date: date, service_time: time, booking_mode: mode, people_count: Number(people) }
      if (mode === 'private' && vehicleId) body.vehicle_id = vehicleId
      const result = await api.calculateTour(id, body)
      setCalcResult(result)
    } catch (err) {
      setCalcError(err.message || 'Erro ao calcular')
    } finally {
      setCalcLoading(false)
    }
  }

  function handleBook() {
    if (!token) {
      navigate('/login', { state: { from: `/passeios/${id}` } })
      return
    }
    alert('Fluxo de pagamento em breve!')
  }

  if (isLoading) return <PageSpinner />
  if (!tour)     return (
    <div className="max-w-4xl mx-auto px-4 py-20 text-center text-gray-400">
      Passeio não encontrado.
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <Link to="/passeios" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand mb-6 transition-colors">
        <ChevronLeft size={16} />
        Passeios
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero */}
          <div className="h-64 md:h-80 bg-gradient-to-br from-orange-100 to-amber-100 rounded-2xl flex items-center justify-center relative overflow-hidden">
            <IconComp size={80} className="text-brand/15" />
            {tour.highlight_badge && (
              <span className="absolute top-4 left-4 bg-brand text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                {tour.highlight_badge}
              </span>
            )}
          </div>

          {/* Info principal */}
          <div>
            <p className="text-sm font-medium text-brand mb-2">{tour.category?.name}</p>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-gray-900 mb-3">
              {tour.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
              {tour.duration_hours && (
                <span className="flex items-center gap-1.5"><Clock size={15} /> {tour.duration_hours}h de duração</span>
              )}
              {tour.max_people && (
                <span className="flex items-center gap-1.5"><Users size={15} /> até {tour.max_people} pessoas</span>
              )}
              {tour.difficulty_level && (
                <span className="flex items-center gap-1.5"><UserCheck size={15} /> {tour.difficulty_level}</span>
              )}
            </div>
            <p className="text-gray-600 leading-relaxed">{tour.full_description || tour.short_description}</p>
          </div>

          {/* Inclui / Não inclui */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tour.includes_text && (
              <Card className="p-5">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <CheckCircle size={16} className="text-green-500" /> Incluído
                </h4>
                <ul className="space-y-1.5">
                  {tour.includes_text.split(',').map((item, i) => (
                    <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                      <CheckCircle size={13} className="text-green-400 mt-0.5 shrink-0" />
                      {item.trim()}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {tour.cancellation_policy_text && (
              <Card className="p-5">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <XCircle size={16} className="text-red-400" /> Cancelamento
                </h4>
                <p className="text-sm text-gray-600">{tour.cancellation_policy_text}</p>
              </Card>
            )}
          </div>

          {/* Horários */}
          {tour.schedules && tour.schedules.length > 0 && (
            <Card className="p-5">
              <h4 className="font-semibold text-gray-900 mb-3">Horários disponíveis</h4>
              <div className="flex flex-wrap gap-2">
                {tour.schedules.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 bg-orange-50 text-brand text-sm font-medium px-3 py-1.5 rounded-full">
                    <Clock size={13} /> {s.departure_time} — {s.schedule_name}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar — Calculadora / Reserva */}
        <div className="lg:col-span-1">
          <Card className="p-5 sticky top-20">
            <h3 className="font-semibold text-gray-900 mb-4">Calcular e reservar</h3>

            {/* Modo */}
            {tour.is_shared_enabled && tour.is_private_enabled && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => { setMode('shared'); setCalcResult(null) }}
                  className={`h-9 rounded-xl text-sm font-medium transition-colors ${mode === 'shared' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Compartilhado
                </button>
                <button
                  onClick={() => { setMode('private'); setCalcResult(null) }}
                  className={`h-9 rounded-xl text-sm font-medium transition-colors ${mode === 'private' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  Privativo
                </button>
              </div>
            )}

            {/* Modo só compartilhado */}
            {!tour.is_private_enabled && tour.is_shared_enabled && (
              <div className="bg-orange-50 text-brand text-xs font-medium px-3 py-2 rounded-lg mb-4 text-center">
                Apenas compartilhado — R$ {Number(tour.shared_price_per_person).toFixed(2)}/pax
              </div>
            )}

            <form onSubmit={handleCalculate} className="space-y-3">
              <Input
                label="Data"
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); setCalcResult(null) }}
                min={new Date().toISOString().split('T')[0]}
                required
              />
              <Input
                label="Horário"
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); setCalcResult(null) }}
                required
              />
              <Input
                label="Pessoas"
                type="number"
                min={tour.min_people || 1}
                max={tour.max_people || 20}
                value={people}
                onChange={(e) => { setPeople(e.target.value); setCalcResult(null) }}
                required
              />

              {mode === 'private' && privateVehicles.length > 0 && (
                <Select
                  label="Veículo"
                  value={vehicleId}
                  onChange={(e) => { setVehicleId(e.target.value); setCalcResult(null) }}
                >
                  <option value="">Selecione um veículo</option>
                  {privateVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {fmt(v.base_price)}
                    </option>
                  ))}
                </Select>
              )}

              {calcError && (
                <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{calcError}</p>
              )}

              <Button type="submit" variant="outline" className="w-full" disabled={calcLoading}>
                {calcLoading ? 'Calculando…' : 'Calcular preço'}
              </Button>
            </form>

            {calcResult && (
              <div className="mt-4 p-4 bg-orange-50 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Total estimado</p>
                <p className="text-3xl font-bold text-brand">{fmt(calcResult.total_price)}</p>
                {calcResult.breakdown && (
                  <ul className="mt-2 space-y-1">
                    {Object.entries(calcResult.breakdown).map(([k, v]) => (
                      <li key={k} className="text-xs text-gray-500 flex justify-between">
                        <span>{k}</span>
                        <span>{fmt(v)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button className="w-full mt-4" onClick={handleBook}>
                  Reservar agora
                </Button>
              </div>
            )}

            {!calcResult && (
              <p className="text-xs text-gray-400 text-center mt-3">
                Preencha as informações para ver o preço
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
