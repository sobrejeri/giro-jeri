// ── services/paymentReconcile.js ────────────────────────
// Conciliação de pagamentos pendentes contra o Mercado Pago.
//
// POR QUE EXISTE. O aviso do MP (webhook) pode não chegar: instabilidade de
// rede, deploy no meio do caminho, a API do MP fora do ar na hora da consulta.
// Sem uma segunda linha de defesa, o cliente paga e a reserva fica parada até
// expirar — que foi exatamente o que aconteceu enquanto o webhook lia um status
// que o MP não manda.
//
// ─────────────────────────────────────────────────────────────────────────────
// CREDENCIAIS DE PRODUÇÃO: este arquivo mexe com dinheiro de verdade.
// As regras abaixo não são preferência, são contenção de estrago:
//
//   · SÓ LEITURA no Mercado Pago. Apenas `GET /v1/payments/{id}`. Nada aqui
//     cria cobrança, estorna ou altera qualquer coisa na conta do MP.
//   · Só toca pagamento com `status = 'pending'`. Aprovado e falhado ficam
//     como estão — reconciliar o que já foi decidido só cria chance de erro.
//   · Só aprova quando o MP responde exatamente 'approved'. Qualquer outra
//     resposta (inclusive erro de rede) deixa o pagamento como está.
//   · Janela de tempo e teto por rodada: não sai varrendo o histórico inteiro
//     nem dispara centenas de chamadas de uma vez.
//   · Best-effort: nunca lança para quem chamou. Uma tela de reservas não pode
//     quebrar porque o MP está fora do ar.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../supabase.js';

// Quantos dias para trás vale reconciliar. PIX expira em horas; uma semana é
// folga suficiente e evita ficar consultando cobrança velha para sempre.
const JANELA_DIAS = Number(process.env.RECONCILE_JANELA_DIAS) || 7;
// Teto por rodada. A conciliação roda dentro de uma requisição do cliente:
// não pode transformar a abertura da tela de reservas numa espera longa.
const TETO_POR_RODADA = Number(process.env.RECONCILE_TETO) || 5;

const ehDoMercadoPago = (p) =>
  p.gateway_name === 'mercado_pago'
  && p.gateway_transaction_id
  && !String(p.gateway_transaction_id).startsWith('TEST-');

/**
 * Consulta o MP e aplica o desfecho de UM pagamento.
 * Devolve o status do MP, ou null quando não deu para saber.
 */
async function conciliarUm(pagamento, { aoAprovar, resolverToken, consultarStatus }) {
  if (!ehDoMercadoPago(pagamento) || pagamento.status !== 'pending') return null;

  let mpStatus = null;
  try {
    // `aoAprovar` e `resolverToken` chegam de fora (de payments.js). Preferi
    // injetar a mover essas funções para cá: elas renovam token do MP e lançam
    // no financeiro — código que move dinheiro não deve ser realocado junto
    // com uma funcionalidade nova. `consultarStatus` também é injetável, com o
    // padrão real: é o que permite exercitar a tabela de decisão em teste sem
    // encostar na conta de produção do Mercado Pago.
    const consulta = consultarStatus || (async (mpId, token) => {
      const { getMpPaymentStatus } = await import('./mercadoPago.js');
      return getMpPaymentStatus(mpId, token);
    });
    // Com split, a cobrança vive na conta do operador: consulta com o token
    // dela. Sem operador (ou sem token), cai no token da plataforma.
    const token = await resolverToken(pagamento.bookings?.operator_id);
    mpStatus = await consulta(pagamento.gateway_transaction_id, token);
  } catch (err) {
    console.error('[conciliação] consulta ao MP falhou payment=%s: %s', pagamento.id, err.message);
    return null;   // sem resposta confiável, não decide nada
  }

  if (mpStatus === 'approved') {
    console.log('[conciliação] pagamento aprovado fora do webhook payment=%s', pagamento.id);
    await aoAprovar(pagamento);
  } else if (['rejected', 'cancelled'].includes(mpStatus)) {
    await supabase.from('payments').update({ status: 'failed' }).eq('id', pagamento.id);
    await supabase.from('bookings')
      .update({ status_commercial: 'payment_failed', payment_status: 'failed' })
      .eq('id', pagamento.booking_id);
  }
  // 'in_process', 'pending' e afins: segue pendente, sem mexer.
  return mpStatus;
}

