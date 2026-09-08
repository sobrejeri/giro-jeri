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

// Precisam existir ANTES de importar a rota: ela monta o cliente do Supabase na
// carga e aborta sem elas. Nada aqui toca o banco — os testes leem funções
// puras e o texto dos arquivos.
process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'
process.env.MP_ACCESS_TOKEN ||= 'TEST-token-de-teste'

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

// ═══════════════════════════════════════════════════════════════════════════
// Três opções de recebimento na mesma tela
// ═══════════════════════════════════════════════════════════════════════════
// Mercado Pago (cartão, exige conta lá), Pagar.me (cartão, não exige nada) e
// PIX (Mercado Pago). Os dois de cartão coexistem porque cada um atende um
// público que o outro não atende — inclusive o turista estrangeiro, que não tem
// conta no MP nem faz PIX.

test('lista vazia mantém o comportamento antigo: um adquirente só', async () => {
  const { acquirersDeCartao } = await import('../src/routes/payments.js')
  assert.deepEqual(acquirersDeCartao({ payment_gateway: 'mercado_pago' }), ['mercado_pago'])
  assert.deepEqual(acquirersDeCartao({ payment_gateway: 'mercado_pago', payment_gateway_card: 'pagarme' }),
    ['pagarme'], 'a chave por método continua mandando quando não há lista')
  // Instalação que nunca abriu a tela não pode mudar de comportamento.
  assert.deepEqual(acquirersDeCartao({}), [], 'sem gateway nenhum, nenhum cartão')
})

test('a lista oferece os dois adquirentes, na ordem, sem repetir nem inventar', async () => {
  const { acquirersDeCartao } = await import('../src/routes/payments.js')
  assert.deepEqual(
    acquirersDeCartao({ payment_card_acquirers: 'mercado_pago,pagarme' }),
    ['mercado_pago', 'pagarme'])
  assert.deepEqual(
    acquirersDeCartao({ payment_card_acquirers: ' pagarme , mercado_pago ' }),
    ['pagarme', 'mercado_pago'], 'espaço em volta não pode desligar uma opção')
  assert.deepEqual(
    acquirersDeCartao({ payment_card_acquirers: 'pagarme,pagarme' }), ['pagarme'])
  // Valor com erro de digitação viraria um botão que não cobra em lugar nenhum.
  assert.deepEqual(
    acquirersDeCartao({ payment_card_acquirers: 'pagar.me,mercadopago,pagarme' }), ['pagarme'])
  // A lista tem prioridade sobre a chave antiga — senão haveria duas verdades.
  assert.deepEqual(
    acquirersDeCartao({ payment_gateway_card: 'mercado_pago', payment_card_acquirers: 'pagarme' }),
    ['pagarme'])
})

// A escolha do cliente é um PEDIDO. Aceitá-la sem conferir deixaria qualquer um
// cobrar por um caminho que o admin desligou — a mesma regra que já vale para
// `checkout_pro`, onde quem manda é o servidor.
test('o cliente escolhe o adquirente, mas só dentro do que foi oferecido', async () => {
  const { gatewayDoMetodo } = await import('../src/routes/payments.js')
  const cfg = { payment_gateway: 'mercado_pago', payment_card_acquirers: 'mercado_pago,pagarme' }

  assert.equal(gatewayDoMetodo(cfg, 'credit_card', 'pagarme'), 'pagarme')
  assert.equal(gatewayDoMetodo(cfg, 'credit_card', 'mercado_pago'), 'mercado_pago')
  assert.equal(gatewayDoMetodo(cfg, 'credit_card'), 'mercado_pago', 'sem escolha, o padrão')

  // Fora da lista: cai no padrão, NÃO cobra pelo que foi pedido.
  const so = { payment_gateway: 'mercado_pago', payment_card_acquirers: 'mercado_pago' }
  assert.equal(gatewayDoMetodo(so, 'credit_card', 'pagarme'), 'mercado_pago',
    'adquirente desligado no admin não pode ser ligado pelo pedido do app')
  assert.equal(gatewayDoMetodo(so, 'credit_card', 'asaas'), 'mercado_pago')

  // PIX não tem escolha de adquirente: ele fica onde está, funcionando.
  assert.equal(gatewayDoMetodo({ ...cfg, payment_gateway_pix: 'mercado_pago' }, 'pix', 'pagarme'),
    'mercado_pago', 'o PIX não pode ser desviado pelo pedido do app')
})

