import { Router }    from 'express'
import crypto        from 'node:crypto'
import { supabase }  from '../supabase.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { sendBookingConfirmation } from '../services/email.js'
import {
  calculatePrivateTour,
  calculateSharedTour,
  calculateTabbedTransfer,
} from '../services/priceEngine.js'
import {
  NupayError,
  cancelPayment as cancelNupayPayment,
  createPaymentFromSession,
  createSession,
  expireSession,
  getPaymentStatus as getNupayPaymentStatus,
  getRefundStatus,
  getSession,
  isNupayConfigured,
  mapPaymentStatus,
  mapSessionStatus,
  refundPayment as refundNupayPayment,
} from '../payments/nupay.js'

const router = Router()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PAYMENT_SETTING_KEYS = [
  'payment_gateway',
  'payment_nupay_enabled',
  'payment_nupay_fee_percent',
  'payment_admin_pix_key_type',
  'payment_admin_pix_key',
  'payment_admin_bank_name',
  'payment_admin_bank_agency',
  'payment_admin_bank_account',
  'payment_admin_bank_account_type',
]

async function getPaymentSettings() {
  const { data = [] } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .in('setting_key', PAYMENT_SETTING_KEYS)
  return Object.fromEntries(data.map((s) => [s.setting_key, s.setting_value]))
}

function getTouristBaseUrl() {
  return (process.env.TURISTA_URL || 'http://localhost:5173').replace(/\/$/, '')
}

function getApiBaseUrl() {
  return (process.env.API_PUBLIC_URL || '').replace(/\/$/, '')
}

function calcFee(amount, percent) {
  const safePercent = Math.min(100, Math.max(0, Number(percent || 0)))
  return Math.round(Number(amount || 0) * (safePercent / 100) * 100) / 100
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ''))
}

function nupayAvailable(cfg) {
  return cfg.payment_nupay_enabled === 'true' && isNupayConfigured()
}

function assertNupayUrls() {
  const touristUrl = getTouristBaseUrl()
  const apiUrl = getApiBaseUrl()
  if (!touristUrl.startsWith('https://') || !apiUrl.startsWith('https://')) {
    throw new NupayError('NuPay exige TURISTA_URL e API_PUBLIC_URL com HTTPS', {
      status: 503,
      code: 'invalid_public_urls',
    })
  }
  return { touristUrl, apiUrl }
}

async function calculateTrustedAmount({
  service_type,
  service_id,
  booking_mode,
  service_date_iso,
  service_time,
  people_count,
  region_id,
  vehicles,
  coupon_code,
  userId,
}) {
  if (service_type === 'tour' && booking_mode === 'private') {
    const pricing = await calculatePrivateTour({
      regionId: region_id,
      tourId: service_id,
      serviceDate: service_date_iso,
      vehicles: (vehicles || []).map((vehicle) => ({
        vehicleId: vehicle.vehicle_id,
        quantity: Number(vehicle.qty || 1),
      })),
      couponCode: coupon_code,
      userId,
    })
    return Number(pricing.totalAmount)
  }

  if (service_type === 'tour') {
    const pricing = await calculateSharedTour({
      regionId: region_id,
      tourId: service_id,
      serviceDate: service_date_iso,
      peopleCount: Number(people_count),
      couponCode: coupon_code,
      userId,
    })
    return Number(pricing.totalAmount)
  }

  const pricing = await calculateTabbedTransfer({
    regionId: region_id,
    routeId: service_id,
    serviceDate: service_date_iso,
    serviceTime: service_time,
    couponCode: coupon_code,
    userId,
  })
  const vehicleCount = Math.max(
    1,
    (vehicles || []).reduce((total, vehicle) => total + Number(vehicle.qty || 1), 0),
  )
  return Math.round(Number(pricing.totalAmount) * vehicleCount * 100) / 100
}

function sanitizeProviderSnapshot(data = {}) {
  return {
    pspReferenceId: data.pspReferenceId,
    referenceId: data.referenceId,
    status: data.status,
    code: data.code,
    timestamp: data.timestamp,
  }
}

async function updateNupayAttempt(payment, status, providerStatus, failureCode = null) {
  const updates = {
    status,
    provider_status: providerStatus || null,
    failure_code: failureCode,
  }
  await supabase.from('payments').update(updates).eq('id', payment.id)
  return { ...payment, ...updates }
}

async function finalizeNupayPayment(payment, providerPayment) {
  if (providerPayment.referenceId !== payment.id) {
    throw new NupayError('Referência do pagamento NuPay inválida', {
      status: 409,
      code: 'reference_mismatch',
    })
  }

  const providerAmount = Number(providerPayment.amount?.value)
  if (
    providerPayment.amount?.currency !== 'BRL'
    || Math.round(providerAmount * 100) !== Math.round(Number(payment.amount_gross) * 100)
  ) {
    throw new NupayError('Valor confirmado pela NuPay diverge da reserva', {
      status: 409,
      code: 'amount_mismatch',
    })
  }

  const { data: finalized, error } = await supabase.rpc('finalize_nupay_payment', {
    p_payment_id: payment.id,
    p_provider_status: providerPayment.status,
    p_provider_payload: sanitizeProviderSnapshot(providerPayment),
  })
  if (error) throw error

  if (finalized) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', payment.booking_id)
      .single()
    sendConfirmationEmail(booking).catch((emailError) =>
      console.error('[email] confirmação de reserva falhou:', emailError.message))
  }

  return Boolean(finalized)
}

