// ── serviceDetails.js ───────────────────────────────────
// Detalhes do SERVIÇO contratado (nome, roteiro, duração) para anexar às
// reservas.
//
// Por que existe: a reserva guarda `service_id` + `service_type`, mas nem a
// tela do operador nem a Ordem de Serviço mostravam QUAL passeio/rota foi
// contratado — a OS dizia apenas "Passeio — Privativo". O motorista recebia a
// OS sem saber o roteiro, e a coop despachava às cegas.
//
// Best-effort: falha de leitura devolve as reservas sem os campos extras, sem
// derrubar o feed.

// Anexa { service_name, service_description, service_duration_hours } a cada
// reserva da lista. `service_id` aponta para tours OU transfer_routes conforme
// o service_type.
export async function attachServiceDetails(supabase, bookings) {
  const list = bookings || [];
  if (list.length === 0) return list;

  const tourIds = [...new Set(list.filter((b) => b.service_type === 'tour' && b.service_id).map((b) => b.service_id))];
  const routeIds = [...new Set(list.filter((b) => b.service_type !== 'tour' && b.service_id).map((b) => b.service_id))];
  const byId = new Map();

  try {
    if (tourIds.length) {
      const { data } = await supabase
        .from('tours')
        .select('id, name, short_description, duration_hours')
        .in('id', tourIds);
      for (const t of data || []) {
        byId.set(t.id, {
          service_name:            t.name,
          service_description:     t.short_description || null,
          service_duration_hours:  t.duration_hours ?? null,
        });
      }
    }
    if (routeIds.length) {
      const { data } = await supabase
        .from('transfer_routes')
        .select('id, origin_name, destination_name')
        .in('id', routeIds);
      for (const r of data || []) {
        byId.set(r.id, {
          service_name:           `${r.origin_name} → ${r.destination_name}`,
          service_description:    null,
          service_duration_hours: null,
        });
      }
    }
  } catch (err) {
    console.error('[serviceDetails] leitura falhou:', err.message);
    return list;
  }

  return list.map((b) => {
    const extra = byId.get(b.service_id);
    if (extra) return { ...b, ...extra };
    // Transfer sem rota tabelada (cotação personalizada): usa origem → destino.
    const rota = b.service_type !== 'tour'
      ? [b.origin_text, b.destination_text].filter(Boolean).join(' → ')
      : null;
    return { ...b, service_name: rota || null, service_description: null, service_duration_hours: null };
  });
}
