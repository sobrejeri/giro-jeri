/**
 * /api/operator — Perfil e preferências de serviço do operador/cooperativa
 * GET   /api/operator/profile               — dados pessoais + conta de recebimento
 * PATCH /api/operator/profile               — atualiza dados pessoais + conta
 * GET   /api/operator/preferences           — lista preferências de serviço
 * PUT   /api/operator/preferences/:type/:id — ativa ou desativa um serviço
 */
import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';

// Rótulo amigável do serviço para o texto da notificação
const serviceLabel = (t) => (t === 'transfer' ? 'translado' : 'passeio');

const PROFILE_FIELDS = `
  id, full_name, email, phone, document_type, document_number, birth_date,
  profile_photo_url, address, cep,
  pix_key_type, pix_key,
  bank_name, bank_agency, bank_account_number, bank_account_type, bank_document
`.trim();

const profileSchema = z.object({
  full_name:           z.string().min(2).max(200).optional(),
  phone:               z.string().min(10).max(30).optional().nullable(),
  document_type:       z.enum(['cpf', 'cnpj', 'passport', 'rg', 'cnh', 'other']).optional().nullable(),
  document_number:     z.string().max(30).optional().nullable(),
  birth_date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  address:             z.string().max(300).optional().nullable(),
  cep:                 z.string().max(9).optional().nullable(),
  pix_key_type:        z.enum(['cpf', 'cnpj', 'email', 'phone', 'random_key']).optional().nullable(),
  pix_key:             z.string().max(200).optional().nullable(),
  bank_name:           z.string().max(100).optional().nullable(),
  bank_agency:         z.string().max(20).optional().nullable(),
  bank_account_number: z.string().max(30).optional().nullable(),
  bank_account_type:   z.enum(['corrente', 'poupanca']).optional().nullable(),
  bank_document:       z.string().max(30).optional().nullable(),
});

const router = Router();
router.use(authenticate, requireOperator);

