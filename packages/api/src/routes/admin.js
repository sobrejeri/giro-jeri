import { Router } from 'express';
import { z }      from 'zod';
import { supabase } from '../supabase.js';
import {
  destinatariosElegiveis,
  dispararEmSegundoPlano,
  montarMensagem,
  isWhatsappEnabled,
  TETO_POR_DISPARO,
} from '../services/couponBroadcast.js';
import { authenticate, requireAdmin, requireOperator } from '../middleware/auth.js';
import { notifyUser } from '../services/notify.js';
import { notifyDispatchOS } from '../services/whatsapp.js';
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
      { count: aguardandoAceite },
      { count: cancelamentos },
      financeiroHoje,
      financeiroMes,
    ] = await Promise.all([
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('service_date', today).neq('status_commercial', 'cancelled'),

      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('status_commercial', 'awaiting_payment'),

      // AGUARDANDO ACEITE do operador (`awaiting_acceptance`, migration 035).
      // É a primeira parada do pedido no fluxo atual — cliente solicita, a coop
      // aceita, e SÓ ENTÃO o cliente paga. Estava fora do painel inteiro: a
      // fila mais importante da operação era a única invisível, e o admin não
      // tinha como ver pedido parado esperando alguém aceitar.
      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('status_commercial', 'awaiting_acceptance'),

      supabase.from('bookings').select('*', { count: 'exact', head: true })
        .eq('status_commercial', 'cancelled').eq('booking_date', today),

      // effective_date = dia do recebimento (preenchida pela migration 039);
      // fallback para created_at cobre lançamentos criados antes do reparo.
      supabase.from('financial_ledger').select('amount')
        .eq('entry_type', 'booking_gross')
        .or(`effective_date.gte.${today},and(effective_date.is.null,created_at.gte.${today})`),

      supabase.from('financial_ledger').select('amount')
        .eq('entry_type', 'booking_gross')
        .or(`effective_date.gte.${monthStart},and(effective_date.is.null,created_at.gte.${monthStart})`),
    ]);

    const valorBrutoHoje = (financeiroHoje.data || [])
      .reduce((s, r) => s + Number(r.amount), 0);
    const valorBrutoMes  = (financeiroMes.data || [])
      .reduce((s, r) => s + Number(r.amount), 0);

    // LÍQUIDO REAL, do próprio razão. Era `bruto * 0,93` — 7% chutados no
    // código, enquanto a comissão de verdade é configurável por operador
    // (`platform_split_pct`) ou global (`payment_split_admin_pct`), e a taxa do
    // gateway varia por meio de pagamento. O número certo já estava gravado em
    // `financial_ledger` como `booking_net`; o painel só não o lia.
    // Null quando não há lançamento líquido: melhor não mostrar do que mostrar
    // um valor inventado.
    let valorLiquidoHoje = null;
    let valorLiquidoMes  = null;
    try {
      const somaLiquido = async (desde) => {
        const { data } = await supabase.from('financial_ledger').select('amount')
          .eq('entry_type', 'booking_net')
          .or(`effective_date.gte.${desde},and(effective_date.is.null,created_at.gte.${desde})`);
        return data?.length ? data.reduce((s, r) => s + Number(r.amount), 0) : null;
      };
      [valorLiquidoHoje, valorLiquidoMes] = await Promise.all([
        somaLiquido(today), somaLiquido(monthStart),
      ]);
    } catch (e) {
      console.error('[stats] líquido do razão falhou:', e.message);
    }

    res.json({
      reservas_hoje:      reservasHoje || 0,
      pendencias:         pendentes || 0,
      aguardando_aceite:  aguardandoAceite || 0,
      cancelamentos:      cancelamentos || 0,
      valor_bruto_hoje:   valorBrutoHoje,
      valor_liquido_hoje: valorLiquidoHoje,
      valor_bruto_mes:    valorBrutoMes,
      valor_liquido_mes:  valorLiquidoMes,
    });
  } catch (err) { next(err); }
});

// ── GET /api/admin/auth-orphans ────────────────────────
// Diagnóstico de integridade auth ↔ perfil.
// Retorna { orphans: [...], unlinked: [...] }
//   orphans  = auth.users SEM perfil em public.users (criados pelo Dashboard)
//   unlinked = public.users cujo auth_id é NULL ou não existe mais no Auth
router.get('/auth-orphans', requireAdmin, async (req, res, next) => {
  try {
    const { data: { users: authUsers }, error: authErr } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (authErr) throw authErr;

    const { data: profiles, error: profErr } = await supabase
      .from('users').select('id, auth_id, full_name, email, user_type, created_at');
    // Falha na leitura dos perfis NÃO pode virar "todo mundo é órfão" (a tela
    // mostraria N usuários "sem perfil" + botão Importar que duplicaria).
    if (profErr) throw profErr;

    const authIdSet  = new Set(authUsers.map((u) => u.id));
    const linkedSet  = new Set((profiles || []).map((r) => r.auth_id).filter(Boolean));

    const orphans = authUsers
      .filter((u) => !linkedSet.has(u.id))
      .map((u) => ({
        auth_id:    u.id,
        email:      u.email,
        phone:      u.phone,
        created_at: u.created_at,
      }));

    const unlinked = (profiles || [])
      .filter((p) => !p.auth_id || !authIdSet.has(p.auth_id))
      .map((p) => ({
        id:         p.id,
        auth_id:    p.auth_id,
        full_name:  p.full_name,
        email:      p.email,
        user_type:  p.user_type,
        reason:     !p.auth_id ? 'auth_id nulo' : 'auth_id não existe no Auth',
        created_at: p.created_at,
      }));

    res.json({ orphans, unlinked });
  } catch (err) { next(err); }
});

// ── POST /api/admin/import-auth-user ──────────────────
// Cria perfil na tabela users para um usuário que só existe no Auth.
const importAuthSchema = z.object({
  auth_id:   z.string().uuid(),
  full_name: z.string().min(2).max(200),
  user_type: z.enum(['tourist', 'operator', 'agency', 'admin', 'finance', 'affiliate']),
  cnpj:      z.string().optional(),
});

