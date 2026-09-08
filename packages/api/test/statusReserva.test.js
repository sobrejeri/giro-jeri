// Status da reserva como o CLIENTE vê.
//
// Existe por um incidente: uma reserva com pagamento RECUSADO aparecia
// "Confirmado · Total pago" na lista e "Aguardando pagamento" no detalhe. Eram
// duas cópias da mesma regra, e a da lista não tratava `payment_failed` — caía
// numa regra que declarava confirmado olhando só o estado OPERACIONAL.
//
// A tela mais visível era a que mentia. Um cliente que acredita nela aparece
// para o passeio sem ter pago.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveStatusReserva, rotuloDoTotal } from '../../turista/src/lib/statusReserva.js'

// A regra que não pode ser quebrada por nenhum caminho.
test('nada é confirmado sem o comercial dizer que foi pago', () => {
  const operacionais = ['assigned', 'awaiting_dispatch', 'confirmed', 'en_route', 'dispatched', 'new', null]
  const semDinheiro  = ['awaiting_acceptance', 'awaiting_payment', 'payment_failed']

  for (const c of semDinheiro) {
    for (const o of operacionais) {
      const s = resolveStatusReserva({ status_commercial: c, status_operational: o })
      assert.notEqual(s, 'confirmed',
        `${c} + ${o} virou "confirmado" — o operador aceitar não significa que o dinheiro entrou`)
      assert.equal(rotuloDoTotal(s, { status_commercial: c }), 'Total',
        `${c} + ${o} mostraria "Total pago" numa reserva não paga`)
    }
  }
})

// Foi este o caso exato do incidente: recusado no gateway, operador já aceito.
test('pagamento recusado com operador aceito continua pedindo pagamento', () => {
  const reserva = { status_commercial: 'payment_failed', status_operational: 'assigned' }
  assert.equal(resolveStatusReserva(reserva), 'waiting_payment')
  assert.equal(rotuloDoTotal(resolveStatusReserva(reserva), reserva), 'Total')
})

test('reserva paga e com operador cuidando é confirmada', () => {
  for (const o of ['assigned', 'awaiting_dispatch', 'confirmed', 'en_route', 'dispatched']) {
    const reserva = { status_commercial: 'paid', status_operational: o }
    const s = resolveStatusReserva(reserva)
    assert.equal(s, 'confirmed', `paid + ${o} deveria ser confirmada`)
    assert.equal(rotuloDoTotal(s, reserva), 'Total pago')
  }
})

test('paga mas sem ninguém cuidando ainda aguarda aceite', () => {
  assert.equal(
    resolveStatusReserva({ status_commercial: 'paid', status_operational: 'new' }),
    'waiting_acceptance')
})

test('cancelada e expirada vencem qualquer outro estado', () => {
  assert.equal(resolveStatusReserva({ status_commercial: 'paid', status_operational: 'cancelled' }), 'cancelled')
  assert.equal(resolveStatusReserva({ status_commercial: 'cancelled', status_operational: 'assigned' }), 'cancelled')
  assert.equal(resolveStatusReserva({ status_commercial: 'expired', status_operational: 'assigned' }), 'expired')
})

test('em andamento e finalizada vêm do operacional', () => {
  assert.equal(resolveStatusReserva({ status_commercial: 'paid', status_operational: 'in_progress' }), 'in_progress')
  assert.equal(resolveStatusReserva({ status_commercial: 'paid', status_operational: 'completed' }), 'completed')
})

test('reserva ausente não quebra a tela', () => {
  assert.equal(resolveStatusReserva(null), 'waiting_acceptance')
  assert.equal(resolveStatusReserva(undefined), 'waiting_acceptance')
})

