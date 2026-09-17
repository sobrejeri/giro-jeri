// A chave do Pagar.me tem UMA fonte de verdade.
//
// O admin expõe DOIS campos que podem conter uma chave do Pagar.me:
//   • "API Key" da seção Gateway de Pagamento  → payment_gateway_api_key
//   • "Pagar.me — API Key (Secret Key)"        → payment_pagarme_api_key
//
// A cobrança sempre preferiu a segunda; a criação de recebedor lia só a
// primeira. Com valores diferentes nos dois campos — uma de teste e outra de
// produção, ou de lojas diferentes — o recebedor nasce numa conta e a cobrança
// acontece em outra. O recipient_id não existe lá e o split é recusado no
// PAGAMENTO, não no cadastro: o erro aparece longe da causa.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'
const { chaveDoPagarme } = await import('../src/routes/payments.js')

test('a chave própria do Pagar.me ganha da chave do gateway padrão', () => {
  assert.equal(chaveDoPagarme({
    payment_pagarme_api_key: 'sk_propria',
    payment_gateway_api_key: 'sk_do_gateway',
    payment_gateway: 'mercado_pago',
  }), 'sk_propria')
})

test('sem a chave própria, só usa a do gateway quando o gateway É o Pagar.me', () => {
  assert.equal(chaveDoPagarme({
    payment_gateway_api_key: 'sk_do_gateway', payment_gateway: 'pagarme',
  }), 'sk_do_gateway')
  // Com outro gateway ativo, aquele campo guarda a chave DELE — mandá-la ao
  // Pagar.me seria autenticar com o token do concorrente.
  assert.equal(chaveDoPagarme({
    payment_gateway_api_key: 'token_do_mercado_pago', payment_gateway: 'mercado_pago',
  }), '')
})

test('espaços em volta não quebram a autenticação', () => {
  assert.equal(chaveDoPagarme({ payment_pagarme_api_key: '  sk_com_espaco  ' }), 'sk_com_espaco')
})

test('sem chave nenhuma devolve string vazia, não undefined', () => {
  assert.equal(chaveDoPagarme({}), '')
  assert.equal(chaveDoPagarme(null), '')
})

test('o cadastro de recebedor usa a MESMA função da cobrança', () => {
  const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8')
  const i = admin.indexOf("action_type:     'register_recipient'")
  assert.notEqual(i, -1, 'rota de cadastro de recebedor não encontrada')
  const bloco = admin.slice(Math.max(0, i - 3000), i)
  assert.match(bloco, /chaveDoPagarme\(cfg\)/,
    'o cadastro precisa resolver a chave pela mesma função da cobrança')
  assert.ok(!/const apiKey\s*=\s*cfg\.payment_gateway_api_key \|\| '';/.test(bloco),
    'voltou a ler só payment_gateway_api_key — as duas pontas divergem de novo')
})
