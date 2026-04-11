import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Input, { Textarea } from '../components/ui/Input'
import Card from '../components/ui/Card'
import { Car, ArrowRight, MapPin, Clock, Users, MessageSquare, CheckCircle } from 'lucide-react'

function RouteCard({ route, onBook }) {
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MapPin size={14} className="text-brand shrink-0" />
              {route.origin_name}
            </div>
            <ArrowRight size={14} className="text-gray-400 shrink-0" />
            <div className="text-sm font-semibold text-gray-900">{route.destination_name}</div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            {route.extra_stop_price > 0 && (
              <span>Parada extra +R$ {Number(route.extra_stop_price).toFixed(0)}</span>
            )}
            {route.night_fee > 0 && (
              <span>Taxa noturna +R$ {Number(route.night_fee).toFixed(0)}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-gray-900">
            R$ {Number(route.default_price).toFixed(0)}
          </p>
          <p className="text-xs text-gray-400 mb-3">por veículo</p>
          <Button size="sm" onClick={() => onBook(route)}>
            Reservar
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function Transfers() {
  const { token } = useAuth()
  const navigate   = useNavigate()
  const [tab,      setTab]      = useState('routes')   // 'routes' | 'quote'
  const [success,  setSuccess]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const [quoteForm, setQuoteForm] = useState({
    origin_place_name:      '',
    destination_place_name: '',
    service_date:           '',
    service_time:           '',
    people_count:           1,
    luggage_count:          0,
    special_notes:          '',
  })

  const { data: transfersData, isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn:  () => api.getTransfers(),
  })

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['transfer-routes'],
    queryFn:  () => api.getTransferRoutes(),
    enabled:  tab === 'routes',
  })

  const routes = routesData?.routes || routesData || []

  function setQ(field) {
    return (e) => setQuoteForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function handleBook(route) {
    if (!token) {
      navigate('/login', { state: { from: '/transfers' } })
      return
    }
    alert(`Rota: ${route.origin_name} → ${route.destination_name}\nPreço: R$ ${route.default_price}\n\nFluxo de pagamento em breve!`)
  }

  async function handleQuote(e) {
    e.preventDefault()
    if (!token) {
      navigate('/login', { state: { from: '/transfers' } })
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.requestQuote({
        ...quoteForm,
        people_count:  Number(quoteForm.people_count),
        luggage_count: Number(quoteForm.luggage_count),
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Erro ao enviar cotação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl md:text-4xl text-gray-900 mb-2">
          Transfers
        </h1>
        <p className="text-gray-500">
          Rotas com preço fixo ou solicite uma cotação para qualquer destino.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b border-gray-200">
        <button
          onClick={() => setTab('routes')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'routes'
              ? 'border-brand text-brand'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2"><Car size={15} /> Rotas Tabeladas</span>
        </button>
        <button
          onClick={() => setTab('quote')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'quote'
              ? 'border-brand text-brand'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span className="flex items-center gap-2"><MessageSquare size={15} /> Solicitar Cotação</span>
        </button>
      </div>

      {/* Rotas tabeladas */}
      {tab === 'routes' && (
        <div>
          {routesLoading ? (
            <PageSpinner />
          ) : routes.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <Car size={40} className="mx-auto mb-3 opacity-30" />
              <p>Nenhuma rota disponível no momento.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map((route) => (
                <RouteCard key={route.id} route={route} onBook={handleBook} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Formulário de cotação */}
      {tab === 'quote' && (
        <div>
          {success ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-500" />
              </div>
              <h3 className="font-semibold text-gray-900 text-lg mb-2">Cotação enviada!</h3>
              <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                Nossa equipe entrará em contato em breve com o valor. Você tem até 2 horas para aceitar após receber a cotação.
              </p>
              <Button variant="outline" onClick={() => { setSuccess(false); setQuoteForm({ origin_place_name: '', destination_place_name: '', service_date: '', service_time: '', people_count: 1, luggage_count: 0, special_notes: '' }) }}>
                Nova cotação
              </Button>
            </div>
          ) : (
            <Card className="p-6 md:p-8">
              <h3 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <MessageSquare size={18} className="text-brand" />
                Solicitar cotação personalizada
              </h3>
              <form onSubmit={handleQuote} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Origem"
                    placeholder="Ex: Hotel em Jericoacoara"
                    value={quoteForm.origin_place_name}
                    onChange={setQ('origin_place_name')}
                    required
                  />
                  <Input
                    label="Destino"
                    placeholder="Ex: Fortaleza"
                    value={quoteForm.destination_place_name}
                    onChange={setQ('destination_place_name')}
                    required
                  />
                  <Input
                    label="Data do serviço"
                    type="date"
                    value={quoteForm.service_date}
                    onChange={setQ('service_date')}
                    required
                  />
                  <Input
                    label="Horário"
                    type="time"
                    value={quoteForm.service_time}
                    onChange={setQ('service_time')}
                    required
                  />
                  <Input
                    label="Número de pessoas"
                    type="number"
                    min="1"
                    max="20"
                    value={quoteForm.people_count}
                    onChange={setQ('people_count')}
                    required
                  />
                  <Input
                    label="Bagagens"
                    type="number"
                    min="0"
                    max="20"
                    value={quoteForm.luggage_count}
                    onChange={setQ('luggage_count')}
                  />
                </div>
                <Textarea
                  label="Observações (opcional)"
                  placeholder="Endereço exato, necessidades especiais, etc."
                  rows={3}
                  value={quoteForm.special_notes}
                  onChange={setQ('special_notes')}
                />
                {error && (
                  <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}
                {!token && (
                  <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                    Você precisa estar logado para solicitar uma cotação.
                  </p>
                )}
                <Button type="submit" size="lg" className="w-full" disabled={loading}>
                  {loading ? 'Enviando…' : 'Solicitar cotação'}
                </Button>
              </form>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
