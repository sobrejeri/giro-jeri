// Validação de entrada do POST /payments/intent.
//
// Existe por um motivo concreto: um cliente tentou pagar e recebeu
// "String must contain at most 200 character(s)". O limite era do `device_id`,
// um sinal OPCIONAL do antifraude — e ele derrubou a cobrança inteira. A
// mensagem também não dizia qual campo, então nem o log nem a tela ajudavam.
//
// A regra que estes testes protegem: campo opcional não reprova pagamento.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'
const { intentSchema } = await import('../src/routes/payments.js')

const cartaoValido = {
  service_id: '11111111-1111-1111-1111-111111111111',
  service_date_iso: '2026-12-01',
  total_price: 10,
  payment_method: 'credit_card',
  card_token: 'tok_123',
  payment_method_id: 'master',
  payer_doc: '12345678901',
  payment_attempt_id: '22222222-2222-2222-2222-222222222222',
}

test('device_id longo do Mercado Pago não reprova a cobrança', () => {
  // O token do security.js passa dos 200 caracteres — era exatamente o tamanho
  // que o schema recusava.
  const deviceId = 'armor.' + 'a'.repeat(600)
  const r = intentSchema.safeParse({ ...cartaoValido, device_id: deviceId })
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.errors))
  assert.equal(r.data.device_id, deviceId, 'e chega inteiro ao antifraude')
})

test('device_id absurdo é descartado, não reprovado', () => {
  for (const lixo of ['a'.repeat(5000), '', 12345, {}]) {
    const r = intentSchema.safeParse({ ...cartaoValido, device_id: lixo })
    assert.equal(r.success, true, `device_id ${typeof lixo} não pode barrar o pagamento`)
    assert.equal(r.data.device_id, undefined, 'segue sem o sinal, em vez de falhar')
  }
})

test('mp_public_key inválida cai no caminho seguro, sem barrar', () => {
  const r = intentSchema.safeParse({ ...cartaoValido, mp_public_key: 'x'.repeat(900) })
  assert.equal(r.success, true)
  assert.equal(r.data.mp_public_key, undefined, 'sem a chave, o código cobra sem split')
})

// Estes SIM precisam reprovar: sem eles não existe proteção contra cobrança
// dupla nem cobrança nenhuma.
test('cartão sem chave de tentativa continua sendo recusado', () => {
  const { payment_attempt_id, ...semTentativa } = cartaoValido
  const r = intentSchema.safeParse(semTentativa)
  assert.equal(r.success, false, 'sem payment_attempt_id não se cobra cartão')
})

test('cartão sem token continua sendo recusado', () => {
  const { card_token, ...semToken } = cartaoValido
  assert.equal(intentSchema.safeParse(semToken).success, false)
})

test('PIX não exige nada de cartão', () => {
  const r = intentSchema.safeParse({
    service_id: cartaoValido.service_id, service_date_iso: '2026-12-01',
    total_price: 10, payment_method: 'pix',
  })
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.errors))
})
