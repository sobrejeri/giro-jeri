/**
 * /api/catalog — CRUD de tours, transfers e rotas (admin/operator)
 */
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(requireOperator);

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

router.post('/tours', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tours').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/tours/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tours').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Passeio não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/tours/:id', async (req, res, next) => {
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

router.post('/transfers', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfers').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfers/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfers').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Transfer não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/transfers/:id', async (req, res, next) => {
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

router.post('/transfer-routes', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfer_routes').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/transfer-routes/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfer_routes').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Rota não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/transfer-routes/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('transfer_routes').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
