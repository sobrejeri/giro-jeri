export function nextPaymentState(previous, gatewayStatus) {
  if (previous === 'approved') return { status: 'approved', runApprovalEffects: false }
  if (gatewayStatus === 'approved') return { status: 'approved', runApprovalEffects: true }
  if (gatewayStatus === 'rejected' || gatewayStatus === 'cancelled') return { status: 'failed', runApprovalEffects: false }
  return { status: gatewayStatus || previous, runApprovalEffects: false }
}

export function integrationWarnings({ deviceId }) {
  return deviceId ? [] : ['mercado_pago_device_id_missing']
}

export class SubmissionGuard {
  #active = false
  begin() {
    if (this.#active) return false
    this.#active = true
    return true
  }
  end() { this.#active = false }
}
