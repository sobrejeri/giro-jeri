// ── stories.js ──────────────────────────────────────────
// Stories estilo Instagram. Leitura pública; escrita apenas admin.
import { Router } from 'express';
import { z }      from 'zod';
import { supabase }                    from '../supabase.js';
import { authenticate, requireAdmin }  from '../middleware/auth.js';

const router = Router();

// ── Schemas de validação ──────────────────────────────────
const storyCreateSchema = z.object({
  display_name:  z.string().min(1).max(80),
  avatar_url:    z.string().url().max(3000).optional().nullable(),
  media_url:     z.string().url().max(3000),
  media_type:    z.enum(['image', 'video']).optional(),
  duration_sec:  z.number().int().min(1).max(60).optional(),
  is_active:     z.boolean().optional(),
  sort_order:    z.number().int().min(0).optional(),
  expires_at:    z.string().datetime({ offset: true }).optional().nullable(),
});

const storyUpdateSchema = storyCreateSchema.partial();

// ── GET /api/stories ──────────────────────────────────────
// Público: stories ativos e não expirados, ordenados por sort_order.
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('sort_order', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// ── GET /api/stories/admin — todas as stories (admin) ────
// Retorna todas as stories (ativas, inativas, expiradas) para o painel admin.
router.get('/admin', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// ── Rotas de administração (authenticate + requireAdmin) ──
router.use(authenticate, requireAdmin);

// POST /api/stories — cria um novo story
router.post('/', async (req, res, next) => {
  try {
    const body = storyCreateSchema.parse(req.body);
    const { data, error } = await supabase
      .from('stories')
      .insert({ ...body, created_by_user_id: req.user.id })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// PUT /api/stories/:id — atualiza um story existente
router.put('/:id', async (req, res, next) => {
  try {
    const body = storyUpdateSchema.parse(req.body);
    const { data, error } = await supabase
      .from('stories')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Story não encontrado' });
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// DELETE /api/stories/:id — remove um story
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
