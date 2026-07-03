// ── whatsapp.js ─────────────────────────────────────────
// Envio de mensagens via Z-API (https://z-api.io).
// Sem credenciais configuradas, vira no-op silencioso — nunca
// derruba o fluxo de cadastro/verificação.

const ZAPI_BASE = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';

export function isWhatsappEnabled() {
  return !!(
    process.env.ZAPI_INSTANCE_ID &&
    process.env.ZAPI_INSTANCE_TOKEN &&
    process.env.ZAPI_CLIENT_TOKEN
  );
}

/**
 * Remove tudo que não for dígito do número E.164.
 * '+5588999999999' → '5588999999999'
 */
export function toZapiPhone(e164) {
  return String(e164 || '').replace(/\D/g, '');
}

const MESSAGES = {
  pt: (code) =>
    `Giro Jeri: seu código de verificação é ${code}. Válido por 10 minutos. Não compartilhe.`,
  en: (code) =>
    `Giro Jeri: your verification code is ${code}. Valid for 10 minutes. Do not share.`,
  es: (code) =>
    `Giro Jeri: tu código de verificación es ${code}. Válido por 10 minutos. No lo compartas.`,
};

/**
 * Envia OTP via WhatsApp (Z-API).
 * @param {{ phone: string, code: string, lang?: string }} opts
 *   phone deve estar em E.164 ('+55...')
 */
