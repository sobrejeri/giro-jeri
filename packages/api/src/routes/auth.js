import { Router } from 'express';
import { z }      from 'zod';
import { supabase }                          from '../supabase.js';
import { authenticate }                      from '../middleware/auth.js';
import { normalizeToE164 }                   from '../lib/phone.js';
import { signSignupToken }                   from '../lib/signupToken.js';
import { requestOtp, maskDestination }       from '../services/otp.js';
import { buildChannels }                     from './otp.js';

const router = Router();

// ── Schemas ───────────────────────────────────────────────
const registerSchema = z.object({
  full_name: z.string().min(2).max(200),
  email:     z.string().email(),                          // obrigatório
  phone:     z.string().min(7).max(30).optional(),        // opcional, normalizado → E.164
  password:  z.string().min(6),                          // front valida min 8
  lang:      z.enum(['pt', 'en', 'es']).optional().default('pt'),
});

const loginSchema = z.object({
  email:    z.string().email().optional(),
  phone:    z.string().optional(),
  cnpj:     z.string().optional(),
  password: z.string().min(1),
});

// Conjunto mínimo de colunas do perfil — usado em login e register
const PROFILE_COLS = 'id, full_name, email, phone, user_type, profile_photo_url, document_number';

// ── POST /api/auth/register ────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);

    // Normaliza phone → E.164 se fornecido
    let phoneE164 = null;
    if (body.phone) {
      phoneE164 = normalizeToE164(body.phone, 'BR');
      if (!phoneE164) {
        return res.status(400).json({ error: 'Número de telefone inválido.' });
      }
    }

    // Checar duplicidade de e-mail e phone_e164 ANTES de criar o Auth user.
    // Mensagem genérica anti-enumeração.
    const GENERIC_ERROR = 'Não foi possível concluir o cadastro. Tente fazer login.';

    if (phoneE164) {
      const { data: dupPhone } = await supabase
        .from('users')
        .select('id')
        .eq('phone_e164', phoneE164)
        .maybeSingle();
      if (dupPhone) {
        return res.status(409).json({ error: GENERIC_ERROR });
      }
    }

    const { data: dupEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', body.email)
      .maybeSingle();
    if (dupEmail) {
      return res.status(409).json({ error: GENERIC_ERROR });
    }

    // Cria usuário no Supabase Auth — SEM email_confirm (verificação via OTP)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:         body.email,
      password:      body.password,
      email_confirm: false,
    });

    if (authError) {
      // Erros do Auth (e-mail já cadastrado no Auth, etc.) → genérico
      console.error('[register] authError:', authError.message);
      return res.status(409).json({ error: GENERIC_ERROR });
    }

    // Insere perfil na tabela users
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        auth_id:        authData.user.id,
        full_name:      body.full_name,
        email:          body.email,
        phone:          body.phone || null,
        phone_e164:     phoneE164,
        user_type:      'tourist',
        email_verified: false,
        phone_verified: false,
        lang:           body.lang,
      })
      .select('id, full_name, email, phone, phone_e164, user_type, email_verified, phone_verified, lang')
      .single();

    if (profileError) {
      // Rollback: apaga o Auth user criado
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.error('[register] profileError:', profileError.message);
      return res.status(400).json({ error: profileError.message });
    }

    // Dispara OTP de e-mail imediatamente
    try {
      await requestOtp({
        userId:      profile.id,
        channel:     'email',
        destination: body.email,
        lang:        body.lang,
      });
    } catch (otpErr) {
      // OTP falhou mas conta foi criada — não é fatal; o usuário pode re-solicitar
      console.error('[register] OTP email falhou:', otpErr.message);
    }

    // Monta signup_token
    const phone_required = !!phoneE164;
    const signup_token   = signSignupToken({ user_id: profile.id, phone_required });

    // Monta channels
    const channels = {
      email: {
        required:    true,
        verified:    false,
        destination: maskDestination('email', body.email),
      },
    };
    if (phone_required) {
      channels.whatsapp = {
        required:    false,
        verified:    false,
        destination: maskDestination('whatsapp', phoneE164),
      };
    }

    // Retorna sem token de sessão — front usa signup_token para o wizard de verificação
    return res.status(201).json({
      status:       'verification_required',
      signup_token,
      channels,
      next:         'verify_email',
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);

    // Login por CNPJ: busca o e-mail sintético gerado pelo admin
    let authEmail = body.email;
    let authPhone = body.phone;

    if (body.cnpj) {
      const cnpjDigits = body.cnpj.replace(/\D/g, '');
      const { data: opUser, error: lookupErr } = await supabase
        .from('users')
        .select('email')
        .eq('document_number', cnpjDigits)
        .eq('document_type', 'cnpj')
        .eq('user_type', 'operator')
        .single();

      if (lookupErr || !opUser) {
        return res.status(401).json({ error: 'CNPJ não encontrado ou não autorizado' });
      }
      authEmail = opUser.email;
      authPhone = undefined;
    }

    // Autentica primeiro (valida senha antes de qualquer gate)
    const { data, error } = await supabase.auth.signInWithPassword({
      email:    authEmail,
      phone:    authPhone,
      password: body.password,
    });

    if (error) return res.status(401).json({ error: 'Credenciais incorretas' });

    // Carrega perfil
    let { data: profile, error: pErr1 } = await supabase
      .from('users')
      .select(`${PROFILE_COLS}, email_verified, phone_verified, phone_e164, lang`)
      .eq('auth_id', data.user.id)
      .maybeSingle();
    if (pErr1) console.error('[login] auth_id lookup error', pErr1);

    const fallbackEmail = authEmail || data.user.email;
    if (!profile && fallbackEmail) {
      const { data: byEmail, error: pErr2 } = await supabase
        .from('users')
        .select(`${PROFILE_COLS}, email_verified, phone_verified, phone_e164, lang`)
        .eq('email', fallbackEmail)
        .maybeSingle();
      if (pErr2) console.error('[login] email lookup error', pErr2);
      if (byEmail) {
        profile = byEmail;
        await supabase.from('users').update({ auth_id: data.user.id }).eq('id', byEmail.id);
      }
    }

    if (!profile && body.cnpj) {
      const cnpjDigits = body.cnpj.replace(/\D/g, '');
      const { data: byCnpj, error: pErr3 } = await supabase
        .from('users')
        .select(`${PROFILE_COLS}, email_verified, phone_verified, phone_e164, lang`)
        .eq('document_number', cnpjDigits)
        .maybeSingle();
      if (pErr3) console.error('[login] cnpj lookup error', pErr3);
      if (byCnpj) {
        profile = byCnpj;
        await supabase.from('users').update({ auth_id: data.user.id }).eq('id', byCnpj.id);
      }
    }

    if (!profile) {
      console.error('[login] profile lookup failed', {
        auth_id:    data.user.id,
        auth_email: data.user.email,
        used_email: authEmail,
        used_cnpj:  body.cnpj,
      });
      return res.status(500).json({
        error: `Perfil não encontrado (auth_id=${data.user.id?.slice(0,8)}, email=${data.user.email})`,
      });
    }

    // ── Gate de verificação (apenas tourists) ──────────────
    if (profile.user_type === 'tourist') {
      const emailPending = !profile.email_verified;
      const phonePending = profile.phone_e164 && !profile.phone_verified;

      if (emailPending || phonePending) {
        // Senha já validada acima — pode emitir signup_token sem risco
        const phone_required = !!(profile.phone_e164);
        const signup_token   = signSignupToken({ user_id: profile.id, phone_required });
        const channels       = buildChannels(profile, phone_required);
        const next           = emailPending ? 'verify_email' : 'verify_whatsapp';

        return res.status(403).json({
          status:       'verification_required',
          signup_token,
          channels,
          next,
        });
      }
    }

    // Retorna sessão normal
    res.json({
      token:         data.session.access_token,
      refresh_token: data.session.refresh_token,
      user:          profile,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { data: profile, error } = await supabase
      .from('users')
      .select(`id, full_name, email, phone, user_type, profile_photo_url,
               birth_date, document_type, document_number, preferred_region_id,
               pix_key_type, pix_key, bank_name, bank_agency,
               bank_account_number, bank_account_type, bank_document`)
      .eq('id', req.user.id)
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const { data: cover } = await supabase
      .from('users').select('cover_photo_url').eq('id', req.user.id).maybeSingle();
    if (cover && 'cover_photo_url' in cover) profile.cover_photo_url = cover.cover_photo_url;

    res.json({ user: profile });
  } catch (err) { next(err); }
});

