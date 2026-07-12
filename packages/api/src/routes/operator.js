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
import { isBookingLegsEngineEnabled } from '../services/featureFlags.js';
import { ensurePaymentDeadlineAndNotify } from '../services/legFlow.js';

// Rótulo amigável do serviço para o texto da notificação
const serviceLabel = (t) => (t === 'transfer' ? 'translado' : 'passeio');

const PROFILE_FIELDS = `
  id, full_name, email, phone, document_type, document_number, birth_date,
  profile_photo_url, address, cep, partner_slug,
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

// ── GET /api/operator/partners ─────────────────────────
// Público: cooperativas/operadores ativos (só nome + foto) para a vitrine
// de parceiros na home. Não expõe e-mail, telefone, documento nem dados
// bancários. Fica ANTES do middleware de auth de propósito.
router.get('/partners', async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, profile_photo_url')
      .eq('user_type', 'operator')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
      .limit(24);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { next(err); }
});

router.use(authenticate, requireOperator);

// GET /api/operator/profile
router.get('/profile', async (req, res, next) => {
  try {
    let { data, error } = await supabase
      .from('users')
      .select(PROFILE_FIELDS)
      .eq('id', req.user.id)
      .single();
    if (error?.code === '42703') {
      // Migration 054 (partner_slug) ainda não rodou — devolve o perfil sem o
      // campo em vez de quebrar a tela da cooperativa.
      const retry = await supabase
        .from('users')
        .select(PROFILE_FIELDS.replace(', partner_slug', ''))
        .eq('id', req.user.id)
        .single();
      data = retry.data; error = retry.error;
    }
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

    // Model B (opt-out): a coop escolhe passeios/transfers, mas o catálogo de
    // veículos operados é curado pelo admin (ver /api/admin/operators/:id/vehicles).
    if (type === 'vehicle' && req.user.user_type === 'operator') {
      return res.status(403).json({ error: 'Preferência de veículo é gerida pelo administrador' });
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
  origin_text, destination_text, status_commercial, status_operational, order_group_id
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

// =============================================================================
// MOTOR DE PERNAS (Etapa 2, Onda A) — feed leg-shaped, atrás da flag
// booking_legs_engine_enabled. Escopo: itens por veículo (passeio privativo +
// transfer de rota). Compartilhado/cotação (sem booking_legs) continuam no
// fluxo antigo mesmo com a flag ligada.
// =============================================================================

const LEG_COLUMNS = `
  id, booking_id, booking_vehicle_id, leg_number, vehicle_id,
  vehicle_name_snapshot, vehicle_type_snapshot, vehicle_capacity_snapshot,
  pax_count, leg_price, operator_id, status_leg, acceptance_expires_at,
  admin_notified_at, created_at
