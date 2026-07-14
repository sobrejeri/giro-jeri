// ── stories.js ──────────────────────────────────────────
// Destaques (highlights) estilo Instagram + itens de mídia.
// Leitura pública; escrita apenas admin.
import { Router } from 'express';
import { z }      from 'zod';
import { supabase }                   from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ── Schemas ─────────────────────────────────────────────
const highlightSchema = z.object({
  title:           z.string().min(1).max(80),
  cover_image_url: z.string().url().max(3000).optional().nullable(),
  sort_order:      z.number().int().min(0).optional(),
  is_active:       z.boolean().optional(),
});

const itemSchema = z.object({
  media_url:    z.string().url().max(3000),
  media_type:   z.enum(['image', 'video']).optional(),
  duration_sec: z.number().int().min(1).max(60).optional(),
  sort_order:   z.number().int().min(0).optional(),
  display_name: z.string().max(80).optional().nullable(),
});

// ── GET /api/stories — público ───────────────────────────
// Retorna highlights ativos com seus itens aninhados.
// Ordenação estilo Instagram: o destaque com publicação MAIS RECENTE vem
// primeiro. "Última atividade" = created_at do item mais novo (ou do próprio
// highlight, se ainda não tiver itens). sort_order entra só como desempate.
router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('story_highlights')
      .select(`
        id, title, cover_image_url, sort_order, created_at,
        stories!stories_highlight_id_fkey (
          id, display_name, media_url, media_type, duration_sec, sort_order, created_at
        )
      `)
      .eq('is_active', true);

    if (error) throw error;

    const lastActivity = (h) => Math.max(
      new Date(h.created_at).getTime(),
      ...(h.stories || []).map((s) => new Date(s.created_at).getTime())
    );

    const result = (data || [])
      .map((h) => ({
        ...h,
        stories: (h.stories || []).sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => (lastActivity(b) - lastActivity(a)) || (a.sort_order - b.sort_order));

    res.json(result);
  } catch (err) { next(err); }
});

// ── GET /api/stories/admin — todos os highlights (admin) ─
router.get('/admin', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('story_highlights')
      .select(`
        id, title, cover_image_url, sort_order, is_active, created_at,
        stories!stories_highlight_id_fkey (
          id, display_name, media_url, media_type, duration_sec, sort_order
        )
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const result = (data || []).map((h) => ({
      ...h,
      stories: (h.stories || []).sort((a, b) => a.sort_order - b.sort_order),
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// ── Middleware admin para rotas abaixo ───────────────────
router.use(authenticate, requireAdmin);

// ── POST /api/stories/highlights — criar highlight ───────
router.post('/highlights', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const body = highlightSchema.parse(req.body);
    const { data, error } = await req.supabase
      .from('story_highlights')
      .insert({ ...body, created_by_user_id: req.user.id })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// ── PUT /api/stories/highlights/:id — atualizar highlight ─
router.put('/highlights/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const body = highlightSchema.partial().parse(req.body);
    const { data, error } = await req.supabase
      .from('story_highlights')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Highlight não encontrado' });
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// ── DELETE /api/stories/highlights/:id ──────────────────
router.delete('/highlights/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from('story_highlights')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /api/stories/highlights/:id/items — add item ───
router.post('/highlights/:id/items', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const body = itemSchema.parse(req.body);
    const { data, error } = await req.supabase
      .from('stories')
      .insert({ ...body, highlight_id: req.params.id })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// ── PUT /api/stories/items/:id — atualizar item ──────────
router.put('/items/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const body = itemSchema.partial().parse(req.body);
    const { data, error } = await req.supabase
      .from('stories')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Item não encontrado' });
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// ── DELETE /api/stories/items/:id ───────────────────────
router.delete('/items/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from('stories')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
