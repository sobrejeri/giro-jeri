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

// Body de accept: quoted_price/quote_notes só são usados (e quoted_price só é
// obrigatório) quando o booking é is_manual_quote=true.
const acceptSchema = z.object({
  quoted_price: z.number({ coerce: true }).positive().optional(),
  quote_notes:  z.string().max(1000).optional().nullable(),
});

// Expiração lazy: bookings de translado personalizado cuja janela única
// (quote_expires_at, contada da solicitação original) já passou sem
// pagamento aprovado. Espelha expire_pending_bookings() (migration 038),
// mas dispara também a notificação ao cliente, igual ao que o fluxo antigo
// de transfer_quotes fazia ao detectar expiração na leitura.
async function expireIfNeeded(booking) {
  if (!booking?.is_manual_quote) return booking;
  if (!booking.quote_expires_at) return booking;
  if (!['awaiting_acceptance', 'awaiting_payment'].includes(booking.status_commercial)) return booking;
  if (new Date(booking.quote_expires_at) >= new Date()) return booking;

  await supabase.from('bookings')
    .update({ status_commercial: 'expired' })
    .eq('id', booking.id)
    .in('status_commercial', ['awaiting_acceptance', 'awaiting_payment']);

  notifyUser({
    userId:      booking.user_id,
    bookingId:   booking.id,
    templateKey: 'quote_expired',
    title:       'Solicitação expirada',
    body:        `Sua solicitação de translado (${booking.booking_code}) expirou sem pagamento dentro do prazo. Solicite novamente.`,
  });

  return { ...booking, status_commercial: 'expired' };
}

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
      pickup_place_name, destination_place_name,
      luggage_count, special_notes, quote_notes,
      is_manual_quote, quote_expires_at, user_id,
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

    // Expiração lazy: remove da lista de disponíveis qualquer solicitação de
    // translado personalizado cuja janela já passou (e marca expired no banco).
    const reqChecked = await Promise.all((reqRes.data || []).map(expireIfNeeded))
    const pending = [...reqChecked, ...(dispRes.data || [])]
      .filter((b) => b.status_commercial !== 'expired')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    // Minhas corridas: aceitas ou em andamento
    const { data: mine, error: e2 } = await supabase
      .from('bookings').select(SELECT)
      .eq('operator_id', req.user.id)
      .in('status_operational', ['assigned', 'in_progress'])
      .order('service_date', { ascending: true })

    if (e2) throw e2

    // Idem para "minhas corridas": uma solicitação que eu mesmo precifiquei
    // pode ter expirado por falta de pagamento do cliente.
    const mineChecked = await Promise.all((mine || []).map(expireIfNeeded))

    console.log('[operator/bookings] op=%s pending=%d (aceite=%d despacho=%d) mine=%d',
      req.user.id, pending.length, reqRes.data?.length || 0, dispRes.data?.length || 0, mineChecked.length)

    res.json({ pending, mine: mineChecked })
  } catch (err) { next(err) }
})

