// Fronteira entre TRANSPORTE e SERVIÇO ADICIONAL no catálogo de veículos.
//
// `vehicles` guarda as duas coisas na mesma tabela, e `seat_capacity` é NOT
// NULL CHECK > 0 — então um cadastro de serviço (ex.: "GUIA TURISTICO") chega
// ao app com 1 assento e, sem este filtro, o app o trata como transporte:
// mostra "Até 1 pessoa · /veículo", soma 1 na capacidade da combinação e pode
// recomendá-lo como "o mais barato que cabe 1 pessoa".
//
// A coluna is_transport veio na migration 089 com DEFAULT TRUE. Enquanto ela
// não estiver aplicada, `v.is_transport` é undefined — por isso o teste é
// `!== false`: base antiga segue funcionando como hoje, sem tela vazia.

export function ehTransporte(v) {
  return v?.is_transport !== false
}

export function ehServicoAdicional(v) {
  return v?.is_transport === false
}

/** Só os veículos que de fato transportam gente. */
export function somenteTransporte(lista) {
  return (Array.isArray(lista) ? lista : []).filter(ehTransporte)
}

/** Serviços adicionais, para exibir à parte — nunca como transporte. */
export function somenteServicos(lista) {
  return (Array.isArray(lista) ? lista : []).filter(ehServicoAdicional)
}

/** Assentos de uma combinação. Serviço adicional não soma assento. */
export function capacidadeDaCombinacao(itens) {
  return (Array.isArray(itens) ? itens : []).reduce(
    (soma, { vehicle, qty }) =>
      soma + (ehTransporte(vehicle) ? (Number(vehicle?.seat_capacity) || 0) * (Number(qty) || 0) : 0),
    0,
  )
}
