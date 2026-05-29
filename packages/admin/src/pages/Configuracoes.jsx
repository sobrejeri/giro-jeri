import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, Settings, RotateCcw, CreditCard, Landmark, SplitSquareHorizontal,
  Eye, EyeOff, CheckCircle, Pencil,
} from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Input, { Select } from '../components/ui/Input'

// ── Sistema tab ───────────────────────────────────────────
const DISPLAY_TYPES = {
  integer: 'número inteiro',
  decimal: 'decimal',
  boolean: 'booleano',
  string:  'texto',
  json:    'JSON',
  number:  'número',
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
  default_currency:           'Moeda padrão',
  default_timezone:           'Fuso horário padrão',
  whatsapp_support_number:    'WhatsApp do suporte',
  max_people_per_booking:     'Máx. pessoas por reserva',
  app_version:                'Versão do app',
  maintenance_mode:           'Modo de manutenção',
  google_maps_api_key_public: 'Google Maps API Key (pública)',
  quote_urgent_threshold_hours: 'Limiar de cotação urgente (h)',
  transfer_max_luggage:       'Máx. bagagens por transfer',
}

const PAYMENT_KEYS = new Set([
  'payment_gateway', 'payment_gateway_env', 'payment_gateway_api_key',
  'payment_gateway_webhook_secret', 'payment_split_admin_pct',
  'payment_admin_pix_key_type', 'payment_admin_pix_key',
  'payment_admin_bank_name', 'payment_admin_bank_agency',
  'payment_admin_bank_account', 'payment_admin_bank_account_type',
  'payment_admin_bank_document',
])

// ── Payment tab constants ─────────────────────────────────
const GATEWAYS = [
  { value: 'manual',  label: 'Manual (sem gateway)' },
  { value: 'test',    label: 'Modo de Teste (aprova em 15s)' },
  { value: 'asaas',   label: 'Asaas' },
  { value: 'pagarme', label: 'Pagar.me' },
]

const ENVS = [
  { value: 'sandbox',    label: 'Sandbox (testes)' },
  { value: 'production', label: 'Produção' },
]

const PIX_TYPES = [
  { value: 'cpf',        label: 'CPF' },
  { value: 'cnpj',       label: 'CNPJ' },
  { value: 'email',      label: 'E-mail' },
  { value: 'phone',      label: 'Telefone' },
  { value: 'random_key', label: 'Chave aleatória' },
]

const ACCOUNT_TYPES = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Conta Poupança' },
]

const PAYMENT_DEFAULTS = {
  payment_gateway:                'manual',
  payment_gateway_env:            'sandbox',
  payment_gateway_api_key:        '',
  payment_gateway_webhook_secret: '',
  payment_split_admin_pct:        '15',
  payment_admin_pix_key_type:     'cnpj',
  payment_admin_pix_key:          '',
  payment_admin_bank_name:        '',
  payment_admin_bank_agency:      '',
  payment_admin_bank_account:     '',
  payment_admin_bank_account_type:'corrente',
  payment_admin_bank_document:    '',
}

function settingsToMap(list) {
  return Object.fromEntries(list.map((s) => [s.setting_key, s.setting_value ?? '']))
}

