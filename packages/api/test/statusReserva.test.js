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
      assert.equal(rotuloDoTotal(s), 'Total',
        `${c} + ${o} mostraria "Total pago" numa reserva não paga`)
    }
  }
})

// Foi este o caso exato do incidente: recusado no gateway, operador já aceito.
test('pagamento recusado com operador aceito continua pedindo pagamento', () => {
  const s = resolveStatusReserva({ status_commercial: 'payment_failed', status_operational: 'assigned' })
  assert.equal(s, 'waiting_payment')
  assert.equal(rotuloDoTotal(s), 'Total')
})

test('reserva paga e com operador cuidando é confirmada', () => {
  for (const o of ['assigned', 'awaiting_dispatch', 'confirmed', 'en_route', 'dispatched']) {
    const s = resolveStatusReserva({ status_commercial: 'paid', status_operational: o })
    assert.equal(s, 'confirmed', `paid + ${o} deveria ser confirmada`)
    assert.equal(rotuloDoTotal(s), 'Total pago')
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