// `payment_gateway_api_key` é a chave do gateway PADRÃO — hoje o Mercado Pago.
// Lê-la para chamar o Pagar.me mandaria o access token do MP no Authorization
// deles: falha de autenticação com mensagem que não diz nada sobre a causa.
test('a chave do Pagar.me nunca vem da chave do Mercado Pago', async () => {
  const { chaveDoPagarme } = await import('../src/routes/payments.js')
  const semEnv = { ...process.env }
  delete process.env.PAGARME_API_KEY
  try {
    assert.equal(
      chaveDoPagarme({ payment_gateway: 'mercado_pago', payment_gateway_api_key: 'APP_USR-token-do-mp' }),
      '', 'o token do Mercado Pago não pode virar credencial do Pagar.me')
    assert.equal(
      chaveDoPagarme({ payment_gateway: 'mercado_pago', payment_gateway_api_key: 'APP_USR-x',
        payment_pagarme_api_key: 'sk_real' }),
      'sk_real')
    // Quando o Pagar.me É o gateway padrão, aquele campo é mesmo a chave dele.
    assert.equal(
      chaveDoPagarme({ payment_gateway: 'pagarme', payment_gateway_api_key: 'sk_legado' }), 'sk_legado')
  } finally { process.env = semEnv }
})

// Um botão que responde 503 depois do clique é pior que botão nenhum: o cliente
// já decidiu pagar e leva um erro sem entender por quê.
test('o Pagar.me só é oferecido quando há chave — e a chave nunca sai na resposta', async () => {
  const src = await readFile(new URL('../src/routes/settings.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

  assert.match(executavel, /if \(g === 'pagarme'\) return !!chaveDoPagarme\(todas\)/,
    'sem chave, o adquirente não pode entrar na lista pública')
  assert.match(executavel, /if \(g === 'asaas'\)\s+return false/,
    'asaas não tem integração e não pode virar botão')
  // A rota é pública e sem autenticação: nenhum segredo pode ser copiado para
  // a resposta. O filtro só pode produzir o booleano.
  assert.doesNotMatch(executavel, /map\.payment_pagarme_api_key/)
  assert.doesNotMatch(executavel, /map\.payment_gateway_api_key/)
})

// Sem isto, o cliente paga no Pagar.me e a reserva NUNCA confirma: era
// exatamente o estado do código antes — adaptador escrito, e nada consultando
// o desfecho.
test('o desfecho do Pagar.me é aplicado pelo polling E pelo webhook', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

  assert.match(executavel, /router\.post\('\/webhook\/pagarme'/,
    'rota própria: o /webhook do MP rejeitaria o evento por assinatura')
  assert.match(executavel, /payment\.gateway_name === 'pagarme'[\s\S]{0,400}aplicarDesfechoPagarme/,
    'o polling de /status precisa resolver sozinho, sem depender do webhook')

  // Uma função só para os dois caminhos: duas cópias divergem, e divergir aqui
  // é confirmar reserva não paga ou deixar paga como pendente.
  const usos = executavel.match(/aplicarDesfechoPagarme\(/g) || []
  assert.ok(usos.length >= 3, `esperado definição + dois usos, achei ${usos.length}`)

  // O estado vem da API, nunca do corpo do evento — que qualquer um forja.
  assert.match(executavel, /consultarPedido|buscarPedidoPorCodigo/)
  assert.doesNotMatch(executavel, /event\?\.data\?\.status|dados\.status/,
    'o status não pode ser lido do corpo do webhook')
})

// O /status precisa TRAZER o rastro onde mora o id do pedido. Sem a coluna no
// select, `raw_response_json` chega indefinido e o polling não tem o que
// consultar — falha silenciosa, tela girando para sempre.
test('o polling seleciona a coluna onde o id do pedido está guardado', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const i = src.indexOf("router.get('/:id/status'")
  assert.ok(i > 0)
  const bloco = src.slice(i, i + 1200)
  assert.match(bloco, /raw_response_json/,
    'sem esta coluna o polling do Pagar.me não sabe qual pedido consultar')
})

// O adapter do Pagar.me existe e cobre CARTÃO. Chegar na guarda de "sem
// adapter" com gateway 'pagarme' significa PIX apontado para ele — que não
// existe e não pode virar pagamento manual em silêncio.
test('cartão no Pagar.me não cai na guarda de adquirente sem integração', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const executavel = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  const iCartao  = executavel.indexOf("if (gateway === 'pagarme' && ['credit_card'")
  const iGuarda  = executavel.indexOf("if (['asaas', 'pagarme'].includes(gateway))")
  assert.ok(iCartao > 0 && iGuarda > 0, 'os dois trechos precisam existir')
  assert.ok(iCartao < iGuarda,
    'o ramo do cartão precisa vir ANTES da guarda, senão nunca é alcançado')
})

// Sem chave, a linha em `payments` já teria sido criada quando a chamada
// falhasse — sobrando uma cobrança pendente sem desfecho possível.
test('sem API Key, o Pagar.me recusa ANTES de gravar a linha', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  const i = src.indexOf("if (gateway === 'pagarme' && ['credit_card'")
  const bloco = src.slice(i, i + 2500)
  const iChave = bloco.indexOf('if (!chavePagarme)')
  const iInsert = bloco.indexOf('inserirPagamento({')
  assert.ok(iChave > 0 && iInsert > 0, 'os dois trechos precisam existir')
  assert.ok(iChave < iInsert, 'a checagem da chave precisa vir antes do INSERT')
})

