// Testes do adaptador do Mercado Pago.
//
// O foco aqui é o que fica GRAVADO e o que é ENVIADO: um campo sensível que
// escape para `raw_response_json` fica no banco para sempre, e uma identidade
// inventada no `payer` derruba a aprovação em vez de ajudar.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Precisa existir ANTES do import: o módulo monta o cliente na carga. Sem token
// a criação falharia na checagem de configuração, antes de chegar nas validações
// que estes testes exercitam. É um token de sandbox e nada aqui chama a rede.
process.env.MP_ACCESS_TOKEN ||= 'TEST-token-de-teste'
const { createCardPayment, createPixPayment, sanitizedPaymentResult } =
  await import('../src/services/mercadoPago.js')

// Resposta com tudo que o Mercado Pago devolve de sensível num pagamento real.
const respostaCompleta = {
  id: 12345, status: 'approved', status_detail: 'accredited',
  payment_method_id: 'visa', payment_type_id: 'credit_card',
  collector_id: 777, transaction_amount: 5.75, installments: 1,
  external_reference: 'bk-1', date_approved: '2026-01-02T10:00:00.000-03:00',
  fee_details: [{ type: 'mercadopago_fee', amount: 0.25 }, { type: 'application_fee', amount: 4.85 }],
  transaction_details: { net_received_amount: 0.65, installment_amount: 5.75 },
  card: {
    first_six_digits: '411111', last_four_digits: '4321', security_code: '123',
    cardholder: { name: 'FULANO DE TAL', identification: { type: 'CPF', number: '12345678900' } },
  },
  payer: { id: 'p1', email: 'cliente@exemplo.com', identification: { type: 'CPF', number: '12345678900' } },
  token: 'TOKEN-SECRETO',
}

test('o snapshot gravado não carrega token, CVV, cartão nem CPF', () => {
  const texto = JSON.stringify(sanitizedPaymentResult(respostaCompleta))
  for (const proibido of ['TOKEN-SECRETO', 'security_code', '123456789', '411111']) {
    assert.equal(texto.includes(proibido), false, `${proibido} não pode ir para o banco`)
  }
  // Os 4 últimos dígitos ficam: identificam o cartão para o cliente sem
  // reconstituí-lo, e é o que a tela de reservas mostra.
  assert.equal(sanitizedPaymentResult(respostaCompleta).card_last_four, '4321')
})

test('o snapshot preserva o que a conciliação precisa', () => {
  const seguro = sanitizedPaymentResult(respostaCompleta)
  assert.equal(seguro.payment_id, '12345')
  assert.equal(seguro.collector_id, '777')
  assert.equal(seguro.external_reference, 'bk-1')
  assert.equal(seguro.transaction_amount, 5.75)
  assert.equal(seguro.date_approved, '2026-01-02T10:00:00.000-03:00')
  assert.equal(seguro.fee_amount, 5.1, 'a taxa real do MP só existia no extrato deles')
  assert.equal(seguro.net_received_amount, 0.65)
})

test('resposta vazia não quebra o snapshot', () => {
  const seguro = sanitizedPaymentResult(null)
  assert.equal(seguro.payment_id, null)
  assert.equal(seguro.fee_amount, null)
})

// A identidade fictícia derrubava a aprovação e ainda gravava no banco um
// comprador que não existe. Este é o último anteparo: se nem a conta nem o
// Brick trouxeram um e-mail, recusa dizendo o que fazer — nunca inventa um.
test('sem nenhum e-mail real, recusa com 422 em vez de inventar comprador', async () => {
  const semEmail = { amount: 10, description: 'x', paymentMethodId: 'visa', cardToken: 't',
    payerDoc: '12345678901', externalRef: 'bk-1', idempotencyKey: 'tentativa-1' }
  await assert.rejects(createCardPayment(semEmail), (err) => {
    assert.equal(err.status, 422)
    assert.match(err.message, /e-mail/i)
    return true
  })
  await assert.rejects(
    createPixPayment({ amount: 10, description: 'x', externalRef: 'bk-1' }),
    (err) => { assert.equal(err.status, 422); return true })
})

