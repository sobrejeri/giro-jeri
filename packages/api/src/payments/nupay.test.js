import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPaymentPayload,
  buildSessionPayload,
  createPaymentFromSession,
  createSession,
  getSession,
  isValidCpf,
  mapPaymentStatus,
  mapSessionStatus,
  refundPayment,
} from './nupay.js'

const payment = {
  id: '11111111-2222-3333-4444-555555555555',
  booking_id: 'booking-1',
  amount_gross: 250.5,
}

const booking = {
  id: 'booking-1',
  booking_code: 'GJABC123',
  user_id: 'user-1',
  service_id: 'tour-1',
  total_amount: 250.5,
}

const user = {
  id: 'user-1',
  full_name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '+55 88 99999-8888',
  document_type: 'cpf',
  document_number: '529.982.247-25',
}

const config = (fetchImpl) => ({
  enabled: true,
  env: 'sandbox',
  appKey: 'app-key',
  appToken: 'app-token',
  fetchImpl,
  timeoutMs: 100,
})

test('CPF validation checks digits, not only length', () => {
  assert.equal(isValidCpf('529.982.247-25'), true)
  assert.equal(isValidCpf('529.982.247-24'), false)
  assert.equal(isValidCpf('111.111.111-11'), false)
})

test('buildSessionPayload uses official sessions contract without PII beyond CPF', () => {
  const payload = buildSessionPayload({
    payment,
    booking,
    user,
    serviceName: 'Passeio Lagoa Azul',
    returnUrl: 'https://girojeri.com/checkout/processando?nupay_payment_id=111',
    callbackUrl: 'https://api.girojeri.com/api/payments/nupay/webhook',
  })

  assert.deepEqual(payload.shopper, {
    identification: { type: 'CPF', value: '52998224725' },
  })
  assert.equal(payload.reference, payment.id)
  assert.equal(payload.amount, 250.5)
  assert.equal(payload.currency, 'BRL')
  assert.equal(payload.lineItems[0].price, 250.5)
  assert.equal(payload.expiresInMinutes, 30)
  assert.equal(JSON.stringify(payload).includes(user.email), false)
  assert.equal(JSON.stringify(payload).includes(user.phone), false)
})

test('createSession sends merchant headers and sanitizes response', async () => {
  let captured
  const fetchImpl = async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) }
    return Response.json({
      id: 'session-1',
      reference: payment.id,
      status: 'pending',
      redirectUrl: 'https://nuapp.nubank.com.br/pay/session-1',
      createdAt: '2026-07-23T12:00:00Z',
      expiresAt: '2026-07-23T12:30:00Z',
      shopper: { identification: { type: 'CPF', value: '52998224725' } },
    })
  }

  const result = await createSession({
    payment,
    booking,
    user,
    returnUrl: 'https://girojeri.com/checkout/processando?nupay_payment_id=111',
    callbackUrl: 'https://api.girojeri.com/api/payments/nupay/webhook',
  }, config(fetchImpl))

  assert.equal(captured.url, 'https://sandbox-api.spinpay.com.br/v1/checkouts/sessions')
  assert.equal(captured.options.headers['X-Merchant-Key'], 'app-key')
  assert.equal(captured.options.headers['X-Merchant-Token'], 'app-token')
  assert.equal(result.id, 'session-1')
  assert.equal(JSON.stringify(result).includes('52998224725'), false)
})

test('createSession recovers a duplicate reference with GET by reference', async () => {
  const calls = []
  const fetchImpl = async (url) => {
    calls.push(url)
    if (calls.length === 1) {
      return Response.json({ status: '409', message: 'Conflict' }, { status: 409 })
    }
    return Response.json({
      id: 'session-existing',
      reference: payment.id,
      status: 'pending',
      redirectUrl: 'https://nuapp.nubank.com.br/pay/session-existing',
      createdAt: '2026-07-23T12:00:00Z',
      expiresAt: '2026-07-23T12:30:00Z',
    })
  }

  const result = await createSession({
    payment,
    booking,
    user,
    returnUrl: 'https://girojeri.com/checkout/processando?nupay_payment_id=111',
    callbackUrl: 'https://api.girojeri.com/api/payments/nupay/webhook',
  }, config(fetchImpl))

  assert.equal(result.id, 'session-existing')
  assert.match(calls[1], /sessions\/by-reference\//)
})

test('createSession maps 412 to an ineligible shopper error without retry', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return Response.json({ status: '412', message: 'Not eligible' }, { status: 412 })
  }

  await assert.rejects(
    () => createSession({
      payment,
      booking,
      user,
      returnUrl: 'https://girojeri.com/checkout/processando?nupay_payment_id=111',
      callbackUrl: 'https://api.girojeri.com/api/payments/nupay/webhook',
    }, config(fetchImpl)),
    (error) => error.code === 'shopper_ineligible' && error.status === 422,
  )
  assert.equal(calls, 1)
})

