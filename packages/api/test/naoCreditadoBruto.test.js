// "Não creditado" = receita BRUTA pendente de liquidação pelo gateway.
//
// Cada reserva paga grava DUAS linhas de inflow no financial_ledger: booking_gross
// (bruto) e booking_net (líquido) — duas visões do MESMO dinheiro. Somar todo
// inflow pendente sem filtrar o tipo contava as duas e DOBRAVA o valor
// (ex.: R$100 bruto + R$97,36 líquido = R$197,36, maior que o próprio bruto).
// O "não creditado" passa a contar só booking_gross. Asserção de fonte + prova
// funcional do filtro. Vale para o painel do admin e o do operador.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const admin    = read('../src/routes/admin.js')
const operator = read('../src/routes/operator.js')

test('admin e operador contam só o bruto pendente (booking_gross)', () => {
  assert.match(admin, /sumByStatus\(data, 'inflow',\s+'pending', 'booking_gross'\)/,
    'admin: não creditado filtra booking_gross')
  assert.match(operator, /sumByStatus\(data, 'inflow', 'pending', 'booking_gross'\)/,
    'operador: não creditado filtra booking_gross')
})

test('o helper sumByStatus aceita o filtro opcional por entry_type', () => {
  for (const src of [admin, operator]) {
    assert.match(src, /function sumByStatus\(rows, direction, status, entryType\)/, 'assinatura com entryType')
    assert.match(src, /\(!entryType \|\| r\.entry_type === entryType\)/, 'filtra pelo tipo quando informado')
  }
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
