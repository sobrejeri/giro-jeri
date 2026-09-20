// Fila de repasses: elegibilidade, conciliação e as garantias da liberação.
//
// O dinheiro do operador sai da conta da plataforma por FORA (PIX/banco) e a
// baixa é registrada na fila. Duas coisas não podem quebrar por nenhum caminho:
//   1. só liberar o que é elegível DE VERDADE (concluído, pago pelo cliente,
//      repasse pendente, sem split que já pagou o operador);
//   2. não pagar duas vezes — nem por dois cliques, nem por split + comissão.
//
// As regras puras (montarLinhaFila, conciliarReserva) são testadas em isolamento.
// As garantias da ROTA (idempotência, auditoria, revalidação) são fixadas por
// leitura da fonte — reproduzir a baixa exigiria banco, e o que precisa não
// regredir é justamente a forma como a rota baixa.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { montarLinhaFila, conciliarReserva } from '../src/services/payoutQueue.js'

// ── Fábricas: uma reserva no formato que o SELECT da fila entrega ─────────────
const OPERADOR = { id: 'op-1', full_name: 'Cooperativa Sol', pix_key: 'sol@x.com', pix_key_type: 'email' }

function reserva(over = {}) {
  return {
    id: 'bk-1', booking_code: 'GJ001', service_type: 'tour', service_date: '2026-09-01',
    status_commercial: 'paid', status_operational: 'completed',
    completed_at: '2026-09-02T14:00:00Z', total_amount: 1000,
    operator: OPERADOR,
    payments: [{ id: 'pay-1', gateway_name: 'pagarme', amount_gross: 1000, status: 'approved', split_operator_id: null }],
    booking_payouts: [{ id: 'po-1', kind: 'commission', amount: 800, status: 'pending', payee_user_id: 'op-1' }],
    ...over,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// montarLinhaFila — a regra de elegibilidade
// ─────────────────────────────────────────────────────────────────────────────
test('reserva concluída, paga e com comissão pendente é elegível', () => {
  const l = montarLinhaFila(reserva())
  assert.equal(l.situacao, 'pronto_para_liberar')
  assert.equal(l.elegivel_liberar, true)
  assert.equal(l.payout_id, 'po-1')
  assert.equal(l.operador_valor, 800)
  assert.equal(l.plataforma_valor, 200)      // 1000 recebido − 800 de repasse
  assert.equal(l.operador.pix_key, 'sol@x.com')
})

test('reserva cancelada/estornada/contestada NUNCA é elegível', () => {
  for (const s of ['cancelled', 'refunded', 'disputed']) {
    const l = montarLinhaFila(reserva({ status_commercial: s }))
    assert.equal(l.situacao, 'bloqueado', `${s} deveria bloquear`)
    assert.equal(l.elegivel_liberar, false)
    assert.ok(l.motivo_bloqueio, `${s} deveria ter motivo`)
  }
})

test('sem data de conclusão vira conciliação, não fila', () => {
  const l = montarLinhaFila(reserva({ completed_at: null }))
  assert.equal(l.situacao, 'conciliacao')
  assert.equal(l.elegivel_liberar, false)
})

test('cliente não pagou (nenhum approved) não libera', () => {
  const l = montarLinhaFila(reserva({ payments: [{ amount_gross: 1000, status: 'pending', gateway_name: 'pagarme' }] }))
  assert.equal(l.situacao, 'aguardando_pagamento')
  assert.equal(l.elegivel_liberar, false)
})

test('operador já pago por split no ato não pode ser liberado de novo', () => {
  const l = montarLinhaFila(reserva({
    payments: [{ amount_gross: 1000, status: 'approved', gateway_name: 'pagarme', split_operator_id: 'op-1' }],
  }))
  assert.equal(l.situacao, 'repassado_gateway')
  assert.equal(l.elegivel_liberar, false)
})

test('comissão já paga aparece como repassada, não elegível', () => {
  const l = montarLinhaFila(reserva({
    booking_payouts: [{ id: 'po-1', kind: 'commission', amount: 800, status: 'paid', payee_user_id: 'op-1' }],
  }))
  assert.equal(l.situacao, 'pago')
  assert.equal(l.elegivel_liberar, false)
})

test('comissão cancelada não é elegível', () => {
  const l = montarLinhaFila(reserva({
    booking_payouts: [{ id: 'po-1', kind: 'commission', amount: 800, status: 'cancelled', payee_user_id: 'op-1' }],
  }))
  assert.equal(l.situacao, 'cancelado')
  assert.equal(l.elegivel_liberar, false)
})

test('sem repasse calculado cai em conciliação (não some da conferência)', () => {
  const l = montarLinhaFila(reserva({ booking_payouts: [] }))
  assert.equal(l.situacao, 'conciliacao')
  assert.equal(l.elegivel_liberar, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// conciliarReserva — o que não fecha entre recebido e devido/pago
// ─────────────────────────────────────────────────────────────────────────────
test('reserva saudável não gera divergência', () => {
  assert.deepEqual(conciliarReserva(reserva()), [])
})

test('repasse pago sem pagamento aprovado do cliente é risco alto', () => {
  const d = conciliarReserva(reserva({
    payments: [{ amount_gross: 1000, status: 'pending', gateway_name: 'pagarme' }],
    booking_payouts: [{ id: 'po-1', kind: 'commission', amount: 800, status: 'paid', payee_user_id: 'op-1' }],
  }))
  const t = d.map((x) => x.tipo)
  assert.ok(t.includes('pago_sem_recebimento'))
  assert.equal(d.find((x) => x.tipo === 'pago_sem_recebimento').gravidade, 'alta')
})

test('repasse pago em reserva revertida é risco alto', () => {
  const d = conciliarReserva(reserva({
    status_commercial: 'refunded',
    booking_payouts: [{ id: 'po-1', kind: 'commission', amount: 800, status: 'paid', payee_user_id: 'op-1' }],
  }))
  assert.ok(d.some((x) => x.tipo === 'pago_reserva_revertida' && x.valor === 800))
})

test('repasses somando mais que o recebido é sinalizado', () => {
  const d = conciliarReserva(reserva({
    payments: [{ amount_gross: 500, status: 'approved', gateway_name: 'pagarme' }],
    booking_payouts: [{ id: 'po-1', kind: 'commission', amount: 800, status: 'pending', payee_user_id: 'op-1' }],
  }))
  const x = d.find((y) => y.tipo === 'repasse_acima_do_recebido')
  assert.ok(x)
  assert.equal(x.valor, 300)   // 800 devido − 500 recebido
})

test('split no ato + comissão pendente = risco de pagar em dobro', () => {
  const d = conciliarReserva(reserva({
    payments: [{ amount_gross: 1000, status: 'approved', gateway_name: 'pagarme', split_operator_id: 'op-1' }],
    booking_payouts: [{ id: 'po-1', kind: 'commission', amount: 800, status: 'pending', payee_user_id: 'op-1' }],
  }))
  assert.ok(d.some((x) => x.tipo === 'split_e_pendente'))
})

test('concluída sem data entra na conciliação', () => {
  const d = conciliarReserva(reserva({ completed_at: null }))
  assert.ok(d.some((x) => x.tipo === 'concluido_sem_data'))
})

test('concluída e paga sem repasse calculado é sinalizada', () => {
  const d = conciliarReserva(reserva({ booking_payouts: [] }))
  assert.ok(d.some((x) => x.tipo === 'aprovado_sem_repasse'))
})

test('operador pago por split e SEM comissão NÃO é falso positivo de "sem repasse"', () => {
  // Split legítimo não gera linha de comissão (gerarRepasses pula) — não pode
  // ser confundido com "faltou repasse".
  const d = conciliarReserva(reserva({
    payments: [{ amount_gross: 1000, status: 'approved', gateway_name: 'pagarme', split_operator_id: 'op-1' }],
    booking_payouts: [],
  }))
  assert.ok(!d.some((x) => x.tipo === 'aprovado_sem_repasse'))
})

// ─────────────────────────────────────────────────────────────────────────────
// Garantias da ROTA de liberação (leitura da fonte)
// ─────────────────────────────────────────────────────────────────────────────
const adminSrc = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8')
const liberar = adminSrc.slice(adminSrc.indexOf("router.post('/payouts/liberar'"),
                                adminSrc.indexOf("router.get('/payouts/conciliacao'"))

test('a baixa é idempotente: só transita quem está pending', () => {
  assert.ok(liberar.includes(".eq('status', 'pending')"),
    'o update de liberação precisa do guard WHERE status=pending para não pagar 2x')
})

test('a liberação REVALIDA no servidor com a regra da fila', () => {
  assert.ok(liberar.includes('montarLinhaFila('),
    'a rota tem que reclassificar a reserva, não confiar no que a tela mandou')
  assert.ok(liberar.includes('elegivel_liberar'),
    'a rota tem que checar elegibilidade revalidada')
})

test('a auditoria usa um valor VÁLIDO do enum e um discriminador', () => {
  // 'payout_release' não existe no enum audit_action_type; usar direto faria o
  // insert falhar em silêncio (supabase-js devolve {error} sem lançar).
  assert.ok(liberar.includes("action_type:     'manual_override'"),
    'action_type precisa ser um membro do enum (manual_override)')
  assert.ok(liberar.includes("evento:        'payout_release'"),
    'o discriminador real do evento vai no JSON')
  assert.ok(liberar.includes("metodo:        'manual_externo'"),
    'a trilha precisa deixar claro que foi pagamento manual, não transferência de gateway')
})

test('a falha de auditoria é conferida, não engolida', () => {
  assert.ok(liberar.includes('auditoria_ok'),
    'o erro do insert de auditoria precisa ser conferido e reportado')
})
