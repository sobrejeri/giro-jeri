// Converte um rascunho do carrinho flutuante (CartContext) para o formato de
// state que a tela de Resumo da reserva (/checkout/resumo) espera. Usado pelo
// fluxo "Solicitar tudo": cada item do carrinho passa pela MESMA tela de
// confirmação, um por vez, antes de virar solicitação.
export function checkoutStateFor(item) {
  const isTransfer = item.kind === 'transfer'
  const vehicles = (item.vehicles || []).map((v) => ({
    vehicle_id: v.id, qty: v.qty, unit_price: Number(v.price) || 0,
  }))
  return {
    service_name:     item.name,
    service_type:     isTransfer ? 'transfer' : 'tour',
    booking_mode:     item.mode === 'shared' ? 'shared' : 'private',
    service_date_iso: item.dateIso,
    service_time:     isTransfer ? (item.time || null) : null,
    people_count:     item.people || 1,
    region_id:        item.region_id || null,
    service_id:       item.id,
    origin_text:      isTransfer ? (item.origin || '') : (item.origin_text || ''),
    destination_text: isTransfer ? (item.dest || null) : null,
    vehicles,
    vehicle_name:     (item.vehicles || []).map((v) => `${v.qty}x ${v.name}`).join(' + '),
    ...(isTransfer ? { transfer_unit_price: Number(item.vehicles?.[0]?.price) || 0 } : {}),
    total_price:      Number(item.total) || 0,
    breakdown:        { 'Veículos selecionados': Number(item.total) || 0 },
    open_editing:     false,
  }
}
