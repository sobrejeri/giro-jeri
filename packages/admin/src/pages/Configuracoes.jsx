import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Settings, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Card, { CardHeader, CardBody } from '../components/ui/Card'

const DISPLAY_TYPES = {
  integer: 'número inteiro',
  decimal: 'decimal',
  boolean: 'booleano',
  string:  'texto',
  json:    'JSON',
}

const SETTING_LABELS = {
  platform_fee_percent:       'Comissão da plataforma (%)',
  quote_expiry_hours:         'Expiração de cotações (horas)',
  transfer_min_advance_hours: 'Antecedência mínima transfer (h)',
  cancellation_tour_hours:    'Cancelamento de passeio (h)',
  cancellation_transfer_days: 'Cancelamento de transfer (dias)',
  timezone_default:           'Fuso horário padrão',
  currency_default:           'Moeda padrão',
  gateway_fee_percent:        'Taxa do gateway (%)',
  whatsapp_number:            'WhatsApp da operação',
  email_from:                 'E-mail remetente',
}

export default function Configuracoes() {
  const [editing, setEditing] = useState({})
  const [saved, setSaved]     = useState(null)
  const qc = useQueryClient()

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => api.getSettings(),
  })

  const saveMut = useMutation({
    mutationFn: ({ key, value }) => api.updateSetting(key, { setting_value: value }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setEditing((prev) => { const n = { ...prev }; delete n[key]; return n })
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    },
  })

  function startEdit(s) {
    setEditing((prev) => ({ ...prev, [s.setting_key]: s.setting_value }))
  }

  function cancelEdit(key) {
    setEditing((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  function saveEdit(s) {
    saveMut.mutate({ key: s.setting_key, value: editing[s.setting_key] })
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Info */}
      <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 text-sm">
        <p className="font-semibold text-blue-400 mb-1">Configurações do sistema</p>
        <p className="text-gray-500 text-xs">
          Estas configurações controlam o comportamento global da plataforma.
          Edite com cuidado — algumas afetam cálculos de preço e prazos.
        </p>
      </div>

      {settings.length === 0 ? (
        <Card>
          <CardBody>
            <div className="py-12 text-center">
              <Settings size={36} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma configuração encontrada.</p>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-300">{settings.length} configurações</h2>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {settings.map((s) => {
              const isEditing = s.setting_key in editing
              const isSaved   = saved === s.setting_key
              const label     = SETTING_LABELS[s.setting_key] || s.setting_key

              return (
                <div key={s.setting_key} className="flex items-start gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-gray-200">{label}</p>
                      <span className="text-xs text-gray-600 bg-gray-800 px-1.5 rounded">
                        {DISPLAY_TYPES[s.value_type] || s.value_type}
                      </span>
                    </div>
                    {s.description && (
                      <p className="text-xs text-gray-600 mb-2">{s.description}</p>
                    )}

                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={editing[s.setting_key]}
                          onChange={(e) => setEditing((prev) => ({ ...prev, [s.setting_key]: e.target.value }))}
                          className="flex-1 h-8 px-2 rounded-lg border border-gray-600 bg-gray-900 text-sm text-gray-100 focus:outline-none focus:border-brand"
                        />
                        <Button size="sm" onClick={() => saveEdit(s)} disabled={saveMut.isPending}>
                          <Save size={13} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelEdit(s.setting_key)}>
                          <RotateCcw size={13} />
                        </Button>
                      </div>
                    ) : (
                      <code
                        onClick={() => startEdit(s)}
                        className={`text-sm cursor-pointer px-2 py-0.5 rounded transition-colors
                          ${isSaved ? 'bg-green-900/30 text-green-400' : 'bg-gray-900 text-brand hover:bg-gray-800'}`}
                      >
                        {isSaved ? 'Salvo!' : (s.setting_value || '(vazio)')}
                      </code>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
