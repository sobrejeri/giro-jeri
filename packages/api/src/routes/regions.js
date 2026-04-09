// ── regions.js ─────────────────────────────────────────
import { Router as R } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

export const regionsRouter = R();

regionsRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('regions')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

regionsRouter.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('regions').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

regionsRouter.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('regions').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Região não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});
