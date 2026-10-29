// Pontos turísticos da área de Jericoacoara — atalhos na busca de lugar
// (PlaceInput) para as PARADAS do passeio e o DESTINO do translado
// personalizados. O turista toca no nome em vez de depender da busca externa,
// que para nomes comuns ("Pedra Furada", "Mangue Seco", "Lagoa Azul") costuma
// devolver lugares homônimos de outros estados.
//
// Vão SÓ com o nome, sem coordenada: os motoristas conhecem esses pontos pelo
// nome, e coordenada inventada põe o pin no lugar errado — pior que pin nenhum.
// A ordem é a do pedido do negócio (mais procurados primeiro).
const PONTOS_JERI = [
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
]

const VILA_DE_JERI = { lat: -2.7976, lon: -40.5147 }
const RAIO_DA_AREA_KM = 80

function distanciaKm(lat1, lon1, lat2, lon2) {
  const rad = (g) => (g * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Minúsculas, sem acento e sem pontuação — "Árvore da Preguiça" ≈ "arvore da preguica". */
export function normalizarLugar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Pontos para a região escolhida. As regiões do app são MUNICÍPIOS (Jijoca,
 * Cruz, Camocim…) e estes pontos se espalham por eles — Preá e Caiçara ficam em
 * Cruz, Tatajuba em Camocim. Por isso o recorte é geográfico (região a até
 * ~80 km da Vila), e não pelo slug: amarrar a "jericoacoara" escondia a lista de
 * quem estava em Cruz. Região sem centro cadastrado → mostra (área de Jeri).
 */
export function pontosDaRegiao(region) {
  const temCentro = region?.center_latitude != null && region?.center_longitude != null
  if (temCentro && distanciaKm(Number(region.center_latitude), Number(region.center_longitude),
    VILA_DE_JERI.lat, VILA_DE_JERI.lon) > RAIO_DA_AREA_KM) return []
  return PONTOS_JERI
}

/**
 * Filtra pelos termos digitados, em qualquer ordem ("azul lagoa" acha "Lagoa
 * Azul"). Vazio → todos. `textoDe` diz onde procurar em cada item (nome e
 * categoria, nos locais próximos: "mercado" acha o mercadinho pelo tipo).
 */
export function filtrarPontos(lista, query, textoDe = (x) => x) {
  const termos = normalizarLugar(query).split(' ').filter(Boolean)
  if (!termos.length) return lista
  return lista.filter((item) => {
    const n = normalizarLugar(textoDe(item))
    return termos.every((t) => n.includes(t))
  })
}