// A causa raiz do incidente: DUAS cópias da regra. Se alguém reintroduzir uma
// cópia local, as telas voltam a poder divergir sem nada acusar.
test('lista e detalhe usam a MESMA regra, não cópias', async () => {
  const lista   = await readFile(new URL('../../turista/src/pages/Bookings.jsx', import.meta.url), 'utf8')
  const detalhe = await readFile(new URL('../../turista/src/pages/BookingDetail.jsx', import.meta.url), 'utf8')

  for (const [nome, fonte] of [['lista', lista], ['detalhe', detalhe]]) {
    assert.match(fonte, /from '\.\.\/lib\/statusReserva'/, `${nome} precisa importar a regra compartilhada`)
    assert.doesNotMatch(fonte, /function resolveStatus\s*\(/,
      `${nome} voltou a ter uma cópia local da regra — foi assim que as telas divergiram`)
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Achados do mapa do fluxo (auditoria) — verificados no código
// ═══════════════════════════════════════════════════════════════════════════

// O enum `status_commercial` (001:32 + 035) é:
//   draft · awaiting_acceptance · awaiting_payment · paid · payment_failed ·
//   cancelled · refunded
// 'expired' NÃO está nele. Gravá-lo fazia o Postgres recusar o UPDATE, e o
// retorno não era lido: o pagamento virava 'expired' e a reserva ficava em
// 'awaiting_payment' para sempre. Uma trava que parecia existir e não existia.
test('nenhum código grava um status_commercial fora do enum', async () => {
  const enumSQL = await readFile(
    new URL('../../../supabase/migrations/001_schema_completo.sql', import.meta.url), 'utf8')
  const bloco = enumSQL.slice(enumSQL.indexOf('CREATE TYPE status_commercial'))
  const validos = new Set([...bloco.slice(0, 200).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
  // A 035 acrescentou este valor depois.
  validos.add('awaiting_acceptance')
  assert.ok(validos.has('paid') && validos.has('payment_failed'), 'o enum precisa ter sido lido')
  assert.equal(validos.has('expired'), false, 'se o enum passar a ter expired, este teste sai')

  for (const arq of ['../src/routes/payments.js', '../src/routes/bookings.js',
                     '../src/services/paymentReconcile.js']) {
    const src = await readFile(new URL(arq, import.meta.url), 'utf8')
    for (const m of src.matchAll(/status_commercial:\s*'([a-z_]+)'/g)) {
      assert.ok(validos.has(m[1]),
        `${arq} grava status_commercial '${m[1]}', que não existe no enum — o UPDATE falha calado`)
    }
  }
})

// O caminho de GRUPO já filtrava; o de reserva única promovia qualquer estado.
// Uma reserva que o cliente cancelou podia voltar a 'paid' por um webhook
// atrasado — e dinheiro chegando numa reserva cancelada é problema de gente,
// não de código: não pode ser silenciado.
test('aprovação não promove reserva cancelada ou reembolsada', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  for (const m of src.matchAll(/status_commercial: 'paid'/g)) {
    // A guarda pode estar DEPOIS (filtro no próprio UPDATE, caminho de reserva
    // única) ou ANTES (a lista do grupo já vem filtrada em `list`). Olha os
    // dois lados da escrita.
    const antes  = src.slice(Math.max(0, m.index - 1800), m.index)
    const depois = src.slice(m.index, m.index + 900)
    // Duas formas: filtro no próprio UPDATE (reserva única) ou lista já
    // filtrada antes do laço (grupo). O que não pode é promover sem nenhuma.
    const protegido =
      /not\('status_commercial', 'in'/.test(depois) ||
      /\[\.\.\.PODE_PAGAR, 'paid'\]\.includes/.test(antes)
    assert.ok(protegido,
      `promoção a paid sem excluir cancelled/refunded (perto de "${depois.slice(0, 60).replace(/\n/g, ' ')}")`)
  }
  assert.match(src, /APROVAÇÃO EM RESERVA NÃO PROMOVÍVEL/,
    'quando não promove, precisa gritar: há dinheiro sem reserva ativa')
})

// O app trata payment_failed como "aguardando pagamento" e mostra "Pagar
// agora". O servidor exigia exatamente 'awaiting_payment' e devolvia 409 — um
// botão que nunca funcionava, logo depois de uma recusa, que é quando o
// cliente mais tenta de novo.
test('reserva com pagamento recusado pode ser paga de novo', async () => {
  const src = await readFile(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  assert.match(src, /const PODE_PAGAR = \['awaiting_payment', 'payment_failed'\]/,
    'payment_failed precisa estar entre os estados que ainda podem ser pagos')
  assert.match(src, /PODE_PAGAR\.includes\(existing\.status_commercial\)/,
    'o servidor precisa aceitar o retry que a própria tela oferece')

  // E as duas pontas precisam concordar sobre o que "aguardando pagamento" é.
  const { resolveStatusReserva } = await import('../../turista/src/lib/statusReserva.js')
  assert.equal(
    resolveStatusReserva({ status_commercial: 'payment_failed', status_operational: 'assigned' }),
    'waiting_payment',
    'se o app deixar de oferecer o pagamento aqui, o servidor aceita algo que ninguém pede')
})
