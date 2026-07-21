import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  calculatePrivateTour,
  calculateSharedTour,
  suggestVehicles,
} from '../services/priceEngine.js';
import { filterByRadius } from '../services/geo.js';

const router = Router();

// ── GET /api/tours ─────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { region_id, category_id, mode, featured, search, lat, lon, radius } = req.query;

    let query = supabase
      .from('tours')
      .select(`
        id, name, slug, short_description, duration_hours,
        is_private_enabled, is_shared_enabled, shared_price_per_person,
        cover_image_url, tags, rating_average, rating_count,
        is_featured, display_order, booking_cutoff_time, min_advance_hours, is_exclusive,
        latitude, longitude, service_radius_km,
        regions ( id, name, center_latitude, center_longitude, service_radius_km ),
        categories ( id, name, slug )
      `)
      .eq('is_active', true)
      .order('display_order');

    if (region_id)   query = query.or(`region_ids.cs.{${region_id}},region_id.eq.${region_id}`);
    if (category_id) query = query.eq('category_id', category_id);
    if (featured)    query = query.eq('is_featured', true);
    if (mode === 'private')  query = query.eq('is_private_enabled', true);
    if (mode === 'shared')   query = query.eq('is_shared_enabled', true);
    if (search) query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const filtered = lat && lon ? filterByRadius(data, lat, lon, radius) : data;
    res.json(filtered);
  } catch (err) { next(err); }
});

// ── GET /api/tours/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tours')
      .select(`
        *,
        regions ( id, name, slug ),
        categories ( id, name, slug ),
        tour_schedules ( id, schedule_name, departure_time, estimated_return_time, active_weekdays )
      `)
      .eq('id', req.params.id)
      .eq('is_active', true)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Passeio não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/tours/:id/vehicles — veículos disponíveis ─
router.get('/:id/vehicles', async (req, res, next) => {
  try {
    // Só os veículos ATIVOS para ESTE passeio (regra específica no Motor de
    // Preços, com o toggle ligado). Sem regras globais e sem fallback de
    // "todos os veículos" — assim o admin controla, por passeio, quais veículos
    // aparecem no app. O join !inner também exige o VEÍCULO ativo e permitido
    // para passeios — senão uma regra órfã de veículo desativado (que nem
    // aparece na matriz do admin) vazaria para o app.
    // REGIÃO: mesma visão da matriz — só regras da região do passeio (ou sem
    // região). Regra criada sob outra região não vaza para o app.
    const { data: tourRow } = await supabase
      .from('tours').select('region_id').eq('id', req.params.id).maybeSingle();
    const userRegion = req.query.region_id || null;
    const tourRegion = tourRow?.region_id || null;

    // "Matriz = app 1:1": qualquer veículo com REGRA ATIVA para este passeio
    // aparece (igual ao cálculo autoritativo calculatePrivateTour, que também
    // não esconde por região). A região vira apenas PREFERÊNCIA de preço quando
    // há mais de uma regra para o mesmo veículo — nunca some o veículo.
    const { data, error } = await supabase
      .from('vehicle_pricing_rules')
      .select(`
        base_price, region_id,
        vehicles!inner (
          id, name, vehicle_type, seat_capacity, luggage_capacity,
          image_url, description, display_order
        )
      `)
      .eq('service_type', 'tour')
      .eq('service_id', req.params.id)
      .eq('is_active', true)
      .eq('vehicles.is_active', true)
      .eq('vehicles.is_tour_allowed', true);

    if (error) throw error;

    // Preferência de preço por região: região do usuário > região do passeio >
    // sem região (global) > qualquer outra. Depois deduplica por veículo.
    const rank = (r) =>
      (userRegion && r.region_id === userRegion) ? 0
      : (tourRegion && r.region_id === tourRegion) ? 1
      : (r.region_id == null) ? 2 : 3;
    const map = new Map();
    for (const r of (data || []).slice().sort((a, b) => rank(a) - rank(b))) {
      if (!r.vehicles) continue;
      if (!map.has(r.vehicles.id)) {
        map.set(r.vehicles.id, { ...r.vehicles, base_price: r.base_price });
      }
    }

    res.json(
      Array.from(map.values()).sort((a, b) => a.display_order - b.display_order)
    );
  } catch (err) { next(err); }
});

// ── POST /api/tours/:id/suggest-vehicles ───────────────
router.post('/:id/suggest-vehicles', async (req, res, next) => {
  try {
    const { region_id, people_count } = req.body;

    if (!region_id || !people_count) {
      return res.status(400).json({ error: 'region_id e people_count são obrigatórios' });
    }

    const suggestions = await suggestVehicles({
      regionId:    region_id,
      tourId:      req.params.id,
      peopleCount: Number(people_count),
    });

    res.json(suggestions);
  } catch (err) { next(err); }
});

// ── POST /api/tours/:id/calculate ─────────────────────
// Calcula o preço antes de criar a reserva
router.post('/:id/calculate', async (req, res, next) => {
  try {
    const {
      region_id, mode, service_date, people_count,
      vehicles, coupon_code,
    } = req.body;

    if (!region_id || !mode || !service_date) {
      return res.status(400).json({ error: 'region_id, mode e service_date são obrigatórios' });
    }

    let result;
    if (mode === 'private') {
      result = await calculatePrivateTour({
        regionId:    region_id,
        tourId:      req.params.id,
        serviceDate: service_date,
        vehicles:    vehicles || [],
        couponCode:  coupon_code,
        userId:      req.user?.id,
      });
    } else if (mode === 'shared') {
      result = await calculateSharedTour({
        regionId:    region_id,
        tourId:      req.params.id,
        serviceDate: service_date,
        peopleCount: Number(people_count),
        couponCode:  coupon_code,
        userId:      req.user?.id,
      });
    } else {
      return res.status(400).json({ error: 'mode deve ser private ou shared' });
    }

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/tours (admin) ────────────────────────────
router.post('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tours')
      .insert(req.body)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

// ── PUT /api/tours/:id (admin) ─────────────────────────
router.put('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('tours')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: 'Passeio não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
