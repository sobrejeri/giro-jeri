// Testes do fluxo de pagamento contra as funções que a ROTA realmente chama.
//
// Os testes anteriores incluíam coisas como `const id = crypto.randomUUID();
// assert.equal(id, id)` — isso não exercita retry de pagamento nenhum. Estes
// aqui usam um banco dublê que reproduz o que o Postgres faz de verdade:
// violação de UNIQUE (23505) e UPDATE condicional que só acha a linha uma vez.
// É onde os bugs de cobrança dupla moram.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reivindicarAprovacao,
  reservarTentativa,
  registrarEventoWebhook,
  nextPaymentState,
  integrationWarnings,
  statusInicialDoPagamento,
  TENTATIVA_EM_VOO_MS,
  MARCA_FALHA_MP,
} from '../src/services/paymentFlow.js'

// ── Banco dublê ──────────────────────────────────────────────────────────────
// Reproduz o essencial do supabase-js: encadeamento de filtros, UNIQUE parcial,
// e UPDATE que só afeta as linhas que casam com TODOS os filtros. Sem isso, um
// teste de corrida não testa corrida nenhuma.
function fakeDb({ payments = [], payment_events = [], unique = {}, now = 0 } = {}) {
  const tabelas = { payments: [...payments], payment_events: [...payment_events] }
  const uniques = { payments: ['payment_attempt_id'], payment_events: ['gateway_event_id'], ...unique }
  const chamadas = { insert: 0, update: 0 }
  let relogio = now

  function casa(linha, filtros) {
    return filtros.every(([tipo, campo, valor]) => {
      if (tipo === 'eq')  return linha[campo] === valor
      if (tipo === 'neq') return linha[campo] !== valor
      if (tipo === 'is')  return (linha[campo] ?? null) === valor
      return true
    })
  }

  function query(tabela) {
    const filtros = []
    const api = {
      eq:  (c, v) => (filtros.push(['eq', c, v]), api),
      neq: (c, v) => (filtros.push(['neq', c, v]), api),
      is:  (c, v) => (filtros.push(['is', c, v]), api),
      order: () => api,
      limit: () => api,
      select: () => api,
      // `then` faz o objeto ser aguardável como a query do supabase-js
      then: (resolve) => resolve(api._resultado()),
      maybeSingle: async () => {
        const r = api._resultado()
        return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error }
      },
      single: async () => api.maybeSingle(),
      _resultado: () => {
        if (api._executar) { const r = api._executar(); api._executar = null; api._pendente = r; return r }
        return api._pendente || { data: tabelas[tabela].filter((l) => casa(l, filtros)), error: null }
      },
    }

    api.insert = (linha) => {
      chamadas.insert++
      for (const col of uniques[tabela] || []) {
        if (linha[col] != null && tabelas[tabela].some((l) => l[col] === linha[col])) {
          api._pendente = { data: null, error: { code: '23505', message: `duplicate key ${col}` } }
          return api
        }
      }
      const nova = { id: `${tabela}-${tabelas[tabela].length + 1}`, created_at: new Date(relogio).toISOString(), ...linha }
      tabelas[tabela].push(nova)
      api._pendente = { data: nova, error: null }
      return api
    }

    // O supabase-js aplica os filtros DEPOIS do .update() e só executa no await.
    // Executar em `.update()` — como a primeira versão deste dublê fazia —
    // ignorava `.neq('status','approved')` e fazia o teste de corrida passar
    // por engano. O UPDATE precisa acontecer uma vez só, com todos os filtros.
    api.update = (patch) => {
      chamadas.update++
      api._executar = () => {
        const alvo = tabelas[tabela].filter((l) => casa(l, filtros))
        alvo.forEach((l) => Object.assign(l, patch))
        return { data: alvo.map((l) => ({ ...l })), error: null }
      }
      return api
    }
    return api
  }

  return { from: (t) => query(t), _tabelas: tabelas, _chamadas: chamadas, _avancarRelogio: (ms) => { relogio = ms } }
}

const AGORA = new Date('2026-09-05T12:00:00Z').getTime()
const AGORA_ISO = new Date(AGORA).toISOString()

