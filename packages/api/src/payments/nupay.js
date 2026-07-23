import crypto from 'node:crypto'

const BASE_URLS = {
  sandbox: 'https://sandbox-api.spinpay.com.br/v1',
  production: 'https://api.spinpay.com.br/v1',
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const DEFAULT_TIMEOUT_MS = 8_000
const DEFAULT_EXPIRES_MINUTES = 30

export class NupayError extends Error {
  constructor(message, { status = 502, code = 'nupay_error', retryable = false, response = null } = {}) {
    super(message)
    this.name = 'NupayError'
    this.status = status
    this.code = code
    this.retryable = retryable
    this.response = response
  }
}

function digits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function isValidCpf(value) {
  const cpf = digits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  const checkDigit = (length) => {
    let sum = 0
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i)
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10])
}

function getConfig(overrides = {}) {
  const env = overrides.env || process.env.NUPAY_ENV || 'sandbox'
  if (!BASE_URLS[env]) throw new NupayError('Ambiente NuPay inválido', { status: 500, code: 'invalid_config' })

  return {
    env,
    enabled: overrides.enabled ?? process.env.NUPAY_ENABLED === 'true',
    appKey: overrides.appKey || process.env.NUPAY_APP_KEY || '',
    appToken: overrides.appToken || process.env.NUPAY_APP_TOKEN || '',
    baseUrl: BASE_URLS[env],
    timeoutMs: Number(overrides.timeoutMs || process.env.NUPAY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    fetchImpl: overrides.fetchImpl || globalThis.fetch,
  }
}

export function isNupayConfigured(overrides = {}) {
  try {
    const cfg = getConfig(overrides)
    return cfg.enabled && Boolean(cfg.appKey && cfg.appToken)
  } catch {
    return false
  }
}

function assertConfig(overrides = {}) {
  const cfg = getConfig(overrides)
  if (!cfg.enabled || !cfg.appKey || !cfg.appToken) {
    throw new NupayError('NuPay indisponível no momento', { status: 503, code: 'not_configured' })
  }
  return cfg
}

function providerMessage(data, status) {
  if (status === 412) return 'Cliente não elegível para pagar com NuPay'
  if (status === 429) return 'NuPay temporariamente indisponível'
  return data?.message || data?.error_description || data?.error || `NuPay retornou HTTP ${status}`
}

async function request(path, options = {}, overrides = {}) {
  const cfg = assertConfig(overrides)
  const maxAttempts = options.retry === false ? 1 : 3
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs)

    try {
      const response = await cfg.fetchImpl(`${cfg.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Merchant-Key': cfg.appKey,
          'X-Merchant-Token': cfg.appToken,
          ...(options.headers || {}),
        },
      })
      const data = await response.json().catch(() => ({}))

      if (response.ok) return data

      const retryable = RETRYABLE_STATUS.has(response.status)
      const code = response.status === 412 ? 'shopper_ineligible' : `http_${response.status}`
      const error = new NupayError(providerMessage(data, response.status), {
        status: response.status === 412 ? 422 : 502,
        code,
        retryable,
        response: data,
      })

      if (!retryable || attempt === maxAttempts) throw error
      lastError = error
    } catch (error) {
      if (error instanceof NupayError && !error.retryable) throw error

      lastError = error instanceof NupayError
        ? error
        : new NupayError('Falha de comunicação com a NuPay', {
          status: 503,
          code: error?.name === 'AbortError' ? 'timeout' : 'network_error',
          retryable: true,
        })

      if (attempt === maxAttempts) throw lastError
    } finally {
      clearTimeout(timeout)
    }

    await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** (attempt - 1))))
  }

  throw lastError
}

function assertHttpsUrl(value, label) {
  if (!String(value || '').startsWith('https://')) {
    throw new NupayError(`${label} deve usar HTTPS`, { status: 500, code: 'invalid_config' })
  }
}

function assertShopper(user = {}) {
  const cpf = digits(user.document_number)
  if (user.document_type !== 'cpf' || !isValidCpf(cpf)) {
    throw new NupayError('Informe um CPF válido para pagar com NuPay', {
      status: 422,
      code: 'invalid_cpf',
    })
  }
  if (String(user.full_name || '').trim().length < 2) {
    throw new NupayError('Informe seu nome para pagar com NuPay', { status: 422, code: 'missing_name' })
  }
  const email = String(user.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new NupayError('Informe um e-mail válido para pagar com NuPay', {
      status: 422,
      code: 'invalid_email',
    })
  }
  const phone = digits(user.phone)
  if (phone.length < 10 || phone.length > 15) {
    throw new NupayError('Informe um telefone válido para pagar com NuPay', {
      status: 422,
      code: 'invalid_phone',
    })
  }
  return cpf
}

function money(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

export function buildSessionPayload({
  payment,
  booking,
  user,
  returnUrl,
  callbackUrl,
  serviceName,
}) {
  const cpf = assertShopper(user)
  assertHttpsUrl(returnUrl, 'NUPAY returnUrl')
  assertHttpsUrl(callbackUrl, 'NUPAY callbackUrl')

  const amount = money(payment.amount_gross)
  if (!(amount > 0)) {
    throw new NupayError('Valor do pagamento inválido', { status: 400, code: 'invalid_amount' })
  }

  return {
    currency: 'BRL',
    reference: payment.id,
    merchant: { displayName: process.env.NUPAY_MERCHANT_NAME || 'Giro Jeri' },
    amount,
    shopper: {
      identification: { type: 'CPF', value: cpf },
    },
    lineItems: [{
      id: String(booking.service_id || booking.id),
      description: serviceName || booking.service_name || `Reserva ${booking.booking_code}`,
      quantity: 1,
      price: amount,
    }],
    expiresInMinutes: DEFAULT_EXPIRES_MINUTES,
    returnUrl,
    callbackUrl,
  }
}

export async function createSession(input, config = {}) {
  const payload = buildSessionPayload(input)

  try {
    const session = await request('/checkouts/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
      retry: false,
    }, config)
    return sanitizeSession(session)
  } catch (error) {
    if (error instanceof NupayError && error.response && String(error.response.status) === '409') {
      return getSessionByReference(input.payment.id, config)
    }
    if (error instanceof NupayError && error.code === 'http_409') {
      return getSessionByReference(input.payment.id, config)
    }
    throw error
  }
}

export async function getSession(sessionId, config = {}) {
  return sanitizeSession(await request(
    `/checkouts/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
    config,
  ))
}

