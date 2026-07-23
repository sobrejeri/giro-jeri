// ── routes/otp.js ────────────────────────────────────────
// POST /api/auth/otp/request  → solicita novo código
// POST /api/auth/otp/verify   → confirma código e avança wizard
//
// Protegidas por signup_token (JWT HS256 30 min) — não requer sessão Supabase.

import { Router } from 'express';
import { z }      from 'zod';

import { supabase }              from '../supabase.js';
import { signSignupToken, verifySignupToken } from '../lib/signupToken.js';
import { requestOtp, verifyOtp, maskDestination } from '../services/otp.js';

const router = Router();

// ── Schemas ───────────────────────────────────────────────
const requestSchema = z.object({
  signup_token: z.string().min(1),
  channel:      z.enum(['email', 'whatsapp']),
});

const verifySchema = z.object({
  signup_token: z.string().min(1),
  channel:      z.enum(['email', 'whatsapp']),
  code:         z.string().length(6).regex(/^\d{6}$/),
});

// ── Helper: carrega perfil do usuário ────────────────────
async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, auth_id, email, phone, phone_e164, email_verified, phone_verified, lang:language')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

// ── POST /api/auth/otp/request ────────────────────────────
router.post('/request', async (req, res, next) => {
  try {
    const body = requestSchema.parse(req.body);

    // Valida signup_token
    let claims;
    try {
      claims = verifySignupToken(body.signup_token);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    const { user_id, phone_required } = claims;

    // WhatsApp só disponível se phone foi fornecido no cadastro
    if (body.channel === 'whatsapp' && !phone_required) {
      return res.status(400).json({
        error: 'Canal WhatsApp indisponível: número não cadastrado.',
      });
    }

    // Carrega perfil para obter destination
    const profile = await loadProfile(user_id);
    if (!profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const destination = body.channel === 'email'
      ? profile.email
      : profile.phone_e164;

    if (!destination) {
      return res.status(400).json({ error: 'Destino de verificação não disponível.' });
    }

    let result;
    try {
      result = await requestOtp({
        userId:      user_id,
        channel:     body.channel,
        destination,
        lang:        profile.lang || 'pt',
      });
    } catch (e) {
      if (e.status === 429) {
        return res.status(429).json({
          error:       e.message,
          retry_after: e.retry_after,
        });
      }
      return next(e);
    }

    return res.json({
      ok:          true,
      channel:     body.channel,
      destination: result.destination_masked,
      expires_in:  result.expires_in,
      retry_after: result.retry_after,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/auth/otp/verify ─────────────────────────────
router.post('/verify', async (req, res, next) => {
  try {
    const body = verifySchema.parse(req.body);

    // Valida signup_token
    let claims;
    try {
      claims = verifySignupToken(body.signup_token);
    } catch (e) {
      return res.status(e.status || 400).json({ error: e.message });
    }

    const { user_id, phone_required } = claims;

    // Carrega perfil
    const profile = await loadProfile(user_id);
    if (!profile) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // Verifica o OTP
    const result = await verifyOtp({
      userId:  user_id,
      channel: body.channel,
      code:    body.code,
    });

    if (!result.ok) {
      if (result.reason === 'expired') {
        return res.status(410).json({ error: 'Código expirado. Solicite um novo.' });
      }
      return res.status(400).json({
        error:         'Código incorreto.',
        attempts_left: result.attempts_left,
      });
    }

    // Ações pós-verificação bem-sucedida no Supabase Auth
    if (body.channel === 'email') {
      // Confirma o e-mail no Auth
      await supabase.auth.admin.updateUserById(profile.auth_id, {
        email_confirm: true,
      });
    } else if (body.channel === 'whatsapp') {
      // Promove telefone ao Auth
      const phoneDigits = (profile.phone_e164 || '').replace(/\D/g, '');
      if (phoneDigits) {
        const { error: phoneErr } = await supabase.auth.admin.updateUserById(
          profile.auth_id,
          { phone: phoneDigits }
        );
        if (phoneErr) {
          // Número já em uso em outra conta
          if (phoneErr.message?.includes('already been registered') ||
              phoneErr.message?.includes('phone') ||
              phoneErr.code === '23505') {
            return res.status(409).json({ error: 'Número de telefone já cadastrado em outra conta.' });
          }
          console.error('[otp/verify] erro ao promover phone ao Auth:', phoneErr);
        }
      }
    }

    // Recarrega perfil atualizado (verified flags acabam de mudar)
    const updatedProfile = await loadProfile(user_id);

    // Decide próximo passo. Com phone_required (fluxo atual: ativação pelo
    // WhatsApp), o código do WhatsApp é o que destrava — e-mail não gate.
    const emailVerified = body.channel === 'email' ? true : updatedProfile.email_verified;
    const phoneVerified = body.channel === 'whatsapp' ? true : updatedProfile.phone_verified;

    const allDone = phone_required ? phoneVerified : emailVerified;

    if (allDone) {
      return res.json({ status: 'verified' });
    }

    // Ainda falta verificar WhatsApp
    const channels = buildChannels(updatedProfile, phone_required);
    // Emite novo signup_token (mesmas claims, novo exp 30min)
    const newToken = signSignupToken({ user_id, phone_required });

    return res.json({
      status:       'verification_required',
      signup_token: newToken,
      channels,
      next:         'verify_whatsapp',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── Helper: monta shape de channels para o front ─────────
function buildChannels(profile, phone_required) {
  // Ativação pelo WhatsApp: quando há telefone, ele é o canal obrigatório;
  // e-mail entra só como informativo (já confirmado no cadastro).
  const channels = {
    email: {
      required:    !phone_required,
      verified:    profile.email_verified || false,
      destination: maskDestination('email', profile.email || ''),
    },
  };
  if (phone_required && profile.phone_e164) {
    channels.whatsapp = {
      required:    true,
      verified:    profile.phone_verified || false,
      destination: maskDestination('whatsapp', profile.phone_e164),
    };
  }
  return channels;
}

export { buildChannels };
export default router;
