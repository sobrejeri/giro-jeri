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

const PLAT = 'rp_plataforma'
const OPER = 'rp_operador'

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
