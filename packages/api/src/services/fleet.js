// ── fleet.js ────────────────────────────────────────────
// Elegibilidade de cooperativas por FROTA. Uma coop que desabilitou um veículo
// (operator_service_preferences.is_active=false para entity_type='vehicle') não
// deve ser notificada de solicitações que usam esse veículo — ex.: helicóptero,
// UTV, que só algumas cooperativas operam. Fail-open: em erro/sem dados, devolve
// todos os operadores ativos (nunca deixa de notificar por engano).

// Operadores ativos ELEGÍVEIS para uma reserva (não desabilitaram nenhum dos
// veículos dela). Retorna [{ id, phone }].
export async function eligibleOperatorsForBooking(supabase, bookingId) {
  const { data: ops } = await supabase
    .from('users')
    .select('id, phone')
    .eq('user_type', 'operator')
    .eq('is_active', true);
  const operators = ops || [];
  if (!bookingId || operators.length === 0) return operators;

  try {
    const { data: bvs } = await supabase
      .from('booking_vehicles')
      .select('vehicle_id')
      .eq('booking_id', bookingId);
    const vehicleIds = [...new Set((bvs || []).map((v) => v.vehicle_id).filter(Boolean))];
    if (vehicleIds.length === 0) return operators; // sem veículos → todos (fail-open)

    const { data: prefs } = await supabase
      .from('operator_service_preferences')
      .select('operator_id, entity_id')
      .eq('entity_type', 'vehicle')
      .eq('is_active', false)
      .in('entity_id', vehicleIds);

    const disabledByOp = new Map();
    for (const p of prefs || []) {
      if (!disabledByOp.has(p.operator_id)) disabledByOp.set(p.operator_id, new Set());
      disabledByOp.get(p.operator_id).add(p.entity_id);
    }

    // Exclui a coop que desabilitou QUALQUER um dos veículos da reserva.
    return operators.filter((op) => {
      const dis = disabledByOp.get(op.id);
      return !dis || !vehicleIds.some((vId) => dis.has(vId));
    });
  } catch {
    return operators; // fail-open
  }
}
