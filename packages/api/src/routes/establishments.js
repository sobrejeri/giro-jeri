// ── establishments.js ──────────────────────────────────
// Diretório de estabelecimentos da vila. Leitura pública; escrita só admin.
// Avaliações com estrelas para usuários autenticados.
import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { fetchNearby } from '../services/geoapify.js';

const router = Router();

const schema = z.object({
  name:        z.string().min(1).max(200),
  category:    z.enum(['hospedagem', 'gastronomia', 'compras']).optional(),
  description: z.string().max(5000).optional().nullable(),
  image_url:   z.string().max(3000).optional().nullable(),
  whatsapp:    z.string().max(30).optional().nullable(),
  instagram:   z.string().max(120).optional().nullable(),
  maps_url:    z.string().max(3000).optional().nullable(),
  address:     z.string().max(300).optional().nullable(),
  locality:    z.string().max(80).optional().nullable(),
  price_range: z.string().max(10).optional().nullable(),
  price_note:  z.string().max(60).optional().nullable(),
  latitude:    z.number().optional().nullable(),
  longitude:   z.number().optional().nullable(),
  is_featured: z.boolean().optional(),
  is_active:   z.boolean().optional(),
  sort_order:  z.number().int().optional(),
  region_id:   z.string().uuid().optional().nullable(),
  region_ids:  z.array(z.string().uuid()).optional(),
});

function clean(payload) {
  Object.keys(payload).forEach((k) => {
    if (Array.isArray(payload[k])) return;  // não toca em arrays
    if (payload[k] === '') payload[k] = null;
  });
  return payload;
}

// ── GET /api/establishments ────────────────────────────
// Público: ativos, destaques primeiro + avg_rating / review_count.
router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('establishments')
      .select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('sort_order',  { ascending: true })
      .order('created_at',  { ascending: false });
    if (req.query.category)  q = q.eq('category',  req.query.category);
    if (req.query.region_id) {
      q = q.or(
        `region_ids.cs.{${req.query.region_id}},region_id.eq.${req.query.region_id}`
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) return res.json([]);

    const ids = data.map((e) => e.id);
    const { data: reviews } = await supabase
      .from('establishment_reviews')
      .select('establishment_id, rating')
      .in('establishment_id', ids);

    const statsMap = {};
    (reviews || []).forEach((r) => {
      if (!statsMap[r.establishment_id]) statsMap[r.establishment_id] = { sum: 0, count: 0 };
      statsMap[r.establishment_id].sum += r.rating;
      statsMap[r.establishment_id].count += 1;
    });

    const enriched = data.map((e) => {
      const s = statsMap[e.id];
      return {
        ...e,
        avg_rating:   s ? +(s.sum / s.count).toFixed(1) : null,
        review_count: s?.count || 0,
      };
    });

    // Ordena por reputação: Destaques (patrocinados) primeiro, depois maior
    // nota, depois mais avaliações. O sort do V8 é estável, então empates
    // mantêm a ordem do SQL (sort_order / created_at).
    enriched.sort((a, b) => {
      if (!!b.is_featured !== !!a.is_featured) return b.is_featured ? 1 : -1;
      const ar = a.avg_rating ?? -1;
      const br = b.avg_rating ?? -1;
      if (br !== ar) return br - ar;
      return (b.review_count || 0) - (a.review_count || 0);
    });

    res.json(enriched);
  } catch (err) { next(err); }
});

// ── GET /api/establishments/nearby ─────────────────────
router.get('/nearby', async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Parâmetros lat e lon são obrigatórios' });
    }
    const radius   = Math.min(Math.max(Number(req.query.radius) || 8000, 500), 50000);
    const category = req.query.category;
    const data = await fetchNearby({ lat, lon, radius, category });
    res.json(data);
  } catch (err) {
    console.error('[establishments/nearby]', err.message);
    res.json({ enabled: true, results: [], error: 'provider_error' });
  }
});

// ── GET /api/establishments/:id/reviews ────────────────
// Público: avaliações de um estabelecimento.
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('establishment_reviews')
      .select('id, rating, comment, created_at, user_id, users(full_name, profile_photo_url)')
      .eq('establishment_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// ── Rotas autenticadas ────────────────────────────────
router.use(authenticate);

router.get('/admin', requireAdmin, async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('establishments')
      .select('*')
      .order('is_featured', { ascending: false })
      .order('created_at',  { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const body = schema.parse(req.body);
    const payload = clean({ ...body, created_by_user_id: req.user.id });
    const { data, error } = await supabase
      .from('establishments').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// POST /api/establishments/:id/reviews — adicionar ou atualizar avaliação
router.post('/:id/reviews', async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Nota deve ser de 1 a 5' });
    }
    const comment = req.body.comment?.trim() || null;
    if (comment && comment.length > 500) {
      return res.status(400).json({ error: 'Comentário máximo de 500 caracteres' });
    }
    const { data, error } = await supabase
      .from('establishment_reviews')
      .upsert(
        { establishment_id: req.params.id, user_id: req.user.id, rating, comment },
        { onConflict: 'establishment_id,user_id' }
      )
      .select('id, rating, comment, created_at, user_id, users(full_name, profile_photo_url)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = schema.partial().parse(req.body);
    const payload = clean({ ...body, updated_at: new Date().toISOString() });
    const { data, error } = await supabase
      .from('establishments').update(payload).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Estabelecimento não encontrado' });
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
});

// DELETE /api/establishments/reviews/:reviewId — remover avaliação (dono ou admin)
router.delete('/reviews/:reviewId', async (req, res, next) => {
  try {
    const { data: review } = await supabase
      .from('establishment_reviews')
      .select('user_id')
      .eq('id', req.params.reviewId)
      .maybeSingle();
    if (!review) return res.status(404).json({ error: 'Avaliação não encontrada' });
    if (review.user_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    await supabase.from('establishment_reviews').delete().eq('id', req.params.reviewId);
    res.status(204).end();
  } catch (err) { next(err); }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('establishments').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
