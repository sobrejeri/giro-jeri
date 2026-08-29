// ── splitModal.js ───────────────────────────────────────
// Divisão de um serviço com EXECUTOR FIXO no modal (migration 078).
//
// Regra do dono, para o aéreo: uma única empresa voa. Quem aceitar a
// solicitação fica só com a comissão; o restante, tirada a plataforma, vai para
// quem executa.
//
//   outro operador aceitou → % do operador | % da plataforma | restante executor
//   o executor aceitou     →                 % da plataforma | restante executor
//
// AINDA NÃO ESTÁ LIGADA no fluxo de pagamento. Existe para configurar e
// SIMULAR: o dono precisa ver os números antes de mover dinheiro real, e o
// split nativo de N recebedores do Mercado Pago nunca foi validado.

// Reparte `totalCents` entre pesos, em centavos inteiros, somando EXATAMENTE ao
// total (maior resto). O split do MP recusa o pagamento se Σ(amounts) não bater
// com o valor cobrado — arredondar cada parte por conta própria quebraria isso.
export function repartirCentavos(totalCents, pesos) {
  const n = pesos.length;
  if (n === 0) return [];
  let soma = pesos.reduce((a, b) => a + b, 0);
  let w = pesos;
  if (soma <= 0) { w = pesos.map(() => 1); soma = n; }
  const bruto = w.map((x) => (totalCents * x) / soma);
  const cents = bruto.map((x) => Math.floor(x));
  const resto = totalCents - cents.reduce((a, b) => a + b, 0);
  const ordem = bruto
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < resto; k++) cents[ordem[k % n].i] += 1;
  return cents;
}

/**
 * Calcula a divisão de um serviço.
 *
 * @param {number} total            valor cobrado do cliente
 * @param {object} modal            { executor_operator_id, acceptor_commission_pct, platform_commission_pct }
 * @param {string} operadorAceitou  id de quem aceitou
 * @param {number} pctPlataformaGeral  usado quando o modal não define o seu
 * @returns {{partes: Array, motivo: string}}
 */
export function calcularDivisao(total, modal, operadorAceitou, pctPlataformaGeral = 0) {
  const valorCents = Math.round(Number(total || 0) * 100);
  const executor   = modal?.executor_operator_id || null;
  const pctPlat    = modal?.platform_commission_pct != null
    ? Number(modal.platform_commission_pct)
    : Number(pctPlataformaGeral) || 0;

  // Sem executor fixo: comportamento normal — quem aceita executa e recebe.
  if (!executor) {
    const cents = repartirCentavos(valorCents, [pctPlat, 100 - pctPlat]);
    return {
      motivo: 'sem executor fixo — quem aceita executa',
      partes: [
        { papel: 'plataforma', operador_id: null,             valor: cents[0] / 100 },
        { papel: 'executor',   operador_id: operadorAceitou,  valor: cents[1] / 100 },
      ].filter((p) => p.valor > 0),
    };
  }

  // O próprio executor aceitou: não há intermediário, logo não há comissão de
  // aceite. Dois recebedores.
  if (operadorAceitou && operadorAceitou === executor) {
    const cents = repartirCentavos(valorCents, [pctPlat, 100 - pctPlat]);
    return {
      motivo: 'o executor aceitou — sem intermediário',
      partes: [
        { papel: 'plataforma', operador_id: null,     valor: cents[0] / 100 },
        { papel: 'executor',   operador_id: executor, valor: cents[1] / 100 },
      ].filter((p) => p.valor > 0),
    };
  }

  // Outro aceitou: três recebedores. O executor fica com o RESTO — e resto de
  // verdade, não um terceiro percentual, para os três somarem o total exato.
  const pctAceite = Number(modal?.acceptor_commission_pct) || 0;
  const cents = repartirCentavos(valorCents, [pctAceite, pctPlat, 100 - pctAceite - pctPlat]);
  return {
    motivo: 'outro operador aceitou — comissão de intermediação',
    partes: [
      { papel: 'quem_aceitou', operador_id: operadorAceitou, valor: cents[0] / 100 },
      { papel: 'plataforma',   operador_id: null,            valor: cents[1] / 100 },
      { papel: 'executor',     operador_id: executor,        valor: cents[2] / 100 },
    ].filter((p) => p.valor > 0),
  };
}
