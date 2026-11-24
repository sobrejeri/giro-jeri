// O aceite de reservas deve validar municipio no SERVIDOR, nao so no feed.
// Sem Supabase remoto: dados em memoria e contrato das tres rotas de aceite.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { operatorMayAcceptBookingsInRegions } from '../src/services/fleet.js'

const op = 'operator-qa'
const CE = 'aaaaaaaa-1111-4444-8888-000000000001'
const PI = 'bbbbbbbb-2222-4444-8888-000000000002'
const booking = (id, region_id, extra = {}) => ({ id, region_id, service_type: 'tour', service_id: 'tour-1', ...extra })

function db({ municipios = [CE], semColuna = false, transfers = [], tours = [], categories = [] } = {}) {
  const data = {
    users: [{ id: op, region_ids: municipios }],
    transfers, tours, categories,
  }
  return {
    from(table) {
      assert.ok(table in data, 'Tabela não prevista no teste: ' + table)
      const pred = []
      const q = {
        select: () => q,
        in: (col, vals) => { pred.push(x => vals.includes(x[col])); return q },
        then(ok, bad) {
          return Promise.resolve().then(() => semColuna && table === 'users'
            ? { data: null, error: { code: '42703', message: 'column region_ids does not exist' } }
            : { data: data[table].filter(x => pred.every(fn => fn(x))), error: null }).then(ok, bad)
        },
      }
      return q
    },
  }
}

test('permite aceite de reserva no municipio do operador', async () => {
  assert.equal(await operatorMayAcceptBookingsInRegions(db(), op, [booking('b1', CE)]), true)
})

test('impede aceite direto de reserva de outro municipio', async () => {
  assert.equal(await operatorMayAcceptBookingsInRegions(db(), op, [booking('b2', PI)]), false)
})

test('sem municipio marcado e migration ausente: falha fechado no POST', async () => {
  assert.equal(await operatorMayAcceptBookingsInRegions(db({ municipios: [] }), op, [booking('b3', CE)]), false)
  assert.equal(await operatorMayAcceptBookingsInRegions(db({ semColuna: true }), op, [booking('b4', CE)]), false)
  assert.equal(await operatorMayAcceptBookingsInRegions(db(), op, []), false)
})

test('carrinho inteiro é recusado se qualquer serviço estiver fora do municipio', async () => {
  assert.equal(await operatorMayAcceptBookingsInRegions(db(), op,
    [booking('b1', CE), booking('b2', PI)]), false)
  assert.equal(await operatorMayAcceptBookingsInRegions(db(), op,
    [booking('b1', CE), booking('b3', CE)]), true)
})

test('transfer legado sem region_id usa municipios do servico, nunca liberação indiscriminada', async () => {
  const base = booking('tx', null, { service_type: 'transfer', service_id: 'transfer-1' })
  assert.equal(await operatorMayAcceptBookingsInRegions(db({
    transfers: [{ id: 'transfer-1', region_ids: [CE] }],
  }), op, [base]), true)
  assert.equal(await operatorMayAcceptBookingsInRegions(db({
    transfers: [{ id: 'transfer-1', region_ids: [PI] }],
  }), op, [base]), false)
  assert.equal(await operatorMayAcceptBookingsInRegions(db(), op, [base]), false)
})

test('passeio legado sem region_id usa as categorias atendidas', async () => {
  const d = db({
    tours: [{ id: 'tour-1', category_id: 'cat1', category_ids: [] }],
    categories: [{ id: 'cat1', region_ids: [CE] }],
  })
  assert.equal(await operatorMayAcceptBookingsInRegions(d, op, [booking('tour-a', null)]), true)
})

test('as três rotas conferem a região antes do UPDATE de aceite', () => {
  const source = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')
  const trecho = (ini, fim) => source.slice(source.indexOf(ini), source.indexOf(fim, source.indexOf(ini)))
  const legs = trecho("router.post('/legs/:legId/accept'", "router.post('/bookings/group/:groupId/accept'")
  const group = trecho("router.post('/bookings/group/:groupId/accept'", "router.post('/bookings/:id/accept'")
  const single = trecho("router.post('/bookings/:id/accept'", "router.post('/bookings/:id/start'")
  for (const [nome, codigo] of [['perna', legs], ['carrinho', group], ['reserva', single]]) {
    const guard = codigo.indexOf('operatorMayAcceptBookingsInRegions(')
    const update = codigo.indexOf(".from('bookings')\n      .update(") >= 0
      ? codigo.indexOf(".from('bookings')\n      .update(")
      : codigo.indexOf(".from('booking_legs')\n      .update(")
    assert.ok(guard > 0, nome + ': falta guarda')
    assert.ok(update > guard, nome + ': guarda tem de vir ANTES do aceite')
    assert.match(codigo.slice(0,guard), /!isAdmin/, nome + ': admin continua fora do recorte')
    assert.match(codigo.slice(guard,guard+260), /status\(403\)/, nome + ': acesso indevido deve devolver 403')
  }
})
