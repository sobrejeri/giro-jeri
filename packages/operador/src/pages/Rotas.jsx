import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ToggleLeft, ToggleRight, ArrowRight } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const fmt = (v) =>
  v != null ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null

export default function Rotas() {
  const qc = useQueryClient()
  const [toggleError, setToggleError] = useState(null)

  const { data: routes = [], isLoading: lr } = useQuery({
    queryKey: ['catalog-routes'],
    queryFn:  () => api.getCatalogRoutes(),
  })

  const { data: preferences = [], isLoading: lp } = useQuery({
    queryKey: ['operator-prefs'],
    queryFn:  () => api.getPreferences(),
  })

  const prefMap = useMemo(() => {
    const map = {}
    for (const p of preferences) {
      if (p.entity_type === 'transfer_route') map[p.entity_id] = p.is_active
    }
    return map
  }, [preferences])

  const toggleMut = useMutation({
    mutationFn: ({ id, next }) => api.setPreference('transfer_route', id, next),
    onSuccess:  () => {
      setToggleError(null)
      qc.invalidateQueries({ queryKey: ['operator-prefs'] })
    },
    onError: (err) => setToggleError(err.message || 'Erro ao salvar preferência'),
  })

  if (lr || lp) return <PageSpinner />

  const active   = routes.filter((r) => prefMap[r.id] !== false)
  const inactive = routes.filter((r) => prefMap[r.id] === false)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Rotas de Transfer</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Selecione as rotas que seu operador atende.
          Apenas administradores podem criar ou editar rotas.
        </p>
      </div>

      {toggleError && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{toggleError}</p>
      )}

      <Card>
        <CardHeader>
          <p className="text-sm font-semibold text-gray-700">Atendo ({active.length})</p>
        </CardHeader>
        <div className="divide-y divide-gray-100">
          {active.map((r) => (
            <RouteRow
              key={r.id}
              route={r}
              enabled
              onToggle={() => toggleMut.mutate({ id: r.id, next: false })}
              pending={toggleMut.isPending}
            />
          ))}
          {active.length === 0 && (
            <CardBody>
              <p className="text-sm text-gray-400">Nenhuma rota ativada. Ative abaixo.</p>
            </CardBody>
          )}
        </div>
      </Card>

      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold text-gray-400">Não atendo ({inactive.length})</p>
          </CardHeader>
          <div className="divide-y divide-gray-100">
            {inactive.map((r) => (
              <RouteRow
                key={r.id}
                route={r}
                enabled={false}
                onToggle={() => toggleMut.mutate({ id: r.id, next: true })}
                pending={toggleMut.isPending}
              />
            ))}
          </div>
        </Card>
      )}

      {routes.length === 0 && (
        <Card>
          <CardBody>
            <div className="py-10 text-center">
              <ArrowRight size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Nenhuma rota no catálogo.</p>
              <p className="text-xs text-gray-400 mt-1">Aguarde o administrador cadastrar as rotas.</p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function RouteRow({ route: r, enabled, onToggle, pending }) {
  const price = fmt(r.default_price)
  return (
    <div className={`flex items-center gap-4 px-5 py-3 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {r.origin_name} → {r.destination_name}
        </p>
        <p className="text-xs text-gray-400">
          {r.transfers?.name || r.transfer?.name || '—'}
          {price ? ` · ${price}` : ''}
          {r.night_fee ? ` · noturna +${fmt(r.night_fee)}` : ''}
        </p>
      </div>
      <button
        onClick={onToggle}
        disabled={pending}
        title={enabled ? 'Não atendo esta rota' : 'Atendo esta rota'}
        className="shrink-0 disabled:opacity-50"
      >
        {enabled
          ? <ToggleRight size={26} className="text-brand" />
          : <ToggleLeft  size={26} className="text-gray-400" />}
      </button>
    </div>
  )
}
