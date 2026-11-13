// /api/operator/external-bookings — vendas feitas FORA da plataforma.
//
// O operador registra o que vendeu por fora para a empresa enxergar o
// desempenho completo da equipe. É só registro: não cobra, não gera comissão
// nem repasse (tabela própria, migração 131).
//
//   GET   /external-bookings        as minhas (mais recentes primeiro)
//   POST  /external-bookings        registra
//   PATCH /external-bookings/:id    corrige ou cancela (só as minhas)

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { empresaDoOperador } from '../lib/vinculoEmpresa.js';

const router = Router();

export const CAMPOS_EXTERNA = 'id, operator_id, customer_name, customer_phone, service_type, service_description, service_date, service_time, people_count, total_amount, executor_name, notes, status, created_at';

// 42P01 / PGRST205 = tabela ainda não criada (migração 131 pendente).
export const semTabelaExterna = (error) => !!error && (
  error.code === '42P01' || error.code === 'PGRST205' || /external_bookings/.test(String(error.message || '')) && /does not exist|schema cache/i.test(String(error.message || '')));
const MSG_PENDENTE = 'O registro de vendas externas ainda não foi ativado. Avise a Turiva.';

const texto = (max) => z.string().trim().max(max);
const base = {
  customer_name:       texto(200).min(2),
  customer_phone:      texto(30).nullable().optional(),
  service_type:        z.enum(['tour', 'transfer', 'other']),
  service_description: texto(300).min(2),
  service_date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  service_time:        z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Horário inválido').nullable().optional(),
  people_count:        z.number().int().min(1).max(500),
  total_amount:        z.number().min(0).max(1_000_000),
  executor_name:       texto(200).nullable().optional(),
  notes:               texto(1000).nullable().optional(),
};
const criarSchema  = z.object(base).strict();
const editarSchema = z.object({ ...base, status: z.enum(['active', 'cancelled']) }).partial().strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para alterar.' });

const limpar = (v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x]));
const invalido = (res, parsed) => res.status(400).json({
  error: 'Confira os dados da venda.', details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) });

router.get('/external-bookings', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('external_bookings').select(CAMPOS_EXTERNA)
      .eq('operator_id', req.user.id)
      .order('service_date', { ascending: false }).order('created_at', { ascending: false }).limit(200);
    res.set('Cache-Control', 'no-store');
    if (semTabelaExterna(error)) return res.json({ rows: [], pendente: true });
    if (error) throw error;
    res.json({ rows: data || [] });
  } catch (err) { next(err); }
});

router.post('/external-bookings', async (req, res, next) => {
  try {
    const parsed = criarSchema.safeParse(req.body);
    if (!parsed.success) return invalido(res, parsed);
    // Empresa da venda = vínculo do operador AGORA, lido no servidor.
    const company_id = await empresaDoOperador(req.user.id);
    const { data, error } = await supabase.from('external_bookings')
      .insert({ ...limpar(parsed.data), operator_id: req.user.id, company_id })
      .select(CAMPOS_EXTERNA).single();
    if (semTabelaExterna(error)) return res.status(409).json({ error: MSG_PENDENTE });
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.patch('/external-bookings/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Venda não encontrada.' });
    const parsed = editarSchema.safeParse(req.body);
    if (!parsed.success) return invalido(res, parsed);
    const { data, error } = await supabase.from('external_bookings')
      .update({ ...limpar(parsed.data), updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('operator_id', req.user.id)     // só as MINHAS
      .select(CAMPOS_EXTERNA).maybeSingle();
    if (semTabelaExterna(error)) return res.status(409).json({ error: MSG_PENDENTE });
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Venda não encontrada.' });
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
