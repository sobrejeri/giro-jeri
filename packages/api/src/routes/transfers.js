import { Router } from 'express';
import { supabase } from '../supabase.js';
import {
  calculateTabbedTransfer,
  getDateSurcharge,
} from '../services/priceEngine.js';
import { filterByRadius } from '../services/geo.js';

const router = Router();

// ── GET /api/transfers ─────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { region_id, lat, lon, radius } = req.query;

    let query = supabase
      .from('transfers')
      .select(`
        id, name, slug, short_description, pricing_mode,
        estimated_duration_minutes, is_active, display_order,
        latitude, longitude, service_radius_km,
        regions ( id, name, center_latitude, center_longitude, service_radius_km ),
        transfer_routes (
          id, origin_name, destination_name, default_price, is_active
        )
      `)
      .eq('is_active', true)
      .order('display_order');

    if (region_id) query = query.or(`region_ids.cs.{${region_id}},region_id.eq.${region_id}`);

    const { data, error } = await query;
    if (error) throw error;

    const filtered = lat && lon ? filterByRadius(data, lat, lon, radius) : data;
    res.json(filtered);
  } catch (err) { next(err); }
});

// ── GET /api/transfers/routes ──────────────────────────
router.get('/routes', async (req, res, next) => {
  try {
    const { transfer_id } = req.query;

    let query = supabase
      .from('transfer_routes')
      .select('*, transfers ( short_description, full_description, booking_cutoff_time )')
      .eq('is_active', true)
      .order('default_price');

    if (transfer_id) query = query.eq('transfer_id', transfer_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── POST /api/transfers/calculate ─────────────────────
// Calcula preço de rota tabelada antes da reserva
router.post('/calculate', async (req, res, next) => {
  try {
    const { region_id, route_id, service_date, service_time, coupon_code } = req.body;

    if (!region_id || !route_id || !service_date || !service_time) {
      return res.status(400).json({
        error: 'region_id, route_id, service_date e service_time são obrigatórios',
      });
    }

    const result = await calculateTabbedTransfer({
      regionId:    region_id,
      routeId:     route_id,
      serviceDate: service_date,
      serviceTime: service_time,
      couponCode:  coupon_code,
      userId:      req.user?.id,
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ── POST /api/transfers/surcharge ─────────────────────
// Acréscimo de data (alta temporada / feriado) sobre um subtotal já conhecido.
// Usado para PREVIEW nas telas (translado e checkout) assim que o cliente
// escolhe a data — sem validação de antecedência e calculado sobre o subtotal
// real (preço da rota × veículos), igual ao que o pagamento cobra.
router.post('/surcharge', async (req, res, next) => {
  try {
    const { region_id, service_date } = req.body;
    const subtotal = Number(req.body.subtotal) || 0;

    if (!region_id || !service_date || subtotal <= 0) {
      return res.json({ seasonAdditional: 0, total: subtotal });
    }

    const seasonAdditional = await getDateSurcharge(region_id, service_date, subtotal);
    res.json({
      seasonAdditional,
      total: Math.round((subtotal + seasonAdditional) * 100) / 100,
    });
  } catch (err) { next(err); }
});

// =============================================================================
// COTAÇÕES (translado de rota personalizada) — DESCONTINUADAS NESTE ARQUIVO
//
// As rotas POST/GET /quotes, GET /quotes/pending, GET /quotes/history,
// PATCH /quotes/:id/quote, POST /quotes/:id/accept, /reject, /cancel foram
// REMOVIDAS (migration 038 — unify_transfer_quotes_into_bookings). O fluxo de
// translado personalizado agora nasce direto em `bookings` (is_manual_quote):
//   • Solicitar:            POST /api/payments/request   (service com
//     transfers.pricing_mode = 'manual_quote' → nasce sem preço, awaiting_acceptance)
//   • Cooperativa precifica/aceita: POST /api/operator/bookings/:id/accept
//     (body { quoted_price, quote_notes }) — aceite + preço no mesmo ato.
//   • Pagar:                POST /api/payments/intent    (existing_booking_id)
// `transfer_quotes` permanece só como tabela histórica (não recebe inserts
// novos). Nenhum cron/job do backend referenciava expire_pending_quotes() —
// o job ativo agora é expire_pending_bookings() (ver migration 038), mas como
// não havia agendador no código desta API, a expiração é feita lazy nas
// leituras (GET /api/operator/bookings, GET /api/bookings, GET /api/bookings/:id)
// e no aceite/pagamento.
// =============================================================================

export default router;
