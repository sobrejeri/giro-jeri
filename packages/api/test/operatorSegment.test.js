// Invariantes do segmento do operador (menu adaptado ao login, tipo exclusivo).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')

test('/me devolve operator_segment (na seleção com fallback 42703)', () => {
  const auth = read('../src/routes/auth.js')
  assert.match(auth, /operator_segment/, 'me seleciona o segmento')
  assert.match(auth, /whatsapp_valid, username, operator_segment/, 'vai na seleção opcional (com retry)')
})

test('admin aceita operator_segment no PATCH do usuário, tolerante à migration', () => {
  const adm = read('../src/routes/admin.js')
  assert.match(adm, /allowed = \[[^\]]*'operator_segment'/, 'segment é campo editável')
  assert.match(adm, /delete rest\.operator_segment/, 'tolera coluna ausente')
})

test('autoatendimento do parceiro: edita só o próprio lot/tarifas, sem campos de plataforma', () => {
  const p = read('../src/routes/parking.js')
  for (const sig of ["router.get('/partner/my-lots'", "router.patch('/partner/lots/:id'", "router.post('/partner/lots/:id/tariffs'", "router.patch('/partner/tariffs/:id'"]) {
    const i = p.indexOf(sig)
    assert.notEqual(i, -1, `rota ausente: ${sig}`)
  }
  // partnerLotSchema não deve permitir comissão/prazos/reembolso.
  const schema = p.slice(p.indexOf('const partnerLotSchema'), p.indexOf('const partnerLotSchema') + 500)
  assert.doesNotMatch(schema, /commission_pct|deadline_min|refund_cutoff/, 'parceiro não edita campos da plataforma')
  // Guard de posse nas edições.
  const patchLot = p.slice(p.indexOf("router.patch('/partner/lots/:id'"), p.indexOf("router.patch('/partner/lots/:id'") + 400)
  assert.match(patchLot, /podeOperarLot/, 'só edita lot próprio')
})

test('migration 114 cria operator_segment exclusivo com default seguro', () => {
  const mig = read('../../../supabase/migrations/114_operator_segment.sql')
  assert.match(mig, /ADD COLUMN IF NOT EXISTS operator_segment TEXT NOT NULL DEFAULT 'tours_transfers'/, 'default não quebra operadores atuais')
  assert.match(mig, /CHECK \(operator_segment IN \('tours_transfers','parking'\)\)/, 'valores exclusivos')
})
