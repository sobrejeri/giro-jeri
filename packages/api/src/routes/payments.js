import { Router }    from 'express'
import crypto        from 'node:crypto'
import { z }         from 'zod'
import { supabase }  from '../supabase.js'
import { authenticate } from '../middleware/auth.js'
import { sendBookingConfirmation } from '../services/email.js'

const intentSchema = z.object({
  service_type:        z.enum(['tour', 'transfer']),
  service_id:          z.string().uuid(),
  service_date_iso:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  total_price:         z.number({ coerce: true }).positive().min(5, 'Valor mínimo R$ 5,00'),
  payment_method:      z.enum(['pix', 'credit_card', 'debit_card']).default('pix'),
  existing_booking_id: z.string().uuid().optional(),
  booking_mode:        z.enum(['private', 'shared']).optional(),
  service_date:        z.string().optional(),
  service_time:        z.string().optional(),
  people_count:        z.number({ coerce: true }).int().min(1).max(200).optional(),
  region_id:           z.string().uuid().optional(),
  vehicles:            z.array(z.object({
    vehicle_id: z.string().uuid(),
    qty:        z.number({ coerce: true }).int().min(1),
    unit_price: z.number({ coerce: true }).nonnegative(),
  })).optional(),
  origin_text:      z.string().max(500).optional(),
  destination_text: z.string().max(500).optional(),
  service_name:     z.string().max(300).optional(),
  cover_image_url:  z.string().url().optional().or(z.literal('')),
  coupon_code:      z.string().max(50).optional(),
}).refine(
  (d) => d.existing_booking_id || (d.service_id && d.service_date_iso && d.total_price),
  { message: 'Dados incompletos para criar reserva' },
)

const router = Router()

async function getPaymentSettings() {
  const { data = [] } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .like('setting_key', 'payment_%')
  return Object.fromEntries(data.map((s) => [s.setting_key, s.setting_value]))
}

// ── POST /api/payments/intent ───────────────────────────
router.post('/intent', authenticate, async (req, res, next) => {
  try {
    const parsed = intentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' })
    }

    const {
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles = [],
      origin_text, destination_text,
      total_price, payment_method = 'pix',
      service_name, cover_image_url,
      coupon_code, existing_booking_id,
    } = parsed.data

    // ── 1. Lê configurações do gateway ─────────────────
    const cfg     = await getPaymentSettings()
    const gateway = cfg.payment_gateway || 'manual'

    let booking, bookingCode

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
    } else {
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
          total_amount:        Number(total_price),
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
          unit_price:  v.unit_price || 0,
        }))
        await supabase.from('booking_vehicles').insert(vRows)
      }
    }

    // ── 5. Processa pagamento conforme gateway ─────────
    let gatewayTransactionId = null
    let expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    let pixCode   = null
    let qrBase64  = null

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

// ── GET /api/payments/:id/status ───────────────────────
// Polling: retorna status do pagamento
router.get('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select('id, status, booking_id, gateway_name, gateway_transaction_id, expires_at, bookings(booking_code, status_commercial)')
      .eq('id', req.params.id)
      .single()

    if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado' })

    // Gateway de teste: aprova na primeira consulta de status
    if (payment.status === 'pending' && payment.gateway_name === 'test') {
      await onPaymentApproved(payment)
      return res.json({ status: 'approved', booking_id: payment.booking_id, booking_code: payment.bookings?.booking_code })
    }

    // Verifica se expirou
    if (payment.status === 'pending' && payment.expires_at && new Date(payment.expires_at) < new Date()) {
      await supabase.from('payments').update({ status: 'expired' }).eq('id', payment.id)
      await supabase.from('bookings').update({ status_commercial: 'expired', payment_status: 'expired' }).eq('id', payment.booking_id)
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

    // Busca o pagamento pelo gatewayId para associar o evento
    let paymentForEvent = null
    if (gatewayId) {
      const { data: p } = await supabase
        .from('payments')
        .select('*, bookings(*)')
        .eq('gateway_transaction_id', gatewayId)
        .single()
      paymentForEvent = p
    }

    // Registra evento bruto com payment_id para idempotência via UNIQUE constraint
    await supabase.from('payment_events').insert({
      payment_id:         paymentForEvent?.id || null,
      event_name:         eventType,
      event_payload_json: event,
      processing_status:  'pending',
    }).catch(() => {}) // UNIQUE(payment_id, event_name, received_at) impede duplicatas

    if ((eventType === 'payment' || eventType === 'payment.updated') && paymentForEvent) {
      const mpStatus = event.data?.status || event.status
      if (mpStatus === 'approved' && paymentForEvent.status !== 'approved') {
        await onPaymentApproved(paymentForEvent)
      } else if (['rejected', 'cancelled'].includes(mpStatus)) {
        await supabase.from('payments').update({ status: 'failed' }).eq('id', paymentForEvent.id)
        await supabase.from('bookings').update({ status_commercial: 'payment_failed', payment_status: 'failed' }).eq('id', paymentForEvent.booking_id)
      }
    }

    res.status(200).json({ ok: true })
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

  // Cria lançamentos no ledger apenas uma vez — ledger_created evita duplicação
  // quando webhook e polling aprovam o mesmo pagamento quase simultaneamente.
  const { data: freshPayment } = await supabase
    .from('payments')
    .select('ledger_created, amount_gross')
    .eq('id', payment.id)
    .single()

  if (!freshPayment?.ledger_created) {
    const amount     = freshPayment?.amount_gross ?? payment.amount_gross
    const gatewayFee = Math.round(amount * 0.035 * 100) / 100

    await supabase.from('financial_ledger').insert([
      { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_gross', description: `Receita bruta — ${booking?.booking_code}`,  amount,                direction: 'inflow',  financial_status: 'pending' },
      { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'gateway_fee',   description: `Taxa gateway — ${booking?.booking_code}`,    amount: gatewayFee,    direction: 'outflow', financial_status: 'pending' },
      { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_net',   description: `Receita líquida — ${booking?.booking_code}`, amount: amount - gatewayFee, direction: 'inflow',  financial_status: 'pending' },
    ])

    await supabase.from('payments').update({ ledger_created: true }).eq('id', payment.id)
  }

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
