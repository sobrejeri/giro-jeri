import { MercadoPagoConfig, Payment } from 'mercadopago'

const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
const testMode    = !accessToken || accessToken.startsWith('TEST-')

const mp = accessToken
  ? new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } })
  : null

export async function createPixPayment({ amount, description, payerEmail, payerName, externalRef }) {
  if (!mp) return createFakePix({ amount, description, externalRef })

  // Render expõe RENDER_EXTERNAL_URL automaticamente; API_BASE_URL como fallback manual
  const apiBase = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || ''
  const notificationUrl = apiBase ? `${apiBase}/api/payments/webhook` : undefined

  const client = new Payment(mp)
  const response = await client.create({
    body: {
      transaction_amount: amount,
      description,
      payment_method_id:  'pix',
      external_reference: String(externalRef),
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      payer: {
        email:      payerEmail || 'comprador@girojeri.com',
        first_name: (payerName || 'Comprador').split(' ')[0],
        last_name:  (payerName || '').split(' ').slice(1).join(' ') || 'GiroJeri',
      },
    },
  })

  return {
    mp_id:       String(response.id),
    status:      response.status,
    pix_code:    response.point_of_interaction?.transaction_data?.qr_code,
    qr_base64:   response.point_of_interaction?.transaction_data?.qr_code_base64,
    expires_at:  response.date_of_expiration,
  }
}

// ── Mapa de recusas → chave i18n ──────────────────────
const REJECTION_MAP = {
  cc_rejected_insufficient_amount:    'payment.rejected.insufficient_amount',
  cc_rejected_bad_filled_security_code: 'payment.rejected.bad_cvv',
  cc_rejected_bad_filled_date:        'payment.rejected.bad_date',
  cc_rejected_bad_filled_card_number: 'payment.rejected.bad_number',
  cc_rejected_high_risk:              'payment.rejected.high_risk',
  cc_rejected_call_for_authorize:     'payment.rejected.call_authorize',
  cc_rejected_card_disabled:          'payment.rejected.card_disabled',
  cc_rejected_duplicated_payment:     'payment.rejected.duplicated',
}

export function mapRejectionKey(statusDetail) {
  return REJECTION_MAP[statusDetail] || 'payment.rejected.generic'
}

// ── Pagamento com cartão de crédito ou débito ─────────
export async function createCardPayment({
  amount,
  description,
  installments = 1,
  paymentMethodId,
  cardToken,
  issuerId,
  payerEmail,
  payerDoc,
  externalRef,
}) {
  // Sem fallback fake para cartão — erro propaga para o caller
  if (!mp) throw new Error('Mercado Pago não configurado (access token ausente)')

  const client = new Payment(mp)

  const body = {
    transaction_amount: amount,
    description,
    installments:       Number(installments) || 1,
    payment_method_id:  paymentMethodId,
    token:              cardToken,
    statement_descriptor: 'GIROJERI',
    external_reference: externalRef,
    payer: {
      email:          payerEmail || 'comprador@girojeri.com',
      identification: { type: 'CPF', number: payerDoc },
    },
  }

  // issuer_id é opcional — não enviar quando undefined para evitar rejeição MP
  if (issuerId) body.issuer_id = String(issuerId)

  const response = await client.create({
    body,
    // X-Idempotency-Key: booking.id garante que retentativas não geram duplicatas
    requestOptions: { idempotencyKey: externalRef },
  })

  // Extrai juro de parcelamento da lista de fees retornada pelo MP
  const financingFee = (response.fees || [])
    .filter((f) => f.fee_id === 'FINANCING_FEE' || (f.type && /juros|interest|financing/i.test(f.type)))
    .reduce((acc, f) => acc + (Number(f.value) || 0), 0)

  return {
    mp_id:                  String(response.id),
    status:                 response.status,
    status_detail:          response.status_detail || null,
    installments:           response.installments || installments,
    installment_amount:     response.transaction_details?.installment_amount ?? null,
    installment_fee_amount: financingFee > 0 ? financingFee : null,
    card_last_four:         response.card?.last_four_digits ?? null,
    card_brand:             response.payment_method_id ?? null,
    card_holder_name:       response.card?.cardholder?.name ?? null,
    raw:                    response,
  }
}

export async function getMpPaymentStatus(mpId) {
  if (!mp) return null
  const client = new Payment(mp)
  const r = await client.get({ id: mpId })
  return r.status
}

// Modo teste: gera um PIX fictício para desenvolvimento
function createFakePix({ amount, description, externalRef }) {
  const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${externalRef || 'test'}520400005303986540${String(amount.toFixed(2)).padStart(6,'0')}5802BR5913GIRO JERI TUR6009JERICOACOA62290525GIROJERI${Date.now()}6304ABCD`
  return {
    mp_id:      `TEST-${Date.now()}`,
    status:     'pending',
    pix_code:   fakeCode,
    qr_base64:  null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    test_mode:  true,
  }
}

export { testMode }
