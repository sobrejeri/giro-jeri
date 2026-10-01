// Invariantes das rotas de estacionamento (lidas da fonte, pois dependem de
// Supabase real). O que protegem: preço no servidor, aceite atômico, recorte
// por dono/parceiro e liberação de capacidade no cancelamento.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../src/routes/parking.js', import.meta.url), 'utf8')
const rota = (assinatura) => {
  const i = src.indexOf(assinatura)
  assert.notEqual(i, -1, `rota não encontrada: ${assinatura}`)
  return src.slice(i, i + 2800)
}

test('criar reserva recalcula o preço no servidor (ignora o do cliente)', () => {
  const r = rota("router.post('/reservations'")
  assert.match(r, /cotarComTarifa/, 'o total vem da cotação do servidor')
  assert.match(r, /total_amount: cot\.total/, 'grava o total calculado, não o enviado')
  assert.match(r, /status: 'awaiting_partner'/, 'nasce aguardando o parceiro, sem pagar')
})

test('aceite é atômico via função SQL (anti-overbooking)', () => {
  const r = rota("router.post('/reservations/:id/accept'")
  assert.match(r, /rpc\('parking_accept_reservation'/, 'usa a função atômica')
  assert.match(r, /no_capacity/, 'trata a ausência de vaga')
})

test('lista do cliente recorta por user_id', () => {
  const r = rota("router.get('/reservations', authenticate")
  assert.match(r, /eq\('user_id', req\.user\.id\)/)
})

test('fila do parceiro recorta pelos lots que ele é dono (admin vê todos)', () => {
  const r = rota("router.get('/partner/reservations'")
  assert.match(r, /owner_user_id', req\.user\.id/, 'parceiro só vê os próprios lots')
  assert.match(r, /ehAdmin\(req\.user\)/, 'admin passa sem recorte de dono')
})

test('detalhe só abre para dono, parceiro do lot ou admin', () => {
  const r = rota("router.get('/reservations/:id'")
  assert.match(r, /r\.user_id === req\.user\.id/, 'dono')
  assert.match(r, /owner_user_id === req\.user\.id/, 'parceiro do lot')
  assert.match(r, /status\(404\)/, 'negativa é 404, não confirma existência')
})

test('cancelar libera os bloqueios de capacidade (idempotente)', () => {
  const r = rota("router.post('/reservations/:id/cancel'")
  assert.match(r, /parking_capacity_blocks[\s\S]*status: 'released'/, 'solta os holds da reserva')
  assert.match(r, /status: 'cancelled'/)
})

test('recusar encerra só a solicitação e exige estado aguardando aceite', () => {
  const r = rota("router.post('/reservations/:id/reject'")
  assert.match(r, /status !== 'awaiting_partner'/, 'só recusa enquanto aguarda aceite')
  assert.match(r, /status: 'rejected'/)
})

test('pagar: só o dono, só após aceite, dentro do prazo, valor da reserva', () => {
  const r = rota("router.post('/reservations/:id/pay'")
  assert.match(r, /r\.user_id !== req\.user\.id/, 'só o dono paga')
  assert.match(r, /status !== 'accepted_awaiting_payment'/, 'só paga depois do aceite')
  assert.match(r, /payment_deadline_at[\s\S]*expirou/, 'respeita o prazo de pagamento')
  assert.match(r, /already: true/, 'idempotente: já paga não cobra de novo')
  assert.match(r, /refund_pending/, 'pagou sem vaga → encaminha estorno, não descarta')
})

test('confirmação de pagamento é atômica e idempotente (RPC)', () => {
  const src2 = fs.readFileSync(new URL('../src/services/parking/payments.js', import.meta.url), 'utf8')
  assert.match(src2, /rpc\('parking_confirm_payment'/, 'confirma via função SQL atômica')
  assert.match(src2, /status === 'approved'[\s\S]*reused: true/, 'reenvio aprovado não cobra de novo')
  assert.match(src2, /onConflict: 'idempotency_key'/, 'tentativa idempotente pela chave')
})
