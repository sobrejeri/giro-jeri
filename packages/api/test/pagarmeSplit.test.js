// Split do Pagar.me: a divisão do dinheiro.
//
// A regra de PERCENTUAL é a mesma do Mercado Pago (média ponderada pelo valor
// de cada reserva, com override por modal e por operador). Aqui se testa que o
// array enviado ao gateway traduz essa regra corretamente — e, principalmente,
// que ele NÃO é enviado quando falta alguma peça.
//
// Fail-closed é a regra: cobrar sem split e "acertar depois" vira divergência
// de caixa, com o dinheiro já inteiro numa conta só.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'

const { montarSplit, fecha100 } = await import('../src/payments/pagarmeSplit.js')
const { mediaPonderadaDoPercentual } = await import('../src/routes/payments.js')

const PLAT = 're_plataforma'
const OPER = 're_operador'

test('o split fecha 100% e nomeia os dois recebedores', () => {
  const s = montarSplit({ pctPlataforma: 10, recebedorPlataforma: PLAT, recebedorOperador: OPER })
  assert.equal(s.length, 2)
  assert.ok(fecha100(s), 'a soma tem de dar exatamente 100')
  assert.equal(s[0].recipient_id, PLAT)
  assert.equal(s[1].recipient_id, OPER)
  assert.equal(s[0].amount, 10)
  assert.equal(s[1].amount, 90)
  assert.equal(s[0].type, 'percentage')
})

test('a plataforma responde pelo chargeback e paga a taxa; o operador recebe limpo', () => {
  const [plataforma, operador] = montarSplit({
    pctPlataforma: 10, recebedorPlataforma: PLAT, recebedorOperador: OPER,
  })
  assert.deepEqual(plataforma.options, {
    liable: true, charge_processing_fee: true, charge_remainder_fee: true,
  })
  assert.deepEqual(operador.options, {
    liable: false, charge_processing_fee: false, charge_remainder_fee: false,
  })
})

test('o nome do campo é charge_remainder_FEE — sem "fee" o gateway ignora', () => {
  const [plataforma] = montarSplit({
    pctPlataforma: 10, recebedorPlataforma: PLAT, recebedorOperador: OPER,
  })
  assert.ok('charge_remainder_fee' in plataforma.options)
  assert.ok(!('charge_remainder' in plataforma.options),
    'charge_remainder (sem _fee) não existe na API v5')
})

test('o valor vai no campo `amount`, não em `percentage`', () => {
  const [p] = montarSplit({ pctPlataforma: 10, recebedorPlataforma: PLAT, recebedorOperador: OPER })
  assert.equal(p.amount, 10)
  assert.ok(!('percentage' in p), 'com type=percentage, o valor mora em amount')
})

// ── Fail-closed ────────────────────────────────────────────────────────────

test('sem recebedor do operador NÃO monta split', () => {
  for (const faltando of [undefined, null, '', '   ']) {
    assert.equal(
      montarSplit({ pctPlataforma: 10, recebedorPlataforma: PLAT, recebedorOperador: faltando }),
      null, `deveria recusar com recebedor ${JSON.stringify(faltando)}`)
  }
})

test('sem recebedor da plataforma NÃO monta split', () => {
  assert.equal(
    montarSplit({ pctPlataforma: 10, recebedorPlataforma: '', recebedorOperador: OPER }), null)
})

test('o mesmo recebedor dos dois lados é recusado', () => {
  assert.equal(
    montarSplit({ pctPlataforma: 10, recebedorPlataforma: PLAT, recebedorOperador: PLAT }), null,
    'seria a plataforma dividindo consigo mesma')
})

test('percentual fora da faixa ou inválido é recusado', () => {
  for (const pct of [-1, 101, NaN, undefined, null, 'dez']) {
    assert.equal(
      montarSplit({ pctPlataforma: pct, recebedorPlataforma: PLAT, recebedorOperador: OPER }),
      null, `deveria recusar pct ${JSON.stringify(pct)}`)
  }
})

