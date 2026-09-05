import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  calculateMarketplaceSplit, createCardPayment, mapRejectionKey,
  normalizeCardPaymentResponse, rejectionUserMessage, sanitizedPaymentResult,
} from '../src/services/mercadoPago.js'
import {
  approvePaymentOnce, executePaymentAttempt, integrationWarnings,
  nextPaymentState, PaymentAttemptInProgressError, processWebhookOnce,
} from '../src/services/paymentFlow.js'

function attemptHarness() {
  const attempts = new Map(); const official = new Map(); let creates = 0
  return {
    attempts, official, get creates() { return creates },
    claim: async (id) => {
      if (attempts.has(id)) return { claimed: false, attempt: attempts.get(id) }
      const row = { id, gateway_transaction_id: null }; attempts.set(id, row)
      return { claimed: true, attempt: row }
    },
    create: async (id) => { creates++; const p = { id: `mp-${id}`, status: 'approved' }; official.set(id, p); return p },
    find: async (row) => official.get(row.id) || null,
    save: async (id, p) => { attempts.get(id).gateway_transaction_id = p.id },
  }
}

test('01 mesmo attempt duas vezes chama create uma vez', async () => { const h = attemptHarness(); const args = { attemptId: 'A', claim: h.claim, createPayment: h.create, findOfficialPayment: h.find, saveGatewayResult: h.save }; await executePaymentAttempt(args); await executePaymentAttempt(args); assert.equal(h.creates, 1) })
test('02 timeout depois do MP reutiliza a tentativa e não cria novamente', async () => { const h = attemptHarness(); let first = true; const create = async id => { const p = await h.create(id); if (first) { first = false; throw new Error('timeout') } return p }; const args = { attemptId: 'A', claim: h.claim, createPayment: create, findOfficialPayment: h.find, saveGatewayResult: h.save }; await assert.rejects(executePaymentAttempt(args), /timeout/); const retry = await executePaymentAttempt(args); assert.equal(retry.created, false); assert.equal(h.creates, 1) })
test('03 retry mantém a mesma idempotency key', async () => { const h = attemptHarness(); const keys = []; const args = { attemptId: 'same-key', claim: h.claim, createPayment: async id => { keys.push(id); return h.create(id) }, findOfficialPayment: h.find, saveGatewayResult: h.save }; await executePaymentAttempt(args); await executePaymentAttempt(args); assert.deepEqual(keys, ['same-key']) })
test('04 rejeição definitiva permite nova attempt', async () => { const h = attemptHarness(); h.create = undefined; const seen = []; const create = async id => { seen.push(id); return { id: `mp-${id}`, status: 'rejected' } }; await executePaymentAttempt({ attemptId: 'A', claim: h.claim, createPayment: create, findOfficialPayment: h.find, saveGatewayResult: h.save }); await executePaymentAttempt({ attemptId: 'B', claim: h.claim, createPayment: create, findOfficialPayment: h.find, saveGatewayResult: h.save }); assert.deepEqual(seen, ['A', 'B']) })
test('05 attempt existente sem payment fica em processamento', async () => { const h = attemptHarness(); h.attempts.set('A', { id: 'A' }); await assert.rejects(executePaymentAttempt({ attemptId: 'A', claim: h.claim, createPayment: h.create, findOfficialPayment: h.find, saveGatewayResult: h.save }), PaymentAttemptInProgressError); assert.equal(h.creates, 0) })
test('06 attempt existente com gateway não chama create', async () => { const h = attemptHarness(); h.attempts.set('A', { id: 'A', gateway_transaction_id: 'mp-A' }); h.official.set('A', { id: 'mp-A', status: 'approved' }); await executePaymentAttempt({ attemptId: 'A', claim: h.claim, createPayment: h.create, findOfficialPayment: h.find, saveGatewayResult: h.save }); assert.equal(h.creates, 0) })
test('07 erro ao persistir após create reconcilia no retry', async () => { const h = attemptHarness(); let fail = true; const save = async (...a) => { if (fail) { fail = false; throw new Error('db') } return h.save(...a) }; const args = { attemptId: 'A', claim: h.claim, createPayment: h.create, findOfficialPayment: h.find, saveGatewayResult: save }; await assert.rejects(executePaymentAttempt(args), /db/); await executePaymentAttempt(args); assert.equal(h.creates, 1) })
test('08 dois requests concorrentes criam uma vez', async () => { const h = attemptHarness(); const args = { attemptId: 'A', claim: h.claim, createPayment: h.create, findOfficialPayment: async r => { while (!h.official.has(r.id)) await new Promise(resolve => setTimeout(resolve, 1)); return h.find(r) }, saveGatewayResult: h.save }; await Promise.all([executePaymentAttempt(args), executePaymentAttempt(args)]); assert.equal(h.creates, 1) })
test('09 webhook duplicado executa efeitos uma vez', async () => { const ids = new Set(); let effects = 0; const args = { event: { id: 'E' }, claimEvent: async e => { if (ids.has(e.id)) return false; ids.add(e.id); return true }, processEvent: async () => { effects++ } }; await processWebhookOnce(args); await processWebhookOnce(args); assert.equal(effects, 1) })
test('10 webhook duplicado informa false', async () => assert.equal(await processWebhookOnce({ event: {}, claimEvent: async () => false, processEvent: async () => assert.fail() }), false))
test('11 webhook antes do insert permanece pendente', async () => { const pending = []; await processWebhookOnce({ event: { gatewayId: '1' }, claimEvent: async e => { pending.push(e); return true }, processEvent: async () => {} }); assert.equal(pending[0].gatewayId, '1') })
test('12 webhook e polling concorrentes executam aprovação uma vez', async () => { let claimed = false; let effects = 0; const claimApproval = async () => { if (claimed) return false; claimed = true; return true }; const args = { payment: { id: 'P' }, claimApproval, runEffects: async () => { effects++ } }; await Promise.all([approvePaymentOnce(args), approvePaymentOnce(args)]); assert.equal(effects, 1) })
test('13 aprovação duplicada retorna false', async () => assert.equal(await approvePaymentOnce({ payment: { id: 'P' }, claimApproval: async () => false, runEffects: async () => assert.fail() }), false))
test('14 aprovação nova retorna true', async () => assert.equal(await approvePaymentOnce({ payment: { id: 'P' }, claimApproval: async () => true, runEffects: async () => {} }), true))
test('15 device_id vira meliSessionId', async () => { let options; await createCardPayment({ amount: 10, description: 'x', paymentMethodId: 'visa', cardToken: 'ephemeral', payerEmail: 'buyer@example.com', payerDoc: '12345678901', externalRef: 'A', idempotencyKey: 'A', deviceId: 'device-real', paymentClient: { create: async input => { options = input.requestOptions; return { id: 1, status: 'approved' } } } }); assert.equal(options.meliSessionId, 'device-real') })
test('16 attempt vira idempotencyKey', async () => { let options; await createCardPayment({ amount: 10, description: 'x', paymentMethodId: 'visa', cardToken: 'ephemeral', payerEmail: 'buyer@example.com', payerDoc: '12345678901', externalRef: 'A', idempotencyKey: 'attempt-A', paymentClient: { create: async input => { options = input.requestOptions; return { id: 1, status: 'approved' } } } }); assert.equal(options.idempotencyKey, 'attempt-A') })
test('17 snapshot sanitizado remove token', () => assert.equal(JSON.stringify(sanitizedPaymentResult({ id: 1, token: 'secret' })).includes('secret'), false))
test('18 snapshot sanitizado remove CPF', () => assert.equal(JSON.stringify(sanitizedPaymentResult({ id: 1, payer: { identification: { number: '123' } } })).includes('123'), false))
test('19 status_detail é preservado', () => assert.equal(sanitizedPaymentResult({ status_detail: 'cc_rejected_high_risk' }).status_detail, 'cc_rejected_high_risk'))
test('20 collector_id é preservado', () => assert.equal(sanitizedPaymentResult({ collector_id: 42 }).collector_id, '42'))
test('21 resposta normalizada preserva status_detail', () => assert.equal(normalizeCardPaymentResponse({ id: 1, status: 'rejected', status_detail: 'cc_rejected_high_risk' }).status_detail, 'cc_rejected_high_risk'))
test('22 mensagem high risk específica', () => assert.match(rejectionUserMessage('cc_rejected_high_risk'), /segurança/))
test('23 mensagem limite específica', () => assert.match(rejectionUserMessage('cc_rejected_insufficient_amount'), /limite ou saldo/))
test('24 mapa de recusa não confunde limite com risco', () => assert.notEqual(mapRejectionKey('cc_rejected_insufficient_amount'), mapRejectionKey('cc_rejected_high_risk')))
test('25 pending para approved solicita efeitos', () => assert.equal(nextPaymentState('pending', 'approved').runApprovalEffects, true))
test('26 approved repetido não solicita efeitos', () => assert.equal(nextPaymentState('approved', 'approved').runApprovalEffects, false))
test('27 Device ID ausente gera warning', () => assert.equal(integrationWarnings({}).length, 1))
test('28 Device ID presente não gera warning', () => assert.equal(integrationWarnings({ deviceId: 'real' }).length, 0))
test('29 split preserva percentual configurado', () => assert.deepEqual(calculateMarketplaceSplit(10, 15), { platformAmount: 1.5, operatorAmount: 8.5 }))
test('30 migration preserva UNIQUE e cria claims técnicos', async () => { const sql = await readFile(new URL('../../../supabase/migrations/055_mp_payment_hardening.sql', import.meta.url), 'utf8'); assert.match(sql, /payment_attempts_gateway_transaction_id_key/); assert.match(sql, /claim_payment_approval/); assert.doesNotMatch(sql, /payment_split_admin_pct|platform_split_pct/) })