async function completeNupaySession(payment, requestedSessionId) {
  const sessionId = requestedSessionId || payment.provider_session_id
  if (!sessionId || (payment.provider_session_id && sessionId !== payment.provider_session_id)) {
    throw new NupayError('Sessão NuPay inválida', { status: 409, code: 'session_mismatch' })
  }

  const session = await getSession(sessionId)
  if (session.reference !== payment.id || session.id !== sessionId) {
    throw new NupayError('Sessão NuPay não pertence a este pagamento', {
      status: 409,
      code: 'session_mismatch',
    })
  }

  const sessionStatus = mapSessionStatus(session.status)
  const sessionUpdates = {
    provider_session_id: session.id,
    gateway_checkout_url: session.redirectUrl || payment.gateway_checkout_url,
    expires_at: session.expiresAt || payment.expires_at,
  }
  await supabase.from('payments').update(sessionUpdates).eq('id', payment.id)
  if (!payment.gateway_transaction_id) {
    await supabase.from('payments').update({
      provider_status: `SESSION_${String(session.status || 'pending').toUpperCase()}`,
    })
      .eq('id', payment.id)
      .is('gateway_transaction_id', null)
      .neq('provider_status', 'CREATING_PAYMENT')
  }

  if (sessionStatus === 'failed' || sessionStatus === 'expired') {
    return updateNupayAttempt(
      payment,
      sessionStatus === 'expired' ? 'expired' : 'failed',
      `SESSION_${String(session.status).toUpperCase()}`,
      sessionStatus === 'expired' ? 'session_expired' : 'session_canceled',
    )
  }

  let currentPayment = payment

  if (sessionStatus === 'approved' && !payment.gateway_transaction_id) {
    const { data: claimed } = await supabase
      .from('payments')
      .update({ provider_status: 'CREATING_PAYMENT' })
      .eq('id', payment.id)
      .is('gateway_transaction_id', null)
      .neq('provider_status', 'CREATING_PAYMENT')
      .select('*')
      .maybeSingle()

    if (claimed) {
      try {
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', payment.booking_id)
          .single()
        if (bookingError) throw bookingError

        const { data: user, error: userError } = await supabase
          .from('users')
          .select('id, full_name, email, phone, document_type, document_number')
          .eq('id', booking.user_id)
          .single()
        if (userError) throw userError

        const { apiUrl, touristUrl } = assertNupayUrls()
        const providerPayment = await createPaymentFromSession({
          payment: claimed,
          booking,
          user,
          session,
          callbackUrl: `${apiUrl}/api/payments/nupay/payment-webhook`,
          orderUrl: `${touristUrl}/minhas-reservas`,
        })

        if (providerPayment.referenceId !== payment.id) {
          throw new NupayError('Referência retornada pela NuPay é inválida', {
            status: 409,
            code: 'reference_mismatch',
          })
        }

        const { data: updated, error } = await supabase
          .from('payments')
          .update({
            gateway_transaction_id: providerPayment.pspReferenceId,
            provider_status: providerPayment.status,
            raw_response_json: sanitizeProviderSnapshot(providerPayment),
          })
          .eq('id', payment.id)
          .select('*, bookings(booking_code, user_id)')
          .single()
        if (error) throw error
        currentPayment = updated
      } catch (error) {
        await supabase.from('payments').update({
          provider_status: 'SESSION_APPROVED',
          failure_code: error.code || 'payment_creation_failed',
        }).eq('id', payment.id)
        throw error
      }
    } else {
      const { data: refreshed } = await supabase
        .from('payments')
        .select('*, bookings(booking_code, user_id)')
        .eq('id', payment.id)
        .single()
      currentPayment = refreshed || payment
    }
  }

  if (!currentPayment.gateway_transaction_id) {
    return { ...currentPayment, status: 'pending' }
  }

  const providerPayment = await getNupayPaymentStatus(currentPayment.gateway_transaction_id)
  const mappedStatus = mapPaymentStatus(providerPayment)

  if (mappedStatus === 'approved') {
    await finalizeNupayPayment(currentPayment, providerPayment)
    return { ...currentPayment, status: 'approved', provider_status: providerPayment.status }
  }
  if (mappedStatus === 'failed' || mappedStatus === 'expired') {
    return updateNupayAttempt(
      currentPayment,
      mappedStatus,
      providerPayment.status,
      providerPayment.code || mappedStatus,
    )
  }

  await supabase.from('payments').update({
    provider_status: providerPayment.status,
    failure_code: providerPayment.code || null,
    raw_response_json: sanitizeProviderSnapshot(providerPayment),
  }).eq('id', payment.id)
  return { ...currentPayment, status: 'pending', provider_status: providerPayment.status }
}

