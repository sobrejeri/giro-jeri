// Invariantes do Pix do estacionamento (Mercado Pago + webhook + polling).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const pix = read('../src/services/parking/pix.js')
const rotas = read('../src/routes/parking.js')
const pay = read('../src/routes/payments.js')

test('Pix usa external_reference parking:<id> e reaproveita o gerador do MP', () => {
  assert.match(pix, /PARKING_REF_PREFIX = 'parking:'/)
  assert.match(pix, /createPixPayment/, 'reusa o Pix do Mercado Pago')
  assert.match(pix, /externalRef: `\$\{PARKING_REF_PREFIX\}\$\{reserva\.id\}`/)
})

test('confirmação de Pix promove a reserva e gera código de entrada', () => {
  assert.match(pix, /confirmarReserva\(reservationId\)/)
  assert.match(pix, /garantirCodigoEntrada/)
})

test('rotas de Pix: criar (dono/pós-aceite) e status (polling)', () => {
  assert.match(rotas, /router\.post\('\/reservations\/:id\/pay-pix'/)
  assert.match(rotas, /router\.get\('\/reservations\/:id\/pix-status'/)
  const r = rotas.slice(rotas.indexOf("router.post('/reservations/:id/pay-pix'"), rotas.indexOf("router.post('/reservations/:id/pay-pix'") + 1200)
  assert.match(r, /status !== 'accepted_awaiting_payment'/, 'só paga após o aceite')
})

test('webhook trata parking: isolado, sem tocar no fluxo de bookings', () => {
  assert.match(pay, /startsWith\('parking:'\)/, 'detecta cobrança de estacionamento')
  assert.match(pay, /confirmarPixAprovado/, 'confirma via serviço do estacionamento')
  assert.match(pay, /return res\.status\(200\)\.json\(\{ ok: true, parking: true \}\)/, 'encerra sem cair no fluxo de bookings')
})