function MaskedInput({ label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        label={label}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 bottom-2.5 text-gray-500 hover:text-gray-300 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

// ── Sistema tab ───────────────────────────────────────────
function TabSistema({ settings, qc }) {
  const [editing, setEditing] = useState({})
  const [saved, setSaved]     = useState(null)

  const saveMut = useMutation({
    mutationFn: ({ key, value }) => api.updateSetting(key, { setting_value: value }),
    onSuccess: (_, { key }) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setEditing((prev) => { const n = { ...prev }; delete n[key]; return n })
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    },
  })

  const filtered = settings.filter((s) => !PAYMENT_KEYS.has(s.setting_key))

  return (
    <div className="space-y-5">
      <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 text-sm">
        <p className="font-semibold text-blue-400 mb-1">Configurações do sistema</p>
        <p className="text-gray-500 text-xs">
          Controla prazos, moeda, fuso horário e limites globais da plataforma.
          Edite com cuidado — algumas afetam cálculos de preço e prazos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-300">{filtered.length} configurações</h2>
        </CardHeader>
        <div className="divide-y divide-gray-800">
          {filtered.map((s) => {
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
                      <Button size="sm" onClick={() => saveMut.mutate({ key: s.setting_key, value: editing[s.setting_key] })} disabled={saveMut.isPending}>
                        <Save size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[s.setting_key]; return n })}>
                        <RotateCcw size={13} />
                      </Button>
                    </div>
                  ) : (
                    <code
                      onClick={() => setEditing((prev) => ({ ...prev, [s.setting_key]: s.setting_value }))}
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
    </div>
  )
}

// ── Split por Cooperativa ─────────────────────────────────
function SplitPorCooperativa({ globalAdminPct, qc }) {
  const [overrides, setOverrides] = useState({})
  const [saved, setSaved]         = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['operators-split'],
    queryFn:  () => api.getUsers({ user_type: 'operator', limit: 100 }),
  })

  const operators = data?.data || []

  const updateMut = useMutation({
    mutationFn: ({ id, pct }) => api.updateUser(id, { platform_split_pct: pct }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['operators-split'] })
      setOverrides((prev) => { const n = { ...prev }; delete n[id]; return n })
      setSaved(id)
      setTimeout(() => setSaved(null), 2500)
    },
  })

  function startEdit(op) {
    const current = op.platform_split_pct != null ? String(op.platform_split_pct) : String(globalAdminPct)
    setOverrides((prev) => ({ ...prev, [op.id]: current }))
  }

  function cancelEdit(id) {
    setOverrides((prev) => { const n = { ...prev }; delete n[id]; return n })
  }

  function saveEdit(op) {
    const pct = overrides[op.id]
    updateMut.mutate({ id: op.id, pct: pct === '' ? null : Number(pct) })
  }

  function clearOverride(op) {
    updateMut.mutate({ id: op.id, pct: null })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SplitSquareHorizontal size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-200">Split por Cooperativa</h2>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-xs text-gray-500 mb-4">
          Percentual da plataforma por cooperativa. Quando não definido, usa o padrão global ({globalAdminPct}%).
        </p>
        {isLoading ? (
          <p className="text-xs text-gray-600">Carregando cooperativas…</p>
        ) : operators.length === 0 ? (
          <p className="text-xs text-gray-600">Nenhuma cooperativa cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {operators.map((op) => {
              const isEditing    = op.id in overrides
              const hasOverride  = op.platform_split_pct != null
              const isSaved      = saved === op.id
              const adminPct     = hasOverride ? Number(op.platform_split_pct) : globalAdminPct
              const operatorPct  = Math.max(0, 100 - adminPct)

              return (
                <div
                  key={op.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800"
                >
                  {/* Nome */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{op.full_name}</p>
                    <p className="text-xs text-gray-600 truncate">{op.email || op.phone || '—'}</p>
                  </div>

                  {/* Percentuais */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={overrides[op.id]}
                          onChange={(e) => setOverrides((prev) => ({ ...prev, [op.id]: e.target.value }))}
                          className="w-16 h-8 px-2 rounded-lg border border-gray-600 bg-gray-800 text-sm text-gray-100 text-center focus:outline-none focus:border-brand"
                        />
                        <span className="text-xs text-gray-500">% admin</span>
                      </div>
                      <Button size="sm" onClick={() => saveEdit(op)} disabled={updateMut.isPending}>
                        <Save size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancelEdit(op.id)}>
                        <RotateCcw size={13} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      {isSaved ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle size={13} /> Salvo!
                        </span>
                      ) : (
                        <div className="text-right">
                          <p className="text-xs text-gray-400">
                            <span className="text-brand font-semibold">{adminPct}%</span>
                            {' '}admin ·{' '}
                            <span className="text-green-400 font-semibold">{operatorPct}%</span>
                            {' '}cooperativa
                          </p>
                          {hasOverride ? (
                            <p className="text-xs text-amber-500">personalizado</p>
                          ) : (
                            <p className="text-xs text-gray-600">padrão global</p>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => startEdit(op)}
                        className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Editar split"
                      >
                        <Pencil size={13} />
                      </button>
                      {hasOverride && (
                        <button
                          onClick={() => clearOverride(op)}
                          className="p-1.5 text-gray-600 hover:text-amber-400 hover:bg-gray-700 rounded-lg transition-colors"
                          title="Voltar ao padrão global"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ── Pagamentos tab ────────────────────────────────────────
function TabPagamentos({ settings, qc }) {
  const map = settingsToMap(settings)
  const [form, setForm] = useState({ ...PAYMENT_DEFAULTS, ...map })
  const [savedSection, setSavedSection] = useState(null)

  useEffect(() => {
    if (settings.length) setForm({ ...PAYMENT_DEFAULTS, ...settingsToMap(settings) })
  }, [settings])

  const saveMut = useMutation({
    mutationFn: (pairs) =>
      Promise.all(pairs.map(([key, value]) => api.updateSetting(key, { setting_value: value }))),
    onSuccess: (_, pairs) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      const section = pairs[0]?.[0]?.split('_')[1]
      setSavedSection(section)
      setTimeout(() => setSavedSection(null), 2500)
    },
  })

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function saveSection(keys, section) {
    saveMut.mutate(keys.map((k) => [k, form[k]]))
    setSavedSection(section)
  }

  const adminPct   = Number(form.payment_split_admin_pct) || 0
  const operatorPct = Math.max(0, 100 - adminPct)

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Gateway */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-200">Gateway de Pagamento</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Gateway ativo"
                value={form.payment_gateway}
                onChange={(e) => set('payment_gateway', e.target.value)}
              >
                {GATEWAYS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </Select>
              <Select
                label="Ambiente"
                value={form.payment_gateway_env}
                onChange={(e) => set('payment_gateway_env', e.target.value)}
              >
                {ENVS.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </Select>
            </div>
            {form.payment_gateway !== 'manual' && form.payment_gateway !== 'test' && (
              <>
                <MaskedInput
                  label="API Key"
                  value={form.payment_gateway_api_key}
                  onChange={(e) => set('payment_gateway_api_key', e.target.value)}
                  placeholder="Chave da API do gateway"
                />
                <MaskedInput
                  label="Webhook Secret"
                  value={form.payment_gateway_webhook_secret}
                  onChange={(e) => set('payment_gateway_webhook_secret', e.target.value)}
                  placeholder="Secret para validar callbacks"
                />
                <p className="text-xs text-amber-500/80">
                  Estas chaves são armazenadas no banco e nunca expostas ao cliente final.
                </p>
              </>
            )}
            <SaveRow
              onSave={() => saveSection(
                ['payment_gateway', 'payment_gateway_env', 'payment_gateway_api_key', 'payment_gateway_webhook_secret'],
                'gateway',
              )}
              pending={saveMut.isPending}
              saved={savedSection === 'gateway'}
            />
          </div>
        </CardBody>
      </Card>

      {/* Split */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-200">Divisão de Recebimento</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Define como cada pagamento é dividido entre a plataforma e a cooperativa.
              A cooperativa repassa seus motoristas manualmente.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  label="Plataforma (admin) %"
                  type="number"
                  min={0}
                  max={100}
                  value={form.payment_split_admin_pct}
                  onChange={(e) => set('payment_split_admin_pct', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Cooperativa % (calculado)
                </label>
                <div className="h-10 flex items-center px-3 rounded-lg bg-gray-800 border border-gray-700 text-sm font-semibold text-brand">
                  {operatorPct}%
                </div>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <p>Exemplo: reserva de <span className="text-gray-300">R$ 500</span></p>
              <p>→ Plataforma recebe <span className="text-brand">R$ {(500 * adminPct / 100).toFixed(2)}</span></p>
              <p>→ Cooperativa recebe <span className="text-green-400">R$ {(500 * operatorPct / 100).toFixed(2)}</span></p>
            </div>
            <SaveRow
              onSave={() => saveSection(['payment_split_admin_pct'], 'split')}
              pending={saveMut.isPending}
              saved={savedSection === 'split'}
            />
          </div>
        </CardBody>
      </Card>

      {/* Split por cooperativa */}
      <SplitPorCooperativa globalAdminPct={adminPct} qc={qc} />

      {/* Conta de recebimento da plataforma */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Landmark size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-200">Conta de Recebimento da Plataforma</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Dados bancários e PIX da conta que recebe os pagamentos da plataforma.
              Utilizado para transferências manuais e exibido no painel financeiro.
            </p>

            <div className="grid grid-cols-3 gap-3">
              <Select
                label="Tipo de chave PIX"
                value={form.payment_admin_pix_key_type}
                onChange={(e) => { set('payment_admin_pix_key_type', e.target.value); set('payment_admin_pix_key', '') }}
              >
                {PIX_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
              <div className="col-span-2">
                <Input
                  label="Chave PIX"
                  value={form.payment_admin_pix_key}
                  onChange={(e) => set('payment_admin_pix_key', e.target.value)}
                  placeholder={
                    PIX_TYPES.find((p) => p.value === form.payment_admin_pix_key_type)?.label || 'Chave'
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Banco"
                placeholder="Ex: Nubank, Bradesco"
                value={form.payment_admin_bank_name}
                onChange={(e) => set('payment_admin_bank_name', e.target.value)}
              />
              <Input
                label="Agência"
                placeholder="0000"
                value={form.payment_admin_bank_agency}
                onChange={(e) => set('payment_admin_bank_agency', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Número da conta"
                placeholder="00000-0"
                value={form.payment_admin_bank_account}
                onChange={(e) => set('payment_admin_bank_account', e.target.value)}
              />
              <Select
                label="Tipo de conta"
                value={form.payment_admin_bank_account_type}
                onChange={(e) => set('payment_admin_bank_account_type', e.target.value)}
              >
                {ACCOUNT_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </Select>
            </div>
            <Input
              label="CPF / CNPJ do titular"
              placeholder="00.000.000/0001-00"
              value={form.payment_admin_bank_document}
              onChange={(e) => set('payment_admin_bank_document', e.target.value)}
              className="max-w-xs"
            />

            <SaveRow
              onSave={() => saveSection([
                'payment_admin_pix_key_type', 'payment_admin_pix_key',
                'payment_admin_bank_name', 'payment_admin_bank_agency',
                'payment_admin_bank_account', 'payment_admin_bank_account_type',
                'payment_admin_bank_document',
              ], 'conta')}
              pending={saveMut.isPending}
              saved={savedSection === 'conta'}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function SaveRow({ onSave, pending, saved }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <Button type="button" onClick={onSave} disabled={pending}>
        {pending ? 'Salvando…' : 'Salvar'}
      </Button>
      {saved && (
        <span className="flex items-center gap-1.5 text-sm text-green-400">
          <CheckCircle size={14} />
          Salvo!
        </span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────
const TABS = [
  { id: 'sistema',    label: 'Sistema',    icon: Settings },
  { id: 'pagamentos', label: 'Pagamentos', icon: CreditCard },
]

export default function Configuracoes() {
  const [tab, setTab] = useState('sistema')
  const qc = useQueryClient()

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn:  () => api.getSettings(),
  })

  if (isLoading) return <PageSpinner />

  return (
    <div className="space-y-5">
      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-gray-700 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'sistema'    && <TabSistema    settings={settings} qc={qc} />}
      {tab === 'pagamentos' && <TabPagamentos settings={settings} qc={qc} />}
    </div>
  )
}
