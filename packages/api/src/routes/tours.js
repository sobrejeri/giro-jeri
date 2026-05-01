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
        is_featured, display_order,
        latitude, longitude, service_radius_km,
        regions ( id, name, center_latitude, center_longitude, service_radius_km ),
        categories ( id, name, slug )
      `)
      .eq('is_active', true)
      .order('display_order');

    if (region_id)   query = query.eq('region_id', region_id);
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
    const { data, error } = await supabase
      .from('vehicle_pricing_rules')
      .select(`
        base_price,
        vehicles (
          id, name, vehicle_type, seat_capacity, luggage_capacity,
          image_url, description, display_order
        )
      `)
      .eq('service_type', 'tour')
      .eq('is_active', true)
      .or(`service_id.eq.${req.params.id},service_id.is.null`)
      .order('service_id', { ascending: false, nullsFirst: false });

    if (error) throw error;

    // Deduplica: para cada veículo, mantém o preço mais específico
    const map = new Map();
    for (const r of data || []) {
      if (!r.vehicles) continue;
      if (!map.has(r.vehicles.id)) {
        map.set(r.vehicles.id, { ...r.vehicles, base_price: r.base_price });
      }
    }

    // Fallback: sem regras de preço → retorna todos os veículos ativos permitidos para passeios
    if (map.size === 0) {
      const { data: tour } = await supabase
        .from('tours')
        .select('region_id')
        .eq('id', req.params.id)
        .single();

      let q = supabase
        .from('vehicles')
        .select('id, name, vehicle_type, seat_capacity, luggage_capacity, image_url, description, display_order')
        .eq('is_tour_allowed', true)
        .eq('is_active', true)
        .order('display_order');

      if (tour?.region_id) q = q.eq('region_id', tour.region_id);

      const { data: fallback } = await q;
      return res.json(fallback || []);
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
