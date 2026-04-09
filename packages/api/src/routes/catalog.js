/**
 * /api/catalog — CRUD de transfers e rotas (admin)
 * Complementa /api/tours (já existente) com a gestão de transfers/rotas.
 */
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── Transfers ─────────────────────────────────────────────

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

router.get('/transfer-routes', requireAdmin, async (req, res, next) => {
  try {
    const { transfer_id } = req.query;
    let query = supabase
      .from('transfer_routes').select('*, transfers(name)').order('origin_name');
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

// ── Tours — delete (complementa PUT/POST já existentes) ──

router.delete('/tours/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('tours').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
