// ── fleet.js ────────────────────────────────────────────
// Elegibilidade de cooperativas por FROTA.
//
// DOIS MODELOS, por veículo (coluna vehicles.requires_opt_in, migration 066):
//   • opt-out (padrão, requires_opt_in=false): a coop recebe a solicitação a
//     menos que tenha DESATIVADO o veículo (preferência is_active=false).
//     Serve para veículo comum — buggy, 4x4 — que quase todas operam.
//   • opt-in (requires_opt_in=true): a coop só recebe se tiver ATIVADO o
//     veículo explicitamente (is_active=true). Serve para veículo especial —
//     helicóptero — que quase nenhuma opera.
//
// Fail-open em erro/ausência de dados para o modelo opt-out (nunca deixa de
// notificar por engano). O opt-in NÃO é fail-open: sem opt-in explícito, não
// recebe — é justamente o ponto do recurso.

// Veículos EXIGIDOS por cada reserva.
// Ordem de resolução:
//   1. booking_vehicles (reserva privativa: o cliente escolheu os veículos);
//   2. se não houver nenhum — caso do COMPARTILHADO, que não gera
//      booking_vehicles —, cai nas regras de preço do serviço
//      (vehicle_pricing_rules), que é onde mora "quais veículos fazem este
//      passeio". Sem esse passo, um voo compartilhado ficava "sem veículo" e
//      escapava do filtro, indo para todas as cooperativas.
// Retorna Map<bookingId, string[] vehicleIds>.
export async function requiredVehiclesByBooking(supabase, bookings) {
  const result = new Map();
  const list = (bookings || []).filter((b) => b?.id);
  if (list.length === 0) return result;

  const ids = list.map((b) => b.id);
  const { data: bvs } = await supabase
    .from('booking_vehicles')
    .select('booking_id, vehicle_id')
    .in('booking_id', ids);

  for (const row of bvs || []) {
    if (!row.vehicle_id) continue;
    if (!result.has(row.booking_id)) result.set(row.booking_id, new Set());
    result.get(row.booking_id).add(row.vehicle_id);
  }

  // Reservas sem booking_vehicles → resolve pelos veículos que atendem o serviço.
  const semVeiculo = list.filter((b) => !result.has(b.id) && b.service_id);
  if (semVeiculo.length > 0) {
    const serviceIds = [...new Set(semVeiculo.map((b) => b.service_id))];
    const { data: rules } = await supabase
      .from('vehicle_pricing_rules')
      .select('service_id, vehicle_id')
      .eq('is_active', true)
      .in('service_id', serviceIds);

    const byService = new Map();
    for (const r of rules || []) {
      if (!r.vehicle_id) continue;
      if (!byService.has(r.service_id)) byService.set(r.service_id, new Set());
      byService.get(r.service_id).add(r.vehicle_id);
    }
    for (const b of semVeiculo) {
      const vs = byService.get(b.service_id);
      if (vs?.size) result.set(b.id, vs);
    }
  }

  // Set → array
  return new Map([...result].map(([k, v]) => [k, [...v]]));
}

// Dos veículos informados, quais são RESTRITOS (opt-in). Tolera a coluna
// ausente (migration 066 pendente) devolvendo conjunto vazio — aí tudo volta a
// se comportar como o modelo opt-out de antes.
export async function optInVehicleIds(supabase, vehicleIds) {
  const ids = [...new Set((vehicleIds || []).filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from('vehicles')
    .select('id')
    .eq('requires_opt_in', true)
    .in('id', ids);
  if (error) {
    if (error.code !== '42703') {
      console.error('[fleet] leitura de requires_opt_in falhou:', error.message);
    }
    return new Set();
  }
  return new Set((data || []).map((v) => v.id));
}

// Preferências de veículo de um conjunto de cooperativas.
// Retorna { disabled: Map<opId, Set<vehicleId>>, enabled: Map<opId, Set<vehicleId>> }.
export async function vehiclePrefs(supabase, vehicleIds, operatorIds) {
  const disabled = new Map();
  const enabled  = new Map();
  const ids = [...new Set((vehicleIds || []).filter(Boolean))];
  if (ids.length === 0) return { disabled, enabled };

  let q = supabase
    .from('operator_service_preferences')
    .select('operator_id, entity_id, is_active')
    .eq('entity_type', 'vehicle')
    .in('entity_id', ids);
  if (operatorIds?.length) q = q.in('operator_id', operatorIds);

  const { data, error } = await q;
  if (error) {
    console.error('[fleet] leitura de preferências falhou:', error.message);
    return { disabled, enabled };
  }
  for (const p of data || []) {
    const target = p.is_active ? enabled : disabled;
    if (!target.has(p.operator_id)) target.set(p.operator_id, new Set());
    target.get(p.operator_id).add(p.entity_id);
  }
  return { disabled, enabled };
}

// A cooperativa `opId` atende uma reserva que exige `vehicleIds`?
// Regra por veículo: restrito → precisa de opt-in explícito; comum → basta não
// ter desativado. Precisa valer para TODOS os veículos da reserva.
export function operatorServesVehicles(opId, vehicleIds, optIn, prefs) {
  if (!vehicleIds || vehicleIds.length === 0) return true; // sem veículo → fail-open
  const dis = prefs.disabled.get(opId);
  const ena = prefs.enabled.get(opId);
  return vehicleIds.every((vId) =>
    optIn.has(vId) ? !!ena?.has(vId) : !dis?.has(vId));
}

// Operadores ativos ELEGÍVEIS para uma reserva. Retorna [{ id, phone }].
export async function eligibleOperatorsForBooking(supabase, bookingId) {
  const { data: ops } = await supabase
    .from('users')
    .select('id, phone')
    .eq('user_type', 'operator')
    .eq('is_active', true);
  const operators = ops || [];
  if (!bookingId || operators.length === 0) return operators;

  try {
    const { data: bk } = await supabase
      .from('bookings').select('id, service_id').eq('id', bookingId).maybeSingle();
    if (!bk) return operators;

    const byBooking  = await requiredVehiclesByBooking(supabase, [bk]);
    const vehicleIds = byBooking.get(bookingId) || [];
    if (vehicleIds.length === 0) return operators; // fail-open

    const optIn = await optInVehicleIds(supabase, vehicleIds);
    const prefs = await vehiclePrefs(supabase, vehicleIds, operators.map((o) => o.id));

    return operators.filter((op) => operatorServesVehicles(op.id, vehicleIds, optIn, prefs));
  } catch (err) {
    console.error('[fleet] elegibilidade falhou, notificando todos:', err?.message);
    return operators; // fail-open
  }
}