test('cartão sem chave de idempotência não é cobrado', async () => {
  await assert.rejects(
    createCardPayment({ amount: 10, description: 'x', paymentMethodId: 'visa', cardToken: 't',
      payerEmail: 'cliente@exemplo.com', payerDoc: '12345678901', externalRef: 'bk-1' }),
    /payment_attempt_id ausente/)
})

test('nenhuma identidade fictícia sobrou no código', async () => {
  const src = await readFile(new URL('../src/services/mercadoPago.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  for (const inventado of ['comprador@girojeri.com', "'Comprador'", "'Turiva'"]) {
    assert.equal(executavel.includes(inventado), false,
      `${inventado} como pagador derruba a aprovação e grava comprador inexistente`)
  }
})

test('a rota grava o snapshot seguro, não a resposta crua', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  assert.match(src, /raw_response_json: cardResult\.raw/)
  const mp = await readFile(new URL('../src/services/mercadoPago.js', import.meta.url), 'utf8')
  assert.match(mp, /raw:\s*sanitizedPaymentResult\(response\)/,
    'cardResult.raw precisa ser o snapshot sanitizado')
})

// Cadastro só com telefone é permitido (users.email é nulável, a constraint
// aceita email OU phone). Bloquear esses clientes seria trocar um problema por
// outro: o e-mail vem do Brick, digitado pelo comprador, e é tão real quanto.
test('a rota aceita o e-mail que o Brick coletou quando a conta não tem', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  const usos = executavel.match(/payerEmail:\s*\w+\.data\?\.email \|\| payer_email/g) || []
  assert.equal(usos.length, 3, 'cartão, PIX e PIX com split precisam do mesmo fallback real')
  assert.match(executavel, /payer_email:\s*z\.string\(\)\.email\(\)/,
    'e o servidor precisa validar que é um e-mail de verdade')
})

test('o checkout envia o e-mail do Brick junto com a cobrança', async () => {
  const jsx = await readFile(new URL('../../turista/src/pages/checkout/CheckoutPayment.jsx', import.meta.url), 'utf8')
  const executavel = jsx.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  const envios = executavel.match(/payer_email:\s*formData\?\.payer\?\.email/g) || []
  assert.equal(envios.length, 2, 'cartão e PIX')
})

// ═══════════════════════════════════════════════════════════════════════════
// additional_info — o bloco que o antifraude do Mercado Pago realmente lê
// ═══════════════════════════════════════════════════════════════════════════
// Sem ele a cobrança chega "nua": um valor, um cartão, e nada que explique o
// que está sendo comprado nem quem é o comprador. Compra sem contexto, de
// vendedor novo, é lida como risco — é causa documentada de
// cc_rejected_high_risk.
function clienteEspiao() {
  const enviados = []
  return { enviados, create: async (input) => { enviados.push(input); return { id: 1, status: 'approved' } } }
}

// CPF com dígitos verificadores corretos. O fixture antigo ('12345678901') era
// inválido — e passava porque nada conferia, que era exatamente o bug.
const CPF_VALIDO  = '52998224725'
const CNPJ_VALIDO = '11222333000181'

const cartaoBase = {
  amount: 10, description: 'Litoral Leste', paymentMethodId: 'master', cardToken: 'tok',
  payerEmail: 'cliente@exemplo.com', payerDoc: CPF_VALIDO,
  externalRef: 'bk-1', idempotencyKey: 'tentativa-1',
}

test('a cobrança leva o item comprado e o contexto do comprador', async () => {
  const espiao = clienteEspiao()
  await createCardPayment({
    ...cartaoBase, paymentClient: espiao,
    payerName: 'Maria Silva Souza', payerPhone: '+55 (85) 99876-5432',
    payerRegistrationDate: '2024-03-10T12:00:00.000Z',
    item: { id: 'tour-9', title: 'Litoral Leste Tradicional', quantity: 1, unit_price: 10 },
  })
  const { additional_info: info, payer } = espiao.enviados[0].body

  assert.equal(info.items[0].id, 'tour-9')
  assert.equal(info.items[0].title, 'Litoral Leste Tradicional')
  assert.equal(info.items[0].unit_price, 10)
  assert.equal(info.items[0].category_id, 'travels')

  assert.equal(info.payer.first_name, 'Maria')
  assert.equal(info.payer.last_name, 'Silva Souza')
  assert.deepEqual(info.payer.phone, { area_code: '85', number: '998765432' },
    'DDD e número separados, sem o +55')
  assert.equal(info.payer.registration_date, '2024-03-10T12:00:00.000Z')

  // O pagador principal continua com identidade real e completa.
  assert.equal(payer.email, 'cliente@exemplo.com')
  assert.equal(payer.identification.number, CPF_VALIDO)
})

