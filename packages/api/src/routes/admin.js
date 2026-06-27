import { Router } from 'express';
import { z }      from 'zod';
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

// ── POST /api/admin/users ──────────────────────────────
const createUserSchema = z.object({
  full_name: z.string().min(2).max(200),
  email:     z.string().email().optional(),
  phone:     z.string().min(10).max(30).optional(),
  cnpj:      z.string().min(14).max(18).optional(),
  password:  z.string().min(6),
  user_type: z.enum(['tourist', 'operator', 'agency', 'admin', 'finance', 'affiliate']),
}).refine((d) => {
  if (d.user_type === 'operator') return !!d.cnpj;
  return d.email || d.phone;
}, { message: 'Operador requer CNPJ; outros perfis requerem email ou telefone' });

router.post('/users', requireAdmin, async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);

    // Operadores autenticam via CNPJ → e-mail sintético interno
    let authEmail = body.email;
    let authPhone = body.phone;
    let docNumber = null;
    let docType   = null;

    if (body.user_type === 'operator' && body.cnpj) {
      const cnpjDigits = body.cnpj.replace(/\D/g, '');
      authEmail = `${cnpjDigits}@op.girojeri.app`;
      authPhone = undefined;
      docNumber = cnpjDigits;
      docType   = 'cnpj';
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email:         authEmail,
      phone:         authPhone,
      password:      body.password,
      email_confirm: true,
    });
    if (authError) return res.status(400).json({ error: authError.message });

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        auth_id:         authData.user.id,
        full_name:       body.full_name,
        email:           authEmail,
        phone:           authPhone,
        user_type:       body.user_type,
        document_number: docNumber,
        document_type:   docType,
      })
      .select('id, full_name, email, phone, user_type, is_active, created_at, document_number')
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ error: profileError.message });
    }

    await supabase.from('audit_logs').insert({
      user_id:         req.user.id,
      entity_type:     'users',
      entity_id:       profile.id,
      action_type:     'create',
      new_values_json: { user_type: body.user_type, email: body.email },
    });

    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/admin/users/:id/reset-password ───────────
const resetPasswordSchema = z.object({
  new_password: z.string().min(6).max(72),
});

router.post('/users/:id/reset-password', requireAdmin, async (req, res, next) => {
  try {
    const { new_password } = resetPasswordSchema.parse(req.body);

    const { data: target } = await supabase
      .from('users').select('auth_id, full_name').eq('id', req.params.id).single();
    if (!target?.auth_id) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { error } = await supabase.auth.admin.updateUserById(target.auth_id, {
      password: new_password,
    });
    if (error) return res.status(400).json({ error: error.message });

    await supabase.from('audit_logs').insert({
      user_id:     req.user.id,
      entity_type: 'users',
      entity_id:   req.params.id,
      action_type: 'reset_password',
    });

    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Senha inválida (mínimo 6 caracteres)' });
    }
    next(err);
  }
});

// ── PATCH /api/admin/users/:id ─────────────────────────
router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['user_type', 'is_active', 'phone', 'email', 'platform_split_pct'];
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

