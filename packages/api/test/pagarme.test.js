// Cobrança de cartão no Pagar.me.
//
// Existe porque o cartão precisou sair do Mercado Pago: nove hipóteses testadas
// em dois dias, todas descartadas, e a recusa por risco persistiu até com a
// cobrança nascendo na conta da plataforma, sem split. O PIX aprova na MESMA
// conta e por isso fica onde está.
//
// O foco aqui é o que vai NO CORPO da requisição — especialmente os CENTAVOS.
// Toda a API do Pagar.me trabalha em centavos inteiros e o resto do sistema em
// reais decimais: uma conversão esquecida cobra cem vezes mais.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  emCentavos, criarCheckoutCartao, estadoDoPedido, buscarPedidoPorCodigo,
} from '../src/payments/pagarmeCheckout.js'

function fetchEspiao(resposta, ok = true, status = 200) {
  const chamadas = []
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null, init })
    return { ok, status, json: async () => resposta }
  }
  return { chamadas, restaurar: () => { globalThis.fetch = original } }
}

const PEDIDO_OK = {
  id: 'or_abc123', status: 'pending',
  checkouts: [{ id: 'ch_1', payment_url: 'https://checkout.pagar.me/or_abc123' }],
}

const BASE = {
  apiKey: 'sk_test_123', amount: 10, description: 'Litoral Leste', bookingId: 'bk-1',
  retornoUrl: 'https://turivabrasil.com/checkout/processando?p=pay-9',
  clienteNome: 'Maria Silva', clienteEmail: 'cliente@exemplo.com',
  clienteDoc: '529.982.247-25', clienteTelefone: '+55 (85) 99876-5432',
  maxParcelas: 6, item: { id: 'tour-9', title: 'Litoral Leste Tradicional' },
}

// ── Centavos ────────────────────────────────────────────────────────────────
test('reais viram centavos inteiros, inclusive com lixo de ponto flutuante', () => {
  assert.equal(emCentavos(10), 1000)
  assert.equal(emCentavos(5.75), 575)
  // 5 * 1.15 dá 5.749999999999999 em JavaScript — é assim que um acréscimo
  // percentual chega aqui. Sem o arredondamento, viraria 574 centavos.
  assert.equal(emCentavos(5 * 1.15), 575)
  assert.equal(emCentavos(0.03), 3)
})

test('valor inválido não vira cobrança', () => {
  for (const ruim of [0, -1, null, undefined, NaN, 'abc']) {
    assert.throws(() => emCentavos(ruim), /Valor inválido/, `${ruim} não pode passar`)
  }
})

// ── O corpo do pedido ───────────────────────────────────────────────────────
test('o pedido leva valor em centavos, cliente real e o link de retorno', async () => {
  const espiao = fetchEspiao(PEDIDO_OK)
  try {
    const r = await criarCheckoutCartao(BASE)
    const { url, body, init } = espiao.chamadas[0]

    assert.match(url, /\/core\/v5\/orders$/)
    assert.match(init.headers.Authorization, /^Basic /)

    // CENTAVOS, nos dois lugares que o Pagar.me lê valor.
    assert.equal(body.items[0].amount, 1000)
    assert.equal(body.payments[0].checkout.credit_card.installments[0].total, 1000)

    // `code` é o id da RESERVA: é por ele que o webhook descobre a qual reserva
    // pertence uma cobrança que nunca vimos.
    assert.equal(body.code, 'bk-1')

    assert.equal(body.customer.email, 'cliente@exemplo.com')
    assert.equal(body.customer.document, '52998224725', 'documento só com dígitos')
    assert.equal(body.customer.document_type, 'CPF')
    assert.deepEqual(body.customer.phones.mobile_phone,
      { country_code: '55', area_code: '85', number: '998765432' })

    assert.equal(body.payments[0].checkout.success_url, BASE.retornoUrl)
    assert.deepEqual(body.payments[0].checkout.accepted_payment_methods,
      ['credit_card', 'debit_card'], 'crédito e débito, sem PIX — o PIX fica no Mercado Pago')
    assert.equal(body.payments[0].checkout.credit_card.installments.length, 6)

    assert.equal(r.redirect_url, 'https://checkout.pagar.me/or_abc123')
    assert.equal(r.pedido_id, 'or_abc123')
  } finally { espiao.restaurar() }
})

test('CNPJ é rotulado como CNPJ', async () => {
  const espiao = fetchEspiao(PEDIDO_OK)
  try {
    await criarCheckoutCartao({ ...BASE, clienteDoc: '11222333000181' })
    const doc = espiao.chamadas[0].body.customer
    assert.equal(doc.document_type, 'CNPJ')
    assert.equal(doc.type, 'company')
  } finally { espiao.restaurar() }
})

test('documento e telefone implausíveis são omitidos, não enviados como lixo', async () => {
  const espiao = fetchEspiao(PEDIDO_OK)
  try {
    await criarCheckoutCartao({ ...BASE, clienteDoc: '123', clienteTelefone: '999' })
    const c = espiao.chamadas[0].body.customer
    assert.equal(c.document, undefined, 'documento malformado derruba o pedido inteiro')
    assert.equal(c.phones, undefined, 'dado inconsistente é pior que dado ausente')
  } finally { espiao.restaurar() }
})