test('0% ou 100% não viram split — não há o que dividir', () => {
  assert.equal(montarSplit({ pctPlataforma: 0,   recebedorPlataforma: PLAT, recebedorOperador: OPER }), null)
  assert.equal(montarSplit({ pctPlataforma: 100, recebedorPlataforma: PLAT, recebedorOperador: OPER }), null)
  // E o arredondamento também não pode produzir zero
  assert.equal(montarSplit({ pctPlataforma: 0.4, recebedorPlataforma: PLAT, recebedorOperador: OPER }), null)
})

test('percentual quebrado arredonda e continua fechando 100', () => {
  const s = montarSplit({ pctPlataforma: 9.7, recebedorPlataforma: PLAT, recebedorOperador: OPER })
  assert.equal(s[0].amount, 10)
  assert.equal(s[1].amount, 90)
  assert.ok(fecha100(s))
})

// ── A regra de percentual é a MESMA do Mercado Pago ────────────────────────

test('média ponderada pelo valor, não média simples', () => {
  // Combo: R$ 900 a 20% e R$ 100 a 10%. Média simples daria 15%; a ponderada
  // pelo valor dá 19% — e é a ponderada que representa o dinheiro de verdade.
  const modais = [
    { booking: { total_amount: 900 }, platform_commission_pct: 20 },
    { booking: { total_amount: 100 }, platform_commission_pct: 10 },
  ]
  assert.equal(mediaPonderadaDoPercentual(modais, null, {}), 19)
})

test('precedência: modal > operador > geral do admin', () => {
  const cfg = { payment_split_admin_pct: 5 }
  // sem nada específico → geral do admin
  assert.equal(mediaPonderadaDoPercentual(
    [{ booking: { total_amount: 100 }, platform_commission_pct: null }], null, cfg), 5)
  // percentual do operador sobrepõe o geral
  assert.equal(mediaPonderadaDoPercentual(
    [{ booking: { total_amount: 100 }, platform_commission_pct: null }], 12, cfg), 12)
  // percentual do modal sobrepõe os dois
  assert.equal(mediaPonderadaDoPercentual(
    [{ booking: { total_amount: 100 }, platform_commission_pct: 30 }], 12, cfg), 30)
})

test('reservas sem valor não quebram a conta', () => {
  assert.equal(mediaPonderadaDoPercentual(
    [{ booking: { total_amount: 0 }, platform_commission_pct: 20 }], null, { payment_split_admin_pct: 7 }),
    7, 'sem valor não há peso — cai no geral em vez de dividir por zero')
})

test('o percentual do MP alimenta o split do Pagar.me de ponta a ponta', () => {
  const modais = [
    { booking: { total_amount: 900 }, platform_commission_pct: 20 },
    { booking: { total_amount: 100 }, platform_commission_pct: 10 },
  ]
  const pct = mediaPonderadaDoPercentual(modais, null, {})
  const s = montarSplit({ pctPlataforma: pct, recebedorPlataforma: PLAT, recebedorOperador: OPER })
  assert.equal(s[0].amount, 19)
  assert.equal(s[1].amount, 81)
  assert.ok(fecha100(s))
})

// ── Ligação com o checkout ─────────────────────────────────────────────────

