/**
 * /api/operator — Perfil e preferências de serviço do operador/cooperativa
 * GET   /api/operator/profile               — dados pessoais + conta de recebimento
 * PATCH /api/operator/profile               — atualiza dados pessoais + conta
 * GET   /api/operator/preferences           — lista preferências de serviço
 * PUT   /api/operator/preferences/:type/:id — ativa ou desativa um serviço
 */
import { Router } from 'express';
import { z }      from 'zod';
import dayjs      from 'dayjs';
import { supabase } from '../supabase.js';
import { authenticate, requireOperator } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';
import { notifyAdminExpiredBooking, notifyClientBookingAccepted } from '../services/whatsapp.js';

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
// Preferências são opcionais (opt-in de quais serviços a cooperativa executa).
// Qualquer falha aqui — tabela faltando, RLS, coluna divergente — NÃO deve
// quebrar as telas de Veículos/Passeios/Rotas: devolvemos lista vazia e o
// frontend trata todos os serviços como "disponíveis" por padrão. O erro
// real fica nos logs do Render pra investigação posterior.
router.get('/preferences', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('operator_service_preferences')
      .select('entity_type, entity_id, is_active, notes')
      .eq('operator_id', req.user.id);
    if (error) {
      console.error('[operator/preferences] supabase falhou op=%s code=%s msg=%s details=%s hint=%s',
        req.user.id, error.code, error.message, error.details, error.hint);
      return res.json([]);
    }
    res.json(data || []);
  } catch (err) {
    console.error('[operator/preferences] exception op=%s err=%s', req.user.id, err?.message);
    res.json([]);
  }
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

// Colunas da reserva sem nenhum embed por FK — embeds dependem do PostgREST
// resolver o relacionamento certo (schema cache, nome de constraint etc.) e já
// se mostraram um ponto frágil. Buscamos os dados do cliente à parte e
// juntamos em memória.
const BOOKING_COLUMNS = `
  id, booking_code, service_type, service_id, booking_mode, user_id,
  service_date, service_time, people_count, total_amount, created_at,
  origin_text, destination_text, status_commercial, status_operational
`

async function attachCustomers(bookings) {
  const ids = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))]
  if (ids.length === 0) return bookings
  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, phone')
    .in('id', ids)
  if (error) throw error
  const byId = new Map((users || []).map((u) => [u.id, u]))
  return bookings.map((b) => ({
    ...b,
    users: byId.get(b.user_id) || null,
  }))
}

