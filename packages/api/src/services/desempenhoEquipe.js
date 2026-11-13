// Desempenho da equipe da empresa — regras PURAS (sem banco), para testar.
//
// Junta as reservas da PLATAFORMA dos operadores da equipe com as vendas
// EXTERNAS que eles registraram, e resume por operador.
//
// O que conta como VENDA no resumo:
//   • plataforma: reserva PAGA (status_commercial = 'paid');
//   • externa:    registro ativo (não cancelado).
// Reserva ainda não paga, cancelada ou reembolsada aparece na LISTA (a empresa
// acompanha), mas não soma no vendido.

const cent = (n) => Math.round((Number(n) || 0) * 100) / 100;
const FORA_DA_LISTA = ['draft'];

// Linha de reserva da PLATAFORMA no formato da tela.
// b: reserva com operational_assignments[] e booking_payouts[] aninhados.
export function linhaPlataforma(b, companyId, nomes) {
  const despacho = (b.operational_assignments || []).find((a) => a.driver_name) || null;
  // Comissão da EMPRESA nesta reserva (repasse em nome dela). Reserva de antes
  // do vínculo tem a comissão no nome do operador — não é da empresa.
  const comissao = (b.booking_payouts || [])
    .find((p) => p.kind === 'commission' && p.payee_user_id === companyId && p.status !== 'cancelled') || null;
  return {
    id: b.id, origem: 'plataforma', codigo: b.booking_code,
    servico: b.service_name || (b.service_type === 'tour' ? 'Passeio' : 'Translado'),
    service_type: b.service_type, service_date: b.service_date, service_time: b.service_time || null,
    people_count: b.people_count, valor: cent(b.total_amount),
    vendedor_id: b.operator_id, vendedor: nomes.get(b.operator_id) || 'Operador',
    executor: despacho?.driver_name || null,
    status_commercial: b.status_commercial, status_operational: b.status_operational,
    conta: b.status_commercial === 'paid',
    comissao: comissao ? cent(comissao.amount) : null,
    comissao_status: comissao?.status || null,
  };
}

// Linha de venda EXTERNA no formato da tela.
export function linhaExterna(e, nomes) {
  return {
    id: e.id, origem: 'externa', codigo: null,
    servico: e.service_description, service_type: e.service_type,
    service_date: e.service_date, service_time: e.service_time || null,
    people_count: e.people_count, valor: cent(e.total_amount),
    vendedor_id: e.operator_id, vendedor: nomes.get(e.operator_id) || 'Operador',
    executor: e.executor_name || null,
    cliente: e.customer_name,
    status_commercial: e.status === 'cancelled' ? 'cancelled' : 'external',
    status_operational: null,
    conta: e.status !== 'cancelled',
    comissao: null, comissao_status: null,
  };
}

export function montarDesempenho({ reservas = [], externas = [], equipe = [], companyId }) {
  const nomes = new Map(equipe.map((u) => [u.id, u.full_name]));
  const rows = [
    ...reservas.filter((b) => !FORA_DA_LISTA.includes(b.status_commercial)).map((b) => linhaPlataforma(b, companyId, nomes)),
    ...externas.map((e) => linhaExterna(e, nomes)),
  ].sort((a, b) => (a.service_date === b.service_date
    ? String(b.service_time || '').localeCompare(String(a.service_time || ''))
    : String(b.service_date).localeCompare(String(a.service_date))));

  const zero = () => ({ reservas: 0, externas: 0, vendido_plataforma: 0, vendido_externo: 0, comissao: 0 });
  const total = zero();
  const porOperador = new Map(equipe.map((u) => [u.id, { operator_id: u.id, nome: u.full_name, removido: !!u.removed_at, ativo: u.is_active === true, ...zero() }]));

  for (const r of rows) {
    if (!r.conta) continue;
    const alvo = porOperador.get(r.vendedor_id);
    for (const t of [total, alvo].filter(Boolean)) {
      if (r.origem === 'externa') { t.externas += 1; t.vendido_externo = cent(t.vendido_externo + r.valor); }
      else { t.reservas += 1; t.vendido_plataforma = cent(t.vendido_plataforma + r.valor); t.comissao = cent(t.comissao + (r.comissao || 0)); }
    }
  }

  const operadores = [...porOperador.values()]
    .filter((o) => !o.removido || o.reservas + o.externas > 0)      // removido sem venda no período não polui
    .sort((a, b) => (b.vendido_plataforma + b.vendido_externo) - (a.vendido_plataforma + a.vendido_externo) || a.nome.localeCompare(b.nome));

  return { total, operadores, rows };
}
