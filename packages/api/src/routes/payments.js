import { Router }    from 'express'
import { supabase }  from '../supabase.js'
import { authenticate } from '../middleware/auth.js'

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
    const {
      service_type, service_id, booking_mode,
      service_date, service_date_iso, service_time,
      people_count, region_id, vehicles = [],
      origin_text, destination_text,
      total_price, payment_method = 'pix',
      service_name, cover_image_url,
      coupon_code,
    } = req.body

    if (!service_id || !service_date_iso || !total_price) {
      return res.status(400).json({ error: 'Dados incompletos para criar reserva' })
    }

    // ── 1. Lê configurações do gateway ─────────────────
    const cfg     = await getPaymentSettings()
    const gateway = cfg.payment_gateway || 'manual'

    // ── 2. Gera código da reserva ──────────────────────
    const bookingCode = `GJ${Date.now().toString(36).toUpperCase().slice(-6)}`

    // ── 3. Cria a reserva ──────────────────────────────
    const { data: booking, error: bErr } = await supabase
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
        status_operational:  'not_started',
        payment_status:      'pending',
        notes:               null,
      })
      .select()
      .single()

    if (bErr) throw bErr

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

    // Gateway de teste: auto-aprova após 15 segundos
    if (payment.status === 'pending' && payment.gateway_name === 'test' && payment.gateway_transaction_id?.startsWith('TEST-')) {
      const createdMs = parseInt(payment.gateway_transaction_id.replace('TEST-', ''), 10)
      if (!isNaN(createdMs) && (Date.now() - createdMs) >= 15000) {
        await onPaymentApproved(payment)
        return res.json({ status: 'approved', booking_id: payment.booking_id, booking_code: payment.bookings?.booking_code })
      }
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

// ── POST /api/payments/webhook ─────────────────────────
// Recebe eventos do Mercado Pago
router.post('/webhook', async (req, res, next) => {
  try {
    const event      = req.body
    const eventType  = event.type || event.action || 'unknown'
    const gatewayId  = event.data?.id?.toString()

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

  const gatewayFee    = Math.round(payment.amount_gross * 0.035 * 100) / 100
  const platformFee   = Math.round(payment.amount_gross * 0.07  * 100) / 100

  await supabase.from('financial_ledger').insert([
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_gross', description: `Receita bruta — ${booking?.booking_code}`, amount: payment.amount_gross, direction: 'inflow', financial_status: 'pending' },
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'gateway_fee',   description: `Taxa gateway — ${booking?.booking_code}`,   amount: gatewayFee,           direction: 'outflow', financial_status: 'pending' },
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_net',   description: `Receita líquida — ${booking?.booking_code}`, amount: payment.amount_gross - gatewayFee, direction: 'inflow', financial_status: 'pending' },
  ])
}

export default router