/**
 * Concilia os pagamentos pendentes DE UM CLIENTE.
 *
 * Chamada quando ele abre a lista de reservas — é o momento natural: quem pagou
 * o PIX e fechou o app volta justamente para conferir se caiu.
 *
 * Escopo de um cliente por vez de propósito: poucas chamadas ao MP, e o
 * estrago de qualquer engano fica contido numa conta só.
 */
// Intervalo mínimo entre conciliações do MESMO cliente. Sem isto, alguém
// puxando a lista para atualizar dispararia uma rajada de consultas ao Mercado
// Pago — e as credenciais aqui são de produção, com limite de requisição real.
// O mapa é da memória do processo: some no deploy, e é o suficiente, porque o
// pior caso de perdê-lo é uma conciliação a mais.
const ESPERA_MS = Number(process.env.RECONCILE_ESPERA_MS) || 30_000;
const ultimaVez = new Map();

function podeConciliar(userId) {
  const agora = Date.now();
  const anterior = ultimaVez.get(userId);
  if (anterior && agora - anterior < ESPERA_MS) return false;
  ultimaVez.set(userId, agora);
  // Poda simples: sem isto o mapa cresceria para sempre num processo longo.
  if (ultimaVez.size > 5000) {
    for (const [k, t] of ultimaVez) if (agora - t > ESPERA_MS) ultimaVez.delete(k);
  }
  return true;
}

export async function reconciliarPagamentosDoCliente(userId, ganchos) {
  if (!userId) return { verificados: 0 };
  if (!podeConciliar(userId)) return { verificados: 0, ignorado: 'espera' };
  try {
    const desde = new Date(Date.now() - JANELA_DIAS * 86400_000).toISOString();

    const { data: pendentes, error } = await supabase
      .from('payments')
      .select('id, status, booking_id, order_group_id, gateway_name, gateway_transaction_id, amount_gross, bookings!inner(user_id, operator_id, booking_code)')
      .eq('status', 'pending')
      .eq('gateway_name', 'mercado_pago')
      .eq('bookings.user_id', userId)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(TETO_POR_RODADA);
    if (error) throw error;

    let aprovados = 0;
    for (const p of pendentes || []) {
      const s = await conciliarUm(p, ganchos);
      if (s === 'approved') aprovados++;
    }
    return { verificados: (pendentes || []).length, aprovados };
  } catch (err) {
    // Best-effort: a lista de reservas tem de abrir mesmo com o MP fora do ar.
    console.error('[conciliação] falhou para user=%s: %s', userId, err.message);
    return { verificados: 0, erro: err.message };
  }
}

/**
 * Concilia um lote de pendentes de QUALQUER cliente. Para uso pelo admin,
 * sob demanda — não há gatilho automático.
 */
export async function reconciliarLote({ limite = 25 } = {}, ganchos) {
  const desde = new Date(Date.now() - JANELA_DIAS * 86400_000).toISOString();

  const { data: pendentes, error } = await supabase
    .from('payments')
    .select('id, status, booking_id, order_group_id, gateway_name, gateway_transaction_id, amount_gross, bookings(user_id, operator_id, booking_code)')
    .eq('status', 'pending')
    .eq('gateway_name', 'mercado_pago')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(Math.min(Number(limite) || 25, 100));
  if (error) throw error;

  const resultado = { verificados: 0, aprovados: 0, falhados: 0, indeterminados: 0, detalhes: [] };
  for (const p of pendentes || []) {
    const s = await conciliarUm(p, ganchos);
    resultado.verificados++;
    if (s === 'approved') resultado.aprovados++;
    else if (['rejected', 'cancelled'].includes(s)) resultado.falhados++;
    else if (s === null) resultado.indeterminados++;
    resultado.detalhes.push({
      payment_id:   p.id,
      booking_code: p.bookings?.booking_code || null,
      valor:        p.amount_gross,
      status_mp:    s,
    });
  }
  return resultado;
}
