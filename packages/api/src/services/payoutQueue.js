// =============================================================================
// payoutQueue.js — Regras PURAS da fila de repasses e da conciliação
// =============================================================================
// Extraído de routes/admin.js para poder ser TESTADO em isolamento: aqui mora a
// decisão de QUANDO um repasse pode ser liberado e QUAIS divergências existem
// entre o que a plataforma recebeu e o que ela deve/pagou. Nenhuma função aqui
// toca o banco, faz chamada de rede ou fala com gateway — recebe uma reserva já
// carregada (com payments[] e booking_payouts[] aninhados) e devolve um objeto.
//
// Modelo em vigor: a plataforma recebe 100% (migration 079) e paga o operador
// por FORA (PIX/banco), registrando a baixa na fila. "Liberar" NÃO transfere
// pelo gateway — não existe essa capacidade aqui.
// =============================================================================

const REVERTIDA = ['cancelled', 'refunded', 'disputed'];
const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Uma linha da fila de liberação ───────────────────────────────────────────
// Classifica a reserva em UMA situação e diz se está elegível para liberar. É a
// MESMA regra usada pela tela (GET /payouts/fila), pelos indicadores e pela
// própria liberação (POST /payouts/liberar) — uma fonte de verdade só.
export function montarLinhaFila(b) {
  const pagamentos = b.payments || [];
  const aprovado   = pagamentos.find((p) => p.status === 'approved') || null;
  const gateway    = aprovado?.gateway_name || pagamentos[0]?.gateway_name || null;
  const valorPago  = aprovado ? Number(aprovado.amount_gross) : Number(b.total_amount) || 0;
  const pagoCliente = !!aprovado;

  const payouts = b.booking_payouts || [];
  // O repasse do OPERADOR é a comissão (de quem aceitou). Execução é de terceiro
  // e tem linha própria — não entra como valor do operador aqui.
  const doOperador = payouts.find((p) => p.kind === 'commission')
    || (b.operator ? payouts.find((p) => p.payee_user_id === b.operator.id) : null)
    || null;
  const execucao = payouts.find((p) => p.kind === 'execution') || null;
  // Split antigo pagou o operador direto na conta dele (histórico) — não pode
  // ser liberado de novo.
  const pagoPeloGateway = !!(b.operator &&
    pagamentos.some((p) => p.split_operator_id && p.split_operator_id === b.operator.id));

  const somaRepasses = (doOperador ? Number(doOperador.amount) : 0)
    + (execucao ? Number(execucao.amount) : 0);
  // Parte da plataforma = o que sobra depois dos repasses (valor REAL, não taxa
  // estimada). Inclui a taxa do gateway, que a plataforma absorve.
  const plataformaValor = cent(valorPago - somaRepasses);

  let situacao, motivoBloqueio = null, elegivel = false;
  if (REVERTIDA.includes(b.status_commercial)) {
    situacao = 'bloqueado';
    motivoBloqueio = b.status_commercial === 'refunded' ? 'reserva reembolsada'
      : b.status_commercial === 'disputed' ? 'reserva em contestação' : 'reserva cancelada';
  } else if (!b.completed_at) {
    situacao = 'conciliacao'; motivoBloqueio = 'sem data de conclusão registrada';
  } else if (pagoPeloGateway) {
    situacao = 'repassado_gateway';   // split direto na conta do operador
  } else if (!pagoCliente) {
    situacao = 'aguardando_pagamento';
  } else if (!doOperador) {
    situacao = 'conciliacao'; motivoBloqueio = 'reserva sem repasse calculado — conferir';
  } else if (doOperador.status === 'cancelled') {
    situacao = 'cancelado';
  } else if (doOperador.status === 'paid') {
    situacao = 'pago';
  } else {
    situacao = 'pronto_para_liberar'; elegivel = true;   // concluído + pago + pendente
  }

  return {
    booking_id:      b.id,
    booking_code:    b.booking_code,
    service_type:    b.service_type,          // 'tour' | 'transfer'
    service_date:    b.service_date,
    completed_at:    b.completed_at,          // UTC — a UI exibe em America/Fortaleza
    operador:        b.operator ? {
      id: b.operator.id, nome: b.operator.full_name,
      // Para onde o admin manda o PIX manual. Só vem quando o SELECT trouxe (a
      // fila traz; os indicadores não — e aí fica null, sem quebrar nada).
      pix_key: b.operator.pix_key || null, pix_key_type: b.operator.pix_key_type || null,
    } : null,
    gateway,
    valor_pago:      valorPago,
    plataforma_valor: plataformaValor,
    operador_valor:  doOperador ? Number(doOperador.amount) : null,   // previsto, do cálculo da venda
    payout_id:       doOperador?.id || null,
    payout_status:   doOperador?.status || null,
    situacao,
    motivo_bloqueio: motivoBloqueio,
    elegivel_liberar: elegivel,
  };
}

