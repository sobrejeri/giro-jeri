// /api/company/team — a EMPRESA gerencia a própria equipe de operadores.
//
//   GET    /team                 lista (ativos e bloqueados; removidos à parte)
//   POST   /team                 cria um operador JÁ vinculado à empresa
//   PATCH  /team/:id             edita dados / bloqueia / desbloqueia
//   POST   /team/:id/password    define nova senha de acesso
//   DELETE /team/:id             remove da equipe, PRESERVANDO o histórico
//
// Regra de ouro: a empresa só enxerga e só altera operador cujo company_id é o
// dela — conferido NO SERVIDOR em toda rota (`operadorDaEquipe`). Nunca aceitar
// company_id vindo do cliente.
//
// O que a empresa NÃO faz aqui: mudar tipo de usuário, percentual da
// plataforma, segmento ou conta de recebimento do operador (quem recebe é a
// empresa; o resto é do admin).

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { colunaFaltante } from '../lib/colunaFaltante.js';
import { semVinculoNoBanco, MSG_MIGRACAO_EMPRESA } from '../lib/vinculoEmpresa.js';
import { lerPercentual } from '../services/comissaoVendedor.js';
import { materializarComissoes } from './companySellerPayouts.js';

const router = Router();

const CAMPOS = 'id, full_name, email, phone, document_type, document_number, is_active, created_at';
const OPCIONAIS = ['region_ids', 'company_removed_at', 'company_commission_pct'];   // migrações 106, 130 e 133
const MSG_133 = 'O percentual do operador ainda não foi ativado no banco (migração 133). Avise a Turiva.';

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

// Lê com as colunas opcionais e, se alguma ainda não existe, refaz sem ela.
async function lerEquipe(montar) {
  let extras = [...OPCIONAIS];
  for (;;) {
    const { data, error } = await montar([CAMPOS, ...extras].join(', '));
    if (!error) return { data, extras };
    const falta = colunaFaltante(error);
    if (falta && extras.includes(falta)) { extras = extras.filter((c) => c !== falta); continue; }
    return { error };
  }
}

// O operador é desta empresa? Devolve a linha, ou null.
async function operadorDaEquipe(companyId, operatorId) {
  if (!z.string().uuid().safeParse(operatorId).success) return { op: null };
  const r = await lerEquipe((cols) => supabase.from('users').select(cols)
    .eq('id', operatorId).eq('company_id', companyId).eq('user_type', 'operator').maybeSingle());
  if (r.error) return { error: r.error };
  return { op: r.data || null };
}

const publico = (u) => ({
  id: u.id, full_name: u.full_name, email: u.email, phone: u.phone,
  document_type: u.document_type, document_number: u.document_number,
  is_active: u.is_active === true, created_at: u.created_at,
  region_ids: u.region_ids || [],
  removed_at: u.company_removed_at || null,
  commission_pct: u.company_commission_pct == null ? null : Number(u.company_commission_pct),
});

function falhou(res, next, error) {
  if (semVinculoNoBanco(error)) return res.status(409).json({ error: MSG_MIGRACAO_EMPRESA });
  return next(error);
}

const auditar = (req, entityId, action, valores) => supabase.from('audit_logs').insert({
  user_id: req.actorId || req.user.id, entity_type: 'users', entity_id: entityId,
  action_type: action, new_values_json: { por_empresa: true, company_id: req.user.id, ...(req.actorId ? { por_admin: true } : {}), ...valores },
}).then(() => {}, () => {});

// ── GET /team ────────────────────────────────────────────────────────────────
router.get('/team', async (req, res, next) => {
  try {
    const r = await lerEquipe((cols) => supabase.from('users').select(cols)
      .eq('company_id', req.user.id).eq('user_type', 'operator')
      .order('full_name', { ascending: true }).limit(500));
    res.set('Cache-Control', 'no-store');
    if (r.error) {
      // Migração 129 pendente: ainda não existe equipe.
      if (semVinculoNoBanco(r.error)) return res.json({ team: [], removed: [], pendente: true });
      throw r.error;
    }
    const todos = (r.data || []).map(publico);
    res.json({
      team:    todos.filter((u) => !u.removed_at),
      removed: todos.filter((u) => u.removed_at),
    });
  } catch (err) { next(err); }
});

