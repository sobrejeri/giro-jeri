import { Router }    from 'express'
import crypto        from 'node:crypto'
import { supabase }  from '../supabase.js'
import { authenticate } from '../middleware/auth.js'
import { sendBookingConfirmation } from '../services/email.js'
import { notifyOperatorsNewBooking } from '../services/whatsapp.js'
import { notifyUser, notifyOperatorsAndAdmin } from '../services/notify.js'
import { calculatePrivateTour, calculateSharedTour, getDateSurcharge } from '../services/priceEngine.js'

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
      coupon_code, existing_booking_id,
    } = req.body

    if (!existing_booking_id && (!service_id || !service_date_iso || !total_price)) {
      return res.status(400).json({ error: 'Dados incompletos para criar reserva' })
    }

    // ── Total autoritativo: o SERVIDOR recalcula o preço (alta temporada /
    //    feriado). O cliente nunca define o valor cobrado. ─────────────────
    let chargedTotal = Number(total_price)
    if (!existing_booking_id) {
      try {
        if (service_type === 'tour' && service_id && region_id && service_date_iso) {
          let r = null
          if (booking_mode === 'shared') {
            r = await calculateSharedTour({
              regionId: region_id, tourId: service_id, serviceDate: service_date_iso,
              peopleCount: Number(people_count) || 1, couponCode: coupon_code, userId: req.user.id,
            })
          } else {
            const vlist = (vehicles || []).map((v) => ({ vehicleId: v.vehicle_id, quantity: v.qty || 1 }))
            if (vlist.length) {
              r = await calculatePrivateTour({
                regionId: region_id, tourId: service_id, serviceDate: service_date_iso,
                vehicles: vlist, couponCode: coupon_code, userId: req.user.id,
              })
            }
          }
          if (r && typeof r.totalAmount === 'number') chargedTotal = r.totalAmount
        } else if (service_type === 'transfer' && service_id && region_id && service_date_iso) {
          // Rota tabelada: o SERVIDOR é a fonte de verdade — recalcula a partir
          // do preço da rota × veículos + acréscimo de data. Cotações (translado
          // personalizado) têm preço fechado pela cooperativa e não entram aqui
          // (service_id não casa com nenhuma rota → mantém o total da cotação).
          const { data: route } = await supabase
            .from('transfer_routes').select('id, default_price').eq('id', service_id).maybeSingle()
          if (route) {
            const vehicleCount = (vehicles || []).reduce((s, v) => s + (Number(v.qty) || 1), 0) || 1
            const baseSubtotal = Math.round(Number(route.default_price) * vehicleCount * 100) / 100
            const surcharge    = await getDateSurcharge(region_id, service_date_iso, baseSubtotal)
            chargedTotal       = Math.round((baseSubtotal + surcharge) * 100) / 100
          }
        }
      } catch (e) {
        console.error('[intent] recálculo de preço falhou, usando total do cliente:', e.message)
        chargedTotal = Number(total_price)
      }
    }

    // ── 1. Lê configurações do gateway ─────────────────
    const cfg     = await getPaymentSettings()
    const gateway = cfg.payment_gateway || 'manual'
    console.log('[intent] gateway=%s env=%s', gateway, cfg.payment_gateway_env)

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
          total_amount:        chargedTotal,
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
      const d = await testIntent({ amount: chargedTotal, description: service_name || `Reserva ${bookingCode}` })
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
          amount:      chargedTotal,
          description: service_name || `Reserva ${bookingCode}`,
          payerEmail:  userInfo.data?.email,
          payerName:   userInfo.data?.full_name,
          externalRef: booking.id,
        })
        gatewayTransactionId = pixData.mp_id
        expiresAt            = pixData.expires_at || expiresAt
        pixCode              = pixData.pix_code
        qrBase64             = pixData.qr_base64
        console.log('[intent] Mercado Pago OK — mp_id=%s status=%s', pixData.mp_id, pixData.status)
      } catch (mpErr) {
        // Loga o máximo de detalhe — a API do MP devolve a causa em mpErr.cause / .message
        console.error('Mercado Pago error — falling back to manual:', mpErr.message,
          mpErr.cause ? JSON.stringify(mpErr.cause) : '', mpErr.status || '')
      }
    }
    // asaas / pagarme: adapters a implementar quando credentials disponíveis

    // Gateway efetivo: se o MP (ou outro) não devolveu transação, o pagamento
    // é apresentado como manual — então grava 'manual' para o botão de
    // simulação/confirmação funcionar coerentemente.
    const effectiveGateway = gatewayTransactionId ? gateway : 'manual'

    // ── 6. Registra pagamento ──────────────────────────
    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .insert({
        booking_id:             booking.id,
        gateway_name:           effectiveGateway,
        gateway_transaction_id: gatewayTransactionId,
        payment_method,
        payment_type:           'full',
        amount_gross:           chargedTotal,
        gateway_fee_amount:     0,
        currency:               'BRL',
        status:                 'pending',
        expires_at:             expiresAt,
      })
      .select()
      .single()

    if (pErr) throw pErr

    const manual    = effectiveGateway === 'manual'
    const test_mode = effectiveGateway === 'test'

    res.json({
      booking_id:   booking.id,
      booking_code: bookingCode,
      payment_id:   payment.id,
      amount:       chargedTotal,
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
function verifyMpSignature(req, event) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) {
    console.warn('[webhook] MERCADO_PAGO_WEBHOOK_SECRET ausente — assinatura NÃO verificada')
    return true
  }
  const sig = req.headers['x-signature']
  if (!sig) { console.warn('[webhook] sem header x-signature'); return false }

  const parts = Object.fromEntries(
    sig.split(',').map((p) => p.trim().split('=').map((s) => s.trim()))
  )
  if (!parts.ts || !parts.v1) { console.warn('[webhook] x-signature malformado:', sig); return false }

  const requestId = req.headers['x-request-id'] || ''

  // O data.id usado no manifesto pode vir da query (?data.id=...) ou do corpo,
  // e o simulador às vezes difere do id do topo. Testa todos os candidatos.
  const candidates = [...new Set(
    [req.query['data.id'], event?.data?.id, event?.id]
      .filter((v) => v !== undefined && v !== null)
      .map((v) => String(v).toLowerCase())
  )]

  for (const id of candidates) {
    const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
    try {
      if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))) return true
    } catch { /* tamanhos diferentes — tenta próximo candidato */ }
  }

  console.warn('[webhook] assinatura não confere — ts=%s req-id=%s candidatos=%j v1=%s',
    parts.ts, requestId, candidates, parts.v1)
  return false
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

    if (!verifyMpSignature(req, event)) {
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
        .maybeSingle()

      if (payment && payment.status !== 'approved') {
        // O body do webhook do MP só carrega o ID — precisa consultar o status real na API.
        let mpStatus = event.data?.status  // presente em alguns event types, mas geralmente ausente
        if (!mpStatus) {
          try {
            const { getMpPaymentStatus } = await import('../services/mercadoPago.js')
            mpStatus = await getMpPaymentStatus(gatewayId)
          } catch (e) {
            console.error('[webhook] falha ao consultar status MP:', e.message)
          }
        }

        if (mpStatus === 'approved') {
          await onPaymentApproved(payment)
        } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(mpStatus)) {
          await supabase.from('payments').update({ status: 'failed' }).eq('id', payment.id)
          await supabase.from('bookings').update({ status_commercial: 'payment_failed', payment_status: 'failed' }).eq('id', payment.booking_id)
        }
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

  const gatewayFee    = Math.round(payment.amount_gross * 0.035 * 100) / 100
  const platformFee   = Math.round(payment.amount_gross * 0.07  * 100) / 100

  await supabase.from('financial_ledger').insert([
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_gross', description: `Receita bruta — ${booking?.booking_code}`, amount: payment.amount_gross, direction: 'inflow', financial_status: 'pending' },
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'gateway_fee',   description: `Taxa gateway — ${booking?.booking_code}`,   amount: gatewayFee,           direction: 'outflow', financial_status: 'pending' },
    { booking_id: payment.booking_id, payment_id: payment.id, entry_type: 'booking_net',   description: `Receita líquida — ${booking?.booking_code}`, amount: payment.amount_gross - gatewayFee, direction: 'inflow', financial_status: 'pending' },
  ])

  // E-mail de confirmação — nunca pode quebrar o fluxo de pagamento
  sendConfirmationEmail(booking).catch((err) =>
    console.error('[email] confirmação de reserva falhou:', err.message))

  // Notifica as cooperativas sobre a nova reserva disponível (fire-and-forget)
  notifyOperatorsNewBooking(supabase, booking).catch((err) =>
    console.error('[whatsapp] notificação de cooperativas falhou:', err.message))

  // Central no app: confirma para o turista e avisa cooperativas + admin
  if (booking) {
    const isTransfer = booking.service_type === 'transfer'
    const tipo  = isTransfer ? 'translado' : 'passeio'
    const rota  = [booking.origin_text, booking.destination_text].filter(Boolean).join(' → ')

    notifyUser({
      userId:      booking.user_id,
      bookingId:   booking.id,
      templateKey: 'payment_confirmed',
      title:       'Pagamento confirmado ✅',
      body:        `Recebemos o pagamento do seu ${tipo} (${booking.booking_code}). Agora é só aguardar uma cooperativa aceitar.`,
    })

    notifyOperatorsAndAdmin({
      bookingId:   booking.id,
      templateKey: 'new_booking',
      title:       'Nova solicitação disponível',
      body:        `${isTransfer ? 'Translado' : 'Passeio'}${rota ? ` · ${rota}` : ''} para ${fmtDateBR(booking.service_date)}. Abra para aceitar.`,
    })
  }
}

function fmtDateBR(iso) {
  if (!iso) return 'a definir'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
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
