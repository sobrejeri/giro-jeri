// ── feed.js ────────────────────────────────────────────
// Feed de eventos da vila. Leitura pública; escrita só admin.
// Likes e comentários para usuários autenticados.
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
// Público: posts publicados + like_count + comment_count.
router.get('/', async (_req, res, next) => {
  try {
    const { data: posts, error } = await supabase
      .from('feed_posts')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!posts?.length) return res.json([]);

    const ids = posts.map((p) => p.id);
    const authorIds = [...new Set(posts.map((p) => p.created_by_user_id).filter(Boolean))];
    const [{ data: likes }, { data: comments }, { data: authors }] = await Promise.all([
      supabase.from('post_likes').select('post_id').in('post_id', ids),
      supabase.from('post_comments').select('post_id').in('post_id', ids),
      authorIds.length
        ? supabase.from('users').select('id, full_name, profile_photo_url').in('id', authorIds)
        : Promise.resolve({ data: [] }),
    ]);

    const likeMap = {};
    (likes || []).forEach((l) => { likeMap[l.post_id] = (likeMap[l.post_id] || 0) + 1; });
    const commentMap = {};
    (comments || []).forEach((c) => { commentMap[c.post_id] = (commentMap[c.post_id] || 0) + 1; });
    const authorMap = {};
    (authors || []).forEach((u) => { authorMap[u.id] = u; });

    res.json(posts.map((p) => ({
      ...p,
      like_count:    likeMap[p.id] || 0,
      comment_count: commentMap[p.id] || 0,
      author_avatar: authorMap[p.created_by_user_id]?.profile_photo_url || null,
      author_name:   authorMap[p.created_by_user_id]?.full_name || null,
    })));
  } catch (err) { next(err); }
});

// ── GET /api/feed/:id/comments ────────────────────────
// Público: comentários de um post.
router.get('/:id/comments', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('post_comments')
      .select('id, body, created_at, user_id, users(full_name, profile_photo_url)')
      .eq('post_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// ── Rotas autenticadas ────────────────────────────────
router.use(authenticate);

// GET /api/feed/my-likes — IDs dos posts curtidos pelo usuário
router.get('/my-likes', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', req.user.id);
    if (error) throw error;
    res.json((data || []).map((l) => l.post_id));
  } catch (err) { next(err); }
});

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

// POST /api/feed/:id/like — curtir / descurtir
router.post('/:id/like', async (req, res, next) => {
  try {
    const { data: existing } = await supabase
      .from('post_likes')
      .select('id')
      .eq('post_id', req.params.id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (existing) {
      await supabase.from('post_likes').delete().eq('id', existing.id);
      return res.json({ liked: false });
    }
    await supabase.from('post_likes').insert({ post_id: req.params.id, user_id: req.user.id });
    res.json({ liked: true });
  } catch (err) { next(err); }
});

// POST /api/feed/:id/comments — adicionar comentário
router.post('/:id/comments', async (req, res, next) => {
  try {
    const body = req.body.body?.trim();
    if (!body || body.length > 500) {
      return res.status(400).json({ error: 'Comentário deve ter entre 1 e 500 caracteres' });
    }
    const { data, error } = await supabase
      .from('post_comments')
      .insert({ post_id: req.params.id, user_id: req.user.id, body })
      .select('id, body, created_at, user_id, users(full_name, profile_photo_url)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
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

// DELETE /api/feed/comments/:commentId — remover comentário (dono ou admin)
router.delete('/comments/:commentId', async (req, res, next) => {
  try {
    const { data: comment } = await supabase
      .from('post_comments')
      .select('user_id')
      .eq('id', req.params.commentId)
      .maybeSingle();
    if (!comment) return res.status(404).json({ error: 'Comentário não encontrado' });
    if (comment.user_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    await supabase.from('post_comments').delete().eq('id', req.params.commentId);
    res.status(204).end();
  } catch (err) { next(err); }
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
