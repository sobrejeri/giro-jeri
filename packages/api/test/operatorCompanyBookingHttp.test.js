// Integração HTTP: operador aceita reserva -> empresa acompanha o relatório.
// Somente localhost; autenticação, dados e pagamento totalmente simulados.
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'

process.env.SUPABASE_URL = 'http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'somente-teste-local'
process.env.SUPABASE_ANON_KEY = 'somente-teste-local'
process.env.ZAPI_INSTANCE_ID = ''
process.env.ZAPI_INSTANCE_TOKEN = ''
process.env.ZAPI_CLIENT_TOKEN = ''

const { supabase } = await import('../src/supabase.js')
const { _invalidateFeatureFlagCache } = await import('../src/services/featureFlags.js')
const { default: operator } = await import('../src/routes/operator.js')
const { default: company } = await import('../src/routes/company.js')

const ID = {
  companyA: 'aaaaaaaa-0000-4000-8000-000000000001',
  companyB: 'aaaaaaaa-0000-4000-8000-000000000002',
  opA: 'aaaaaaaa-0000-4000-8000-000000000003',
  opB: 'aaaaaaaa-0000-4000-8000-000000000004',
  formerA: 'aaaaaaaa-0000-4000-8000-000000000005',
  admin: 'aaaaaaaa-0000-4000-8000-000000000006',
  regionA: 'bbbbbbbb-0000-4000-8000-000000000001',
  regionB: 'bbbbbbbb-0000-4000-8000-000000000002',
  bookNew: 'cccccccc-0000-4000-8000-000000000001',
  bookForeign: 'cccccccc-0000-4000-8000-000000000002',
  bookHistorical: 'cccccccc-0000-4000-8000-000000000003',
  bookOtherCompany: 'cccccccc-0000-4000-8000-000000000004',
  bookCancelled: 'cccccccc-0000-4000-8000-000000000005',
}
const future = new Date(Date.now() + 86400000).toISOString()
const user = (id, type, company_id = null, more = {}) => ({
  id, auth_id: 'auth-' + id, user_type: type, company_id, is_active: true,
  full_name: type + ' ' + id.slice(-2), region_ids: [], ...more,
})
const booking = (id, operator_id, status_commercial, total_amount, region_id = ID.regionA, more = {}) => ({
  id, operator_id, status_commercial, total_amount, region_id,
  status_operational: operator_id ? 'assigned' : 'awaiting_acceptance',
  acceptance_expires_at: future, service_type: 'tour', service_id: 'tour-qa',
  service_date: '2026-11-27', service_time: '09:00:00',
  people_count: 2, user_id: null, booking_code: 'QA-' + id.slice(-3),
  operational_assignments: [], booking_payouts: [],
  ...more,
})