// ── GET /api/operator/bookings ─────────────────────────
// Retorna corridas disponíveis (sem operador) + corridas do operador logado.
//
// Janela de 24h:
//  • user_type='operator' → vê APENAS solicitações com
//    acceptance_expires_at > NOW() (dentro do prazo de aceite das coops).
//  • user_type='admin'    → vê APENAS solicitações expiradas
//    (acceptance_expires_at < NOW()) — as que ninguém da coop pegou em 24h.
// Sem a migration 037 (coluna 42703), todo mundo vê tudo como antes.
router.get('/bookings', async (req, res, next) => {
  try {
    const isAdmin = req.user?.user_type === 'admin';
    const nowIso  = new Date().toISOString();

    // Cleanup oportunista — solicitações cuja data já passou sem ninguém
    // aceitar são canceladas pra não bagunçar nem coop nem admin.
    if (isAdmin) {
      const today = nowIso.slice(0, 10);
      await supabase.from('bookings')
        .update({ status_commercial: 'cancelled', status_operational: 'cancelled' })
        .eq('status_commercial', 'awaiting_acceptance')
        .is('operator_id', null)
        .lt('service_date', today);
    }

    // Detecção lazy de expiradas: marca as que passaram de 24h e ainda não
    // tiveram aviso enviado ao admin. UPDATE first (race-safe) → pega os
    // ids retornados → dispara WhatsApp pra cada (fire-and-forget).
    try {
      const { data: justExpired } = await supabase
        .from('bookings')
        .update({ admin_notified_expired_at: nowIso })
        .eq('status_commercial', 'awaiting_acceptance')
        .is('operator_id', null)
        .lt('acceptance_expires_at', nowIso)
        .is('admin_notified_expired_at', null)
        .select('id, booking_code, service_type, service_date, origin_text, destination_text');
      if (justExpired?.length) {
        for (const b of justExpired) {
          notifyAdminExpiredBooking(supabase, b).catch((err) =>
            console.error('[whatsapp] aviso admin expirada falhou:', err.message));
        }
      }
    } catch (err) {
      // Coluna admin_notified_expired_at pode não existir antes da migration 038.
      if (err?.code !== '42703') console.error('[operator/bookings] expiry sweep:', err.message);
    }

    // Busca TODAS as solicitações aguardando aceite (sem filtrar a janela no
    // SQL — o filtro .gt/.lt do PostgREST exclui NULL e já se mostrou frágil).
    // A partição da janela de 24h é feita em memória logo abaixo.
    let reqRes = await supabase.from('bookings').select(`${BOOKING_COLUMNS}, acceptance_expires_at`)
      .is('operator_id', null)
      .eq('status_commercial', 'awaiting_acceptance');
    if (reqRes.error?.code === '42703') {
      // Migration 037 não rodou — coluna não existe; busca sem ela.
      console.warn('[operator/bookings] coluna acceptance_expires_at ausente — rodar migration 037.');
      reqRes = await supabase.from('bookings').select(BOOKING_COLUMNS)
        .is('operator_id', null)
        .eq('status_commercial', 'awaiting_acceptance');
    }
    if (reqRes.error) throw reqRes.error

    const nowMs = Date.now();
    const all   = reqRes.data || [];
    // exp NULL → tratado como "dentro da janela" (visível pra coop): nunca
    // some por engano. Coop vê dentro do prazo; admin vê só as expiradas.
    const within  = all.filter((b) => !b.acceptance_expires_at || new Date(b.acceptance_expires_at).getTime() > nowMs);
    const expired = all.filter((b) =>  b.acceptance_expires_at && new Date(b.acceptance_expires_at).getTime() <= nowMs);
    const acceptanceRows = isAdmin ? expired : within;

    console.log('[operator/bookings] role=%s aguardando=%d dentro_prazo=%d fora_prazo=%d mostra=%d',
      req.user?.user_type, all.length, within.length, expired.length, acceptanceRows.length);

    // dispRes: paid+awaiting_dispatch (sem operador) — fluxo antigo das cotações
    // já pagas. Mostramos pros dois (não tem janela de aceite aqui).
    const dispRes = await supabase.from('bookings').select(BOOKING_COLUMNS)
      .is('operator_id', null)
      .eq('status_commercial', 'paid')
      .eq('status_operational', 'awaiting_dispatch');
    if (dispRes.error) throw dispRes.error

    const pendingRaw = [...acceptanceRows, ...(dispRes.data || [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    // Minhas corridas: aceitas ou em andamento
    const { data: mineRaw, error: e2 } = await supabase
      .from('bookings').select(BOOKING_COLUMNS)
      .eq('operator_id', req.user.id)
      .in('status_operational', ['assigned', 'in_progress'])
      .order('service_date', { ascending: true })

    if (e2) throw e2

    const [pending, mine] = await Promise.all([
      attachCustomers(pendingRaw),
      attachCustomers(mineRaw || []),
    ])

    res.json({ pending, mine })
  } catch (err) { next(err) }
})

// ── POST /api/operator/bookings/:id/accept ─────────────
// Aceite atômico: a primeira cooperativa a aceitar pega a solicitação (ANTES do
// pagamento). A reserva passa para 'awaiting_payment' e o cliente é avisado para
// pagar. O split automático será possível porque a cooperativa já está definida.
router.post('/bookings/:id/accept', async (req, res, next) => {
  try {
    const SELECT = 'id, booking_code, user_id, service_type'

    // Tentativa 1 — fluxo novo: solicitação aguardando aceite → vai para pagamento.
    const isAdmin = req.user?.user_type === 'admin'
    const nowIso  = new Date().toISOString()

    let acceptQuery = supabase
      .from('bookings')
      .update({
        operator_id:        req.user.id,
        status_commercial:  'awaiting_payment',
        status_operational: 'assigned',
      })
      .eq('id', req.params.id)
      .is('operator_id', null)
      .eq('status_commercial', 'awaiting_acceptance')
    // Coop só aceita dentro do prazo de 24h. Admin assume sem restrição
    // (justamente as expiradas que coop não pegou).
    if (!isAdmin) acceptQuery = acceptQuery.gt('acceptance_expires_at', nowIso)

    let resAccept = await acceptQuery.select(SELECT)
    if (resAccept.error?.code === '42703') {
      // Migration 037 ainda não rodou — aceita sem checar janela.
      resAccept = await supabase.from('bookings')
        .update({ operator_id: req.user.id, status_commercial: 'awaiting_payment', status_operational: 'assigned' })
        .eq('id', req.params.id)
        .is('operator_id', null)
        .eq('status_commercial', 'awaiting_acceptance')
        .select(SELECT)
    }
    let { data, error } = resAccept
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

    // WhatsApp pro cliente: só no fluxo novo (aguardava aceite → agora paga).
    // No fluxo antigo (alreadyPaid) já estava pago, então não precisa cobrar.
    if (!alreadyPaid) {
      const { data: full } = await supabase.from('bookings')
        .select('id, booking_code, user_id, service_type, service_date, total_amount, origin_text, destination_text')
        .eq('id', b.id).maybeSingle()
      if (full) notifyClientBookingAccepted(supabase, full).catch((err) =>
        console.error('[whatsapp] aviso cliente aceite falhou:', err.message))
    }

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

// =============================================================================
// FINANCEIRO — escopo do operador (não confundir com /api/admin/financial,
// que é a visão consolidada da plataforma). Aqui filtramos pelos lançamentos
// das reservas atribuídas à própria cooperativa.
// =============================================================================

function sumByType(rows, entryType, direction) {
  return rows
    .filter((r) => r.entry_type === entryType && r.direction === direction)
    .reduce((s, r) => s + Number(r.amount), 0);
}
function sumByStatus(rows, direction, status) {
  return rows
    .filter((r) => r.direction === direction && r.financial_status === status)
    .reduce((s, r) => s + Number(r.amount), 0);
}

// IDs das reservas dessa cooperativa. Retorna [] se ela ainda não tem nenhuma.
async function operatorBookingIds(operatorId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('id')
    .eq('operator_id', operatorId);
  if (error) throw error;
  return (data || []).map((b) => b.id);
}

// ── GET /api/operator/financial ─────────────────────────
// Resumo financeiro do período para a cooperativa logada.
router.get('/financial', async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const starts = {
      day:   dayjs().startOf('day').toISOString(),
      week:  dayjs().startOf('week').toISOString(),
      month: dayjs().startOf('month').toISOString(),
      year:  dayjs().startOf('year').toISOString(),
    };

    const bookingIds = await operatorBookingIds(req.user.id);
    if (bookingIds.length === 0) {
      return res.json({
        bruto: 0, taxas: 0, liquido: 0,
        nao_creditado: 0, comissoes_plataforma: 0, repasses: 0,
        margem_percent: 0,
      });
    }

    const { data, error } = await supabase
      .from('financial_ledger')
      .select('entry_type, amount, direction, financial_status')
      .in('booking_id', bookingIds)
      .gte('created_at', starts[period] || starts.month);
    if (error) throw error;

    const bruto     = sumByType(data, 'booking_gross',        'inflow');
    const taxas     = sumByType(data, 'gateway_fee',          'outflow');
    const liquido   = sumByType(data, 'booking_net',          'inflow');
    const naoCredit = sumByStatus(data, 'inflow', 'pending');
    const comissoes = sumByType(data, 'commission_platform',  'outflow');
    const repasses  = sumByType(data, 'payout_operator',      'outflow');

    res.json({
      bruto, taxas, liquido,
      nao_creditado:        naoCredit,
      comissoes_plataforma: comissoes,
      repasses,
      margem_percent: bruto > 0 ? Math.round(((bruto - taxas - comissoes) / bruto) * 100) : 0,
    });
  } catch (err) { next(err); }
});

// ── GET /api/operator/financial-daily ───────────────────
// Série diária do faturamento bruto (para o gráfico do painel).
router.get('/financial-daily', async (req, res, next) => {
  try {
    const days  = Number(req.query.days || 30);
    const since = dayjs().subtract(days, 'day').format('YYYY-MM-DD');

    const bookingIds = await operatorBookingIds(req.user.id);
    if (bookingIds.length === 0) return res.json([]);

    const { data, error } = await supabase
      .from('financial_ledger')
      .select('amount, effective_date')
      .in('booking_id', bookingIds)
      .eq('entry_type', 'booking_gross')
      .eq('direction', 'inflow')
      .gte('effective_date', since)
      .order('effective_date');
    if (error) throw error;

    const byDay = {};
    for (const row of data || []) {
      const d = row.effective_date?.slice(0, 10) || '';
      if (!d) continue;
      byDay[d] = (byDay[d] || 0) + Number(row.amount);
    }
    res.json(
      Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total })),
    );
  } catch (err) { next(err); }
});

export default router;
