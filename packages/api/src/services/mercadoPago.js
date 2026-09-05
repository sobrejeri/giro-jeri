import { MercadoPagoConfig, Payment } from 'mercadopago'

const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
const testMode    = !accessToken || accessToken.startsWith('TEST-')

const mp = accessToken
  ? new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } })
  : null

// ── Marketplace OAuth (split de pagamentos) ───────────
// Credenciais do aplicativo marketplace (criado pelo lojista no painel MP).
const OAUTH_CLIENT_ID     = process.env.MP_CLIENT_ID || process.env.MP_MARKETPLACE_CLIENT_ID || ''
const OAUTH_CLIENT_SECRET = process.env.MP_CLIENT_SECRET || process.env.MP_MARKETPLACE_CLIENT_SECRET || ''

export function calculateMarketplaceSplit(amount, platformSharePct) {
  const cents = Math.round(Number(amount) * 100)
  const pct = Number(platformSharePct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Percentual de split inválido')
  const platformCents = Math.round(cents * pct / 100)
  return { platformAmount: platformCents / 100, operatorAmount: (cents - platformCents) / 100 }
}

export function sanitizedPaymentResult(response) {
  return {
    payment_id: response?.id == null ? null : String(response.id),
    status: response?.status || null,
    status_detail: response?.status_detail || null,
    payment_method_id: response?.payment_method_id || null,
    payment_type_id: response?.payment_type_id || null,
    collector_id: response?.collector_id == null ? null : String(response.collector_id),
    transaction_amount: response?.transaction_amount == null ? null : Number(response.transaction_amount),
    installments: response?.installments == null ? null : Number(response.installments),
    external_reference: response?.external_reference == null ? null : String(response.external_reference),
  }
}

export function logPaymentResult({ bookingId, response, deviceIdPresent }) {
  const safe = sanitizedPaymentResult(response)
  console.info('[MP PAYMENT RESULT] booking_id=%s payment_id=%s status=%s status_detail=%s payment_method_id=%s payment_type_id=%s collector_id=%s amount=%s installments=%s external_reference=%s device_id_present=%s',
    bookingId, safe.payment_id, safe.status, safe.status_detail, safe.payment_method_id,
    safe.payment_type_id, safe.collector_id, safe.transaction_amount, safe.installments,
    safe.external_reference, deviceIdPresent)
  return safe
}

export function isMarketplaceConfigured() {
  return !!(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET)
}

export function getMercadoPagoEnvironment(token = accessToken) {
  if (!token) return 'unconfigured'
  return token.startsWith('TEST-') ? 'sandbox' : 'production'
}

// Cria um cliente de pagamento. Com sellerAccessToken, opera NA conta da
// cooperativa (split); sem ele, usa o token da plataforma.
function paymentClientFor(sellerAccessToken) {
  if (sellerAccessToken) {
    const cfg = new MercadoPagoConfig({ accessToken: sellerAccessToken, options: { timeout: 10000 } })
    return new Payment(cfg)
  }
  return mp ? new Payment(mp) : null
}

// Formata uma data no padrão que o Mercado Pago espera em date_of_expiration:
// ISO 8601 com offset (ex.: 2026-06-24T21:45:00.000+00:00). O MP pode recusar o
// formato UTC com "Z".
function mpDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  const off  = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const oh   = pad(Math.floor(Math.abs(off) / 60))
  const om   = pad(Math.abs(off) % 60)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000${sign}${oh}:${om}`
}

export async function createPixPayment({ amount, description, payerEmail, payerName, payerDoc, externalRef, sellerAccessToken, applicationFee }) {
  const client = paymentClientFor(sellerAccessToken)
  // Sem token nenhum (nem da plataforma, nem da cooperativa) = configuração
  // ausente. Erro claro em vez de um PIX falso que só "expira".
  if (!client) throw new Error('Mercado Pago não configurado: falta o Access Token (MP_ACCESS_TOKEN) no servidor.')

  // Render expõe RENDER_EXTERNAL_URL automaticamente; API_BASE_URL como fallback manual
  const apiBase = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || ''
  const notificationUrl = apiBase ? `${apiBase}/api/payments/webhook` : undefined

  if (!payerEmail) throw new Error('E-mail do comprador ausente; pagamento não criado.')
  const parts = String(payerName || '').trim().split(/\s+/).filter(Boolean)
  const body = {
    transaction_amount: amount,
    description,
    payment_method_id:  'pix',
    external_reference: String(externalRef),
    // Validade explícita do QR (30 min) — não depende do padrão do MP.
    date_of_expiration: mpDate(new Date(Date.now() + 30 * 60 * 1000)),
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    payer: {
      email: payerEmail,
      ...(parts[0] ? { first_name: parts[0] } : {}),
      ...(parts.length > 1 ? { last_name: parts.slice(1).join(' ') } : {}),
      // Identificação do pagador (o Payment Brick envia o CPF/CNPJ no PIX)
      ...(payerDoc ? { identification: { type: String(payerDoc).length === 14 ? 'CNPJ' : 'CPF', number: payerDoc } } : {}),
    },
  }
  // Split: comissão da plataforma quando o pagamento cai na conta da cooperativa
  if (sellerAccessToken && applicationFee > 0) {
    body.application_fee = Math.round(applicationFee * 100) / 100
  }

  const response = await client.create({ body })

  return {
    mp_id:         String(response.id),
    status:        response.status,
    status_detail: response.status_detail || null,
    pix_code:      response.point_of_interaction?.transaction_data?.qr_code,
    qr_base64:     response.point_of_interaction?.transaction_data?.qr_code_base64,
    expires_at:    response.date_of_expiration,
  }
}

// =============================================================================
// MOTOR DE PERNAS (Etapa 2, Onda A) — split nativo N-recebedores
// =============================================================================
// "Split de pagamentos" do Mercado Pago Brasil: 1 pagamento com N
// `disbursements`, cada um com collector_id (mp_user_id da coop) + amount +
// application_fee (comissão da plataforma sobre a fatia daquela perna).
// DIFERENTE do split de 1 recebedor acima (sellerAccessToken + application_fee
// simples, que cria o pagamento NA conta da coop): aqui o pagamento é criado
// com o token da PLATAFORMA, que distribui para várias contas ao mesmo tempo.
// Requer a aplicação marketplace com "Split de pagamentos" habilitado no
// painel do MP — NÃO validado em produção/sandbox real neste ambiente (sem
// acesso a uma conta MP com o recurso ativo). Ver Riscos/Objeções do handoff.
export function buildDisbursements(recipients) {
  return recipients.map((r) => ({
    amount:              Math.round(r.amount * 100) / 100,
    collector_id:        Number(r.collectorId),
    ...(r.applicationFee > 0 ? { application_fee: Math.round(r.applicationFee * 100) / 100 } : {}),
    external_reference:  r.externalReference,
  }))
}

export async function createPixPaymentSplit({ amount, description, payerEmail, payerName, payerDoc, externalRef, disbursements }) {
  if (!mp) throw new Error('Mercado Pago não configurado: falta o Access Token da plataforma (MP_ACCESS_TOKEN) para o split multi-recebedor.')
  if (!disbursements?.length) throw new Error('Split multi-recebedor exige ao menos 1 disbursement.')

  const client = new Payment(mp)
  const apiBase = process.env.RENDER_EXTERNAL_URL || process.env.API_BASE_URL || ''
  const notificationUrl = apiBase ? `${apiBase}/api/payments/webhook` : undefined

  if (!payerEmail) throw new Error('E-mail do comprador ausente; pagamento não criado.')
  const parts = String(payerName || '').trim().split(/\s+/).filter(Boolean)
  const body = {
    transaction_amount: amount,
    description,
    payment_method_id:  'pix',
    external_reference: String(externalRef),
    date_of_expiration: mpDate(new Date(Date.now() + 30 * 60 * 1000)),
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    payer: {
      email: payerEmail,
      ...(parts[0] ? { first_name: parts[0] } : {}),
      ...(parts.length > 1 ? { last_name: parts.slice(1).join(' ') } : {}),
      ...(payerDoc ? { identification: { type: String(payerDoc).length === 14 ? 'CNPJ' : 'CPF', number: payerDoc } } : {}),
    },
    disbursements,
  }

  const response = await client.create({ body })

  return {
    mp_id:         String(response.id),
    status:        response.status,
    status_detail: response.status_detail || null,
    pix_code:      response.point_of_interaction?.transaction_data?.qr_code,
    qr_base64:     response.point_of_interaction?.transaction_data?.qr_code_base64,
    expires_at:    response.date_of_expiration,
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

export function rejectionUserMessage(statusDetail) {
  if (statusDetail === 'cc_rejected_high_risk') return 'Pagamento não aprovado por segurança. Tente outro meio de pagamento.'
  if (statusDetail === 'cc_rejected_insufficient_amount') return 'Pagamento não aprovado. Verifique limite ou saldo disponível.'
  return 'Pagamento não aprovado. Revise os dados ou tente outro meio de pagamento.'
}

export function normalizeCardPaymentResponse(response, fallbackInstallments = 1) {
  const diagnostic = sanitizedPaymentResult(response)
  const financingFee = (response?.fees || [])
    .filter((f) => f.fee_id === 'FINANCING_FEE' || (f.type && /juros|interest|financing/i.test(f.type)))
    .reduce((acc, f) => acc + (Number(f.value) || 0), 0)
  return {
    mp_id: String(response.id), status: response.status, status_detail: response.status_detail || null,
    installments: response.installments || fallbackInstallments,
    installment_amount: response.transaction_details?.installment_amount ?? null,
    installment_fee_amount: financingFee > 0 ? financingFee : null,
    card_last_four: response.card?.last_four_digits ?? null,
    card_brand: response.payment_method_id ?? null,
    card_holder_name: response.card?.cardholder?.name ?? null,
    collector_id: diagnostic.collector_id, diagnostic,
  }
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
  sellerAccessToken,
  applicationFee,
  idempotencyKey,
  deviceId,
  payerFirstName,
  payerLastName,
  item,
  bookingId,
  paymentClient,
}) {
  // Com split, opera na conta da cooperativa; sem split, na conta da plataforma.
  // Sem fallback fake para cartão — erro propaga para o caller.
  const client = paymentClient || paymentClientFor(sellerAccessToken)
  if (!client) throw new Error('Mercado Pago não configurado (access token ausente)')
  if (!payerEmail) throw new Error('E-mail do comprador ausente; pagamento não criado.')
  if (!idempotencyKey) throw new Error('payment_attempt_id ausente; pagamento não criado.')

  const body = {
    transaction_amount: amount,
    description,
    installments:       Number(installments) || 1,
    payment_method_id:  paymentMethodId,
    token:              cardToken,
    statement_descriptor: 'TURIVA',
    external_reference: externalRef,
    metadata: { booking_id: bookingId || externalRef, payment_attempt_id: idempotencyKey },
    payer: {
      email:          payerEmail,
      ...(payerFirstName ? { first_name: payerFirstName } : {}),
      ...(payerLastName ? { last_name: payerLastName } : {}),
      identification: { type: 'CPF', number: payerDoc },
    },
    ...(item ? { additional_info: { items: [item], payer: {
      ...(payerFirstName ? { first_name: payerFirstName } : {}),
      ...(payerLastName ? { last_name: payerLastName } : {}),
    } } } : {}),
  }

  // issuer_id é opcional — não enviar quando undefined para evitar rejeição MP
  if (issuerId) body.issuer_id = String(issuerId)

  // Split: comissão da plataforma quando o pagamento cai na conta da cooperativa
  if (sellerAccessToken && applicationFee > 0) {
    body.application_fee = Math.round(applicationFee * 100) / 100
  }

  const response = await client.create({
    body,
    requestOptions: { idempotencyKey, ...(deviceId ? { meliSessionId: deviceId } : {}) },
  })
  const diagnostic = logPaymentResult({ bookingId: bookingId || externalRef, response, deviceIdPresent: !!deviceId })

  return { ...normalizeCardPaymentResponse(response, installments), diagnostic }
}

export async function findMpPaymentByExternalReference(externalRef, sellerAccessToken) {
  const client = paymentClientFor(sellerAccessToken)
  if (!client) return null
  const found = await client.search({ options: { external_reference: String(externalRef), limit: 1 } })
  const id = found?.results?.[0]?.id
  if (!id) return null
  return client.get({ id })
}

export async function getMpPaymentStatus(mpId, sellerAccessToken) {
  // Pagamento com split vive na conta da cooperativa → consultar com o token dela.
  const client = paymentClientFor(sellerAccessToken)
  if (!client) return null
  const r = await client.get({ id: mpId })
  return sanitizedPaymentResult(r)
}

export async function getMpPayment(mpId, sellerAccessToken) {
  const client = paymentClientFor(sellerAccessToken)
  return client ? client.get({ id: mpId }) : null
}

// ── OAuth: autorização e troca de código ──────────────
export function buildOAuthAuthorizeUrl({ redirectUri, state }) {
  const params = new URLSearchParams({
    client_id:     OAUTH_CLIENT_ID,
    response_type: 'code',
    platform_id:   'mp',
    redirect_uri:  redirectUri,
    ...(state ? { state } : {}),
  })
  return `https://auth.mercadopago.com.br/authorization?${params.toString()}`
}

async function oauthToken(payload) {
  const res = await fetch('https://api.mercadopago.com/oauth/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Mercado Pago OAuth erro ${res.status}`)
  return data // { access_token, refresh_token, user_id, public_key, expires_in, live_mode, ... }
}

export function exchangeOAuthCode({ code, redirectUri }) {
  return oauthToken({
    client_id:     OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
  })
}

export function refreshOAuthToken({ refreshToken }) {
  return oauthToken({
    client_id:     OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  })
}

// Modo teste: gera um PIX fictício para desenvolvimento
function createFakePix({ amount, description, externalRef }) {
  const fakeCode = `00020126580014BR.GOV.BCB.PIX0136${externalRef || 'test'}520400005303986540${String(amount.toFixed(2)).padStart(6,'0')}5802BR5906TURIVA6009JERICOACOA62290525TURIVA${Date.now()}6304ABCD`
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
