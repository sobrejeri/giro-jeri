// Testes HTTP reais do router empresarial, com Supabase inteiramente simulado.
// Nenhum token, CPF, reserva ou credencial de produção é utilizado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import express from 'express'

// Mesmo se o teste for executado por engano fora do CI, o cliente nunca aponta
// para um projeto remoto. A API HTTP local recebe somente tokens fictícios.
process.env.SUPABASE_URL = 'http://127.0.0.1:1'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'somente-teste-http-local'
process.env.SUPABASE_ANON_KEY = 'somente-teste-http-local'
const { supabase } = await import('../src/supabase.js')
const { default: company } = await import('../src/routes/company.js')

const ID = {
  a: 'aaaaaaaa-0000-4000-8000-000000000001',
  b: 'aaaaaaaa-0000-4000-8000-000000000002',
  admin: 'aaaaaaaa-0000-4000-8000-000000000003',
  opA: 'aaaaaaaa-0000-4000-8000-000000000004',
  opB: 'aaaaaaaa-0000-4000-8000-000000000005',
  opInactive: 'aaaaaaaa-0000-4000-8000-000000000006',
}
const perfil = (id, nome, tipo, extras = {}) => ({
  id, auth_id: 'mock-auth-' + id, full_name: nome, user_type: tipo,
  is_active: true, company_id: null, company_removed_at: null,
  company_commission_pct: null, company_commission_since: null,
  email: id + '@invalid.example', ...extras,
})
const payload = {
  full_name: 'Operador criado no teste HTTP',
  email: 'OPERADOR-QA@INVALID.EXAMPLE',
  document: '529.982.247-25', password: 'senha-ficticia-nao-utilizavel',
  commission_pct: 10,
}

async function ambiente(t) {
  const users = [
    perfil(ID.a, 'Empresa A QA', 'company'),
    perfil(ID.b, 'Empresa B QA', 'company'),
    perfil(ID.admin, 'Admin QA', 'admin'),
    perfil(ID.opA, 'Operador A QA', 'operator', { company_id: ID.a }),
    perfil(ID.opB, 'Operador B QA', 'operator', { company_id: ID.b }),
    perfil(ID.opInactive, 'Operador inativo QA', 'operator', { company_id: ID.a, is_active: false }),
  ]
  const authCriados = [], authRemovidos = [], senhasAlteradas = [], logs = []
  const state = { failInsert: false }
  const tokens = new Map([
    ['empresa-a', ID.a], ['empresa-b', ID.b], ['admin', ID.admin],
    ['operador-a', ID.opA], ['operador-inativo', ID.opInactive],
  ])

  t.mock.method(supabase.auth, 'getUser', async token => {
    const id = tokens.get(token)
    return id ? { data: { user: { id: 'mock-auth-' + id } }, error: null }
      : { data: { user: null }, error: { message: 'Token simulado inválido' } }
  })
  t.mock.method(supabase.auth.admin, 'createUser', async data => {
    const authId = randomUUID()
    authCriados.push({ id: authId, ...data })
    return { data: { user: { id: authId } }, error: null }
  })
  t.mock.method(supabase.auth.admin, 'deleteUser', async id => {
    authRemovidos.push(id)
    return { data: {}, error: null }
  })
  t.mock.method(supabase.auth.admin, 'updateUserById', async (id, data) => {
    senhasAlteradas.push({ id, ...data })
    return { data: { user: { id } }, error: null }
  })

  // Mock deliberadamente pequeno: reproduz filtros, projeção e cardinalidade.
  // Qualquer tabela não prevista falha, em vez de acessar um banco de verdade.
  t.mock.method(supabase, 'from', tabela => {
    assert.ok(['users', 'audit_logs'].includes(tabela), 'Tabela inesperada: ' + tabela)
    let filtros = [], colunas = null, acao = 'select', dados, limite = Infinity, unico = false
    const run = () => {
      if (tabela === 'audit_logs') {
        assert.equal(acao, 'insert')
        logs.push(structuredClone(dados))
        return { data: null, error: null }
      }
      if (acao === 'insert' && state.failInsert) {
        return { data: null, error: { code: '23514', message: 'Falha simulada de perfil' } }
      }
      let linhas = users.filter(u => filtros.every(f => f(u)))
      if (acao === 'insert') {
        const row = { id: randomUUID(), is_active: true, company_removed_at: null, ...dados }
        users.push(row)
        linhas = [row]
      }
      if (acao === 'update') {
        for (const u of linhas) Object.assign(u, dados)
      }
      linhas = linhas.slice(0, limite).map(u => colunas
        ? Object.fromEntries(colunas.split(',').map(c => c.trim()).filter(c => c in u).map(c => [c, u[c]]))
        : { ...u })
      if (unico && linhas.length > 1) return { data: null, error: { code: 'PGRST116' } }
      return { data: unico ? linhas[0] || null : linhas, error: null }
    }
    const q = {
      select: c => { colunas = c; return q },
      eq: (c, v) => { filtros.push(u => u[c] === v); return q },
      order: () => q,
      limit: n => { limite = n; return q },
      insert: v => { acao = 'insert'; dados = v; return q },
      update: v => { acao = 'update'; dados = v; return q },
      maybeSingle: () => { unico = true; return q },
      single: () => { unico = true; return q },
      then: (ok, fail) => Promise.resolve().then(run).then(ok, fail),
    }
    return q
  })
  const app = express()
  app.use(express.json())
  app.use('/api/company', company)
  app.use((err, req, res, next) => res.status(500).json({ error: err.message || String(err) }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.() }))
  await once(server, 'listening')
  const base = 'http://127.0.0.1:' + server.address().port + '/api/company'
  const request = async (path, { token, alvo, method = 'GET', body } = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    if (alvo) headers['X-Company-Id'] = alvo
    const r = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: r.status, json: await r.json(), cache: r.headers.get('cache-control') }
  }
  return { users, authCriados, authRemovidos, senhasAlteradas, logs, state, request }
}

