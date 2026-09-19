// Venda direta no WhatsApp do operador.
//
// A venda direta (link do operador) só avisava na central do app; o telefone
// não recebia nada. Agora também vai por WhatsApp, para o operador dono do link.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

process.env.SUPABASE_URL ||= 'https://exemplo.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'chave-de-teste'

const wa = await import('../src/services/whatsapp.js')

test('existe o envio de venda direta e ele é fire-safe sem WhatsApp configurado', async () => {
  assert.equal(typeof wa.notifyOperatorDirectSale, 'function')
  // Sem Z-API configurado, isWhatsappEnabled() é false → skip, sem tocar rede/banco.
  const r = await wa.notifyOperatorDirectSale({}, { total_amount: 500, booking_code: 'X' }, 'op-1')
  assert.deepEqual(r, { skipped: true })
})

test('sem operador destino, não envia', async () => {
  const r = await wa.notifyOperatorDirectSale({}, { total_amount: 500 }, null)
  assert.deepEqual(r, { skipped: true })
})

test('o checkout dispara o WhatsApp de venda direta nos dois caminhos (único e carrinho)', () => {
  const src = fs.readFileSync(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
  assert.match(src, /notifyOperatorDirectSale.*from '\.\.\/services\/whatsapp\.js'/,
    'a função precisa ser importada')
  const chamadas = src.match(/notifyOperatorDirectSale\(supabase,/g) || []
  assert.ok(chamadas.length >= 2, 'venda direta única E carrinho precisam avisar o operador')
  // E é fire-and-forget: WhatsApp nunca derruba a criação da venda.
  assert.match(src, /notifyOperatorDirectSale\([^)]*\)\.catch\(/)
})
