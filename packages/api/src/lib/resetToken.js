// ── lib/resetToken.js ───────────────────────────────────
// JWT HS256 leve para RESET DE SENHA (link enviado por WhatsApp/e-mail).
// Claims: { purpose:'pwd_reset', user_id, iat, exp }. Expira em 30 min.
import crypto from 'crypto';

const SECRET = process.env.SIGNUP_TOKEN_SECRET || 'giro-jeri-signup-dev-secret-change-in-prod';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
function b64urlDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
const HEADER_B64 = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

export function signResetToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { purpose: 'pwd_reset', user_id: userId, iat: now, exp: now + 30 * 60 };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const data = `${HEADER_B64}.${body}`;
  const sig  = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyResetToken(token) {
  if (!token || typeof token !== 'string') { const e = new Error('Token ausente'); e.status = 400; throw e; }
  const parts = token.split('.');
  if (parts.length !== 3) { const e = new Error('Token malformado'); e.status = 400; throw e; }
  const [h, b, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest());
  if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) {
    const e = new Error('Token inválido'); e.status = 400; throw e;
  }
  let claims;
  try { claims = JSON.parse(b64urlDecode(b).toString('utf8')); }
  catch { const e = new Error('Token malformado'); e.status = 400; throw e; }
  if (claims.purpose !== 'pwd_reset') { const e = new Error('Token inválido'); e.status = 400; throw e; }
  if (claims.exp < Math.floor(Date.now() / 1000)) { const e = new Error('Link expirado — peça um novo.'); e.status = 410; throw e; }
  return { user_id: claims.user_id };
}