async function finalizeNupayRefund(payment, refund) {
  const { data: finalized, error } = await supabase.rpc('finalize_nupay_refund', {
    p_payment_id: payment.id,
    p_refund_id: refund.refundId,
    p_provider_status: refund.status,
  })
  if (error) throw error
  return Boolean(finalized)
}

function parseRawJson(body) {
  if (!Buffer.isBuffer(body)) return body || {}
  try {
    return JSON.parse(body.toString('utf8'))
  } catch {
    throw new NupayError('JSON inválido', { status: 400, code: 'invalid_json' })
  }
}

async function insertNupayEvent(paymentId, eventId, eventName, payload) {
  const { error } = await supabase.from('payment_events').insert({
    payment_id: paymentId,
    gateway_name: 'nupay',
    gateway_event_id: eventId,
    event_name: eventName,
    event_payload_json: payload,
    processing_status: 'completed',
    processed_at: new Date().toISOString(),
  })
  if (error?.code === '23505') return false
  if (error) throw error
  return true
}

function nupayIntentResponse(payment) {
  return {
    booking_id: payment.booking_id,
    booking_code: payment.bookings?.booking_code,
    payment_id: payment.id,
    amount: Number(payment.amount_gross),
    expires_at: payment.expires_at,
    provider: 'nupay',
    payment_method: 'nupay',
    status: payment.status,
    payment_url: payment.gateway_checkout_url,
    manual_mode: false,
  }
}