// ── POST /api/operator/bookings/:id/accept ─────────────
// Aceite atômico: a primeira cooperativa a aceitar pega a solicitação (ANTES do
// pagamento). A reserva passa para 'awaiting_payment' e o cliente é avisado para
// pagar. O split automático será possível porque a cooperativa já está definida.
//
// Translado personalizado (is_manual_quote=true): aceitar e precificar é o
// MESMO ato — body. quoted_price é OBRIGATÓRIO nesse caso e o UPDATE atômico
// já grava total_amount, quoted_by_user_id, quoted_at, quote_notes.
//
// Re-precificação: enquanto status_commercial='awaiting_payment' e o
// pagamento ainda não foi aprovado, a MESMA cooperativa (operator_id já
// atribuído) pode chamar este endpoint de novo para corrigir quoted_price
// antes do cliente pagar — quote_expires_at NÃO é recalculado (mantém o
// prazo da solicitação original).
router.post('/bookings/:id/accept', async (req, res, next) => {
  try {
    const parsedBody = acceptSchema.safeParse(req.body || {})
    if (!parsedBody.success) {
      return res.status(400).json({ error: parsedBody.error.errors[0]?.message || 'Dados inválidos' })
    }
    const { quoted_price, quote_notes } = parsedBody.data

    const SELECT = `
      id, booking_code, user_id, operator_id, service_type,
      status_commercial, status_operational, is_manual_quote, quote_expires_at,
      users!bookings_user_id_fkey ( full_name, phone )
    `

    // Carrega o booking para decidir o caminho (manual quote / expiração /
    // re-precificação) antes de qualquer UPDATE.
    const { data: current, error: findErr } = await supabase
      .from('bookings')
      .select(SELECT)
      .eq('id', req.params.id)
      .maybeSingle()
    if (findErr) throw findErr
    if (!current) return res.status(404).json({ error: 'Reserva não encontrada' })

    // Checagem lazy de expiração — antes de aceitar/precificar.
    if (
      current.is_manual_quote &&
      current.quote_expires_at &&
      new Date(current.quote_expires_at) < new Date() &&
      ['awaiting_acceptance', 'awaiting_payment'].includes(current.status_commercial)
    ) {
      await supabase.from('bookings')
        .update({ status_commercial: 'expired' })
        .eq('id', current.id)
        .in('status_commercial', ['awaiting_acceptance', 'awaiting_payment'])
      notifyUser({
        userId:      current.user_id,
        bookingId:   current.id,
        templateKey: 'quote_expired',
        title:       'Solicitação expirada',
        body:        `Sua solicitação de translado (${current.booking_code}) expirou sem pagamento dentro do prazo. Solicite novamente.`,
      })
      return res.status(409).json({ error: 'Solicitação expirou' })
    }

    // Translado personalizado: quoted_price é obrigatório (aceite + preço no
    // mesmo ato). Validamos aqui para devolver 400 claro em vez de deixar o
    // UPDATE atômico falhar silenciosamente sem afetar linha alguma.
    if (current.is_manual_quote && current.status_commercial === 'awaiting_acceptance' && !(quoted_price > 0)) {
      return res.status(400).json({ error: 'Informe um preço válido (quoted_price) para aceitar esta solicitação' })
    }

    // ── Re-precificação: mesma cooperativa, ainda awaiting_payment, sem pagamento aprovado ──
    if (
      current.is_manual_quote &&
      current.status_commercial === 'awaiting_payment' &&
      current.operator_id === req.user.id
    ) {
      if (!(quoted_price > 0)) {
        return res.status(400).json({ error: 'Informe um preço válido (quoted_price) para corrigir a cotação' })
      }
      const { data: payment } = await supabase
        .from('payments').select('status').eq('booking_id', current.id).maybeSingle()
      if (payment?.status === 'approved') {
        return res.status(409).json({ error: 'Pagamento já aprovado — não é mais possível alterar o preço' })
      }

      const { data: updated, error: updErr } = await supabase
        .from('bookings')
        .update({
          total_amount:      quoted_price,
          quoted_by_user_id: req.user.id,
          quoted_at:         new Date().toISOString(),
          ...(quote_notes !== undefined ? { quote_notes } : {}),
          // quote_expires_at NÃO é recalculado — mantém o prazo original.
        })
        .eq('id', current.id)
        .eq('operator_id', req.user.id)
        .eq('status_commercial', 'awaiting_payment')
        .select(SELECT)
        .single()
      if (updErr) throw updErr

      notifyUser({
        userId:      updated.user_id,
        bookingId:   updated.id,
        templateKey: 'quote_updated',
        title:       'Cotação atualizada',
        body:        `Sua cotação de translado (${updated.booking_code}) foi atualizada para R$ ${Number(quoted_price).toFixed(2)}.`,
      })

      return res.json({ ok: true, booking: updated })
    }

    // ── Aceite atômico (primeira cooperativa a aceitar ganha) ──────────────
    const manualQuoteFields = current.is_manual_quote ? {
      total_amount:      quoted_price,
      quoted_by_user_id: req.user.id,
      quoted_at:         new Date().toISOString(),
      ...(quote_notes !== undefined ? { quote_notes } : {}),
    } : {}

    // Tentativa 1 — fluxo novo: solicitação aguardando aceite → vai para pagamento.
    let { data, error } = await supabase
      .from('bookings')
      .update({
        operator_id:        req.user.id,
        status_commercial:  'awaiting_payment',
        status_operational: 'assigned',
        ...manualQuoteFields,
      })
      .eq('id', req.params.id)
      .is('operator_id', null)
      .eq('status_commercial', 'awaiting_acceptance')
      .select(SELECT)
    if (error) throw error

    // Tentativa 2 — fluxo antigo / cotação já paga: aguardando despacho → só atribui.
    // (não se aplica a is_manual_quote, que nunca chega a 'paid' sem operator_id)
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
        : current.is_manual_quote
          ? `Sua cotação de translado (${b.booking_code}) saiu por R$ ${Number(quoted_price).toFixed(2)}. Pague para confirmar.`
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
