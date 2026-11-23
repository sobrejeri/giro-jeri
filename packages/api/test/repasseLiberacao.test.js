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
const OPERADOR = { id: 'op-1', full_name: 'Cooperativa Sol', is_active: true, pix_key: 'sol@x.com', pix_key_type: 'email' }

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

test('operador vinculado: repasse vai para PIX da EMPRESA, não do operador', () => {
  const empresa = { id: 'empresa-qa', full_name: 'Empresa TURIVA QA', user_type: 'company', is_active: true, pix_key: 'empresa@exemplo.com', pix_key_type: 'email' }
  const l = montarLinhaFila(reserva({
    booking_payouts: [{
      id: 'po-empresa', kind: 'commission', amount: 800, status: 'pending',
      payee_user_id: empresa.id, payee: empresa,
    }],
  }))
  assert.equal(l.elegivel_liberar, true)
  assert.equal(l.beneficiario.id, 'empresa-qa')
  assert.equal(l.beneficiario.user_type, 'company')
  assert.equal(l.beneficiario.nome, 'Empresa TURIVA QA')
  assert.equal(l.beneficiario.pix_key, 'empresa@exemplo.com')
  assert.notEqual(l.beneficiario.pix_key, l.operador.pix_key)
})

test('beneficiário externo sem perfil resolvido bloqueia baixa por conciliação', () => {
  const l = montarLinhaFila(reserva({
    booking_payouts: [{ id: 'po-empresa', kind: 'commission', amount: 800, status: 'pending', payee_user_id: 'empresa-desconhecida' }],
  }))
  assert.equal(l.elegivel_liberar, false)
  assert.equal(l.situacao, 'conciliacao')
  assert.equal(l.beneficiario, null)
  assert.match(l.motivo_bloqueio, /beneficiário do repasse não identificado/)
})

test('empresa identificada sem PIX continua visível para acerto bancário manual', () => {
  const l = montarLinhaFila(reserva({
    booking_payouts: [{
      id: 'po-empresa', kind: 'commission', amount: 800, status: 'pending',
      payee_user_id: 'empresa-qa',
      payee: { id: 'empresa-qa', full_name: 'TURIVA QA', user_type: 'company', is_active: true },
    }],
  }))
  assert.equal(l.elegivel_liberar, true)
  assert.equal(l.beneficiario.nome, 'TURIVA QA')
  assert.equal(l.beneficiario.pix_key, null)
})

test('beneficiário EMPRESA inativa não pode receber baixa manual de comissão', () => {
  const r = montarLinhaFila(reserva({
    booking_payouts: [{
      id: 'po-inativo', kind: 'commission', amount: 800, status: 'pending',
      payee_user_id: 'empresa-inativa',
      payee: { id: 'empresa-inativa', full_name: 'Empresa bloqueada', user_type: 'company', is_active: false, pix_key: 'empresa@pix.teste' },
    }],
  }))
  assert.equal(r.situacao, 'conciliacao')
  assert.equal(r.elegivel_liberar, false)
  assert.equal(r.beneficiario.ativo, false)
  assert.match(r.motivo_bloqueio, /beneficiário inativo/)
})

test('beneficiário sem status confirmado é tratado como inativo (fail-closed)', () => {
  const r = montarLinhaFila(reserva({
    booking_payouts: [{
      id: 'po-incerto', kind: 'commission', amount: 800, status: 'pending',
      payee_user_id: 'empresa-incerta',
      payee: { id: 'empresa-incerta', full_name: 'Empresa sem status', user_type: 'company', pix_key: 'chave@teste' },
    }],
  }))
  assert.equal(r.situacao, 'conciliacao')
  assert.equal(r.elegivel_liberar, false)
})

test('operador pessoal inativo com comissão própria não é elegível', () => {
  const r = montarLinhaFila(reserva({ operator: { ...OPERADOR, is_active: false } }))
  assert.equal(r.elegivel_liberar, false)
  assert.equal(r.situacao, 'conciliacao')
})

test('operador desativado mas empresa beneficiária ativa permanece elegível', () => {
  const empresa = { id: 'empresa-ativa', full_name: 'Empresa credora', user_type: 'company', is_active: true }
  const r = montarLinhaFila(reserva({
    operator: { ...OPERADOR, is_active: false },
    booking_payouts: [{
      id: 'po-vinculado', kind: 'commission', amount: 800, status: 'pending',
      payee_user_id: empresa.id, payee: empresa,
    }],
  }))
  assert.equal(r.elegivel_liberar, true)
  assert.equal(r.beneficiario.ativo, true)
  assert.equal(r.beneficiario.nome, 'Empresa credora')
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

test('fila e liberação consultam o beneficiário real nos três SELECTs', () => {
  const joins = adminSrc.match(/payee:payee_user_id \( id, full_name, user_type, is_active, pix_key, pix_key_type \)/g) || []
  assert.ok(joins.length >= 3, 'fila, indicadores e baixa devem usar join de beneficiário')
  const inicio = adminSrc.indexOf("router.post('/payouts/liberar'")
  const bloco = adminSrc.slice(inicio, adminSrc.indexOf("router.get('/payouts/conciliacao'", inicio))
  assert.match(bloco, /beneficiario: linha\.beneficiario\?\.nome/)
  assert.match(bloco, /payee_user_id: p\.payee_user_id/, 'auditoria preserva o ID do beneficiário persistido')
})

test('painel admin usa PIX e nome do beneficiário, nunca PIX pessoal do operador', () => {
  const tela = fs.readFileSync(new URL('../../admin/src/pages/Repasses.jsx', import.meta.url), 'utf8')
  assert.match(tela, /Recebe:/)
  assert.match(tela, /r\.beneficiario\?\.nome/)
  assert.match(tela, /r\.beneficiario\?\.pix_key/)
  assert.doesNotMatch(tela, /ChavePix chave=\{r\.operador\?\.pix_key\}/)
})

test('os três endpoints de repasse consultam estado ativo do beneficiário', () => {
  const joins = adminSrc.match(/payee:payee_user_id \( id, full_name, user_type, is_active, pix_key, pix_key_type \)/g) || []
  assert.equal(joins.length, 3, 'fila, indicadores e baixa devem trazer is_active do beneficiário')
  assert.match(adminSrc, /operator:operator_id \( id, full_name, is_active \)/)
})