// GET /api/operator/profile
router.get('/profile', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(PROFILE_FIELDS)
      .eq('id', req.user.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// PATCH /api/operator/profile
router.patch('/profile', async (req, res, next) => {
  try {
    const body = profileSchema.parse(req.body);
    const { data, error } = await supabase
      .from('users')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', req.user.id)
      .select(PROFILE_FIELDS)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// GET /api/operator/preferences
router.get('/preferences', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('operator_service_preferences')
      .select('entity_type, entity_id, is_active, notes')
      .eq('operator_id', req.user.id);
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// PUT /api/operator/preferences/:type/:id
// body: { is_active: boolean, notes?: string }
router.put('/preferences/:type/:entityId', async (req, res, next) => {
  try {
    const { type, entityId } = req.params;
    const { is_active, notes } = req.body;

    if (!['tour', 'vehicle', 'transfer'].includes(type)) {
      return res.status(400).json({ error: 'entity_type inválido' });
    }

    const { data, error } = await supabase
      .from('operator_service_preferences')
      .upsert(
        {
          operator_id: req.user.id,
          entity_type: type,
          entity_id:   entityId,
          is_active:   is_active !== undefined ? is_active : true,
          notes:       notes || null,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: 'operator_id,entity_type,entity_id' },
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/operator/bookings ─────────────────────────
// Retorna corridas disponíveis (sem operador) + corridas do operador logado
router.get('/bookings', async (req, res, next) => {
  try {
    const SELECT = `
      id, booking_code, service_type, service_id, booking_mode,
      service_date, service_time, people_count, total_amount, created_at,
      origin_text, destination_text, status_commercial, status_operational,
      users!bookings_user_id_fkey ( full_name, phone )
    `

    // Corridas disponíveis (sem cooperativa atribuída). Duas consultas simples e
    // explícitas em vez de um filtro .or/and aninhado (que é frágil e já deixou
    // de retornar solicitações):
    //  • awaiting_acceptance — fluxo novo: solicitadas, aguardando aceite;
    //  • paid + awaiting_dispatch — fluxo antigo / cotações já pagas.
    const [reqRes, dispRes] = await Promise.all([
      supabase.from('bookings').select(SELECT)
        .is('operator_id', null)
        .eq('status_commercial', 'awaiting_acceptance'),
      supabase.from('bookings').select(SELECT)
        .is('operator_id', null)
        .eq('status_commercial', 'paid')
        .eq('status_operational', 'awaiting_dispatch'),
    ])
    if (reqRes.error)  throw reqRes.error
    if (dispRes.error) throw dispRes.error

    const pending = [...(reqRes.data || []), ...(dispRes.data || [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    // Minhas corridas: aceitas ou em andamento
    const { data: mine, error: e2 } = await supabase
      .from('bookings').select(SELECT)
      .eq('operator_id', req.user.id)
      .in('status_operational', ['assigned', 'in_progress'])
      .order('service_date', { ascending: true })

    if (e2) throw e2

    console.log('[operator/bookings] op=%s pending=%d (aceite=%d despacho=%d) mine=%d',
      req.user.id, pending.length, reqRes.data?.length || 0, dispRes.data?.length || 0, mine?.length || 0)

    res.json({ pending, mine: mine || [] })
  } catch (err) { next(err) }
})

// ── POST /api/operator/bookings/:id/accept ─────────────
// Aceite atômico: a primeira cooperativa a aceitar pega a solicitação (ANTES do
// pagamento). A reserva passa para 'awaiting_payment' e o cliente é avisado para
// pagar. O split automático será possível porque a cooperativa já está definida.
router.post('/bookings/:id/accept', async (req, res, next) => {
  try {
    const SELECT = 'id, booking_code, user_id, service_type, users!bookings_user_id_fkey ( full_name, phone )'

    // Tentativa 1 — fluxo novo: solicitação aguardando aceite → vai para pagamento.
    let { data, error } = await supabase
      .from('bookings')
      .update({
        operator_id:        req.user.id,
        status_commercial:  'awaiting_payment',
        status_operational: 'assigned',
      })
      .eq('id', req.params.id)
      .is('operator_id', null)
      .eq('status_commercial', 'awaiting_acceptance')
      .select(SELECT)
    if (error) throw error

    // Tentativa 2 — fluxo antigo / cotação já paga: aguardando despacho → só atribui.
    let alreadyPaid = false
    if (!data || data.length === 0) {
      const r2 = await supabase
        .from('bookings')
        .update({
          operator_id:        req.user.id,
          status_operational: 'assigned',
        })
        .eq('id', req.params.id)
        .is('operator_id', null)
        .eq('status_commercial', 'paid')
        .eq('status_operational', 'awaiting_dispatch')
        .select(SELECT)
      if (r2.error) throw r2.error
      data = r2.data
      alreadyPaid = true
    }

    // Array vazio = outra cooperativa aceitou primeiro (condição de corrida)
    if (!data || data.length === 0) {
      return res.status(409).json({ error: 'Reserva já foi aceita por outra cooperativa' })
    }

    const b = data[0]
    notifyUser({
      userId:      b.user_id,
      bookingId:   b.id,
      templateKey: 'booking_accepted',
      title:       alreadyPaid ? 'Reserva confirmada 🎉' : 'Cooperativa aceitou! 🎉',
      body:        alreadyPaid
        ? `Uma cooperativa aceitou seu ${serviceLabel(b.service_type)} (${b.booking_code}). Tudo certo para a data marcada!`
        : `Uma cooperativa aceitou seu ${serviceLabel(b.service_type)} (${b.booking_code}). Pague para confirmar a reserva.`,
    })

    res.json({ ok: true, booking: b })
  } catch (err) { next(err) }
})

// ── POST /api/operator/bookings/:id/start ──────────────
router.post('/bookings/:id/start', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status_operational: 'in_progress' })
      .eq('id', req.params.id)
      .eq('operator_id', req.user.id)
      .eq('status_commercial', 'paid')
      .select('id, user_id, service_type, booking_code')

    if (error) throw error
    if (!data || data.length === 0) {
      return res.status(409).json({ error: 'Aguardando o pagamento do cliente para iniciar a corrida.' })
    }
    const b = data?.[0]
    if (b) notifyUser({
      userId:      b.user_id,
      bookingId:   b.id,
      templateKey: 'booking_in_progress',
      title:       'Seu serviço começou 🚀',
      body:        `Seu ${serviceLabel(b.service_type)} (${b.booking_code}) está em andamento. Bom passeio!`,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── POST /api/operator/bookings/:id/confirm ───────────
// Operador confirma com o cliente → booking vai para a fila de despacho.
// Só é permitido após o pagamento do cliente.
router.post('/bookings/:id/confirm', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status_operational: 'awaiting_dispatch' })
      .eq('id', req.params.id)
      .eq('operator_id', req.user.id)
      .eq('status_commercial', 'paid')
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) {
      return res.status(409).json({ error: 'Aguardando o pagamento do cliente para confirmar.' })
    }
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── POST /api/operator/bookings/:id/complete ──────────
router.post('/bookings/:id/complete', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status_operational: 'completed',
        completed_at:       new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('operator_id', req.user.id)
      .eq('status_commercial', 'paid')
      .select('id, user_id, service_type, booking_code')

    if (error) throw error
    if (!data || data.length === 0) {
      return res.status(409).json({ error: 'Esta corrida ainda não foi paga pelo cliente.' })
    }
    const b = data?.[0]
    if (b) notifyUser({
      userId:      b.user_id,
      bookingId:   b.id,
      templateKey: 'booking_completed',
      title:       'Serviço finalizado ✅',
      body:        `Seu ${serviceLabel(b.service_type)} (${b.booking_code}) foi concluído. Conte como foi: avalie sua experiência!`,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router;
