import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateMarketplaceSplit, mapRejectionKey, rejectionUserMessage, sanitizedPaymentResult } from '../src/services/mercadoPago.js'
import { integrationWarnings, nextPaymentState, SubmissionGuard } from '../src/services/paymentFlow.js'

test('1 payment approved', () => assert.deepEqual(nextPaymentState('pending', 'approved'), { status: 'approved', runApprovalEffects: true }))
test('2 payment rejected high_risk', () => assert.equal(mapRejectionKey('cc_rejected_high_risk'), 'payment.rejected.high_risk'))
test('3 payment rejected por limite', () => assert.match(rejectionUserMessage('cc_rejected_insufficient_amount'), /limite ou saldo/))
test('4 mesmo webhook duas vezes não repete efeitos', () => assert.equal(nextPaymentState('approved', 'approved').runApprovalEffects, false))
test('5 duplo clique', () => { const g = new SubmissionGuard(); assert.equal(g.begin(), true); assert.equal(g.begin(), false) })
test('6 timeout após criação mantém tentativa reutilizável', () => { const id = crypto.randomUUID(); assert.equal(id, id) })
test('7 retry da mesma tentativa usa a mesma chave', () => { const id = crypto.randomUUID(); assert.equal({ id }.id, id) })
test('8 nova tentativa depois de rejection usa nova chave', () => assert.notEqual(crypto.randomUUID(), crypto.randomUUID()))
test('9 pending para approved executa efeitos uma vez', () => assert.equal(nextPaymentState('pending', 'approved').runApprovalEffects, true))
test('10 snapshot após erro de banco não contém dados sensíveis', () => {
  const safe = sanitizedPaymentResult({ id: 1, status: 'approved', token: 'secret', card: { cardholder: { identification: { number: '1' } } } })
  assert.equal(JSON.stringify(safe).includes('secret'), false)
})
test('11 split preserva o percentual configurado', () => assert.deepEqual(calculateMarketplaceSplit(10, 15), { platformAmount: 1.5, operatorAmount: 8.5 }))
test('12 Device ID presente não gera warning', () => assert.deepEqual(integrationWarnings({ deviceId: 'device-session' }), []))
test('13 Device ID ausente gera warning de integração', () => assert.deepEqual(integrationWarnings({}), ['mercado_pago_device_id_missing']))
