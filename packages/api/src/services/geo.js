// Distância em km entre dois pontos (Haversine, raio médio 6371 km).
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLon  = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// Filtra uma lista de serviços (cada item com `regions` aninhado) pelos
// que estão dentro do raio efetivo do ponto (lat, lon).
//
// Coordenadas e raio operacional do serviço sobrescrevem os da região.
// Se o serviço não tem coords nem a região tem coords, o item é mantido
// (não dá pra filtrar — é melhor mostrar do que esconder por silêncio).
//
// `radiusOverrideKm`: se informado, usa esse raio em vez do raio do serviço.
export function filterByRadius(items, lat, lon, radiusOverrideKm) {
  const userLat = Number(lat);
  const userLon = Number(lon);
  if (!Number.isFinite(userLat) || !Number.isFinite(userLon)) return items;

  return items.filter((it) => {
    const r       = it.regions || {};
    const itemLat = it.latitude  ?? r.center_latitude;
    const itemLon = it.longitude ?? r.center_longitude;
    if (itemLat == null || itemLon == null) return true;

    const radius = Number(
      radiusOverrideKm ?? it.service_radius_km ?? r.service_radius_km ?? 0,
    );
    if (!radius) return true;

    return haversineKm(userLat, userLon, Number(itemLat), Number(itemLon)) <= radius;
  });
}
