// Pontos turísticos por região — atalhos na busca de lugar (PlaceInput) do
// passeio e do translado personalizados. O turista toca no nome em vez de
// depender da busca externa, que para nomes comuns ("Pedra Furada", "Mangue
// Seco", "Lagoa Azul") costuma devolver lugares homônimos de outros estados.
//
// Vão SÓ com o nome, sem coordenada: os motoristas conhecem esses pontos pelo
// nome, e coordenada inventada põe o pin no lugar errado — pior que pin nenhum.
// A ordem é a do pedido do negócio (mais procurados primeiro).
const PONTOS_POR_REGIAO = {
  jericoacoara: [
    'Pedra Furada',
    'Duna do Pôr do Sol',
    'Lagoa do Paraíso',
    'Buraco Azul (Caiçara)',
    'Árvore da Preguiça',
    'Lagoa Azul',
    'Mangue Seco',
    'Lagoa de Tatajuba',
    'Praia da Vila de Jericoacoara',
    'Praia da Malhada',
    'Munzuá Pier Club',
    'Praia do Preá',
    'Lagun Beach',
    'Guriú',
    'Dunas do Amâncio',
    'Barrinha',
    'Tatajuba',
  ],
}

/** Minúsculas, sem acento e sem pontuação — "Árvore da Preguiça" ≈ "arvore da preguica". */
export function normalizarLugar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Pontos da região escolhida. Sem região, assume Jericoacoara (onde a operação nasceu). */
export function pontosDaRegiao(region) {
  const slug = region?.slug || (region?.name ? normalizarLugar(region.name).replace(/ /g, '-') : 'jericoacoara')
  return PONTOS_POR_REGIAO[slug] || []
}

/** Filtra pelos termos digitados, em qualquer ordem ("azul lagoa" acha "Lagoa Azul"). Vazio → todos. */
export function filtrarPontos(lista, query) {
  const termos = normalizarLugar(query).split(' ').filter(Boolean)
  if (!termos.length) return lista
  return lista.filter((nome) => {
    const n = normalizarLugar(nome)
    return termos.every((t) => n.includes(t))
  })
}
