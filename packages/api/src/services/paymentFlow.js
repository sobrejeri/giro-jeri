// ── services/paymentFlow.js ──────────────────────────────────────────────────
// As DECISÕES do fluxo de pagamento, separadas da rota.
//
// Estão aqui porque são exatamente o que precisa de teste: quem pode chamar o
// Mercado Pago, quem executa os efeitos de uma aprovação, e o que fazer com um
// webhook repetido. Dentro de `payments.js` elas só seriam exercitáveis subindo
// Express, Supabase e o SDK do MP — e por isso não eram testadas.
//
// O banco entra por parâmetro (`db`, o cliente supabase-js). Em produção é o
// cliente real; no teste, um dublê que simula violação de UNIQUE e corrida.
// Isto NÃO é um fluxo paralelo: `payments.js` chama estas funções e mais
// nenhuma cópia da regra existe.

// Quanto tempo uma tentativa pode ficar "em voo" antes de outra requisição
// poder assumi-la. Cobre o processo que morre DEPOIS de reservar a tentativa e
// ANTES de falar com o Mercado Pago — sem isso ela travaria para sempre e o
// cliente não conseguiria pagar.
//
// Assumir é seguro porque a chamada ao MP vai com a MESMA X-Idempotency-Key: se
// ele já criou a cobrança, devolve a mesma, não uma segunda.
export const TENTATIVA_EM_VOO_MS = 90_000

// Gravado em payments.status_detail quando a chamada ao Mercado Pago lança.
// É o que permite o retry imediato: sabemos que a chamada TERMINOU, ainda que
// sem resposta útil, então não há ninguém "em voo" para esperar.
export const MARCA_FALHA_MP = 'mp_call_failed'

// ── Aprovação: só um processo executa os efeitos ─────────────────────────────
//
// Webhook e polling podem ler o mesmo pagamento 'pending' no mesmo instante,
// perguntar ao Mercado Pago, receber 'approved' os dois, e aprovar em paralelo.
// Um `if (status !== 'approved')` em JavaScript não protege: os dois leem
// 'pending' antes de qualquer um escrever.
//
// O `.neq('status','approved')` empurra a condição para dentro do UPDATE, e o
// Postgres decide: só uma transação encontra a linha. A outra volta com zero
// linhas — é assim que ela sabe que perdeu.
export async function reivindicarAprovacao(db, paymentId, agoraISO) {
  const { data, error } = await db
    .from('payments')
    .update({ status: 'approved', paid_at: agoraISO })
    .eq('id', paymentId)
    .neq('status', 'approved')
    .select('id')

  if (error) {
    // Falhar aqui não pode virar "aprova mesmo assim": efeito duplicado é pior
    // que aprovação atrasada, que o polling refaz.
    console.error('[pagamento] claim de aprovação falhou payment=%s err=%s', paymentId, error.message)
    return false
  }
  return (data || []).length > 0
}

// ── Tentativa: uma chave do navegador, no máximo uma cobrança ────────────────
//
// A linha em `payments` nasce aqui, sem gateway_transaction_id, e o UNIQUE
// parcial de payment_attempt_id decide quem ficou com ela. Um SELECT antes do
// create não bastaria: duas requisições simultâneas leriam "não existe" antes
// de qualquer uma escrever.
//
// Devolve:
//   { modo:'novo',         paymentId }  → pode chamar o Mercado Pago
//   { modo:'existente',    payment }    → outra requisição já criou a cobrança
//   { modo:'em_voo' }                   → outra está falando com o MP agora
//   { modo:'assumida',     paymentId }  → tentativa abandonada, retomada
//   { modo:'indisponivel' }             → migration 055 pendente
export async function reservarTentativa(db, {
  attemptId, bookingId, orderGroupId, amount, paymentMethod, gateway, agoraMs,
}) {
  const linha = {
    booking_id:         bookingId,
    payment_attempt_id: attemptId,
    payment_method:     paymentMethod,
    gateway_name:       gateway,
    payment_type:       'full',
    amount_gross:       amount,
    status:             'pending',
    ...(orderGroupId ? { order_group_id: orderGroupId } : {}),
  }

  const { data, error } = await db.from('payments').insert(linha).select('id').maybeSingle()
  if (!error) return { modo: 'novo', paymentId: data.id }

  if (error.code === 'PGRST204' || error.code === '42703') {
    console.warn('[pagamento] payment_attempt_id ausente (migration 055 pendente) — sem reserva de tentativa')
    return { modo: 'indisponivel' }
  }
  if (error.code !== '23505') throw error

  // Conflito: a tentativa já é de alguém. Quem, e em que pé?
  const { data: existente } = await db
    .from('payments')
    .select('*, bookings(*)')
    .eq('payment_attempt_id', attemptId)
    .maybeSingle()
  if (!existente) throw error

  if (existente.gateway_transaction_id) return { modo: 'existente', payment: existente }

  // A chamada anterior ao Mercado Pago terminou em ERRO (rede, 5xx, timeout do
  // SDK). Não sabemos se ele criou a cobrança — mas a nossa chave de
  // idempotência é a mesma, então repetir devolve a primeira, não uma segunda.
  // Sem esta saída o cliente esperaria os 90s de "em voo" sem nada acontecendo.
  if (existente.status_detail === MARCA_FALHA_MP) {
    return { modo: 'assumida', paymentId: existente.id }
  }

  const idadeMs = agoraMs - new Date(existente.created_at).getTime()
  // Vai com o id da linha: a tela de processamento do app precisa dele para
  // consultar o desfecho. Sem ele o cliente cai numa tela que não sabe o que
  // perguntar.
  if (idadeMs < TENTATIVA_EM_VOO_MS) return { modo: 'em_voo', paymentId: existente.id }

  console.warn('[pagamento] tentativa %s parada há %ss — retomando com a mesma chave de idempotência',
    attemptId, Math.round(idadeMs / 1000))
  return { modo: 'assumida', paymentId: existente.id }
}

