import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  full_name: z.string().min(2).max(200),
  email:     z.string().email().optional(),
  phone:     z.string().min(10).max(30).optional(),
  password:  z.string().min(6),
}).refine(d => d.email || d.phone, {
  message: 'Informe email ou telefone',
});

const loginSchema = z.object({
  email:    z.string().email().optional(),
  phone:    z.string().optional(),
  cnpj:     z.string().optional(),
  password: z.string().min(1),
});

// ── POST /api/auth/register ────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:          body.email,
      phone:          body.phone,
      password:       body.password,
      email_confirm:  true,
    });

    if (authError) return res.status(400).json({ error: authError.message });

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        auth_id:   authData.user.id,
        full_name: body.full_name,
        email:     body.email,
        phone:     body.phone,
        user_type: 'tourist',
      })
      .select('id, full_name, email, phone, user_type')
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: profileError.message });
    }

    // Auto sign-in para retornar token imediatamente após o cadastro
    const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
      email:    body.email,
      password: body.password,
    });

    if (signInError || !session?.session) {
      // Conta criada mas login automático falhou — pede login manual
      return res.status(201).json({ message: 'Conta criada com sucesso. Faça login para continuar.' });
    }

    res.status(201).json({
      message:       'Conta criada com sucesso',
      token:         session.session.access_token,
      refresh_token: session.session.refresh_token,
      user:          profile,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/auth/login ───────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);

    // Login por CNPJ: busca o e-mail sintético gerado pelo admin
    let authEmail  = body.email;
    let authPhone  = body.phone;

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email:    authEmail,
      phone:    authPhone,
      password: body.password,
    });

    if (error) return res.status(401).json({ error: 'Credenciais incorretas' });

    const PROFILE_COLS = 'id, full_name, email, phone, user_type, preferred_region_id, profile_photo_url, birth_date, document_type, document_number, nationality, gender, emergency_contact_name, emergency_contact_phone, language';

    // Primeiro tenta pelo auth_id (caminho normal)
    let { data: profile } = await supabase
      .from('users').select(PROFILE_COLS).eq('auth_id', data.user.id).maybeSingle();

    // Fallback: lookup por email do auth (caso o auth_id na tabela esteja dessincronizado/NULL)
    if (!profile && data.user.email) {
      const { data: byEmail } = await supabase
        .from('users').select(PROFILE_COLS).eq('email', data.user.email).maybeSingle();
      if (byEmail) {
        profile = byEmail;
        // Auto-corrige o vínculo para evitar o problema em logins futuros
        await supabase.from('users').update({ auth_id: data.user.id }).eq('id', byEmail.id);
      }
    }

    if (!profile) {
      console.error('[login] profile lookup failed', { auth_id: data.user.id, email: data.user.email });
      return res.status(500).json({ error: 'Perfil não encontrado para este usuário. Contate o suporte.' });
    }

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

// ── GET /api/auth/me ───────────────────────────────────
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
    res.json({ user: profile });
  } catch (err) { next(err); }
});

// ── POST /api/auth/forgot-password ────────────────────
const forgotSchema = z.object({
  email:        z.string().email(),
  redirect_url: z.string().url().optional(),
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email, redirect_url } = forgotSchema.parse(req.body);

    // Não revela se o e-mail existe (boa prática de segurança)
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

// ── POST /api/auth/refresh ────────────────────────────
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
      .select('id, full_name, email, phone, user_type, preferred_region_id, profile_photo_url, birth_date, document_type, document_number, nationality, gender, emergency_contact_name, emergency_contact_phone, language')
      .eq('auth_id', data.user.id)
      .single();

    res.json({
      token:         data.session.access_token,
      refresh_token: data.session.refresh_token,
      user:          profile,
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/auth/me ────────────────────────────────
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

// ── POST /api/auth/me/photo ───────────────────────────
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

    // Limite de 2 MB
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

// ── POST /api/auth/logout ──────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    await supabase.auth.admin.signOut(token);
    res.json({ message: 'Sessão encerrada' });
  } catch (err) { next(err); }
});

export default router;
