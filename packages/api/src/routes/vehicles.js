import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';

const router = Router();

// GET /api/vehicles — lista veículos (público)
router.get('/', async (req, res, next) => {
  try {
    const { region_id, vehicle_type, is_active } = req.query;
    let query = supabase.from('vehicles').select('*').order('name');
    if (region_id)   query = query.eq('region_id', region_id);
    if (vehicle_type) query = query.eq('vehicle_type', vehicle_type);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/vehicles — cria veículo (operador/admin)
router.post('/', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vehicles').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// PUT /api/vehicles/:id — atualiza veículo (operador/admin)
router.put('/:id', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vehicles').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Veículo não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// DELETE /api/vehicles/:id — desativa veículo (operador/admin)
router.delete('/:id', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('vehicles').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
