import { Router }    from 'express'
import crypto        from 'node:crypto'
import { z }         from 'zod'
import { supabase }  from '../supabase.js'
import { authenticate } from '../middleware/auth.js'
import { sendBookingConfirmation } from '../services/email.js'
import { notifyOperatorsNewBooking } from '../services/whatsapp.js'
import { notifyUser, notifyOperatorsAndAdmin } from '../services/notify.js'
import { calculatePrivateTour, calculateSharedTour, getDateSurcharge } from '../services/priceEngine.js'

const intentSchema = z.object({
  service_type:        z.enum(['tour', 'transfer']).optional(),
  service_id:          z.string().uuid().optional(),
  service_date_iso:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)').optional(),
  total_price:         z.number({ coerce: true }).positive().min(5, 'Valor mínimo R$ 5,00').optional(),
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
    unit_price: z.number({ coerce: true }).nonnegative().optional(),
  })).optional(),
  origin_text:      z.string().max(500).optional(),
  destination_text: z.string().max(500).optional(),
  service_name:     z.string().max(300).optional(),
  cover_image_url:  z.string().url().optional().nullable().or(z.literal('')),
  coupon_code:      z.string().max(50).optional(),
  // Campos de cartão (obrigatórios condicionalmente via .refine abaixo)
  card_token:         z.string().min(1).optional(),
  installments:       z.number({ coerce: true }).int().min(1).max(12).default(1),
  payment_method_id:  z.string().min(1).optional(),
  issuer_id:          z.string().optional(),
  // CPF/CNPJ do pagador. Aceita com ou sem máscara e salva apenas números.
  payer_doc: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : v),
    z.string().regex(/^\d{11,14}$/).optional(),
  ),
}).refine(
  (d) => d.existing_booking_id || (d.service_id && d.service_date_iso && d.total_price),
  { message: 'Dados incompletos para criar reserva' },
).refine(
  (d) => !['credit_card', 'debit_card'].includes(d.payment_method) ||
          (d.card_token && d.payment_method_id && d.payer_doc),
  { message: 'Dados do cartão incompletos (card_token, payment_method_id, payer_doc)' },
)

// Solicitação de reserva (sem pagamento): subconjunto do intent, sem cartão.
const requestSchema = z.object({
  service_type:     z.enum(['tour', 'transfer']).optional(),
  service_id:       z.string().uuid(),
  service_date_iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  total_price:      z.number({ coerce: true }).positive().min(5, 'Valor mínimo R$ 5,00'),
  booking_mode:     z.enum(['private', 'shared']).optional(),
  service_date:     z.string().optional(),
  service_time:     z.string().optional(),
  people_count:     z.number({ coerce: true }).int().min(1).max(200).optional(),
  region_id:        z.string().uuid().optional(),
  vehicles:         z.array(z.object({
    vehicle_id: z.string().uuid(),
    qty:        z.number({ coerce: true }).int().min(1),
    unit_price: z.number({ coerce: true }).nonnegative().optional(),
  })).optional(),
  origin_text:      z.string().max(500).optional(),
  destination_text: z.string().max(500).optional(),
  service_name:     z.string().max(300).optional(),
  cover_image_url:  z.string().url().optional().nullable().or(z.literal('')),
  coupon_code:      z.string().max(50).optional(),
})

const router = Router()

// O app envia null em campos vazios vindos do banco (ex.: origin_text de um
// passeio). Os campos .optional() do Zod aceitam undefined, mas não null —
// então convertemos null → undefined no corpo antes de validar.
function nullToUndefined(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k] = v === null ? undefined : v
  return out
}

