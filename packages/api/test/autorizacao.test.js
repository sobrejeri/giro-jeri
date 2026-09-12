// Isolamento entre usuários e entre operadores.
//
// Duas falhas encontradas na auditoria:
//
// 1. GET /api/payments/:id/status não verificava dono. Além de devolver
//    `raw_response_json` (resposta crua do gateway), a rota EXPIRA cobrança e
//    reserva e aprova pagamento de teste — então qualquer usuário autenticado
//    podia expirar a cobrança pendente de outra pessoa.
//
// 2. PATCH /api/bookings/:id/status exigia `requireOperator`, o que garante que
//    quem chamou é operador, mas não que a reserva é DELE. Um operador podia
//    concluir ou cancelar a corrida de um concorrente.
//
// Estes testes leem o código-fonte porque as rotas dependem de Supabase real;
// o que eles protegem é a PRESENÇA do recorte de autorização, que foi
// exatamente o que faltava.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pagamentos = fs.readFileSync(new URL('../src/routes/payments.js', import.meta.url), 'utf8')
const reservas   = fs.readFileSync(new URL('../src/routes/bookings.js', import.meta.url), 'utf8')

const rota = (fonte, assinatura) => {
  const i = fonte.indexOf(assinatura)
  assert.notEqual(i, -1, `rota não encontrada: ${assinatura}`)
  return fonte.slice(i, i + 2600)
}

test('GET /payments/:id/status verifica dono ANTES de qualquer efeito', () => {
  const r = rota(pagamentos, "router.get('/:id/status'")
  const iDono    = r.indexOf('podeVerPagamento(req, payment)')
  const iExpira  = r.indexOf("status: 'expired'")
  const iAprova  = r.indexOf('onPaymentApproved')
  assert.notEqual(iDono, -1, 'a rota precisa checar dono')
  assert.ok(iDono < iAprova, 'a checagem de dono tem de vir antes de aprovar')
  assert.ok(iDono < iExpira, 'a checagem de dono tem de vir antes de expirar')
})

test('a checagem de dono cobre turista, grupo, operador e admin', () => {
  const i = pagamentos.indexOf('async function podeVerPagamento')
  assert.notEqual(i, -1)
  const fn = pagamentos.slice(i, i + 1400)
  assert.ok(/user_type === 'admin'/.test(fn),          'admin precisa passar')
  assert.ok(/operator_id === u\.id/.test(fn),          'operador atribuído precisa passar')
  assert.ok(/order_group_id/.test(fn),                 'pagamento de grupo precisa ser coberto')
  assert.ok(/eq\('user_id', u\.id\)/.test(fn),         'dono da reserva precisa ser conferido no banco')
})

test('quem não é dono recebe 404, não 403 — não confirma que o id existe', () => {
  const r = rota(pagamentos, "router.get('/:id/status'")
  const i = r.indexOf('podeVerPagamento(req, payment)')
  const janela = r.slice(i, i + 400)
  assert.ok(/status\(404\)/.test(janela), 'negativa precisa ser 404')
  assert.ok(!/status\(403\)/.test(janela), '403 confirmaria a existência do pagamento')
})

test('PATCH /bookings/:id/status recorta pelo operador dono', () => {
  const r = rota(reservas, "router.patch('/:id/status'")
  assert.ok(/eq\('operator_id', req\.user\.id\)/.test(r),
    'o UPDATE precisa exigir que a reserva seja do operador')
  assert.ok(/user_type !== 'admin'/.test(r),
    'admin continua sem o recorte')
})

test('o recorte vai no UPDATE, não num SELECT antes — sem janela entre conferir e gravar', () => {
  const r = rota(reservas, "router.patch('/:id/status'")
  const iUpdate = r.indexOf('.update(updates)')
  const iDono   = r.indexOf("eq('operator_id', req.user.id)")
  assert.ok(iUpdate !== -1 && iDono !== -1)
  assert.ok(iDono > iUpdate,
    'o filtro de dono precisa fazer parte da mesma query de UPDATE')
  // E não pode existir um update sem recorte logo ali.
  assert.ok(!/\.update\(updates\)\s*\n\s*\.eq\('id', req\.params\.id\)\s*\n\s*\.select\(\)/.test(r),
    'voltou o UPDATE sem recorte de operador')
})

test('as rotas por id de pagamento que já tinham dono continuam tendo', () => {
  for (const assinatura of [
    "router.get('/booking/:id/checkout-key'",
    "router.post('/booking/:id/checkout-accepted'",
    "router.post('/:id/simulate'",
  ]) {
    const r = rota(pagamentos, assinatura)
    assert.ok(/req\.user\.id|req\.user\.user_type/.test(r),
      `${assinatura} perdeu a checagem de identidade`)
  }
})