test('GET requests retry 429 responses with backoff', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    if (calls < 3) return Response.json({ message: 'Busy' }, { status: 429 })
    return Response.json({
      id: 'session-1',
      reference: payment.id,
      status: 'pending',
    })
  }

  const result = await getSession('session-1', config(fetchImpl))
  assert.equal(result.id, 'session-1')
  assert.equal(calls, 3)
})

test('GET requests abort on timeout and return a sanitized error', async () => {
  const fetchImpl = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('request contains sensitive provider details')
      error.name = 'AbortError'
      reject(error)
    })
  })

  await assert.rejects(
    () => getSession('session-1', { ...config(fetchImpl), timeoutMs: 5 }),
    (error) => (
      error.code === 'timeout'
      && error.status === 503
      && !error.message.includes('sensitive')
    ),
  )
})

test('payment payload uses provider-confirmed amount and payment_session authorization', () => {
  const session = {
    id: 'session-1',
    reference: payment.id,
    status: 'approved',
    approvalCode: 'approval-1',
    selectedPaymentOption: {
      type: 'credit_without_interest',
      installment: 2,
      totalAmount: { value: 250.5, currency: 'BRL' },
    },
  }

  const payload = buildPaymentPayload({
    payment,
    booking,
    user,
    session,
    callbackUrl: 'https://api.girojeri.com/api/payments/nupay/payment-webhook',
    orderUrl: 'https://girojeri.com/minhas-reservas',
  })

  assert.equal(payload.approvalCode, 'approval-1')
  assert.equal(payload.paymentMethod.authorizationType, 'payment_session')
  assert.equal(payload.transactionId, '11111111222233334444555555555555')
  assert.deepEqual(payload.amount, { value: 250.5, currency: 'BRL' })
  assert.equal(payload.paymentFlow, undefined)
})

test('createPaymentFromSession returns only operational provider fields', async () => {
  const fetchImpl = async () => Response.json({
    pspReferenceId: 'psp-123',
    referenceId: payment.id,
    status: 'WAITING_PAYMENT_METHOD',
    paymentMethodType: 'nupay',
    paymentUrl: 'https://should-not-be-persisted.example',
  })

  const result = await createPaymentFromSession({
    payment,
    booking,
    user,
    session: {
      id: 'session-1',
      reference: payment.id,
      status: 'approved',
      approvalCode: 'approval-1',
      selectedPaymentOption: {
        type: 'debit',
        installment: 1,
        totalAmount: { value: 250.5, currency: 'BRL' },
      },
    },
    callbackUrl: 'https://api.girojeri.com/api/payments/nupay/payment-webhook',
    orderUrl: 'https://girojeri.com/minhas-reservas',
  }, config(fetchImpl))

  assert.deepEqual(result, {
    pspReferenceId: 'psp-123',
    referenceId: payment.id,
    status: 'WAITING_PAYMENT_METHOD',
    code: undefined,
    timestamp: undefined,
    amount: undefined,
    paymentMethodType: 'nupay',
    paymentType: undefined,
    installmentNumber: undefined,
  })
})

test('refund retries use a stable provider transaction id', async () => {
  const requestBodies = []
  const fetchImpl = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body))
    return Response.json({
      refundId: 'refund-1',
      pspReferenceId: 'psp-123',
      status: 'PENDING',
    })
  }

  await refundPayment('psp-123', 250.5, config(fetchImpl))
  await refundPayment('psp-123', 250.5, config(fetchImpl))

  assert.equal(requestBodies[0].transactionRefundId, requestBodies[1].transactionRefundId)
  assert.deepEqual(requestBodies[0].amount, { value: 250.5, currency: 'BRL' })
})

test('only COMPLETED approves a payment', () => {
  assert.equal(mapPaymentStatus('WAITING_PAYMENT_METHOD'), 'pending')
  assert.equal(mapPaymentStatus('AUTHORIZED'), 'pending')
  assert.equal(mapPaymentStatus('COMPLETED'), 'approved')
  assert.equal(mapPaymentStatus({ status: 'CANCELLED', code: 'CANCELLED_BY_TIMEOUT' }), 'expired')
  assert.equal(mapPaymentStatus({ status: 'CANCELLED', code: 'CANCELLED_BY_USER' }), 'failed')
  assert.equal(mapPaymentStatus('ERROR'), 'failed')
})

test('session status mapping preserves the approval stage', () => {
  assert.equal(mapSessionStatus('pending'), 'pending')
  assert.equal(mapSessionStatus('approved'), 'approved')
  assert.equal(mapSessionStatus('completed'), 'completed')
  assert.equal(mapSessionStatus('canceled'), 'failed')
  assert.equal(mapSessionStatus('expired'), 'expired')
})