// ── POST /team ───────────────────────────────────────────────────────────────
const criarSchema = z.object({
  full_name:  z.string().trim().min(2).max(200),
  email:      z.string().trim().email().max(200),
  phone:      z.string().trim().min(10).max(30).optional().nullable(),
  document:   z.string().trim().min(11).max(18),
  password:   z.string().min(6).max(72),
  region_ids: z.array(z.string().uuid()).max(50).optional(),
  commission_pct: z.union([z.number(), z.null()]).optional(),
}).strict();

router.post('/team', async (req, res, next) => {
  try {
    const parsed = criarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Confira os dados do operador.', details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) });
    const body = parsed.data;

    // Operador entra pelo DOCUMENTO (CPF ou CNPJ) — mesma regra do admin.
    const digits = soDigitos(body.document);
    const tipo = digits.length === 11 ? 'cpf' : digits.length === 14 ? 'cnpj' : null;
    if (!tipo) return res.status(400).json({ error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).' });
    const { validateBrDoc } = await import('../lib/document.js');
    const docErr = validateBrDoc(tipo, digits);
    if (docErr) return res.status(400).json({ error: docErr });

    const { data: jaExiste } = await supabase.from('users').select('id').eq('document_number', digits).maybeSingle();
    if (jaExiste) return res.status(409).json({ error: 'Já existe uma conta com este CPF/CNPJ. Peça à Turiva para vincular o operador à sua empresa.' });

    const lido = lerPercentual(body.commission_pct);
    if (lido.erro) return res.status(400).json({ error: lido.erro });
    const pctNovo = lido.pct;
    if (pctNovo != null) {   // coluna do percentual existe? (migração 133)
      const s133 = await supabase.from('users').select('company_commission_pct').eq('id', req.user.id).maybeSingle();
      if (s133.error) return res.status(409).json({ error: MSG_133 });
    }

    // A coluna do vínculo existe? Conferir ANTES de criar o login evita deixar
    // uma conta de acesso órfã quando a migração 129 ainda não rodou.
    const sonda = await supabase.from('users').select('company_id').eq('id', req.user.id).maybeSingle();
    if (sonda.error) return falhou(res, next, sonda.error);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: `${digits}@op.girojeri.app`, password: body.password, email_confirm: true,
    });
    if (authError) {
      const dup = /already|exist|registered|duplicate/i.test(authError.message || '');
      return res.status(dup ? 409 : 400).json({ error: dup ? 'Já existe um acesso com este CPF/CNPJ.' : authError.message });
    }

    const linha = {
      ...(pctNovo != null ? { company_commission_pct: pctNovo, company_commission_since: new Date().toISOString() } : {}),
      auth_id: authData.user.id, full_name: body.full_name, email: body.email.toLowerCase(),
      phone: body.phone || null, user_type: 'operator',
      document_number: digits, document_type: tipo,
      company_id: req.user.id,                    // sempre a empresa LOGADA
      ...(body.region_ids ? { region_ids: body.region_ids } : {}),
    };
    let ins = await supabase.from('users').insert(linha).select('id').single();
    if (ins.error && colunaFaltante(ins.error) === 'region_ids') {
      const { region_ids, ...sem } = linha; // eslint-disable-line no-unused-vars
      ins = await supabase.from('users').insert(sem).select('id').single();
    }
    if (ins.error) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      if (semVinculoNoBanco(ins.error)) return res.status(409).json({ error: MSG_MIGRACAO_EMPRESA });
      return res.status(400).json({ error: 'Não foi possível criar o operador.' });
    }

    await auditar(req, ins.data.id, 'create', { user_type: 'operator', company_id: req.user.id });
    const { op } = await operadorDaEquipe(req.user.id, ins.data.id);
    res.status(201).json(op ? publico(op) : { id: ins.data.id });
  } catch (err) { next(err); }
});

// ── PATCH /team/:id ──────────────────────────────────────────────────────────
const editarSchema = z.object({
  full_name:  z.string().trim().min(2).max(200),
  email:      z.string().trim().email().max(200),
  phone:      z.string().trim().min(10).max(30).nullable(),
  region_ids: z.array(z.string().uuid()).max(50),
  is_active:  z.boolean(),
  commission_pct: z.union([z.number(), z.null()]),
}).partial().strict().refine((v) => Object.keys(v).length > 0, { message: 'Nada para alterar.' });

