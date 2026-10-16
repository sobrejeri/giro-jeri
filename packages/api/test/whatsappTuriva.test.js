// WhatsApp do Turiva no suporte — configurável no admin, com padrão oficial.
//
// Os links "falar com a gente" tinham números chumbados de placeholder
// (5588981222990, 5588999999999). Agora saem de lib/support.js: o helper
// waSupportLink prioriza o campo do admin (settings.whatsapp_support_number,
// exposto no /settings/public) e cai no número oficial do Turiva como PADRÃO.
// A tela de erro (crash) não tem camada de dados, então usa o padrão direto.
// Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const support       = read('../../turista/src/lib/support.js')
const erroNaTela    = read('../../turista/src/components/ErroNaTela.jsx')
const checkoutPay   = read('../../turista/src/pages/checkout/CheckoutPayment.jsx')
const bookingDetail = read('../../turista/src/pages/BookingDetail.jsx')

test('o número oficial do Turiva é o padrão (fonte única)', () => {
  assert.match(support, /export const TURIVA_WHATSAPP = '5588981581999'/, 'número oficial (55 88 98158-1999)')
})

test('o helper prioriza o campo do admin e cai no padrão', () => {
  assert.match(support, /settings\?\.whatsapp_support_number \? waNumber\(settings\.whatsapp_support_number\) : TURIVA_WHATSAPP/,
    'usa o número do admin quando existe; senão o oficial')
})

test('checkout e reserva leem o número do admin (via settings); erro usa o padrão', () => {
  assert.match(checkoutPay,   /href=\{waSupportLink\(settings\)\}/, 'checkout usa o helper com os settings')
  assert.match(bookingDetail, /waSupportLink\(settings\)/, 'reserva usa o helper com os settings')
  assert.match(bookingDetail, /queryKey: \['public-settings'\]/, 'reserva carrega os settings públicos (cache compartilhado)')
  assert.match(erroNaTela,    /https:\/\/wa\.me\/\$\{TURIVA_WHATSAPP\}/, 'a tela de erro usa o padrão oficial direto')
})

test('nenhuma tela de suporte tem mais número de placeholder', () => {
  for (const [nome, src] of [['ErroNaTela', erroNaTela], ['CheckoutPayment', checkoutPay], ['BookingDetail', bookingDetail]]) {
    assert.doesNotMatch(src, /5588981222990|5588999999999/, `${nome} sem placeholder`)
  }
})
