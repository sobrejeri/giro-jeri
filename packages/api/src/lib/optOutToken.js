// ── lib/optOutToken.js ──────────────────────────────────
// Token do link de DESCADASTRO das ofertas, enviado no rodapé de cada mensagem
// promocional. Quem tem o link desliga as ofertas daquele cadastro — sem login,
// porque exigir senha para PARAR de receber mensagem é o tipo de atrito que faz
// a pessoa denunciar o número em vez de se descadastrar (e denúncia derruba o
// número da empresa no WhatsApp).
//
// Sem validade: a mensagem pode ficar meses no histórico da conversa e o link
// precisa continuar funcionando. É um token que só sabe DESLIGAR — não lê nem
// altera mais nada do cadastro.
import crypto from 'crypto';
import { secretFor } from './tokenSecret.js';

const SECRET = () => secretFor('marketing_opt_out');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
function b64urlDecode(str) {
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
const HEADER_B64 = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

export function signOptOutToken(userId) {
  const claims = { purpose: 'marketing_opt_out', user_id: userId, iat: Math.floor(Date.now() / 1000) };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const data = `${HEADER_B64}.${body}`;
  const sig  = b64url(crypto.createHmac('sha256', SECRET()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyOptOutToken(token) {
  const invalido = () => { const e = new Error('Link inválido'); e.status = 400; return e; };
  if (!token || typeof token !== 'string') throw invalido();
  const parts = token.split('.');
  if (parts.length !== 3) throw invalido();
  const [h, b, s] = parts;
  const expected = b64url(crypto.createHmac('sha256', SECRET()).update(`${h}.${b}`).digest());
  // Compara o tamanho ANTES do timingSafeEqual: com buffers de tamanhos
  // diferentes ele lança em vez de devolver false, e a exceção subiria como 500.
  if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) {
    throw invalido();
  }
  let claims;
  try { claims = JSON.parse(b64urlDecode(b).toString('utf8')); } catch { throw invalido(); }
  if (claims.purpose !== 'marketing_opt_out') throw invalido();
  return { user_id: claims.user_id };
}
