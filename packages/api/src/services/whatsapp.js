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
/**
 * Envia WhatsApp para todos os operadores ativos sobre nova reserva.
 * Fire-and-forget: erros são logados mas nunca derrubam o fluxo.
 */
export async function notifyOperatorsNewBooking(supabase, booking) {
  if (!isWhatsappEnabled() || !booking) return { skipped: true }

  const { data: operators } = await supabase
    .from('users')
    .select('whatsapp_number')
    .in('user_type', ['operator', 'admin'])
    .eq('is_active', true)

  if (!operators?.length) return { skipped: true }

  const tipo = booking.service_type === 'transfer' ? 'Translado' : 'Passeio'
  const rota = [booking.origin_text, booking.destination_text].filter(Boolean).join(' → ')
  const data = booking.service_date
    ? new Date(booking.service_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'a definir'

  const message =
    `🚗 *Giro Jeri — Nova solicitação*\n` +
    `${tipo}${rota ? ` · ${rota}` : ''}\n` +
    `📅 ${data} · Cód: ${booking.booking_code || '-'}\n` +
    `Acesse o app para aceitar.`

  const { ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env
  const url = `${ZAPI_BASE}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`

  await Promise.allSettled(
    operators
      .filter((op) => op.whatsapp_number)
      .map((op) =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
          body: JSON.stringify({ phone: toZapiPhone(op.whatsapp_number), message }),
        }).catch((err) => console.error('[whatsapp] operador falhou:', err.message))
      )
  )
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
