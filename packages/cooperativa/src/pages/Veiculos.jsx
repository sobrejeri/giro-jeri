import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ToggleLeft, ToggleRight, Car, Users } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const TYPE_LABEL = {
  buggy:      'Buggy',
  jardineira: 'Jardineira',
  hilux_4x4:  'Hilux 4x4',
  boat:       'Barco',
  van:        'Van',
  sedan:      'Sedan',
  suv:        'SUV',
  other:      'Outro',
}

export default function Veiculos() {
  const qc = useQueryClient()

  const { data: vehicles = [], isLoading: lv } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  () => api.getVehicles({ is_active: 'true' }),
  })

  const { data: preferences = [], isLoading: lp } = useQuery({
    queryKey: ['operator-prefs'],
    queryFn:  () => api.getPreferences(),
  })

  // Monta mapa rápido de preferências
  const prefMap = useMemo(() => {
    const map = {}
    for (const p of preferences) {
      if (p.entity_type === 'vehicle') map[p.entity_id] = p.is_active
    }
    return map
  }, [preferences])

  const toggleMut = useMutation({
    mutationFn: ({ id, next }) => api.setPreference('vehicle', id, next),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['operator-prefs'] }),
    onError:    (err) => alert(`Erro: ${err.message}`),
  })

  if (lv || lp) return <PageSpinner />

  // Separa por status de preferência
  const active   = vehicles.filter((v) => prefMap[v.id] !== false)
  const inactive = vehicles.filter((v) => prefMap[v.id] === false)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-200">Minha Frota</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Selecione os veículos com que sua cooperativa trabalha.
          Apenas administradores podem cadastrar ou editar veículos.
        </p>
      </div>

      {/* Ativos */}
      <Card>
        <CardHeader>
          <p className="text-sm font-semibold text-gray-300">
            Trabalhando ({active.length})
          </p>
        </CardHeader>
        <div className="divide-y divide-gray-800">
          {active.map((v) => (
            <VehicleRow
              key={v.id}
              vehicle={v}
              enabled
              onToggle={() => toggleMut.mutate({ id: v.id, next: false })}
              pending={toggleMut.isPending}
            />
          ))}
          {active.length === 0 && (
            <CardBody>
              <p className="text-sm text-gray-600">Nenhum veículo ativado. Ative abaixo.</p>
            </CardBody>
          )}
        </div>
      </Card>

      {/* Inativos */}
      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold text-gray-500">
              Não trabalho com ({inactive.length})
            </p>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {inactive.map((v) => (
              <VehicleRow
                key={v.id}
                vehicle={v}
                enabled={false}
                onToggle={() => toggleMut.mutate({ id: v.id, next: true })}
                pending={toggleMut.isPending}
              />
            ))}
          </div>
        </Card>
      )}

      {vehicles.length === 0 && (
        <Card>
          <CardBody>
            <div className="py-10 text-center">
              <Car size={32} className="mx-auto text-gray-700 mb-2" />
              <p className="text-sm text-gray-600">Nenhum veículo no catálogo ainda.</p>
              <p className="text-xs text-gray-700 mt-1">Aguarde o administrador cadastrar os veículos.</p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function VehicleRow({ vehicle: v, enabled, onToggle, pending }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
      <div className="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
        {v.image_url
          ? <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" />
          : <Car size={18} className="text-gray-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200">{v.name}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{TYPE_LABEL[v.vehicle_type] || v.vehicle_type}</span>
          <span>·</span>
          <Users size={10} />
          <span>{v.seat_capacity} pax</span>
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={pending}
        title={enabled ? 'Desativar da minha frota' : 'Ativar na minha frota'}
        className="shrink-0 disabled:opacity-50"
      >
        {enabled
          ? <ToggleRight size={26} className="text-brand" />
          : <ToggleLeft  size={26} className="text-gray-600" />}
      </button>
    </div>
  )
}
