import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';
import {
  calculateTabbedTransfer,
  validateTransferAdvance,
} from '../services/priceEngine.js';
import dayjs from 'dayjs';

const router = Router();

// ── GET /api/transfers ─────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { region_id } = req.query;

    let query = supabase
      .from('transfers')
      .select(`
        id, name, slug, short_description, pricing_mode,
        estimated_duration_minutes, is_active, display_order,
        regions ( id, name ),
        transfer_routes (
          id, origin_name, destination_name, default_price, is_active
        )
      `)
      .eq('is_active', true)
      .order('display_order');

    if (region_id) query = query.eq('region_id', region_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
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

    // Cria notificação interna para a cooperativa
    await supabase.from('notifications').insert({
      channel:      'internal',
      template_key: 'new_transfer_quote',
      title:        'Nova cotação de transfer',
      message_body: `${req.user.full_name} solicitou transfer: ${body.origin_place_name} → ${body.destination_place_name} em ${body.service_date} às ${body.service_time}`,
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

// ── PATCH /api/transfers/quotes/:id/quote — cooperativa define preço
router.patch('/quotes/:id/quote', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { quoted_price, quote_notes } = req.body;

    if (!quoted_price || quoted_price <= 0) {
      return res.status(400).json({ error: 'Informe um preço válido' });
    }

    // Prazo para o cliente responder (configurável — padrão 2h)
    const { data: setting } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'quote_expiry_hours')
      .single();

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
      .select('*, users(full_name, phone)')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Cotação não encontrada ou já respondida' });
    }

    // Notifica o cliente
    await supabase.from('notifications').insert({
      user_id:      data.user_id,
      channel:      'whatsapp',
      template_key: 'quote_ready',
      title:        'Sua cotação está pronta',
      message_body: `Olá! Sua cotação de transfer ${data.origin_place_name} → ${data.destination_place_name} está pronta: R$ ${quoted_price.toFixed(2)}. Acesse o app para confirmar. Válido por ${expiryHours}h.`,
      destination:  data.users?.phone,
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

export default router;
