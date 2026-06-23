import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator, requireAdmin } from '../middleware/auth.js';
import { filterByRadius } from '../services/geo.js';

const router = Router();

// Monta o payload apenas com colunas reais da tabela `vehicles`.
// O frontend reaproveita o objeto vindo do GET (que traz o join `regions` e
// campos read-only); enviar esses campos no UPDATE faz o PostgREST rejeitar a
// operação — e a rota mascarava isso como 404 "não encontrado".
function buildVehiclePayload(body = {}) {
  const out = {};
  const str  = (k) => { if (body[k] !== undefined) out[k] = body[k]; };
  const num  = (k) => {
    if (body[k] === undefined) return;
    out[k] = body[k] === '' || body[k] === null ? null : Number(body[k]);
  };
  const bool = (k) => { if (body[k] !== undefined) out[k] = !!body[k]; };

  str('region_id'); str('name'); str('slug'); str('vehicle_type');
  str('category'); str('description'); str('image_url');
  num('seat_capacity'); num('luggage_capacity'); num('display_order');
  num('latitude'); num('longitude'); num('service_radius_km');
  bool('is_private_allowed'); bool('is_shared_allowed');
  bool('is_transfer_allowed'); bool('is_tour_allowed'); bool('is_active');
  if (Array.isArray(body.region_ids)) out.region_ids = body.region_ids;

  return out;
}

// GET /api/vehicles — lista veículos (público)
router.get('/', async (req, res, next) => {
  try {
    const { region_id, vehicle_type, is_active, lat, lon, radius } = req.query;
    let query = supabase
      .from('vehicles')
      .select('*, regions ( id, name, center_latitude, center_longitude, service_radius_km )')
      .order('name');
    if (region_id)   query = query.eq('region_id', region_id);
    if (vehicle_type) query = query.eq('vehicle_type', vehicle_type);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    const { data, error } = await query;
    if (error) throw error;

    const filtered = lat && lon ? filterByRadius(data, lat, lon, radius) : data;
    res.json(filtered);
  } catch (err) { next(err); }
});

// POST /api/vehicles — cria veículo (operador/admin)
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vehicles').insert(buildVehiclePayload(req.body)).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// PUT /api/vehicles/:id — atualiza veículo (operador/admin)
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('vehicles').update(buildVehiclePayload(req.body))
      .eq('id', req.params.id).select().maybeSingle();
    if (error) throw error; // erro real do banco → mensagem clara via errorHandler
    if (!data) return res.status(404).json({ error: 'Veículo não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// DELETE /api/vehicles/:id — desativa veículo (operador/admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('vehicles').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