// ── POST /api/admin/users/:id/register-recipient ──────
router.post('/users/:id/register-recipient', requireAdmin, async (req, res, next) => {
  try {
    const { data: user, error: uErr } = await supabase
      .from('users')
      .select(`id, full_name, email, phone, user_type, document_type, document_number,
               pix_key_type, pix_key, bank_name, bank_agency,
               bank_account_number, bank_account_type, bank_document`)
      .eq('id', req.params.id)
      .single();

    if (uErr || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.user_type !== 'operator') {
      return res.status(400).json({ error: 'Apenas cooperativas podem ser registradas como recebedoras' });
    }

    // Lê gateway ativo das configurações
    const { data: settingsRows = [] } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .like('setting_key', 'payment_%');
    const cfg     = Object.fromEntries(settingsRows.map((s) => [s.setting_key, s.setting_value]));
    const gateway = cfg.payment_gateway || 'manual';
    const apiKey  = cfg.payment_gateway_api_key || '';
    const env     = cfg.payment_gateway_env || 'sandbox';

    let recipientId;

    if (gateway === 'manual') {
      const { createRecipient } = await import('../payments/manual.js');
      recipientId = await createRecipient(user);
    } else if (gateway === 'asaas') {
      const { createRecipient } = await import('../payments/asaas.js');
      recipientId = await createRecipient(user, apiKey, env);
    } else if (gateway === 'pagarme') {
      const { createRecipient } = await import('../payments/pagarme.js');
      recipientId = await createRecipient(user, apiKey, env);
    } else {
      return res.status(400).json({ error: `Gateway '${gateway}' não suportado` });
    }

    await supabase.from('users')
      .update({ gateway_recipient_id: recipientId, updated_at: new Date().toISOString() })
      .eq('id', user.id);

    await supabase.from('audit_logs').insert({
      user_id:         req.user.id,
      entity_type:     'users',
      entity_id:       user.id,
      action_type:     'register_recipient',
      new_values_json: { gateway, recipient_id: recipientId },
    });

    res.json({ recipient_id: recipientId, gateway });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
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
    const { date, service_type, operator_id } = req.query;
    const showAll    = !date || date === 'all';
    const targetDate = showAll ? null : date;

    let query = supabase
      .from('bookings')
      .select(`
        id, booking_code, service_type, service_id, booking_mode, user_id, operator_id,
        service_date, service_time, people_count, total_amount,
        status_commercial, status_operational,
        pickup_place_name, destination_place_name, special_notes,
        origin_text, destination_text,
        booking_vehicles ( vehicle_name_snapshot, quantity ),
        operational_assignments ( real_vehicle_text, dispatch_notes, driver_name, driver_phone, assigned_driver_user_id, assigned_guide_user_id )
      `)
      .neq('status_commercial', 'draft')
      .neq('status_commercial', 'cancelled')
      .order('service_date', { ascending: true });

    if (targetDate)    query = query.eq('service_date', targetDate);
    if (service_type)  query = query.eq('service_type', service_type);
    if (operator_id)   query = query.eq('operator_id', operator_id);

    const { data, error } = await query;
    if (error) throw error;

    // Sem embed por FK (frágil) — busca clientes e operadores à parte e junta em memória.
    const userIds = [...new Set((data || []).flatMap((b) => [b.user_id, b.operator_id]).filter(Boolean))];
    let byId = new Map();
    if (userIds.length > 0) {
      const { data: users, error: uErr } = await supabase
        .from('users').select('id, full_name, phone').in('id', userIds);
      if (uErr) throw uErr;
      byId = new Map((users || []).map((u) => [u.id, u]));
    }
    const enriched = (data || []).map((b) => ({
      ...b,
      users:    byId.get(b.user_id) || null,
      operator: b.operator_id ? (byId.get(b.operator_id) || null) : null,
    }));

    // Agrupa por status operacional
    const grouped = {};
    const statuses = ['new','awaiting_dispatch','confirmed','assigned','en_route','in_progress','completed','occurrence'];
    for (const s of statuses) grouped[s] = [];
    for (const b of enriched) {
      const key = b.status_operational || 'new';
      if (grouped[key]) grouped[key].push(b);
    }

    res.json({ date: targetDate || 'all', total: data?.length || 0, columns: grouped });
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
      driver_name,
      driver_phone,
    } = req.body;

    const bookingId = req.params.id;
    const payload   = {
      booking_id:                bookingId,
      assigned_operator_user_id: req.user.id,
      assigned_driver_user_id:   assigned_driver_user_id || null,
      assigned_guide_user_id:    assigned_guide_user_id   || null,
      real_vehicle_text:         real_vehicle_text        || null,
      dispatch_notes:            dispatch_notes           || null,
      driver_name:               driver_name              || null,
      driver_phone:              driver_phone             || null,
      assignment_status:         'assigned',
      updated_at:                new Date().toISOString(),
    };

    // Verifica se já existe um assignment para essa reserva
    const { data: existing } = await supabase
      .from('operational_assignments')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('operational_assignments')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('operational_assignments')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    // Atualiza status operacional da reserva
    await supabase
      .from('bookings')
      .update({ status_operational: 'assigned' })
      .eq('id', bookingId);

    res.json(result);
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
// Upsert: atualiza se existir, cria se a chave ainda não estiver no banco
// (necessário para chaves novas como home_banner_image_url sem depender de seed).
router.put('/settings/:key', requireAdmin, async (req, res, next) => {
  try {
    const { setting_value, value_type, description } = req.body;
    const row = {
      setting_key:        req.params.key,
      setting_value,
      updated_by_user_id: req.user.id,
    };
    if (value_type)  row.value_type  = value_type;
    if (description)  row.description = description;

    const { data, error } = await supabase
      .from('system_settings')
      .upsert(row, { onConflict: 'setting_key' })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (err) { next(err); }
});

// ── POST /api/admin/site-image ─────────────────────────
// Faz upload de uma imagem do site (ex: banner da home) e devolve a URL pública.
// Reaproveita o bucket público "avatars" sob o prefixo "site/".
router.post('/site-image', requireAdmin, async (req, res, next) => {
  try {
    const { photo_data, name } = req.body;
    if (!photo_data || typeof photo_data !== 'string') {
      return res.status(400).json({ error: 'Dados de imagem ausentes' });
    }

    const match = photo_data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Formato inválido. Use JPEG, PNG ou WebP.' });
    }

    const [, mimeType, b64] = match;
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.byteLength > 2 * 1024 * 1024) {
      return res.status(413).json({ error: 'Imagem muito grande. Máximo 2 MB.' });
    }

    const ext  = mimeType.split('/')[1];
    const slug = String(name || 'asset')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset';
    const path = `site/${slug}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    await supabase.from('audit_logs').insert({
      user_id:         req.user.id,
      entity_type:     'system_settings',
      action_type:     'upload_site_image',
      new_values_json: { path },
    });

    res.json({ url: publicUrl });
  } catch (err) { next(err); }
});

// ── POST /api/admin/storage-sign ───────────────────────
// Gera uma URL assinada para upload direto do browser ao Supabase Storage.
// Usado para vídeos (Stories) e imagens (catálogo) grandes, evitando rotear
// os arquivos pelo servidor. Aceita `filename` (Stories) ou `path` (catálogo).
router.post('/storage-sign', requireAdmin, async (req, res, next) => {
  try {
    const { filename, path: clientPath, content_type } = req.body;
    const ref = filename || clientPath;
    if (!ref || !content_type) {
      return res.status(400).json({ error: 'filename (ou path) e content_type são obrigatórios' });
    }

    // Strip codec suffix (e.g. "video/webm;codecs=vp9" → "video/webm")
    const base_type = content_type.split(';')[0].trim().toLowerCase();
    if (!base_type.startsWith('video/') && !base_type.startsWith('image/')) {
      return res.status(400).json({ error: 'Tipo de arquivo não suportado' });
    }

    const ext    = ref.split('.').pop().toLowerCase().slice(0, 5) || 'bin';
    const slug   = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const folder = base_type.startsWith('video/') ? 'site/videos' : 'site/images';
    const path   = `${folder}/${slug}.${ext}`;

    const { data, error } = await supabase.storage
      .from('avatars')
      .createSignedUploadUrl(path, { upsert: true });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    res.json({ signed_url: data.signedUrl, path, public_url: publicUrl });
  } catch (err) { next(err); }
});

// ── GET /api/admin/coupons ─────────────────────────────
router.get('/coupons', requireAdmin, async (req, res, next) => {
  try {
    const { is_active, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let query = supabase
      .from('coupons')
      .select('*, coupon_redemptions(count)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (search) query = query.ilike('code', `%${search}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    const enriched = (data || []).map((c) => ({
      ...c,
      times_used: c.coupon_redemptions?.[0]?.count ?? 0,
    }));
    res.json({ data: enriched, total: count, page: Number(page) });
  } catch (err) { next(err); }
});

router.post('/coupons', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('coupons').insert(req.body).select().single();
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
      .from('high_season_rules').select('*, regions(name)').order('start_date');
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

// ── Feriados / datas especiais (dias específicos) ──────
router.get('/holidays', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('holidays').select('*, regions(name)').order('holiday_date');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/holidays', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('holidays').insert(req.body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/holidays/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('holidays').update(req.body).eq('id', req.params.id).select().single();
    if (error || !data) return res.status(404).json({ error: 'Feriado não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

router.delete('/holidays/:id', requireAdmin, async (req, res, next) => {
  try {
    const { error } = await supabase.from('holidays').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── GET /api/admin/operator-performance ────────────────
// Compara o desempenho de TODAS as cooperativas: receita gerada, nº de
// passeios e transfers aceitos, total e concluídas. Filtro opcional por data.
router.get('/operator-performance', requireAdmin, async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;

    let query = supabase
      .from('bookings')
      .select(`
        operator_id, service_type, total_amount,
        status_commercial, status_operational,
        operator:users!bookings_operator_id_fkey ( id, full_name )
      `)
      .not('operator_id', 'is', null)
      .neq('status_commercial', 'cancelled')
      .limit(10000);

    if (date_from) query = query.gte('service_date', date_from);
    if (date_to)   query = query.lte('service_date', date_to);

    const { data, error } = await query;
    if (error) throw error;

    const map = new Map();
    for (const b of data || []) {
      const id = b.operator_id;
      if (!map.has(id)) {
        map.set(id, {
          operator_id: id,
          name:        b.operator?.full_name || '—',
          revenue:     0, tours: 0, transfers: 0, total: 0, completed: 0,
        });
      }
      const row    = map.get(id);
      const amount = Number(b.total_amount) || 0;
      row.total += 1;
      if (b.service_type === 'transfer') row.transfers += 1; else row.tours += 1;
      if (b.status_commercial === 'paid') row.revenue += amount;
      if (b.status_operational === 'completed') row.completed += 1;
    }

    // Repasse líquido = bruto − comissão da plataforma (7%), mesma convenção
    // do resto do admin (líquido = bruto × 0,93).
    const PLATFORM_COMMISSION = 0.07;

    const operators = [...map.values()]
      .map((r) => ({
        ...r,
        revenue:    Math.round(r.revenue * 100) / 100,
        net:        Math.round(r.revenue * (1 - PLATFORM_COMMISSION) * 100) / 100,
        ticket_avg: r.total ? Math.round((r.revenue / r.total) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totals = operators.reduce(
      (t, o) => ({
        revenue:   Math.round((t.revenue + o.revenue) * 100) / 100,
        net:       Math.round((t.net + o.net) * 100) / 100,
        tours:     t.tours + o.tours,
        transfers: t.transfers + o.transfers,
        total:     t.total + o.total,
      }),
      { revenue: 0, net: 0, tours: 0, transfers: 0, total: 0 },
    );

    res.json({ operators, totals });
  } catch (err) { next(err); }
});

// ── GET /api/admin/pricing-rules ───────────────────────
router.get('/pricing-rules', requireAdmin, async (req, res, next) => {
  try {
    const { region_id, service_id } = req.query;
    let query = supabase
      .from('vehicle_pricing_rules')
      .select('id, vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, is_active, vehicles(id, name, vehicle_type)')
      .eq('service_type', 'tour')
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
    const { vehicle_id, service_id, region_id, pricing_mode, base_price } = req.body;
    const { data, error } = await supabase
      .from('vehicle_pricing_rules')
      .insert({
        vehicle_id,
        service_id:   service_id || null,
        service_type: 'tour',
        region_id:    region_id || null,
        pricing_mode: pricing_mode || 'per_vehicle',
        base_price:   Number(base_price),
        is_active:    true,
      })
      .select('id, vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, is_active')
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
    if (high_season_price !== undefined) updates.high_season_price = high_season_price != null ? Number(high_season_price) : null;
    if (pricing_mode      !== undefined) updates.pricing_mode      = pricing_mode;
    if (is_active         !== undefined) updates.is_active         = is_active;
    const { data, error } = await supabase
      .from('vehicle_pricing_rules').update(updates).eq('id', req.params.id)
      .select('id, vehicle_id, region_id, service_type, service_id, pricing_mode, base_price, high_season_price, is_active')
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

// ── POST /api/admin/bookings/manual ───────────────────
// Cria reserva manual (walk-in, telefone, WhatsApp)
// ── GET /api/admin/bookings ────────────────────────────
router.get('/bookings', requireAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 30, search, status, service_type, date_from, date_to } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabase
      .from('bookings')
      .select(`
        id, booking_code, service_type, booking_mode, service_date, service_time,
        people_count, total_amount, status_commercial, status_operational, created_at,
        user_id, operator_id, region_id
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (status)       query = query.eq('status_commercial', status);
    if (service_type) query = query.eq('service_type', service_type);
    if (date_from)    query = query.gte('service_date', date_from);
    if (date_to)      query = query.lte('service_date', date_to);
    if (search)       query = query.ilike('booking_code', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    // Sem embed por FK (frágil) — busca clientes à parte e junta em memória.
    const userIds = [...new Set((data || []).map((b) => b.user_id).filter(Boolean))];
    let byId = new Map();
    if (userIds.length > 0) {
      const { data: users, error: uErr } = await supabase
        .from('users').select('id, full_name, phone, email').in('id', userIds);
      if (uErr) throw uErr;
      byId = new Map((users || []).map((u) => [u.id, u]));
    }
    const enriched = (data || []).map((b) => ({ ...b, users: byId.get(b.user_id) || null }));

    res.json({ data: enriched, total: count || 0, page: Number(page) });
  } catch (err) { next(err); }
});

router.post('/bookings/manual', requireAdmin, async (req, res, next) => {
  try {
    const {
      customer_name, customer_phone, customer_email,
      service_type = 'tour', service_id, service_name,
      booking_mode = 'private',
      service_date, service_time,
      people_count = 1,
      total_amount,
      payment_method = 'cash',
      payment_status = 'pending',
      notes,
      region_id,
    } = req.body;

    if (!service_date || !total_amount) {
      return res.status(400).json({ error: 'service_date e total_amount são obrigatórios' });
    }

    // Busca ou cria um usuário "avulso" para o cliente
    let userId = null;
    if (customer_phone || customer_email) {
      const query = customer_email
        ? supabase.from('users').select('id').eq('email', customer_email).maybeSingle()
        : supabase.from('users').select('id').eq('phone', customer_phone).maybeSingle();
      const { data: existing } = await query;
      if (existing) {
        userId = existing.id;
      } else {
        const { data: newUser } = await supabase.from('users').insert({
          full_name:  customer_name || 'Cliente Avulso',
          email:      customer_email || null,
          phone:      customer_phone || null,
          user_type:  'tourist',
          auth_id:    null,
        }).select('id').single();
        userId = newUser?.id;
      }
    }

    const bookingCode = `GJM${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const isPaid      = payment_status === 'paid';

    const { data: booking, error: bErr } = await supabase.from('bookings').insert({
      booking_code:        bookingCode,
      user_id:             userId,
      region_id:           region_id || null,
      service_type,
      service_id:          service_id || null,
      booking_mode,
      service_date,
      service_time:        service_time || null,
      people_count:        Number(people_count),
      total_amount:        Number(total_amount),
      status_commercial:   isPaid ? 'paid' : 'awaiting_payment',
      status_operational:  isPaid ? 'awaiting_dispatch' : 'new',
      payment_status:      isPaid ? 'approved' : 'pending',
      notes:               notes || `Reserva manual — ${customer_name || 'sem nome'}`,
    }).select().single();

    if (bErr) throw bErr;

    // Cria registro de pagamento
    const { data: payment } = await supabase.from('payments').insert({
      booking_id:         booking.id,
      gateway_name:       'manual',
      payment_method,
      payment_type:       'full',
      amount_gross:       Number(total_amount),
      gateway_fee_amount: 0,
      currency:           'BRL',
      status:             isPaid ? 'approved' : 'pending',
      paid_at:            isPaid ? new Date().toISOString() : null,
    }).select().single();

    // Lança no ledger se pago
    if (isPaid && payment) {
      await supabase.from('financial_ledger').insert([
        { booking_id: booking.id, payment_id: payment.id, entry_type: 'booking_gross', description: `Receita bruta — ${bookingCode}`, amount: Number(total_amount), direction: 'inflow', financial_status: 'received' },
        { booking_id: booking.id, payment_id: payment.id, entry_type: 'booking_net',   description: `Receita líquida — ${bookingCode}`, amount: Number(total_amount), direction: 'inflow', financial_status: 'received' },
      ]);
    }

    res.status(201).json({ booking_id: booking.id, booking_code: bookingCode });
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
