// ── lib/tokenSecret.js ──────────────────────────────────
// Resolve o segredo HMAC dos tokens curtos da aplicação (ativação de cadastro,
// reset de senha).
//
// POR QUE ESTE ARQUIVO EXISTE: antes, cada lib tinha
//   process.env.SIGNUP_TOKEN_SECRET || 'giro-jeri-signup-dev-secret-change-in-prod'
// e essa string de fallback está VERSIONADA no repositório. Como
// SIGNUP_TOKEN_SECRET não é obrigatória para a API subir, qualquer ambiente que
// esquecesse de definir a env passava a assinar tokens com um segredo público —
// e o /auth/reset-password aceita o token para TROCAR A SENHA de um user_id
// arbitrário. Ou seja: takeover de qualquer conta com um token forjado.
//
// Regra agora:
//   1. Se SIGNUP_TOKEN_SECRET estiver definida (32+ chars), usa ela.
//   2. Senão, DERIVA por HMAC a partir de SUPABASE_SERVICE_ROLE_KEY — que é
//      obrigatória para a API subir (supabase.js lança sem ela), tem alta
//      entropia e NUNCA está no repositório. Cada propósito recebe uma chave
//      distinta, então um token de reset não vale como token de cadastro.
//   3. Se nem isso existir, LANÇA. Nunca cai em segredo público.
import crypto from 'crypto';

const MIN_LEN = 32;

export function secretFor(purpose) {
  const explicit = process.env.SIGNUP_TOKEN_SECRET;
  const base = (explicit && explicit.length >= MIN_LEN)
    ? explicit
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base) {
    throw new Error(
      'Segredo de token ausente: defina SIGNUP_TOKEN_SECRET (32+ caracteres aleatórios).',
    );
  }
  // Env curta demais para ser um segredo real: avisa uma vez e deriva do service
  // role em vez de usar um valor fraco.
  if (explicit && explicit.length < MIN_LEN && !warned) {
    warned = true;
    console.warn('[token] SIGNUP_TOKEN_SECRET tem menos de 32 caracteres — derivando do service role key.');
  }
  // Separação por propósito: mesma base, chaves diferentes por uso.
  return crypto.createHmac('sha256', base).update(`turiva:token:${purpose}`).digest();
}

let warned = false;
