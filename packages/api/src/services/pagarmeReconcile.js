// ── pagarmeReconcile.js — Conciliação da taxa REAL da Pagar.me ──────────────
//
// A taxa real da Pagar.me (MDR + antecipação) não vem na hora do pagamento: só
// existe nos recebíveis (payables), gerados após a liquidação. Esta rotina lê
// os payables de cada pagamento aprovado e, quando acha uma taxa real plausível
// diferente da registrada, corrige o razão (gateway_fee + booking_net).
//
// Segurança: DRY-RUN por padrão (só relata). Pagamentos de GRUPO (vários
// gateway_fee por pagamento) não são ajustados automaticamente — ficam listados
// à parte. Usada pelo endpoint admin e pelo scheduler diário.

import { supabase } from '../supabase.js';
import dayjs from 'dayjs';

const round2 = (v) => Math.round(v * 100) / 100;

export async function reconcilePagarmeFees({ days = 30, apply = false } = {}) {
  const since = dayjs().subtract(days, 'day').toISOString();

  const { data: cfgRows = [] } = await supabase
    .from('system_settings').select('setting_key, setting_value').like('setting_key', 'payment_%');
  const cfg = Object.fromEntries(cfgRows.map((s) => [s.setting_key, s.setting_value]));
  const { chaveDoPagarme } = await import('../routes/payments.js');
  const apiKey = chaveDoPagarme(cfg);
  if (!apiKey) {
    return { error: 'sem_api_key', dry_run: !apply, periodo_dias: days,
      pagamentos_analisados: 0, divergencias: 0, atualizados: 0, ajuste_total_taxa: null,
      itens: [], grupos_ignorados: [] };
  }

  const { data: pays = [] } = await supabase
    .from('payments')
    .select('id, booking_id, amount_gross, gateway_transaction_id')
    .eq('gateway_name', 'pagarme')
    .eq('status', 'approved')
    .eq('ledger_created', true)
    .gte('created_at', since)
    .limit(500);

  const { somarTaxaPayables } = await import('../payments/pagarmeCheckout.js');
  const itens = [];
  const grupos_ignorados = [];
  let atualizados = 0, ajusteTotal = 0;

  for (const p of pays) {
    if (!p.gateway_transaction_id) continue;
    const real = await somarTaxaPayables(apiKey, p.gateway_transaction_id);
    if (!real || !(real.fee > 0)) continue;
    const bruto = Number(p.amount_gross) || 0;
    if (!(real.fee < bruto)) continue; // plausibilidade: taxa < bruto

    const { data: feeRows = [] } = await supabase
      .from('financial_ledger')
      .select('id, amount')
      .eq('payment_id', p.id).eq('entry_type', 'gateway_fee');
    const atual = (feeRows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const nova  = round2(real.fee);
    if (Math.abs(nova - atual) < 0.01) continue; // já bate

    const item = { payment_id: p.id, booking_id: p.booking_id, taxa_atual: round2(atual), taxa_real: nova, diferenca: round2(nova - atual), payables: real.payables };
    if ((feeRows || []).length !== 1) { grupos_ignorados.push(item); continue; } // grupo: manual
    itens.push(item);

    if (apply) {
      await supabase.from('financial_ledger').update({ amount: nova }).eq('id', feeRows[0].id);
      await supabase.from('financial_ledger').update({ amount: round2(bruto - nova) }).eq('payment_id', p.id).eq('entry_type', 'booking_net');
      await supabase.from('payments').update({ gateway_fee_amount: nova, gateway_fee_pct: bruto > 0 ? Math.round((nova / bruto) * 10000) / 10000 : null }).eq('id', p.id);
      atualizados += 1; ajusteTotal = round2(ajusteTotal + (nova - atual));
    }
  }

  return {
    dry_run: !apply, periodo_dias: days,
    pagamentos_analisados: pays.length,
    divergencias: itens.length,
    atualizados: apply ? atualizados : 0,
    ajuste_total_taxa: apply ? ajusteTotal : null,
    itens, grupos_ignorados,
  };
}
