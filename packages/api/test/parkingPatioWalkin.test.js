// Invariantes da Fase A do painel: visão geral, pátio e entrada presencial.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const rotas = read('../src/routes/parking.js')
const mig = read('../../../supabase/migrations/115_parking_walkin.sql')
const rota = (sig) => { const i = rotas.indexOf(sig); assert.notEqual(i, -1, `rota ausente: ${sig}`); return rotas.slice(i, i + 1800) }

test('overview e pátio recortam pelos lots do parceiro', () => {
  assert.match(rota("router.get('/partner/overview'"), /lotsDoParceiro/, 'overview por dono')
  assert.match(rota("router.get('/partner/patio'"), /lotsDoParceiro/, 'pátio por dono')
})

test('walk-in: só dono do lot, criação atômica com comissão do servidor', () => {
  const r = rota("router.post('/partner/walkin'")
  assert.match(r, /podeOperarLot/, 'só o dono registra')
  assert.match(r, /rpc\('parking_create_walkin'/, 'criação atômica via função')
  assert.match(r, /p_commission_pct: lot\?\.commission_pct/, 'comissão vem do lot (servidor)')
})

test('saída de walk-in libera o bloqueio de capacidade', () => {
  const r = rota("router.post('/partner/stays/:id/exit'")
  assert.match(r, /capacity_block_id/, 'libera o bloqueio ligado')
  assert.match(r, /exited_at/, 'fecha a estadia')
})

test('migration 115: função de walk-in confere capacidade e cria bloqueio', () => {
  assert.match(mig, /parking_create_walkin/, 'função existe')
  assert.match(mig, /pg_advisory_xact_lock/, 'serializa por lot')
  assert.match(mig, /v_pico \+ 1 > v_lot\.capacity[\s\S]*no_capacity/, 'anti-overbooking')
  assert.match(mig, /INSERT INTO parking_capacity_blocks[\s\S]*'confirmed'/, 'bloqueio visível às reservas')
})
