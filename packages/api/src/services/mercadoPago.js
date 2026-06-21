import { MercadoPagoConfig, Payment } from 'mercadopago'

const accessToken = process.env.MP_ACCESS_TOKEN || ''
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