// Insere as linhas de booking_vehicles com snapshot de nome/capacidade do
// veículo (colunas NOT NULL na tabela) e propaga erro em vez de engolir.
async function insertBookingVehicles(bookingId, vehicles) {
  const ids = vehicles.map((v) => v.vehicle_id)
  const { data: vehicleRows = [], error: vErr } = await supabase
    .from('vehicles')
    .select('id, name, seat_capacity')
    .in('id', ids)
  if (vErr) throw vErr
  const byId = new Map(vehicleRows.map((v) => [v.id, v]))

  const rows = vehicles.map((v) => {
    const vehicle = byId.get(v.vehicle_id)
    const quantity = v.qty || 1
    const unitPrice = v.unit_price || 0
    return {
      booking_id:                bookingId,
      vehicle_id:                v.vehicle_id,
      vehicle_name_snapshot:     vehicle?.name || 'Veículo',
      vehicle_capacity_snapshot: vehicle?.seat_capacity || 1,
      quantity,
      unit_price:                unitPrice,
      total_price:               unitPrice * quantity,
    }
  })
  const { error } = await supabase.from('booking_vehicles').insert(rows)
  if (error) throw error
}

async function getPaymentSettings() {
  const { data = [] } = await supabase
    .from('system_settings')
    .select('setting_key, setting_value')
    .like('setting_key', 'payment_%')
  return Object.fromEntries(data.map((s) => [s.setting_key, s.setting_value]))
}

