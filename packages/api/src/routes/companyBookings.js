// GET /api/company/bookings — reservas e desempenho da EQUIPE da empresa.
//
// Junta as reservas da plataforma dos operadores vinculados (inclusive os
// removidos — o histórico é da empresa) com as vendas externas que eles
// registraram. Somente leitura. As regras de soma estão em
// services/desempenhoEquipe.js.

import { Router } from 'express';
import { supabase } from '../supabase.js';
import { semVinculoNoBanco } from '../lib/vinculoEmpresa.js';
import { colunaFaltante } from '../lib/colunaFaltante.js';
import { montarDesempenho } from '../services/desempenhoEquipe.js';
import { CAMPOS_EXTERNA, semTabelaExterna } from './externalBookings.js';

const router = Router();
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Período padrão: o mês corrente (no fuso de Fortaleza).
function periodoPadrao() {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
  const [y, m] = hoje.split('-').map(Number);
  const fim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${hoje.slice(0, 8)}01`, to: `${hoje.slice(0, 8)}${String(fim).padStart(2, '0')}` };
}

async function nomesDosServicos(reservas) {
  const ids = (tipo) => [...new Set(reservas.filter((b) => (b.service_type === 'tour') === tipo && b.service_id).map((b) => b.service_id))];
  const nomes = new Map();
  const [tours, rotas] = await Promise.all([
    ids(true).length ? supabase.from('tours').select('id, name').in('id', ids(true)) : { data: [] },
    ids(false).length ? supabase.from('transfer_routes').select('id, origin_name, destination_name').in('id', ids(false)) : { data: [] },
  ]);
  for (const t of tours.data || []) nomes.set(t.id, t.name);
  for (const r of rotas.data || []) nomes.set(r.id, `${r.origin_name} → ${r.destination_name}`);
  return reservas.map((b) => ({
    ...b,
    service_name: nomes.get(b.service_id)
      || (b.service_type !== 'tour' ? [b.origin_text, b.destination_text].filter(Boolean).join(' → ') || null : null),
  }));
}

router.get('/bookings', async (req, res, next) => {
  try {
    const padrao = periodoPadrao();
    const from = DATA.test(String(req.query.from || '')) ? req.query.from : padrao.from;
    const to   = DATA.test(String(req.query.to || ''))   ? req.query.to   : padrao.to;
    res.set('Cache-Control', 'no-store');
    const vazio = { from, to, ...montarDesempenho({ companyId: req.user.id }) };

    // 1) A equipe (com os removidos). company_removed_at é da 130 — tolerante.
    let eq = await supabase.from('users').select('id, full_name, is_active, company_removed_at')
      .eq('company_id', req.user.id).eq('user_type', 'operator').limit(500);
    if (eq.error && colunaFaltante(eq.error) === 'company_removed_at') {
      eq = await supabase.from('users').select('id, full_name, is_active')
        .eq('company_id', req.user.id).eq('user_type', 'operator').limit(500);
    }
    if (semVinculoNoBanco(eq.error)) return res.json({ ...vazio, pendente: true });
    if (eq.error) throw eq.error;
    const equipe = (eq.data || []).map((u) => ({ id: u.id, full_name: u.full_name, is_active: u.is_active, removed_at: u.company_removed_at || null }));
    const ids = equipe.map((u) => u.id);
    if (!ids.length) return res.json(vazio);

    // 2) Reservas da plataforma desses operadores, pela data do serviço.
    const { data: reservas, error: rErr } = await supabase.from('bookings')
      .select(`id, booking_code, operator_id, service_type, service_id, service_date, service_time,
               people_count, total_amount, status_commercial, status_operational, origin_text, destination_text,
               operational_assignments ( driver_name ),
               booking_payouts ( kind, amount, status, payee_user_id )`)
      .in('operator_id', ids)
      .gte('service_date', from).lte('service_date', to)
      .order('service_date', { ascending: false }).limit(1000);
    if (rErr) throw rErr;

    // 3) Vendas externas registradas para ESTA empresa (migração 131).
    const ext = await supabase.from('external_bookings').select(CAMPOS_EXTERNA)
      .eq('company_id', req.user.id)
      .gte('service_date', from).lte('service_date', to).limit(1000);
    if (ext.error && !semTabelaExterna(ext.error)) throw ext.error;

    res.json({
      from, to,
      ...montarDesempenho({
        reservas: await nomesDosServicos(reservas || []),
        externas: ext.data || [], equipe, companyId: req.user.id,
      }),
    });
  } catch (err) { next(err); }
});

export default router;