export async function getSessionByReference(reference, config = {}) {
  return sanitizeSession(await request(
    `/checkouts/sessions/by-reference/${encodeURIComponent(reference)}`,
    { method: 'GET' },
    config,
  ))
}

export async function expireSession(sessionId, config = {}) {
  return sanitizeSession(await request(
    `/checkouts/sessions/${encodeURIComponent(sessionId)}/expire`,
    { method: 'POST', retry: false },
    config,
  ))
}

export function buildPaymentPayload({ payment, booking, user, session, callbackUrl, orderUrl }) {
  const cpf = assertShopper(user)
  const selected = session?.selectedPaymentOption
  const amount = money(selected?.totalAmount?.value)
  const expected = money(payment.amount_gross)

  if (session?.status !== 'approved' || !session?.approvalCode || !selected) {
    throw new NupayError('Sessão NuPay ainda não foi aprovada', { status: 409, code: 'session_not_approved' })
  }
  if (session.reference !== payment.id) {
    throw new NupayError('Referência da sessão NuPay inválida', { status: 409, code: 'reference_mismatch' })
  }
  if (selected.totalAmount?.currency !== 'BRL' || amount !== expected) {
    throw new NupayError('Valor aprovado na NuPay diverge da reserva', { status: 409, code: 'amount_mismatch' })
  }

  assertHttpsUrl(callbackUrl, 'NUPAY callbackUrl')
  assertHttpsUrl(orderUrl, 'NUPAY orderUrl')

  return {
    merchantOrderReference: booking.booking_code,
    transactionId: String(payment.id).replace(/-/g, '').toUpperCase(),
    referenceId: payment.id,
    amount: { value: amount, currency: 'BRL' },
    paymentMethod: {
      type: 'nupay',
      authorizationType: 'payment_session',
    },
    shopper: {
      document: cpf,
      documentType: 'CPF',
    },
    approvalCode: session.approvalCode,
    items: [{
      id: String(booking.service_id || booking.id),
      description: booking.service_name || `Reserva ${booking.booking_code}`,
      value: amount,
      quantity: 1,
      discount: 0,
      taxAmount: 0,
      amountExcludingTax: amount,
      amountIncludingTax: amount,
    }],
    callbackUrl,
    orderUrl,
  }
}