// ── Divergências de conciliação de UMA reserva ───────────────────────────────
// Cruza o que a plataforma RECEBEU (pagamentos aprovados) com o que ela DEVE ou
// PAGOU (booking_payouts), e aponta o que não fecha. Só leitura, sem gateway.
// Devolve um array (vazio quando está tudo certo). Cada item tem `tipo`,
// `gravidade` (alta = risco de dinheiro; media = operacional), `valor` e um
// `detalhe` em português.
export function conciliarReserva(b) {
  const div = [];
  const base = { booking_id: b.id, booking_code: b.booking_code, service_type: b.service_type };

  const pagamentos = b.payments || [];
  const aprovados  = pagamentos.filter((p) => p.status === 'approved');
  const recebido   = cent(aprovados.reduce((s, p) => s + (Number(p.amount_gross) || 0), 0));
  const pagoCliente = aprovados.length > 0;
  const revertida   = REVERTIDA.includes(b.status_commercial);

  const payouts   = b.booking_payouts || [];
  const comissao  = payouts.find((p) => p.kind === 'commission') || null;
  const somaPagos = cent(payouts.filter((p) => p.status === 'paid')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0));
  // Devido = a pagar + já pago (o cancelado não conta). É o total que a reserva
  // gerou de obrigação, para comparar com o que entrou.
  const somaDevida = cent(payouts.filter((p) => p.status !== 'cancelled')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const splitParaOperador = !!(b.operator
    && aprovados.some((p) => p.split_operator_id && p.split_operator_id === b.operator.id));

  // 1. Pagou o operador sem o cliente ter pago. (dinheiro saiu, não entrou)
  if (somaPagos > 0 && !pagoCliente) {
    div.push({ ...base, tipo: 'pago_sem_recebimento', gravidade: 'alta', valor: somaPagos,
      detalhe: 'repasse marcado como pago, mas nenhum pagamento do cliente foi aprovado' });
  }
  // 2. Pagou o operador numa reserva revertida (estornada/cancelada/contestada).
  if (somaPagos > 0 && revertida) {
    div.push({ ...base, tipo: 'pago_reserva_revertida', gravidade: 'alta', valor: somaPagos,
      detalhe: `repasse pago, mas a reserva está "${b.status_commercial}"` });
  }
  // 3. Repasse (a pagar + pago) maior que o recebido do cliente.
  if (pagoCliente && somaDevida > recebido + 0.01) {
    div.push({ ...base, tipo: 'repasse_acima_do_recebido', gravidade: 'alta', valor: cent(somaDevida - recebido),
      detalhe: `repasses somam ${somaDevida.toFixed(2)} e o recebido foi ${recebido.toFixed(2)}` });
  }
  // 4. Operador já pago por split no ato E ainda há comissão pendente: liberar
  //    pagaria de novo. gerarRepasses deveria impedir; aqui é a rede de proteção.
  if (splitParaOperador && comissao && comissao.status === 'pending') {
    div.push({ ...base, tipo: 'split_e_pendente', gravidade: 'alta', valor: Number(comissao.amount) || 0,
      detalhe: 'operador recebeu por split no ato E há comissão pendente — liberar pagaria em dobro' });
  }
  // 5. Concluída sem data real de conclusão: fica fora da fila ordenada.
  if (b.status_operational === 'completed' && !b.completed_at) {
    div.push({ ...base, tipo: 'concluido_sem_data', gravidade: 'media', valor: null,
      detalhe: 'concluída sem completed_at — fora da fila ordenada; rode o backfill (migration 091)' });
  }
  // 6. Concluída e paga, sem repasse calculado (e não é caso de split).
  if (pagoCliente && b.status_operational === 'completed' && !revertida && !splitParaOperador && !comissao) {
    div.push({ ...base, tipo: 'aprovado_sem_repasse', gravidade: 'media', valor: null,
      detalhe: 'concluída e paga, sem repasse calculado — rode "Gerar repasses faltantes"' });
  }

  return div;
}

// Ordem de exibição: risco de dinheiro primeiro, operacional depois.
export const ORDEM_CONCILIACAO = [
  'pago_sem_recebimento', 'pago_reserva_revertida', 'repasse_acima_do_recebido',
  'split_e_pendente', 'aprovado_sem_repasse', 'concluido_sem_data',
];
