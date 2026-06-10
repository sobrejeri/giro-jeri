// ── establishments.js ──────────────────────────────────
// Diretório de estabelecimentos da vila. Leitura pública; escrita só admin.
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
  is_featured: z.boolean().optional(),
  is_active:   z.boolean().optional(),
  sort_order:  z.number().int().optional(),
});

function clean(payload) {
  Object.keys(payload).forEach((k) => { if (payload[k] === '') payload[k] = null; });
  return payload;
}

// ── GET /api/establishments ────────────────────────────
// Público: ativos, destaques primeiro. Filtro opcional ?category=
router.get('/', async (req, res, next) => {
  try {
    let q = supabase
      .from('establishments')
      .select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('sort_order',  { ascending: true })
      .order('created_at',  { ascending: false });
    if (req.query.category) q = q.eq('category', req.query.category);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

// ── GET /api/establishments/nearby ─────────────────────
// Público: estabelecimentos reais por geolocalização (Geoapify/OpenStreetMap).
// Sem chave configurada, devolve enabled:false (o app só mostra os manuais).
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
    // Nunca derruba a aba: em erro do provedor, devolve lista vazia
    console.error('[establishments/nearby]', err.message);
    res.json({ enabled: true, results: [], error: 'provider_error' });
  }
});

// ── Rotas administrativas ──────────────────────────────
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

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('establishments').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
