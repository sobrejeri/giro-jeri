// Repasse ao EXECUTOR (motorista, guia, tripulação) — regras PURAS, sem banco.
//
// É o controle do que a empresa/operador paga POR FORA a quem foi a campo. Nada
// aqui move dinheiro: é registro do combinado (valor) e da baixa (pago).

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const STATUS_REPASSE = ['pending', 'paid', 'cancelled'];

/**
 * Valida o pedido de alteração e devolve o que gravar.
 * @param {{amount?:any, status?:any, notes?:any}} pedido
 * @param {{status_operational?:string, driver_payout_amount?:number|null}} atual
 * @returns {{patch:object}|{erro:string, http:number}}
 */
export function montarBaixa(pedido, atual, agora = new Date()) {
  const { amount, status, notes } = pedido || {};
  const patch = {};

  if (amount !== undefined && amount !== null && amount !== '') {
    const v = Number(amount);
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) return { erro: 'Valor do repasse inválido.', http: 400 };
    patch.driver_payout_amount = cent(v);
  }
  if (notes !== undefined) {
    if (notes !== null && typeof notes !== 'string') return { erro: 'Observação inválida.', http: 400 };
    patch.driver_payout_notes = (notes || '').trim().slice(0, 1000) || null;
  }
  if (status !== undefined) {
    if (!STATUS_REPASSE.includes(status)) return { erro: 'Situação inválida.', http: 400 };
    if (status === 'paid') {
      // Baixa só de serviço que ACONTECEU, e com valor definido — "pago R$ 0"
      // some do total a pagar sem ninguém ter pago nada.
      if (atual?.status_operational !== 'completed') {
        return { erro: 'Só é possível dar baixa depois que a reserva estiver concluída.', http: 409 };
      }
      const valor = patch.driver_payout_amount ?? atual?.driver_payout_amount;
      if (!(Number(valor) > 0)) return { erro: 'Defina o valor do repasse antes de dar baixa.', http: 409 };
    }
    patch.driver_payout_status = status;
    patch.driver_paid_at = status === 'paid' ? agora.toISOString() : null;
  }
  if (Object.keys(patch).length === 0) return { erro: 'Nada para alterar.', http: 400 };
  return { patch: { ...patch, updated_at: agora.toISOString() } };
}

export function somarRepasses(rows) {
  const t = { pending: 0, paid: 0, sem_valor: 0, count: rows.length };
  for (const r of rows) {
    const v = Number(r.driver_payout_amount) || 0;
    if (r.driver_payout_status === 'paid') t.paid += v;
    if (r.driver_payout_status === 'pending') { t.pending += v; if (r.driver_payout_amount == null) t.sem_valor += 1; }
  }
  t.pending = cent(t.pending); t.paid = cent(t.paid);
  return t;
}
