// Invariantes da alteração de período com aprovação do operador (fase D).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const rotas = read('../src/routes/parking.js')
const mig = read('../../../supabase/migrations/116_parking_change_requests.sql')
const rota = (sig) => { const i = rotas.indexOf(sig); assert.notEqual(i, -1, `rota ausente: ${sig}`); return rotas.slice(i, i + 2000) }

test('cliente pede alteração sem pagar; preço do servidor', () => {
  const r = rota("router.post('/reservations/:id/change-request'")
  assert.match(r, /r\.user_id !== req\.user\.id/, 'só o dono pede')
  assert.match(r, /cotarComTarifa/, 'preço recalculado no servidor')
  assert.doesNotMatch(r, /cobrarExtensaoEAplicar/, 'não cobra no pedido')
})

test('operador aprova/recusa só o próprio lot, só se pendente', () => {
  assert.match(rotas, /decidirAlteracao/, 'helper de decisão existe')
  const dec = rotas.slice(rotas.indexOf('async function decidirAlteracao'), rotas.indexOf('async function decidirAlteracao') + 900)
  assert.match(dec, /podeOperarLot/, 'confere dono do lot')
  assert.match(dec, /status !== 'pending'/, 'só decide pendentes')
})

test('cliente paga a diferença só de alteração aprovada → aplica extensão', () => {
  const r = rota("router.post('/reservations/:id/change-pay'")
  assert.match(r, /status', 'approved'/, 'exige alteração aprovada')
  assert.match(r, /cobrarExtensaoEAplicar/, 'cobra e aplica atômico')
  assert.match(r, /status: 'paid'/, 'marca a alteração como paga')
})

test('migration 116: um pedido ativo por reserva', () => {
  assert.match(mig, /uq_parking_change_active[\s\S]*status IN \('pending','approved'\)/, 'único ativo por reserva')
})
