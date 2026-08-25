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

    // Colunas de apresentação do cartão (duração/dificuldade/capacidade/selo).
    // Ficam separadas porque são OPCIONAIS: se alguma faltar no banco, a lista
    // inteira de passeios cairia — e esta é a consulta que sustenta a home e a
    // tela de Passeios. O front já trata a ausência de cada uma (some do
    // cartão), então vale mais devolver a lista sem elas do que devolver 500.
    const COLUNAS_APRESENTACAO = 'difficulty_level, max_people, highlight_badge,';
    // `is_exclusive`/`sort_order` da CATEGORIA (migration 071) definem os
    // carrosséis por categoria no app. Entram no mesmo caminho tolerante: sem a
    // migration aplicada, a lista sai com a categoria básica em vez de 500.
    const COLUNAS_CATEGORIA = 'id, name, slug, is_exclusive, sort_order';

    const montar = (apresentacao, colunasCategoria) => {
      let q = supabase
        .from('tours')
        .select(`
          id, name, slug, short_description, duration_hours,
          is_private_enabled, is_shared_enabled, shared_price_per_person,
          cover_image_url, tags, rating_average, rating_count,
          is_featured, display_order, booking_cutoff_time, min_advance_hours, is_exclusive,
          ${apresentacao}
          latitude, longitude, service_radius_km,
          regions ( id, name, center_latitude, center_longitude, service_radius_km ),
          categories ( ${colunasCategoria} )
        `)
        .eq('is_active', true)
        .order('display_order');

      if (region_id)   q = q.or(`region_ids.cs.{${region_id}},region_id.eq.${region_id}`);
      if (category_id) q = q.eq('category_id', category_id);
      if (featured)    q = q.eq('is_featured', true);
      if (mode === 'private')  q = q.eq('is_private_enabled', true);
      if (mode === 'shared')   q = q.eq('is_shared_enabled', true);
      if (search) q = q.ilike('name', `%${search}%`);
      return q;
    };

    let { data, error } = await montar(COLUNAS_APRESENTACAO, COLUNAS_CATEGORIA);
    if (error?.code === '42703') {   // coluna inexistente
      console.warn('[tours] colunas opcionais ausentes; tentando sem as da categoria:', error.message);
      ({ data, error } = await montar(COLUNAS_APRESENTACAO, 'id, name, slug'));
    }
    if (error?.code === '42703') {
      console.warn('[tours] colunas de apresentação ausentes; seguindo sem elas:', error.message);
      ({ data, error } = await montar('', 'id, name, slug'));
    }
    if (error) throw error;

    let filtered = lat && lon ? filterByRadius(data, lat, lon, radius) : data;

    // Preço "a partir de" do PRIVATIVO: menor base_price entre as regras ativas
    // do passeio. A lista não trazia isso, então a home só conseguia mostrar
    // preço de passeio compartilhado — e preço é a principal dúvida antes do
    // clique. Best-effort: se falhar, a lista sai sem o campo.
    try {
      const ids = (filtered || []).map((t) => t.id).filter(Boolean);
      if (ids.length) {
        const { data: regras } = await supabase
          .from('vehicle_pricing_rules')
          .select('service_id, base_price')
          .eq('service_type', 'tour')
          .eq('is_active', true)
          .in('service_id', ids);
        const minimo = new Map();
        for (const r of regras || []) {
          const atual = minimo.get(r.service_id);
          const preco = Number(r.base_price);
          if (!Number.isFinite(preco)) continue;
          if (atual == null || preco < atual) minimo.set(r.service_id, preco);
        }
        filtered = filtered.map((t) => ({ ...t, from_price: minimo.get(t.id) ?? null }));
      }
    } catch (e) {
      console.error('[tours] preço "a partir de" falhou:', e.message);
    }

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
      .from('tours').select('region_id, region_ids').eq('id', req.params.id).maybeSingle();
    const userRegion = req.query.region_id || null;
    const tourRegions = [tourRow?.region_id, ...(Array.isArray(tourRow?.region_ids) ? tourRow.region_ids : [])]
      .filter(Boolean);

    // Todas as regras ATIVAS deste passeio (veículo ativo e permitido p/ passeios).
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
    const all = (data || []).filter((r) => r.vehicles);

    // "Matriz = app 1:1" por região: usa só as regras da(s) região(ões) do
    // passeio (ou globais, sem região). Assim uma regra criada sob OUTRA região
    // (ex.: um veículo sem valor na região do passeio) não vaza. Fallback: se
    // NENHUMA regra casar com a(s) região(ões) do passeio (dados antigos com
    // região divergente), usa todas — para não esvaziar um passeio já precificado.
    const inTourRegion = (r) => r.region_id == null || tourRegions.includes(r.region_id);
    const scoped = tourRegions.length ? all.filter(inTourRegion) : all;
    const use = scoped.length ? scoped : all;

    // Deduplica por veículo, preferindo o preço da região do usuário > global.
    const rank = (r) => (userRegion && r.region_id === userRegion) ? 0 : (r.region_id == null) ? 1 : 2;
    const map = new Map();
    for (const r of use.slice().sort((a, b) => rank(a) - rank(b))) {
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
