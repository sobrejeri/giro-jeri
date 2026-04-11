import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import { Textarea } from '../components/ui/Input'
import {
  MapPin, Calendar, Clock, Users, ChevronRight,
  Minus, Plus, Check, Zap, ArrowRight, X,
  MessageSquare, CheckCircle
} from 'lucide-react'

function fmt(v) { return `R$ ${Number(v).toLocaleString('pt-BR')}` }

export default function Transfers() {
  const navigate = useNavigate()
  const { token } = useAuth()

  const [tab,       setTab]       = useState('routes')
  const [origin,    setOrigin]    = useState('')
  const [dest,      setDest]      = useState('')
  const [date,      setDate]      = useState('')
  const [time,      setTime]      = useState('')
  const [people,    setPeople]    = useState(2)
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [success,   setSuccess]   = useState(false)
  const [error,     setError]     = useState('')

  // Quote form state
  const [qOrigin,   setQOrigin]   = useState('')
  const [qDest,     setQDest]     = useState('')
  const [qDate,     setQDate]     = useState('')
  const [qTime,     setQTime]     = useState('')
  const [qPeople,   setQPeople]   = useState(1)
  const [qLuggage,  setQLuggage]  = useState(0)
  const [qNotes,    setQNotes]    = useState('')

  const { data: routesData, isLoading } = useQuery({
    queryKey: ['transfer-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })

  const routes = routesData?.routes || routesData || []

  const totalPrice = selectedRoute
    ? Number(selectedRoute.default_price)
    : null

  function handleBook() {
    if (!token) { navigate('/login'); return }
    if (!selectedRoute) { alert('Selecione uma rota'); return }
    if (!date || !time)  { alert('Informe data e horário'); return }
    alert(`Transfer reservado!\n${selectedRoute.origin_name} → ${selectedRoute.destination_name}\n${fmt(totalPrice)}`)
  }

  async function handleQuote(e) {
    e.preventDefault()
    if (!token) { navigate('/login'); return }
    setError('')
    setLoading(true)
    try {
      await api.requestQuote({
        origin_place_name:      qOrigin,
        destination_place_name: qDest,
        service_date:           qDate,
        service_time:           qTime,
        people_count:           Number(qPeople),
        luggage_count:          Number(qLuggage),
        special_notes:          qNotes || undefined,
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Erro ao enviar cotação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="sticky top-0 md:top-14 z-10 bg-white border-b border-gray-100 px-4 md:px-6 py-3 flex items-center justify-between">
        <h1 className="font-bold text-gray-900 text-base">Transfer</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTab('routes')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${tab === 'routes' ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Rotas
          </button>
          <button
            onClick={() => setTab('quote')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${tab === 'quote' ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            Cotação
          </button>
        </div>
      </div>

      <div className="md:max-w-4xl md:mx-auto md:w-full md:px-6 md:py-6 flex flex-col flex-1">

        {/* TAB: Rotas tabeladas */}
        {tab === 'routes' && (
          <>
            {/* Saída / Chegada — stack on mobile, side-by-side on desktop */}
            <div className="md:grid md:grid-cols-2 md:gap-4">
              <div className="px-4 md:px-0 pt-4 pb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Saída</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 h-11 px-3.5 bg-gray-50 rounded-xl border border-gray-100">
                    <MapPin size={15} className="text-brand shrink-0" />
                    <input
                      className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
                      placeholder="Ponto de embarque"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 h-10 px-3 bg-gray-50 rounded-xl border border-gray-100">
                      <Calendar size={13} className="text-gray-400 shrink-0" />
                      <input
                        type="date"
                        className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                    <div className="flex items-center gap-2 h-10 px-3 bg-gray-50 rounded-xl border border-gray-100">
                      <Clock size={13} className="text-gray-400 shrink-0" />
                      <input
                        type="time"
                        className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 md:px-0 pb-3 md:pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Chegada</p>
                <div className="flex items-center gap-3 h-11 px-3.5 bg-gray-50 rounded-xl border border-gray-100">
                  <MapPin size={15} className="text-gray-400 shrink-0" />
                  <input
                    className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
                    placeholder="Ponto de desembarque"
                    value={dest}
                    onChange={(e) => setDest(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Passageiros */}
            <div className="px-4 md:px-0 pb-4">
              <div className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3 border border-gray-100">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-brand" />
                  <p className="font-semibold text-gray-900 text-sm">Passageiros</p>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setPeople((p) => Math.max(1, p - 1))}
                    className="w-7 h-7 rounded-full border border-gray-200 bg-white flex items-center justify-center">
                    <Minus size={12} className="text-gray-600" />
                  </button>
                  <span className="font-bold text-gray-900 w-4 text-center">{people}</span>
                  <button onClick={() => setPeople((p) => Math.min(20, p + 1))}
                    className="w-7 h-7 rounded-full bg-brand flex items-center justify-center">
                    <Plus size={12} className="text-white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Destinos (rotas) */}
            <div className="mb-4">
              <p className="px-4 md:px-0 font-semibold text-gray-900 text-sm mb-2.5">Destinos</p>
              {isLoading ? (
                <div className="px-4 md:px-0"><PageSpinner /></div>
              ) : (
                <>
                  {/* Mobile: horizontal scroll */}
                  <div className="md:hidden flex gap-3 px-4 overflow-x-auto scrollbar-thin pb-1">
                    {routes.map((r) => {
                      const sel = selectedRoute?.id === r.id
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedRoute(r)}
                          className={`shrink-0 min-w-[140px] rounded-2xl p-3.5 border-2 transition-all text-left ${
                            sel ? 'border-brand bg-brand text-white' : 'border-gray-100 bg-white text-gray-900 hover:border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-1 mb-1.5">
                            <MapPin size={11} className={sel ? 'text-white/70' : 'text-brand'} />
                            <span className="text-xs font-medium truncate">{r.origin_name}</span>
                          </div>
                          <ArrowRight size={11} className={`mb-1.5 ${sel ? 'text-white/50' : 'text-gray-300'}`} />
                          <p className="text-xs font-semibold truncate mb-2">{r.destination_name}</p>
                          <p className={`text-sm font-bold ${sel ? 'text-white' : 'text-brand'}`}>
                            {fmt(r.default_price)}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                  {/* Desktop: grid */}
                  <div className="hidden md:grid grid-cols-3 gap-3">
                    {routes.map((r) => {
                      const sel = selectedRoute?.id === r.id
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelectedRoute(r)}
                          className={`rounded-2xl p-4 border-2 transition-all text-left ${
                            sel ? 'border-brand bg-brand text-white' : 'border-gray-100 bg-white text-gray-900 hover:border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <MapPin size={13} className={sel ? 'text-white/70' : 'text-brand'} />
                            <span className="text-sm font-medium truncate">{r.origin_name}</span>
                          </div>
                          <ArrowRight size={14} className={`mb-2 ${sel ? 'text-white/50' : 'text-gray-300'}`} />
                          <p className="text-sm font-semibold truncate mb-3">{r.destination_name}</p>
                          <p className={`text-base font-bold ${sel ? 'text-white' : 'text-brand'}`}>
                            {fmt(r.default_price)}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Resumo */}
            {selectedRoute && (
              <div className="px-4 md:px-0 mb-4">
                <p className="font-semibold text-gray-900 text-sm mb-2.5">Resumo do transfer</p>
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5">
                  {[
                    ['Origem', selectedRoute.origin_name],
                    ['Destino', selectedRoute.destination_name],
                    ['Passageiros', `${people} pessoa${people > 1 ? 's' : ''}`],
                    ...(date ? [['Data', date]] : []),
                    ...(time ? [['Horário', time]] : []),
                    ...(selectedRoute.night_fee > 0 ? [['Taxa noturna', `+ ${fmt(selectedRoute.night_fee)}`]] : []),
                    ...(selectedRoute.extra_stop_price > 0 ? [['Parada extra', `+ ${fmt(selectedRoute.extra_stop_price)}`]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-900">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1" />

            {/* Bottom bar */}
            <div className="sticky bottom-0 md:static bg-white border-t md:border-t border-gray-100 px-4 md:px-0 py-3 flex items-center gap-4 md:mt-4">
              {totalPrice ? (
                <div>
                  <p className="text-xs text-gray-400">Total</p>
                  <p className="font-bold text-gray-900 text-lg">{fmt(totalPrice)}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 flex-1">Selecione uma rota</p>
              )}
              <Button
                onClick={handleBook}
                disabled={!selectedRoute}
                className="flex-1 max-w-[160px] ml-auto"
                size="lg"
              >
                Continuar <ChevronRight size={16} />
              </Button>
            </div>
          </>
        )}

        {/* TAB: Cotação personalizada */}
        {tab === 'quote' && (
          <div className="px-4 md:px-0 pt-4 pb-24 md:pb-8">
            {success ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-green-500" />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">Cotação enviada!</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
                  Nossa equipe vai entrar em contato com o valor em breve.
                </p>
                <Button variant="outline" onClick={() => { setSuccess(false); setQOrigin(''); setQDest('') }}>
                  Nova cotação
                </Button>
              </div>
            ) : (
              <form onSubmit={handleQuote} className="space-y-4 md:max-w-lg">
                <div className="md:grid md:grid-cols-2 md:gap-4 space-y-4 md:space-y-0">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Origem</p>
                    <input
                      className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
                      placeholder="De onde você vai sair?"
                      value={qOrigin}
                      onChange={(e) => setQOrigin(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Destino</p>
                    <input
                      className="w-full h-11 px-4 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
                      placeholder="Para onde você quer ir?"
                      value={qDest}
                      onChange={(e) => setQDest(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Data</p>
                    <input type="date" required className="w-full h-11 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
                      value={qDate} onChange={(e) => setQDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Horário</p>
                    <input type="time" required className="w-full h-11 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
                      value={qTime} onChange={(e) => setQTime(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Passageiros</p>
                    <input type="number" min="1" max="20" required className="w-full h-11 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
                      value={qPeople} onChange={(e) => setQPeople(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1.5">Bagagens</p>
                    <input type="number" min="0" max="20" className="w-full h-11 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand"
                      value={qLuggage} onChange={(e) => setQLuggage(e.target.value)} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Observações (opcional)</p>
                  <textarea
                    rows={3}
                    className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-brand resize-none"
                    placeholder="Endereço exato, necessidades especiais..."
                    value={qNotes}
                    onChange={(e) => setQNotes(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  {loading ? 'Enviando…' : 'Solicitar cotação'}
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
