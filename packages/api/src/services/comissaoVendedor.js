// Comissão do operador que VENDEU, paga pela EMPRESA — regras PURAS (sem banco).
//
// A empresa define um percentual por operador (users.company_commission_pct).
// A comissão é esse percentual sobre o VALOR DA RESERVA, e nasce quando a
// reserva está paga. Nada aqui move dinheiro: é o controle do que a empresa
// deve e do que já pagou por fora.

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;
const REVERTIDA = ['cancelled', 'refunded', 'disputed'];

export function calcularComissao(total, pct) {
  const t = Number(total), p = Number(pct);
  if (!(t > 0) || !(p > 0) || p > 100) return 0;
  return cent((t * p) / 100);
}

/**
 * Quais comissões faltam lançar.
 * @param reservas   [{ id, operator_id, total_amount, status_commercial, created_at }]
 * @param equipe     [{ id, company_commission_pct, company_commission_since }]
 * @param jaLancadas Set de booking_id que já têm linha
 */
export function comissoesALancar(reservas, equipe, jaLancadas, companyId) {
  const regra = new Map(equipe.map((u) => [u.id, u]));
  const out = [];
  for (const b of reservas || []) {
    if (b.status_commercial !== 'paid' || jaLancadas.has(b.id)) continue;
    const op = regra.get(b.operator_id);
    const pct = Number(op?.company_commission_pct);
    if (!op || !(pct > 0)) continue;
    // Percentual não vale para trás: só reservas criadas depois que ele passou a valer.
    if (!op.company_commission_since || !b.created_at || new Date(b.created_at) < new Date(op.company_commission_since)) continue;
    const amount = calcularComissao(b.total_amount, pct);
    if (!(amount > 0)) continue;
    out.push({ company_id: companyId, operator_id: b.operator_id, booking_id: b.id, base_amount: cent(b.total_amount), pct, amount, status: 'pending' });
  }
  return out;
}

// Comissões pendentes de reservas que foram canceladas/reembolsadas: não são mais devidas.
export const pendentesARevogar = (linhas) =>
  (linhas || []).filter((l) => l.status === 'pending' && REVERTIDA.includes(l.bookings?.status_commercial)).map((l) => l.id);

// Percentual vindo do formulário: número de 0 a 100 com 2 casas, ou null (sem comissão).
export function lerPercentual(v) {
  if (v === null || v === undefined || v === '') return { pct: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { erro: 'O percentual deve ficar entre 0 e 100.' };
  return { pct: cent(n) };
}
