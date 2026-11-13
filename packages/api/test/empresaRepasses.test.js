// Repasses da empresa a quem executou (motorista, guia, tripulação).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { montarBaixa, somarRepasses } from '../src/services/repasseExecutor.js'

const agora = new Date('2026-11-13T15:00:00Z')
const concluida = { status_operational: 'completed', driver_payout_amount: 120 }

test('baixa: só de reserva concluída e com valor definido', () => {
  assert.deepEqual(montarBaixa({ status: 'paid' }, concluida, agora).patch,
    { driver_payout_status: 'paid', driver_paid_at: agora.toISOString(), updated_at: agora.toISOString() })
  assert.equal(montarBaixa({ status: 'paid' }, { status_operational: 'in_progress', driver_payout_amount: 120 }).http, 409)
  assert.match(montarBaixa({ status: 'paid' }, { status_operational: 'completed', driver_payout_amount: null }).erro, /Defina o valor/)
  assert.equal(montarBaixa({ status: 'paid' }, { status_operational: 'completed', driver_payout_amount: 0 }).http, 409)
  // valor e baixa no mesmo pedido
  const junto = montarBaixa({ amount: '150.456', status: 'paid' }, { status_operational: 'completed', driver_payout_amount: null }, agora)
  assert.equal(junto.patch.driver_payout_amount, 150.46); assert.equal(junto.patch.driver_payout_status, 'paid')
})

test('desfazer a baixa limpa a data; cancelar não exige conclusão', () => {
  const desfaz = montarBaixa({ status: 'pending' }, concluida, agora).patch
  assert.equal(desfaz.driver_payout_status, 'pending'); assert.equal(desfaz.driver_paid_at, null)
  assert.equal(montarBaixa({ status: 'cancelled' }, { status_operational: 'new' }, agora).patch.driver_payout_status, 'cancelled')
})

test('valores e situações inválidos são recusados', () => {
  for (const amount of [-1, 'abc', Infinity, 2_000_000]) assert.equal(montarBaixa({ amount }, concluida).http, 400, String(amount))
  assert.equal(montarBaixa({ status: 'quitado' }, concluida).http, 400)
  assert.equal(montarBaixa({}, concluida).http, 400)
  assert.equal(montarBaixa({ notes: { x: 1 } }, concluida).http, 400)
  assert.equal(montarBaixa({ notes: '  PIX 13/11  ' }, concluida, agora).patch.driver_payout_notes, 'PIX 13/11')
})

test('totais: a pagar, pago e quantos ainda estão sem valor', () => {
  assert.deepEqual(somarRepasses([
    { driver_payout_status: 'pending', driver_payout_amount: 100.1 },
    { driver_payout_status: 'pending', driver_payout_amount: null },
    { driver_payout_status: 'paid', driver_payout_amount: 250 },
    { driver_payout_status: 'cancelled', driver_payout_amount: 999 },
  ]), { pending: 100.1, paid: 250, sem_valor: 1, count: 4 })
})

test('rota: a empresa só enxerga e só altera despacho de operador da própria equipe', () => {
  const src = fs.readFileSync(new URL('../src/routes/companyPayouts.js', import.meta.url), 'utf8')
  assert.match(src, /\.eq\('company_id', companyId\)\.eq\('user_type', 'operator'\)/)
  assert.match(src, /\.in\('bookings\.operator_id', ids\)/)
  const patch = src.slice(src.indexOf("router.patch('/executor-payouts/:id'"))
  assert.match(patch, /if \(!asg \|\| !ids\.has\(asg\.bookings\?\.operator_id\) \|\| !asg\.driver_name\)/)
  assert.ok(patch.indexOf('ids.has(') < patch.indexOf('.update(r.patch)'), 'confere o dono ANTES de gravar')
  assert.match(patch, /\.partial\(\)\.strict\(\)/)
  assert.doesNotMatch(src, /booking_payouts|payments/, 'não toca em comissão nem em pagamento do cliente')
})