export async function createPaymentFromSession(input, config = {}) {
  const payload = buildPaymentPayload(input)
  return sanitizePayment(await request('/checkouts/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
    retry: false,
  }, config))
}

export async function getPaymentStatus(pspReferenceId, config = {}) {
  return sanitizePayment(await request(
    `/checkouts/payments/${encodeURIComponent(pspReferenceId)}/status`,
    { method: 'GET' },
    config,
  ))
}

export async function cancelPayment(pspReferenceId, config = {}) {
  return sanitizePayment(await request(
    `/checkouts/payments/${encodeURIComponent(pspReferenceId)}/cancel`,
    { method: 'POST', retry: false },
    config,
  ))
}

export async function refundPayment(pspReferenceId, amount, config = {}, notes = '') {
  const transactionRefundId = crypto
    .createHash('sha256')
    .update(`${pspReferenceId}:${money(amount)}:full`)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase()
  const data = await request(`/checkouts/payments/${encodeURIComponent(pspReferenceId)}/refunds`, {
    method: 'POST',
    retry: false,
    body: JSON.stringify({
      transactionRefundId,
      amount: { value: money(amount), currency: 'BRL' },
      notes: notes || 'Estorno solicitado pelo Giro Jeri',
    }),
  }, config)

  return {
    refundId: data.refundId,
    pspReferenceId: data.pspReferenceId,
    status: data.status,
    dueDate: data.dueDate || null,
  }
}

export async function getRefundStatus(pspReferenceId, refundId, config = {}) {
  const data = await request(
    `/checkouts/payments/${encodeURIComponent(pspReferenceId)}/refunds/${encodeURIComponent(refundId)}`,
    { method: 'GET' },
    config,
  )
  return {
    refundId: data.refundId || refundId,
    pspReferenceId: data.pspReferenceId || pspReferenceId,
    status: data.status,
    error: data.error ? { type: data.error.type, code: data.error.code } : null,
  }
}

export function mapSessionStatus(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'approved') return 'approved'
  if (value === 'completed') return 'completed'
  if (value === 'canceled') return 'failed'
  if (value === 'expired') return 'expired'
  return 'pending'
}

export function mapPaymentStatus(providerStatus) {
  const status = String(providerStatus?.status || providerStatus || '').toUpperCase()
  const code = String(providerStatus?.code || '').toUpperCase()

  if (status === 'COMPLETED') return 'approved'
  if (status === 'REFUNDED') return 'refunded'
  if (status === 'CANCELLED' && code === 'CANCELLED_BY_TIMEOUT') return 'expired'
  if (['CANCELLED', 'ERROR', 'DENIED'].includes(status)) return 'failed'
  return 'pending'
}

export function sanitizeSession(session = {}) {
  return {
    id: session.id,
    reference: session.reference,
    status: session.status,
    redirectUrl: session.redirectUrl,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    approvalCode: session.approvalCode,
    selectedPaymentOption: session.selectedPaymentOption
      ? {
        type: session.selectedPaymentOption.type,
        installment: session.selectedPaymentOption.installment,
        totalAmount: session.selectedPaymentOption.totalAmount,
      }
      : undefined,
  }
}

export function sanitizePayment(payment = {}) {
  return {
    pspReferenceId: payment.pspReferenceId,
    referenceId: payment.referenceId,
    status: payment.status,
    code: payment.code,
    timestamp: payment.timestamp,
    amount: payment.amount,
    paymentMethodType: payment.paymentMethodType,
    paymentType: payment.paymentType,
    installmentNumber: payment.installmentNumber,
  }
}