test('telefone inválido é omitido, não enviado como lixo', async () => {
  for (const ruim of ['123', '', null, 'não é telefone', '5585']) {
    const espiao = clienteEspiao()
    await createCardPayment({ ...cartaoBase, paymentClient: espiao, payerPhone: ruim, payerName: 'Ana' })
    assert.equal(espiao.enviados[0].body.additional_info.payer.phone, undefined,
      `telefone "${ruim}" inventado piora o antifraude em vez de ajudar`)
  }
})

test('sem contexto nenhum, a cobrança sai igual — additional_info não é obrigatório', async () => {
  const espiao = clienteEspiao()
  await createCardPayment({ ...cartaoBase, paymentClient: espiao })
  assert.equal(espiao.enviados[0].body.additional_info, undefined)
  assert.equal(espiao.enviados[0].body.transaction_amount, 10)
})

// 3DS é o mecanismo que o Mercado Pago documenta para reverter recusa por
// risco: autenticado pelo emissor, a responsabilidade pela fraude passa para
// ele. 'optional' mantém isso barato — o desafio só aparece se o emissor pedir.
test('3DS vai como optional, nunca obrigando quem já seria aprovado', async () => {
  const espiao = clienteEspiao()
  await createCardPayment({ ...cartaoBase, paymentClient: espiao, threeDSecure: true })
  assert.equal(espiao.enviados[0].body.three_d_secure_mode, 'optional')
})

test('a rota pede 3DS no crédito também, não só no débito', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.match(executavel, /threeDSecure:\s*true/)
  assert.doesNotMatch(executavel, /threeDSecure:\s*payment_method === 'debit_card'/,
    'limitar ao débito desperdiça a única saída documentada para cc_rejected_high_risk')
})

// ═══════════════════════════════════════════════════════════════════════════
// Documento do pagador — "Invalid user identification number"
// ═══════════════════════════════════════════════════════════════════════════
// O caminho do cartão era o único que mandava `identification` SEMPRE e SEMPRE
// como CPF. Sem documento ia `number: undefined`; um CNPJ de 14 dígitos ia
// rotulado como CPF. Os dois o Mercado Pago recusa com essa mensagem crua, que
// não diz ao cliente o que corrigir.
test('CNPJ vai rotulado como CNPJ, não como CPF', async () => {
  const espiao = clienteEspiao()
  await createCardPayment({ ...cartaoBase, paymentClient: espiao, payerDoc: CNPJ_VALIDO })
  assert.deepEqual(espiao.enviados[0].body.payer.identification,
    { type: 'CNPJ', number: CNPJ_VALIDO })
})

test('CPF vai rotulado como CPF, só com dígitos', async () => {
  const espiao = clienteEspiao()
  await createCardPayment({ ...cartaoBase, paymentClient: espiao, payerDoc: '529.982.247-25' })
  assert.deepEqual(espiao.enviados[0].body.payer.identification,
    { type: 'CPF', number: CPF_VALIDO })
})

test('documento inválido vira erro que diz o que corrigir, sem cobrar', async () => {
  for (const ruim of ['12345678901', '11111111111', '123456789012', '00000000000000']) {
    const espiao = clienteEspiao()
    await assert.rejects(
      createCardPayment({ ...cartaoBase, paymentClient: espiao, payerDoc: ruim }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /CPF|CNPJ/)
        return true
      })
    assert.equal(espiao.enviados.length, 0, `"${ruim}" não pode chegar a virar cobrança`)
  }
})

test('cartão sem documento nenhum é recusado antes do gateway', async () => {
  const espiao = clienteEspiao()
  await assert.rejects(
    createCardPayment({ ...cartaoBase, paymentClient: espiao, payerDoc: undefined }),
    (err) => { assert.equal(err.status, 422); return true })
  assert.equal(espiao.enviados.length, 0)
})

