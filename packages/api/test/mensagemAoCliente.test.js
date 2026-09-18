// Qual mensagem de erro chega a quem está pagando.
//
// Havia DOIS filtros em série, cada um razoável sozinho, que juntos apagavam
// justamente as mensagens úteis:
//
// 1. `errorHandler` só deixava passar `status < 500`. Mas indisponibilidade que
//    nós detectamos ANTES de cobrar — gateway sem chave, split impossível — é
//    503 por definição. Então "O pagamento com cartão está temporariamente
//    indisponível. Use PIX, ou tente pelo Mercado Pago." virava "Tente de novo
//    em instantes", que é conselho ERRADO: tentar de novo não resolve falta de
//    configuração.
//
// 2. A tela de checkout, com razão, não exibia `err.message` — porque podia ser
//    o texto do gateway em inglês ("Checkout is disabled."). Só que ela
//    descartava também o que sobrou do filtro anterior.
//
// A correção não é afrouxar nenhum dos dois: é a rota DECLARAR quais mensagens
// foram escritas para o cliente ler (`err.cliente = true`). O padrão continua
// sendo esconder.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { errorHandler } = await import('../src/middleware/errorHandler.js')

// Resposta falsa, só o suficiente para capturar status e corpo.
function resposta() {
  const r = { code: null, corpo: null }
  r.status = (s) => { r.code = s; return r }
  r.json   = (b) => { r.corpo = b; return r }
  return r
}
const req = { method: 'POST', originalUrl: '/api/payments/intent' }

// O errorHandler loga o erro inteiro; sem silenciar, a saída do teste vira
// um muro de stack traces e esconde a falha de verdade.
function semRuido(fn) {
  const e = console.error
  console.error = () => {}
  try { return fn() } finally { console.error = e }
}

test('503 marcado como texto do cliente chega inteiro', () => {
  const err = new Error('O pagamento com cartão está temporariamente indisponível. Use PIX, ou tente pelo Mercado Pago.')
  err.status = 503
  err.cliente = true
  const res = semRuido(() => { const r = resposta(); errorHandler(err, req, r, () => {}); return r })
  assert.equal(res.code, 503)
  assert.equal(res.corpo.error, err.message)
  assert.equal(res.corpo.cliente, true, 'a tela precisa saber que pode exibir')
})

test('503 NÃO marcado continua virando genérico', () => {
  const err = new Error('ECONNREFUSED 10.0.0.3:5432')
  err.status = 503
  const res = semRuido(() => { const r = resposta(); errorHandler(err, req, r, () => {}); return r })
  assert.equal(res.corpo.error, 'Não foi possível concluir a operação. Tente de novo em instantes.')
  assert.ok(!res.corpo.cliente, 'sem a marca, a tela usa o texto dela')
})

test('erro de banco NÃO passa nem marcado — a marca não é um escape', () => {
  // O ponto que a marca não pode enfraquecer: um cliente já viu
  // "duplicate key value violates unique constraint ..." na tela de pagamento.
  for (const msg of [
    'duplicate key value violates unique constraint "payments_gateway_transaction_id_key"',
    'column "foo" does not exist',
    'relation "bookings" does not exist',
  ]) {
    const err = new Error(msg)
    err.status = 503
    err.cliente = true           // mesmo marcado por engano
    const res = semRuido(() => { const r = resposta(); errorHandler(err, req, r, () => {}); return r })
    assert.ok(!res.corpo.error.includes('constraint') && !res.corpo.error.includes('does not exist'),
      `vazou estrutura do banco: ${res.corpo.error}`)
    assert.ok(!res.corpo.cliente)
  }
})

test('código de erro do Postgres também é barrado com a marca', () => {
  const err = new Error('algo deu errado')
  err.code = '23505'
  err.status = 503
  err.cliente = true
  const res = semRuido(() => { const r = resposta(); errorHandler(err, req, r, () => {}); return r })
  assert.equal(res.corpo.error, 'Não foi possível concluir a operação. Tente de novo em instantes.')
})

test('500 sem marca continua genérico — nada afrouxou por padrão', () => {
  const err = new Error('Cannot read properties of undefined (reading id)')
  const res = semRuido(() => { const r = resposta(); errorHandler(err, req, r, () => {}); return r })
  assert.equal(res.code, 500)
  assert.equal(res.corpo.error, 'Não foi possível concluir a operação. Tente de novo em instantes.')
})

test('4xx continua passando sem precisar de marca', () => {
  const err = new Error('Informe o código do cupom')
  err.status = 400
  const res = semRuido(() => { const r = resposta(); errorHandler(err, req, r, () => {}); return r })
  assert.equal(res.corpo.error, 'Informe o código do cupom')
  assert.equal(res.corpo.cliente, true)
})

// ── As rotas que dependem disso ────────────────────────────────────────────

test('as indisponibilidades de pagamento que nós escrevemos estão marcadas', () => {
  const fonte = fs.readFileSync(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  // Todo erro >=500 que nós criamos com texto em português precisa da marca,
  // senão o texto é escrito e nunca lido.
  const blocos = [...fonte.matchAll(/e\.status = (50\d)\n([\s\S]{0,200}?)throw e/g)]
  assert.ok(blocos.length >= 3, 'esperava encontrar os erros 5xx autorais')
  for (const b of blocos) {
    assert.match(b[2], /e\.cliente = true/,
      `erro ${b[1]} sem a marca: a mensagem seria trocada pelo genérico`)
  }
})

test('o cliente do turista expõe a marca vinda do corpo', () => {
  const apiJs = fs.readFileSync(new URL('../../turista/src/lib/api.js', import.meta.url), 'utf8')
  assert.match(apiJs, /err\.cliente = data\.cliente === true/,
    'sem propagar a marca, a tela não tem como decidir')
})
