import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, Settings, RotateCcw, CreditCard, Landmark, SplitSquareHorizontal,
  Eye, EyeOff, CheckCircle, Pencil, Image as ImageIcon, Upload, Trash2,
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
  // Sem isto, as chaves novas apareceriam TAMBÉM na aba Sistema, como
  // configuração crua — dois lugares editando a mesma coisa.
  'payment_method_pix', 'payment_method_credit', 'payment_method_debit',
  'payment_max_installments',
])

// ── Payment tab constants ─────────────────────────────────
const GATEWAYS = [
  { value: 'manual',       label: 'Manual (sem gateway)' },
  { value: 'test',         label: 'Modo de Teste (aprova em 15s)' },
  // Faltava na lista, embora seja o gateway em uso. Sem a opção, o campo
  // aparecia EM BRANCO para quem já está no Mercado Pago — e quem tentasse
  // "corrigir" o branco escolheria outro gateway, desligando a cobrança de
  // produção sem perceber.
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'asaas',        label: 'Asaas' },
  { value: 'pagarme',      label: 'Pagar.me' },
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
  // Formas que o cliente vê no checkout. 'true' por padrão: uma instalação que
  // nunca abriu esta tela precisa continuar aceitando tudo.
  payment_method_pix:             'true',
  payment_method_credit:          'true',
  payment_method_debit:           'true',
  payment_max_installments:       '12',
}

function settingsToMap(list) {
  return Object.fromEntries(list.map((s) => [s.setting_key, s.setting_value ?? '']))
}

