export class PaymentAttemptInProgressError extends Error {
  constructor() {
    super('Esta tentativa ainda está sendo conciliada. Tente novamente em instantes.')
    this.name = 'PaymentAttemptInProgressError'
  }
}

// Fluxo usado em produção: o claim persistente decide se esta instância pode
// criar no gateway. Reuso/timeout sempre reconcilia por id ou external_ref.
export async function executePaymentAttempt({ attemptId, claim, createPayment, findOfficialPayment, saveGatewayResult }) {
  const { claimed, attempt } = await claim(attemptId)
  if (!claimed) {
    const official = await findOfficialPayment(attempt)
    if (!official) throw new PaymentAttemptInProgressError()
    await saveGatewayResult(attemptId, official)
    return { payment: official, created: false }
  }

  const payment = await createPayment(attemptId)
  await saveGatewayResult(attemptId, payment)
  return { payment, created: true }
}

// Somente o processo que obteve o compare-and-set no banco executa efeitos.
export async function approvePaymentOnce({ payment, claimApproval, runEffects }) {
  const claimed = await claimApproval(payment.id)
  if (!claimed) return false
  await runEffects(payment)
  return true
}

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

export function integrationWarnings({ deviceId }) {
  return deviceId ? [] : ['mercado_pago_device_id_missing']
}
