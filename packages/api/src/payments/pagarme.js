// ── pagarme.js ─────────────────────────────────────────
// Adapter do Pagar.me v5 (Stone). Cobrança PIX e cartão com split, além do
// cadastro de recebedores (split). Autenticação: Basic com a Secret Key
// (sk_xxx) como usuário e senha vazia.
//
// Docs: https://docs.pagar.me/reference

const BASE = 'https://api.pagar.me/core/v5'

function authHeader(apiKey) {
  if (!apiKey) throw new Error('API Key do Pagar.me não configurada em Configurações → Pagamentos')
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
}

// Valor sempre em centavos (inteiro) para o Pagar.me.
function toCents(v) {
  return Math.round(Number(v || 0) * 100)
}

async function pagarmeFetch(path, { apiKey, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization:  authHeader(apiKey),
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  let data = null
  try { data = await res.json() } catch { /* corpo vazio */ }

  if (!res.ok) {
    // O Pagar.me devolve { message, errors: { campo: [msgs] } }
    const detail = data?.errors
      ? Object.entries(data.errors).map(([k, v]) => `${k}: ${[].concat(v).join(', ')}`).join(' | ')
      : ''
    const msg = [data?.message, detail].filter(Boolean).join(' — ') || `Pagar.me erro ${res.status}`
    const err = new Error(msg)
    err.status = res.status
    err.raw = data
    throw err
  }

  return data
}

// ── Recebedor (split) ──────────────────────────────────
// Cria um recebedor no Pagar.me e devolve o id (re_xxx) usado nas regras de
// split. Usado para registrar a conta de recebimento de cada cooperativa.
export async function createRecipient(user, apiKey /* , env */) {
  const body = {
    name:          user.full_name,
    email:         user.email,
    document:      user.document_number?.replace(/\D/g, '') || '',
    document_type: user.document_type === 'cnpj' ? 'cnpj' : 'cpf',
    type:          user.document_type === 'cnpj' ? 'company' : 'individual',
    ...(user.pix_key ? {
      pix_key: { type: user.pix_key_type, key: user.pix_key },
    } : {}),
    ...(user.bank_account_number ? {
      default_bank_account: {
        holder_name:      user.full_name,
        holder_type:      user.document_type === 'cnpj' ? 'company' : 'individual',
        holder_document:  user.document_number?.replace(/\D/g, '') || '',
        bank:             user.bank_agency?.slice(0, 3) || '000',
        branch_number:    user.bank_agency || '',
        account_number:   user.bank_account_number,
        type:             user.bank_account_type === 'poupanca' ? 'savings' : 'checking',
      },
    } : {}),
  }

  const data = await pagarmeFetch('/recipients', { apiKey, method: 'POST', body })
  return data.id
}

// ── Cobrança (order) ───────────────────────────────────
// Cria uma order com uma cobrança (charge) PIX ou cartão de crédito, com split
// opcional. Devolve um objeto normalizado independente do método.
//
// method: 'pix' | 'credit_card'
export async function createOrder({
  apiKey, method,
  amount, description, customer, code, metadata,
  cardToken, installments = 1, statementDescriptor = 'TURIVA',
  split, pixExpiresIn = 30 * 60,
}) {
  const cents = toCents(amount)
  if (cents < 100) throw new Error('Valor mínimo para cobrança é R$ 1,00')

  const payment = { payment_method: method }
  if (method === 'pix') {
    payment.pix = { expires_in: pixExpiresIn }
  } else {
    if (!cardToken) throw new Error('Token do cartão ausente')
    payment.credit_card = {
      installments:         Math.max(1, Number(installments) || 1),
      statement_descriptor: statementDescriptor.slice(0, 13),
      operation_type:       'auth_and_capture',
      card_token:           cardToken,
    }
  }
  // Split: cada entrada em percentual; o recebedor principal (plataforma) leva
  // charge_remainder/liable/charge_processing_fee.
  if (Array.isArray(split) && split.length) payment.split = split

  const body = {
    items: [{
      amount:      cents,
      description: (description || 'Reserva').slice(0, 255),
      quantity:    1,
      code:        code || undefined,
    }],
    customer: {
      name:  customer?.name || 'Cliente',
      email: customer?.email || undefined,
      type:  customer?.type === 'company' ? 'company' : 'individual',
      ...(customer?.document ? {
        document:      String(customer.document).replace(/\D/g, ''),
        document_type: customer?.type === 'company' ? 'CNPJ' : 'CPF',
      } : {}),
    },
    payments: [payment],
    code:     code || undefined,
    ...(metadata ? { metadata } : {}),
  }

  const data = await pagarmeFetch('/orders', { apiKey, method: 'POST', body })
  return normalizeOrder(data)
}

// ── Consulta de order ──────────────────────────────────
// Refetch autoritativo do status — usado no webhook e no polling para nunca
// confiar apenas no payload recebido.
export async function getOrder({ apiKey, orderId }) {
  if (!orderId) return null
  const data = await pagarmeFetch(`/orders/${orderId}`, { apiKey })
  return normalizeOrder(data)
}

// ── Normalização ───────────────────────────────────────
// Achata a resposta do Pagar.me num formato estável para o restante da API.
function normalizeOrder(order) {
  const charge = order?.charges?.[0] || {}
  const tx     = charge.last_transaction || {}
  const card   = tx.card || {}
  const status = order?.status || charge.status || 'unknown' // paid | pending | processing | failed | canceled

  return {
    id:            order?.id || null,          // or_xxx
    status,
    paid:          status === 'paid',
    failed:        ['failed', 'canceled'].includes(status),
    // PIX (copia-e-cola EMV + URL da imagem do QR)
    pix_code:      tx.qr_code || null,
    qr_code_url:   tx.qr_code_url || null,
    expires_at:    tx.expires_at || null,
    // Cartão
    installments:  tx.installments || null,
    card_last_four: card.last_four_digits || null,
    card_brand:    card.brand || null,
    card_holder_name: card.holder_name || null,
    status_detail: tx.acquirer_message || tx.gateway_response?.code || null,
    raw:           order,
  }
}
