// Invariantes da entrada no pátio e da retirada com PIN (fase 7). Protegem o
// segredo do PIN (nunca em claro/log/URL para o parceiro), o recorte por dono do
// lot e a atomicidade de entrada/consumo via funções SQL.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const rotas   = fs.readFileSync(new URL('../src/routes/parking.js', import.meta.url), 'utf8')
const entry   = fs.readFileSync(new URL('../src/services/parking/entry.js', import.meta.url), 'utf8')
const mig     = fs.readFileSync(new URL('../../../supabase/migrations/110_parking_entry_withdrawal.sql', import.meta.url), 'utf8')
const rota = (assinatura) => {
  const i = rotas.indexOf(assinatura)
  assert.notEqual(i, -1, `rota não encontrada: ${assinatura}`)
  return rotas.slice(i, i + 2200)
}

test('registrar entrada: só parceiro/admin do lot, via função atômica', () => {
  const r = rota("router.post('/partner/entry'")
  assert.match(r, /podeOperarLot/, 'confere dono do lot')
  assert.match(r, /registrarEntrada/, 'delega à função atômica')
})

test('pedir retirada: só o dono, só com o veículo no pátio, PIN não é logado', () => {
  const r = rota("router.post('/reservations/:id/withdrawal'")
  assert.match(r, /r\.user_id !== req\.user\.id/, 'só o dono gera o PIN')
  assert.match(r, /in_lot/, 'exige veículo no pátio')
  assert.match(r, /res\.json\(\{ ok: true, pin/, 'devolve o PIN só na resposta ao dono')
})

test('validar retirada: só parceiro/admin do lot, consumo atômico', () => {
  const r = rota("router.post('/partner/withdrawal'")
  assert.match(r, /podeOperarLot/, 'confere dono do lot')
  assert.match(r, /consumirRetirada/, 'delega ao consumo atômico')
})

test('PIN é gerado com CSPRNG e guardado só como hash salgado', () => {
  assert.match(entry, /crypto\.randomBytes/, 'usa CSPRNG')
  assert.match(entry, /createHash\('sha256'\)/, 'guarda hash, não o PIN')
  assert.match(entry, /pin_hash: hashPin\(pin, salt\)/, 'persiste só o hash')
  assert.doesNotMatch(entry, /console\.log\([^)]*pin/i, 'não loga o PIN')
})

test('função SQL de consumo é atômica, com rate-limit e uso único', () => {
  assert.match(mig, /pg_advisory_xact_lock/, 'serializa por lot')
  assert.match(mig, /attempts \+ 1/, 'rate-limit por tentativa')
  assert.match(mig, /status = 'consumed'/, 'consome uma vez')
  assert.match(mig, /pin_hash = ANY\(p_candidate_hashes\)/, 'compara por hash, não recebe PIN em claro')
})

test('estender: recalcula no servidor, cobra só a diferença, aplica atômico', () => {
  const r = rota("router.post('/reservations/:id/extend'")
  assert.match(r, /cotarComTarifa/, 'novo preço vem do servidor')
  assert.match(r, /delta > 0 && !parsed\.data\.card_token/, 'exige cartão só quando há diferença')
  assert.match(r, /cobrarExtensaoEAplicar/, 'cobra a diferença e aplica')
  assert.match(r, /refund_pending/, 'sem vaga após cobrar → encaminha estorno')
})

test('aplicar extensão revalida capacidade e cresce o bloqueio (atômico)', () => {
  const ext = fs.readFileSync(new URL('../../../supabase/migrations/112_parking_extension.sql', import.meta.url), 'utf8')
  assert.match(ext, /pg_advisory_xact_lock/, 'serializa por lot')
  assert.match(ext, /v_pico \+ 1 > v_lot\.capacity[\s\S]*no_capacity/, 'não estende sem vaga')
  assert.match(ext, /SET end_at = p_new_end_at[\s\S]*kind = 'confirmed'/, 'cresce o bloqueio confirmado')
})

test('admin do catálogo: rotas protegidas por soAdmin', () => {
  assert.match(rotas, /function soAdmin/, 'guard de admin existe')
  for (const sig of ["router.get('/admin/lots'", "router.post('/admin/lots'", "router.patch('/admin/lots/:id'", "router.post('/admin/lots/:id/tariffs'"]) {
    assert.match(rota(sig), /soAdmin/, `${sig} exige admin`)
  }
})

test('avaliar: só o dono, só concluída, uma única vez', () => {
  const r = rota("router.post('/reservations/:id/review'")
  assert.match(r, /r\.user_id !== req\.user\.id/, 'só o dono avalia')
  assert.match(r, /status !== 'completed'/, 'só depois de concluir')
  assert.match(r, /23505[\s\S]*já foi avaliada/, 'UNIQUE impede avaliar duas vezes')
})

test('cancelar: reembolso por antecedência configurável, sem mover dinheiro', () => {
  assert.match(rotas, /refund_cutoff_min/, 'cutoff vem do lot (configurável)')
  assert.match(rotas, /r\.status === 'confirmed' && Date\.now\(\) <= limite/, 'só antes do pátio e dentro do prazo')
  assert.match(rotas, /refund_status = reembolso\.elegivel \? 'eligible' : 'denied'/, 'registra elegibilidade')
  const mig113 = fs.readFileSync(new URL('../../../supabase/migrations/113_parking_refund.sql', import.meta.url), 'utf8')
  assert.match(mig113, /refund_cutoff_min INTEGER NOT NULL DEFAULT 1440/, 'default 24h, sem número mágico no código')
})

test('financeiro do parceiro: só reservas pagas, comissão no servidor, sem banco', () => {
  const r = rota("router.get('/partner/financial'")
  assert.match(r, /payment_status', 'paid'/, 'só conta o que foi pago')
  assert.match(r, /owner_user_id', req\.user\.id/, 'recorta pelos lots do parceiro')
  assert.match(r, /commission_pct/, 'comissão calculada no servidor')
  assert.match(r, /emCent/, 'soma em centavos (sem erro de float)')
  assert.doesNotMatch(r, /bank|iban|account_number|agencia/i, 'não expõe dados bancários')
})
