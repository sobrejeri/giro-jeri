/**
 * /api/catalog — CRUD de tours, transfers e rotas
 * GETs: qualquer operador/admin autenticado
 * POST/PUT/DELETE: somente admin
 */
import { Router } from 'express';
import { authenticate, requireOperator, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireOperator); // leitura: operador ou admin

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Seleciona apenas as chaves permitidas de um objeto. Usado para não enviar
// ao update/insert colunas inexistentes (ex.: o join `transfers` ou campos
// somente-leitura como id/created_at que o front reenvia ao editar).
function pick(obj, keys) {
  const out = {}
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

// Colunas graváveis de transfer_routes (migration 001)
const ROUTE_COLS = [
  'transfer_id', 'origin_name', 'destination_name',
  'origin_latitude', 'origin_longitude', 'destination_latitude', 'destination_longitude',
  'default_price', 'extra_stop_price', 'night_fee', 'is_active',
]

// Colunas graváveis de transfers (serviço-pai)
const TRANSFER_COLS = [
  'region_id', 'name', 'slug', 'short_description', 'pricing_mode',
  'is_active', 'display_order', 'booking_cutoff_time', 'min_advance_hours',
]

// ── Categorias ────────────────────────────────────────────

router.get('/categories', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('categories').select('*').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── Tours ─────────────────────────────────────────────────

router.get('/tours', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('tours')
      .select('*, categories(id, name, slug)')
      .order('display_order', { ascending: true })
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/tours', requireAdmin, async (req, res, next) => {
  try {
    const { data: region } = await req.supabase
      .from('regions').select('id').limit(1).single();

    const {
      name, short_description, duration_hours, max_people,
      is_private_enabled, is_shared_enabled, shared_price_per_person,
      cover_image_url, category_id, region_ids, is_featured, display_order,
      booking_cutoff_time, min_advance_hours,
    } = req.body;

    const slug = `${slugify(name)}-${Date.now().toString(36)}`;

    const { data, error } = await req.supabase.from('tours').insert({
      region_id:               region.id,
      name,
      slug,
      short_description:       short_description || null,
      duration_hours:          duration_hours   ? Number(duration_hours)   : null,
      max_people:              max_people       ? Number(max_people)       : null,
      is_private_enabled:      is_private_enabled !== false,
      is_shared_enabled:       !!is_shared_enabled,
      shared_price_per_person: shared_price_per_person ? Number(shared_price_per_person) : null,
      cover_image_url:         cover_image_url  || null,
      category_id:             category_id      || null,
      region_ids:              Array.isArray(region_ids) ? region_ids : [],
      is_featured:             !!is_featured,
      display_order:           display_order ? Number(display_order) : 0,
      booking_cutoff_time:     booking_cutoff_time || null,
      min_advance_hours:       min_advance_hours ? Number(min_advance_hours) : null,
    }).select().single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/tours/:id', requireAdmin, async (req, res, next) => {
  try {
    const {
      name, short_description, duration_hours, max_people,
      is_private_enabled, is_shared_enabled, shared_price_per_person,
      cover_image_url, category_id, is_active, display_order, is_featured,
      latitude, longitude, service_radius_km, region_ids,
      booking_cutoff_time, min_advance_hours,
    } = req.body;

    const update = {};
    if (booking_cutoff_time !== undefined) update.booking_cutoff_time = booking_cutoff_time || null;
    if (min_advance_hours   !== undefined) update.min_advance_hours   = min_advance_hours ? Number(min_advance_hours) : null;
    if (name               !== undefined) update.name                    = name;
    if (short_description  !== undefined) update.short_description       = short_description;
    if (duration_hours     !== undefined) update.duration_hours          = duration_hours ? Number(duration_hours) : null;
    if (max_people         !== undefined) update.max_people              = max_people ? Number(max_people) : null;
    if (is_private_enabled !== undefined) update.is_private_enabled      = is_private_enabled;
    if (is_shared_enabled  !== undefined) update.is_shared_enabled       = is_shared_enabled;
    if (shared_price_per_person !== undefined) update.shared_price_per_person = shared_price_per_person ? Number(shared_price_per_person) : null;
    if (cover_image_url    !== undefined) update.cover_image_url         = cover_image_url;
    if (category_id        !== undefined) update.category_id             = category_id || null;
    if (is_active          !== undefined) update.is_active               = is_active;
    if (is_featured        !== undefined) update.is_featured             = is_featured;
    if (display_order      !== undefined) update.display_order           = Number(display_order) || 0;
    if (latitude           !== undefined) update.latitude                = latitude === '' || latitude === null ? null : Number(latitude);
    if (longitude          !== undefined) update.longitude               = longitude === '' || longitude === null ? null : Number(longitude);
    if (service_radius_km  !== undefined) update.service_radius_km       = service_radius_km === '' || service_radius_km === null ? null : Number(service_radius_km);
    if (region_ids         !== undefined) update.region_ids              = Array.isArray(region_ids) ? region_ids : [];

    const { data, error } = await req.supabase
      .from('tours').update(update).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Passeio não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/tours/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from('tours').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Transfers (serviços) ──────────────────────────────────

router.get('/transfers', async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('transfers')
      .select('id, name, is_active, short_description, pricing_mode, display_order, booking_cutoff_time, min_advance_hours, region_id')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/transfers', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('transfers').insert(pick(req.body, TRANSFER_COLS)).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfers/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('transfers').update(pick(req.body, TRANSFER_COLS)).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Transfer não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/transfers/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from('transfers').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Rotas de Transfer ─────────────────────────────────────

router.get('/transfer-routes', async (req, res, next) => {
  try {
    const { transfer_id } = req.query;
    let query = req.supabase
      .from('transfer_routes').select('*, transfers(id, name, booking_cutoff_time)').order('origin_name');
    if (transfer_id) query = query.eq('transfer_id', transfer_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/transfer-routes', requireAdmin, async (req, res, next) => {
  try {
    const body = pick(req.body, ROUTE_COLS);
    if (body.default_price != null) body.default_price = Number(body.default_price);
    const { data, error } = await req.supabase
      .from('transfer_routes').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfer-routes/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = pick(req.body, ROUTE_COLS);
    if (body.default_price != null) body.default_price = Number(body.default_price);
    const { data, error } = await req.supabase
      .from('transfer_routes').update(body).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'Rota não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/transfer-routes/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await req.supabase
      .from('transfer_routes').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
