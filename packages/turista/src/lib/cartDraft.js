// Rascunhos "vazios" para o carrinho — o que o botão de adicionar da vitrine
// grava quando o turista ainda não escolheu nada além do serviço em si.
//
// A ideia é a do Mercado Livre: jogar no carrinho é barato e reversível; quem
// cobra os dados é o carrinho, na hora de solicitar. `itemMissing()`
// (lib/cartCheckout) já lista o que falta e o botão "Solicitar tudo" fica
// travado enquanto houver pendência, então um rascunho incompleto é seguro.
//
// Os campos de regra (janela de operação, corte, antecedência) viajam junto
// porque a folha de edição do carrinho valida por eles — sem isso o turista
// conseguiria marcar um horário que o servidor recusaria depois.

const num = (v) => (v == null || v === '' ? null : Number(v))

export function draftFromTour(tour, { region_id = null } = {}) {
  return {
    id:   tour.id,
    kind: 'tour',
    name: tour.name,
    // Privativo x compartilhado é escolhido no carrinho. O rascunho nasce no
    // modo que o passeio realmente aceita — há passeio só compartilhado (voo
    // panorâmico) e comprá-lo como privativo daria valor e modo errados.
    mode: tour.is_private_enabled === false && tour.is_shared_enabled ? 'shared' : 'private',
    allows_private: tour.is_private_enabled !== false,
    allows_shared:  !!tour.is_shared_enabled,
    shared_price_per_person: tour.shared_price_per_person != null
      ? Number(tour.shared_price_per_person) : null,
    cover_image_url: tour.cover_image_url || null,
    // A API devolve o passeio ora com `region_id`, ora com o join `regions`.
    region_id: tour.region_id || tour.regions?.id || region_id,
    // Pendentes — preenchidos no carrinho
    dateIso: '', time: '', people: 1, origin_text: '',
    vehicles: [], total: 0,
    // Regras que a folha de edição precisa para validar data/horário
    booking_cutoff_time:  tour.booking_cutoff_time || null,
    min_advance_hours:    num(tour.min_advance_hours),
    service_window_start: tour.service_window_start || null,
    service_window_end:   tour.service_window_end   || null,
  }
}

export function draftFromRoute(route, { region_id = null, shortName } = {}) {
  const pai = route.transfers || {}
  const nome = shortName
    ? shortName(route.origin_name, route.destination_name)
    : `${route.origin_name} → ${route.destination_name}`
  return {
    id:   route.id,
    kind: 'transfer',
    name: nome,
    origin: route.origin_name,
    dest:   route.destination_name,
    cover_image_url: route.cover_image_url || null,
    region_id: route.region_id || region_id,
    // No transfer o preço é da ROTA, não do veículo: cada veículo escolhido
    // custa o valor da rota. Sem guardar isso aqui, a folha de edição partiria
    // de zero e o carrinho mostraria R$ 0 até o turista voltar à vitrine.
    unit_price: Number(route.default_price) || 0,
    dateIso: '', time: '', people: 1,
    vehicles: [], total: 0,
    booking_cutoff_time:  pai.booking_cutoff_time || null,
    min_advance_hours:    num(pai.min_advance_hours),
    service_window_start: pai.service_window_start || null,
    service_window_end:   pai.service_window_end   || null,
  }
}
