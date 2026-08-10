// ── services/otp.js ─────────────────────────────────────
// Lógica de geração, envio e verificação de OTP.
// Usa a tabela public.otp_codes (migration 023).

import crypto from 'crypto';
import { supabase }         from '../supabase.js';
import { secretFor }        from '../lib/tokenSecret.js';
import { sendEmailOtp }     from './email.js';
import { sendWhatsappOtp }  from './whatsapp.js';

// ── Constantes ────────────────────────────────────────────
// Pepper do hash do OTP. Tinha o mesmo problema dos tokens: um fallback fixo
// VERSIONADO no repositório. Como o código é de 6 dígitos (10⁶), o pepper é a
// única coisa que impede quem leia `otp_codes.code_hash` de descobrir o código
// por força bruta. Agora usa OTP_PEPPER quando definida e, senão, deriva por
// propósito da mesma base dos tokens (ver lib/tokenSecret.js) — nunca público.
const PEPPER     = (process.env.OTP_PEPPER && process.env.OTP_PEPPER.length >= 32)
  ? process.env.OTP_PEPPER
  : secretFor('otp');

const COOLDOWN_SECONDS = 60;
const MAX_PER_HOUR     = 5;

// ── Helpers ───────────────────────────────────────────────

/** Gera 6 dígitos com padding: '007431' */
export function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** HMAC-SHA256 do código → 64 hex chars */
export function hashCode(code) {
  return crypto.createHmac('sha256', PEPPER).update(code).digest('hex');
}

/**
 * Mascara e-mail: 'joao@example.com' → 'j***@example.com'
 * Mascara phone E.164:  '+5588999001122' → '+558899****22'
 */
export function maskDestination(channel, destination) {
  if (channel === 'email') {
    const [local, domain] = destination.split('@');
    return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
  }
  // whatsapp / phone
  const digits = String(destination);
  if (digits.length < 6) return '****';
  return digits.slice(0, digits.length - 6) + '****' + digits.slice(-2);
}

// ── requestOtp ────────────────────────────────────────────

/**
 * Solicita um novo OTP para o usuário.
 * @param {{ userId: string, channel: 'email'|'whatsapp', destination: string, lang?: string }} opts
 * @returns {{ destination_masked: string, expires_in: number, retry_after: number }}
 * @throws Error com .status para cooldown (429) ou limite (429)
 */
export async function requestOtp({ userId, channel, destination, lang = 'pt' }) {
  // 1. Verificar cooldown: último OTP (ativo ou consumido) do mesmo canal
  const { data: lastOtp } = await supabase
    .from('otp_codes')
    .select('created_at, resend_count')
    .eq('user_id', userId)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastOtp) {
    const secondsSince = (Date.now() - new Date(lastOtp.created_at).getTime()) / 1000;
    if (secondsSince < COOLDOWN_SECONDS) {
      const retry_after = Math.ceil(COOLDOWN_SECONDS - secondsSince);
      const err = new Error('Aguarde antes de solicitar um novo código.');
      err.status      = 429;
      err.retry_after = retry_after;
      throw err;
    }
  }

  // 2. Verificar teto por hora: máx 5 OTPs por canal por hora
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('channel', channel)
    .gte('created_at', oneHourAgo);

  if (count >= MAX_PER_HOUR) {
    const err = new Error('Limite de códigos atingido. Tente novamente em 1 hora.');
    err.status      = 429;
    err.retry_after = 3600;
    throw err;
  }

  // 3. Invalidar OTP ativo anterior (necessário pelo índice único parcial do banco)
  await supabase
    .from('otp_codes')
    .update({ invalidated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('channel', channel)
    .is('consumed_at', null)
    .is('invalidated_at', null);

  // 4. Gerar e inserir novo OTP
  const code     = generateCode();
  const codeHash = hashCode(code);
  const now      = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // +10 min

  const { error: insertErr } = await supabase
    .from('otp_codes')
    .insert({
      user_id:     userId,
      channel,
      destination,
      code_hash:   codeHash,
      created_at:  now.toISOString(),
      expires_at:  expiresAt.toISOString(),
    });

  if (insertErr) {
    const err = new Error('Erro ao gerar código de verificação.');
    err.status = 500;
    throw err;
  }

  // 5. Disparar envio. NÃO bloqueia em caso de falha do canal (comportamento
  //    histórico), mas REPORTA se a mensagem saiu — quem chama decide o que
  //    fazer. O cadastro usa isso para não deixar a conta presa num estado
  //    "aguardando código" quando o código nunca foi entregue.
  let sendResult;
  if (channel === 'email') {
    sendResult = await sendEmailOtp({ to: destination, code, lang });
  } else if (channel === 'whatsapp') {
    sendResult = await sendWhatsappOtp({ phone: destination, code, lang });
  }
  // sendWhatsappOtp devolve { error: true } em falha e { skipped: true } quando
  // o canal não está configurado; sucesso devolve o corpo da Z-API.
  const delivered = !!sendResult && !sendResult.error && !sendResult.skipped;

  return {
    destination_masked: maskDestination(channel, destination),
    expires_in:  600,  // segundos
    retry_after: COOLDOWN_SECONDS,
    delivered,
  };
}

// ── verifyOtp ─────────────────────────────────────────────

/**
 * Verifica um código OTP submetido pelo usuário.
 * @param {{ userId: string, channel: 'email'|'whatsapp', code: string }} opts
 * @returns {{ ok: boolean, attempts_left?: number, reason?: string }}
 */
export async function verifyOtp({ userId, channel, code }) {
  // Busca OTP ativo e não-expirado
  const now = new Date().toISOString();
  const { data: otp, error: fetchErr } = await supabase
    .from('otp_codes')
    .select('id, code_hash, attempts, max_attempts, expires_at')
    .eq('user_id', userId)
    .eq('channel', channel)
    .is('consumed_at', null)
    .is('invalidated_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) {
    const err = new Error('Erro ao verificar código.'); err.status = 500; throw err;
  }

  if (!otp) {
    // Pode ser expirado ou inexistente
    return { ok: false, reason: 'expired' };
  }

  // Compara hash
  const submittedHash = hashCode(code);
  if (submittedHash !== otp.code_hash) {
    const newAttempts = (otp.attempts || 0) + 1;
    const hitMax      = newAttempts >= (otp.max_attempts || 5);

    // Incrementa attempts; se bateu o teto, invalida
    const update = { attempts: newAttempts };
    if (hitMax) update.invalidated_at = new Date().toISOString();

    await supabase.from('otp_codes').update(update).eq('id', otp.id);

    return {
      ok:           false,
      attempts_left: hitMax ? 0 : (otp.max_attempts || 5) - newAttempts,
    };
  }

  // Código correto — marca como consumido
  await supabase
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otp.id);

  // Atualiza flags de verificação no perfil do usuário
  const verifiedField = channel === 'email' ? 'email_verified' : 'phone_verified';
  const verifiedAtField = channel === 'email' ? 'email_verified_at' : 'phone_verified_at';

  await supabase
    .from('users')
    .update({
      [verifiedField]:   true,
      [verifiedAtField]: new Date().toISOString(),
    })
    .eq('id', userId);

  return { ok: true };
}
