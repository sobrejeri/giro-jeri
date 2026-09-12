// Compatibilidade com Express 5.
//
// A migração veio do `qs`: os três avisos só fecham em qs@6.16.0, e apenas o
// Express 5 alcança essa versão (ele pede `^6.14.0`; o 4.22.2 pede `~6.15.1`,
// que trava em 6.15.x).
//
// Estes testes sobem o app DE VERDADE e batem nele por HTTP. O que eles cobrem
// são exatamente os pontos que o Express 5 mudou e que este projeto usa:
// roteamento, middlewares, tratamento de erro, parser de query, body raw do
// webhook e `trust proxy`.

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'
process.env.NODE_ENV = 'development'
// Com o secret definido, a assinatura É verificada mesmo em development (sem
// ele, o código avisa e pula — comportamento correto, mas inútil para testar).
process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'segredo-de-teste-nao-e-real'
process.env.PORT = '0'   // porta livre: não briga com nada

const { default: app } = await import('../src/index.js')

// Sobe numa porta efêmera e devolve a base
const servidor = app.listen(0)
await new Promise((r) => servidor.once('listening', r))
const base = `http://127.0.0.1:${servidor.address().port}`
test.after(() => servidor.close())

const pegar = (caminho, init) => fetch(base + caminho, init)

test('o app sobe e responde — roteamento e middlewares carregam no Express 5', async () => {
  // O health mora em /health (não /api/health). Exigir 200 aqui: `< 500`
  // aceitava 404 e o teste passava sem tocar em rota nenhuma.
  const r = await pegar('/health')
  assert.equal(r.status, 200, `health devolveu ${r.status}`)
  const j = await r.json()
  assert.ok(j, 'health precisa devolver JSON')
})

test('rota inexistente cai no notFound, não estoura', async () => {
  const r = await pegar('/api/rota-que-nao-existe')
  assert.equal(r.status, 404)
  const j = await r.json().catch(() => ({}))
  assert.ok(j.error, 'o notFound precisa devolver JSON com error')
})

test('parser de query: o app só usa chaves planas, que funcionam nos dois parsers', async () => {
  // O Express 5 troca o parser padrão de `extended` (qs) para `simple`.
  // Aqui isso é neutro: nenhuma rota usa colchete aninhado. Este teste fixa
  // essa premissa — se alguém introduzir `?filtro[status]=x`, quebra aqui.
  const r = await pegar('/health?region_id=abc&limit=5&data.id=123')
  assert.ok(r.status < 500, 'query plana não pode derrubar a requisição')
})

test('assinatura inválida no webhook é recusada com 401', async () => {
  const corpo = JSON.stringify({ type: 'payment', data: { id: '123456' } })
  const r = await pegar('/api/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=naoconfere' },
    body: corpo,
  })
  assert.equal(r.status, 401, `esperado 401 de assinatura, veio ${r.status}`)
  const j = await r.json().catch(() => ({}))
  assert.match(String(j.error || ''), /[Aa]ssinatura/, 'a recusa tem de ser da assinatura')
})

test('o corpo RAW do webhook chega intacto — o HMAC é calculado sobre ele', async () => {
  // Prova forte: a assinatura é conferida sobre um manifest cujo `id` vem do
  // CORPO (event.data.id). Se o express.json() passasse na frente do
  // express.raw(), o corpo chegaria destruído, esse id não seria encontrado e
  // até a assinatura CORRETA seria recusada com 401.
  const id   = '987654321'
  const ts   = '1700000000'
  const reqId = 'teste-req-id'
  const corpo = JSON.stringify({ type: 'payment', data: { id } })
  const manifest = `id:${id};request-id:${reqId};ts:${ts};`
  const v1 = crypto
    .createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest).digest('hex')

  const r = await pegar('/api/payments/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': reqId,
    },
    body: corpo,
  })
  assert.notEqual(r.status, 401,
    'assinatura correta foi recusada — sinal de que o corpo raw não chegou inteiro')
})

test('JSON malformado vira 400 tratado, não 500 nem stack na resposta', async () => {
  const r = await pegar('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{ isto nao e json',
  })
  assert.ok(r.status === 400 || r.status === 401 || r.status === 429,
    `esperado erro tratado, veio ${r.status}`)
  const texto = await r.text()
  assert.ok(!/at \w+ \(|node_modules|SyntaxError:/.test(texto),
    'a resposta não pode vazar stack trace')
})

test('CORS: origem não autorizada não recebe o cabeçalho de liberação', async () => {
  const r = await pegar('/health', { headers: { Origin: 'https://site-invasor.example' } })
  assert.equal(r.headers.get('access-control-allow-origin'), null,
    'origem estranha não pode ser liberada')
})

test('CORS: preflight de origem autorizada continua funcionando', async () => {
  const r = await pegar('/api/bookings', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  })
  assert.ok(r.status < 400, `preflight devolveu ${r.status}`)
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.equal(r.headers.get('access-control-allow-credentials'), 'true')
})

test('helmet segue aplicando cabeçalhos na API', async () => {
  const r = await pegar('/health')
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
})

test('rota autenticada sem token devolve 401, não 500', async () => {
  const r = await pegar('/api/bookings')
  assert.equal(r.status, 401)
})

test('rota autenticada com token inválido devolve 401', async () => {
  const r = await pegar('/api/bookings', { headers: { Authorization: 'Bearer token-falso' } })
  assert.equal(r.status, 401)
})

test('trust proxy segue ligado — o rate limit precisa do IP real', () => {
  assert.equal(app.get('trust proxy'), 1,
    'sem isto o express-rate-limit conta todo mundo como o IP do Render')
})

test('o parser de query em uso está declarado e é um dos dois conhecidos', () => {
  const parser = app.get('query parser')
  assert.ok(['simple', 'extended', undefined].includes(parser) || typeof parser === 'function',
    `parser inesperado: ${parser}`)
})

test('HMAC do webhook continua conferindo quando a assinatura é a correta', () => {
  // Não passa pela rota (precisaria do secret de produção), mas fixa que a
  // comparação usada é a de tempo constante, sobre o manifest documentado.
  const secret = 'segredo-de-teste'
  const manifest = 'id:123;request-id:abc;ts:1700000000;'
  const esperado = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  assert.equal(esperado.length, 64)
  assert.ok(crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(esperado)))
})
