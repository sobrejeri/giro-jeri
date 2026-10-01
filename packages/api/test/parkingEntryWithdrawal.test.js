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

test('financeiro do parceiro: só reservas pagas, comissão no servidor, sem banco', () => {
  const r = rota("router.get('/partner/financial'")
  assert.match(r, /payment_status', 'paid'/, 'só conta o que foi pago')
  assert.match(r, /owner_user_id', req\.user\.id/, 'recorta pelos lots do parceiro')
  assert.match(r, /commission_pct/, 'comissão calculada no servidor')
  assert.match(r, /emCent/, 'soma em centavos (sem erro de float)')
  assert.doesNotMatch(r, /bank|iban|account_number|agencia/i, 'não expõe dados bancários')
})
