import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';
import {
  calculateTabbedTransfer,
  validateTransferAdvance,
  getDateSurcharge,
} from '../services/priceEngine.js';
import { filterByRadius } from '../services/geo.js';
import { notifyUser, notifyOperatorsAndAdmin } from '../services/notify.js';
import dayjs from 'dayjs';

const router = Router();

// ── GET /api/transfers/places/autocomplete ───────────────
// Proxy para Google Places Autocomplete usando a chave do servidor — evita
// depender de VITE_GOOGLE_MAPS_KEY no cliente (e expor a chave pública).
// Enviesado para Jericoacoara/Ceará, com fallback Nominatim se não houver chave.
const JERI_LL = { lat: -2.7976, lng: -40.5147 };
router.get('/places/autocomplete', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) return res.json({ predictions: [] });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (key) {
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
      url.searchParams.set('input',     q);
      url.searchParams.set('components','country:br');
      url.searchParams.set('location',  `${JERI_LL.lat},${JERI_LL.lng}`);
      url.searchParams.set('radius',    '150000');
      url.searchParams.set('language',  'pt-BR');
      url.searchParams.set('key',       key);
      const gRes = await fetch(url);
      const gJson = await gRes.json();
      if (gJson.status === 'OK' || gJson.status === 'ZERO_RESULTS') {
        return res.json({
          predictions: (gJson.predictions || []).map((p) => ({
            id:       p.place_id,
            label:    p.structured_formatting?.main_text || p.description,
            sublabel: p.structured_formatting?.secondary_text || '',
            full:     p.description,
            source:   'google',
          })),
        });
      }
      console.warn('[places/autocomplete] Google status=%s', gJson.status, gJson.error_message);
    }

    // Fallback Nominatim
    const params = new URLSearchParams({
      q, format: 'json', limit: '6', addressdetails: '1',
      countrycodes: 'br', 'accept-language': 'pt-BR',
      viewbox: '-41.5,-3.8,-39.5,-2.0', bounded: '0',
    });
    const nRes = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'GiroJeri/1.0' },
    });
    const nJson = await nRes.json();
    res.json({
      predictions: (nJson || []).map((p) => ({
        id:       String(p.place_id),
        label:    p.display_name.split(',').slice(0, 2).join(', '),
        sublabel: p.display_name.split(',').slice(2, 4).join(',').trim(),
        full:     p.display_name,
        lat:      parseFloat(p.lat),
        lon:      parseFloat(p.lon),
        source:   'nominatim',
      })),
    });
  } catch (err) { next(err); }
});

// ── GET /api/transfers/places/details ────────────────────
router.get('/places/details', async (req, res, next) => {
  try {
    const placeId = String(req.query.place_id || '').trim();
    if (!placeId) return res.status(400).json({ error: 'place_id obrigatório' });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return res.json({ details: null });

    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields',   'geometry,formatted_address,name');
    url.searchParams.set('language', 'pt-BR');
    url.searchParams.set('key',      key);
    const gRes = await fetch(url);
    const gJson = await gRes.json();
    if (gJson.status !== 'OK' || !gJson.result?.geometry?.location) {
      return res.json({ details: null });
    }
    res.json({
      details: {
        lat:     gJson.result.geometry.location.lat,
        lon:     gJson.result.geometry.location.lng,
        address: gJson.result.formatted_address || gJson.result.name || null,
      },
    });
  } catch (err) { next(err); }
});

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
// COTAÇÕES (rotas livres via Maps)
// =============================================================================

const quoteSchema = z.object({
  region_id:                z.string().uuid(),
  origin_place_id:          z.string().optional(),
  origin_place_name:        z.string().min(2),
  origin_latitude:          z.number().optional(),
  origin_longitude:         z.number().optional(),
  origin_address_text:      z.string().optional(),
  destination_place_id:     z.string().optional(),
  destination_place_name:   z.string().min(2),
  destination_latitude:     z.number().optional(),
  destination_longitude:    z.number().optional(),
  destination_address_text: z.string().optional(),
  service_date:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  service_time:             z.string().regex(/^\d{2}:\d{2}$/),
  people_count:             z.number().int().min(1).max(50),
  luggage_count:            z.number().int().min(0).max(20).default(0),
  special_notes:            z.string().optional(),
});