// Redimensiona/comprime uma imagem no cliente e devolve um data URL JPEG.
function fileToResizedDataUrl(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale  = Math.min(1, max / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
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

// ── Split por Operador ─────────────────────────────────
function SplitPorOperador({ globalAdminPct, qc }) {
  const [overrides, setOverrides] = useState({})
  const [saved, setSaved]         = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['operators-split'],
    queryFn:  () => api.getUsers({ user_type: 'operator', limit: 100 }),
  })

  const operators = data?.data || []

  // Isenção de Mercado Pago: usada no "operador da casa", quando a própria
  // plataforma opera e paga os motoristas por fora (aba Repasses).
  const exemptMut = useMutation({
    mutationFn: ({ id, exempt }) => api.updateUser(id, { mp_payout_exempt: exempt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operators-split'] }),
    onError:   (err) => alert(err?.message || 'Não foi possível alterar a isenção.'),
  })

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
          <h2 className="text-sm font-semibold text-gray-200">Split por Operador</h2>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-xs text-gray-500 mb-4">
          Percentual da plataforma por operador. Quando não definido, usa o padrão global ({globalAdminPct}%).
        </p>
        {isLoading ? (
          <p className="text-xs text-gray-600">Carregando operadores…</p>
        ) : operators.length === 0 ? (
          <p className="text-xs text-gray-600">Nenhum operador cadastrado.</p>
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
                    {/* Sem Mercado Pago o operador não consegue aceitar corridas
                        (a não ser que esteja isento — operação própria). */}
                    <div className="flex items-center gap-2 mt-1">
                      {op.mp_payout_exempt ? (
                        <span className="text-[10px] font-semibold text-sky-400 bg-sky-900/30 px-1.5 py-0.5 rounded">
                          isento de MP · repasse manual
                        </span>
                      ) : op.mp_user_id ? (
                        <span className="text-[10px] font-semibold text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">
                          MP conectado
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">
                          sem MP · não aceita corridas
                        </span>
                      )}
                      <button
                        onClick={() => exemptMut.mutate({ id: op.id, exempt: !op.mp_payout_exempt })}
                        disabled={exemptMut.isPending}
                        className="text-[10px] text-gray-500 hover:text-gray-300 underline disabled:opacity-50"
                      >
                        {op.mp_payout_exempt ? 'exigir MP' : 'isentar'}
                      </button>
                    </div>
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
                            {' '}operador
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

      {/* Formas de pagamento */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-200">Formas de pagamento</h2>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-gray-500 mb-4">
            O que o cliente vê na hora de pagar. Desmarcar uma forma faz ela sumir
            do checkout na hora — vale para reservas novas e para as que já estão
            aguardando pagamento.
          </p>

          <div className="space-y-2">
            {[
              ['payment_method_pix',    'PIX',                'Aprovação na hora, sem taxa de cartão.'],
              ['payment_method_credit', 'Cartão de crédito',  'Permite parcelar.'],
              ['payment_method_debit',  'Cartão de débito',   'À vista, aprovação na hora.'],
            ].map(([chave, titulo, ajuda]) => {
              const ativo = form[chave] !== 'false'
              // Impede desligar a última: checkout sem forma de pagamento é
              // cliente pronto para pagar e sem como.
              const ultima = ativo && ['payment_method_pix','payment_method_credit','payment_method_debit']
                .filter((k) => form[k] !== 'false').length === 1
              return (
                <label
                  key={chave}
                  className={`flex items-start gap-3 rounded-xl p-3 border transition-colors ${
                    ativo ? 'bg-gray-800 border-gray-700' : 'bg-gray-850 border-gray-800 opacity-60'
                  } ${ultima ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  title={ultima ? 'Pelo menos uma forma precisa ficar ativa' : undefined}
                >
                  <input
                    type="checkbox"
                    checked={ativo}
                    disabled={ultima}
                    onChange={(e) => set(chave, e.target.checked ? 'true' : 'false')}
                    className="mt-0.5 w-4 h-4 accent-brand"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-200">{titulo}</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">
                      {ultima ? 'Única forma ativa — não dá para desligar.' : ajuda}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>

          {form.payment_method_credit !== 'false' && (
            <div className="mt-4">
              <Select
                label="Máximo de parcelas no crédito"
                value={form.payment_max_installments}
                onChange={(e) => set('payment_max_installments', e.target.value)}
              >
                {[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                  <option key={n} value={String(n)}>{n === 1 ? 'À vista (sem parcelar)' : `Até ${n}x`}</option>
                ))}
              </Select>
              <p className="text-[11px] text-gray-500 mt-1.5">
                Quem define juros e repasse é a sua conta no Mercado Pago — aqui você
                escolhe só até quantas vezes o cliente pode dividir.
              </p>
            </div>
          )}

          <SaveRow
            onSave={() => saveSection(
              ['payment_method_pix','payment_method_credit','payment_method_debit','payment_max_installments'],
              'method',
            )}
            pending={saveMut.isPending}
            saved={savedSection === 'method'}
          />
        </CardBody>
      </Card>

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
                {/* O texto acima dizia só metade: o servidor lê primeiro a
                    variável de ambiente do Render, e este campo é a reserva.
                    Sem essa explicação, preencher aqui e ver o webhook falhar
                    não fazia sentido nenhum para quem opera. */}
                <p className="text-xs text-gray-500">
                  O Webhook Secret preenchido aqui só é usado se a variável
                  <code className="mx-1 text-gray-400">MERCADO_PAGO_WEBHOOK_SECRET</code>
                  não estiver definida no servidor — ela tem prioridade.
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
              Define como cada pagamento é dividido entre a plataforma e o operador.
              O operador repassa seus motoristas manualmente.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  Operador % (calculado)
                </label>
                <div className="h-10 flex items-center px-3 rounded-lg bg-gray-800 border border-gray-700 text-sm font-semibold text-brand">
                  {operatorPct}%
                </div>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <p>Exemplo: reserva de <span className="text-gray-300">R$ 500</span></p>
              <p>→ Plataforma recebe <span className="text-brand">R$ {(500 * adminPct / 100).toFixed(2)}</span></p>
              <p>→ Operador recebe <span className="text-green-400">R$ {(500 * operatorPct / 100).toFixed(2)}</span></p>
            </div>
            <SaveRow
              onSave={() => saveSection(['payment_split_admin_pct'], 'split')}
              pending={saveMut.isPending}
              saved={savedSection === 'split'}
            />
          </div>
        </CardBody>
      </Card>

      {/* Split por operador */}
      <SplitPorOperador globalAdminPct={adminPct} qc={qc} />

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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

// ── Quadros "Descubra" da home ────────────────────────────
// Os quatro quadros no rodapé da home do turista. Cada um aceita uma foto de
// fundo; sem foto o app usa um degradê, então nunca fica um buraco na tela.
const DESCUBRA = [
  { chave: 'descubra_restaurantes_image_url', rotulo: 'Restaurantes', degrade: 'from-rose-400 to-orange-300' },
  { chave: 'descubra_eventos_image_url',      rotulo: 'Eventos',      degrade: 'from-violet-500 to-fuchsia-400' },
  { chave: 'descubra_lugares_image_url',      rotulo: 'Lugares',      degrade: 'from-emerald-500 to-teal-300' },
  { chave: 'descubra_dicas_image_url',        rotulo: 'Dicas',        degrade: 'from-amber-400 to-yellow-300' },
]

function QuadroDescubra({ item, url, onChange }) {
  const fileRef = useRef(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function escolher(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErro('Use JPEG, PNG ou WebP.'); return
    }
    setErro('')
    setEnviando(true)
    try {
      // Quadro pequeno na home: 800px já cobre telas retina e mantém o
      // arquivo leve — são quatro imagens carregando de uma vez.
      const dataUrl = await fileToResizedDataUrl(file, 800)
      const { url: nova } = await api.uploadSiteImage(dataUrl, `descubra-${item.rotulo}`)
      await onChange(nova)
    } catch (err) {
      setErro(err?.message || 'Falha ao enviar.')
    } finally {
      setEnviando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {/* Prévia no mesmo formato do app: foto, véu escuro e legenda embaixo. */}
      <div className="relative rounded-xl overflow-hidden border border-gray-700 aspect-[5/4]">
        <div className={`absolute inset-0 bg-gradient-to-br ${item.degrade}`} />
        {url && <img src={url} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/5" />
        <span className="absolute bottom-1.5 left-2 text-white text-[11px] font-bold">{item.rotulo}</span>
      </div>

      {erro && <p className="text-[11px] text-red-400">{erro}</p>}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={escolher} />
      <div className="flex gap-1.5">
        <Button type="button" onClick={() => fileRef.current?.click()} disabled={enviando} className="flex-1 !px-2 !text-xs">
          <Upload size={12} /> {enviando ? 'Enviando…' : (url ? 'Trocar' : 'Enviar')}
        </Button>
        {url && (
          <Button type="button" variant="ghost" onClick={() => onChange('')} disabled={enviando} className="!px-2">
            <Trash2 size={12} />
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Aparência tab (banner da home) ────────────────────────
function TabAparencia({ settings, qc }) {
  const fileRef = useRef(null)
  const [bannerUrl, setBannerUrl] = useState('')
  const [title, setTitle]         = useState('')
  const [subtitle, setSubtitle]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError]         = useState('')
  const [savedText, setSavedText] = useState(false)
  const [descubra, setDescubra]   = useState({})

  useEffect(() => {
    const m = settingsToMap(settings)
    setBannerUrl(m.home_banner_image_url || '')
    setTitle(m.home_banner_title || '')
    setSubtitle(m.home_banner_subtitle || '')
    setDescubra(Object.fromEntries(DESCUBRA.map((d) => [d.chave, m[d.chave] || ''])))
  }, [settings])

  async function salvarDescubra(chave, rotulo, url) {
    await persist(chave, url, `Foto do quadro "${rotulo}" no Descubra da home`)
    qc.invalidateQueries({ queryKey: ['settings'] })
    setDescubra((d) => ({ ...d, [chave]: url }))
  }

  function persist(key, value, description) {
    return api.updateSetting(key, { setting_value: value, value_type: 'string', description })
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use uma imagem JPEG, PNG ou WebP.'); return
    }
    setError('')
    setUploading(true)
    try {
      const dataUrl  = await fileToResizedDataUrl(file)
      const { url }  = await api.uploadSiteImage(dataUrl, 'home-banner')
      await persist('home_banner_image_url', url, 'Imagem de fundo do banner da home (turista)')
      qc.invalidateQueries({ queryKey: ['settings'] })
      setBannerUrl(url)
    } catch (err) {
      setError(err?.message || 'Falha ao enviar a imagem.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeImage() {
    setUploading(true)
    try {
      await persist('home_banner_image_url', '', 'Imagem de fundo do banner da home (turista)')
      qc.invalidateQueries({ queryKey: ['settings'] })
      setBannerUrl('')
    } finally { setUploading(false) }
  }

  function saveTexts() {
    Promise.all([
      persist('home_banner_title',    title,    'Título do banner da home'),
      persist('home_banner_subtitle', subtitle, 'Subtítulo do banner da home'),
    ]).then(() => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setSavedText(true)
      setTimeout(() => setSavedText(false), 2500)
    })
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-blue-900/20 border border-blue-800/30 rounded-xl p-4 text-sm">
        <p className="font-semibold text-blue-400 mb-1">Banner da Home</p>
        <p className="text-gray-500 text-xs">
          Imagem de fundo e textos do banner principal exibido na tela inicial do app do turista.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-200">Imagem de fundo</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            {/* Preview no mesmo estilo do app */}
            <div className="relative rounded-xl overflow-hidden border border-gray-700 bg-gray-900 aspect-[16/6] flex items-center">
              {bannerUrl
                ? <img src={bannerUrl} alt="Banner da home" className="absolute inset-0 w-full h-full object-cover" />
                : <div className="absolute inset-0 bg-gradient-to-r from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]" />}
              <div className="absolute inset-0 bg-gradient-to-r from-black/55 to-transparent" />
              <div className="relative px-6">
                <p className="text-white font-extrabold text-xl drop-shadow">{title || 'Descubra Jericoacoara'}</p>
                <p className="text-white/85 text-xs mt-1 drop-shadow max-w-xs">{subtitle || 'Passeios, transfers e experiências únicas você encontra aqui.'}</p>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} />
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload size={14} /> {uploading ? 'Enviando…' : (bannerUrl ? 'Trocar imagem' : 'Enviar imagem')}
              </Button>
              {bannerUrl && (
                <Button type="button" variant="ghost" onClick={removeImage} disabled={uploading}>
                  <Trash2 size={14} /> Remover
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-600">
              Recomendado: imagem ampla (paisagem), mín. 1600px de largura. A imagem é comprimida automaticamente.
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-200">Textos do banner</h2>
        </CardHeader>
        <CardBody>
          <div className="space-y-4">
            <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descubra Jericoacoara" />
            <Input label="Subtítulo" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Passeios, transfers e experiências únicas…" />
            <SaveRow onSave={saveTexts} pending={false} saved={savedText} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon size={16} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-200">Quadros “Descubra”</h2>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DESCUBRA.map((item) => (
              <QuadroDescubra
                key={item.chave}
                item={item}
                url={descubra[item.chave] || ''}
                onChange={(url) => salvarDescubra(item.chave, item.rotulo, url)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-4">
            Fotos de fundo dos quatro quadros no rodapé da home do turista. Cada
            uma é salva assim que você envia. Sem foto, o quadro fica com o degradê
            colorido — a tela nunca quebra por falta de imagem. Prefira fotos com o
            assunto no centro: o quadro é pequeno e corta as bordas.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

// ── Main component ────────────────────────────────────────
const TABS = [
  { id: 'sistema',    label: 'Sistema',    icon: Settings },
  { id: 'aparencia',  label: 'Aparência',  icon: ImageIcon },
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
      {tab === 'aparencia'  && <TabAparencia  settings={settings} qc={qc} />}
      {tab === 'pagamentos' && <TabPagamentos settings={settings} qc={qc} />}
    </div>
  )
}
