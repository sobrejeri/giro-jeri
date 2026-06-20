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
