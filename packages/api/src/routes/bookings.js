import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';
import {
  calculatePrivateTour,
  calculateSharedTour,
  calculateTabbedTransfer,
  validateTransferAdvance,
} from '../services/priceEngine.js';
import dayjs from 'dayjs';

const router = Router();

// ── Schema de criação de reserva ───────────────────────
const createBookingSchema = z.object({
  region_id:         z.string().uuid(),
  service_type:      z.enum(['tour', 'transfer']),
  service_id:        z.string().uuid(),
  route_id:          z.string().uuid().optional(),
  schedule_id:       z.string().uuid().optional(),
  booking_mode:      z.enum(['private', 'shared']),
  service_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  service_time:      z.string().regex(/^\d{2}:\d{2}$/),
  people_count:      z.number().int().min(1).max(50),
  pickup_place_id:   z.string().optional(),
  pickup_place_name: z.string().optional(),
  pickup_latitude:   z.number().optional(),
  pickup_longitude:  z.number().optional(),
  destination_place_id:   z.string().optional(),
  destination_place_name: z.string().optional(),
  destination_latitude:   z.number().optional(),
  destination_longitude:  z.number().optional(),
  origin_text:       z.string().optional(),
  destination_text:  z.string().optional(),
  special_notes:     z.string().optional(),
  coupon_code:       z.string().optional(),
  payment_model:     z.enum(['full', 'deposit', 'pre_auth']).default('full'),
  source_channel:    z.enum(['app','web','whatsapp','agency_link','affiliate_link','admin_manual']).default('app'),
  // Veículos (privativo)
  vehicles:          z.array(z.object({
    vehicleId: z.string().uuid(),
    quantity:  z.number().int().min(1),
  })).optional(),
  // Para transfer via cotação
  quote_id:          z.string().uuid().optional(),
});

