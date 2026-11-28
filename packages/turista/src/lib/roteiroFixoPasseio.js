// Roteiro de um passeio sob cotação escolhido na vitrine.
// O turista não edita a rota nesta tela: respeitamos o que o admin cadastrou.
// Alguns passeios antigos possuem apenas nome/descrição, sem meeting_point ou
// quote_stops. Nesse caso não inventamos uma parada ou local de saída.
export const PARTIDA_A_COMBINAR = 'Ponto de partida a combinar'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function roteiroFixoDoPasseio(passeio) {
  if (!passeio?.id || passeio.quote_only !== true) return null

  const ponto = String(passeio.meeting_point_name || '').trim()
  const origemConhecida = ponto.length >= 2
  const lat = Number(passeio.meeting_latitude)
  const lon = Number(passeio.meeting_longitude)

  return {
    origin_place_name: origemConhecida ? ponto.slice(0, 300) : PARTIDA_A_COMBINAR,
    ...(origemConhecida && passeio.meeting_latitude != null && passeio.meeting_longitude != null
      && Number.isFinite(lat) && Number.isFinite(lon)
      ? { origin_latitude: lat, origin_longitude: lon } : {}),
    stops: (Array.isArray(passeio.quote_stops) ? passeio.quote_stops : [])
      .filter((p) => p && typeof p.name === 'string' && p.name.trim())
      .slice(0, 20)
      .map((p) => ({
        name: p.name.trim().slice(0, 300),
        lat: null,
        lng: null,
        ...(typeof p.stop_id === 'string' && UUID.test(p.stop_id) ? { stop_id: p.stop_id } : { outro: true }),
      })),
  }
}