// Recalcula o valor autoritativo da reserva (alta temporada / feriado) a partir
// do serviço, data e veículos. O cliente nunca define o valor cobrado.
// Em caso de falha, mantém o total enviado pelo cliente como fallback.
async function computeChargedTotal({ data, userId }) {
  const {
    service_type, service_id, booking_mode, service_date_iso,
    people_count, region_id, vehicles = [], coupon_code, total_price,
  } = data
  let chargedTotal = Number(total_price)
  try {
    if (service_type === 'tour' && service_id && region_id && service_date_iso) {
      let r = null
      if (booking_mode === 'shared') {
        r = await calculateSharedTour({
          regionId: region_id, tourId: service_id, serviceDate: service_date_iso,
          peopleCount: Number(people_count) || 1, couponCode: coupon_code, userId,
        })
      } else {
        const vlist = (vehicles || []).map((v) => ({ vehicleId: v.vehicle_id, quantity: v.qty || 1 }))
        if (vlist.length) {
          r = await calculatePrivateTour({
            regionId: region_id, tourId: service_id, serviceDate: service_date_iso,
            vehicles: vlist, couponCode: coupon_code, userId,
          })
        }
      }
      if (r && typeof r.totalAmount === 'number') chargedTotal = r.totalAmount
    } else if (service_type === 'transfer' && service_id && region_id && service_date_iso) {
      // Rota tabelada: recalcula a partir do preço da rota × veículos + acréscimo
      // de data. Cotações (translado personalizado) têm preço fechado pela
      // cooperativa e não casam com nenhuma rota → mantém o total enviado.
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
    console.error('[payments] recálculo de preço falhou, usando total do cliente:', e.message)
    chargedTotal = Number(total_price)
  }
  return chargedTotal
}

// Credenciais Mercado Pago da cooperativa (com refresh automático se o token
// estiver expirando). Retorna { token, publicKey, platformPct } ou null quando
// a cooperativa não conectou a conta dela.
async function getOperatorMp(operatorId) {
  if (!operatorId) return null
  const { data: op } = await supabase
    .from('users')
    .select('mp_access_token, mp_refresh_token, mp_token_expires_at, mp_public_key, platform_split_pct')
    .eq('id', operatorId)
    .single()
  if (!op?.mp_access_token) return null

  let token     = op.mp_access_token
  let publicKey = op.mp_public_key
  const expMs   = op.mp_token_expires_at ? new Date(op.mp_token_expires_at).getTime() : 0
  if (expMs && expMs < Date.now() + 60 * 1000 && op.mp_refresh_token) {
    try {
      const { refreshOAuthToken } = await import('../services/mercadoPago.js')
      const tok = await refreshOAuthToken({ refreshToken: op.mp_refresh_token })
      token     = tok.access_token || token
      publicKey = tok.public_key   || publicKey
      await supabase.from('users').update({
        mp_access_token:     tok.access_token  || op.mp_access_token,
        mp_refresh_token:    tok.refresh_token || op.mp_refresh_token,
        mp_public_key:       tok.public_key    || op.mp_public_key,
        mp_token_expires_at: tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString() : null,
      }).eq('id', operatorId)
    } catch (e) {
      console.error('[split] refresh de token MP falhou:', e.message)
    }
  }
  return { token, publicKey, platformPct: op.platform_split_pct }
}

// Contexto de split de um pagamento: token da cooperativa + comissão da
// plataforma (application_fee). Null quando não há split (cai na plataforma).
async function getSplitContext(booking, chargedTotal, cfg) {
  const opMp = await getOperatorMp(booking?.operator_id)
  if (!opMp) return null
  const pct = (opMp.platformPct != null ? Number(opMp.platformPct) : Number(cfg?.payment_split_admin_pct)) || 0
  const applicationFee = Math.round(chargedTotal * (pct / 100) * 100) / 100
  return { sellerAccessToken: opMp.token, applicationFee }
}

// ── POST /api/payments/intent ───────────────────────────
router.post('/intent', authenticate, async (req, res, next) => {
  try {
    const parsed = intentSchema.safeParse(nullToUndefined(req.body))
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
      card_token, installments = 1, payment_method_id, issuer_id, payer_doc,
    } = parsed.data

    // ── Total autoritativo: o SERVIDOR é a fonte de verdade do valor cobrado.
    //    Reserva nova → recalcula (alta temporada/feriado). Reserva já existente
    //    (pagamento pós-aceite) → usa o total já gravado no banco. ───────────
    let chargedTotal = existing_booking_id
      ? Number(total_price)
      : await computeChargedTotal({ data: parsed.data, userId: req.user.id })

    // ── 1. Lê configurações do gateway ─────────────────
    const cfg     = await getPaymentSettings()
    const gateway = cfg.payment_gateway || 'manual'
    console.log('[intent] gateway=%s env=%s', gateway, cfg.payment_gateway_env)

    let booking, bookingCode

    if (existing_booking_id) {
      // ── Reutiliza reserva existente ────────────────────
      const { data: existing } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', existing_booking_id)
        .eq('user_id', req.user.id)
        .maybeSingle()

      // Mensagens específicas: ajudam a entender o que está acontecendo.
      if (!existing) {
        return res.status(404).json({
          error: 'Reserva não encontrada nesta conta. Entre com a mesma conta que fez a reserva.',
        })
      }
      if (existing.status_commercial !== 'awaiting_payment') {
        const s = existing.status_commercial
        const msg =
          s === 'awaiting_acceptance' ? 'Esta reserva ainda não foi aceita por uma cooperativa. Aguarde o aceite para pagar.' :
          s === 'paid'                ? 'Esta reserva já foi paga.' :
          s === 'cancelled'           ? 'Esta reserva foi cancelada.' :
                                        `Esta reserva não está aguardando pagamento (status: ${s}).`
        return res.status(409).json({ error: msg })
      }

      booking     = existing
      bookingCode = existing.booking_code
      // Pagamento de reserva já solicitada/aceita: o valor cobrado é o do banco.
      chargedTotal = Number(existing.total_amount)
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
        await insertBookingVehicles(booking.id, vehicles)
      }
    }

    // ── 5. Processa pagamento conforme gateway ─────────
    let gatewayTransactionId = null
    let expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    let pixCode   = null
    let qrBase64  = null

    // Campos extras preenchidos apenas em pagamentos com cartão
    let cardResult         = null // resultado completo de createCardPayment
    let cardPaymentStatus  = null // status final a reportar na response
    let cardStatusDetail   = null
    let cardInstallments   = Number(installments) || 1
    let cardInstFeeAmount  = null
    let cardLastFour       = null
    let cardBrand          = null
    let cardHolderName     = null
    let cardGatewayFeePct  = null

    if (gateway === 'test') {
      const { createPaymentIntent: testIntent } = await import('../payments/test.js')
      const d = await testIntent({ amount: chargedTotal, description: service_name || `Reserva ${bookingCode}` })
      gatewayTransactionId = d.transaction_id
      expiresAt            = d.expires_at
      pixCode              = d.pix_code
      qrBase64             = d.qr_base64
    } else if (gateway === 'mercado_pago') {
      const isCard = ['credit_card', 'debit_card'].includes(payment_method)

      // Split automático: se a cooperativa atribuída está conectada ao Mercado
      // Pago, o pagamento cai NA conta dela e a comissão da plataforma vira
      // application_fee. Sem conexão → cai na conta da plataforma (sem split).
      const split = await getSplitContext(booking, chargedTotal, cfg)

      if (isCard) {
        // ── Cartão: sem fallback fake — erro propaga ──────
        const { createCardPayment, mapRejectionKey } = await import('../services/mercadoPago.js')
        const userInfo = await supabase.from('users').select('email').eq('id', req.user.id).single()

        cardResult = await createCardPayment({
          amount:          chargedTotal,
          description:     service_name || `Reserva ${bookingCode}`,
          installments:    cardInstallments,
          paymentMethodId: payment_method_id,
          cardToken:       card_token,
          issuerId:        issuer_id,
          payerEmail:      userInfo.data?.email,
          payerDoc:        payer_doc ? String(payer_doc).replace(/\D/g, '') : undefined,
          externalRef:     booking.id,
          sellerAccessToken: split?.sellerAccessToken,
          applicationFee:    split?.applicationFee,
        })

        gatewayTransactionId = cardResult.mp_id
        cardPaymentStatus    = cardResult.status
        cardStatusDetail     = cardResult.status_detail
        cardInstallments     = cardResult.installments || cardInstallments
        cardInstFeeAmount    = cardResult.installment_fee_amount
        cardLastFour         = cardResult.card_last_four
        cardBrand            = cardResult.card_brand
        cardHolderName       = cardResult.card_holder_name

        // Taxa real por método: cartão à vista 4.98%, débito 1.50%
        if (payment_method === 'debit_card') {
          cardGatewayFeePct = 0.0150
        } else {
          cardGatewayFeePct = 0.0498
        }
      } else {
        // ── PIX ───────────────────────────────────────────
        const { createPixPayment } = await import('../services/mercadoPago.js')
        const userInfo = await supabase.from('users').select('full_name, email').eq('id', req.user.id).single()
        let pixData
        try {
          pixData = await createPixPayment({
            amount:      chargedTotal,
            description: service_name || `Reserva ${bookingCode}`,
            payerEmail:  userInfo.data?.email,
            payerName:   userInfo.data?.full_name,
            // IMPORTANTE: para PIX não envie payerDoc/entityType/entity_type.
            // O erro do Brick "entityType only receives individual or association"
            // costuma aparecer quando o front/backend manda CPF/CNPJ/fisica/juridica
            // como entityType. PIX funciona só com email/nome do pagador.
            externalRef: booking.id,
            sellerAccessToken: split?.sellerAccessToken,
            applicationFee:    split?.applicationFee,
          })
        } catch (mpErr) {
          console.error('[intent] PIX falhou:', mpErr.message)
          return res.status(422).json({
            error: `Não foi possível gerar o PIX: ${mpErr.message}. Confirme que o PIX está ativado na conta do Mercado Pago que vai receber.`,
          })
        }
        console.log('[intent] PIX: status=%s detail=%s exp=%s split=%s qr=%s',
          pixData.status, pixData.status_detail, pixData.expires_at, !!split, !!pixData.qr_base64)

        if (pixData.status === 'pending' && (pixData.pix_code || pixData.qr_base64)) {
          gatewayTransactionId = pixData.mp_id
          expiresAt            = pixData.expires_at || expiresAt
          pixCode              = pixData.pix_code
          qrBase64             = pixData.qr_base64
        } else {
          // PIX recusado ou sem QR → mostra o MOTIVO real do Mercado Pago.
          return res.status(422).json({
            error: `Não foi possível gerar o PIX (status: ${pixData.status}${pixData.status_detail ? ` · ${pixData.status_detail}` : ''}). Confirme que o PIX está ativado na conta do Mercado Pago que vai receber.`,
          })
        }
      }
    }
    // asaas / pagarme: adapters a implementar quando credentials disponíveis

    // Gateway efetivo: se o MP (ou outro) não devolveu transação, o pagamento
    // é apresentado como manual — então grava 'manual' para o botão de
    // simulação/confirmação funcionar coerentemente.
    const effectiveGateway = gatewayTransactionId ? gateway : 'manual'

    // ── 6. Registra pagamento ──────────────────────────
    // Status inicial difere: PIX/manual ficam 'pending'; cartão já tem status
    // definitivo (approved/rejected/in_process) neste mesmo request.
    const isCard = ['credit_card', 'debit_card'].includes(payment_method)
    let initialPaymentStatus = 'pending'
    if (isCard && cardPaymentStatus) {
      if (cardPaymentStatus === 'approved')   initialPaymentStatus = 'approved'
      else if (cardPaymentStatus === 'rejected') initialPaymentStatus = 'failed'
      else                                       initialPaymentStatus = cardPaymentStatus // in_process / pending
    }

    const paymentInsertRow = {
      booking_id:             booking.id,
      gateway_name:           effectiveGateway,
      gateway_transaction_id: gatewayTransactionId,
      payment_method,
      payment_type:           'full',
      amount_gross:           chargedTotal,
      gateway_fee_amount:     isCard ? Math.round(chargedTotal * (cardGatewayFeePct || 0.035) * 100) / 100 : 0,
      currency:               'BRL',
      status:                 initialPaymentStatus,
      expires_at:             expiresAt,
      // raw response para cartão (inclui dados completos do MP)
      ...(isCard && cardResult ? { raw_response_json: cardResult.raw } : {}),
      // colunas de cartão (nullable em PIX/manual)
      ...(isCard ? {
        installments:           cardInstallments,
        installment_fee_amount: cardInstFeeAmount,
        card_last_four:         cardLastFour,
        card_brand:             cardBrand,
        card_holder_name:       cardHolderName,
        gateway_fee_pct:        cardGatewayFeePct,
      } : {}),
    }

    const { data: payment, error: pErr } = await supabase
      .from('payments')
      .insert(paymentInsertRow)
      .select()
      .single()

    if (pErr) throw pErr

    // ── Pós-inserção: ação imediata para cartão ────────
    if (isCard && cardPaymentStatus === 'approved') {
      // approved: dispara onPaymentApproved dentro do mesmo request
      await onPaymentApproved(payment)
    } else if (isCard && cardPaymentStatus === 'rejected') {
      // rejected: booking permanece awaiting_payment (não altera status_commercial)
      // O status 'failed' já foi gravado em payments acima
    }
    // in_process / pending: polling existente cuida via GET /:id/status

    const manual    = gateway === 'manual' || !gatewayTransactionId
    const test_mode = gateway === 'test'

    // ── Resposta final ─────────────────────────────────
    // Cartão rejected → HTTP 200 com status: 'rejected' (nunca 402)
    if (isCard && cardPaymentStatus === 'rejected') {
      const { mapRejectionKey } = await import('../services/mercadoPago.js')
      return res.json({
        booking_id:   booking.id,
        booking_code: bookingCode,
        payment_id:   payment.id,
        amount:       chargedTotal,
        status:       'rejected',
        error_code:   cardStatusDetail,
        message_key:  mapRejectionKey(cardStatusDetail),
      })
    }

    res.json({
      booking_id:   booking.id,
      booking_code: bookingCode,
      payment_id:   payment.id,
      amount:       chargedTotal,
      expires_at:   payment.expires_at,
      status:       isCard ? (cardPaymentStatus || 'pending') : 'pending',
      // gateway-generated PIX (null when manual or card)
      pix_code:     pixCode,
      qr_base64:    qrBase64,
      test_mode,
      // campos extras de cartão (null em PIX/manual)
      installments:      isCard ? cardInstallments : null,
      card_last_four:    isCard ? cardLastFour : null,
      card_brand:        isCard ? cardBrand : null,
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

// ── POST /api/payments/request ─────────────────────────
// Cria a reserva SEM pagamento (fluxo solicitar → aceitar → pagar). A reserva
// nasce em 'awaiting_acceptance' e as cooperativas são notificadas para aceitar.
// O pagamento acontece depois, via POST /intent com existing_booking_id.
router.post('/request', authenticate, async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(nullToUndefined(req.body))
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos' })
    }

    const {
      service_type, service_id, booking_mode,
      service_date_iso, service_time, people_count, region_id,
      vehicles = [], origin_text, destination_text,
    } = parsed.data

    const chargedTotal = await computeChargedTotal({ data: parsed.data, userId: req.user.id })

    const bookingCode = `GJ${Date.now().toString(36).toUpperCase().slice(-6)}`
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .insert({
        booking_code:       bookingCode,
        user_id:            req.user.id,
        region_id:          region_id || null,
        service_type,
        service_id,
        booking_mode:       booking_mode || 'private',
        service_date:       service_date_iso,
        service_time:       service_time || null,
        people_count:       Number(people_count) || 1,
        origin_text:        origin_text || null,
        destination_text:   destination_text || null,
        total_amount:       chargedTotal,
        status_commercial:  'awaiting_acceptance',
        status_operational: 'new',
        payment_status:     'pending',
      })
      .select()
      .single()
    if (bErr) throw bErr

    if (vehicles.length > 0) {
      await insertBookingVehicles(booking.id, vehicles)
    }

    // Notifica as cooperativas da nova solicitação (ANTES do pagamento) —
    // elas aceitam e só então o cliente paga.
    notifyOperatorsNewBooking(supabase, booking).catch((err) =>
      console.error('[whatsapp] notificação de cooperativas falhou:', err.message))

    const isTransfer = service_type === 'transfer'
    const rota = [origin_text, destination_text].filter(Boolean).join(' → ')
    notifyOperatorsAndAdmin({
      bookingId:   booking.id,
      templateKey: 'new_booking',
      title:       'Nova solicitação disponível',
      body:        `${isTransfer ? 'Translado' : 'Passeio'}${rota ? ` · ${rota}` : ''} para ${fmtDateBR(booking.service_date)}. Abra para aceitar.`,
    })

    res.json({ booking_id: booking.id, booking_code: bookingCode, amount: chargedTotal })
  } catch (err) { next(err) }
})

// ── GET /api/payments/booking/:id/checkout-key ─────────
// Devolve a public_key do Mercado Pago da cooperativa atribuída à reserva, para
// o checkout tokenizar o cartão NA conta dela (split). Sem cooperativa conectada
// → null (o app usa a chave da plataforma, sem split).
router.get('/booking/:id/checkout-key', authenticate, async (req, res, next) => {
  try {
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, user_id, operator_id')
      .eq('id', req.params.id)
      .single()
    if (!booking) return res.status(404).json({ error: 'Reserva não encontrada' })
    if (req.user.user_type === 'tourist' && booking.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' })
    }
    let publicKey = null
    if (booking.operator_id) {
      const { data: op } = await supabase
        .from('users').select('mp_public_key').eq('id', booking.operator_id).single()
      publicKey = op?.mp_public_key || null
    }
    res.json({ public_key: publicKey, split: !!publicKey })
  } catch (err) { next(err) }
})

// ── GET /api/payments/:id/status ───────────────────────
// Polling: retorna status do pagamento
router.get('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { data: payment } = await supabase
      .from('payments')
      .select('id, status, booking_id, gateway_name, gateway_transaction_id, expires_at, bookings(booking_code, status_commercial, operator_id)')
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
        // Pagamento com split vive na conta da cooperativa → consulta com o token dela.
        const opMp = await getOperatorMp(payment.bookings?.operator_id)
        const mpStatus = await getMpPaymentStatus(payment.gateway_transaction_id, opMp?.token)
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

    // Registra evento bruto com payment_id para idempotência via UNIQUE constraint.
    // Não use .catch() direto no builder do Supabase, porque ele é awaitable,
    // mas não expõe .catch() como uma Promise nativa em todos os ambientes.
    try {
      await supabase.from('payment_events').insert({
        payment_id:         paymentForEvent?.id || null,
        event_name:         eventType,
        event_payload_json: event,
        processing_status:  'pending',
      })
    } catch {
      // UNIQUE/payment_events duplicado ou falha de log não pode derrubar o webhook.
    }

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

  // Carrega a reserva ANTES de atualizar para saber se a cooperativa já aceitou.
  const booking = payment.bookings || (await supabase.from('bookings').select('*').eq('id', payment.booking_id).single()).data

  // Fluxo novo (solicitar→aceitar→pagar): a cooperativa já está atribuída, então
  // a reserva permanece 'assigned' e segue direto para o atendimento. Fluxo
  // antigo (paga primeiro): vai para a fila de despacho para alguém aceitar.
  const bookingUpdate = { status_commercial: 'paid', payment_status: 'approved' }
  if (!booking?.operator_id) bookingUpdate.status_operational = 'awaiting_dispatch'
  await supabase.from('bookings').update(bookingUpdate).eq('id', payment.booking_id)

  // If this booking came from a custom transfer quote, mark the quote as paid.
  // Não use .catch() direto no builder do Supabase.
  if (booking?.service_type === 'transfer' && booking?.service_id) {
    try {
      await supabase.from('transfer_quotes')
        .update({ status: 'paid' })
        .eq('id', booking.service_id)
        .eq('status', 'accepted')
    } catch {
      // no-op if service_id is a route id (not a quote)
    }
  }

  // Cria lançamentos no ledger apenas uma vez — ledger_created evita duplicação
  // quando webhook e polling aprovam o mesmo pagamento quase simultaneamente.
  const { data: freshPayment } = await supabase
    .from('payments')
    .select('ledger_created, amount_gross, gateway_fee_pct, gateway_fee_amount')
    .eq('id', payment.id)
    .single()

  if (!freshPayment?.ledger_created) {
    const amount     = freshPayment?.amount_gross ?? payment.amount_gross
    // Usa a taxa real registrada no payment; fallback 3.5% para linhas antigas sem gateway_fee_pct
    const feePct     = freshPayment?.gateway_fee_pct ?? 0.035
    const gatewayFee = freshPayment?.gateway_fee_amount > 0
      ? freshPayment.gateway_fee_amount
      : Math.round(amount * feePct * 100) / 100

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

  // Central no app: confirma para o turista e avisa quem precisa.
  if (booking) {
    const isTransfer = booking.service_type === 'transfer'
    const tipo  = isTransfer ? 'translado' : 'passeio'
    const rota  = [booking.origin_text, booking.destination_text].filter(Boolean).join(' → ')

    notifyUser({
      userId:      booking.user_id,
      bookingId:   booking.id,
      templateKey: 'payment_confirmed',
      title:       'Pagamento confirmado ✅',
      body:        booking.operator_id
        ? `Recebemos o pagamento do seu ${tipo} (${booking.booking_code}). A cooperativa já vai cuidar de tudo! 🎉`
        : `Recebemos o pagamento do seu ${tipo} (${booking.booking_code}). Agora é só aguardar uma cooperativa aceitar.`,
    })

    if (booking.operator_id) {
      // Fluxo novo: a cooperativa que aceitou é avisada de que o pagamento entrou.
      notifyUser({
        userId:      booking.operator_id,
        bookingId:   booking.id,
        templateKey: 'payment_received',
        title:       'Pagamento recebido 💰',
        body:        `O cliente pagou o ${tipo} ${booking.booking_code}. Pode confirmar e seguir com o atendimento.`,
      })
    } else {
      // Fluxo antigo: a reserva paga fica disponível para as cooperativas.
      notifyOperatorsNewBooking(supabase, booking).catch((err) =>
        console.error('[whatsapp] notificação de cooperativas falhou:', err.message))
      notifyOperatorsAndAdmin({
        bookingId:   booking.id,
        templateKey: 'new_booking',
        title:       'Nova solicitação disponível',
        body:        `${isTransfer ? 'Translado' : 'Passeio'}${rota ? ` · ${rota}` : ''} para ${fmtDateBR(booking.service_date)}. Abra para aceitar.`,
      })
    }
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
