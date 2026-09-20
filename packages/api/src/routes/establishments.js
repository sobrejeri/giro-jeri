// ── establishments.js ──────────────────────────────────
// Diretório de estabelecimentos da vila. Leitura pública; escrita só admin.
// Avaliações com estrelas para usuários autenticados.
import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { fetchNearby } from '../services/geoapify.js';
import { buscarFotoDoLugar, descobrirLugaresProximos, fotoBytes } from '../services/googlePlaces.js';

const router = Router();

// Preenche a foto pelo Google Places quando o estabelecimento não tem imagem.
// Best-effort: baixa os bytes, sobe no bucket "avatars" (prefixo
// establishments/) e grava a URL pública em image_url. Nunca lança — só
// devolve o registro (com ou sem a foto nova).
async function preencherFotoSeFaltar(rec) {
  if (!rec || rec.image_url || !rec.name) return rec;
  try {
    const foto = await buscarFotoDoLugar({
      name: rec.name, locality: rec.locality,
      lat: rec.latitude, lng: rec.longitude,
    });
    if (!foto) return rec;
    const ext  = (foto.contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `establishments/${rec.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, foto.buffer, { contentType: foto.contentType, upsert: true });
    if (upErr) { console.warn('[establishments] upload foto falhou:', upErr.message); return rec; }
    // Cache-buster: o upsert reusa o caminho; sem query o CDN serviria a antiga.
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const imageUrl = `${publicUrl}?v=${Date.now()}`;
    const { data: upd } = await supabase
      .from('establishments')
      .update({ image_url: imageUrl })
      .eq('id', rec.id)
      .select()
      .single();
    return upd || { ...rec, image_url: imageUrl };
  } catch (err) {
    console.warn('[establishments] preencherFoto falhou:', err.message);
    return rec;
  }
}

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

    // Base do proxy de fotos (URL absoluta, para o <img> do app). No Render a
    // API fica atrás de proxy, então req.protocol vem "http" — usar isso geraria
    // uma imagem http:// dentro de um app https:// (mixed content, bloqueada).
    // Respeita o x-forwarded-proto (https em produção).
    const proto = req.headers['x-forwarded-proto']?.split(',')[0] || req.protocol;
    const proxyBase = `${proto}://${req.get('host')}/api/establishments/photo`;

    // Google Places ao vivo (nota + foto reais, qualquer região). Se não houver
    // chave ou falhar, cai no Geoapify (OSM), que ao menos lista nomes.
    const g = await descobrirLugaresProximos({ lat, lng: lon, radius, category, photoBase: proxyBase });
    if (g.enabled && g.results.length) return res.json(g);

    const data = await fetchNearby({ lat, lon, radius, category });
    res.json(data);
  } catch (err) {
    console.error('[establishments/nearby]', err.message);
    res.json({ enabled: true, results: [], error: 'provider_error' });
  }
});

// ── GET /api/establishments/photo ──────────────────────
// Proxy das fotos do Google Places: resolve a URL final e redireciona. Só é
// chamado quando a foto aparece na tela — a chave nunca vai ao cliente e o
// custo de foto fica sob demanda (com cache de 24h no serviço).
router.get('/photo', async (req, res) => {
  try {
    const { name, ref } = req.query;
    const w = Math.min(Math.max(Number(req.query.w) || 800, 100), 1600);
    if (!name && !ref) return res.status(400).end();
    // name = Places API (New); ref = photo_reference da API legada. Transmite os
    // bytes (a chave nunca vai ao cliente).
    const foto = await fotoBytes({ name, ref, maxWidth: w });
    if (!foto) return res.status(404).end();
    res.set('Content-Type', foto.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    // O helmet põe Cross-Origin-Resource-Policy: same-origin em tudo, o que faz
    // o navegador BLOQUEAR esta imagem quando embutida no app (outra origem).
    // Liberamos só esta resposta de foto para embed cross-origin.
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.end(foto.buffer);
  } catch {
    return res.status(404).end();
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

// ── POST /api/establishments/backfill-photos ───────────
// Preenche via Google Places a foto dos estabelecimentos ativos que estão sem
// imagem. Processa em lote pequeno (padrão 20) por chamada para conter o custo
// e o tempo; retorne e chame de novo até "restantes: 0".
router.post('/backfill-photos', requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.body?.limit) || 20, 1), 40);
    const { data: pendentes, error } = await supabase
      .from('establishments')
      .select('id, name, locality, latitude, longitude, image_url')
      .eq('is_active', true)
      .or('image_url.is.null,image_url.eq.')
      .limit(limit);
    if (error) throw error;

    let preenchidos = 0;
    for (const rec of pendentes || []) {
      const upd = await preencherFotoSeFaltar(rec);
      if (upd?.image_url) preenchidos += 1;
    }

    // Quantos ainda faltam depois deste lote (para saber se repete).
    const { count: restantes } = await supabase
      .from('establishments')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .or('image_url.is.null,image_url.eq.');

    res.json({ processados: pendentes?.length || 0, preenchidos, restantes: restantes || 0 });
  } catch (err) { next(err); }
});

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const body = schema.parse(req.body);
    const payload = clean({ ...body, created_by_user_id: req.user.id });
    const { data, error } = await supabase
      .from('establishments').insert(payload).select().single();
    if (error) throw error;
    // Sem imagem informada → tenta puxar do Google Places (best-effort).
    const enriched = await preencherFotoSeFaltar(data);
    res.status(201).json(enriched);
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
    // Continua sem imagem depois de salvar → tenta puxar do Google (best-effort).
    const enriched = await preencherFotoSeFaltar(data);
    res.json(enriched);
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
