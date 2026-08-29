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

// Campos obrigatórios que ainda faltam num item do carrinho (estilo Mercado
// Livre: a prévia fica no carrinho, mas só dá pra solicitar quando todos os
// dados de todos os itens estão completos).
export function itemMissing(item) {
  const miss = []
  if (!item.dateIso) miss.push('data')
  if (!item.time) miss.push('horário')
  if (!(Number(item.people) >= 1)) miss.push('pessoas')
  // No compartilhado não se escolhe veículo: paga-se por pessoa e a vaga é
  // no veículo que o operador já opera. Exigir veículo aqui deixaria o
  // item eternamente incompleto.
  const compartilhado = item.kind !== 'transfer' && item.mode === 'shared'
  const chosen = (item.vehicles || []).filter((v) => v.qty > 0)
  if (compartilhado) { /* sem veículo */ }
  else if (!chosen.length) miss.push('veículo')
  else if (chosen.every((v) => Number(v.cap) > 0)) {
    // Regra de capacidade: só valida quando TODOS os veículos escolhidos têm
    // capacidade conhecida (rascunhos antigos sem `cap` são hidratados na
    // edição, onde a regra também trava o Salvar).
    const capacity = chosen.reduce((s, v) => s + Number(v.cap) * v.qty, 0)
    if (capacity < Number(item.people || 1)) miss.push('veículos para todas as pessoas')
  }
  if (item.kind === 'transfer') {
    if (!item.origin) miss.push('origem')
    if (!item.dest) miss.push('destino')
  } else if (!item.origin_text) {
    miss.push('local de saída')
  }
  return miss
}

// Corpo do POST /api/payments/request para um item COMPLETO do carrinho.
// O servidor recalcula o total autoritativo e valida o cutoff.
export function requestPayloadFor(item) {
  const base = {
    service_type:     item.kind === 'transfer' ? 'transfer' : 'tour',
    service_id:       item.id,
    booking_mode:     item.mode === 'shared' ? 'shared' : 'private',
    service_date_iso: item.dateIso,
    service_time:     item.time || undefined,
    people_count:     item.people || 1,
    region_id:        item.region_id || undefined,
    total_price:      Number(item.total) || 0,
    vehicles: item.mode === 'shared' ? [] : (item.vehicles || []).filter((v) => v.qty > 0).map((v) => ({
      vehicle_id: v.id, qty: v.qty, unit_price: Number(v.price) || 0,
    })),
  }
  if (item.kind === 'transfer') {
    base.origin_text      = item.origin || undefined
    base.destination_text = item.dest || undefined
  } else {
    base.origin_text = item.origin_text || undefined
  }
  return base
}