function bookingSummary(booking) {
  const tipo = booking.service_type === 'transfer' ? 'Translado' : 'Passeio'
  const rota = [booking.origin_text, booking.destination_text].filter(Boolean).join(' → ')
  const data = booking.service_date
    ? new Date(booking.service_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'a definir'
  return { tipo, rota, data }
}

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function sendToMany(numbers, message) {
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`
  await Promise.allSettled(
    numbers
      .filter(Boolean)
      .map((phone) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
          body: JSON.stringify({ phone: toZapiPhone(phone), message }),
        }).catch((err) => console.error('[whatsapp] envio falhou:', err.message))
      )
  )
}

// Busca o telefone de um usuário (cliente ou operador) por id.
async function userPhone(supabase, userId) {
  if (!userId) return null
  const { data } = await supabase.from('users').select('phone').eq('id', userId).maybeSingle()
  return data?.phone || null
}

// Envia pra 1 número e RETORNA o resultado da Z-API (usado no diagnóstico).
export async function sendTestMessage(phone) {
  if (!isWhatsappEnabled()) return { skipped: true, reason: 'Z-API não configurada' }
  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
      body: JSON.stringify({
        phone:   toZapiPhone(phone),
        message: '✅ Giro Jeri — teste de integração WhatsApp. Se você recebeu isto, o Z-API está funcionando!',
      }),
    })
    const body = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * WhatsApp para TODAS as cooperativas ativas — solicitação nova.
 * Admin não recebe aqui; só após a expiração (notifyAdminExpiredBooking).
 * Fire-and-forget: erros logados, nunca derrubam o fluxo.
 */
export async function notifyOperatorsNewBooking(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }

  const { data: operators } = await supabase
    .from('users')
    .select('phone')
    .eq('user_type', 'operator')
    .eq('is_active', true)

  if (!operators?.length) return { skipped: true }

  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `🚗 *Giro Jeri — Nova solicitação*\n` +
    `${tipo}${rota ? ` · ${rota}` : ''}\n` +
    `📅 ${data} · Cód: ${booking.booking_code || '-'}\n` +
    `Você tem 24h para aceitar. Abra o app pra ver.`

  await sendToMany(operators.map((op) => op.phone), message)
}

/**
 * WhatsApp pras cooperativas — nova cotação de translado personalizado.
 * Diferente da reserva: a coop precisa abrir e enviar o PREÇO, não só aceitar.
 */
export async function notifyOperatorsNewQuote(supabase, quote) {
  if (!isWhatsappEnabled() || !quote) return { skipped: true }

  const { data: operators } = await supabase
    .from('users')
    .select('phone')
    .eq('user_type', 'operator')
    .eq('is_active', true)

  if (!operators?.length) return { skipped: true }

  const rota = [quote.origin_place_name, quote.destination_place_name].filter(Boolean).join(' → ')
  const data = quote.service_date
    ? new Date(quote.service_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'a definir'
  const hora = quote.service_time ? ` ${quote.service_time.slice(0, 5)}` : ''

  const message =
    `💸 *Giro Jeri — Nova cotação personalizada*\n` +
    `Translado privativo${rota ? ` · ${rota}` : ''}\n` +
    `📅 ${data}${hora} · ${quote.people_count || 1} pax\n` +
    `Abra o app pra enviar o valor ao cliente.`

  await sendToMany(operators.map((op) => op.phone), message)
}

/**
 * WhatsApp para o(s) admin(s) — solicitação que ninguém aceitou em 24h.
 * Chamado de forma lazy pelo /api/operator/bookings ao detectar expiradas
 * ainda sem aviso (flag bookings.admin_notified_expired_at).
 */
export async function notifyAdminExpiredBooking(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }

  const { data: admins } = await supabase
    .from('users')
    .select('phone')
    .eq('user_type', 'admin')
    .eq('is_active', true)

  if (!admins?.length) return { skipped: true }

  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `⚠️ *Giro Jeri — Solicitação expirada*\n` +
    `Nenhuma cooperativa aceitou em 24h.\n` +
    `${tipo}${rota ? ` · ${rota}` : ''}\n` +
    `📅 ${data} · Cód: ${booking.booking_code || '-'}\n` +
    `Acesse o app da cooperativa pra assumir.`

  await sendToMany(admins.map((a) => a.phone), message)
}

// ── CLIENTE ────────────────────────────────────────────
// Cooperativa aceitou → cliente precisa PAGAR pra confirmar. Gatilho de
// conversão mais crítico: sem isso o cliente não sabe que pode pagar.
export async function notifyClientBookingAccepted(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `🎉 *Giro Jeri — Cooperativa aceitou!*\n` +
    `${tipo}${rota ? ` · ${rota}` : ''}\n` +
    `📅 ${data} · ${fmtBRL(booking.total_amount)}\n` +
    `Abra o app e *pague* para confirmar sua reserva (${booking.booking_code || '-'}).`
  await sendToMany([phone], message)
}

// Cotação personalizada precificada → cliente vê o valor e decide.
export async function notifyClientQuoteReady(supabase, quote) {
  if (!isWhatsappEnabled() || !quote) return { skipped: true }
  const phone = await userPhone(supabase, quote.user_id)
  if (!phone) return { skipped: true }
  const rota = [quote.origin_place_name, quote.destination_place_name].filter(Boolean).join(' → ')
  const message =
    `💸 *Giro Jeri — Sua cotação está pronta!*\n` +
    `Translado${rota ? ` · ${rota}` : ''}\n` +
    `Valor: *${fmtBRL(quote.quoted_price)}*\n` +
    `Abra o app para aceitar e pagar (válido por tempo limitado).`
  await sendToMany([phone], message)
}

// Pagamento confirmado → segurança pro cliente de que deu tudo certo.
export async function notifyClientPaymentConfirmed(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }
  const phone = await userPhone(supabase, booking.user_id)
  if (!phone) return { skipped: true }
  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `✅ *Giro Jeri — Pagamento confirmado!*\n` +
    `${tipo}${rota ? ` · ${rota}` : ''}\n` +
    `📅 ${data} · ${booking.booking_code || '-'}\n` +
    `Tudo certo! A cooperativa vai cuidar do seu atendimento. 🚗`
  await sendToMany([phone], message)
}

// ── COOPERATIVA ────────────────────────────────────────
// Cliente pagou → a coop que aceitou precisa confirmar/despachar. Momento
// em que a coop tem que AGIR, por isso vale o WhatsApp (além da central).
export async function notifyOperatorPaymentReceived(supabase, booking) {
  if (!isWhatsappEnabled() || !booking?.operator_id) return { skipped: true }
  const phone = await userPhone(supabase, booking.operator_id)
  if (!phone) return { skipped: true }
  const { tipo, rota, data } = bookingSummary(booking)
  const message =
    `💰 *Giro Jeri — Cliente pagou!*\n` +
    `${tipo}${rota ? ` · ${rota}` : ''}\n` +
    `📅 ${data} · ${fmtBRL(booking.total_amount)} · ${booking.booking_code || '-'}\n` +
    `Abra o app para confirmar e seguir com o atendimento.`
  await sendToMany([phone], message)
}

export async function sendWhatsappOtp({ phone, code, lang = 'pt' }) {
  if (!isWhatsappEnabled()) return { skipped: true };

  const msgFn = MESSAGES[lang] || MESSAGES['pt'];
  const message = msgFn(code);

  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`;

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token':  ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone:   toZapiPhone(phone),
        message,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[whatsapp] Z-API respondeu', res.status, body.slice(0, 300));
      return { error: true };
    }

    return await res.json();
  } catch (err) {
    console.error('[whatsapp] falha ao enviar:', err.message);
    return { error: true };
  }
}
