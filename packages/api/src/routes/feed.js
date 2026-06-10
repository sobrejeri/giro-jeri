// ── feed.js ────────────────────────────────────────────
// Feed de eventos da vila. Leitura pública; escrita só admin.
import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

const postSchema = z.object({
  title:          z.string().min(1).max(200),
  body:           z.string().max(5000).optional().nullable(),
  image_url:      z.string().max(3000).optional().nullable(),
  event_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  event_time:     z.string().max(30).optional().nullable(),
  location:       z.string().max(200).optional().nullable(),
  is_published:   z.boolean().optional(),
  kind:           z.enum(['event', 'promo']).optional(),
  discount_label: z.string().max(60).optional().nullable(),
  valid_until:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

function clean(payload) {
  Object.keys(payload).forEach((k) => { if (payload[k] === '') payload[k] = null; });
  return payload;
}

// ── GET /api/feed ──────────────────────────────────────
// Público: apenas posts publicados, mais recentes primeiro.
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('feed_posts')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// ── Rotas administrativas ──────────────────────────────
router.use(authenticate);

// GET /api/feed/admin — todos os posts (inclui rascunhos)
router.get('/admin', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('feed_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// POST /api/feed — cria post
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const body = postSchema.parse(req.body);
    const payload = clean({ ...body, created_by_user_id: req.user.id });
    const { data, error } = await supabase
      .from('feed_posts').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// PUT /api/feed/:id — atualiza post
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = postSchema.partial().parse(req.body);
    const payload = clean({ ...body, updated_at: new Date().toISOString() });
    const { data, error } = await supabase
      .from('feed_posts').update(payload).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Post não encontrado' });
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// DELETE /api/feed/:id — remove post
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('feed_posts').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
