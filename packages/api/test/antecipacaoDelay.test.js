// Testes da estrutura ENVIADA ao gateway para antecipacao automatica.
// Nenhuma chamada real a Pagar.me: fetch e sempre simulado.
//
// No modo D+X (type 1025), delay define dias uteis. O volume_percentage
// so pertence ao modo 'full' e nao deve ser enviado em D+X.

import test from 'node:test'
import assert from 'node:assert/strict'
import { setAutomaticAnticipation } from '../src/payments/pagarme.js'

async function capturarPayload(opcoes) {
  const originalFetch = globalThis.fetch
  let requisicao = null
  globalThis.fetch = async (url, options) => {
    requisicao = { url: String(url), ...options }
    return { ok: true, status: 200, json: async () => ({ id: 'fake' }) }
  }
  try {
    await setAutomaticAnticipation('CHAVE_FICTICIA_SEM_VALIDADE', 're_ficticio', opcoes)
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.ok(requisicao, 'o gateway deve receber o pedido de configuracao')
  assert.match(requisicao.url, /\/recipients\/re_ficticio\/automatic-anticipation-settings$/)
  assert.equal(requisicao.method, 'PATCH')
  return JSON.parse(requisicao.body)
}

test('antecipacao D+1 envia delay 1 sem volume_percentage', async () => {
  assert.deepEqual(await capturarPayload(), {
    enabled: true, type: '1025', delay: 1,
  })
})

test('antecipacao D+X aceita delay configurado sem perder o campo', async () => {
  assert.deepEqual(await capturarPayload({ delay: 2 }), {
    enabled: true, type: '1025', delay: 2,
  })
})

test('modo full preserva volume_percentage e o campo delay', async () => {
  assert.deepEqual(await capturarPayload({ type: 'full', volumePercentage: '75' }), {
    enabled: true, type: 'full', delay: 1, volume_percentage: '75',
  })
})