async function setup(t) {
  _invalidateFeatureFlagCache()
  const users = [
    user(ID.companyA, 'company', null, { full_name: 'Empresa QA A' }),
    user(ID.companyB, 'company', null, { full_name: 'Empresa QA B' }),
    user(ID.opA, 'operator', ID.companyA, { full_name: 'Operador QA A', region_ids: [ID.regionA] }),
    user(ID.opB, 'operator', ID.companyB, { full_name: 'Operador QA B', region_ids: [ID.regionB] }),
    user(ID.formerA, 'operator', ID.companyA, {
      full_name: 'Operador removido A', is_active: false, company_removed_at: '2026-11-20T10:00:00Z',
    }),
    user(ID.admin, 'admin', null, { full_name: 'Administrador QA' }),
  ]
  const bookings = [
    booking(ID.bookNew, null, 'awaiting_acceptance', 100),
    booking(ID.bookForeign, null, 'awaiting_acceptance', 120),
    booking(ID.bookHistorical, ID.formerA, 'paid', 50, ID.regionA, {
      booking_payouts: [{ kind: 'commission', amount: 42.5, status: 'paid', payee_user_id: ID.companyA }],
    }),
    booking(ID.bookOtherCompany, ID.opB, 'paid', 900, ID.regionB, {
      booking_payouts: [{ kind: 'commission', amount: 765, status: 'pending', payee_user_id: ID.companyB }],
    }),
    booking(ID.bookCancelled, ID.opA, 'cancelled', 70),
  ]
  const external = [
    { id: 'ext-a', company_id: ID.companyA, operator_id: ID.opA, service_date: '2026-11-27',
      status: 'active', total_amount: 30, service_description: 'Passeio externo QA', service_type: 'tour' },
    { id: 'ext-cancel', company_id: ID.companyA, operator_id: ID.opA, service_date: '2026-11-27',
      status: 'cancelled', total_amount: 60, service_description: 'Cancelado QA', service_type: 'tour' },
    { id: 'ext-b', company_id: ID.companyB, operator_id: ID.opB, service_date: '2026-11-27',
      status: 'active', total_amount: 800, service_description: 'Externo B', service_type: 'tour' },
  ]
  const tables = {
    users, bookings, external_bookings: external,
    tours: [{ id: 'tour-qa', name: 'Passeio QA' }],
    transfer_routes: [],
    system_settings: [{ setting_key: 'booking_legs_engine_enabled', setting_value: 'false' }],
    notifications: [],
  }
  const credentials = new Map([
    ['empresa-a', ID.companyA], ['empresa-b', ID.companyB], ['operador-a', ID.opA],
    ['operador-b', ID.opB], ['admin', ID.admin], ['removido', ID.formerA],
  ])
  t.mock.method(supabase.auth, 'getUser', async token => {
    const id = credentials.get(token)
    return id ? { data: { user: { id: 'auth-' + id } }, error: null }
      : { data: { user: null }, error: { message: 'Token fictício inválido' } }
  })
  t.mock.method(supabase, 'from', table => {
    assert.ok(Object.hasOwn(tables, table), 'Consulta inesperada: ' + table)
    let filters = [], operation = 'read', payload = null, sort = null, limit = Infinity
    let single = false
    const query = {
      select: () => query,
      eq: (key, val) => { filters.push(r => r[key] === val); return query },
      is: (key, val) => { filters.push(r => r[key] === val); return query },
      in: (key, values) => { filters.push(r => values.includes(r[key])); return query },
      gt: (key, val) => { filters.push(r => r[key] > val); return query },
      gte: (key, val) => { filters.push(r => r[key] >= val); return query },
      lte: (key, val) => { filters.push(r => r[key] <= val); return query },
      order: (key, options = {}) => { sort = [key, options.ascending !== false]; return query },
      limit: n => { limit = n; return query },
      maybeSingle: () => { single = true; return query },
      single: () => { single = true; return query },
      update: body => { operation = 'update'; payload = body; return query },
      insert: body => { operation = 'insert'; payload = body; return query },
      then(ok, fail) {
        const execute = () => {
          let rows = tables[table].filter(x => filters.every(fn => fn(x)))
          if (operation === 'update') for (const r of rows) Object.assign(r, payload)
          if (operation === 'insert') {
            const arr = Array.isArray(payload) ? payload : [payload]
            tables[table].push(...arr); rows = arr
          }
          if (sort) {
            const [key, ascending] = sort
            rows = [...rows].sort((a,b) => (String(a[key]??'').localeCompare(String(b[key]??'')))*(ascending?1:-1))
          }
          const result = rows.slice(0, limit).map(row=>structuredClone(row))
          return { data: single ? result[0] || null : result, error: null }
        }
        return Promise.resolve().then(execute).then(ok, fail)
      },
    }
    return query
  })
  const app = express()
  app.use(express.json())
  app.use('/api/operator', operator)
  app.use('/api/company', company)
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.() }))
  await once(server, 'listening')
  const base = 'http://127.0.0.1:' + server.address().port
  const request = async (path, { token, method = 'GET', companyId } = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    if (companyId) headers['X-Company-Id'] = companyId
    const response = await fetch(base + path, { method, headers })
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }
  }
  return { users, bookings, external, request }
}

const report = '/api/company/bookings?from=2026-11-01&to=2026-11-30'
test('HTTP: aceite de reserva pelo operador aparece na empresa, mas não soma venda antes de pagar', async t => {
  const a = await setup(t)
  const antes = await a.request(report, { token: 'empresa-a' })
  assert.equal(antes.status, 200, JSON.stringify(antes.body))
  assert.ok(!antes.body.rows.some(r => r.id === ID.bookNew))
  const aceito = await a.request('/api/operator/bookings/' + ID.bookNew + '/accept',
    { token: 'operador-a', method: 'POST' })
  assert.equal(aceito.status, 200, JSON.stringify(aceito.body))
  assert.equal(aceito.body.booking.id, ID.bookNew)
  assert.equal(a.bookings[0].operator_id, ID.opA)
  assert.equal(a.bookings[0].status_commercial, 'awaiting_payment')
  const depois = await a.request(report, { token: 'empresa-a' })
  assert.equal(depois.status, 200, JSON.stringify(depois.body))
  assert.equal(depois.cache, 'no-store')
  const linha = depois.body.rows.find(r => r.id === ID.bookNew)
  assert.equal(linha.vendedor_id, ID.opA)
  assert.equal(linha.conta, false)
  assert.equal(linha.valor, 100)
  assert.equal(depois.body.total.vendido_plataforma, 50, 'apenas a reserva histórica paga soma')
})

