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

// ── Recorte das reservas por perfil ──────────────────────────────────────────
// Segunda passada da auditoria: GET /api/bookings recortava APENAS o turista.
// Operador e agência recebiam todas as reservas da plataforma, paginadas,
// incluindo as de concorrentes. E GET /api/bookings/:id só barrava o turista
// de outro — operador abria qualquer reserva, com contato do cliente.
//
// A fila de aceite não depende disso: ela tem rota própria
// (GET /api/operator/bookings), que filtra `operator_id IS NULL` e não seleciona
// nenhum dado pessoal do cliente.

const operador = fs.readFileSync(new URL('../src/routes/operator.js', import.meta.url), 'utf8')

test('GET /bookings ("Minhas Reservas") mostra só as reservas do próprio usuário', () => {
  const r = rota(reservas, "router.get('/', authenticate")
  // Esta rota é a "Minhas Reservas" do app do turista. Todo papel vê apenas as
  // SUAS reservas (user_id). O admin vê tudo no painel; o operador vê a fila em
  // GET /api/operator/bookings — não aqui.
  assert.ok(/query = query\.eq\('user_id', req\.user\.id\)/.test(r),
    'a lista tem de ser recortada pelo dono (user_id), seja qual for o papel')
  assert.ok(!/query\.eq\('operator_id', req\.user\.id\)/.test(r),
    'não recorta por operator_id aqui — isso é a fila do app do operador')
})

test('GET /bookings não devolve a lista inteira pra nenhum papel (nem admin)', () => {
  const r = rota(reservas, "router.get('/', authenticate")
  assert.ok(!/user_type !== 'admin' && req\.user\.user_type !== 'finance'/.test(r),
    'não deve haver ramo que deixe admin/finance sem recorte de dono (antes vazava TODAS)')
  assert.ok(/query = query\.eq\('user_id', req\.user\.id\)/.test(r),
    'todo papel é recortado por user_id — inclusive admin/finance')
})

test('GET /bookings/:id só abre para dono, operador atribuído ou admin', () => {
  const r = rota(reservas, "router.get('/:id'")
  assert.ok(/const dono =/.test(r), 'precisa calcular quem pode abrir')
  assert.ok(/data\.operator_id === req\.user\.id/.test(r),
    'operador só pode abrir a reserva atribuída a ele')
  assert.ok(/data\.user_id === req\.user\.id/.test(r),
    'turista só pode abrir a própria reserva')
  assert.ok(/status\(404\)/.test(r.slice(r.indexOf('const dono ='))),
    'negativa precisa ser 404 para não confirmar a existência')
})

test('GET /conversations não entrega TODAS as conversas ao admin — só as que o Turiva participou', () => {
  const r = rota(reservas, "router.get('/conversations', authenticate")
  // Antes o admin caía sem filtro e recebia todas as reservas com mensagem —
  // então qualquer admin via as MESMAS conversas de todo mundo. Agora o admin é
  // recortado pelas reservas em que já houve mensagem de papel 'admin'.
  assert.ok(/sender_role', 'admin'/.test(r),
    'admin precisa ser recortado pelas conversas em que o Turiva mandou mensagem')
  assert.ok(/bq\.in\('id', adminBookingIds\)/.test(r),
    'a query de reservas do admin precisa filtrar por esses booking ids')
  // Nenhum papel pode cair sem recorte: operador→operator_id, turista→user_id,
  // admin→adminBookingIds. Não pode existir bq sem eq/in de recorte.
  assert.ok(/if \(ehOperador\)\s+bq = bq\.eq\('operator_id'/.test(r),
    'operador recortado por operator_id')
  assert.ok(/else if \(ehTurista\) bq = bq\.eq\('user_id'/.test(r),
    'turista recortado por user_id')
})

test('o chat cliente↔operador só abre depois do pagamento (admin sempre)', () => {
  const i = reservas.indexOf('async function acessoChat')
  assert.notEqual(i, -1)
  const fn = reservas.slice(i, i + 1200)
  // Precisa ler o status comercial da reserva pra decidir.
  assert.ok(/select\('id, user_id, operator_id, status_commercial'/.test(fn),
    'acessoChat precisa carregar status_commercial')
  // Admin/finance retorna ANTES da trava de pagamento.
  const iAdmin = fn.indexOf("user_type === 'admin'")
  const iTrava = fn.indexOf('CHAT_PRE_PAGAMENTO')
  assert.ok(iAdmin !== -1 && iTrava !== -1 && iAdmin < iTrava,
    'admin tem de passar antes da trava de pagamento')
  // Estados de pré-pagamento bloqueiam (403), e cobrem o "aguardando pagamento".
  assert.ok(/CHAT_PRE_PAGAMENTO\.includes\(b\.status_commercial\)/.test(fn),
    'a trava precisa comparar com o conjunto de estados pré-pagamento')
  assert.ok(/code: 403/.test(fn), 'chat bloqueado responde 403, não libera')
  const conj = reservas.slice(reservas.indexOf('const CHAT_PRE_PAGAMENTO'), reservas.indexOf('const CHAT_PRE_PAGAMENTO') + 160)
  for (const s of ['awaiting_acceptance', 'awaiting_payment']) {
    assert.ok(conj.includes(s), `o estado ${s} tem de bloquear o chat`)
  }
})

test('a fila de aceite não entrega dado pessoal do cliente', () => {
  const i = operador.indexOf("router.get('/bookings'")
  assert.notEqual(i, -1)
  const fila = operador.slice(i, i + 3000)
  for (const campo of ['phone', 'email', 'full_name', 'cpf']) {
    assert.ok(!new RegExp(`\\b${campo}\\b`).test(fila),
      `a fila não pode expor ${campo} antes do aceite`)
  }
  assert.ok(/\.is\('operator_id', null\)/.test(fila),
    'a fila precisa listar só o que ainda não tem operador')
})