router.post('/import-auth-user', requireAdmin, async (req, res, next) => {
  try {
    const body = importAuthSchema.parse(req.body);

    const { data: { user: authUser }, error: authErr } =
      await supabase.auth.admin.getUserById(body.auth_id);
    if (authErr || !authUser) return res.status(404).json({ error: 'Usuário Auth não encontrado' });

    // Guarda anti-duplicata: se a checagem FALHAR (instabilidade), aborta —
    // nunca insere às cegas. Checa por auth_id E por e-mail.
    const existing = await supabase
      .from('users').select('id').eq('auth_id', body.auth_id).maybeSingle();
    if (existing.error) {
      return res.status(503).json({ error: 'Instabilidade momentânea — tente novamente.' });
    }
    if (existing.data) return res.status(409).json({ error: 'Este usuário já tem perfil' });
    if (authUser.email) {
      const byEmail = await supabase
        .from('users').select('id').eq('email', authUser.email).maybeSingle();
      if (byEmail.error) {
        return res.status(503).json({ error: 'Instabilidade momentânea — tente novamente.' });
      }
      if (byEmail.data) {
        return res.status(409).json({ error: 'Já existe perfil com este e-mail — use vincular, não importar.' });
      }
    }

    let docNumber = null;
    let docType   = null;
    let email     = authUser.email;

    if (body.user_type === 'operator' && body.cnpj) {
      const cnpjDigits = body.cnpj.replace(/\D/g, '');
      const { validateBrDoc } = await import('../lib/document.js');
      const docErr = validateBrDoc('cnpj', cnpjDigits);
      if (docErr) return res.status(400).json({ error: docErr });
      docNumber = cnpjDigits;
      docType   = 'cnpj';
      if (!email || !email.endsWith('@op.girojeri.app')) {
        const syntheticEmail = `${cnpjDigits}@op.girojeri.app`;
        await supabase.auth.admin.updateUserById(body.auth_id, { email: syntheticEmail });
        email = syntheticEmail;
      }
    }

    const { data: profile, error: profileErr } = await supabase
      .from('users')
      .insert({
        auth_id:         body.auth_id,
        full_name:       body.full_name,
        email,
        phone:           authUser.phone || null,
        user_type:       body.user_type,
        document_number: docNumber,
        document_type:   docType,
      })
      .select('id, full_name, email, phone, user_type, is_active, created_at, document_number')
      .single();

    if (profileErr) return res.status(400).json({ error: profileErr.message });

    await supabase.from('audit_logs').insert({
      user_id:         req.user.id,
      entity_type:     'users',
      entity_id:       profile.id,
      action_type:     'import_auth_user',
      new_values_json: { auth_id: body.auth_id, user_type: body.user_type },
    });

    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    next(err);
  }
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
      // Operador entra por documento: CNPJ (operador, 14 dígitos) ou CPF
      // (operador pessoa física, 11). Os dois usam o mesmo painel — muda só o
      // documento. O campo segue chamando `cnpj` no corpo por compatibilidade.
      const digits = String(body.cnpj).replace(/\D/g, '');
      const tipo   = digits.length === 11 ? 'cpf' : digits.length === 14 ? 'cnpj' : null;
      if (!tipo) {
        return res.status(400).json({ error: 'Informe um CNPJ (14 dígitos) ou CPF (11 dígitos).' });
      }
      const { validateBrDoc } = await import('../lib/document.js');
      const docErr = validateBrDoc(tipo, digits);
      if (docErr) return res.status(400).json({ error: docErr });

      // Documento já usado por outra conta derrubaria a criação com erro de
      // e-mail duplicado (o e-mail sintético vem do documento) — mensagem clara.
      const { data: jaExiste } = await supabase
        .from('users').select('id').eq('document_number', digits).maybeSingle();
      if (jaExiste) {
        return res.status(409).json({ error: 'Já existe uma conta com este CNPJ/CPF.' });
      }

      // Mantém o domínio sintético: é o que identifica login de operador em
      // todo o sistema — trocar quebraria o acesso de quem já está cadastrado.
      authEmail = `${digits}@op.girojeri.app`;
      authPhone = undefined;
      docNumber = digits;
      docType   = tipo;
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

// ── DELETE /api/admin/users/:id ────────────────────────
// Apagar de vez, e só quando é seguro.
//
// DESATIVAR é quase sempre o certo: `is_active = false` já barra o acesso no
// middleware de autenticação, e preserva o histórico. Esta rota existe para o
// outro caso — o cadastro de teste que nunca deveria ter existido.
//
// O banco protege o histórico sozinho (`ON DELETE RESTRICT` em bookings,
// reviews, cotações e resgates de cupom), mas um erro de FK cru vira "500" na
// tela. Aqui a checagem vem antes, com a contagem e o motivo.
//
// O que o banco NÃO protege são as 9 tabelas em CASCATA (endereços, favoritos,
// notificações, preferências de operação…). Some tudo junto, em silêncio — mais
// um motivo para só permitir em conta sem movimento.
const VINCULOS_QUE_BLOQUEIAM = [
  { tabela: 'bookings',            coluna: 'user_id',     rotulo: 'reserva(s) como cliente' },
  { tabela: 'bookings',            coluna: 'operator_id', rotulo: 'reserva(s) como operador' },
  { tabela: 'reviews',             coluna: 'user_id',     rotulo: 'avaliação(ões)' },
  { tabela: 'transfer_quotes',     coluna: 'user_id',     rotulo: 'cotação(ões)' },
  { tabela: 'coupon_redemptions',  coluna: 'user_id',     rotulo: 'cupom(ns) resgatado(s)' },
];

router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const alvoId = req.params.id;

    // Apagar a própria conta deixaria a plataforma sem quem administra — e o
    // admin logado perderia o acesso no meio da própria ação.
    if (alvoId === req.user.id) {
      return res.status(400).json({ error: 'Você não pode apagar a sua própria conta.' });
    }

    const { data: alvo } = await supabase
      .from('users').select('id, full_name, user_type, auth_id').eq('id', alvoId).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Movimento em qualquer uma dessas tabelas = conta com história. Desativar,
    // não apagar.
    const impedimentos = [];
    for (const v of VINCULOS_QUE_BLOQUEIAM) {
      const { count, error } = await supabase
        .from(v.tabela).select('id', { count: 'exact', head: true }).eq(v.coluna, alvoId);
      if (error) continue;                       // tabela ausente não bloqueia
      if ((count || 0) > 0) impedimentos.push(`${count} ${v.rotulo}`);
    }
    if (impedimentos.length > 0) {
      return res.status(409).json({
        error: `Esta conta tem histórico e não pode ser apagada: ${impedimentos.join(', ')}. `
             + 'Desative-a — o acesso é bloqueado na hora e os registros continuam existindo.',
        impedimentos,
      });
    }

    const { error: delErr } = await supabase.from('users').delete().eq('id', alvoId);
    if (delErr) {
      // 23503 = alguma FK que a checagem acima não cobre. Melhor dizer isso do
      // que devolver 500 sem explicação.
      if (delErr.code === '23503') {
        return res.status(409).json({
          error: 'Esta conta está vinculada a outros registros do sistema. Desative-a em vez de apagar.',
        });
      }
      throw delErr;
    }

    // A conta de login vive no Auth do Supabase, separada do perfil. Sem apagar
    // aqui, sobra um login órfão: não entra (o middleware não acha o perfil),
    // mas continua ocupando o e-mail/documento e impede recadastrar.
    // Best-effort: o perfil já foi apagado e não dá para desfazer.
    if (alvo.auth_id) {
      const { error: authErr } = await supabase.auth.admin.deleteUser(alvo.auth_id);
      if (authErr) console.error('[admin] perfil apagado mas o login ficou: %s', authErr.message);
    }

    await supabase.from('audit_logs').insert({
      user_id:         req.user.id,
      entity_type:     'users',
      entity_id:       alvoId,
      action_type:     'delete',
      old_values_json: { full_name: alvo.full_name, user_type: alvo.user_type },
    });

    res.json({ ok: true, apagado: alvo.full_name });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/users/:id ─────────────────────────
router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['user_type', 'is_active', 'phone', 'email', 'platform_split_pct', 'mp_payout_exempt'];
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
      return res.status(400).json({ error: 'Apenas operadores podem ser registradas como recebedoras' });
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

    // Comissões de afiliado: vivem na tabela `commissions` (não no ledger).
    // São uma taxa financeira real (repasse ao divulgador) e precisam aparecer
    // no Dashboard. CANCELADAS ficam de fora: reserva cancelada não gera
    // repasse, e somá-las descontava do resultado dinheiro que ninguém recebe.
    const { data: afRows } = await supabase
      .from('commissions')
      .select('commission_amount, payout_status, created_at')
      .not('affiliate_id', 'is', null)
      .neq('payout_status', 'cancelled')
      .gte('created_at', starts[period] || starts.month);
    const round2 = (v) => Math.round(v * 100) / 100;
    const comissoesAfiliados = round2((afRows || []).reduce((s, r) => s + Number(r.commission_amount || 0), 0));

    // Resultado da plataforma = o que ela realmente retém: comissão da plataforma
    // menos a taxa de gateway e menos o que é pago aos afiliados.
    const resultado = round2(comissoes - taxas - comissoesAfiliados);

    // Os lançamentos commission_platform/payout_operator só passaram a ser
    // gravados a partir do deploy de 24/07. Períodos que incluem receita ANTERIOR
    // a isso têm booking_gross sem a comissão correspondente — aí `resultado`
    // fica artificialmente baixo (até negativo) e NÃO deve ser lido como
    // prejuízo. Este flag avisa a tela para exibir "—" em vez de um número falso.
    const dadosIncompletos = bruto > 0 && comissoes === 0;

    res.json({
      bruto, taxas, liquido,
      nao_creditado: naoCredit,
      comissoes_plataforma: comissoes,
      comissoes_afiliados: comissoesAfiliados,
      repasses: repassesOut,
      resultado_plataforma: resultado,
      dados_incompletos: dadosIncompletos,
      margem_percent: (bruto > 0 && !dadosIncompletos) ? Math.round((resultado / bruto) * 100) : null,
    });
  } catch (err) { next(err); }
});

