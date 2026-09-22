// ── stories.js ──────────────────────────────────────────
// Destaques (highlights) estilo Instagram + itens de mídia.
// Leitura pública; escrita apenas admin.
import { Router } from 'express';
import { z }      from 'zod';
import { supabase }                   from '../supabase.js';
import { authenticate, requireAdmin, requireOperator } from '../middleware/auth.js';
import { notifyTourists } from '../services/notify.js';

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
router.get('/', async (req, res, next) => {
  try {
    // ?owner=<userId> → só os destaques daquele dono (perfil do operador).
    // Sem owner → todos (Descubra / perfil do admin, como era).
    let q = supabase
      .from('story_highlights')
      .select(`
        id, title, cover_image_url, sort_order, created_at, created_by_user_id,
        stories!stories_highlight_id_fkey (
          id, display_name, media_url, media_type, duration_sec, sort_order, created_at
        )
      `)
      .eq('is_active', true);
    if (req.query.owner) q = q.eq('created_by_user_id', req.query.owner);
    const { data, error } = await q;

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

// ═══════════════════════════════════════════════════════════════════════
// Stories EFÊMEROS do perfil (24h) — círculo colorido na foto do perfil.
// Diferente dos destaques (permanentes). Registram quem viu.
// ═══════════════════════════════════════════════════════════════════════

const liveStorySchema = z.object({
  media_url:    z.string().url().max(3000),
  media_type:   z.enum(['image', 'video']).optional(),
  caption:      z.string().max(200).optional().nullable(),
  duration_sec: z.number().int().min(1).max(60).optional(),
});

// GET /api/stories/live — público: stories ativos (não expirados) + nº de views
router.get('/live', async (_req, res, next) => {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('avatar_stories')
      .select('id, media_url, media_type, caption, duration_sec, created_at, expires_at, created_by_user_id, author:created_by_user_id ( full_name, profile_photo_url, user_type )')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const ids = (data || []).map((s) => s.id);
    let counts = {};
    if (ids.length) {
      const { data: views } = await supabase
        .from('avatar_story_views')
        .select('story_id')
        .in('story_id', ids);
      for (const v of (views || [])) counts[v.story_id] = (counts[v.story_id] || 0) + 1;
    }
    res.json((data || []).map(({ author, ...s }) => ({
      ...s,
      view_count:    counts[s.id] || 0,
      // author_id/author_type deixam a fileira agrupar por autor (cada operador
      // com o próprio círculo); admin aparece como "Turiva".
      author_id:     s.created_by_user_id || null,
      author_type:   author?.user_type || null,
      author_name:   author?.user_type === 'admin' ? 'Turiva' : (author?.full_name || 'Operador'),
      author_avatar: author?.profile_photo_url || null,
    })));
  } catch (err) { next(err); }
});

// POST /api/stories/live/:id/view — usuário logado registra visualização
router.post('/live/:id/view', authenticate, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('avatar_story_views')
      .upsert(
        { story_id: req.params.id, viewer_user_id: req.user.id, viewed_at: new Date().toISOString() },
        { onConflict: 'story_id,viewer_user_id', ignoreDuplicates: true },
      );
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// GET /api/stories/live/:id/viewers — o DONO (ou admin): quem viu.
router.get('/live/:id/viewers', authenticate, requireOperator, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'admin') {
      const { data: st } = await supabase
        .from('avatar_stories').select('created_by_user_id').eq('id', req.params.id).maybeSingle();
      if (!st || st.created_by_user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
    }
    const { data, error } = await supabase
      .from('avatar_story_views')
      .select('viewed_at, users:viewer_user_id ( id, full_name, profile_photo_url )')
      .eq('story_id', req.params.id)
      .order('viewed_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map((v) => ({
      id:         v.users?.id,
      name:       v.users?.full_name || 'Usuário',
      avatar:     v.users?.profile_photo_url || null,
      viewed_at:  v.viewed_at,
    })));
  } catch (err) { next(err); }
});

