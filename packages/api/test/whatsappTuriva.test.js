// WhatsApp do Turiva no suporte — número oficial fixo, fonte única.
//
// Os links "falar com a gente" tinham números chumbados de placeholder
// (5588981222990, 5588999999999). Agora TODOS saem de lib/support.js
// (TURIVA_WHATSAPP / waSupportLink). O número fica fixo no código de propósito:
// depender do campo do admin trouxe número errado (um placeholder velho salvo
// no banco sobrescrevia o certo). Asserção de fonte.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const support        = read('../../turista/src/lib/support.js')
const erroNaTela     = read('../../turista/src/components/ErroNaTela.jsx')
const checkoutPay    = read('../../turista/src/pages/checkout/CheckoutPayment.jsx')
const bookingDetail  = read('../../turista/src/pages/BookingDetail.jsx')
const profileDesktop = read('../../turista/src/pages/ProfileDesktop.jsx')
const footer         = read('../../turista/src/components/layout/Footer.jsx')

test('o número oficial do Turiva é a fonte única', () => {
  assert.match(support, /export const TURIVA_WHATSAPP = '5588981581999'/, 'número oficial (55 88 98158-1999)')
  assert.match(support, /return `https:\/\/wa\.me\/\$\{TURIVA_WHATSAPP\}/, 'o link sempre usa o número oficial')
})

test('todas as telas de suporte usam a fonte única (sem placeholder, sem setting instável)', () => {
  assert.match(erroNaTela,     /https:\/\/wa\.me\/\$\{TURIVA_WHATSAPP\}/, 'tela de erro')
  assert.match(checkoutPay,    /waSupportLink\(\)/, 'checkout')
  assert.match(bookingDetail,  /waSupportLink\(\)/, 'detalhe da reserva')
  assert.match(profileDesktop, /waSupportLink\(text\)/, 'suporte do perfil (desktop)')
  for (const [nome, src] of [['ErroNaTela', erroNaTela], ['CheckoutPayment', checkoutPay], ['BookingDetail', bookingDetail], ['ProfileDesktop', profileDesktop]]) {
    assert.doesNotMatch(src, /5588981222990|5588999999999|VITE_ADMIN_WHATSAPP/, `${nome} sem placeholder/env antigo`)
    assert.doesNotMatch(src, /waSupportLink\(settings/, `${nome} não depende do campo instável do admin`)
  }
})

test('o rodapé mostra o número oficial do Turiva', () => {
  assert.match(footer, /\(88\) 9 8158-1999/, 'número de contato atualizado')
  assert.doesNotMatch(footer, /9999-9999/, 'sem o placeholder antigo')
})