// ── POST /api/auth/forgot-password ────────────────────────
const forgotSchema = z.object({
  email:        z.string().email(),
  redirect_url: z.string().url().optional(),
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, redirect_url } = forgotSchema.parse(req.body);

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirect_url,
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    next(err);
  }
});

// ── POST /api/auth/refresh ─────────────────────────────────
router.post('/refresh', async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'refresh_token obrigatório' });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });
    if (error || !data.session) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, full_name, email, phone, user_type, profile_photo_url, document_number')
      .eq('auth_id', data.user.id)
      .maybeSingle();

    res.json({
      token:         data.session.access_token,
      refresh_token: data.session.refresh_token,
      user:          profile,
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/auth/me ─────────────────────────────────────
const updateProfileSchema = z.object({
  full_name:               z.string().min(2).max(200).optional(),
  phone:                   z.string().min(10).max(30).optional(),
  birth_date:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  document_type:           z.enum(['cpf', 'cnpj', 'passport', 'rg', 'cnh', 'other']).optional().nullable(),
  document_number:         z.string().max(30).optional().nullable(),
  nationality:             z.string().max(100).optional().nullable(),
  gender:                  z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say']).optional().nullable(),
  emergency_contact_name:  z.string().max(200).optional().nullable(),
  emergency_contact_phone: z.string().max(30).optional().nullable(),
  language:                z.string().max(10).optional(),
  profile_photo_url:       z.string().max(3_000_000).optional().nullable(),
  pix_key_type:            z.enum(['cpf', 'cnpj', 'email', 'phone', 'random_key']).optional().nullable(),
  pix_key:                 z.string().max(200).optional().nullable(),
  bank_name:               z.string().max(100).optional().nullable(),
  bank_agency:             z.string().max(20).optional().nullable(),
  bank_account_number:     z.string().max(30).optional().nullable(),
  bank_account_type:       z.enum(['corrente', 'poupanca']).optional().nullable(),
  bank_document:           z.string().max(30).optional().nullable(),
});

router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const body = updateProfileSchema.parse(req.body);

    const { data: updated, error } = await supabase
      .from('users')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.user.id)
      .select(`id, full_name, email, phone, user_type, profile_photo_url,
               document_number, birth_date, language, preferred_region_id,
               pix_key_type, pix_key, bank_name, bank_agency,
               bank_account_number, bank_account_type, bank_document`)
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ user: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/auth/me/photo ───────────────────────────────
router.post('/me/photo', authenticate, async (req, res, next) => {
  try {
    const { photo_data } = req.body;
    if (!photo_data || typeof photo_data !== 'string') {
      return res.status(400).json({ error: 'Dados de imagem ausentes' });
    }

    const match = photo_data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' });
    }

    const [, mimeType, b64] = match;
    const buffer = Buffer.from(b64, 'base64');

    if (buffer.byteLength > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Imagem muito grande. Máximo 2 MB.' });
    }

    const ext  = mimeType.split('/')[1];
    const path = `${req.user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    await supabase
      .from('users')
      .update({ profile_photo_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    res.json({ url: publicUrl });
  } catch (err) { next(err); }
});

// ── POST /api/auth/me/cover ───────────────────────────────
router.post('/me/cover', authenticate, async (req, res, next) => {
  try {
    const { photo_data } = req.body;
    if (!photo_data || typeof photo_data !== 'string') {
      return res.status(400).json({ error: 'Dados de imagem ausentes' });
    }

    const match = photo_data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' });
    }

    const [, mimeType, b64] = match;
    const buffer = Buffer.from(b64, 'base64');

    if (buffer.byteLength > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Imagem muito grande. Máximo 2 MB.' });
    }

    const ext  = mimeType.split('/')[1];
    const path = `cover-${req.user.id}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const versionedUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: updError } = await supabase
      .from('users')
      .update({ cover_photo_url: versionedUrl, updated_at: new Date().toISOString() })
      .eq('id', req.user.id);

    if (updError) {
      return res.status(500).json({
        error: 'Não foi possível salvar a capa. Verifique se a migration 015 (coluna cover_photo_url) foi aplicada no banco.',
      });
    }

    res.json({ url: versionedUrl });
  } catch (err) { next(err); }
});

// ── POST /api/auth/logout ──────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    await supabase.auth.admin.signOut(token);
    res.json({ message: 'Sessão encerrada' });
  } catch (err) { next(err); }
});

export default router;