// POST /api/stories/live — admin ou operador publica um story efêmero (fica
// atribuído a quem publicou, via created_by_user_id).
router.post('/live', authenticate, requireOperator, async (req, res, next) => {
  try {
    const body = liveStorySchema.parse(req.body);
    const { data, error } = await supabase
      .from('avatar_stories')
      .insert({
        media_url:    body.media_url,
        media_type:   body.media_type || 'image',
        caption:      body.caption || null,
        duration_sec: body.duration_sec || (body.media_type === 'video' ? 30 : 20),
        created_by_user_id: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// DELETE /api/stories/live/:id — o DONO (ou admin) exclui.
router.delete('/live/:id', authenticate, requireOperator, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'admin') {
      const { data: st } = await supabase
        .from('avatar_stories').select('created_by_user_id').eq('id', req.params.id).maybeSingle();
      if (!st) return res.status(404).json({ error: 'Story não encontrado' });
      if (st.created_by_user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
    }
    const { error } = await supabase.from('avatar_stories').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Destaques: admin OU operador (cada um gerencia SÓ os seus) ───────────
router.use(authenticate, requireOperator);

// Só o dono do destaque (ou admin) pode alterá-lo.
async function donoDoHighlight(req, res, next) {
  try {
    if (req.user.user_type === 'admin') return next();
    const { data } = await supabase
      .from('story_highlights').select('created_by_user_id').eq('id', req.params.id).maybeSingle();
    if (!data) return res.status(404).json({ error: 'Destaque não encontrado' });
    if (data.created_by_user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
    next();
  } catch (err) { next(err); }
}
// Ownership por item → destaque.
async function donoDoItem(req, res, next) {
  try {
    if (req.user.user_type === 'admin') return next();
    const { data: item } = await supabase.from('stories').select('highlight_id').eq('id', req.params.id).maybeSingle();
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    const { data: hl } = await supabase.from('story_highlights').select('created_by_user_id').eq('id', item.highlight_id).maybeSingle();
    if (!hl || hl.created_by_user_id !== req.user.id) return res.status(403).json({ error: 'Sem permissão' });
    next();
  } catch (err) { next(err); }
}

// ── POST /api/stories/highlights — criar highlight ───────
router.post('/highlights', async (req, res, next) => {
  try {
    const body = highlightSchema.parse(req.body);
    const { data, error } = await supabase
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
router.put('/highlights/:id', donoDoHighlight, async (req, res, next) => {
  try {
    const body = highlightSchema.partial().parse(req.body);
    const { data, error } = await supabase
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
router.delete('/highlights/:id', donoDoHighlight, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('story_highlights')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /api/stories/highlights/:id/items — add item ───
router.post('/highlights/:id/items', donoDoHighlight, async (req, res, next) => {
  try {
    const body = itemSchema.parse(req.body);
    const { data, error } = await supabase
      .from('stories')
      .insert({ ...body, highlight_id: req.params.id })
      .select()
      .single();
    if (error) throw error;

    // Notificação automática só para destaques do ADMIN (Turiva) — evita que
    // cada operador dispare push para todos os turistas. Best-effort.
    if (req.user.user_type === 'admin') {
      (async () => {
        try {
          const { data: hl } = await supabase
            .from('story_highlights')
            .select('title, cover_image_url, is_active')
            .eq('id', req.params.id)
            .maybeSingle();
          if (!hl || hl.is_active === false) return; // destaque oculto não avisa
          const imagem = data.media_type === 'image' ? data.media_url : (hl.cover_image_url || null);
          await notifyTourists({
            title:       hl.title || 'Novidade na Turiva 🌴',
            body:        data.display_name || `Nova publicação em ${hl.title || 'Jericoacoara'}. Confira!`,
            image:       imagem,
            url:         'eventos',        // abre a "Descubra a Vila"
            templateKey: 'nova_publicacao',
          });
        } catch (err) {
          console.error('[stories] notificação de publicação falhou:', err.message);
        }
      })();
    }

    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// ── PUT /api/stories/items/:id — atualizar item ──────────
router.put('/items/:id', donoDoItem, async (req, res, next) => {
  try {
    const body = itemSchema.partial().parse(req.body);
    const { data, error } = await supabase
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
router.delete('/items/:id', donoDoItem, async (req, res, next) => {
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
