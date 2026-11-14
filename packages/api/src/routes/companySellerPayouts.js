// /api/company/seller-payouts — o que a EMPRESA paga ao operador que VENDEU.
//
//   GET   /seller-payouts        comissões de venda da equipe
//   PATCH /seller-payouts/:id    ajusta o valor, dá baixa, desfaz ou cancela
//
// A linha nasce quando a reserva de um operador com percentual definido está
// paga (regras em services/comissaoVendedor.js). O lançamento é feito aqui, ao
// abrir a lista: é idempotente (UNIQUE em booking_id) e não mexe no caminho do
// pagamento do cliente. Devolve as linhas no MESMO formato dos repasses a quem
// executou, para a tela ser uma só.

import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabase.js';
import { semVinculoNoBanco } from '../lib/vinculoEmpresa.js';
import { comissoesALancar, pendentesARevogar } from '../services/comissaoVendedor.js';
import { montarBaixa, somarRepasses, STATUS_REPASSE } from '../services/repasseExecutor.js';

const router = Router();
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Migração 133 pendente: coluna do percentual ou tabela das comissões ausentes.
const semComissao = (e) => !!e && (
  ['42703', 'PGRST204', '42P01', 'PGRST205'].includes(e.code)
  && /company_commission|company_seller_payouts/.test(String(e.message || '')));