test('HTTP: sem token, token inválido, operador e operador inativo não acessam painel empresarial', async t => {
  const { request } = await ambiente(t)
  for (const [token, status] of [[undefined, 401], ['invalido', 401], ['operador-a', 403], ['operador-inativo', 403]]) {
    assert.equal((await request('/team', { token })).status, status)
  }
})

test('HTTP: empresa não consegue trocar de empresa pelo cabeçalho', async t => {
  const { request } = await ambiente(t)
  const r = await request('/team', { token: 'empresa-a', alvo: ID.b })
  assert.equal(r.status, 200)
  assert.equal(r.cache, 'no-store')
  assert.deepEqual(r.json.team.map(u => u.id).sort(), [ID.opA, ID.opInactive].sort())
  assert.ok(r.json.team.every(u => !('auth_id' in u)))
  assert.equal((await request('/companies', { token: 'empresa-a' })).status, 403)
})

test('HTTP: administrador escolhe empresa explicitamente; alvo inválido ou operador é recusado', async t => {
  const { request } = await ambiente(t)
  assert.equal((await request('/team', { token: 'admin' })).status, 400)
  assert.equal((await request('/team', { token: 'admin', alvo: ID.opA })).status, 404)
  const r = await request('/team', { token: 'admin', alvo: ID.b })
  assert.equal(r.status, 200)
  assert.deepEqual(r.json.team.map(u => u.id), [ID.opB])
})

test('HTTP: empresa cria operador com vínculo próprio, login sintético e comissão válida', async t => {
  const a = await ambiente(t)
  const r = await a.request('/team', { method: 'POST', token: 'empresa-a', body: payload })
  assert.equal(r.status, 201, JSON.stringify(r.json))
  const u = a.users.find(u => u.id === r.json.id)
  assert.equal(u.company_id, ID.a)
  assert.equal(u.user_type, 'operator')
  assert.equal(u.email, 'operador-qa@invalid.example')
  assert.equal(u.company_commission_pct, 10)
  assert.equal(a.authCriados.length, 1)
  assert.equal(a.authCriados[0].email, '52998224725@op.girojeri.app')
  assert.equal(u.auth_id, a.authCriados[0].id)
  assert.equal(a.logs[0].user_id, ID.a)
  assert.ok(!JSON.stringify(a.logs).includes(payload.password))
  assert.ok(!('auth_id' in r.json))
})

test('HTTP: vínculo forjado no corpo, documento inválido e duplicidade são recusados', async t => {
  const a = await ambiente(t)
  for (const body of [{ ...payload, company_id: ID.b }, { ...payload, document: '00000000000' }]) {
    assert.equal((await a.request('/team', { token: 'empresa-a', method: 'POST', body })).status, 400)
  }
  assert.equal(a.authCriados.length, 0)
  a.users.find(u => u.id === ID.opB).document_number = '52998224725'
  const r = await a.request('/team', { token: 'empresa-a', method: 'POST', body: payload })
  assert.equal(r.status, 409)
  assert.equal(a.authCriados.length, 0)
})

test('HTTP: falha ao inserir perfil desfaz o usuário Auth criado', async t => {
  const a = await ambiente(t)
  a.state.failInsert = true
  const r = await a.request('/team', { token: 'empresa-a', method: 'POST', body: payload })
  assert.equal(r.status, 400)
  assert.equal(a.authCriados.length, 1)
  assert.deepEqual(a.authRemovidos, [a.authCriados[0].id])
  assert.equal(a.users.length, 6)
})

test('HTTP: outra empresa não edita, troca senha ou remove operador alheio', async t => {
  const a = await ambiente(t)
  for (const [method, path, body] of [
    ['PATCH', '/team/' + ID.opB, { full_name: 'Invasão QA' }],
    ['POST', '/team/' + ID.opB + '/password', { new_password: 'senha-apenas-qa' }],
    ['DELETE', '/team/' + ID.opB, undefined],
  ]) {
    assert.equal((await a.request(path, { method, body, token: 'empresa-a' })).status, 404)
  }
  assert.equal(a.senhasAlteradas.length, 0)
  assert.equal(a.users.find(u => u.id === ID.opB).full_name, 'Operador B QA')
  assert.equal(a.logs.length, 0)
})

test('HTTP: admin remove operador preservando vínculo e auditoria do ator real', async t => {
  const a = await ambiente(t)
  const r = await a.request('/team/' + ID.opA, { method: 'DELETE', token: 'admin', alvo: ID.a })
  assert.equal(r.status, 200)
  const u = a.users.find(u => u.id === ID.opA)
  assert.equal(u.is_active, false)
  assert.equal(u.company_id, ID.a)
  assert.ok(u.company_removed_at)
  assert.equal(a.logs[0].user_id, ID.admin)
  assert.equal(a.logs[0].new_values_json.company_id, ID.a)
  assert.equal(a.logs[0].new_values_json.por_admin, true)
  assert.equal((await a.request('/team/' + ID.opA + '/password', {
    method: 'POST', token: 'empresa-a', body: { new_password: 'senha-apenas-qa' },
  })).status, 404)
  const lista = await a.request('/team', { token: 'empresa-a' })
  assert.deepEqual(lista.json.removed.map(u => u.id), [ID.opA])
})
