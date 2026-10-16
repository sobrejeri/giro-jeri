// WhatsApp oficial do Turiva (suporte) — fonte única, sem placeholder.
//
// Os links "falar com a gente" tinham números chumbados de placeholder
// (5588981222990, 5588999999999). Agora todos saem de um só lugar
// (lib/support.js → TURIVA_WHATSAPP). Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const support       = read('../../turista/src/lib/support.js')
const erroNaTela    = read('../../turista/src/components/ErroNaTela.jsx')
const checkoutPay   = read('../../turista/src/pages/checkout/CheckoutPayment.jsx')
const bookingDetail = read('../../turista/src/pages/BookingDetail.jsx')

test('o número oficial do Turiva é a fonte única', () => {
  assert.match(support, /export const TURIVA_WHATSAPP = '5588981581999'/, 'número oficial do Turiva (55 88 98158-1999)')
})

test('as telas de suporte usam o número oficial (sem placeholder)', () => {
  for (const [nome, src] of [['ErroNaTela', erroNaTela], ['CheckoutPayment', checkoutPay], ['BookingDetail', bookingDetail]]) {
    assert.match(src, /TURIVA_WHATSAPP/, `${nome} usa a fonte única`)
    assert.doesNotMatch(src, /5588981222990|5588999999999/, `${nome} não tem mais número de placeholder`)
  }
})
