import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin, requireOperator } from '../middleware/auth.js';
import dayjs from 'dayjs';

const router = Router();
router.use(authenticate);

// ── GET /api/admin/stats ───────────────────────────────
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const today   = dayjs().format('YYYY-MM-DD');
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');

    const [
      { count: reservasHoje },
      { count: pendentes },
      { count: cancelamentos },
      financeiroHoje,
      financeiroMes,
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('service_date', today).neq('status_commercial', 'cancelled'),

      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('status_commercial', 'awaiting_payment'),

      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('status_commercial', 'cancelled').eq('booking_date', today),

      supabase.from('financial_ledger').select('amount')
        .eq('entry_type', 'booking_gross').eq('financial_status', 'pending')
        .gte('created_at', today),

      supabase.from('financial_ledger').select('amount')
        .eq('entry_type', 'booking_gross')
        .gte('created_at', monthStart),
    ]);

    const valorBrutoHoje = (financeiroHoje.data || [])
      .reduce((s, r) => s + Number(r.amount), 0);
    const valorBrutoMes  = (financeiroMes.data || [])
      .reduce((s, r) => s + Number(r.amount), 0);

    res.json({
      reservas_hoje:    reservasHoje || 0,
      pendencias:       pendentes || 0,
      cancelamentos:    cancelamentos || 0,
      valor_bruto_hoje: valorBrutoHoje,
      valor_liquido_hoje: valorBrutoHoje * 0.93,
      valor_bruto_mes:  valorBrutoMes,
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/users ───────────────────────────────
router.get('/users', requireAdmin, async (req, res, next) => {
  try {
    const { user_type, is_active, search, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (user_type) query = query.eq('user_type', user_type);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (search)    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/users/:id ─────────────────────────
router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['user_type', 'is_active', 'phone', 'email'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    const { data, error } = await supabase
      .from('users').update(updates).eq('id', req.params.id).select().single();

    if (error || !data) return res.status(404).json({ error: 'Usuário não encontrado' });

    await supabase.from('audit_logs').insert({
      user_id:         req.user.id,
      entity_type:     'users',
      entity_id:       req.params.id,
      action_type:     'update',
      new_values_json: updates,
    });

    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/admin/financial ───────────────────────────
router.get('/financial', requireAdmin, async (req, res, next) => {
  try {
    const { period = 'month', region_id } = req.query;

    const starts = {
      day:   dayjs().startOf('day').toISOString(),
      week:  dayjs().startOf('week').toISOString(),
      month: dayjs().startOf('month').toISOString(),
      year:  dayjs().startOf('year').toISOString(),
    };

    let query = supabase
      .from('financial_ledger')
      .select('entry_type, amount, direction, financial_status, effective_date')
      .gte('created_at', starts[period] || starts.month);

    if (region_id) query = query.eq('region_id', region_id);

    const { data, error } = await query;
    if (error) throw error;

    const bruto       = sum(data, 'booking_gross',   'inflow');
    const taxas       = sum(data, 'gateway_fee',      'outflow');
    const liquido     = sum(data, 'booking_net',      'inflow');
    const naoCredit   = sumByStatus(data, 'inflow',   'pending');
    const comissoes   = sum(data, 'commission_platform', 'outflow');
    const repassesOut = sum(data, 'payout_operator',  'outflow');

    res.json({
      bruto, taxas, liquido,
      nao_creditado: naoCredit,
      comissoes_plataforma: comissoes,
      repasses: repassesOut,
      margem_percent: bruto > 0 ? Math.round(((bruto - taxas - comissoes) / bruto) * 100) : 0,
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/operational ─────────────────────────
// Painel kanban da operação
router.get('/operational', requireOperator, async (req, res, next) => {
  try {
    const { date, service_type } = req.query;
    const targetDate = date || dayjs().format('YYYY-MM-DD');

    let query = supabase
      .from('bookings')
      .select(`
        id, booking_code, service_type, booking_mode,
        service_date, service_time, people_count, total_amount,
        status_commercial, status_operational,
        pickup_place_name, pickup_latitude, pickup_longitude,
        destination_place_name, destination_latitude, destination_longitude,
        special_notes,
        users ( full_name, phone ),
        booking_vehicles ( vehicle_name_snapshot, quantity ),
        operational_assignments ( assignment_status, assigned_driver_user_id, real_vehicle_text )
      `)
      .eq('service_date', targetDate)
      .not('status_commercial', 'in', '("draft","cancelled")')
      .order('service_time');

    if (service_type) query = query.eq('service_type', service_type);

    const { data, error } = await query;
    if (error) throw error;

    // Agrupa por status operacional
    const grouped = {};
    const statuses = ['new','awaiting_dispatch','confirmed','assigned','en_route','in_progress','completed','occurrence'];
    for (const s of statuses) grouped[s] = [];
    for (const b of data || []) {
      const key = b.status_operational || 'new';
      if (grouped[key]) grouped[key].push(b);
    }

    res.json({ date: targetDate, total: data?.length || 0, columns: grouped });
  } catch (err) { next(err); }
});

// ── POST /api/admin/operational/:id/assign ─────────────
router.post('/operational/:id/assign', requireOperator, async (req, res, next) => {
  try {
    const {
      assigned_driver_user_id,
      assigned_guide_user_id,
      real_vehicle_text,
      dispatch_notes,
    } = req.body;

    // Upsert no despacho
    const { data, error } = await supabase
      .from('operational_assignments')
      .upsert({
        booking_id:               req.params.id,
        assigned_operator_user_id: req.user.id,
        assigned_driver_user_id,
        assigned_guide_user_id,
        real_vehicle_text,
        dispatch_notes,
        assignment_status: 'assigned',
      }, { onConflict: 'booking_id' })
      .select()
      .single();

    if (error) throw error;

    // Atualiza status operacional
    await supabase
      .from('bookings')
      .update({ status_operational: 'assigned' })
      .eq('id', req.params.id);

    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/admin/audit-logs ──────────────────────────
router.get('/audit-logs', requireAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*, users(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// ── GET /api/admin/settings ────────────────────────────
router.get('/settings', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value, value_type, description')
      .order('setting_key');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── PUT /api/admin/settings/:key ───────────────────────
router.put('/settings/:key', requireAdmin, async (req, res, next) => {
  try {
    const { setting_value } = req.body;
    const { data, error } = await supabase
      .from('system_settings')
      .update({ setting_value, updated_by_user_id: req.user.id })
      .eq('setting_key', req.params.key)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: 'Configuração não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/admin/coupons ─────────────────────────────
router.get('/coupons', requireAdmin, async (req, res, next) => {
  try {
    const { is_active, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = supabase
      .from('coupons').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (search) query = query.ilike('code', `%${search}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page) });
  } catch (err) { next(err); }
});

router.post('/coupons', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('coupons').insert({ ...req.body, created_by_user_id: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/coupons/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('coupons').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Cupom não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/coupons/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('coupons').update({ is_active: false }).eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /api/admin/seasons ─────────────────────────────
router.get('/seasons', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('high_season_rules').select('*, regions(name)').order('start_month');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/seasons', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('high_season_rules').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/seasons/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('high_season_rules').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/seasons/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('high_season_rules').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /api/admin/pricing-rules ───────────────────────
router.get('/pricing-rules', requireAdmin, async (req, res, next) => {
  try {
    const { region_id, service_id } = req.query;
    let query = supabase
      .from('vehicle_pricing_rules')
      .select('id, vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, is_active, vehicles(id, name, vehicle_type), regions(id, name)')
      .eq('service_type', 'tour')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (region_id)  query = query.eq('region_id', region_id);
    if (service_id) query = query.eq('service_id', service_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/pricing-rules', requireAdmin, async (req, res, next) => {
  try {
    const { vehicle_id, service_id, region_id, pricing_mode, base_price, high_season_price } = req.body;
    const { data, error } = await supabase
      .from('vehicle_pricing_rules')
      .insert({
        vehicle_id,
        service_id: service_id || null,
        service_type: 'tour',
        region_id:  region_id || null,
        pricing_mode: pricing_mode || 'per_vehicle',
        base_price:         Number(base_price),
        high_season_price:  high_season_price ? Number(high_season_price) : null,
        is_active: true,
      })
      .select('id, vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, vehicles(id, name), regions(id, name)')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/pricing-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    const { base_price, high_season_price, pricing_mode, is_active } = req.body;
    const updates = {};
    if (base_price        !== undefined) updates.base_price        = Number(base_price);
    if (high_season_price !== undefined) updates.high_season_price = high_season_price ? Number(high_season_price) : null;
    if (pricing_mode      !== undefined) updates.pricing_mode      = pricing_mode;
    if (is_active         !== undefined) updates.is_active         = is_active;
    const { data, error } = await supabase
      .from('vehicle_pricing_rules').update(updates).eq('id', req.params.id)
      .select('id, vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, vehicles(id, name), regions(id, name)')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/pricing-rules/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('vehicle_pricing_rules').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /api/admin/financial-daily ─────────────────────
// Série temporal para o gráfico de faturamento
router.get('/financial-daily', requireAdmin, async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const since = dayjs().subtract(Number(days), 'day').format('YYYY-MM-DD');

    const { data, error } = await supabase
      .from('financial_ledger')
      .select('amount, effective_date')
      .eq('entry_type', 'booking_gross')
      .eq('direction', 'inflow')
      .gte('effective_date', since)
      .order('effective_date');

    if (error) throw error;

    // Agrupa por dia
    const byDay = {};
    for (const row of data || []) {
      const d = row.effective_date?.slice(0, 10) || '';
      byDay[d] = (byDay[d] || 0) + Number(row.amount);
    }

    const series = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }));

    res.json(series);
  } catch (err) { next(err); }
});

// ── Helpers ────────────────────────────────────────────
function sum(rows, entryType, direction) {
  return rows
    .filter(r => r.entry_type === entryType && r.direction === direction)
    .reduce((s, r) => s + Number(r.amount), 0);
}
function sumByStatus(rows, direction, status) {
  return rows
    .filter(r => r.direction === direction && r.financial_status === status)
    .reduce((s, r) => s + Number(r.amount), 0);
}

export default router;