// O app manda o pedido, o servidor decide. E os dois caminhos hospedados não
// podem se misturar: `checkout_pro` é o nome do produto do Mercado Pago.
test('o app pede o adquirente sem mandar checkout_pro no Pagar.me', async () => {
  const jsx = await readFile(
    new URL('../../turista/src/pages/checkout/CheckoutPayment.jsx', import.meta.url), 'utf8')
  assert.match(jsx, /card_acquirer: acquirer/)
  assert.match(jsx, /acquirer === 'mercado_pago' \? \{ checkout_pro: true \} : \{\}/,
    'checkout_pro só vale para o Mercado Pago')
  // O clique precisa passar o adquirente, não o evento do DOM.
  assert.match(jsx, /onClick=\{\(\) => pagarComCartaoHospedado\(g\)\}/,
    'onClick={handler} passaria o evento como primeiro argumento')
  // Cartão hospedado e formulário de cartão na mesma tela confundem — e o
  // formulário ainda tokenizaria um cartão que ninguém vai usar.
  assert.match(jsx, /const settingsDoBrick = acquirersDisponiveis\.length > 0/)
})

// O que o servidor aceita e o que o app manda precisam ser a mesma lista: um
// valor que o app envie e o schema recuse derruba a cobrança na validação.
test('o schema aceita exatamente os adquirentes que existem', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  assert.match(src, /card_acquirer:\s+z\.enum\(\['mercado_pago', 'pagarme', 'asaas'\]\)/)
  const { ACQUIRERS_CARTAO } = await import('../src/routes/payments.js')
  assert.deepEqual(ACQUIRERS_CARTAO, ['mercado_pago', 'pagarme', 'asaas'])
})

// Cartão hospedado não tem token: o cartão é digitado na página do adquirente.
// Exigi-lo recusaria a cobrança citando campos que não existem naquele fluxo.
test('o Pagar.me não é obrigado a mandar token de cartão', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  assert.match(src, /d\.checkout_pro === true \|\| d\.card_acquirer === 'pagarme'/)
})

// Chave nova editada na tela e esquecida na lista do Salvar é marcada, "salva"
// com sucesso aparente, e nunca chega ao banco. Já aconteceu duas vezes aqui.
test('as chaves novas do cartão são realmente gravadas pelo admin', async () => {
  const jsx = await readFile(
    new URL('../../admin/src/pages/Configuracoes.jsx', import.meta.url), 'utf8')
  const salvas = new Set(
    [...jsx.matchAll(/saveSection\(\s*(?:\/\/[^\n]*\n\s*)*\[([\s\S]*?)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/'(payment_[a-z0-9_]+)'/g)].map((k) => k[1])))
  for (const k of ['payment_card_acquirers', 'payment_pagarme_api_key', 'payment_mp_wallet_only']) {
    assert.ok(salvas.has(k), `${k} é editável mas não está na lista do Salvar`)
  }
})