// ── POST /api/payments/intent ───────────────────────────
router.post('/intent', authenticate, async (req, res, next) => {
  try {
    const {
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles = [],
      origin_text, destination_text,
      total_price, payment_method = 'pix',
      service_name, cover_image_url,
      coupon_code, existing_booking_id,
    } = req.body

    if (!existing_booking_id && (!service_id || !service_date_iso || !total_price)) {
      return res.status(400).json({ error: 'Dados incompletos para criar reserva' })
    }

    // ── 1. Lê configurações do gateway ─────────────────
    const cfg     = await getPaymentSettings()
    const gateway = payment_method === 'nupay' ? 'nupay' : (cfg.payment_gateway || 'manual')
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim()

    if (gateway === 'nupay') {
      if (!nupayAvailable(cfg)) {
        return res.status(503).json({ error: 'NuPay indisponível no momento' })
      }
      assertNupayUrls()
      if (!/^[A-Za-z0-9:_-]{16,200}$/.test(idempotencyKey)) {
        return res.status(400).json({ error: 'Idempotency-Key inválida ou ausente' })
      }

      const { data: repeated } = await supabase
        .from('payments')
        .select('*, bookings(booking_code, user_id)')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (repeated) {
        if (repeated.bookings?.user_id !== req.user.id) {
          return res.status(409).json({ error: 'Idempotency-Key já utilizada' })
        }
        return res.json(nupayIntentResponse(repeated))
      }
    }

    let booking, bookingCode
    let trustedAmount = Number(total_price)

    if (existing_booking_id) {
      // ── Reutiliza reserva existente ────────────────────
      const { data: existing, error: eErr } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', existing_booking_id)
        .eq('user_id', req.user.id)
        .eq('status_commercial', 'awaiting_payment')
        .single()

      if (eErr || !existing) {
        return res.status(404).json({ error: 'Reserva não encontrada ou já processada' })
      }

      booking     = existing
      bookingCode = existing.booking_code
      trustedAmount = Number(existing.total_amount)
    } else {
      if (gateway === 'nupay') {
        trustedAmount = await calculateTrustedAmount({
          service_type,
          service_id,
          booking_mode,
          service_date_iso,
          service_time,
          people_count,
          region_id,
          vehicles,
          coupon_code,
          userId: req.user.id,
        })
      }

      if (!(trustedAmount > 0)) {
        return res.status(400).json({ error: 'Valor da reserva inválido' })
      }

      // ── 2. Gera código da reserva ──────────────────────
      bookingCode = `GJ${Date.now().toString(36).toUpperCase().slice(-6)}`

      // ── 3. Cria a reserva ──────────────────────────────
      const { data: newBooking, error: bErr } = await supabase
        .from('bookings')
        .insert({
          booking_code:        bookingCode,
          user_id:             req.user.id,
          region_id:           region_id || null,
          service_type,
          service_id,
          booking_mode:        booking_mode || 'private',
          service_date:        service_date_iso,
          service_time:        service_time || null,
          people_count:        Number(people_count) || 1,
          origin_text:         origin_text || null,
          destination_text:    destination_text || null,
          total_amount:        trustedAmount,
          status_commercial:   'awaiting_payment',
          status_operational:  'new',
          payment_status:      'pending',
        })
        .select()
        .single()

      if (bErr) throw bErr
      booking = newBooking

      // ── 4. Insere veículos da reserva ──────────────────
      if (vehicles.length > 0) {
        const vRows = vehicles.map((v) => ({
          booking_id:  booking.id,
          vehicle_id:  v.vehicle_id,
          quantity:    v.qty || 1,
          unit_price:  gateway === 'nupay' ? 0 : (v.unit_price || 0),
        }))
        await supabase.from('booking_vehicles').insert(vRows)
      }
    }

    // ── 5. Processa pagamento conforme gateway ─────────
    let gatewayTransactionId = null
    let expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    let pixCode   = null
    let qrBase64  = null
    let redirectUrl = null

    if (gateway === 'nupay') {
      const gatewayFeeAmount = calcFee(trustedAmount, cfg.payment_nupay_fee_percent)
      const { data: payment, error: pErr } = await supabase
        .from('payments')
        .insert({
          booking_id:             booking.id,
          gateway_name:           'nupay',
          gateway_transaction_id: null,
          payment_method:         'nupay',
          payment_type:           'full',
          amount_gross:           trustedAmount,
          gateway_fee_amount:     gatewayFeeAmount,
          currency:               'BRL',
          status:                 'pending',
          expires_at:             expiresAt,
          provider_status:        'CREATING_SESSION',
          idempotency_key:        idempotencyKey,
        })
        .select('*, bookings(booking_code, user_id)')
        .single()

      if (pErr?.code === '23505') {
        const { data: repeated } = await supabase
          .from('payments')
          .select('*, bookings!inner(booking_code, user_id)')
          .eq('idempotency_key', idempotencyKey)
          .eq('bookings.user_id', req.user.id)
          .maybeSingle()
        if (repeated) return res.json(nupayIntentResponse(repeated))
        return res.status(409).json({ error: 'Já existe uma tentativa NuPay pendente para esta reserva' })
      }
      if (pErr) throw pErr

      const userInfo = await supabase
        .from('users')
        .select('id, full_name, email, phone, document_type, document_number')
        .eq('id', req.user.id)
        .single()
      const { touristUrl, apiUrl } = assertNupayUrls()

      let session
      try {
        session = await createSession({
          payment,
          booking,
          user: userInfo.data,
          returnUrl: `${touristUrl}/checkout/processando?nupay_payment_id=${encodeURIComponent(payment.id)}`,
          callbackUrl: `${apiUrl}/api/payments/nupay/webhook`,
          serviceName: service_name,
        })
      } catch (error) {
        await supabase.from('payments').update({
          status: 'failed',
          provider_status: error.code === 'shopper_ineligible' ? 'SESSION_INELIGIBLE' : 'SESSION_ERROR',
          failure_code: error.code || 'session_creation_failed',
        }).eq('id', payment.id)
        if (error.code === 'shopper_ineligible') {
          return res.status(422).json({
            error: 'NuPay não está disponível para este pagamento. Escolha PIX.',
            code: 'nupay_ineligible',
            booking_id: booking.id,
            booking_code: booking.booking_code,
            payment_id: payment.id,
          })
        }
        throw error
      }

      const { data: updatedPayment, error: uErr } = await supabase
        .from('payments')
        .update({
          provider_session_id: session.id,
          provider_status: `SESSION_${String(session.status || 'pending').toUpperCase()}`,
          gateway_checkout_url: session.redirectUrl,
          expires_at: session.expiresAt,
          raw_response_json: {
            sessionId: session.id,
            reference: session.reference,
            status: session.status,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
          },
        })
        .eq('id', payment.id)
        .select('*, bookings(booking_code, user_id)')
        .single()

      if (uErr) throw uErr
      return res.json(nupayIntentResponse(updatedPayment))
    }

    if (gateway === 'test') {
      const { createPaymentIntent: testIntent } = await import('../payments/test.js')
      const d = await testIntent({ amount: Number(total_price), description: service_name || `Reserva ${bookingCode}` })
      gatewayTransactionId = d.transaction_id
      expiresAt            = d.expires_at
      pixCode              = d.pix_code
      qrBase64             = d.qr_base64
    } else if (gateway === 'mercado_pago') {
      // Import dinâmico para não quebrar quando não configurado
      try {
        const { createPixPayment } = await import('../services/mercadoPago.js')
        const userInfo = await supabase.from('users').select('full_name, email').eq('id', req.user.id).single()
        const pixData  = await createPixPayment({
          amount:      Number(total_price),
          description: service_name || `Reserva ${bookingCode}`,
          payerEmail:  userInfo.data?.email,
          payerName:   userInfo.data?.full_name,
          externalRef: booking.id,
        })
        gatewayTransactionId = pixData.mp_id
        expiresAt            = pixData.expires_at || expiresAt
        pixCode              = pixData.pix_code
        qrBase64             = pixData.qr_base64
      } catch (mpErr) {
        console.error('Mercado Pago error — falling back to manual:', mpErr.message)
      }
    }
    // asaas / pagarme: adapters a implementar quando credentials disponíveis

    // ── 6. Registra pagamento ──────────────────────────
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .insert({
        booking_id:             booking.id,
        gateway_name:           gateway,
        gateway_transaction_id: gatewayTransactionId,
        payment_method,
        payment_type:           'full',
        amount_gross:           Number(total_price),
        gateway_fee_amount:     0,
        currency:               'BRL',
        status:                 'pending',
        expires_at:             expiresAt,
      })
      .select()
      .single()

    if (pErr) throw pErr

    const manual    = gateway === 'manual' || !gatewayTransactionId
    const test_mode = gateway === 'test'

    res.json({
      booking_id:   booking.id,
      booking_code: bookingCode,
      payment_id:   payment.id,
      amount:       Number(total_price),
      expires_at:   payment.expires_at,
      // gateway-generated PIX (null when manual)
      pix_code:     pixCode,
      qr_base64:    qrBase64,
      test_mode,
      // manual payment: show platform's PIX/bank info
      manual_mode:      manual,
      pix_key_type:     manual ? (cfg.payment_admin_pix_key_type || null) : null,
      pix_key:          manual ? (cfg.payment_admin_pix_key      || null) : null,
      bank_name:        manual ? (cfg.payment_admin_bank_name    || null) : null,
      bank_agency:      manual ? (cfg.payment_admin_bank_agency  || null) : null,
      bank_account:     manual ? (cfg.payment_admin_bank_account || null) : null,
      bank_account_type:manual ? (cfg.payment_admin_bank_account_type || null) : null,
    })
  } catch (err) { next(err) }
})