// ── POST /api/transfers/quotes ─────────────────────────
router.post('/quotes', authenticate, async (req, res, next) => {
  try {
    const body = quoteSchema.parse(req.body);

    // Valida antecedência mínima de 4h
    await validateTransferAdvance(body.service_date, body.service_time);

    const { data, error } = await supabase
      .from('transfer_quotes')
      .insert({
        ...body,
        user_id:        req.user.id,
        source_channel: 'app',
        status:         'pending_quote',
      })
      .select()
      .single();

    if (error) throw error;

    // Avisa cooperativas + admin sobre a nova solicitação de translado personalizado
    await notifyOperatorsAndAdmin({
      templateKey: 'new_transfer_quote',
      title:       'Nova cotação de translado',
      body:        `${req.user.full_name} pediu um translado personalizado: ${body.origin_place_name} → ${body.destination_place_name} em ${dayjs(body.service_date).format('DD/MM')} às ${body.service_time}. Abra para cotar.`,
    });

    res.status(201).json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── GET /api/transfers/quotes — turista vê suas cotações
router.get('/quotes', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfer_quotes')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/transfers/quotes/pending — cooperativa ────
router.get('/quotes/pending', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('v_quotes_dashboard')
      .select('*')
      .order('is_urgent', { ascending: false })
      .order('service_date');

    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/transfers/quotes/history — cotações já respondidas (operador)
router.get('/quotes/history', authenticate, requireOperator, async (req, res, next) => {
  try {
    // Sem embed por FK (frágil — depende do PostgREST resolver o relacionamento
    // certo entre as 2 FKs de transfer_quotes para users). Busca os clientes à
    // parte e junta em memória, igual ao /operator/bookings.
    const { data: quotes, error } = await supabase
      .from('transfer_quotes')
      .select('*')
      .in('status', ['quoted', 'accepted', 'expired', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const userIds = [...new Set((quotes || []).map((q) => q.user_id).filter(Boolean))];
    let byId = new Map();
    if (userIds.length > 0) {
      const { data: users, error: uErr } = await supabase
        .from('users')
        .select('id, full_name, phone, email')
        .in('id', userIds);
      if (uErr) throw uErr;
      byId = new Map((users || []).map((u) => [u.id, u]));
    }

    res.json((quotes || []).map((q) => ({ ...q, users: byId.get(q.user_id) || null })));
  } catch (err) { next(err); }
});

// ── PATCH /api/transfers/quotes/:id/quote — cooperativa define preço
router.patch('/quotes/:id/quote', authenticate, requireOperator, async (req, res, next) => {
  try {
    const quoted_price = Number(req.body.quoted_price);
    // Aceita quote_notes ou operator_notes (nome enviado pelo painel da coop.)
    const quote_notes  = req.body.quote_notes ?? req.body.operator_notes ?? null;

    if (!quoted_price || quoted_price <= 0) {
      return res.status(400).json({ error: 'Informe um preço válido' });
    }

    // Confirma existência e estado da cotação — erros claros em vez de genérico
    console.log('[quote] PATCH op=%s quote_id=%s body=%j', req.user.id, req.params.id, req.body);
    const { data: existing, error: findErr } = await supabase
      .from('transfer_quotes')
      .select('id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) { console.error('[quote] busca falhou:', findErr); return res.status(500).json({ error: findErr.message }); }
    if (!existing) {
      console.warn('[quote] não encontrada id=%s', req.params.id);
      return res.status(404).json({ error: `Cotação ${req.params.id} não encontrada` });
    }
    if (existing.status !== 'pending_quote') {
      return res.status(409).json({ error: 'Esta cotação já foi respondida. Atualize a lista.' });
    }

    // Prazo para o cliente responder (configurável — padrão 2h)
    const { data: setting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'quote_expiry_hours')
      .maybeSingle();

    const expiryHours = parseInt(setting?.setting_value || '2');
    const expiresAt   = dayjs().add(expiryHours, 'hour').toISOString();

    const { data, error } = await supabase
      .from('transfer_quotes')
      .update({
        quoted_price,
        quote_notes,
        status:             'quoted',
        quoted_by_user_id:  req.user.id,
        quoted_at:          new Date().toISOString(),
        expires_at:         expiresAt,
      })
      .eq('id', req.params.id)
      .eq('status', 'pending_quote')
      .select('*')
      .single();

    if (error) { console.error('[quote] update falhou:', error); return res.status(500).json({ error: error.message }); }
    if (!data)  return res.status(409).json({ error: 'Cotação já respondida por outra cooperativa.' });

    // Notifica o cliente na central do app (best-effort)
    notifyUser({
      userId:      data.user_id,
      templateKey: 'quote_ready',
      title:       'Sua cotação está pronta 💸',
      body:        `Seu translado ${data.origin_place_name} → ${data.destination_place_name} saiu por R$ ${quoted_price.toFixed(2)}. Abra o app para aceitar (válido por ${expiryHours}h).`,
    });

    res.json(data);
  } catch (err) { next(err); }
});

// ── POST /api/transfers/quotes/:id/accept — cliente aceita
router.post('/quotes/:id/accept', authenticate, async (req, res, next) => {
  try {
    const { data: quote, error } = await supabase
      .from('transfer_quotes')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .eq('status', 'quoted')
      .single();

    if (error || !quote) {
      return res.status(404).json({ error: 'Cotação não encontrada ou não disponível' });
    }

    // Verifica se não expirou
    if (quote.expires_at && dayjs().isAfter(dayjs(quote.expires_at))) {
      await supabase
        .from('transfer_quotes')
        .update({ status: 'expired' })
        .eq('id', quote.id);
      return res.status(400).json({ error: 'Esta cotação expirou. Solicite uma nova.' });
    }

    await supabase
      .from('transfer_quotes')
      .update({ status: 'accepted', client_responded_at: new Date().toISOString() })
      .eq('id', quote.id);

    // Cria a reserva já atribuída à cooperativa que cotou — pula a fila geral
    // de aceite, pois o preço e o prestador já foram negociados na cotação.
    const bookingCode = `GJ${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .insert({
        booking_code:       bookingCode,
        user_id:            req.user.id,
        region_id:          quote.region_id,
        service_type:       'transfer',
        service_id:         quote.id,
        operator_id:        quote.quoted_by_user_id,
        booking_mode:       'private',
        service_date:       quote.service_date,
        service_time:       quote.service_time,
        people_count:       quote.people_count,
        origin_text:        quote.origin_place_name,
        destination_text:   quote.destination_place_name,
        total_amount:       quote.quoted_price,
        status_commercial:  'awaiting_payment',
        status_operational: 'assigned',
        payment_status:     'pending',
      })
      .select('id, booking_code')
      .single();
    if (bErr) throw bErr;

    await supabase.from('transfer_quotes').update({ booking_id: booking.id }).eq('id', quote.id);

    res.json({
      message:      'Cotação aceita! Prossiga para o pagamento.',
      quoted_price: quote.quoted_price,
      quote_id:     quote.id,
      booking_id:   booking.id,
      booking_code: booking.booking_code,
    });
  } catch (err) { next(err); }
});

// ── POST /api/transfers/quotes/:id/reject — cliente recusa
router.post('/quotes/:id/reject', authenticate, async (req, res, next) => {
  try {
    const { rejection_reason } = req.body;

    const { data, error } = await supabase
      .from('transfer_quotes')
      .update({
        status:               'rejected',
        rejection_reason,
        client_responded_at:  new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .eq('status', 'quoted')
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cotação não encontrada' });
    }

    res.json({ message: 'Cotação recusada.' });
  } catch (err) { next(err); }
});

// ── POST /api/transfers/quotes/:id/cancel — cliente cancela a solicitação
// Funciona em qualquer estado ativo (aguardando preço, cotada ou aceita).
router.post('/quotes/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('transfer_quotes')
      .update({ status: 'cancelled', client_responded_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .in('status', ['pending_quote', 'quoted', 'accepted'])
      .select('id')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cotação não encontrada ou já finalizada' });
    }

    res.json({ message: 'Solicitação cancelada.' });
  } catch (err) { next(err); }
});

export default router;