import fs from 'node:fs'
const checkoutJs = fs.readFileSync(new URL('../src/payments/pagarmeCheckout.js', import.meta.url), 'utf8')
const pagamentos = fs.readFileSync(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
const adminJs    = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8')

test('o split vai DENTRO de payments[], não no nível do pedido', () => {
  const i = checkoutJs.indexOf('payments: [{')
  assert.notEqual(i, -1)
  const bloco = checkoutJs.slice(i, i + 600)
  assert.match(bloco, /\{ split \}/, 'o split precisa entrar no objeto do payment')
  // E não pode estar solto no corpo do pedido, ao lado de items/customer.
  const corpo = checkoutJs.slice(checkoutJs.indexOf('const corpo = {'), i)
  assert.ok(!/\bsplit\b/.test(corpo), 'split no nível do pedido é o lugar errado')
})

test('pedido sem split continua saindo — ausência não vira array vazio', () => {
  // Array vazio seria recusado pelo gateway; a ausência do campo, não.
  assert.match(checkoutJs, /Array\.isArray\(split\) && split\.length \? \{ split \} : \{\}/)
})

// ── MUDANÇA DE CONTRATO (commit f960109, outra sessão) ────────────────────
//
// Antes: sem conseguir dividir, a cobrança era RECUSADA (503). O raciocínio
// era que cobrar inteiro numa conta só e "acertar depois" vira divergência de
// caixa.
//
// Agora: a venda é concluída, a plataforma recebe 100% e o pagamento fica
// marcado com `repasse_manual: true`. A decisão é de negócio — concluir a
// venda vale mais que recusar o cartão — e só se sustenta enquanto essa marca
// EXISTIR. Sem ela, o operador fica credor de um valor que não aparece em
// lugar nenhum. Por isso o teste mudou de "recusa" para "marca".
test('sem split, a cobrança segue MAS fica marcada como repasse manual', () => {
  const i = pagamentos.indexOf('const divisao = await splitDoPagarme')
  assert.notEqual(i, -1, 'o checkout precisa resolver o split')
  const bloco = pagamentos.slice(i, i + 700)
  assert.match(bloco, /if \(divisao\.erro\)/, 'o erro de split tem de ser tratado')
  assert.match(bloco, /repasseManual = true/,
    'sem a marca, o dinheiro do operador entra na plataforma sem registro')
  assert.ok(i < pagamentos.indexOf('const checkout = await criarCheckoutCartao'),
    'o split tem de ser resolvido antes de criar a cobrança')
})

test('a marca de repasse manual é PERSISTIDA, não só logada', () => {
  // Log de servidor não é registro contábil: ele expira, ninguém consulta e
  // não dá para cruzar com a reserva. A marca precisa ir para o banco.
  assert.match(pagamentos, /raw_response_json:\s*\{[^}]*repasse_manual: repasseManual/,
    'o repasse manual tem de ficar gravado no pagamento')
})

test('o motivo real do erro fica no log, não na resposta ao cliente', () => {
  const i = pagamentos.indexOf('const divisao = await splitDoPagarme')
  const bloco = pagamentos.slice(i, i + 700)
  assert.match(bloco, /console\.warn\('\[pagarme\] sem split/)
  assert.ok(!/new Error\([^)]*divisao\.erro/.test(bloco),
    'o texto interno ("operador sem recebedor") não pode ir para a tela do cliente')
})

test('o resolvedor exige operador único, recebedor dos dois lados e usa a regra do MP', () => {
  const i = pagamentos.indexOf('async function splitDoPagarme')
  assert.notEqual(i, -1)
  const fn = pagamentos.slice(i, pagamentos.indexOf('\n}', i))
  assert.match(fn, /ops\.length !== 1/,                          'operador único')
  assert.match(fn, /payment_pagarme_platform_recipient_id/,      'recebedor da plataforma')
  assert.match(fn, /gateway_recipient_id/,                       'recebedor do operador')
  assert.match(fn, /mediaPonderadaDoPercentual/,                 'a MESMA regra de percentual do MP')
})

test('a rota que lista recebedores é de admin e só leitura', () => {
  const i = adminJs.indexOf("router.get('/pagarme/recipients'")
  assert.notEqual(i, -1, 'rota não encontrada')
  const rota = adminJs.slice(i, adminJs.indexOf('\nrouter.', i + 10))
  assert.match(rota, /requireAdmin/, 'listar recebedores é ação de admin')
  assert.ok(!/\b(insert|update|upsert|delete)\b/i.test(rota), 'a rota não pode escrever nada')
})

test('a listagem não devolve conta bancária nem chave PIX', () => {
  const pagarmeJs = fs.readFileSync(new URL('../src/payments/pagarme.js', import.meta.url), 'utf8')
  const i = pagarmeJs.indexOf('export async function listarRecebedores')
  assert.notEqual(i, -1)
  const fn = pagarmeJs.slice(i)
  for (const campo of ['bank_account', 'pix_key', 'account_number']) {
    assert.ok(!new RegExp(`${campo}`).test(fn.slice(fn.indexOf('return ('))),
      `a listagem não pode expor ${campo} numa tela de configuração`)
  }
})
