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

    res.status(201).json({ message: 'Conta criada com sucesso', user: profile });
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email:    body.email,
      phone:    body.phone,
      password: body.password,
    });

    if (error) return res.status(401).json({ error: 'Credenciais incorretas' });

    const { data: profile } = await supabase
      .from('users')
      .select('id, full_name, email, phone, user_type, preferred_region_id, profile_photo_url')
      .eq('auth_id', data.user.id)
      .single();

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
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
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
      .select('id, full_name, email, phone, user_type, preferred_region_id, profile_photo_url')
      .eq('auth_id', data.user.id)
      .single();

    res.json({
      token:         data.session.access_token,
      refresh_token: data.session.refresh_token,
      user:          profile,
    });
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
