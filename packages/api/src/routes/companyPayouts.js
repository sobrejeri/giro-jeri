// /api/company/executor-payouts — a EMPRESA acompanha os despachos da equipe e
// registra o que pagou a quem executou (motorista, guia, tripulação).
//
//   GET   /executor-payouts        despachos da equipe com executor informado
//   PATCH /executor-payouts/:id    define o valor, dá baixa, desfaz ou cancela
//
// O pagamento é feito POR FORA (PIX/dinheiro): aqui só fica o registro. Usa as
// mesmas colunas do despacho que o operador já usa em "Repasses aos motoristas"
// (operational_assignments.driver_payout_*, migração 066) — uma fonte só.

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { semVinculoNoBanco } from '../lib/vinculoEmpresa.js';
import { montarBaixa, somarRepasses, STATUS_REPASSE } from '../services/repasseExecutor.js';

const router = Router();
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COLUNA_AUSENTE = (e) => e?.code === '42703' || e?.code === 'PGRST204';

// Operadores da empresa (com os removidos: despacho antigo continua devido).
async function equipeDaEmpresa(companyId) {
  const { data, error } = await supabase.from('users').select('id, full_name')
    .eq('company_id', companyId).eq('user_type', 'operator').limit(500);
  if (error) return { error };
  return { equipe: data || [] };
}

router.get('/executor-payouts', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const vazio = { rows: [], totals: somarRepasses([]) };
    const { equipe, error: eqErr } = await equipeDaEmpresa(req.user.id);
    if (semVinculoNoBanco(eqErr)) return res.json({ ...vazio, pendente: true });
    if (eqErr) throw eqErr;
    const ids = equipe.map((u) => u.id);
    if (!ids.length) return res.json(vazio);
    const nomes = new Map(equipe.map((u) => [u.id, u.full_name]));

    const status = STATUS_REPASSE.includes(req.query.status) ? req.query.status : null;
    const from = DATA.test(String(req.query.from || '')) ? req.query.from : null;
    const to   = DATA.test(String(req.query.to || ''))   ? req.query.to   : null;

    let q = supabase.from('operational_assignments')
      .select(`id, booking_id, driver_name, driver_phone, driver_pix_key, driver_pix_key_type, real_vehicle_text,
               driver_payout_amount, driver_payout_status, driver_paid_at, driver_payout_notes, created_at,
               bookings!inner ( booking_code, service_type, service_date, service_time, total_amount,
                                status_commercial, status_operational, origin_text, destination_text, operator_id )`)
      .in('bookings.operator_id', ids)
      .not('driver_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (status) q = q.eq('driver_payout_status', status);
    if (from) q = q.gte('bookings.service_date', from);
    if (to)   q = q.lte('bookings.service_date', to);

    const { data, error } = await q;
    if (COLUNA_AUSENTE(error)) return res.json({ ...vazio, pendente: true });
    if (error) throw error;

    const rows = (data || []).map((a) => ({
      id: a.id, booking_id: a.booking_id,
      executor: a.driver_name, executor_phone: a.driver_phone || null,
      pix_key: a.driver_pix_key || null, pix_key_type: a.driver_pix_key_type || null,
      veiculo: a.real_vehicle_text || null,
      driver_payout_amount: a.driver_payout_amount, driver_payout_status: a.driver_payout_status,
      driver_paid_at: a.driver_paid_at, driver_payout_notes: a.driver_payout_notes,
      booking_code: a.bookings.booking_code, service_type: a.bookings.service_type,
      service_date: a.bookings.service_date, service_time: a.bookings.service_time,
      total_amount: a.bookings.total_amount,
      status_commercial: a.bookings.status_commercial, status_operational: a.bookings.status_operational,
      trajeto: [a.bookings.origin_text, a.bookings.destination_text].filter(Boolean).join(' → ') || null,
      operador_id: a.bookings.operator_id, operador: nomes.get(a.bookings.operator_id) || 'Operador',
    }));
    res.json({ rows, totals: somarRepasses(rows) });
  } catch (err) { next(err); }
});

router.patch('/executor-payouts/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Repasse não encontrado.' });
    const corpo = z.object({ amount: z.any(), status: z.any(), notes: z.any() }).partial().strict().safeParse(req.body || {});
    if (!corpo.success) return res.status(400).json({ error: 'Pedido inválido.' });

    const { equipe, error: eqErr } = await equipeDaEmpresa(req.user.id);
    if (semVinculoNoBanco(eqErr)) return res.status(404).json({ error: 'Repasse não encontrado.' });
    if (eqErr) throw eqErr;
    const ids = new Set(equipe.map((u) => u.id));

    // Dono + estado numa leitura: só despacho de reserva de operador DA EMPRESA.
    const { data: asg, error: aErr } = await supabase.from('operational_assignments')
      .select('id, driver_name, driver_payout_amount, bookings!inner ( operator_id, status_operational )')
      .eq('id', req.params.id).maybeSingle();
    if (COLUNA_AUSENTE(aErr)) return res.status(409).json({ error: 'Os repasses ainda não foram ativados. Avise a Turiva.' });
    if (aErr) throw aErr;
    if (!asg || !ids.has(asg.bookings?.operator_id) || !asg.driver_name) {
      return res.status(404).json({ error: 'Repasse não encontrado.' });
    }

    const r = montarBaixa(corpo.data, { status_operational: asg.bookings.status_operational, driver_payout_amount: asg.driver_payout_amount });
    if (r.erro) return res.status(r.http).json({ error: r.erro });

    const { data, error } = await supabase.from('operational_assignments')
      .update(r.patch).eq('id', asg.id)
      .select('id, driver_payout_amount, driver_payout_status, driver_paid_at, driver_payout_notes').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Repasse não encontrado.' });

    await supabase.from('audit_logs').insert({
      user_id: req.user.id, entity_type: 'operational_assignments', entity_id: asg.id, action_type: 'update',
      new_values_json: { por_empresa: true, repasse_executor: { amount: data.driver_payout_amount, status: data.driver_payout_status } },
    }).then(() => {}, () => {});
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
