// ── lib/signupToken.js ──────────────────────────────────
// JWT HS256 leve implementado via crypto (sem dependência extra).
// Claims: { purpose:'signup', user_id, phone_required, iat, exp }
// Expiração padrão: 30 minutos.

import crypto from 'crypto';

const SECRET = process.env.SIGNUP_TOKEN_SECRET || 'giro-jeri-signup-dev-secret-change-in-prod';

// ATENÇÃO: o fallback acima é documentado e serve apenas para desenvolvimento local.
// Em produção, defina SIGNUP_TOKEN_SECRET com pelo menos 32 bytes aleatórios.

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const HEADER_B64 = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

function sign(payload) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    purpose:        'signup',
    iat:            now,
    exp:            now + 30 * 60,   // 30 min
    ...payload,
  };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const data = `${HEADER_B64}.${body}`;
  const sig  = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());
  return `${data}.${sig}`;
}

/**
 * Verifica e decodifica o token.
 * Lança um Error com .status se inválido/expirado/propósito errado.
 * @returns {{ user_id: string, phone_required: boolean }}
 */
function verify(token) {
  if (!token || typeof token !== 'string') {
    const e = new Error('signup_token ausente'); e.status = 400; throw e;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    const e = new Error('signup_token malformado'); e.status = 400; throw e;
  }

  const [headerB64, bodyB64, sigB64] = parts;
  const data        = `${headerB64}.${bodyB64}`;
  const expectedSig = b64url(crypto.createHmac('sha256', SECRET).update(data).digest());

  // Comparação em tempo constante
  if (!crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig))) {
    const e = new Error('signup_token inválido'); e.status = 400; throw e;
  }

  let claims;
  try {
    claims = JSON.parse(b64urlDecode(bodyB64).toString('utf8'));
  } catch {
    const e = new Error('signup_token malformado'); e.status = 400; throw e;
  }

  if (claims.purpose !== 'signup') {
    const e = new Error('signup_token propósito inválido'); e.status = 400; throw e;
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    const e = new Error('signup_token expirado'); e.status = 410; throw e;
  }

  return {
    user_id:        claims.user_id,
    phone_required: !!claims.phone_required,
  };
}

export { sign as signSignupToken, verify as verifySignupToken };
