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
  const partes = repartirReserva(total, operador, modal, pctPlataformaGeral);
  if (!partes) return [];

  const out = [];
  if (partes.comissao > 0 && operador) {
    out.push({ kind: 'commission', payee_user_id: operador, amount: partes.comissao / 100 });
  }
  // A execução só sai AQUI quando o executor é conhecido no pagamento — o
  // executor fixo do modal. Quando quem executa é o motorista que a cooperativa
  // manda a campo, ninguém sabe quem é ainda: essa linha nasce na conclusão,
  // em `calcularRepasseExecucao`.
  if (partes.execucao > 0 && partes.executorFixo) {
    out.push({ kind: 'execution', payee_user_id: partes.executorFixo, amount: partes.execucao / 100 });
  }
  return out;
}

/**
 * Reparte a reserva em centavos entre quem aceitou, a plataforma e quem
 * executa. Uma função só, usada no pagamento E na conclusão — se as duas
 * fizessem a conta por conta própria, a soma das partes poderia não fechar com
 * o valor recebido.
 *
 * @returns {null|{comissao:number, plataforma:number, execucao:number,
 *                 executorFixo:string|null, divideComExecutor:boolean}}
 */
export function repartirReserva(total, operador, modal, pctPlataformaGeral = 0) {
  const cents = Math.round(Number(total || 0) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;

  const executorFixo = modal?.executor_operator_id || null;
  const pctPlat = modal?.platform_commission_pct != null
    ? Number(modal.platform_commission_pct)
    : Number(pctPlataformaGeral) || 0;
  const pctAceite = Number(modal?.acceptor_commission_pct) || 0;

  // Executor fixo que TAMBÉM aceitou (a Frisonfly pegando o próprio voo): não
  // há intermediação, ele fica com tudo menos a plataforma. Sem este caso ele
  // receberia em duas linhas separadas sem motivo.
  if (executorFixo && executorFixo === operador) {
    const [plataforma, doOperador] = repartir(cents, [pctPlat, 100 - pctPlat]);
    return { comissao: doOperador, plataforma, execucao: 0, executorFixo: null, divideComExecutor: false };
  }

  // A divisão em três só vale quando o admin CONFIGUROU a comissão de aceite
  // do modal. Sem isso, quem aceitou recebe tudo menos a parte da plataforma —
  // o comportamento de sempre.
  //
  // Isto é deliberadamente fail-closed: a migration 082 sozinha não pode mudar
  // para onde vai o dinheiro de nenhuma reserva. Se um modal com comissão
  // zerada passasse a dividir, a cooperativa receberia ZERO e o valor inteiro
  // iria para um motorista — do dia para a noite, sem ninguém pedir.
  const divide = executorFixo != null || pctAceite > 0;
  if (!divide) {
    const [plataforma, doOperador] = repartir(cents, [pctPlat, 100 - pctPlat]);
    return { comissao: doOperador, plataforma, execucao: 0, executorFixo: null, divideComExecutor: false };
  }

  const [comissao, plataforma, execucao] =
    repartir(cents, [pctAceite, pctPlat, 100 - pctAceite - pctPlat]);
  return { comissao, plataforma, execucao, executorFixo, divideComExecutor: true };
}

// Carrega o modal do serviço e o percentual geral — os dois insumos da conta.
async function contextoDoRateio(booking) {
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
  return { modal, geral: Number(cfg?.setting_value) || 0 };
}

/**
 * Lança o repasse de EXECUÇÃO quando a cooperativa declara, na conclusão, quem
 * foi a campo. Só existe separado do resto porque no momento do pagamento essa
 * pessoa ainda é desconhecida — o serviço nem aconteceu.
 *
 * Não mexe na comissão: ela já nasceu no valor certo (`repartirReserva` reserva
 * a fatia do executor desde o pagamento quando o modal divide em três). Reescrever
 * um repasse que o admin pode já ter pago seria bem pior que uma linha a menos.
 *
 * @param {object} executor  { name, document, pix_key, pix_key_type }
 */
export async function gerarRepasseExecucao(bookingId, executor) {
  try {
    if (!bookingId) return { skipped: 'sem reserva' };
    const nome = (executor?.name || '').trim();
    if (!nome) return { skipped: 'executor sem nome' };

    const { data: booking } = await supabase
      .from('bookings')
      .select('id, operator_id, service_type, service_id, total_amount')
      .eq('id', bookingId).maybeSingle();
    if (!booking) return { skipped: 'reserva não encontrada' };

    const { modal, geral } = await contextoDoRateio(booking);
    const partes = repartirReserva(booking.total_amount, booking.operator_id, modal, geral);

    // Modal sem comissão de aceite configurada: quem aceitou recebe tudo menos
    // a plataforma, e não há fatia sobrando para o executor. O dado de quem
    // rodou fica registrado no despacho de qualquer forma (081) — o que não
    // acontece é criar dívida que ninguém combinou.
    if (!partes?.divideComExecutor || partes.execucao <= 0) {
      return { skipped: 'modal não divide com o executor' };
    }
    // Executor fixo já recebeu a linha dele no pagamento, e ele é quem manda:
    // é o sentido de "fixo". O motorista declarado não a substitui.
    if (partes.executorFixo) return { skipped: 'modal tem executor fixo' };

    const linha = {
      booking_id:         bookingId,
      kind:               'execution',
      payee_user_id:      null,
      payee_name:         nome,
      payee_document:     executor?.document     || null,
      payee_pix_key:      executor?.pix_key      || null,
      payee_pix_key_type: executor?.pix_key_type || null,
      amount:             partes.execucao / 100,
      status:             'pending',
    };

    // `ignoreDuplicates` faz a reconfirmação do executor NÃO reescrever um
    // repasse já lançado — que o admin pode ter pago. Trocar o destinatário
    // depois de pago é o admin que resolve, na tela, vendo o que aconteceu.
    const { error } = await supabase
      .from('booking_payouts')
      .upsert([linha], { onConflict: 'booking_id,kind', ignoreDuplicates: true });
    if (error) throw error;

    return { criado: true, valor: linha.amount };
  } catch (err) {
    // 42P01/42703 = migration 080/082 pendente. Não é erro de operação.
    if (!['42P01', '42703'].includes(err?.code)) {
      console.error('[payouts] execução falhou para a reserva %s: %s', bookingId, err?.message);
    }
    return { erro: err?.message };
  }
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

    const { modal, geral } = await contextoDoRateio(booking);
    const repasses = calcularRepasses(total, booking.operator_id, modal, geral);
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
