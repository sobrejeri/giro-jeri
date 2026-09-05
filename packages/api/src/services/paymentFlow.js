// ── services/paymentFlow.js ──────────────────────────────────────────────────
// As DECISÕES do fluxo de pagamento, separadas da rota: quem pode chamar o
// Mercado Pago, quem executa os efeitos de uma aprovação, e o que fazer com um
// webhook repetido. Dentro de payments.js elas só seriam exercitáveis subindo
// Express, Supabase e o SDK do MP — e por isso não eram testadas.
//
// Tudo que fala com o mundo entra por callback, para o teste poder simular o
// que o Postgres e o Mercado Pago fazem de verdade: violação de UNIQUE,
// compare-and-set que só uma transação vence, e chamada que morre no meio.

export class PaymentAttemptInProgressError extends Error {
  constructor() {
    super('Esta tentativa ainda está sendo conciliada. Tente novamente em instantes.')
    this.name = 'PaymentAttemptInProgressError'
    this.status = 409
  }
}

// Quanto tempo uma tentativa pode ficar reivindicada antes de outra requisição
// poder retomá-la. Cobre o processo que morre DEPOIS de reivindicar e ANTES de
// registrar o resultado — sem isso a tentativa trava para sempre.
export const TENTATIVA_EM_VOO_MS = 90_000

// Gravado em payment_attempts.attempt_status quando a chamada ao Mercado Pago
// LANÇA. É o que permite o retry imediato: sabemos que a chamada terminou,
// ainda que sem resposta útil, então não há ninguém em voo para esperar.
export const TENTATIVA_CHAMADA_FALHOU = 'call_failed'

// ── Tentativa: uma chave do navegador, no máximo uma cobrança ────────────────
//
// O claim persistente decide se ESTA instância pode criar no gateway. Reuso e
// timeout sempre reconciliam por id ou external_reference, nunca recobram.
//
// `releaseAttempt` é o que impede o beco sem saída: se `createPayment` lança
// (rede, 5xx, timeout do SDK), a tentativa continuaria reivindicada por um
// processo que já morreu. O retry cairia em "não reivindicou" → procuraria no
// MP → não acharia (ele pode nem ter chegado a criar) → 409 para sempre, e o
// cliente nunca mais pagaria com aquela chave. Soltar é seguro: a chave de
// idempotência é a MESMA, então se o MP criou, ele devolve a primeira cobrança,
// não uma segunda.
export async function executePaymentAttempt({
  attemptId, claim, createPayment, findOfficialPayment, saveGatewayResult, releaseAttempt,
}) {
  const { claimed, attempt } = await claim(attemptId)
  if (!claimed) {
    const official = await findOfficialPayment(attempt)
    if (!official) throw new PaymentAttemptInProgressError()
    await saveGatewayResult(attemptId, official)
    return { payment: official, created: false }
  }

  let payment
  try {
    payment = await createPayment(attemptId)
  } catch (err) {
    if (releaseAttempt) {
      // Best-effort: soltar é uma melhoria, não pode virar um segundo erro que
      // esconde o primeiro (que é o que o cliente precisa ver).
      try { await releaseAttempt(attemptId, err) } catch { /* mantém o erro original */ }
    }
    throw err
  }

  await saveGatewayResult(attemptId, payment)
  return { payment, created: true }
}

// ── Aprovação: só um processo executa os efeitos ─────────────────────────────
//
// Webhook e polling podem ler o mesmo pagamento 'pending' no mesmo instante,
// perguntar ao Mercado Pago, receber 'approved' os dois, e aprovar em paralelo.
// Um `if (status !== 'approved')` em JavaScript não protege: os dois leem
// 'pending' antes de qualquer um escrever. Quem decide é o compare-and-set no
// banco — só uma transação encontra a linha.
export async function approvePaymentOnce({ payment, claimApproval, runEffects }) {
  const claimed = await claimApproval(payment.id)
  if (!claimed) return false
  await runEffects(payment)
  return true
}

// ── Webhook: novo, repetido, ou repetido-mas-nunca-concluído? ────────────────
//
// Repetido nem sempre é "ignore": se o processamento anterior caiu no meio, o
// evento ficou pendente, e a reentrega do Mercado Pago existe justamente para
// esse caso. Descartá-la perderia a única segunda chance. Por isso `claimEvent`
// devolve a decisão, e não apenas "já existe".
export async function processWebhookOnce({ event, claimEvent, processEvent }) {
  const claimed = await claimEvent(event)
  if (!claimed) return false
  await processEvent(event)
  return true
}

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
