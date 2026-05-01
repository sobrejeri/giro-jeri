import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ToggleLeft, ToggleRight, Compass, Clock, Users } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const GRADIENTS = [
  'from-orange-400 to-amber-300',
  'from-sky-400 to-blue-300',
  'from-teal-400 to-emerald-300',
  'from-violet-400 to-purple-300',
]
function gi(id = '') {
  let n = 0; for (const c of id) n += c.charCodeAt(0); return n % GRADIENTS.length
}

export default function Passeios() {
  const qc = useQueryClient()

  const { data: tours = [], isLoading: lt } = useQuery({
    queryKey: ['catalog-tours'],
    queryFn:  () => api.getCatalogTours(),
  })

  const { data: preferences = [], isLoading: lp } = useQuery({
    queryKey: ['operator-prefs'],
    queryFn:  () => api.getPreferences(),
  })

  const prefMap = useMemo(() => {
    const map = {}
    for (const p of preferences) {
      if (p.entity_type === 'tour') map[p.entity_id] = p.is_active
    }
    return map
  }, [preferences])

  const toggleMut = useMutation({
    mutationFn: ({ id, next }) => api.setPreference('tour', id, next),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['operator-prefs'] }),
    onError:    (err) => alert(`Erro: ${err.message}`),
  })

  if (lt || lp) return <PageSpinner />

  const active   = tours.filter((t) => prefMap[t.id] !== false)
  const inactive = tours.filter((t) => prefMap[t.id] === false)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-200">Passeios que Executo</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Selecione quais passeios sua cooperativa realiza.
          Apenas administradores podem criar ou editar passeios.
        </p>
      </div>

      {/* Ativos */}
      <Card>
        <CardHeader>
          <p className="text-sm font-semibold text-gray-300">Executo ({active.length})</p>
        </CardHeader>
        <div className="divide-y divide-gray-800">
          {active.map((t) => (
            <TourRow
              key={t.id}
              tour={t}
              enabled
              onToggle={() => toggleMut.mutate({ id: t.id, next: false })}
              pending={toggleMut.isPending}
            />
          ))}
          {active.length === 0 && (
            <CardBody>
              <p className="text-sm text-gray-600">Nenhum passeio ativado. Ative abaixo.</p>
            </CardBody>
          )}
        </div>
      </Card>

      {/* Inativos */}
      {inactive.length > 0 && (
        <Card>
          <CardHeader>
            <p className="text-sm font-semibold text-gray-500">Não executo ({inactive.length})</p>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {inactive.map((t) => (
              <TourRow
                key={t.id}
                tour={t}
                enabled={false}
                onToggle={() => toggleMut.mutate({ id: t.id, next: true })}
                pending={toggleMut.isPending}
              />
            ))}
          </div>
        </Card>
      )}

      {tours.length === 0 && (
        <Card>
          <CardBody>
            <div className="py-10 text-center">
              <Compass size={32} className="mx-auto text-gray-700 mb-2" />
              <p className="text-sm text-gray-600">Nenhum passeio no catálogo.</p>
              <p className="text-xs text-gray-700 mt-1">Aguarde o administrador cadastrar os passeios.</p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function TourRow({ tour: t, enabled, onToggle, pending }) {
  const grad = GRADIENTS[gi(t.id)]
  return (
    <div className={`flex items-center gap-3 px-5 py-3 transition-opacity ${enabled ? '' : 'opacity-50'}`}>
      {/* Capa */}
      <div className={`w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br ${grad} flex items-center justify-center`}>
        {t.cover_image_url
          ? <img src={t.cover_image_url} alt={t.name} className="w-full h-full object-cover" />
          : <Compass size={20} className="text-white/40" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate">{t.name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          {t.duration_hours && (
            <>
              <Clock size={10} />
              <span>{t.duration_hours}h</span>
            </>
          )}
          {t.max_people && (
            <>
              <span>·</span>
              <Users size={10} />
              <span>até {t.max_people} pax</span>
            </>
          )}
          {t.is_private_enabled && <span>· Privativo</span>}
          {t.is_shared_enabled  && <span>· Compartilhado</span>}
        </div>
      </div>

      <button
        onClick={onToggle}
        disabled={pending}
        title={enabled ? 'Não executo este passeio' : 'Executo este passeio'}
        className="shrink-0 disabled:opacity-50"
      >
        {enabled
          ? <ToggleRight size={26} className="text-brand" />
          : <ToggleLeft  size={26} className="text-gray-600" />}
      </button>
    </div>
  )
}