// ── POST /api/payments/nupay/complete ──────────────────
// O navegador informa somente os IDs; aprovação e valores vêm da consulta autenticada.
router.post('/nupay/complete', authenticate, async (req, res, next) => {
  try {
    const paymentId = String(req.body?.payment_id || '')
    const sessionId = String(req.body?.session_id || '')
    if (!isUuid(paymentId) || !sessionId) {
      return res.status(400).json({ error: 'Pagamento e sessão são obrigatórios' })
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings!inner(booking_code, user_id)')
      .eq('id', paymentId)
      .eq('gateway_name', 'nupay')
      .eq('bookings.user_id', req.user.id)
      .maybeSingle()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })

    const updated = await completeNupaySession(payment, sessionId)
    res.json({
      payment_id: payment.id,
      booking_id: payment.booking_id,
      booking_code: payment.bookings?.booking_code,
      amount: Number(payment.amount_gross),
      status: updated.status,
      expires_at: updated.expires_at || payment.expires_at,
    })
  } catch (err) { next(err) }
})

// ── POST /api/payments/:id/cancel ──────────────────────
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Pagamento inválido' })
    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings!inner(booking_code, user_id)')
      .eq('id', req.params.id)
      .eq('gateway_name', 'nupay')
      .eq('bookings.user_id', req.user.id)
      .maybeSingle()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })
    if (payment.status !== 'pending') {
      return res.status(409).json({ error: 'Este pagamento não pode mais ser cancelado' })
    }

    if (payment.gateway_transaction_id) {
      await cancelNupayPayment(payment.gateway_transaction_id)
    } else if (payment.provider_session_id) {
      await expireSession(payment.provider_session_id)
    }

    await supabase.from('payments').update({
      status: 'failed',
      provider_status: 'CANCELLED_BY_SHOPPER',
      failure_code: 'shopper_cancelled',
    }).eq('id', payment.id).eq('status', 'pending')

    res.json({
      ok: true,
      status: 'failed',
      booking_id: payment.booking_id,
      booking_code: payment.bookings?.booking_code,
    })
  } catch (err) { next(err) }
})

// ── POST /api/payments/:id/refund ──────────────────────
router.post('/:id/refund', authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Pagamento inválido' })
    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings(booking_code)')
      .eq('id', req.params.id)
      .eq('gateway_name', 'nupay')
      .maybeSingle()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })
    if (payment.status !== 'approved' || !payment.gateway_transaction_id) {
      return res.status(409).json({ error: 'Somente pagamentos NuPay aprovados podem ser estornados' })
    }

    const amount = Number(req.body?.amount ?? payment.amount_gross)
    if (Math.round(amount * 100) !== Math.round(Number(payment.amount_gross) * 100)) {
      return res.status(400).json({ error: 'O primeiro release aceita apenas estorno integral' })
    }

    const refund = await refundNupayPayment(
      payment.gateway_transaction_id,
      amount,
      {},
      `Estorno da reserva ${payment.bookings?.booking_code || payment.booking_id}`,
    )
    await insertNupayEvent(
      payment.id,
      `nupay-refund-request:${refund.refundId}`,
      'nupay.refund.requested',
      {
        refundId: refund.refundId,
        pspReferenceId: refund.pspReferenceId,
        status: refund.status,
      },
    )
    if (String(refund.status || '').toUpperCase() === 'REFUNDED') {
      await finalizeNupayRefund(payment, refund)
    }

    res.status(202).json({
      ok: true,
      refund_id: refund.refundId,
      status: refund.status,
    })
  } catch (err) { next(err) }
})