router.patch('/team/:id', async (req, res, next) => {
  try {
    const parsed = editarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Confira os dados do operador.', details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) });
    const { op, error } = await operadorDaEquipe(req.user.id, req.params.id);
    if (error) return falhou(res, next, error);
    if (!op) return res.status(404).json({ error: 'Operador não encontrado na sua equipe.' });
    if (op.company_removed_at) return res.status(409).json({ error: 'Este operador foi removido da equipe.' });

    const { commission_pct, ...mudancas } = parsed.data;
    if (mudancas.email) mudancas.email = mudancas.email.toLowerCase();
    // Percentual do operador sobre as vendas (133). Só mexe se MUDOU: o novo
    // vale para as reservas criadas daqui em diante, e as que já eram devidas
    // no percentual antigo são lançadas antes da troca.
    if (commission_pct !== undefined) {
      const lido = lerPercentual(commission_pct);
      if (lido.erro) return res.status(400).json({ error: lido.erro });
      if (!('company_commission_pct' in op)) return res.status(409).json({ error: MSG_133 });
      const atual = op.company_commission_pct == null ? null : Number(op.company_commission_pct);
      if (lido.pct !== atual) {
        await materializarComissoes(req.user.id);
        mudancas.company_commission_pct = lido.pct;
        mudancas.company_commission_since = new Date().toISOString();
      }
    }
    if (Object.keys(mudancas).length === 0) return res.json(publico(op));
    let upd = await supabase.from('users').update({ ...mudancas, updated_at: new Date().toISOString() })
      .eq('id', op.id).eq('company_id', req.user.id).select('id').maybeSingle();
    if (upd.error && colunaFaltante(upd.error) === 'region_ids') {
      return res.status(409).json({ error: 'Os municípios de atuação ainda não estão disponíveis. Avise a Turiva.' });
    }
    if (upd.error) throw upd.error;
    if (!upd.data) return res.status(404).json({ error: 'Operador não encontrado na sua equipe.' });

    await auditar(req, op.id, 'update', { campos: Object.keys(parsed.data), ...('is_active' in parsed.data ? { is_active: parsed.data.is_active } : {}), ...('company_commission_pct' in mudancas ? { commission_pct: mudancas.company_commission_pct } : {}) });
    const depois = await operadorDaEquipe(req.user.id, op.id);
    res.json(publico(depois.op || { ...op, ...mudancas }));
  } catch (err) { next(err); }
});

// ── POST /team/:id/password ──────────────────────────────────────────────────
router.post('/team/:id/password', async (req, res, next) => {
  try {
    const parsed = z.object({ new_password: z.string().min(6).max(72) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    const { op, error } = await operadorDaEquipe(req.user.id, req.params.id);
    if (error) return falhou(res, next, error);
    if (!op || op.company_removed_at) return res.status(404).json({ error: 'Operador não encontrado na sua equipe.' });

    const { data: alvo } = await supabase.from('users').select('auth_id').eq('id', op.id).maybeSingle();
    if (!alvo?.auth_id) return res.status(409).json({ error: 'Este operador está sem acesso cadastrado. Avise a Turiva.' });
    const { error: authErr } = await supabase.auth.admin.updateUserById(alvo.auth_id, { password: parsed.data.new_password });
    if (authErr) return res.status(400).json({ error: 'Não foi possível trocar a senha. Avise a Turiva.' });

    await auditar(req, op.id, 'update', { password_reset: true });   // nunca a senha
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── DELETE /team/:id ─────────────────────────────────────────────────────────
// Remover NÃO apaga: bloqueia o acesso e marca como removido. Reservas,
// comissões e repasses que o operador originou continuam no histórico.
router.delete('/team/:id', async (req, res, next) => {
  try {
    const { op, error } = await operadorDaEquipe(req.user.id, req.params.id);
    if (error) return falhou(res, next, error);
    if (!op) return res.status(404).json({ error: 'Operador não encontrado na sua equipe.' });
    if (op.company_removed_at) return res.json({ ok: true, removed_at: op.company_removed_at });

    const agora = new Date().toISOString();
    const upd = await supabase.from('users')
      .update({ is_active: false, company_removed_at: agora, updated_at: agora })
      .eq('id', op.id).eq('company_id', req.user.id).select('id').maybeSingle();
    if (upd.error) {
      if (colunaFaltante(upd.error) === 'company_removed_at') {
        return res.status(409).json({ error: 'A remoção ainda não foi ativada no banco (migração 130). Por enquanto, bloqueie o operador.' });
      }
      throw upd.error;
    }
    if (!upd.data) return res.status(404).json({ error: 'Operador não encontrado na sua equipe.' });

    await auditar(req, op.id, 'update', { removed_from_company: true });
    res.json({ ok: true, removed_at: agora });
  } catch (err) { next(err); }
});

export default router;