test('sem e-mail, recusa com 422 antes de tentar cobrar', async () => {
  const espiao = fetchEspiao(PEDIDO_OK)
  try {
    await assert.rejects(
      criarCheckoutCartao({ ...BASE, clienteEmail: null }),
      (err) => { assert.equal(err.status, 422); assert.match(err.message, /e-mail/i); return true })
    assert.equal(espiao.chamadas.length, 0)
  } finally { espiao.restaurar() }
})

test('sem API Key, o erro diz onde configurar', async () => {
  await assert.rejects(
    criarCheckoutCartao({ ...BASE, apiKey: '' }),
    (err) => { assert.equal(err.status, 503); assert.match(err.message, /API Key/); return true })
})

// ── Erros do gateway ────────────────────────────────────────────────────────
// Sem detalhar o campo, a mensagem vira "erro 422" e ninguém sabe o que
// corrigir — foi assim que só descobrimos o `disbursements` quando o Mercado
// Pago finalmente nomeou o parâmetro.
test('erro do Pagar.me nomeia o campo recusado', async () => {
  const espiao = fetchEspiao(
    { message: 'The request is invalid.', errors: { 'customer.document': ['is invalid'] } }, false, 422)
  try {
    await assert.rejects(criarCheckoutCartao(BASE), (err) => {
      assert.equal(err.status, 422)
      assert.match(err.message, /customer\.document/)
      return true
    })
  } finally { espiao.restaurar() }
})

test('pedido criado sem link falha alto em vez de deixar o cliente sem destino', async () => {
  const espiao = fetchEspiao({ id: 'or_x', checkouts: [{ id: 'ch_1' }] })
  try {
    await assert.rejects(criarCheckoutCartao(BASE), /não devolveu o link/)
  } finally { espiao.restaurar() }
})

test('falha do gateway (5xx) é distinguida de erro nosso (4xx)', async () => {
  const espiao = fetchEspiao({ message: 'internal' }, false, 500)
  try {
    await assert.rejects(criarCheckoutCartao(BASE), (err) => { assert.equal(err.status, 502); return true })
  } finally { espiao.restaurar() }
})

// ── Consulta e tradução ─────────────────────────────────────────────────────
test('a busca por código prefere o pedido pago', async () => {
  const espiao = fetchEspiao({ data: [
    { id: 'or_1', status: 'failed' },
    { id: 'or_2', status: 'paid' },
  ] })
  try {
    const achado = await buscarPedidoPorCodigo('sk_test', 'bk-1')
    assert.equal(achado.id, 'or_2', 'uma recusa anterior não pode esconder o que passou')
  } finally { espiao.restaurar() }
})

test('consulta que falha devolve null, não derruba quem chamou', async () => {
  const espiao = fetchEspiao({ message: 'nope' }, false, 500)
  try {
    assert.equal(await buscarPedidoPorCodigo('sk_test', 'bk-1'), null,
      'no webhook, lançar aqui viraria 500 e reentrega em loop')
  } finally { espiao.restaurar() }
})

test('o estado do pedido é traduzido num lugar só', () => {
  assert.equal(estadoDoPedido({ status: 'paid' }), 'approved')
  assert.equal(estadoDoPedido({ status: 'failed' }), 'failed')
  assert.equal(estadoDoPedido({ status: 'canceled' }), 'failed')
  assert.equal(estadoDoPedido({ status: 'pending' }), 'pending')
  assert.equal(estadoDoPedido({ status: 'processing' }), 'pending')
  // Status novo que o Pagar.me venha a criar não pode virar "aprovado".
  assert.equal(estadoDoPedido({ status: 'algo_novo' }), 'pending')
  assert.equal(estadoDoPedido(null), 'pending')
})

// ── A rota ──────────────────────────────────────────────────────────────────
test('a rota cria a linha ANTES do pedido, para o retorno saber o que consultar', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

  const iLinha  = executavel.indexOf("gateway_name:       'pagarme'")
  const iPedido = executavel.indexOf('criarCheckoutCartao({')
  assert.ok(iLinha > 0 && iPedido > 0, 'os dois trechos precisam existir')
  assert.ok(iLinha < iPedido,
    'sem a linha antes, o link de retorno não tem id para carregar')

  // E o link de retorno carrega o id dela.
  assert.match(executavel, /retornoUrl:\s+base \? `\$\{base\}\/checkout\/processando\?p=\$\{linha\.id\}`/)
})

test('o cartão no Pagar.me sai sem split', async () => {
  const src = await readFile(new URL('../src/payments/pagarmeCheckout.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  // `split` no Pagar.me é `split: [{ recipient_id, amount }]` dentro do
  // pagamento. Ele não pode aparecer: foi o split que colocou a conta nova do
  // operador como recebedora e disparou o risco no Mercado Pago.
  assert.doesNotMatch(executavel, /split:/,
    'o repasse ao operador sai pela tela de Repasses, não pelo gateway')
})