`;

// Pernas na fila (awaiting_acceptance). Coop: só dentro do prazo + roteáveis
// (Model B opt-out, mesmo padrão do filtro por booking). Admin: TUDO, sem
// filtro de prazo nem de veículo — inclusive pernas expiradas/órfãs (Central).
async function fetchPendingLegs({ isAdmin, operatorId }) {
  let q = supabase.from('booking_legs').select(LEG_COLUMNS).eq('status_leg', 'awaiting_acceptance');
  if (!isAdmin) q = q.gt('acceptance_expires_at', new Date().toISOString());

  const { data, error } = await q.order('acceptance_expires_at', { ascending: true });
  if (error) throw error;
  let legs = data || [];

  if (!isAdmin && legs.length > 0) {
    // Model B (opt-out): a perna tem 1 vehicle_id só — filtro trivial. Fail-open
    // em qualquer erro (nunca esconde perna por engano), mesmo padrão do
    // filtro por booking acima.
    try {
      const { data: prefs, error: prefErr } = await supabase
        .from('operator_service_preferences')
        .select('entity_id')
        .eq('operator_id', operatorId)
        .eq('entity_type', 'vehicle')
        .eq('is_active', false);
      if (prefErr) throw prefErr;
      const disabled = new Set((prefs || []).map((r) => r.entity_id));
      legs = legs.filter((l) => !disabled.has(l.vehicle_id));
    } catch (err) {
      console.error('[operator/legs] filtro por veículo falhou op=%s err=%s — fail-open, sem filtrar',
        operatorId, err?.message);
    }
  }
  return legs;
}

// Enriquece cada perna com o mínimo necessário para a coop EXECUTAR (dados do
// pedido pai + do cliente) — de propósito, NÃO inclui total_amount do pedido
// nem as pernas irmãs: a coop enxerga só a própria perna.
async function attachLegContext(legs) {
  if (legs.length === 0) return [];

  const bookingIds = [...new Set(legs.map((l) => l.booking_id))];
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, booking_code, service_type, service_date, service_time, origin_text, destination_text, user_id, order_group_id')
    .in('id', bookingIds);
  if (error) throw error;
  const bookingById = new Map((bookings || []).map((b) => [b.id, b]));

  const userIds = [...new Set((bookings || []).map((b) => b.user_id).filter(Boolean))];
  let usersById = new Map();
  if (userIds.length > 0) {
    const { data: users, error: uErr } = await supabase
      .from('users').select('id, full_name, phone').in('id', userIds);
    if (uErr) throw uErr;
    usersById = new Map((users || []).map((u) => [u.id, u]));
  }

  return legs.map((l) => {
    const b = bookingById.get(l.booking_id);
    const customer = b ? usersById.get(b.user_id) : null;
    return {
      leg_id:                l.id,
      leg_number:            l.leg_number,
      booking_id:            l.booking_id,
      order_group_id:        b?.order_group_id || null,
      booking_code:          b?.booking_code || null,
      service_type:          b?.service_type || null,
      service_date:          b?.service_date || null,
      service_time:          b?.service_time || null,
      origin_text:           b?.origin_text || null,
      destination_text:      b?.destination_text || null,
      vehicle_id:            l.vehicle_id,
      vehicle_name:          l.vehicle_name_snapshot,
      vehicle_type:          l.vehicle_type_snapshot,
      vehicle_capacity:      l.vehicle_capacity_snapshot,
      pax_count:             l.pax_count,
      leg_price:             l.leg_price,
      status_leg:            l.status_leg,
      acceptance_expires_at: l.acceptance_expires_at,
      created_at:            l.created_at,
      people_count:          l.pax_count,       // alias p/ compat. com telas antigas
      customer:              customer ? { full_name: customer.full_name, phone: customer.phone } : null,
    };
  });
}

// Se o combo fechou (todas as pernas não-canceladas aceitas), avança o pedido
// para 'awaiting_payment' e notifica o cliente para pagar. Faz o papel que o
// design da 042 atribui a um trigger `recompute_booking_from_legs` — esse
// trigger NÃO existe na migration aplicada (conferido em 042); só existe
// `enforce_pay_after_all_legs`, que BLOQUEIA o avanço quando falta aceite, mas
// não o DISPARA sozinho. Ver Riscos/Objeções no handoff.
async function advanceBookingIfComboComplete(bookingId) {
  const { data: legs, error } = await supabase
    .from('booking_legs')
    .select('status_leg')
    .eq('booking_id', bookingId);
  if (error) throw error;

  const relevant = (legs || []).filter((l) => l.status_leg !== 'cancelled');
  const allAccepted = relevant.length > 0 && relevant.every((l) => l.status_leg === 'accepted');
  if (!allAccepted) return { advanced: false };

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, user_id, booking_code, service_type, status_commercial, origin_text, destination_text, service_date, total_amount')
    .eq('id', bookingId)
    .single();
  if (bErr) throw bErr;
  if (booking.status_commercial !== 'awaiting_acceptance') return { advanced: false, booking };

  const { error: upErr } = await supabase
    .from('bookings')
    .update({ status_commercial: 'awaiting_payment' })
    .eq('id', bookingId);
  if (upErr) throw upErr;

  return { advanced: true, booking };
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
    let acceptanceRows = isAdmin ? expired : within;

    console.log('[operator/bookings] role=%s aguardando=%d dentro_prazo=%d fora_prazo=%d mostra=%d',
      req.user?.user_type, all.length, within.length, expired.length, acceptanceRows.length);

    // Roteamento por veículo operado (Etapa 1 — Model B, opt-out): a coop só
    // deixa de ver um pedido se ele exige ao menos um veículo que ela
    // desativou explicitamente em operator_service_preferences. Sem linha
    // (default) = veículo operado. Admin não é filtrado (vê tudo o que já
    // via). Fail-open em qualquer erro/ausência: nunca esconde pedido por
    // engano — só loga e segue sem filtrar.
    if (!isAdmin && acceptanceRows.length > 0) {
      try {
        const ids = acceptanceRows.map((b) => b.id);
        const [bvRes, prefsRes] = await Promise.all([
          supabase.from('booking_vehicles').select('booking_id, vehicle_id').in('booking_id', ids),
          supabase.from('operator_service_preferences').select('entity_id')
            .eq('operator_id', req.user.id)
            .eq('entity_type', 'vehicle')
            .eq('is_active', false),
        ]);

        if (bvRes.error || prefsRes.error) {
          console.error(
            '[operator/bookings] filtro por veículo falhou op=%s bv_err=%s prefs_err=%s — fail-open, sem filtrar',
            req.user.id, bvRes.error?.message, prefsRes.error?.message,
          );
        } else {
          const vehiclesByBooking = new Map();
          for (const row of bvRes.data || []) {
            if (!vehiclesByBooking.has(row.booking_id)) vehiclesByBooking.set(row.booking_id, []);
            vehiclesByBooking.get(row.booking_id).push(row.vehicle_id);
          }
          const disabled = new Set((prefsRes.data || []).map((r) => r.entity_id));

          acceptanceRows = acceptanceRows.filter((b) => {
            const vehicleIds = vehiclesByBooking.get(b.id);
            if (!vehicleIds || vehicleIds.length === 0) return true; // sem booking_vehicles → fail-open
            return !vehicleIds.some((vId) => disabled.has(vId));
          });
        }
      } catch (err) {
        console.error('[operator/bookings] exceção no filtro por veículo op=%s err=%s — fail-open, sem filtrar',
          req.user.id, err?.message);
      }
    }

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

    // ── Flag OFF: resposta idêntica à de hoje (zero regressão). ───────────
    const legsEngineOn = await isBookingLegsEngineEnabled();
    if (!legsEngineOn) {
      return res.json({ pending, mine });
    }

    // ── Flag ON: pedidos com pernas (privativo/transfer de rota, Onda A)
    // saem da listagem "legacy" e passam a aparecer como pernas isoladas —
    // sem total do pedido, sem pernas irmãs. Pedidos sem pernas (compartilhado
    // /cotação, Onda B) continuam no formato antigo dentro do mesmo array,
    // marcados com kind:'booking' para o frontend discriminar.
    const legPending = await attachLegContext(await fetchPendingLegs({ isAdmin, operatorId: req.user.id }));

    const legacyExclude = new Set(legPending.map((l) => l.booking_id));
    try {
      const ids = pending.map((b) => b.id);
      if (ids.length > 0) {
        const { data: withLegs, error } = await supabase
          .from('booking_legs').select('booking_id').in('booking_id', ids);
        if (error) throw error;
        for (const row of withLegs || []) legacyExclude.add(row.booking_id);
      }
    } catch (err) {
      console.error('[operator/bookings] checagem de pedidos com pernas falhou — fail-open (mantém legacy):', err.message);
    }

    const legacyPending = pending
      .filter((b) => !legacyExclude.has(b.id))
      .map((b) => ({ kind: 'booking', ...b }));

    res.json({
      engine:  'legs',
      pending: [...legPending.map((l) => ({ kind: 'leg', ...l })), ...legacyPending],
      mine:    mine.map((b) => ({ kind: 'booking', ...b })),
    });
  } catch (err) { next(err) }
})

// ── POST /api/operator/legs/:legId/accept ──────────────
// Aceite atômico POR PERNA (Etapa 2 / Onda A) — atrás da flag. UPDATE
// condicional garante "primeiro a aceitar vence": 0 linhas afetadas = a perna
// já foi aceita por outra coop, expirou, ou não existe mais.
router.post('/legs/:legId/accept', async (req, res, next) => {
  try {
    const legsEngineOn = await isBookingLegsEngineEnabled();
    if (!legsEngineOn) {
      return res.status(404).json({ error: 'Motor de pernas não habilitado' });
    }

    const isAdmin = req.user?.user_type === 'admin';
    const nowIso  = new Date().toISOString();

    // Roteamento (opt-out): uma coop não pode aceitar perna de um veículo que
    // ela desligou em operator_service_preferences. Admin não tem essa
    // restrição. É uma pré-checagem — a atomicidade do "primeiro a aceitar
    // vence" continua garantida pelo UPDATE condicional atômico abaixo.
    if (!isAdmin) {
      const { data: legRow, error: legErr } = await supabase
        .from('booking_legs')
        .select('vehicle_id')
        .eq('id', req.params.legId)
        .maybeSingle();
      if (legErr) throw legErr;
      if (!legRow) return res.status(404).json({ error: 'Perna não encontrada' });

      const { data: disabled, error: prefErr } = await supabase
        .from('operator_service_preferences')
        .select('id')
        .eq('operator_id', req.user.id)
        .eq('entity_type', 'vehicle')
        .eq('entity_id',   legRow.vehicle_id)
        .eq('is_active',   false)
        .maybeSingle();
      if (prefErr) throw prefErr;
      if (disabled) {
        return res.status(403).json({ error: 'Este veículo não é operado por você' });
      }
    }

    let q = supabase
      .from('booking_legs')
      .update({ operator_id: req.user.id, status_leg: 'accepted' })
      .eq('id', req.params.legId)
      .is('operator_id', null)
      .eq('status_leg', 'awaiting_acceptance');
    if (!isAdmin) q = q.gt('acceptance_expires_at', nowIso);

    const { data, error } = await q.select(
      'id, booking_id, leg_number, vehicle_name_snapshot, leg_price, acceptance_expires_at'
    );
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(409).json({ error: 'Perna já aceita, expirada ou indisponível' });
    }

    const leg = data[0];

    // Fecha o combo? Se todas as pernas não-canceladas já estão aceitas, avança
    // para awaiting_payment. Em qualquer caso (parcial OU completo), grava o
    // prazo de pagamento e notifica o cliente (R3 — checkout parcial). O aviso e
    // o prazo são idempotentes: só disparam no PRIMEIRO aceite do pedido.
    let comboComplete = false;
    try {
      const { advanced, booking } = await advanceBookingIfComboComplete(leg.booking_id);
      comboComplete = advanced;

      // Prazo de pagamento + notificação (parcial ou completo) — idempotente.
      await ensurePaymentDeadlineAndNotify(leg.booking_id, { comboComplete: advanced });

      // WhatsApp só no combo completo (mantém o comportamento anterior).
      if (advanced && booking) {
        notifyClientBookingAccepted(supabase, {
          id: booking.id, booking_code: booking.booking_code, user_id: booking.user_id,
          service_type: booking.service_type, service_date: booking.service_date,
          total_amount: booking.total_amount,
          origin_text: booking.origin_text, destination_text: booking.destination_text,
        }).catch((err) => console.error('[whatsapp] aviso cliente combo completo falhou:', err.message));
      }
    } catch (err) {
      // Não derruba o aceite (já commitado) por falha ao avançar/notificar —
      // loga para investigação; o pedido fica visível na Central do admin.
      console.error('[operator/legs] pós-aceite falhou leg=%s err=%s', leg.id, err.message);
    }

    res.json({ ok: true, leg, combo_complete: comboComplete });
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

    // Motor de pernas ON: pedidos com booking_legs (privativo/transfer de
    // rota, Onda A) NÃO podem mais ser aceitos por booking inteiro — cada
    // perna é roteada e aceita separadamente (ver POST /legs/:legId/accept).
    // Sem essa guarda a trava do banco (enforce_pay_after_all_legs) já
    // bloquearia a transição, mas com um erro 500 cru; aqui devolvemos uma
    // mensagem clara. Pedidos sem pernas (compartilhado/cotação, Onda B)
    // seguem 100% pelo caminho antigo, mesmo com a flag ligada.
    if (await isBookingLegsEngineEnabled()) {
      const { count, error: legsCheckErr } = await supabase
        .from('booking_legs')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', req.params.id);
      if (!legsCheckErr && count > 0) {
        return res.status(409).json({
          error: 'Este pedido usa o motor de pernas — aceite cada perna individualmente em POST /api/operator/legs/:legId/accept',
        });
      }
    }

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
