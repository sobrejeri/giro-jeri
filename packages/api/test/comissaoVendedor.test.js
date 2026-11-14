// Comissão do operador que vendeu, paga pela empresa.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { calcularComissao, comissoesALancar, pendentesARevogar, lerPercentual } from '../src/services/comissaoVendedor.js'

const ler = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8')
const equipe = [
  { id: 'op1', company_commission_pct: 10, company_commission_since: '2026-11-10T00:00:00Z' },
  { id: 'op2', company_commission_pct: null, company_commission_since: null },
  { id: 'op3', company_commission_pct: 12.5, company_commission_since: '2026-11-01T00:00:00Z' },
]
const R = (x) => ({ status_commercial: 'paid', created_at: '2026-11-12T10:00:00Z', ...x })

test('percentual sobre o valor da reserva, em centavos certos', () => {
  assert.equal(calcularComissao(480, 10), 48)
  assert.equal(calcularComissao(333.33, 12.5), 41.67)
  assert.equal(calcularComissao(100, 0), 0); assert.equal(calcularComissao(0, 10), 0)
  assert.equal(calcularComissao(100, 150), 0, 'percentual absurdo não gera dívida')
})

test('lança só reserva PAGA, de operador com percentual, e nunca em dobro', () => {
  const linhas = comissoesALancar([
    R({ id: 'b1', operator_id: 'op1', total_amount: 480 }),
    R({ id: 'b2', operator_id: 'op1', total_amount: 200, status_commercial: 'awaiting_payment' }),
    R({ id: 'b3', operator_id: 'op2', total_amount: 300 }),            // sem percentual
    R({ id: 'b4', operator_id: 'op1', total_amount: 900 }),            // já lançada
    R({ id: 'b5', operator_id: 'opX', total_amount: 900 }),            // fora da equipe
    R({ id: 'b6', operator_id: 'op3', total_amount: 333.33 }),
  ], equipe, new Set(['b4']), 'co')
  assert.deepEqual(linhas, [
    { company_id: 'co', operator_id: 'op1', booking_id: 'b1', base_amount: 480, pct: 10, amount: 48, status: 'pending' },
    { company_id: 'co', operator_id: 'op3', booking_id: 'b6', base_amount: 333.33, pct: 12.5, amount: 41.67, status: 'pending' },
  ])
})

test('o percentual não vale para trás: venda anterior à definição não gera comissão', () => {
  const antes = R({ id: 'b9', operator_id: 'op1', total_amount: 500, created_at: '2026-11-09T23:00:00Z' })
  assert.deepEqual(comissoesALancar([antes], equipe, new Set(), 'co'), [])
  const semData = [{ id: 'op1', company_commission_pct: 10, company_commission_since: null }]
  assert.deepEqual(comissoesALancar([R({ id: 'b1', operator_id: 'op1', total_amount: 500 })], semData, new Set(), 'co'), [])
})

test('reserva cancelada ou reembolsada: comissão pendente deixa de ser devida; a paga fica', () => {
  assert.deepEqual(pendentesARevogar([
    { id: 'p1', status: 'pending', bookings: { status_commercial: 'refunded' } },
    { id: 'p2', status: 'pending', bookings: { status_commercial: 'paid' } },
    { id: 'p3', status: 'paid', bookings: { status_commercial: 'cancelled' } },
    { id: 'p4', status: 'pending', bookings: { status_commercial: 'cancelled' } },
  ]), ['p1', 'p4'])
})

test('percentual do formulário: vazio = sem comissão; fora de 0–100 é recusado', () => {
  assert.deepEqual(lerPercentual(''), { pct: null }); assert.deepEqual(lerPercentual(null), { pct: null })
  assert.deepEqual(lerPercentual('12.555'), { pct: 12.56 }); assert.deepEqual(lerPercentual(0), { pct: 0 })
  assert.ok(lerPercentual(101).erro); assert.ok(lerPercentual(-1).erro); assert.ok(lerPercentual('abc').erro)
})

test('rotas: só a equipe da empresa, foto do percentual, e nada de comissão da plataforma', () => {
  const src = ler('../src/routes/companySellerPayouts.js')
  assert.match(src, /\.eq\('company_id', req\.user\.id\)/)
  const patch = src.slice(src.indexOf("router.patch('/seller-payouts/:id'"))
  assert.match(patch, /\.eq\('id', req\.params\.id\)\.eq\('company_id', req\.user\.id\)/, 'só altera linha da própria empresa')
  assert.match(src, /onConflict: 'booking_id', ignoreDuplicates: true/, 'abrir a tela duas vezes não duplica')
  assert.doesNotMatch(src, /from\('booking_payouts'\)|from\('payments'\)/)
  const equipeRota = ler('../src/routes/companyTeam.js')
  assert.match(equipeRota, /await materializarComissoes\(req\.user\.id\)/, 'antes de mudar o percentual, lança o que já era devido no antigo')
  assert.match(equipeRota, /company_commission_since = new Date\(\)\.toISOString\(\)/)
  const sql = ler('../../../supabase/migrations/133_comissao_do_vendedor.sql')
  assert.match(sql, /CONSTRAINT company_seller_payouts_unico UNIQUE \(booking_id\)/)
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/)
})