// No PIX o documento é opcional — e continua sendo. O que mudou é que, quando
// vem, precisa ser válido.
test('PIX segue aceitando pagador sem documento', async () => {
  const src = await readFile(new URL('../src/services/mercadoPago.js', import.meta.url), 'utf8')
  const usos = src.match(/\.\.\.identificacaoDoPagador\(payerDoc\)/g) || []
  assert.equal(usos.length, 2, 'os dois caminhos de PIX, sem obrigatoriedade')
  assert.match(src, /identificacaoDoPagador\(payerDoc, \{ obrigatorio: true \}\)/,
    'só o cartão exige — é o gateway que exige')
})

// ═══════════════════════════════════════════════════════════════════════════
// Diagnóstico: separar "conta não habilitada" de "recusa por risco"
// ═══════════════════════════════════════════════════════════════════════════
// cc_rejected_high_risk é a MESMA mensagem para causas diferentes: cartão do
// cliente, comportamento suspeito, ou a conta recebedora sem cartão liberado.
// Daqui os três são indistinguíveis — só perguntando ao Mercado Pago se separa.
test('o diagnóstico diz quantos métodos de cada tipo a conta aceita', async () => {
  const respostas = {
    '/users/me': { id: 41422708, nickname: 'COPPER', site_id: 'MLB', tags: ['normal'], status: 'active' },
    '/v1/payment_methods': [
      { id: 'master', name: 'Mastercard', payment_type_id: 'credit_card', status: 'active' },
      { id: 'visa',   name: 'Visa',       payment_type_id: 'credit_card', status: 'inactive' },
      { id: 'pix',    name: 'PIX',        payment_type_id: 'bank_transfer', status: 'active' },
    ],
  }
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = async (url) => {
    const caminho = String(url).replace('https://api.mercadopago.com', '')
    return { ok: true, json: async () => respostas[caminho] }
  }
  try {
    const { diagnosticoDaConta } = await import('../src/services/mercadoPago.js')
    const d = await diagnosticoDaConta('APP_USR-token-do-operador')
    assert.equal(d.conta.id, '41422708')
    assert.equal(d.ambiente, 'production')
    assert.equal(d.resumo.credito_ativo, 1, 'só o Mastercard está ativo')
    assert.equal(d.resumo.pix_ativo, 1)
    assert.equal(d.resumo.debito_ativo, 0, 'débito ausente é débito não habilitado')
  } finally {
    globalThis.fetch = fetchOriginal
  }
})

test('conta que o Mercado Pago recusa consultar não derruba o diagnóstico', async () => {
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'invalid token' }) })
  try {
    const { diagnosticoDaConta } = await import('../src/services/mercadoPago.js')
    const d = await diagnosticoDaConta('APP_USR-token-vencido')
    assert.equal(d.conta.http, 401)
    assert.match(d.conta.erro, /invalid token/)
    assert.equal(d.metodos.http, 401, 'reporta as duas falhas em vez de lançar')
  } finally {
    globalThis.fetch = fetchOriginal
  }
})

test('o diagnóstico é restrito ao admin', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  assert.match(src, /router\.get\('\/diagnostico-cartao', authenticate, requireAdmin/,
    'expõe dados da conta do operador — não pode ficar aberto')
})

// Um token de cartão é criado com a chave PÚBLICA de uma conta e só vale para o
// access token DAQUELA conta. Cruzar as duas faz o Mercado Pago recusar com uma
// mensagem genérica — que é indistinguível de recusa por risco.
//
// Acontece de verdade: desligar o split no admin com a tela do checkout já
// aberta. Ela pegou a chave do operador antes da mudança e continua usando,
// enquanto o servidor passa a cobrar na plataforma.
test('token tokenizado na conta do operador não vai para cobrança da plataforma', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  assert.match(executavel, /if \(!split && mp_public_key && booking\?\.operator_id\)/,
    'sem esta checagem a cobrança sai fadada a falhar')
  assert.match(executavel, /A tela de pagamento está desatualizada/,
    'e o cliente precisa saber que é para recarregar, não que o cartão foi negado')
  // O caminho oposto (split ligado, chave divergente) já existia e continua.
  assert.match(executavel, /const mesmaConta = /)
})