// ── Webhook: o evento é novo, repetido, ou repetido-mas-nunca-concluído? ─────
//
// `upsert(..., { ignoreDuplicates: true })` engole o conflito SEM dizer que
// houve um — e era por isso que o evento repetido seguia adiante e reexecutava
// os efeitos. INSERT puro e leitura do 23505 dá a resposta sem ambiguidade.
//
// Repetido nem sempre é "ignore": se o processamento anterior caiu no meio, o
// evento ficou 'pending', e a reentrega do Mercado Pago existe justamente para
// esse caso. Descartá-la perderia a única segunda chance.
export async function registrarEventoWebhook(db, {
  gatewayEventId, eventName, payload, paymentId,
}) {
  const { error } = await db.from('payment_events').insert({
    payment_id:         paymentId || null,
    gateway_event_id:   gatewayEventId,
    event_name:         eventName,
    event_payload_json: payload,
    processing_status:  'pending',
  }).select('id').maybeSingle()

  if (!error) return { processar: true, motivo: 'novo' }

  if (error.code === '23505') {
    const { data: anterior } = await db
      .from('payment_events')
      .select('processing_status')
      .eq('gateway_event_id', gatewayEventId)
      .maybeSingle()
    if (anterior?.processing_status === 'processed') {
      return { processar: false, motivo: 'duplicado' }
    }
    return { processar: true, motivo: 'repetido_nao_concluido' }
  }

  if (error.code === 'PGRST204' || error.code === '42703') {
    // Migration 055 pendente. Segue sem a trava de duplicata em vez de derrubar
    // o webhook — o claim de aprovação ainda impede efeito dobrado.
    console.warn('[webhook] gateway_event_id ausente (migration 055 pendente) — sem trava de duplicata')
    return { processar: true, motivo: 'sem_coluna' }
  }

  console.error('[webhook] falha ao gravar payment_events code=%s msg=%s', error.code, error.message)
  return { processar: true, motivo: 'erro_ao_gravar' }
}

// ── Status com que a linha nasce, depois da resposta do cartão ───────────────
//
// 'approved' NÃO sai daqui. A promoção para 'approved' é do claim
// (`reivindicarAprovacao`), que só executa os efeitos se ENCONTRAR a linha ainda
// não aprovada. Gravar 'approved' antes do claim faz o UPDATE condicional voltar
// vazio, e o cartão aprovado no mesmo request deixa de gerar reserva paga,
// lançamento no ledger, comissão, e-mail e notificação.
//
// O cliente continua vendo 'approved': a resposta HTTP vem do resultado do
// Mercado Pago, não desta coluna.
export function statusInicialDoPagamento(gatewayStatus) {
  if (!gatewayStatus) return 'pending'
  if (gatewayStatus === 'approved') return 'pending'
  if (gatewayStatus === 'rejected') return 'failed'
  return gatewayStatus // in_process / pending / outros
}

// Estado seguinte de um pagamento diante do que o gateway respondeu.
// `runApprovalEffects` NÃO decide sozinho: quem decide é o claim atômico. Serve
// para o chamador saber se vale sequer tentar.
export function nextPaymentState(previous, gatewayStatus) {
  if (previous === 'approved') return { status: 'approved', runApprovalEffects: false }
  if (gatewayStatus === 'approved') return { status: 'approved', runApprovalEffects: true }
  if (gatewayStatus === 'rejected' || gatewayStatus === 'cancelled') return { status: 'failed', runApprovalEffects: false }
  return { status: gatewayStatus || previous, runApprovalEffects: false }
}

// Device ID do antifraude do Mercado Pago. Ausência não bloqueia a cobrança —
// derruba a taxa de aprovação, e isso precisa aparecer no log.
export function integrationWarnings({ deviceId }) {
  return deviceId ? [] : ['mercado_pago_device_id_missing']
}