// ── POST /api/bookings ─────────────────────────────────
router.post('/', authenticate, async (req, res, next) => {
  try {
    const body = createBookingSchema.parse(req.body);

    // ── Calcula preço no backend (única fonte de verdade) ──
    let pricing;

    if (body.service_type === 'tour') {
      if (body.booking_mode === 'private') {
        pricing = await calculatePrivateTour({
          regionId:    body.region_id,
          tourId:      body.service_id,
          serviceDate: body.service_date,
          vehicles:    body.vehicles || [],
          couponCode:  body.coupon_code,
          userId:      req.user.id,
        });
      } else {
        pricing = await calculateSharedTour({
          regionId:    body.region_id,
          tourId:      body.service_id,
          serviceDate: body.service_date,
          peopleCount: body.people_count,
          couponCode:  body.coupon_code,
          userId:      req.user.id,
        });
      }
    } else {
      // transfer
      if (body.route_id) {
        // Rota tabelada
        pricing = await calculateTabbedTransfer({
          regionId:    body.region_id,
          routeId:     body.route_id,
          serviceDate: body.service_date,
          serviceTime: body.service_time,
          couponCode:  body.coupon_code,
          userId:      req.user.id,
        });
      } else if (body.quote_id) {
        // Transfer por cotação aceita
        const { data: quote } = await supabase
          .from('transfer_quotes')
          .select('*')
          .eq('id', body.quote_id)
          .eq('user_id', req.user.id)
          .eq('status', 'accepted')
          .single();

        if (!quote) {
          return res.status(400).json({ error: 'Cotação não encontrada ou não aceita' });
        }

        pricing = {
          subtotalAmount:   quote.quoted_price,
          seasonAdditional: 0,
          discountAmount:   0,
          totalAmount:      quote.quoted_price,
          couponId:         null,
          vehicleDetails:   [],
        };
      } else {
        return res.status(400).json({ error: 'Informe route_id (rota tabelada) ou quote_id (cotação)' });
      }
    }

    // ── Valida capacidade de veículos no privativo ─────
    if (body.booking_mode === 'private' && pricing.vehicleDetails) {
      const totalCapacity = pricing.vehicleDetails.reduce(
        (sum, v) => sum + v.vehicleCapacity * v.quantity, 0
      );
      if (totalCapacity < body.people_count) {
        return res.status(400).json({
          error: `Capacidade insuficiente. Selecionados: ${totalCapacity} lugares, necessário: ${body.people_count}`,
        });
      }
    }

    // ── Cria a reserva ─────────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        user_id:                  req.user.id,
        region_id:                body.region_id,
        service_type:             body.service_type,
        service_id:               body.service_id,
        route_id:                 body.route_id,
        schedule_id:              body.schedule_id,
        booking_mode:             body.booking_mode,
        service_date:             body.service_date,
        service_time:             body.service_time,
        people_count:             body.people_count,
        pickup_place_id:          body.pickup_place_id,
        pickup_place_name:        body.pickup_place_name,
        pickup_latitude:          body.pickup_latitude,
        pickup_longitude:         body.pickup_longitude,
        destination_place_id:     body.destination_place_id,
        destination_place_name:   body.destination_place_name,
        destination_latitude:     body.destination_latitude,
        destination_longitude:    body.destination_longitude,
        origin_text:              body.origin_text,
        destination_text:         body.destination_text,
        special_notes:            body.special_notes,
        subtotal_amount:          pricing.subtotalAmount,
        season_additional_amount: pricing.seasonAdditional,
        discount_amount:          pricing.discountAmount,
        total_amount:             pricing.totalAmount,
        coupon_id:                pricing.couponId,
        payment_model:            body.payment_model,
        source_channel:           body.source_channel,
        status_commercial:        'awaiting_payment',
        status_operational:       'new',
      })
      .select()
      .single();

    if (bookingError) throw bookingError;

    // ── Salva snapshot dos veículos (privativo) ────────
    if (body.booking_mode === 'private' && pricing.vehicleDetails?.length > 0) {
      const vehicleRows = pricing.vehicleDetails.map(v => ({
        booking_id:                booking.id,
        vehicle_id:                v.vehicleId,
        vehicle_name_snapshot:     v.vehicleName,
        vehicle_capacity_snapshot: v.vehicleCapacity,
        quantity:                  v.quantity,
        unit_price:                v.unitPrice,
        total_price:               v.totalPrice,
      }));

      const { error: vehicleError } = await supabase
        .from('booking_vehicles')
        .insert(vehicleRows);

      if (vehicleError) throw vehicleError;
    }

    // ── Salva snapshot do item principal ───────────────
    const serviceSnapshot = await getServiceSnapshot(body.service_type, body.service_id);
    await supabase.from('booking_items').insert({
      booking_id:           booking.id,
      service_type:         body.service_type,
      service_id:           body.service_id,
      title_snapshot:       serviceSnapshot.name,
      description_snapshot: serviceSnapshot.description,
      quantity:             body.people_count,
      unit_price:           pricing.subtotalAmount / body.people_count,
      total_price:          pricing.totalAmount,
    });

    // ── Registra uso do cupom ──────────────────────────
    if (pricing.couponId) {
      await supabase.from('coupon_redemptions').insert({
        coupon_id:               pricing.couponId,
        user_id:                 req.user.id,
        booking_id:              booking.id,
        discount_applied_amount: pricing.discountAmount,
      });
    }

    // ── Atualiza cotação se veio de quote ──────────────
    if (body.quote_id) {
      await supabase
        .from('transfer_quotes')
        .update({ status: 'paid', booking_id: booking.id })
        .eq('id', body.quote_id);
    }

    res.status(201).json({ booking, pricing });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── GET /api/bookings ──────────────────────────────────
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status_commercial, status_operational, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('bookings')
      .select(`
        id, booking_code, service_type, booking_mode,
        service_date, service_time, people_count,
        total_amount, status_commercial, status_operational,
        pickup_place_name, destination_place_name,
        created_at,
        booking_vehicles ( vehicle_name_snapshot, quantity, unit_price ),
        payments ( status, paid_at )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Turista vê apenas suas reservas
    if (req.user.user_type === 'tourist') {
      query = query.eq('user_id', req.user.id);
    }

    if (status_commercial)  query = query.eq('status_commercial', status_commercial);
    if (status_operational) query = query.eq('status_operational', status_operational);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// ── GET /api/bookings/:id ──────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        users ( full_name, phone, email ),
        regions ( name ),
        booking_vehicles ( * ),
        booking_items ( * ),
        payments ( * ),
        operational_assignments ( * )
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Reserva não encontrada' });

    // Turista só acessa sua própria reserva
    if (req.user.user_type === 'tourist' && data.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Adiciona link do Maps se tiver coordenadas
    if (data.pickup_latitude && data.destination_latitude) {
      data.maps_route_url =
        `https://www.google.com/maps/dir/?api=1` +
        `&origin=${data.pickup_latitude},${data.pickup_longitude}` +
        `&destination=${data.destination_latitude},${data.destination_longitude}` +
        `&travelmode=driving`;
    }

    res.json(data);
  } catch (err) { next(err); }
});