// Lança as comissões que faltam e revoga as de reserva cancelada/reembolsada.
// Devolve { pendente: true } quando a migração 133 (ou a 129) ainda não rodou.
export async function materializarComissoes(companyId) {
  const eq = await supabase.from('users')
    .select('id, full_name, company_commission_pct, company_commission_since')
    .eq('company_id', companyId).eq('user_type', 'operator').limit(500);
  if (semVinculoNoBanco(eq.error) || semComissao(eq.error)) return { pendente: true };
  if (eq.error) throw eq.error;
  const equipe = eq.data || [];
  const ids = equipe.map((u) => u.id);
  if (!ids.length) return { equipe };

  const ex = await supabase.from('company_seller_payouts')
    .select('id, booking_id, status, bookings ( status_commercial )')
    .eq('company_id', companyId).limit(5000);
  if (semComissao(ex.error)) return { pendente: true };
  if (ex.error) throw ex.error;

  const comRegra = equipe.filter((u) => Number(u.company_commission_pct) > 0 && u.company_commission_since);
  if (comRegra.length) {
    const desde = comRegra.map((u) => u.company_commission_since).sort()[0];
    const { data: reservas, error: rErr } = await supabase.from('bookings')
      .select('id, operator_id, total_amount, status_commercial, created_at')
      .in('operator_id', comRegra.map((u) => u.id))
      .eq('status_commercial', 'paid').gte('created_at', desde).limit(2000);
    if (rErr) throw rErr;
    const novas = comissoesALancar(reservas, equipe, new Set((ex.data || []).map((l) => l.booking_id)), companyId);
    if (novas.length) {
      const { error } = await supabase.from('company_seller_payouts')
        .upsert(novas, { onConflict: 'booking_id', ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  const revogar = pendentesARevogar(ex.data);
  if (revogar.length) {
    const { error } = await supabase.from('company_seller_payouts')
      .update({ status: 'cancelled', notes: 'Reserva cancelada ou reembolsada', updated_at: new Date().toISOString() })
      .in('id', revogar).eq('company_id', companyId).eq('status', 'pending');
    if (error) throw error;
  }
  return { equipe };
}

router.get('/seller-payouts', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const vazio = { rows: [], totals: somarRepasses([]) };
    const m = await materializarComissoes(req.user.id);
    if (m.pendente) return res.json({ ...vazio, pendente: true });
    const nomes = new Map((m.equipe || []).map((u) => [u.id, u.full_name]));
    const semPercentual = (m.equipe || []).length > 0 && !(m.equipe || []).some((u) => Number(u.company_commission_pct) > 0);

    const status = STATUS_REPASSE.includes(req.query.status) ? req.query.status : null;
    const from = DATA.test(String(req.query.from || '')) ? req.query.from : null;
    const to   = DATA.test(String(req.query.to || ''))   ? req.query.to   : null;
    let q = supabase.from('company_seller_payouts')
      .select(`id, operator_id, booking_id, base_amount, pct, amount, status, paid_at, notes, created_at,
               bookings!inner ( booking_code, service_type, service_date, service_time, status_commercial, status_operational )`)
      .eq('company_id', req.user.id)
      .order('created_at', { ascending: false }).limit(500);
    if (status) q = q.eq('status', status);
    if (from) q = q.gte('bookings.service_date', from);
    if (to)   q = q.lte('bookings.service_date', to);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map((l) => ({
      id: l.id, booking_id: l.booking_id,
      executor: nomes.get(l.operator_id) || 'Operador', executor_role: 'seller',
      executor_phone: null, pix_key: null, pix_key_type: null, veiculo: null, trajeto: null,
      driver_payout_amount: l.amount, driver_payout_status: l.status,
      driver_paid_at: l.paid_at, driver_payout_notes: l.notes,
      base_amount: l.base_amount, pct: l.pct,
      booking_code: l.bookings.booking_code, service_type: l.bookings.service_type,
      service_date: l.bookings.service_date, service_time: l.bookings.service_time,
      status_commercial: l.bookings.status_commercial, status_operational: l.bookings.status_operational,
      operador_id: l.operator_id, operador: nomes.get(l.operator_id) || 'Operador',
    }));
    res.json({ rows, totals: somarRepasses(rows), sem_percentual: semPercentual });
  } catch (err) { next(err); }
});

router.patch('/seller-payouts/:id', async (req, res, next) => {
  try {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: 'Comissão não encontrada.' });
    const corpo = z.object({ amount: z.any(), status: z.any(), notes: z.any() }).partial().strict().safeParse(req.body || {});
    if (!corpo.success) return res.status(400).json({ error: 'Pedido inválido.' });

    const { data: linha, error: lErr } = await supabase.from('company_seller_payouts')
      .select('id, amount, bookings!inner ( status_operational )')
      .eq('id', req.params.id).eq('company_id', req.user.id).maybeSingle();
    if (semComissao(lErr)) return res.status(409).json({ error: 'As comissões de venda ainda não foram ativadas. Avise a Turiva.' });
    if (lErr) throw lErr;
    if (!linha) return res.status(404).json({ error: 'Comissão não encontrada.' });

    // Mesmas regras da baixa de quem executou: só de serviço concluído e com valor.
    const r = montarBaixa(corpo.data, { status_operational: linha.bookings.status_operational, driver_payout_amount: linha.amount });
    if (r.erro) return res.status(r.http).json({ error: r.erro });
    const patch = { updated_at: r.patch.updated_at };
    if ('driver_payout_amount' in r.patch) patch.amount = r.patch.driver_payout_amount;
    if ('driver_payout_notes' in r.patch) patch.notes = r.patch.driver_payout_notes;
    if ('driver_payout_status' in r.patch) { patch.status = r.patch.driver_payout_status; patch.paid_at = r.patch.driver_paid_at; }

    const { data, error } = await supabase.from('company_seller_payouts').update(patch)
      .eq('id', linha.id).eq('company_id', req.user.id)
      .select('id, amount, status, paid_at, notes').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Comissão não encontrada.' });

    await supabase.from('audit_logs').insert({
      user_id: req.actorId || req.user.id, entity_type: 'company_seller_payouts', entity_id: linha.id, action_type: 'update',
      new_values_json: { por_empresa: true, company_id: req.user.id, ...(req.actorId ? { por_admin: true } : {}), amount: data.amount, status: data.status },
    }).then(() => {}, () => {});
    res.json({ id: data.id, driver_payout_amount: data.amount, driver_payout_status: data.status, driver_paid_at: data.paid_at, driver_payout_notes: data.notes });
  } catch (err) { next(err); }
});

export default router;