// ── POST /api/admin/operational/:id/os-link ────────────
// Reenvia a Ordem de Serviço (link público) no WhatsApp do cliente e do
// motorista. Separado do /assign: o despacho é a operação crítica e não pode
// depender do envio. Substituiu o /os-pdf, que mandava o PDF em base64 e
// esbarrava no limite de corpo da API.
router.post('/operational/:id/os-link', requireOperator, async (req, res, next) => {
  try {
    const { data: bk } = await supabase.from('bookings')
      .select(`id, booking_code, user_id, operator_id, service_type, booking_mode,
               service_date, service_time, people_count, origin_text, destination_text,
               pickup_place_name, destination_place_name`)
      .eq('id', req.params.id).maybeSingle();
    if (!bk) return res.status(404).json({ error: 'Reserva não encontrada.' });

    // Operador só reenvia OS da própria reserva; admin pode qualquer uma.
    if (req.user.user_type !== 'admin' && bk.operator_id && bk.operator_id !== req.user.id) {
      return res.status(403).json({ error: 'Reserva de outro operador.' });
    }

    const { data: assignment } = await supabase.from('operational_assignments')
      .select('real_vehicle_text, driver_name, driver_phone, dispatch_notes')
      .eq('booking_id', bk.id).maybeSingle();

    const r = await notifyDispatchOS(supabase, { booking: bk, assignment: assignment || null });
    res.json(r || { sent: true });
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
        order_group_id,
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

    // Escopo por operador: um operador (não-admin) só enxerga as PRÓPRIAS
    // reservas no painel operacional/despacho — nunca solicitações que ele ainda
    // não aceitou (operator_id nulo) nem reservas de outros operadores. Sem
    // isso, uma corrida "sem operador" aparecia com "Despachar" para todos.
    // Admin vê tudo (ou filtra por operator_id quando quiser).
    const isAdmin = req.user?.user_type === 'admin';
    if (!isAdmin)         query = query.eq('operator_id', req.user.id);
    else if (operator_id) query = query.eq('operator_id', operator_id);

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
    let enriched = (data || []).map((b) => ({
      ...b,
      users:    byId.get(b.user_id) || null,
      operator: b.operator_id ? (byId.get(b.operator_id) || null) : null,
    }));

    // Nome/roteiro/duração do serviço: sem isso a tela de despacho e a Ordem de
    // Serviço mostravam só "Passeio — Privativo", sem dizer QUAL passeio.
    const { attachServiceDetails } = await import('../services/serviceDetails.js');
    enriched = await attachServiceDetails(supabase, enriched);

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
      driver_payout_amount,
    } = req.body;

    const bookingId = req.params.id;

    // Só o dono da reserva despacha. Sem isto, um operador despachava a
    // reserva de OUTRA e a plataforma mandava o itinerário do cliente para o
    // telefone informado por ela. Admin passa direto.
    const { data: alvo } = await supabase
      .from('bookings')
      .select('id, operator_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Reserva não encontrada' });
    if (req.user.user_type !== 'admin' && alvo.operator_id !== req.user.id) {
      return res.status(403).json({ error: 'Esta reserva não é da sua operação.' });
    }

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
    // Valor do repasse ao motorista (opcional no despacho — pode ser definido
    // depois na aba de Repasses). Só entra no payload quando informado, para
    // não zerar um valor já combinado ao redespachar.
    if (driver_payout_amount !== undefined && driver_payout_amount !== null && driver_payout_amount !== '') {
      payload.driver_payout_amount = Number(driver_payout_amount);
    }

    // Identificação de quem executa (081). Mesma regra do valor acima: só entra
    // quando veio no corpo, senão um redespacho que não mexeu na chave PIX a
    // apagaria — e o repasse ficaria sem destino sem ninguém perceber.
    for (const campo of ['driver_document', 'driver_pix_key', 'driver_pix_key_type']) {
      const v = req.body?.[campo];
      if (v !== undefined) payload[campo] = (typeof v === 'string' ? v.trim() : v) || null;
    }

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

    // OS automática (item 12): envia para cliente e motorista via Z-API.
    // Best-effort — nunca derruba a resposta do despacho.
    try {
      const { data: bk } = await supabase.from('bookings')
        .select('id, booking_code, user_id, service_type, booking_mode, service_date, service_time, people_count, origin_text, destination_text, pickup_place_name, destination_place_name')
        .eq('id', bookingId).maybeSingle();
      if (bk) notifyDispatchOS(supabase, { booking: bk, assignment: result })
        .catch((err) => console.error('[whatsapp] OS de despacho falhou:', err.message));
    } catch (err) {
      console.error('[whatsapp] OS de despacho: erro ao carregar reserva:', err.message);
    }

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

// ── GET /api/admin/driver-payouts ──────────────────────
// Repasses aos motoristas. Quando a plataforma opera as corridas, o dinheiro
// cai todo na conta dela e o pagamento ao motorista é feito por fora — esta
// listagem é o controle do que já foi pago e do que ainda deve.
router.get('/driver-payouts', requireAdmin, async (req, res, next) => {
  try {
    const { status, from, to } = req.query;
    let query = supabase
      .from('operational_assignments')
      .select(`id, booking_id, driver_name, driver_phone, real_vehicle_text,
               driver_payout_amount, driver_payout_status, driver_paid_at,
               driver_payout_notes, assignment_status, created_at,
               bookings ( booking_code, service_type, service_date, service_time,
                          total_amount, status_commercial, origin_text, destination_text )`)
      .not('driver_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300);
    if (status) query = query.eq('driver_payout_status', status);

    let { data: rows, error } = await query;
    // Migration 066 pendente: devolve lista vazia em vez de derrubar a tela.
    if (error?.code === '42703') {
      return res.json({ rows: [], totals: { pending: 0, paid: 0, count: 0 }, migration_pending: true });
    }
    if (error) throw error;

    // Filtro por data DO SERVIÇO (não do despacho) — é o que o admin usa para
    // fechar o período de pagamento.
    rows = (rows || []).filter((r) => {
      const d = r.bookings?.service_date;
      if (from && (!d || d < from)) return false;
      if (to   && (!d || d > to))   return false;
      return true;
    });

    const totals = rows.reduce((acc, r) => {
      const v = Number(r.driver_payout_amount) || 0;
      if (r.driver_payout_status === 'paid')    acc.paid    += v;
      if (r.driver_payout_status === 'pending') acc.pending += v;
      return acc;
    }, { pending: 0, paid: 0, count: rows.length });
    totals.pending = Math.round(totals.pending * 100) / 100;
    totals.paid    = Math.round(totals.paid    * 100) / 100;

    res.json({ rows, totals });
  } catch (err) { next(err); }
});

// ── PATCH /api/admin/driver-payouts/:id ────────────────
// Define o valor combinado e/ou dá baixa no repasse (pago fora da plataforma).
router.patch('/driver-payouts/:id', requireAdmin, async (req, res, next) => {
  try {
    const { amount, status, notes } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };

    if (amount !== undefined && amount !== null && amount !== '') {
      const v = Number(amount);
      if (!Number.isFinite(v) || v < 0) {
        return res.status(400).json({ error: 'Valor do repasse inválido.' });
      }
      patch.driver_payout_amount = Math.round(v * 100) / 100;
    }
    if (notes !== undefined) patch.driver_payout_notes = notes || null;

    if (status !== undefined) {
      if (!['pending', 'paid', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido.' });
      }
      patch.driver_payout_status = status;
      // Marca/limpa a data conforme o estado, para o histórico não mentir.
      patch.driver_paid_at = status === 'paid' ? new Date().toISOString() : null;
    }

    const { data, error } = await supabase
      .from('operational_assignments')
      .update(patch)
      .eq('id', req.params.id)
      .select('id, driver_payout_amount, driver_payout_status, driver_paid_at, driver_payout_notes')
      .maybeSingle();

    if (error?.code === '42703') {
      return res.status(400).json({ error: 'Recurso indisponível: aplique a migration 066 no banco.' });
    }
    if (error) return res.status(400).json({ error: error.message });
    if (!data)  return res.status(404).json({ error: 'Despacho não encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// ── GET /api/admin/commissions ─────────────────────────
// Comissões do programa de afiliados. affiliate_id não tem FK (schema 001
// deixou "tabela futura"), então o join com users é manual.
router.get('/commissions', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = supabase
      .from('commissions')
      .select('id, booking_id, affiliate_id, commission_percent, commission_amount, payout_status, payout_due_date, payout_paid_at, created_at, bookings ( booking_code, service_type, service_date, total_amount )')
      .not('affiliate_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300);
    if (status) query = query.eq('payout_status', status);
    const { data: rows, error } = await query;
    if (error) throw error;

    const ids = [...new Set((rows || []).map((r) => r.affiliate_id))];
    let byId = {};
    if (ids.length) {
      // Chave PIX junto — fallback sem as colunas enquanto a 056 não roda
      let { data: users, error: uErr } = await supabase
        .from('users')
        .select('id, full_name, email, phone, affiliate_code, affiliate_pix_key, affiliate_pix_key_type')
        .in('id', ids);
      if (uErr?.code === '42703') {
        const retry = await supabase.from('users')
          .select('id, full_name, email, phone, affiliate_code').in('id', ids);
        users = retry.data;
      }
      byId = Object.fromEntries((users || []).map((u) => [u.id, u]));
    }
    res.json((rows || []).map((r) => ({ ...r, affiliate: byId[r.affiliate_id] || null })));
  } catch (err) { next(err); }
});

// ── PUT /api/admin/commissions/:id/pay ─────────────────
// Repasse manual feito via PIX → marca como pago e avisa o afiliado.
router.put('/commissions/:id/pay', requireAdmin, async (req, res, next) => {
  try {
    const { data: row, error } = await supabase
      .from('commissions')
      .update({ payout_status: 'paid', payout_paid_at: new Date().toISOString() })
      .eq('id', req.params.id)
      // Só paga o que está realmente a pagar. Antes era .neq('payout_status','paid'),
      // que ACEITAVA 'cancelled': com a tela em cache, o admin ressuscitava o
      // repasse de uma reserva que o cliente já havia cancelado.
      .in('payout_status', ['pending', 'ready'])
      .select('id, affiliate_id, commission_amount, booking_id, bookings ( booking_code )')
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(409).json({ error: 'Esta comissão não está a pagar (já foi paga ou a reserva foi cancelada). Atualize a lista.' });

    if (row.affiliate_id) {
      const fmtBRL = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      notifyUser({
        userId:      row.affiliate_id,
        bookingId:   row.booking_id,
        templateKey: 'affiliate_payout',
        title:       'Comissão paga 💸',
        body:        `Sua comissão de ${fmtBRL(row.commission_amount)} (reserva ${row.bookings?.booking_code || ''}) foi repassada via PIX. Obrigado por divulgar!`,
      });
    }
    res.json({ ok: true, id: row.id });
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

// ── Divulgação de cupom por WhatsApp ───────────────────
// Prévia: quantos clientes ainda podem receber ESTE cupom e como fica a
// mensagem. Sempre antes do disparo — o dono precisa ver o texto exato e o
// número de destinatários antes de mandar para a base inteira.
router.get('/coupons/:id/broadcast', requireAdmin, async (req, res, next) => {
  try {
    const { data: cupom, error } = await supabase
      .from('coupons').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!cupom) return res.status(404).json({ error: 'Cupom não encontrado' });

    const destinatarios = await destinatariosElegiveis(supabase, cupom.id);

    // Histórico e disparo em andamento, para a tela não oferecer um botão que
    // o banco vai recusar (há UNIQUE de um disparo ativo por cupom).
    const { data: disparos } = await supabase
      .from('coupon_broadcasts')
      .select('*')
      .eq('coupon_id', cupom.id)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({
      whatsapp_ativo:  isWhatsappEnabled(),
      destinatarios:   destinatarios.length,
      teto_por_disparo: TETO_POR_DISPARO,
      mensagem_exemplo: montarMensagem(cupom, { nome: destinatarios[0]?.full_name || null }),
      em_andamento:    (disparos || []).find((d) => d.status === 'running') || null,
      historico:       disparos || [],
    });
  } catch (err) { next(err); }
});

// Dispara. Responde na hora com o id; o envio segue em segundo plano.
router.post('/coupons/:id/broadcast', requireAdmin, async (req, res, next) => {
  try {
    if (!isWhatsappEnabled()) {
      return res.status(503).json({ error: 'WhatsApp não configurado nesta instalação.' });
    }
    const { data: cupom, error } = await supabase
      .from('coupons').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!cupom) return res.status(404).json({ error: 'Cupom não encontrado' });
    if (!cupom.is_active) {
      return res.status(400).json({ error: 'Cupom inativo: reative antes de divulgar.' });
    }
    if (cupom.valid_until && new Date(cupom.valid_until) < new Date()) {
      return res.status(400).json({ error: 'Cupom já expirou.' });
    }

    const destinatarios = await destinatariosElegiveis(supabase, cupom.id);
    if (destinatarios.length === 0) {
      return res.status(400).json({ error: 'Nenhum cliente novo para receber este cupom.' });
    }

    const { data: disparo, error: errDisparo } = await supabase
      .from('coupon_broadcasts')
      .insert({
        coupon_id:          cupom.id,
        created_by_user_id: req.user.id,
        message:            montarMensagem(cupom),
        total_recipients:   Math.min(destinatarios.length, TETO_POR_DISPARO),
      })
      .select().single();

    // 23505 = já existe disparo 'running' para este cupom (índice único
    // parcial). Acontece com clique duplo ou duas abas do admin abertas.
    if (errDisparo?.code === '23505') {
      return res.status(409).json({ error: 'Já existe um envio em andamento para este cupom.' });
    }
    if (errDisparo) throw errDisparo;

    await supabase.from('audit_logs').insert({
      user_id:         req.user.id,
      entity_type:     'coupons',
      entity_id:       cupom.id,
      action_type:     'broadcast_whatsapp',
      new_values_json: { broadcast_id: disparo.id, destinatarios: disparo.total_recipients },
    });

    dispararEmSegundoPlano(supabase, { broadcastId: disparo.id, cupom, destinatarios });
    res.status(202).json({ id: disparo.id, total: disparo.total_recipients });
  } catch (err) { next(err); }
});

// Andamento de um disparo — a tela consulta enquanto está enviando.
router.get('/broadcasts/:id', requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('coupon_broadcasts').select('*').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Envio não encontrado' });
    res.json(data);
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
// Compara o desempenho de TODAS os operadores: receita gerada, nº de
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

    // REPASSE do razão, não estimativa. Era `bruto × 0,93` — 7% chutados no
    // código. Isto aqui é o valor que cada operador TEM A RECEBER: estimar
    // é pior do que não mostrar, porque vira base de conversa sobre dinheiro.
    // `payout_operator` é o lançamento do repasse; sem ele, `net` vem null e a
    // tela mostra "—".
    const repassePorOperador = new Map();
    try {
      const idsOps = [...map.keys()].filter(Boolean);
      if (idsOps.length) {
        const { data: repasses } = await supabase
          .from('financial_ledger')
          .select('amount, booking_id, bookings ( operator_id )')
          .eq('entry_type', 'payout_operator');
        for (const r of repasses || []) {
          const opId = r.bookings?.operator_id;
          if (!opId) continue;
          repassePorOperador.set(opId, (repassePorOperador.get(opId) || 0) + Number(r.amount));
        }
      }
    } catch (e) {
      console.error('[operator-performance] repasse do razão falhou:', e.message);
    }

    const operators = [...map.values()]
      .map((r) => ({
        ...r,
        revenue:    Math.round(r.revenue * 100) / 100,
        net:        repassePorOperador.has(r.id)
                      ? Math.round(repassePorOperador.get(r.id) * 100) / 100
                      : null,
        ticket_avg: r.total ? Math.round((r.revenue / r.total) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const totals = operators.reduce(
      (t, o) => ({
        revenue:   Math.round((t.revenue + o.revenue) * 100) / 100,
        // `net` pode ser null (sem repasse lançado) — somar null viraria NaN
        // no total e a tela mostraria "R$ NaN".
        net:       Math.round((t.net + (o.net || 0)) * 100) / 100,
        tours:     t.tours + o.tours,
        transfers: t.transfers + o.transfers,
        total:     t.total + o.total,
      }),
      { revenue: 0, net: 0, tours: 0, transfers: 0, total: 0 },
    );

    res.json({ operators, totals });
  } catch (err) { next(err); }
});

// =============================================================================
// VEÍCULOS OPERADOS POR OPERADOR (Etapa 1 — roteamento do feed, Model B)
// Catálogo de vehicles é global; cada operator pode ter linhas em
// operator_service_preferences (entity_type='vehicle') desativando um
// veículo específico. Sem linha = veículo operado (default opt-out).
// Escrita é admin-only (ver migration 041 e o bloqueio 403 em operator.js).
// =============================================================================

// ── GET /api/admin/operators/:operatorId/vehicles ──────
router.get('/operators/:operatorId/vehicles', requireAdmin, async (req, res, next) => {
  try {
    const { operatorId } = req.params;

    const { data: operator, error: opErr } = await supabase
      .from('users')
      .select('id, full_name, user_type')
      .eq('id', operatorId)
      .eq('user_type', 'operator')
      .maybeSingle();
    if (opErr) throw opErr;
    if (!operator) return res.status(404).json({ error: 'Operador não encontrada' });

    const { data: vehicles, error: vErr } = await supabase
      .from('vehicles')
      .select('id, name, vehicle_type, seat_capacity, image_url')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (vErr) throw vErr;

    const { data: prefs, error: prefsErr } = await supabase
      .from('operator_service_preferences')
      .select('entity_id, is_active, notes')
      .eq('operator_id', operatorId)
      .eq('entity_type', 'vehicle');
    if (prefsErr) throw prefsErr;

    const prefsById = new Map((prefs || []).map((p) => [p.entity_id, p]));

    const result = (vehicles || []).map((v) => {
      const pref = prefsById.get(v.id);
      return {
        vehicle_id:    v.id,
        name:          v.name,
        vehicle_type:  v.vehicle_type,
        seat_capacity: v.seat_capacity,
        image_url:     v.image_url,
        // Model B (opt-out): default é operado (true); só é false quando
        // existe linha explícita is_active=false.
        is_active:     pref ? pref.is_active !== false : true,
        notes:         pref?.notes ?? null,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// =============================================================================
// REPASSES A PAGAR (migration 080)
// No modelo em que a plataforma recebe 100%, é aqui que se vê o que ela DEVE:
// comissão de quem aceitou e valor de quem executou, por reserva.
// =============================================================================

// ── GET /api/admin/payouts ─────────────────────────────
router.get('/payouts', requireAdmin, async (req, res, next) => {
  try {
    const { status = 'pending', payee } = req.query;

    // O destino do dinheiro vem junto (081): a chave PIX cadastrada de quem
    // recebe, e quem de fato executou. Sem isso a tela dizia QUANTO e para
    // QUEM, mas não para ONDE — e o admin ia caçar a chave em outro lugar.
    //
    // `operational_assignments` vem aninhado (array): nada impede duas linhas
    // para a mesma reserva, e um join achatado duplicaria o repasse, dobrando
    // o total a pagar na conferência.
    const EXECUTOR = 'driver_name, driver_phone, driver_document, driver_pix_key, '
                   + 'driver_pix_key_type, real_vehicle_text, executed_confirmed_at, updated_at';
    const AVULSO = 'payee_name, payee_document, payee_pix_key, payee_pix_key_type,';
    const montar = ({ comExecutor, comAvulso }) => {
      let q = supabase
        .from('booking_payouts')
        .select(`
          id, kind, amount, status, paid_at, notes, created_at,
          ${comAvulso ? AVULSO : ''}
          payee:payee_user_id ( id, full_name, phone, pix_key, pix_key_type,
                                document_type, document_number ),
          bookings ( booking_code, service_type, service_date, total_amount
                     ${comExecutor ? `, operational_assignments ( ${EXECUTOR} )` : ''} )
        `)
        .order('created_at', { ascending: false })
        .limit(500);
      if (status && status !== 'todos') q = q.eq('status', status);
      if (payee) q = q.eq('payee_user_id', payee);
      return q;
    };

    // Degrada em camadas: 082 (destinatário avulso) → 081 (executor) → básico.
    // Cada migration pendente tira uma informação da tela, nunca a tela. Errar
    // para o lado de mostrar menos é melhor que derrubar a única tela que diz
    // o que a plataforma deve.
    let { data, error } = await montar({ comExecutor: true, comAvulso: true });
    if (error) {
      console.warn('[admin] repasse completo indisponível (migration 081/082?):', error.message);
      ({ data, error } = await montar({ comExecutor: true, comAvulso: false }));
    }
    if (error) {
      ({ data, error } = await montar({ comExecutor: false, comAvulso: true }));
    }
    if (error) {
      ({ data, error } = await montar({ comExecutor: false, comAvulso: false }));
    }
    // Sem a 080 a tabela não existe: devolve vazio com um aviso, em vez de 500.
    if (error) {
      if (error.code === '42P01') {
        return res.json({ payouts: [], totais: [], aviso: 'Rode a migration 080_repasses_por_reserva.sql no Supabase.' });
      }
      throw error;
    }

    // Achata para UM executor por repasse — o despacho mais recente da reserva.
    for (const p of data || []) {
      const lista = p.bookings?.operational_assignments;
      if (Array.isArray(lista)) {
        p.executor = [...lista].sort((a, b) =>
          String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0] || null;
        delete p.bookings.operational_assignments;
      } else {
        p.executor = lista || null;
      }
    }

    // Total por destinatário — é assim que o repasse acontece: um PIX cobrindo
    // várias reservas, não um por reserva.
    //
    // Dois tipos de destinatário e um só agrupamento: o operador/operador,
    // que tem cadastro, e o motorista avulso que o operador mandou a campo
    // (082), identificado pelo nome. Cada linha carrega a CHAVE que vale para
    // ela — a do cadastro ou a copiada do despacho.
    const porQuem = new Map();
    for (const p of data || []) {
      const avulso = !p.payee?.id;
      const nome   = p.payee?.full_name || p.payee_name || null;
      // Chave do agrupamento: quem tem cadastro agrupa por id; sem cadastro,
      // por nome normalizado. Usar o nome cru juntaria "João" e "joão " em
      // grupos diferentes, e o admin faria dois PIX para a mesma pessoa.
      const chave = avulso
        ? (nome ? `nome:${nome.trim().toLowerCase()}` : 'sem-destinatario')
        : p.payee.id;

      if (!porQuem.has(chave)) {
        porQuem.set(chave, {
          chave,
          payee_id:     p.payee?.id || null,
          payee_name:   avulso ? (nome || null) : null,
          avulso,
          nome:         nome || '(sem destinatário)',
          phone:        p.payee?.phone || null,
          pix_key:      p.payee?.pix_key      || p.payee_pix_key      || null,
          pix_key_type: p.payee?.pix_key_type || p.payee_pix_key_type || null,
          documento:    p.payee?.document_number || p.payee_document  || null,
          itens: 0, total: 0,
        });
      }
      const t = porQuem.get(chave);
      t.itens += 1;
      t.total = Math.round((t.total + Number(p.amount)) * 100) / 100;
      // A chave pode faltar na primeira reserva e vir na seguinte — sem isto o
      // grupo inteiro apareceria como "sem chave PIX" por causa da mais antiga.
      if (!t.pix_key && p.payee_pix_key) {
        t.pix_key      = p.payee_pix_key;
        t.pix_key_type = p.payee_pix_key_type || null;
      }
      if (!t.documento && p.payee_document) t.documento = p.payee_document;
    }

    res.json({
      payouts: data || [],
      totais: [...porQuem.values()].sort((a, b) => b.total - a.total),
    });
  } catch (err) { next(err); }
});

// ── PUT /api/admin/payouts/:id ─────────────────────────
const payoutSchema = z.object({
  status: z.enum(['pending', 'paid', 'cancelled']),
  notes:  z.string().max(500).optional().nullable(),
  // O rateio por percentual é um ponto de partida. A diária combinada com o
  // motorista raramente é uma fração exata da reserva, e quem fecha o acerto é
  // o admin — por isso o valor é editável.
  amount: z.coerce.number().min(0).max(1_000_000).optional(),
});

router.put('/payouts/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = payoutSchema.parse(req.body);
    const patch = {
      status:     body.status,
      // Carimba quando vira pago e LIMPA ao voltar para pendente: sem isso um
      // repasse desmarcado ficaria com data de pagamento, e a conferência
      // mostraria "pago em tal dia" para algo que ninguém pagou.
      paid_at:    body.status === 'paid' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    // Só mexe nas observações quando vieram. Antes, qualquer PUT sem `notes` —
    // marcar pago, ajustar valor — apagava o que o admin tinha anotado ali.
    if (body.notes !== undefined) patch.notes = body.notes ?? null;

    // Mudar o valor de algo JÁ PAGO reescreveria o histórico: a tela passaria a
    // dizer que se pagou R$ X quando saiu R$ Y da conta. Só enquanto pendente.
    if (body.amount !== undefined) {
      const { data: atual } = await supabase
        .from('booking_payouts').select('status').eq('id', req.params.id).maybeSingle();
      if (atual && atual.status !== 'pending') {
        return res.status(400).json({
          error: 'Este repasse já foi baixado. Volte para "a pagar" antes de mudar o valor.',
        });
      }
      patch.amount = body.amount;
    }

    const { data, error } = await supabase
      .from('booking_payouts').update(patch).eq('id', req.params.id).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Repasse não encontrado' });
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── POST /api/admin/payouts/pay-all ────────────────────
// Marca TODOS os pendentes de um destinatário como pagos, de uma vez — é como
// o repasse acontece de verdade: um PIX cobrindo várias reservas.
//
// Aceita `payee_user_id` (operador/operador, que tem cadastro) OU
// `payee_name` (motorista avulso declarado no despacho, migration 082).
router.post('/payouts/pay-all', requireAdmin, async (req, res, next) => {
  try {
    const { payee_user_id, payee_name, notes } = req.body || {};
    const nome = (payee_name || '').trim();
    if (!payee_user_id && !nome) {
      return res.status(400).json({ error: 'Informe o operador ou o nome de quem recebe.' });
    }

    let q = supabase
      .from('booking_payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString(),
                notes: notes || null, updated_at: new Date().toISOString() })
      .eq('status', 'pending');    // só os pendentes: não reescreve histórico

    if (payee_user_id) {
      q = q.eq('payee_user_id', payee_user_id);
    } else {
      // `is('payee_user_id', null)` é essencial: sem ele, um cadastrado cujo
      // nome coincidisse com o do motorista teria os repasses dele baixados
      // junto. `ilike` sem curinga casa o nome inteiro, ignorando maiúsculas —
      // o mesmo critério do agrupamento da tela.
      q = q.is('payee_user_id', null).ilike('payee_name', nome);
    }

    const { data, error } = await q.select('id, amount');
    if (error) throw error;

    const total = (data || []).reduce((s, r) => s + Number(r.amount), 0);
    res.json({ marcados: data?.length || 0, total: Math.round(total * 100) / 100 });
  } catch (err) { next(err); }
});

// =============================================================================
// MODAIS OPERADOS POR OPERADOR (migrations 075/076)
// O corte grosso do roteamento: em vez de ligar veículo a veículo, o admin diz
// que o operador opera terrestre, aéreo, aquático… Opt-out como o de
// veículo: sem linha = opera. O filtro por veículo continua valendo por cima,
// para o ajuste fino dentro do mesmo modal.
// =============================================================================

// ── GET /api/admin/operators/:operatorId/modals ────────
router.get('/operators/:operatorId/modals', requireAdmin, async (req, res, next) => {
  try {
    const { operatorId } = req.params;

    const { data: operator, error: opErr } = await supabase
      .from('users').select('id').eq('id', operatorId)
      .eq('user_type', 'operator').maybeSingle();
    if (opErr) throw opErr;
    if (!operator) return res.status(404).json({ error: 'Operador não encontrada' });

    const { data: modais, error: mErr } = await supabase
      .from('service_modals')
      .select('id, slug, name, description')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    // Sem a 075 aplicada a tabela não existe: devolve lista vazia e a tela
    // some, em vez de quebrar o cadastro inteiro do operador.
    if (mErr) {
      console.warn('[admin] service_modals indisponível (migration 075):', mErr.message);
      return res.json([]);
    }

    const { data: prefs, error: pErr } = await supabase
      .from('operator_service_preferences')
      .select('entity_id, is_active')
      .eq('operator_id', operatorId)
      .eq('entity_type', 'modal');
    if (pErr) throw pErr;
    const porId = new Map((prefs || []).map((p) => [p.entity_id, p]));

    // Quantos veículos existem em cada modal — ajuda a entender o peso da
    // escolha antes de desmarcar.
    const { data: veics } = await supabase
      .from('vehicles').select('modal').eq('is_active', true);
    const porModal = new Map();
    for (const v of veics || []) porModal.set(v.modal, (porModal.get(v.modal) || 0) + 1);

    // `accepts_combos` viaja junto: a tela mostra os meios operados e o perfil
    // de combo no mesmo bloco, que é como a decisão é tomada.
    const { data: perfil } = await supabase
      .from('users').select('accepts_combos').eq('id', operatorId).maybeSingle();

    res.set('X-Accepts-Combos', String(perfil?.accepts_combos !== false));
    res.json((modais || []).map((m) => ({
      modal_id:      m.id,
      accepts_combos: perfil?.accepts_combos !== false,
      slug:          m.slug,
      name:          m.name,
      description:   m.description,
      vehicle_count: porModal.get(m.slug) || 0,
      // Opt-out: sem linha explícita, opera.
      is_active:     porId.has(m.id) ? porId.get(m.id).is_active !== false : true,
    })));
  } catch (err) { next(err); }
});

// ── PUT /api/admin/operators/:operatorId/combos ────────
// Perfil do operador quanto a COMBO (migration 077): o pedido com veículos
// de modais diferentes vai INTEIRO para um operador só — a universal.
// Sem isso o combo exigiria dois operadores, e aí o motor de pernas e o
// split entre 2+ contas, que segue bloqueado em payments.js.
const operatorComboSchema = z.object({ accepts_combos: z.boolean() });

router.put('/operators/:operatorId/combos', requireAdmin, async (req, res, next) => {
  try {
    const { operatorId } = req.params;
    const body = operatorComboSchema.parse(req.body);

    const { data, error } = await supabase
      .from('users')
      .update({ accepts_combos: body.accepts_combos })
      .eq('id', operatorId)
      .eq('user_type', 'operator')
      .select('id, accepts_combos')
      .maybeSingle();
    if (error) {
      if (error.code === '42703') {
        return res.status(400).json({
          error: 'O banco ainda não tem o campo de combo. '
               + 'Rode a migration 077_operador_universal.sql no Supabase.',
        });
      }
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Operador não encontrada' });
    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── PUT /api/admin/operators/:operatorId/modals/:modalId ──
const operatorModalPrefSchema = z.object({ is_active: z.boolean() });

router.put('/operators/:operatorId/modals/:modalId', requireAdmin, async (req, res, next) => {
  try {
    const { operatorId, modalId } = req.params;
    const body = operatorModalPrefSchema.parse(req.body);

    const { data: operator, error: opErr } = await supabase
      .from('users').select('id').eq('id', operatorId)
      .eq('user_type', 'operator').maybeSingle();
    if (opErr) throw opErr;
    if (!operator) return res.status(404).json({ error: 'Operador não encontrada' });

    const { data: modal, error: mErr } = await supabase
      .from('service_modals').select('id').eq('id', modalId).maybeSingle();
    if (mErr) throw mErr;
    if (!modal) return res.status(404).json({ error: 'Modal não encontrado' });

    const { data, error } = await supabase
      .from('operator_service_preferences')
      .upsert(
        {
          operator_id: operatorId,
          entity_type: 'modal',
          entity_id:   modalId,
          is_active:   body.is_active,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: 'operator_id,entity_type,entity_id' },
      )
      .select()
      .single();
    if (error) {
      // O CHECK da 006 só aceitava tour|vehicle|transfer até a 076.
      if (error.code === '23514') {
        return res.status(400).json({
          error: 'O banco ainda não aceita preferência por modal. '
               + 'Rode a migration 076_operador_por_modal.sql no Supabase.',
        });
      }
      throw error;
    }

    res.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: err.errors });
    }
    next(err);
  }
});

// ── PUT /api/admin/operators/:operatorId/vehicles/:vehicleId ──
const operatorVehiclePrefSchema = z.object({
  is_active: z.boolean(),
  notes:     z.string().max(500).optional().nullable(),
});

router.put('/operators/:operatorId/vehicles/:vehicleId', requireAdmin, async (req, res, next) => {
  try {
    const { operatorId, vehicleId } = req.params;
    const body = operatorVehiclePrefSchema.parse(req.body);

    const { data: operator, error: opErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', operatorId)
      .eq('user_type', 'operator')
      .maybeSingle();
    if (opErr) throw opErr;
    if (!operator) return res.status(404).json({ error: 'Operador não encontrada' });

    const { data: vehicle, error: vErr } = await supabase
      .from('vehicles')
      .select('id')
      .eq('id', vehicleId)
      .maybeSingle();
    if (vErr) throw vErr;
    if (!vehicle) return res.status(404).json({ error: 'Veículo não encontrado' });

    const { data, error } = await supabase
      .from('operator_service_preferences')
      .upsert(
        {
          operator_id: operatorId,
          entity_type: 'vehicle',
          entity_id:   vehicleId,
          is_active:   body.is_active,
          notes:       body.notes ?? null,
          updated_at:  new Date().toISOString(),
        },
        { onConflict: 'operator_id,entity_type,entity_id' },
      )
      .select()
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

    // Lançamentos antigos podem ter effective_date NULL — nesse caso vale
    // a data de criação (senão o gráfico ignora a linha e fica "Sem dados").
    // Bruto E líquido, os dois do razão. O líquido vinha sendo calculado na
    // TELA como `bruto * 0,93` — 7% chutados, enquanto a comissão real é
    // configurável por operador e a taxa do gateway varia por meio de
    // pagamento. `booking_net` já é o valor certo, gravado no fechamento.
    const { data, error } = await supabase
      .from('financial_ledger')
      .select('amount, entry_type, effective_date, created_at')
      .in('entry_type', ['booking_gross', 'booking_net'])
      .eq('direction', 'inflow')
      .or(`effective_date.gte.${since},and(effective_date.is.null,created_at.gte.${since})`)
      .order('created_at');

    if (error) throw error;

    // Agrupa por dia
    const byDay = {};
    for (const row of data || []) {
      const d = (row.effective_date || row.created_at || '').slice(0, 10);
      if (!d) continue;
      if (!byDay[d]) byDay[d] = { total: 0, net: null };
      if (row.entry_type === 'booking_gross') byDay[d].total += Number(row.amount);
      else byDay[d].net = (byDay[d].net || 0) + Number(row.amount);
    }

    const series = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, total: v.total, net: v.net }));

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
