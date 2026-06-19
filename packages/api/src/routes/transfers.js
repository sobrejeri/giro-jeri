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

    if (region_id) query = query.eq('region_id', region_id);

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
      .select('*')
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
    const { data, error } = await supabase
      .from('transfer_quotes')
      .select('*, users!transfer_quotes_user_id_fkey ( full_name, phone, email )')
      .in('status', ['quoted', 'accepted', 'expired', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    res.json(data || []);
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
    const { data: existing, error: findErr } = await supabase
      .from('transfer_quotes')
      .select('id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findErr) { console.error('[quote] busca falhou:', findErr); return res.status(500).json({ error: findErr.message }); }
    if (!existing) return res.status(404).json({ error: 'Cotação não encontrada' });
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

    // transfer_quotes tem 2 FKs para users (user_id e quoted_by_user_id);
    // o embed precisa do nome do vínculo, senão o PostgREST falha por ambiguidade.
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
      .select('*, users!transfer_quotes_user_id_fkey ( full_name, phone )')
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

    res.json({
      message:      'Cotação aceita! Prossiga para o pagamento.',
      quoted_price: quote.quoted_price,
      quote_id:     quote.id,
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
