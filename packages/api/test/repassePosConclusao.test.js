// Repasse a operador/motorista só depois da reserva CONCLUÍDA.
//
// A "Fila de liberação" já era a fonte de verdade (montarLinhaFila: concluído +
// pago + pendente). Estes testes cobrem essa regra pura E garantem que os OUTROS
// caminhos de baixa (PUT /payouts/:id, /payouts/pay-all, PATCH /driver-payouts)
// não pagam antes da conclusão — senão dava para burlar a regra por outra aba.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { montarLinhaFila } from '../src/services/payoutQueue.js'

const admin = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8')

const reservaBase = (over = {}) => ({
  id: 'b1', booking_code: 'GJ1', service_type: 'tour', service_date: '2026-09-20',
  total_amount: 100, status_commercial: 'paid', status_operational: 'completed',
  completed_at: '2026-09-20T18:00:00Z',
  operator: { id: 'op1', full_name: 'Coop' },
  payments: [{ status: 'approved', amount_gross: 100, gateway_name: 'mercadopago' }],
  booking_payouts: [{ id: 'p1', kind: 'commission', amount: 30, status: 'pending', payee_user_id: 'op1' }],
  ...over,
})

test('montarLinhaFila: concluída + paga + pendente → elegível', () => {
  const l = montarLinhaFila(reservaBase())
  assert.equal(l.situacao, 'pronto_para_liberar')
  assert.equal(l.elegivel_liberar, true)
})

test('montarLinhaFila: SEM conclusão (completed_at null) → NÃO elegível', () => {
  const l = montarLinhaFila(reservaBase({ completed_at: null }))
  assert.equal(l.elegivel_liberar, false)
  assert.equal(l.situacao, 'conciliacao')
})

test('montarLinhaFila: cliente não pagou → NÃO elegível', () => {
  const l = montarLinhaFila(reservaBase({ payments: [] }))
  assert.equal(l.elegivel_liberar, false)
  assert.equal(l.situacao, 'aguardando_pagamento')
})

test('PUT /payouts/:id só baixa (paid) se a reserva estiver concluída', () => {
  const i = admin.indexOf("router.put('/payouts/:id'")
  const r = admin.slice(i, i + 900).replace(/\s+/g, ' ')
  assert.ok(/body\.status === 'paid'/.test(r) && /status_operational !== 'completed'/.test(r),
    'precisa barrar baixa de reserva não concluída')
})

test('/payouts/pay-all só paga repasses de reservas concluídas', () => {
  const i = admin.indexOf("router.post('/payouts/pay-all'")
  const r = admin.slice(i, i + 1400).replace(/\s+/g, ' ')
  assert.ok(/bookings \( status_operational \)/.test(r) || /status_operational/.test(r),
    'pay-all precisa olhar o status da reserva')
  assert.ok(/status_operational === 'completed'/.test(r),
    'pay-all só pode baixar reservas concluídas')
})

test('PATCH /driver-payouts/:id só baixa (paid) se a reserva estiver concluída', () => {
  const i = admin.indexOf("router.patch('/driver-payouts/:id'")
  const r = admin.slice(i, i + 2200).replace(/\s+/g, ' ')
  assert.ok(/status === 'paid'/.test(r) && /status_operational !== 'completed'/.test(r),
    'o repasse do motorista precisa exigir reserva concluída')
})
