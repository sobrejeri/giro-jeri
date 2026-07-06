// Gateway de teste interno — nunca usar em produção
export async function createPaymentIntent({ amount, description }) {
  const ts = Date.now()
  // PIX EMV simulado (não é válido para pagamento real)
  const fakePixCode =
    `00020126580014br.gov.bcb.pix0136${crypto.randomUUID()}` +
    `5204000053039865802BR5906TURIVA6009JERICOACOA` +
    `6214051010TESTE${ts}6304ABCD`

  return {
    transaction_id: `TEST-${ts}`,
    pix_code:       fakePixCode,
    qr_base64:      null,
    expires_at:     new Date(ts + 30 * 60 * 1000).toISOString(),
  }
}
