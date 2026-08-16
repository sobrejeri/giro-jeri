// ── lib/osToken.js ──────────────────────────────────────
// Token do LINK PÚBLICO da Ordem de Serviço, enviado no WhatsApp do cliente e
// do motorista. Quem tem o link vê a OS daquela reserva — não exige login
// (o passageiro e o motorista não têm conta na cooperativa).
//
// Por que token assinado e não o id da reserva na URL: o id é sequencialmente
// descobrível em outros endpoints e a OS traz telefone e nome do cliente. Com
// HMAC, só quem recebeu o link abre.
//
// Validade longa (180 dias): a corrida pode ser daqui a meses e o link precisa
// continuar valendo no dia do serviço.
import crypto from 'crypto';
import { secretFor } from './tokenSecret.js';

const SECRET = () => secretFor('os_view');
const TTL_DIAS = 180;

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
function b64urlDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
const HEADER_B64 = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

export function signOsToken(bookingId) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { purpose: 'os_view', booking_id: bookingId, iat: now, exp: now + TTL_DIAS * 86400 };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const data = `${HEADER_B64}.${body}`;
  const sig  = b64url(crypto.createHmac('sha256', SECRET()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyOsToken(token) {
  if (!token || typeof token !== 'string') { const e = new Error('Link inválido'); e.status = 400; throw e; }
  const parts = token.split('.');
  if (parts.length !== 3) { const e = new Error('Link inválido'); e.status = 400; throw e; }
  const [h, b, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', SECRET()).update(`${h}.${b}`).digest());
  if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) {
    const e = new Error('Link inválido'); e.status = 400; throw e;
  }
  let claims;
  try { claims = JSON.parse(b64urlDecode(b).toString('utf8')); }
  catch { const e = new Error('Link inválido'); e.status = 400; throw e; }
  if (claims.purpose !== 'os_view') { const e = new Error('Link inválido'); e.status = 400; throw e; }
  if (claims.exp < Math.floor(Date.now() / 1000)) { const e = new Error('Este link expirou.'); e.status = 410; throw e; }
  return { booking_id: claims.booking_id };
}