// ── POST /api/bookings/:id/cancel ─────────────────────
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const { cancel_reason } = req.body;

    const { data: booking } = await supabase
      .from('bookings')
      .select('*, users(full_name)')
      .eq('id', req.params.id)
      .single();

    if (!booking) return res.status(404).json({ error: 'Reserva não encontrada' });

    // Turista só cancela a própria reserva
    if (req.user.user_type === 'tourist' && booking.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    if (['cancelled', 'completed'].includes(booking.status_commercial)) {
      return res.status(400).json({ error: 'Esta reserva não pode ser cancelada' });
    }

    // Verifica política de cancelamento
    const { free, hoursLeft } = checkCancellationPolicy(booking);

    const { data, error } = await supabase
      .from('bookings')
      .update({
        status_commercial:  'cancelled',
        status_operational: 'cancelled',
        cancel_reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      booking: data,
      cancellation: {
        free,
        hoursLeft: Math.round(hoursLeft),
        message: free
          ? 'Cancelamento gratuito. Reembolso será processado em até 5 dias úteis.'
          : 'Cancelamento fora do prazo. Sujeito a análise de reembolso pela operação.',
      },
    });
  } catch (err) { next(err); }
});

// ── PATCH /api/bookings/:id/status — operação ─────────
router.patch('/:id/status', authenticate, requireOperator, async (req, res, next) => {
  try {
    const { status_operational, notes } = req.body;

    const validStatuses = [
      'awaiting_dispatch', 'confirmed', 'assigned',
      'en_route', 'in_progress', 'completed', 'cancelled', 'occurrence',
    ];

    if (!validStatuses.includes(status_operational)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const updates = { status_operational };
    if (status_operational === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('bookings')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Reserva não encontrada' });

    // Log de auditoria manual para observações
    if (notes) {
      await supabase.from('audit_logs').insert({
        user_id:        req.user.id,
        entity_type:    'bookings',
        entity_id:      data.id,
        action_type:    'status_change',
        new_values_json: { status_operational, notes },
      });
    }

    res.json(data);
  } catch (err) { next(err); }
});

// ── Helpers ────────────────────────────────────────────

function checkCancellationPolicy(booking) {
  const serviceAt  = dayjs(`${booking.service_date}T${booking.service_time}`);
  const now        = dayjs();
  const hoursLeft  = serviceAt.diff(now, 'hour', true);
  const minHours   = booking.service_type === 'transfer' ? 72 : 24; // 3 dias / 24h
  return { free: hoursLeft >= minHours, hoursLeft };
}

async function getServiceSnapshot(serviceType, serviceId) {
  if (serviceType === 'tour') {
    const { data } = await supabase
      .from('tours')
      .select('name, short_description')
      .eq('id', serviceId)
      .single();
    return { name: data?.name || '', description: data?.short_description || '' };
  } else {
    const { data } = await supabase
      .from('transfers')
      .select('name, short_description')
      .eq('id', serviceId)
      .single();
    return { name: data?.name || '', description: data?.short_description || '' };
  }
}

export default router;
