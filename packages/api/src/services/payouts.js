// ── payouts.js ──────────────────────────────────────────
// Gera os repasses que a plataforma deve por reserva (migration 080), no modelo
// em que ela recebe 100% (079).
//
//   commission → quem ACEITOU a solicitação, pelo %% da categoria (modal)
//   execution  → quem EXECUTOU, quando o modal tem executor fixo e não é quem
//                aceitou. Recebe o RESTO, não um terceiro percentual — assim as
//                partes somam exatamente o valor da reserva.
//
// Idempotente por construção: `UNIQUE (booking_id, kind)` + upsert que ignora
// conflito. O webhook do Mercado Pago reentrega eventos, e sem isso a mesma
// comissão seria lançada duas vezes — dinheiro pago em dobro.

import { supabase } from '../supabase.js';

// Modal do serviço da reserva. Vem da CATEGORIA (mesma fonte do roteamento),
// não do veículo: o repasse é do serviço, e um serviço pode ter vários veículos.
async function modalDaReserva(booking) {
  try {
    if (booking?.service_type === 'transfer') {
      const { data } = await supabase
        .from('transfer_routes')
        .select('transfers ( modal )')
        .eq('id', booking.service_id)
        .maybeSingle();
      return data?.transfers?.modal || null;
    }
    const { data } = await supabase
      .from('tours')
      .select('categories ( modal )')
      .eq('id', booking?.service_id)
      .maybeSingle();
    return data?.categories?.modal || null;
  } catch (err) {
    console.error('[payouts] modal da reserva falhou:', err?.message);
    return null;
  }
}

// Reparte em centavos inteiros somando EXATAMENTE ao total. Sem isso as duas
// partes podem somar um centavo a mais ou a menos que o valor recebido, e a
// diferença aparece na conferência de caixa.
export function repartir(totalCents, pesos) {
  const n = pesos.length;
  if (n === 0) return [];
  let soma = pesos.reduce((a, b) => a + b, 0);
  let w = pesos;
  if (soma <= 0) { w = pesos.map(() => 1); soma = n; }
  const bruto = w.map((x) => (totalCents * x) / soma);
  const cents = bruto.map((x) => Math.floor(x));
  const resto = totalCents - cents.reduce((a, b) => a + b, 0);
  const ordem = bruto.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f);
  for (let k = 0; k < resto; k++) cents[ordem[k % n].i] += 1;
  return cents;
}

/**
 * Calcula os repasses de uma reserva paga. Função pura — testável sem banco.
 *
 * @param {number} total       valor recebido
 * @param {string} operador    quem aceitou
 * @param {object} modal       { executor_operator_id, acceptor_commission_pct, platform_commission_pct }
 * @param {number} pctPlataformaGeral  usado quando o modal não define o seu
 */
export function calcularRepasses(total, operador, modal, pctPlataformaGeral = 0) {
  const cents = Math.round(Number(total || 0) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return [];

  const executor = modal?.executor_operator_id || null;
  const pctPlat = modal?.platform_commission_pct != null
    ? Number(modal.platform_commission_pct)
    : Number(pctPlataformaGeral) || 0;

  // Sem executor fixo: quem aceitou executa. A comissão dele é tudo menos a
  // parte da plataforma — não o percentual de comissão, que só faz sentido
  // quando ele é intermediário.
  if (!executor || executor === operador) {
    const [, doOperador] = repartir(cents, [pctPlat, 100 - pctPlat]);
    return doOperador > 0 && operador
      ? [{ kind: 'commission', payee_user_id: operador, amount: doOperador / 100 }]
      : [];
  }

  // Executor fixo e quem aceitou é OUTRO: comissão de intermediação para quem
  // aceitou, resto para quem executa.
  const pctAceite = Number(modal?.acceptor_commission_pct) || 0;
  const [comissao, , execucao] = repartir(cents, [pctAceite, pctPlat, 100 - pctAceite - pctPlat]);
  const out = [];
  if (comissao > 0 && operador) out.push({ kind: 'commission', payee_user_id: operador, amount: comissao / 100 });
  if (execucao > 0)             out.push({ kind: 'execution',  payee_user_id: executor, amount: execucao / 100 });
  return out;
}

/**
 * Grava os repasses de uma reserva paga. Best-effort e idempotente: falhar aqui
 * NÃO pode derrubar a confirmação do pagamento — o cliente já pagou, e a
 * reserva precisa ser confirmada de qualquer jeito. O que se perde é a linha do
 * repasse, que o admin consegue lançar depois.
 */
export async function gerarRepasses(booking, total) {
  try {
    if (!booking?.id) return { skipped: 'sem reserva' };
    if (!booking.operator_id) return { skipped: 'reserva sem cooperativa' };

    const slug = await modalDaReserva(booking);
    let modal = null;
    if (slug) {
      const { data } = await supabase
        .from('service_modals')
        .select('executor_operator_id, acceptor_commission_pct, platform_commission_pct')
        .eq('slug', slug).maybeSingle();
      modal = data || null;
    }

    const { data: cfg } = await supabase
      .from('system_settings').select('setting_value')
      .eq('setting_key', 'payment_split_admin_pct').maybeSingle();

    const repasses = calcularRepasses(
      total, booking.operator_id, modal, Number(cfg?.setting_value) || 0,
    );
    if (repasses.length === 0) return { skipped: 'nada a repassar' };

    const linhas = repasses.map((r) => ({ ...r, booking_id: booking.id, status: 'pending' }));
    const { error } = await supabase
      .from('booking_payouts')
      .upsert(linhas, { onConflict: 'booking_id,kind', ignoreDuplicates: true });
    if (error) throw error;

    return { criados: linhas.length };
  } catch (err) {
    // 42P01 = tabela ausente (080 pendente). Não é erro de operação.
    if (err?.code !== '42P01') {
      console.error('[payouts] geração falhou para a reserva %s: %s', booking?.id, err?.message);
    }
    return { erro: err?.message };
  }
}
