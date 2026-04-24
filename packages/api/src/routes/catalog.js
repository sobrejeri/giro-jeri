/**
 * /api/catalog — CRUD de tours, transfers e rotas
 * GETs: qualquer operador/admin autenticado
 * POST/PUT/DELETE: somente admin
 */
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireOperator); // leitura: operador ou admin

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── Categorias ────────────────────────────────────────────

router.get('/categories', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('categories').select('*').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── Tours ─────────────────────────────────────────────────

router.get('/tours', async (req, res, next) => {
  try {
    const { data, error } = await supabase
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
    const { data: region } = await supabase
      .from('regions').select('id').limit(1).single();

    const {
      name, short_description, duration_hours, max_people,
      is_private_enabled, is_shared_enabled, shared_price_per_person,
      cover_image_url, category_id,
    } = req.body;

    const slug = `${slugify(name)}-${Date.now().toString(36)}`;

    const { data, error } = await supabase.from('tours').insert({
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
      cover_image_url, category_id, is_active, display_order,
    } = req.body;

    const update = {};
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
    if (display_order      !== undefined) update.display_order           = display_order;

    const { data, error } = await supabase
      .from('tours').update(update).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Passeio não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/tours/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('tours').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Transfers (serviços) ──────────────────────────────────

router.get('/transfers', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfers').select('id, name, is_active').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/transfers', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfers').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfers/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfers').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Transfer não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/transfers/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('transfers').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Rotas de Transfer ─────────────────────────────────────

router.get('/transfer-routes', async (req, res, next) => {
  try {
    const { transfer_id } = req.query;
    let query = supabase
      .from('transfer_routes').select('*, transfers(id, name)').order('origin_name');
    if (transfer_id) query = query.eq('transfer_id', transfer_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/transfer-routes', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfer_routes').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfer-routes/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfer_routes').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Rota não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/transfer-routes/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('transfer_routes').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