// ── GET /api/payments/:id/status ───────────────────────
// Polling: retorna status do pagamento
router.get('/:id/status', authenticate, async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Pagamento inválido' })
    const { data: payment } = await supabase
      .from('payments')
      .select(`
        id, status, booking_id, gateway_name, gateway_transaction_id,
        gateway_checkout_url, provider_session_id, provider_status,
        amount_gross, gateway_fee_amount, expires_at,
        bookings!inner(booking_code, status_commercial, user_id)
      `)
      .eq('id', req.params.id)
      .eq('bookings.user_id', req.user.id)
      .maybeSingle()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })

    // Gateway de teste: aprova na primeira consulta de status
    if (payment.status === 'pending' && payment.gateway_name === 'test') {
      await onPaymentApproved(payment)
      return res.json({ status: 'approved', booking_id: payment.booking_id, booking_code: payment.bookings?.booking_code })
    }

    if (payment.status === 'pending' && payment.gateway_name === 'nupay') {
      const updated = await completeNupaySession(payment)
      return res.json({
        status: updated.status,
        booking_id: payment.booking_id,
        booking_code: payment.bookings?.booking_code,
        amount: Number(payment.amount_gross),
        payment_url: updated.gateway_checkout_url || payment.gateway_checkout_url,
        expires_at: updated.expires_at || payment.expires_at,
      })
    }

    // Verifica se expirou
    if (payment.status === 'pending' && payment.expires_at && new Date(payment.expires_at) < new Date()) {
      await supabase.from('payments').update({ status: 'expired' }).eq('id', payment.id)
      return res.json({ status: 'expired', booking_id: payment.booking_id })
    }

    // Se MP ativo e pendente, consulta gateway em tempo real
    if (payment.status === 'pending' && payment.gateway_name === 'mercado_pago' && payment.gateway_transaction_id && !payment.gateway_transaction_id.startsWith('TEST-')) {
      try {
        const { getMpPaymentStatus } = await import('../services/mercadoPago.js')
        const mpStatus = await getMpPaymentStatus(payment.gateway_transaction_id)
        if (mpStatus === 'approved') {
          await onPaymentApproved(payment)
          return res.json({ status: 'approved', booking_id: payment.booking_id, booking_code: payment.bookings?.booking_code })
        }
      } catch { /* ignora erros de rede no polling */ }
    }

    res.json({
      status:       payment.status,
      booking_id:   payment.booking_id,
      booking_code: payment.bookings?.booking_code,
      redirect_url: payment.gateway_checkout_url,
    })
  } catch (err) { next(err) }
})

