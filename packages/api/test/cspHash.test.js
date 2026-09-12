// O hash da CSP tem de acompanhar o script inline do index.html.
//
// A CSP em packages/turista/public/_headers libera UM script inline pelo
// hash SHA-256: o controlador da splash. Se alguém editar esse script e não
// atualizar o hash, o navegador bloqueia a splash silenciosamente — e o
// sintoma (splash presa na tela) não aponta para a causa.
//
// Este teste quebra na hora, no lugar certo, com a instrução de conserto.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'

const raiz = new URL('../../turista/', import.meta.url)
const html     = fs.readFileSync(new URL('index.html', raiz), 'utf8')
const headers  = fs.readFileSync(new URL('public/_headers', raiz), 'utf8')

const inlines = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])

test('todo script inline do index.html está liberado por hash na CSP', () => {
  for (const corpo of inlines) {
    const hash = 'sha256-' + crypto.createHash('sha256').update(corpo, 'utf8').digest('base64')
    assert.ok(
      headers.includes(hash),
      `Script inline sem hash na CSP.\n` +
      `Some com o script, ou acrescente este hash ao script-src de ` +
      `packages/turista/public/_headers:\n  '${hash}'`,
    )
  }
})

test('a CSP não afrouxa script-src com unsafe-inline nem unsafe-eval', () => {
  const linha = headers.split('\n').find((l) => l.includes('Content-Security-Policy:')) || ''
  const scriptSrc = (linha.match(/script-src[^;]*/) || [''])[0]
  assert.ok(scriptSrc, 'script-src precisa existir na CSP')
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src não pode ter 'unsafe-inline'")
  assert.ok(!scriptSrc.includes("'unsafe-eval'"),   "script-src não pode ter 'unsafe-eval'")
  assert.ok(!/script-src[^;]*\*[^.]/.test(scriptSrc), 'script-src não pode liberar curinga')
})

test('a CSP cobre as origens que o app realmente usa', () => {
  const linha = headers.split('\n').find((l) => l.includes('Content-Security-Policy:')) || ''
  for (const origem of [
    'https://sdk.mercadopago.com',      // SDK do Mercado Pago
    'https://www.mercadopago.com',      // antifraude (security.js)
    'https://maps.googleapis.com',      // Google Maps
    'https://fonts.gstatic.com',        // fontes
  ]) {
    assert.ok(linha.includes(origem), `CSP não libera origem usada pelo app: ${origem}`)
  }
  assert.ok(/frame-ancestors 'none'/.test(linha), 'falta frame-ancestors')
  assert.ok(/object-src 'none'/.test(linha),      'falta object-src')
  assert.ok(/base-uri 'self'/.test(linha),        'falta base-uri')
})

test('HSTS sai sem includeSubDomains e sem preload', () => {
  const hsts = headers.split('\n').find((l) => l.includes('Strict-Transport-Security')) || ''
  assert.ok(hsts, 'HSTS precisa estar declarado')
  assert.ok(!/includeSubDomains/i.test(hsts),
    'includeSubDomains exige confirmar HTTPS em TODOS os subdomínios antes')
  assert.ok(!/preload/i.test(hsts), 'preload é praticamente irreversível — não sem plano')
})

test('o index.html traz a política de referrer, que é o que o Pages permite', () => {
  assert.ok(/<meta name="referrer" content="strict-origin-when-cross-origin"/.test(html),
    'sem isto o caminho completo (com ids de reserva) vaza no Referer')
})