// Simula o que a rota faz: reserva a tentativa e, se puder, chama o MP.
async function tentarPagar(db, attemptId, criarNoMP) {
  const r = await reservarTentativa(db, {
    attemptId, bookingId: 'bk-1', amount: 100, paymentMethod: 'credit_card',
    gateway: 'mercado_pago', agoraMs: AGORA,
  })
  if (r.modo === 'novo' || r.modo === 'assumida') {
    const mp = await criarNoMP()
    await db.from('payments').update({ gateway_transaction_id: mp.id, status: mp.status })
      .eq('id', r.paymentId)
    return { criou: true, modo: r.modo }
  }
  return { criou: false, modo: r.modo }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTE A — mesma tentativa enviada duas vezes → Payment.create UMA vez
// ═══════════════════════════════════════════════════════════════════════════
test('A: mesma payment_attempt_id duas vezes chama o Mercado Pago uma única vez', async () => {
  const db = fakeDb()
  let criacoes = 0
  const criar = async () => (criacoes++, { id: 'mp-1', status: 'approved' })

  const p1 = await tentarPagar(db, 'attempt-A', criar)
  const p2 = await tentarPagar(db, 'attempt-A', criar)

  assert.equal(criacoes, 1, 'o Mercado Pago só pode ser chamado uma vez')
  assert.equal(p1.criou, true)
  assert.equal(p2.criou, false)
  assert.equal(p2.modo, 'existente')
  assert.equal(db._tabelas.payments.length, 1, 'não pode existir uma segunda linha de pagamento')
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE B — MP cria a cobrança, a resposta se perde, cliente reenvia
// ═══════════════════════════════════════════════════════════════════════════
test('B: timeout depois de criar + retry com a mesma tentativa não cria segunda cobrança', async () => {
  const db = fakeDb()
  let criacoes = 0

  // 1ª: o MP cria, mas a resposta ao cliente se perde DEPOIS da gravação.
  const r1 = await reservarTentativa(db, {
    attemptId: 'attempt-B', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA,
  })
  criacoes++
  await db.from('payments').update({ gateway_transaction_id: 'mp-9', status: 'approved' })
    .eq('id', r1.paymentId)

  // 2ª: o cliente reenvia com a MESMA tentativa.
  const r2 = await reservarTentativa(db, {
    attemptId: 'attempt-B', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA + 5000,
  })

  assert.equal(r2.modo, 'existente')
  assert.equal(r2.payment.gateway_transaction_id, 'mp-9', 'devolve a cobrança que já existe')
  assert.equal(criacoes, 1)
  assert.equal(db._tabelas.payments.length, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE C — recusa definitiva → a próxima é uma tentativa NOVA
// ═══════════════════════════════════════════════════════════════════════════
test('C: depois de rejected, uma nova tentativa cria uma nova cobrança', async () => {
  const db = fakeDb()
  let criacoes = 0
  const recusa   = async () => (criacoes++, { id: 'mp-r1', status: 'rejected' })
  const aprovada = async () => (criacoes++, { id: 'mp-r2', status: 'approved' })

  await tentarPagar(db, 'attempt-C1', recusa)
  // O frontend zera a tentativa no veredito definitivo → chave nova.
  const segunda = await tentarPagar(db, 'attempt-C2', aprovada)

  assert.equal(segunda.criou, true, 'compra nova precisa poder acontecer')
  assert.equal(criacoes, 2)
  assert.equal(db._tabelas.payments.length, 2)
  assert.notEqual(db._tabelas.payments[0].payment_attempt_id, db._tabelas.payments[1].payment_attempt_id)
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE D — dois webhooks com o mesmo gateway_event_id
// ═══════════════════════════════════════════════════════════════════════════
test('D: evento repetido e já concluído interrompe o processamento', async () => {
  const db = fakeDb()
  const args = { gatewayEventId: 'ev-1', eventName: 'payment', payload: {}, paymentId: 'pay-1' }

  const primeiro = await registrarEventoWebhook(db, args)
  assert.equal(primeiro.processar, true)
  // O processamento conclui e marca o evento.
  db._tabelas.payment_events[0].processing_status = 'processed'

  const segundo = await registrarEventoWebhook(db, args)
  assert.equal(segundo.processar, false, 'o duplicado NÃO pode reexecutar os efeitos')
  assert.equal(segundo.motivo, 'duplicado')
})

test('D2: evento repetido que NUNCA concluiu ganha nova chance', async () => {
  const db = fakeDb()
  const args = { gatewayEventId: 'ev-2', eventName: 'payment', payload: {}, paymentId: 'pay-1' }

  await registrarEventoWebhook(db, args)           // fica 'pending' (processo caiu)
  const segundo = await registrarEventoWebhook(db, args)

  assert.equal(segundo.processar, true, 'a reentrega do MP é a única segunda chance')
  assert.equal(segundo.motivo, 'repetido_nao_concluido')
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE E — webhook e polling ao mesmo tempo, ambos veem approved
// ═══════════════════════════════════════════════════════════════════════════
test('E: webhook + polling simultâneos — só um conquista o claim', async () => {
  const db = fakeDb({ payments: [{ id: 'pay-1', status: 'pending', payment_attempt_id: 'a1' }] })

  // Ambos leram 'pending' e chamam a aprovação ao mesmo tempo.
  const [w, p] = await Promise.all([
    reivindicarAprovacao(db, 'pay-1', AGORA_ISO),
    reivindicarAprovacao(db, 'pay-1', AGORA_ISO),
  ])

  assert.equal([w, p].filter(Boolean).length, 1, 'exatamente um processo executa os efeitos')
  assert.equal(db._tabelas.payments[0].status, 'approved')
})

test('E2: pagamento já aprovado antes não concede o claim a ninguém', async () => {
  const db = fakeDb({ payments: [{ id: 'pay-1', status: 'approved' }] })
  assert.equal(await reivindicarAprovacao(db, 'pay-1', AGORA_ISO), false)
})

test('E3: erro do banco no claim NÃO libera os efeitos', async () => {
  const db = {
    from: () => ({
      update: () => ({ eq: () => ({ neq: () => ({ select: async () => ({ data: null, error: { message: 'timeout' } }) }) }) }),
    }),
  }
  assert.equal(await reivindicarAprovacao(db, 'pay-1', AGORA_ISO), false,
    'na dúvida não executa: efeito duplicado é pior que aprovação atrasada')
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE F — webhook chega antes do pagamento local existir
// ═══════════════════════════════════════════════════════════════════════════
test('F: evento sem pagamento local é GRAVADO, não descartado', async () => {
  const db = fakeDb()
  const r = await registrarEventoWebhook(db, {
    gatewayEventId: 'ev-cedo', eventName: 'payment', payload: { data: { id: 'mp-77' } },
    paymentId: null,
  })

  assert.equal(r.processar, true)
  assert.equal(db._tabelas.payment_events.length, 1, 'o evento não pode se perder')
  assert.equal(db._tabelas.payment_events[0].payment_id, null)
  assert.equal(db._tabelas.payment_events[0].processing_status, 'pending')
})

test('F2: a reentrega do mesmo evento adiantado continua protegida pela UNIQUE', async () => {
  const db = fakeDb()
  const args = { gatewayEventId: 'ev-cedo', eventName: 'payment', payload: {}, paymentId: null }
  await registrarEventoWebhook(db, args)
  await registrarEventoWebhook(db, args)
  assert.equal(db._tabelas.payment_events.length, 1, 'uma linha por evento, mesmo sem payment_id')
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE G — tentativa já tem cobrança: não chamar Payment.create de novo
// ═══════════════════════════════════════════════════════════════════════════
test('G: tentativa com gateway_transaction_id devolve a existente para reconciliar', async () => {
  const db = fakeDb({ payments: [{
    id: 'pay-1', payment_attempt_id: 'attempt-G', gateway_transaction_id: 'mp-55',
    status: 'pending', created_at: new Date(AGORA).toISOString(),
  }] })

  const r = await reservarTentativa(db, {
    attemptId: 'attempt-G', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA,
  })

  assert.equal(r.modo, 'existente')
  assert.equal(r.payment.gateway_transaction_id, 'mp-55')
})

test('G2: tentativa em voo há poucos segundos não vira segunda cobrança', async () => {
  const db = fakeDb({ payments: [{
    id: 'pay-1', payment_attempt_id: 'attempt-G2', gateway_transaction_id: null,
    status: 'pending', created_at: new Date(AGORA - 3000).toISOString(),
  }] })

  const r = await reservarTentativa(db, {
    attemptId: 'attempt-G2', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA,
  })
  assert.equal(r.modo, 'em_voo')
})

test('G3: tentativa abandonada é retomada com a MESMA chave, não duplicada', async () => {
  const db = fakeDb({ payments: [{
    id: 'pay-1', payment_attempt_id: 'attempt-G3', gateway_transaction_id: null,
    status: 'pending', created_at: new Date(AGORA - TENTATIVA_EM_VOO_MS - 1000).toISOString(),
  }] })

  const r = await reservarTentativa(db, {
    attemptId: 'attempt-G3', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA,
  })

  assert.equal(r.modo, 'assumida', 'processo morto no meio não pode travar o cliente para sempre')
  assert.equal(r.paymentId, 'pay-1', 'retoma a MESMA linha — a chave de idempotência protege no MP')
  assert.equal(db._tabelas.payments.length, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE H — UNIQUE de gateway_transaction_id continua valendo
// ═══════════════════════════════════════════════════════════════════════════
test('H: gateway_transaction_id continua UNIQUE na migration 001', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../../../supabase/migrations/001_schema_completo.sql', import.meta.url), 'utf8')
  assert.match(sql, /gateway_transaction_id\s+VARCHAR\(200\)\s+UNIQUE/,
    'a UNIQUE original não pode ter sido removida')
})

// Só o SQL EXECUTÁVEL conta: um comentário que cita `platform_split_pct` para
// dizer "não mexemos nisso" não é uma alteração de split.
const semComentariosSQL = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
const semComentariosJS  = (t) => t.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

test('H2: a migration 088 não toca em split nem em percentual', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = semComentariosSQL(readFileSync(new URL('../../../supabase/migrations/088_tentativa_e_webhook_idempotente.sql', import.meta.url), 'utf8'))
  for (const proibido of ['platform_split_pct', 'payment_split_admin_pct', 'system_settings']) {
    assert.equal(sql.includes(proibido), false, `088 não pode mexer em ${proibido}`)
  }
  assert.match(sql, /payments_payment_attempt_id_key/)
  assert.match(sql, /payment_events_gateway_event_id_key/)
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE I — erro de banco DEPOIS do Payment.create
// ═══════════════════════════════════════════════════════════════════════════
test('I: falha ao gravar depois de criar no MP → retry reconcilia, não recobra', async () => {
  const db = fakeDb({ now: AGORA })
  let criacoes = 0

  // 1ª: reserva, MP cria... e a gravação do resultado falha.
  const r1 = await reservarTentativa(db, {
    attemptId: 'attempt-I', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA,
  })
  criacoes++
  assert.equal(r1.modo, 'novo')
  // (nada é gravado — simula o erro de banco)

  // 2ª: retry logo em seguida com a mesma tentativa.
  const r2 = await reservarTentativa(db, {
    attemptId: 'attempt-I', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA + 2000,
  })
  assert.equal(r2.modo, 'em_voo', 'a tentativa não pode virar cobrança nova')
  assert.equal(criacoes, 1)

  // 3ª: passado o tempo de voo, retoma a MESMA linha e a MESMA chave.
  const r3 = await reservarTentativa(db, {
    attemptId: 'attempt-I', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago',
    agoraMs: AGORA + TENTATIVA_EM_VOO_MS + 1000,
  })
  assert.equal(r3.modo, 'assumida')
  assert.equal(r3.paymentId, r1.paymentId)
  assert.equal(db._tabelas.payments.length, 1)
})

test('I2: chamada ao MP que LANÇOU é retomada na hora, sem esperar o tempo de voo', async () => {
  const db = fakeDb({ payments: [{
    id: 'pay-1', payment_attempt_id: 'attempt-I2', gateway_transaction_id: null,
    status: 'pending', status_detail: MARCA_FALHA_MP,
    created_at: new Date(AGORA - 1000).toISOString(),   // 1 segundo atrás
  }] })

  const r = await reservarTentativa(db, {
    attemptId: 'attempt-I2', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercado_pago', agoraMs: AGORA,
  })

  assert.equal(r.modo, 'assumida',
    'a chamada anterior TERMINOU em erro — não há ninguém em voo para esperar')
  assert.equal(r.paymentId, 'pay-1', 'retoma a mesma linha e a mesma chave de idempotência')
  assert.equal(db._tabelas.payments.length, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
// TESTE J — Device ID chega ao Mercado Pago como meliSessionId
// ═══════════════════════════════════════════════════════════════════════════
test('J: device_id vira meliSessionId no requestOptions', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/services/mercadoPago.js', import.meta.url), 'utf8')
  assert.match(src, /meliSessionId:\s*(String\()?deviceId/, 'o antifraude depende deste repasse')
  assert.match(src, /requestOptions:\s*\{\s*idempotencyKey/, 'a chave de idempotência vai junto')
})

test('J2: o frontend lê MP_DEVICE_SESSION_ID e carrega o security.js', async () => {
  const { readFileSync } = await import('node:fs')
  const jsx = readFileSync(new URL('../../turista/src/pages/checkout/CheckoutPayment.jsx', import.meta.url), 'utf8')
  const html = readFileSync(new URL('../../turista/index.html', import.meta.url), 'utf8')
  assert.match(jsx, /MP_DEVICE_SESSION_ID/)
  assert.match(html, /mercadopago\.com\/v2\/security\.js/)
})

test('J3: device_id ausente vira aviso, não bloqueio', () => {
  assert.deepEqual(integrationWarnings({ deviceId: 'sess-1' }), [])
  assert.deepEqual(integrationWarnings({}), ['mercado_pago_device_id_missing'])
})

// ═══════════════════════════════════════════════════════════════════════════
// Ciclo de vida da tentativa no frontend — a regra que evita a cobrança dupla
// ═══════════════════════════════════════════════════════════════════════════
test('K: o frontend NÃO gera uma tentativa nova a cada envio', async () => {
  const { readFileSync } = await import('node:fs')
  const jsx = semComentariosJS(readFileSync(new URL('../../turista/src/pages/checkout/CheckoutPayment.jsx', import.meta.url), 'utf8'))
  assert.equal(jsx.includes('payment_attempt_id: crypto.randomUUID()'), false,
    'gerar a chave no envio é justamente o que causa a segunda cobrança')
  assert.match(jsx, /tentativaRef\.current\s*=\s*null/, 'a tentativa se encerra em estado definitivo')
  assert.match(jsx, /if \(!tentativaRef\.current\) tentativaRef\.current = crypto\.randomUUID\(\)/,
    'a chave nasce uma vez e sobrevive ao erro ambíguo')
  assert.match(jsx, /payment_attempt_id: tentativaRef\.current/, 'e é a chave que vai ao servidor')
})

test('L: o backend não inventa chave de idempotência', async () => {
  const { readFileSync } = await import('node:fs')
  const src = semComentariosJS(readFileSync(new URL('../src/routes/payments.js', import.meta.url), 'utf8'))
  assert.equal(src.includes('payment_attempt_id || crypto.randomUUID()'), false,
    'o fallback destruía a proteção: chave nova = segunda cobrança no MP')
})

test('M: nextPaymentState não reexecuta efeitos de um pagamento já aprovado', () => {
  assert.deepEqual(nextPaymentState('pending', 'approved'), { status: 'approved', runApprovalEffects: true })
  assert.deepEqual(nextPaymentState('approved', 'approved'), { status: 'approved', runApprovalEffects: false })
  assert.equal(nextPaymentState('pending', 'rejected').status, 'failed')
})

// ═══════════════════════════════════════════════════════════════════════════
// Regressão: o claim de aprovação não pode desligar o cartão aprovado
// ═══════════════════════════════════════════════════════════════════════════
// A trava do blocker (3) é um UPDATE condicional: só executa os efeitos quem
// ENCONTRA a linha ainda não aprovada. Se a rota gravar 'approved' na linha
// ANTES de chamar o claim, ninguém mais a encontra — e o cartão aprovado no
// mesmo request passa a não gerar reserva paga, ledger, comissão nem e-mail.
// É o caminho de 100% dos cartões, e é o único que nunca teve corrida.
test('N: cartão aprovado no mesmo request ainda executa os efeitos', async () => {
  const db = fakeDb()

  // 1. A tentativa reserva a linha, ainda sem resposta do Mercado Pago.
  const reserva = await reservarTentativa(db, {
    attemptId: 'a1', bookingId: 'bk-1', amount: 100,
    paymentMethod: 'credit_card', gateway: 'mercadopago', agoraMs: Date.now(),
  })
  assert.equal(reserva.modo, 'novo')

  // 2. O MP responde 'approved' e a rota grava o resultado NA MESMA linha.
  await db.from('payments')
    .update({ status: statusInicialDoPagamento('approved'), gateway_transaction_id: 'mp-1' })
    .eq('id', reserva.paymentId)

  // 3. onPaymentApproved() reivindica — e PRECISA vencer, senão nada acontece.
  assert.equal(await reivindicarAprovacao(db, reserva.paymentId, new Date().toISOString()), true,
    'a linha foi gravada como approved antes do claim: os efeitos da aprovação não rodariam')

  // 4. E uma segunda passagem (webhook atrasado) continua sem reexecutar.
  assert.equal(await reivindicarAprovacao(db, reserva.paymentId, new Date().toISOString()), false)
})

test('N2: o status inicial da linha nunca é approved', () => {
  assert.equal(statusInicialDoPagamento('approved'), 'pending')
  assert.equal(statusInicialDoPagamento('rejected'), 'failed')
  assert.equal(statusInicialDoPagamento('in_process'), 'in_process')
  assert.equal(statusInicialDoPagamento(undefined), 'pending')
})

test('N3: a rota não grava approved direto na linha do cartão', async () => {
  const { readFileSync } = await import('node:fs')
  const src = semComentariosJS(readFileSync(new URL('../src/routes/payments.js', import.meta.url), 'utf8'))
  assert.equal(/initialPaymentStatus\s*=\s*'approved'/.test(src), false,
    'gravar approved antes do claim desliga todos os efeitos da aprovação')
})