// ── Verificação de assinatura do Mercado Pago ─────────
// Header x-signature: "ts=...,v1=<hmac>". Manifest:
//   id:[data.id];request-id:[x-request-id];ts:[ts];
// Sem MERCADO_PAGO_WEBHOOK_SECRET configurado, apenas loga aviso
// (não bloqueia) para não quebrar ambientes ainda sem a chave.
function verifyMpSignature(req, dataId) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[webhook] MERCADO_PAGO_WEBHOOK_SECRET ausente — assinatura NÃO verificada')
    return true
  }
  const sig = req.headers['x-signature']
  if (!sig) return false

  const parts = Object.fromEntries(
    sig.split(',').map((p) => p.trim().split('=').map((s) => s.trim()))
  )
  if (!parts.ts || !parts.v1) return false

  const requestId = req.headers['x-request-id'] || ''
  const manifest  = `id:${String(dataId || '').toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const expected  = crypto.createHmac('sha256', secret).update(manifest).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
  } catch {
    return false
  }
}

// ── POST /api/payments/webhook ─────────────────────────
// Recebe eventos do Mercado Pago.
// O body chega como Buffer bruto (express.raw no index.js) para
// permitir a verificação de assinatura — parseia aqui.
router.post('/webhook', async (req, res, next) => {
  try {
    let event = req.body
    if (Buffer.isBuffer(event)) {
      try { event = JSON.parse(event.toString('utf8')) }
      catch { return res.status(400).json({ error: 'JSON inválido' }) }
    }

    const eventType = event.type || event.action || 'unknown'
    // MP manda data.id no body e também na query string da URL
    const gatewayId = (req.query['data.id'] || event.data?.id)?.toString()

    if (!verifyMpSignature(req, gatewayId)) {
      console.warn('[webhook] assinatura inválida — evento descartado')
      return res.status(401).json({ error: 'Assinatura inválida' })
    }

    // Registra evento bruto
    await supabase.from('payment_events').insert({
      event_name:         eventType,
      event_payload_json: event,
      processing_status:  'pending',
    }).select().single().catch(() => {})

    if ((eventType === 'payment' || eventType === 'payment.updated') && gatewayId) {
      const { data: payment } = await supabase
        .from('payments')
        .select('*, bookings(*)')
        .eq('gateway_transaction_id', gatewayId)
        .single()

      if (payment) {
        const mpStatus = event.data?.status || event.status
        if (mpStatus === 'approved' && payment.status !== 'approved') {
          await onPaymentApproved(payment)
        } else if (['rejected', 'cancelled'].includes(mpStatus)) {
          await supabase.from('payments').update({ status: 'failed' }).eq('id', payment.id)
          await supabase.from('bookings').update({ status_commercial: 'payment_failed', payment_status: 'failed' }).eq('id', payment.booking_id)
        }
      }
    }

    res.status(200).json({ ok: true })
  } catch (err) { next(err) }
})

// ── POST /api/payments/nupay/webhook ───────────────────
// A notificação de sessão é apenas um gatilho. O estado real sempre é consultado.
router.post('/nupay/webhook', async (req, res, next) => {
  try {
    const event = parseRawJson(req.body)
    const sessionId = String(event.sessionId || '')
    const reference = String(event.reference || '')
    if (!sessionId || !isUuid(reference)) {
      return res.status(202).json({ ok: true, ignored: 'missing_ids' })
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings(booking_code, user_id)')
      .eq('id', reference)
      .eq('gateway_name', 'nupay')
      .eq('provider_session_id', sessionId)
      .maybeSingle()
    if (!payment) return res.status(202).json({ ok: true, ignored: 'payment_not_found' })

    const updated = await completeNupaySession(payment, sessionId)
    const providerStatus = updated.provider_status || updated.status
    const inserted = await insertNupayEvent(
      payment.id,
      `nupay-session:${sessionId}:${providerStatus}`,
      'nupay.session.updated',
      { sessionId, reference, providerStatus },
    )

    res.status(200).json({ ok: true, duplicate: !inserted })
  } catch (err) { next(err) }
})

// ── POST /api/payments/nupay/payment-webhook ───────────
router.post('/nupay/payment-webhook', async (req, res, next) => {
  try {
    const event = parseRawJson(req.body)
    const transactionId = String(event.pspReferenceId || '')
    const referenceId = String(event.referenceId || '')
    if (!transactionId || !isUuid(referenceId)) {
      return res.status(202).json({ ok: true, ignored: 'missing_ids' })
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings(booking_code, user_id)')
      .eq('id', referenceId)
      .eq('gateway_name', 'nupay')
      .eq('gateway_transaction_id', transactionId)
      .maybeSingle()
    if (!payment) return res.status(202).json({ ok: true, ignored: 'payment_not_found' })

    const providerPayment = await getNupayPaymentStatus(transactionId)
    if (providerPayment.referenceId !== payment.id) {
      throw new NupayError('Referência NuPay inválida', { status: 409, code: 'reference_mismatch' })
    }

    const mappedStatus = mapPaymentStatus(providerPayment)
    if (mappedStatus === 'approved') {
      await finalizeNupayPayment(payment, providerPayment)
    } else if (mappedStatus === 'failed' || mappedStatus === 'expired') {
      await updateNupayAttempt(
        payment,
        mappedStatus,
        providerPayment.status,
        providerPayment.code || mappedStatus,
      )
    } else {
      await supabase.from('payments').update({
        provider_status: providerPayment.status,
        raw_response_json: sanitizeProviderSnapshot(providerPayment),
      }).eq('id', payment.id)
    }

    const inserted = await insertNupayEvent(
      payment.id,
      `nupay-payment:${transactionId}:${providerPayment.status}:${providerPayment.code || 'none'}`,
      'nupay.payment.updated',
      sanitizeProviderSnapshot(providerPayment),
    )
    res.status(200).json({ ok: true, duplicate: !inserted })
  } catch (err) { next(err) }
})

// ── POST /api/payments/nupay/payment-webhook/refunds ───
router.post('/nupay/payment-webhook/refunds', async (req, res, next) => {
  try {
    const event = parseRawJson(req.body)
    const transactionId = String(event.pspReferenceId || '')
    const refundId = String(event.refundId || '')
    if (!transactionId || !refundId) {
      return res.status(202).json({ ok: true, ignored: 'missing_ids' })
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings(booking_code)')
      .eq('gateway_name', 'nupay')
      .eq('gateway_transaction_id', transactionId)
      .maybeSingle()
    if (!payment) return res.status(202).json({ ok: true, ignored: 'payment_not_found' })

    const refund = await getRefundStatus(transactionId, refundId)
    if (String(refund.status || '').toUpperCase() === 'REFUNDED') {
      await finalizeNupayRefund(payment, refund)
    }

    const inserted = await insertNupayEvent(
      payment.id,
      `nupay-refund:${transactionId}:${refundId}:${refund.status}`,
      'nupay.refund.updated',
      {
        refundId: refund.refundId,
        pspReferenceId: refund.pspReferenceId,
        status: refund.status,
        error: refund.error,
      },
    )
    res.status(200).json({ ok: true, duplicate: !inserted })
  } catch (err) { next(err) }
})

// ── POST /api/payments/:id/simulate ───────────────────
// Confirma pagamento automaticamente (somente gateway manual/sem chave PIX)
router.post('/:id/simulate', authenticate, async (req, res, next) => {
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select('*, bookings(user_id, booking_code, status_commercial)')
      .eq('id', req.params.id)
      .single()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })

    // Só funciona quando gateway é manual (sem integração real)
    if (payment.gateway_name !== 'manual') {
      return res.status(403).json({ error: 'Simulação disponível apenas no modo manual' })
    }

    // O pagamento deve pertencer ao usuário logado
    if (payment.bookings?.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    if (payment.status === 'approved') {
      return res.json({ ok: true, already: true })
    }

    await onPaymentApproved(payment)
    res.json({ ok: true, booking_code: payment.bookings?.booking_code })
  } catch (err) { next(err) }
})

// ── POST /api/payments/manual-confirm ─────────────────
// Admin confirma pagamento manualmente (dinheiro/transferência)
router.post('/manual-confirm', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'admin' && req.user.user_type !== 'operator') {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    const { booking_id, notes } = req.body
    if (!booking_id) return res.status(400).json({ error: 'booking_id obrigatório' })

    // Busca ou cria registro de pagamento
    let { data: payment } = await supabase.from('payments').select('*').eq('booking_id', booking_id).single()

    if (!payment) {
      const { data: booking } = await supabase.from('bookings').select('total_amount').eq('id', booking_id).single()
      const { data: p } = await supabase.from('payments').insert({
        booking_id, gateway_name: 'manual', payment_method: 'cash',
        payment_type: 'full', amount_gross: booking?.total_amount || 0,
        gateway_fee_amount: 0, currency: 'BRL', status: 'pending',
      }).select().single()
      payment = p
    }

    await onPaymentApproved({ ...payment, bookings: null })
    if (notes) await supabase.from('bookings').update({ notes }).eq('id', booking_id)

    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Helpers ────────────────────────────────────────────
async function onPaymentApproved(payment) {
  await supabase.from('payments').update({ status: 'approved', paid_at: new Date().toISOString() }).eq('id', payment.id)
  await supabase.from('bookings').update({
    status_commercial:  'paid',
    status_operational: 'awaiting_dispatch',
    payment_status:     'approved',
  }).eq('id', payment.booking_id)

  const booking = payment.bookings || (await supabase.from('bookings').select('*').eq('id', payment.booking_id).single()).data

  // If this booking came from a custom transfer quote, mark the quote as paid
  if (booking?.service_type === 'transfer' && booking?.service_id) {
    await supabase.from('transfer_quotes')
      .update({ status: 'paid' })
      .eq('id', booking.service_id)
      .eq('status', 'accepted')
      .catch(() => {}) // no-op if service_id is a route id (not a quote)
  }

  const gatewayFee = Math.round(Number(payment.gateway_fee_amount || 0) * 100) / 100
  const gross      = Number(payment.amount_gross || 0)

  await supabase.from('financial_ledger').insert([
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_gross', description: `Receita bruta — ${booking?.booking_code}`, amount: gross, direction: 'inflow', financial_status: 'pending' },
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'gateway_fee',   description: `Taxa gateway — ${booking?.booking_code}`,   amount: gatewayFee,           direction: 'outflow', financial_status: 'pending' },
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_net',   description: `Receita líquida — ${booking?.booking_code}`, amount: gross - gatewayFee, direction: 'inflow', financial_status: 'pending' },
  ])

  // E-mail de confirmação — nunca pode quebrar o fluxo de pagamento
  sendConfirmationEmail(booking).catch((err) =>
    console.error('[email] confirmação de reserva falhou:', err.message))
}

async function sendConfirmationEmail(booking) {
  if (!booking?.user_id) return

  const { data: user } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', booking.user_id)
    .single()
  if (!user?.email) return

  let serviceName = null
  if (booking.service_type === 'tour' && booking.service_id) {
    const { data: tour } = await supabase
      .from('tours').select('name').eq('id', booking.service_id).maybeSingle()
    serviceName = tour?.name || 'Passeio'
  } else if (booking.service_type === 'transfer') {
    serviceName = [booking.origin_text, booking.destination_text]
      .filter(Boolean).join(' → ') || 'Transfer'
  }

  await sendBookingConfirmation({
    to:          user.email,
    name:        user.full_name?.split(' ')[0],
    bookingCode: booking.booking_code,
    serviceName,
    serviceDate: booking.service_date,
    serviceTime: booking.service_time,
    peopleCount: booking.people_count,
    totalAmount: booking.total_amount,
  })
}

export default router
