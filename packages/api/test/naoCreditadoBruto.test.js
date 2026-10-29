// "Não creditado" no painel do admin e do operador.
//
// Cada reserva paga grava DUAS linhas de inflow no financial_ledger: booking_gross
// (bruto) e booking_net (líquido) — duas visões do MESMO dinheiro. Somar todo
// inflow pendente sem filtrar o tipo contava as duas e DOBRAVA o valor
// (ex.: R$100 bruto + R$97,36 líquido = R$197,36, maior que o próprio bruto).
// Primeiro o filtro passou a contar só booking_gross; depois (236dfa6) o "não
// creditado" virou o LÍQUIDO ainda não liquidado, pela data de liquidação de cada
// pagamento (services/settlement.js) — o status 'pending' do razão nunca virava
// liquidado e travava a conta no bruto inteiro. Segue contando UM tipo só.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const admin    = read('../src/routes/admin.js')
const operator = read('../src/routes/operator.js')

test('admin e operador contam só o líquido ainda não liquidado (booking_net)', () => {
  for (const [nome, src] of [['admin', admin], ['operador', operator]]) {
    assert.match(src, /import \{ jaCreditado \} from '\.\.\/services\/settlement\.js'/, `${nome}: usa a data de liquidação`)
    assert.match(src, /r\.entry_type === 'booking_net' && r\.direction === 'inflow'\s+&& !jaCreditado\(/,
      `${nome}: não creditado = booking_net ainda não liquidado (um tipo só, não dobra)`)
  }
})

test('liquidação: PIX/Mercado Pago no 1º dia útil, cartão no 2º', async () => {
  const { jaCreditado, somaDiasUteis } = await import('../src/services/settlement.js')
  // Sexta → segunda (1 útil) e terça (2 úteis).
  assert.equal(somaDiasUteis('2026-10-30', 1), '2026-11-02')
  assert.equal(somaDiasUteis('2026-10-30', 2), '2026-11-03')
  const pagoSexta = '2026-10-30T15:00:00Z'
  assert.equal(jaCreditado({ gatewayName: 'pagarme', paymentMethod: 'pix', paidAt: pagoSexta }, '2026-11-02'), true)
  assert.equal(jaCreditado({ gatewayName: 'pagarme', paymentMethod: 'credit_card', paidAt: pagoSexta }, '2026-11-02'), false)
  assert.equal(jaCreditado({ gatewayName: 'pagarme', paymentMethod: 'credit_card', paidAt: pagoSexta }, '2026-11-03'), true)
  assert.equal(jaCreditado({ gatewayName: 'mercado_pago', paymentMethod: 'credit_card', paidAt: pagoSexta }, '2026-11-02'), true)
  assert.equal(jaCreditado({ gatewayName: 'pagarme', paymentMethod: 'pix', paidAt: null }), false, 'sem data → ainda não creditado')
})

test('prova funcional: bruto+líquido pendentes não dobram mais', () => {
  // Réplica do filtro usado nos endpoints, sobre o ledger de UMA venda paga.
  const ledger = [
    { entry_type: 'booking_gross', direction: 'inflow',  financial_status: 'pending', amount: 100 },
    { entry_type: 'booking_net',   direction: 'inflow',  financial_status: 'pending', amount: 97.36 },
    { entry_type: 'gateway_fee',   direction: 'outflow', financial_status: 'pending', amount: 2.64 },
  ]
  const somar = (rows, direction, status, entryType) => rows
    .filter((r) => r.direction === direction && r.financial_status === status && (!entryType || r.entry_type === entryType))
    .reduce((s, r) => s + Number(r.amount), 0)

  // ANTES (sem entryType): somava bruto + líquido = 197,36 (o bug da tela).
  assert.equal(somar(ledger, 'inflow', 'pending'), 197.36)
  // AGORA: conta só o bruto pendente = 100.
  assert.equal(somar(ledger, 'inflow', 'pending', 'booking_gross'), 100)
})
