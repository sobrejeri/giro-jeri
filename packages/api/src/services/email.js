// ── email.js ───────────────────────────────────────────
// E-mails transacionais via Resend (https://resend.com).
// Sem RESEND_API_KEY configurada, vira no-op silencioso — nunca
// derruba o fluxo de pagamento/reserva.

const RESEND_URL = 'https://api.resend.com/emails';

export function isEmailEnabled() {
  return !!process.env.RESEND_API_KEY;
}

async function send({ to, subject, html }) {
  if (!isEmailEnabled()) return { skipped: true };
  try {
    const res = await fetch(RESEND_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Turiva <onboarding@resend.dev>',
        to:   [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[email] Resend respondeu', res.status, body.slice(0, 300));
      return { error: true };
    }
    return await res.json();
  } catch (err) {
    console.error('[email] falha ao enviar:', err.message);
    return { error: true };
  }
}

function layout(inner) {
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#FF6A00,#FF8A3D);padding:28px 32px;">
            <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:-0.3px;">Turiva</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Passeios &amp; transfers em Jericoacoara</p>
          </td>
        </tr>
        <tr><td style="padding:32px;">${inner}</td></tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #f0f0f0;">
            <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">
              Você recebeu este e-mail porque tem uma conta no Turiva.<br/>
              Jericoacoara — Ceará, Brasil
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function fmtDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ── OTP de verificação de e-mail ──────────────────────
const OTP_SUBJECTS = {
  pt: (code) => `Seu código Turiva: ${code}`,
  en: (code) => `Your Turiva code: ${code}`,
  es: (code) => `Tu código Turiva: ${code}`,
};

const OTP_BODIES = {
  pt: (code) => `
    <p style="margin:0 0 6px;color:#111827;font-size:18px;font-weight:bold;">Confirme seu e-mail</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      Use o código abaixo para confirmar seu e-mail no Turiva.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#FF6A00;">${code}</span>
    </div>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
      O código expira em 10 minutos.
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
      Se não foi você, ignore este e-mail.
    </p>
  `,
  en: (code) => `
    <p style="margin:0 0 6px;color:#111827;font-size:18px;font-weight:bold;">Confirm your email</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      Use the code below to confirm your email on Turiva.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#FF6A00;">${code}</span>
    </div>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
      This code expires in 10 minutes.
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
      If this wasn't you, please ignore this email.
    </p>
  `,
  es: (code) => `
    <p style="margin:0 0 6px;color:#111827;font-size:18px;font-weight:bold;">Confirma tu correo</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:14px;line-height:1.6;">
      Usa el código de abajo para confirmar tu correo en Turiva.
    </p>
    <div style="background:#f9fafb;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#FF6A00;">${code}</span>
    </div>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;">
      El código vence en 10 minutos.
    </p>
    <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
      Si no fuiste tú, ignora este correo.
    </p>
  `,
};

export async function sendEmailOtp({ to, code, lang = 'pt' }) {
  if (!to) return { skipped: true };
  const subjectFn = OTP_SUBJECTS[lang] || OTP_SUBJECTS['pt'];
  const bodyFn    = OTP_BODIES[lang]   || OTP_BODIES['pt'];
  return send({
    to,
    subject: subjectFn(code),
    html:    layout(bodyFn(code)),
  });
}

// ── Confirmação de reserva (pagamento aprovado) ────────
export async function sendBookingConfirmation({
  to, name, bookingCode, serviceName,
  serviceDate, serviceTime, peopleCount, totalAmount,
}) {
  if (!to) return { skipped: true };
  const rows = [
    ['Código',   `<strong>${bookingCode || '—'}</strong>`],
    ['Serviço',  serviceName || 'Reserva'],
    ['Data',     `${fmtDateBR(serviceDate)}${serviceTime ? ` às ${serviceTime}` : ''}`],
    ['Pessoas',  String(peopleCount || 1)],
    ['Total',    `<strong style="color:#059669;">${fmtBRL(totalAmount)}</strong>`],
  ].map(([k, v]) => `
    <tr>
      <td style="padding:8px 0;color:#6b7280;font-size:13px;">${k}</td>
      <td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;">${v}</td>
    </tr>`).join('');

  return send({
    to,
    subject: `✅ Reserva confirmada — ${bookingCode}`,
    html: layout(`
      <p style="margin:0 0 6px;color:#111827;font-size:18px;font-weight:bold;">Pagamento aprovado! 🎉</p>
      <p style="margin:0 0 20px;color:#4b5563;font-size:14px;line-height:1.6;">
        Olá${name ? `, <strong>${name}</strong>` : ''}! Sua reserva está confirmada.
        Apresente o código abaixo no dia do passeio.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;padding:8px 16px;">
        ${rows}
      </table>
      <p style="margin:20px 0 0;color:#6b7280;font-size:12px;line-height:1.6;">
        Dúvidas? Acesse <em>Minhas Reservas</em> no app ou fale com a gente pelo WhatsApp.
      </p>
    `),
  });
}
