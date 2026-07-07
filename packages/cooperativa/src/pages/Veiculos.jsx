import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Car, Users, Info, MessageCircle, CheckCircle2, MinusCircle, AlertTriangle,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import { fleetCopy as t } from '../copy/fleet'

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

const ADMIN_WHATSAPP = import.meta.env.VITE_ADMIN_WHATSAPP

export default function Veiculos() {
  const {
    data: vehicles = [],
    isLoading: lv,
    isError: ev,
    refetch: refetchVehicles,
  } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  () => api.getVehicles({ is_active: 'true' }),
  })

  const {
    data: preferences = [],
    isLoading: lp,
    isError: ep,
    refetch: refetchPreferences,
  } = useQuery({
    queryKey: ['operator-prefs'],
    queryFn:  () => api.getPreferences(),
  })

  // Monta mapa rápido de preferências (leitura — só para exibir status)
  const prefMap = useMemo(() => {
    const map = {}
    for (const p of preferences) {
      if (p.entity_type === 'vehicle') map[p.entity_id] = p.is_active
    }
    return map
  }, [preferences])

  if (lv || lp) return <PageSpinner />

  const isError = ev || ep
  function retry() {
    refetchVehicles()
    refetchPreferences()
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle size={32} className="mx-auto text-red-400 mb-3" />
        <p className="text-sm font-medium text-gray-700">{t.errorTitle}</p>
        <button
          onClick={retry}
          className="mt-4 inline-flex items-center justify-center min-h-11 px-4 text-sm font-semibold text-brand hover:underline"
        >
          {t.errorRetry}
        </button>
      </div>
    )
  }

  // Model B: veículo é operado a menos que exista preferência explícita is_active === false
  const operating = vehicles.filter((v) => prefMap[v.id] !== false)
  const blocked    = vehicles.filter((v) => prefMap[v.id] === false)

  const waMsg = encodeURIComponent('Olá! Gostaria de solicitar uma mudança na frota liberada para minha cooperativa.')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{t.title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{t.subtitle}</p>
      </div>

      {/* Banner permanente — somente leitura */}
      <div className="bg-brand/5 border border-brand/10 rounded-xl px-4 py-3 flex items-start gap-3">
        <Info size={18} className="text-brand shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700">{t.readonlyNote}</p>
          {ADMIN_WHATSAPP && (
            <a
              href={`https://wa.me/${ADMIN_WHATSAPP}?text=${waMsg}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 min-h-11 text-sm font-semibold text-brand hover:underline"
            >
              <MessageCircle size={15} />
              {t.requestChange}
            </a>
          )}
        </div>
      </div>

      {vehicles.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-10 text-center">
              <Car size={32} className="mx-auto text-gray-700 mb-2" />
              <p className="text-sm text-gray-600">{t.emptyCatalogTitle}</p>
              <p className="text-xs text-gray-700 mt-1">{t.emptyCatalogDesc}</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Você opera */}
          <Card>
            <CardHeader>
              <p className="text-sm font-semibold text-gray-700">{t.sectionOperating(operating.length)}</p>
            </CardHeader>
            <div className="divide-y divide-gray-100">
              {operating.map((v) => (
                <VehicleRow key={v.id} vehicle={v} operating />
              ))}
              {operating.length === 0 && (
                <CardBody>
                  <div className="py-6 text-center">
                    <p className="text-sm font-medium text-gray-700">{t.emptyReleasedTitle}</p>
                    <p className="text-xs text-gray-500 mt-1">{t.emptyReleasedDesc}</p>
                  </div>
                </CardBody>
              )}
            </div>
          </Card>

          {/* Não liberados */}
          {blocked.length > 0 && (
            <Card>
              <CardHeader>
                <p className="text-sm font-semibold text-gray-500">{t.sectionBlocked(blocked.length)}</p>
              </CardHeader>
              <div className="divide-y divide-gray-100">
                {blocked.map((v) => (
                  <VehicleRow key={v.id} vehicle={v} operating={false} />
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function VehicleRow({ vehicle: v, operating }) {
  return (
    <div className={`flex items-center gap-3 px-5 py-3 transition-opacity ${operating ? '' : 'opacity-60'}`}>
      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
        {v.image_url
          ? <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" />
          : <Car size={18} className="text-gray-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{v.name}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{TYPE_LABEL[v.vehicle_type] || v.vehicle_type}</span>
          <span>·</span>
          <Users size={10} />
          <span>{v.seat_capacity} pax</span>
        </div>
      </div>
      {operating ? (
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
          <CheckCircle2 size={13} />
          {t.statusOperating}
        </span>
      ) : (
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          <MinusCircle size={13} />
          {t.statusBlocked}
        </span>
      )}
    </div>
  )
}