test('HTTP: simulando quitação no banco fictício, venda e comissão aparecem apenas na empresa credora', async t => {
  const a = await setup(t)
  const aceito = await a.request('/api/operator/bookings/' + ID.bookNew + '/accept',
    { token: 'operador-a', method: 'POST' })
  assert.equal(aceito.status, 200, JSON.stringify(aceito.body))
  // NÃO é checkout: somente mutação do array em memória, sem rede ou gateway.
  a.bookings[0].status_commercial = 'paid'
  a.bookings[0].booking_payouts = [
    { kind: 'commission', payee_user_id: ID.companyA, amount: 85, status: 'pending' },
    { kind: 'execution', payee_user_id: ID.opA, amount: 5, status: 'pending' },
  ]
  const ra = await a.request(report, { token: 'empresa-a' })
  const rb = await a.request(report, { token: 'empresa-b' })
  assert.equal(ra.status, 200)
  assert.equal(rb.status, 200)
  assert.equal(ra.body.total.vendido_plataforma, 150)
  assert.equal(ra.body.total.comissao, 127.5)
  const linha = ra.body.rows.find(r => r.id === ID.bookNew)
  assert.equal(linha.comissao, 85)
  assert.equal(linha.comissao_status, 'pending')
  assert.equal(rb.body.rows.some(r => r.id === ID.bookNew), false)
  assert.equal(rb.body.total.vendido_plataforma, 900)
  assert.equal(rb.body.total.comissao, 765)
})

test('HTTP: reservas da equipe removida permanecem no histórico da empresa original', async t => {
  const a = await setup(t)
  const r = await a.request(report, { token: 'empresa-a' })
  assert.equal(r.status, 200)
  const historico = r.body.rows.find(row => row.id === ID.bookHistorical)
  assert.equal(historico.vendedor_id, ID.formerA)
  assert.equal(historico.conta, true)
  assert.ok(r.body.operadores.some(x => x.operator_id === ID.formerA && x.removido))
  assert.equal(r.body.rows.some(row => row.id === ID.bookOtherCompany), false)
})

test('HTTP: vendas externas da empresa A entram nos totais; externas B nunca vazam', async t => {
  const a = await setup(t)
  const r = await a.request(report, { token: 'empresa-a' })
  assert.equal(r.status, 200)
  assert.equal(r.body.total.vendido_externo, 30)
  assert.equal(r.body.total.externas, 1)
  assert.ok(r.body.rows.some(row => row.id === 'ext-a'))
  assert.ok(r.body.rows.some(row => row.id === 'ext-cancel' && !row.conta))
  assert.ok(!r.body.rows.some(row => row.id === 'ext-b'))
})

test('HTTP: chamada direta de aceite fora do município é recusada antes de atribuir reserva', async t => {
  const a = await setup(t)
  const r = await a.request('/api/operator/bookings/' + ID.bookForeign + '/accept',
    { token: 'operador-b', method: 'POST' })
  // B só opera na região B; esta reserva é da região A.
  assert.equal(r.status, 403, JSON.stringify(r.body))
  assert.equal(a.bookings[1].operator_id, null)
  assert.equal(a.bookings[1].status_commercial, 'awaiting_acceptance')
})

test('HTTP: segundo aceite da mesma reserva é recusado, sem reassociar operador', async t => {
  const a = await setup(t)
  const url = '/api/operator/bookings/' + ID.bookNew + '/accept'
  assert.equal((await a.request(url, { token: 'operador-a', method: 'POST' })).status, 200)
  const duplicado = await a.request(url, { token: 'operador-a', method: 'POST' })
  assert.equal(duplicado.status, 409)
  assert.equal(a.bookings[0].operator_id, ID.opA)
})

test('HTTP: administrador pode consultar B sem expor dados A e empresa não troca alvo via header', async t => {
  const a = await setup(t)
  const admin = await a.request(report, { token: 'admin', companyId: ID.companyB })
  const wrong = await a.request(report, { token: 'empresa-a', companyId: ID.companyB })
  assert.equal(admin.status, 200)
  assert.equal(wrong.status, 200)
  assert.ok(admin.body.rows.some(r => r.id === ID.bookOtherCompany))
  assert.ok(!admin.body.rows.some(r => r.id === ID.bookHistorical))
  assert.ok(wrong.body.rows.some(r => r.id === ID.bookHistorical))
  assert.ok(!wrong.body.rows.some(r => r.id === ID.bookOtherCompany))
})

test('HTTP: operador não tem acesso aos relatórios de empresa e empresa não pode aceitar reserva', async t => {
  const a = await setup(t)
  assert.equal((await a.request(report, { token: 'operador-a' })).status, 403)
  const r = await a.request('/api/operator/bookings/' + ID.bookNew + '/accept',
    { token: 'empresa-a', method: 'POST' })
  assert.equal(r.status, 403)
  assert.equal(a.bookings[0].operator_id, null)
})
