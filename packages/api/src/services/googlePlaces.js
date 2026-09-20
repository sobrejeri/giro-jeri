// ── googlePlaces.js ────────────────────────────────────────────────────────
// Busca a foto de um estabelecimento no Google Places API (New) e devolve os
// BYTES da imagem, para guardarmos no nosso storage — nunca a URL do Google
// direto (expõe a chave e pode expirar). Fluxo:
//   1) places:searchText  → acha o lugar por nome + localidade (viés na região)
//   2) {photo.name}/media → resolve a URL final da foto (skipHttpRedirect)
//   3) baixa os bytes
// Best-effort: qualquer falha (sem chave, lugar não achado, cota) devolve null,
// nunca lança — cadastrar/editar um estabelecimento não pode quebrar por isso.

const CENTRO_JERI = { latitude: -2.7975, longitude: -40.5137 };

export async function buscarFotoDoLugar({ name, locality, lat, lng, maxWidthPx = 1200 } = {}) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !name) return null;

  const center = Number.isFinite(lat) && Number.isFinite(lng)
    ? { latitude: Number(lat), longitude: Number(lng) }
    : CENTRO_JERI;
  const textQuery = [name, locality || 'Jericoacoara', 'Ceará', 'Brasil']
    .filter(Boolean).join(', ');

  try {
    // 1) Text Search (New) — só os campos que usamos, para não pagar a mais.
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.photos',
      },
      body: JSON.stringify({
        textQuery,
        languageCode:    'pt-BR',
        regionCode:      'BR',
        maxResultCount:  1,
        locationBias:    { circle: { center, radius: 30000 } },
      }),
    });
    const searchJson = await searchRes.json();
    if (!searchRes.ok) {
      console.warn('[googlePlaces] searchText status=%d %s', searchRes.status, searchJson.error?.message || '');
      return null;
    }
    const place = searchJson.places?.[0];
    const photoName = place?.photos?.[0]?.name;   // "places/XXX/photos/YYY"
    if (!photoName) return null;

    // 2) Resolve a URL final da foto (JSON, sem redirect) e 3) baixa os bytes.
    const mediaUrl = `https://places.googleapis.com/v1/${photoName}/media`
      + `?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
    const mediaRes = await fetch(mediaUrl);
    const mediaJson = await mediaRes.json();
    const photoUri = mediaJson?.photoUri;
    if (!mediaRes.ok || !photoUri) {
      console.warn('[googlePlaces] media status=%d %s', mediaRes.status, mediaJson?.error?.message || '');
      return null;
    }

    const imgRes = await fetch(photoUri);
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!/^image\//.test(contentType)) return null;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    if (!buffer.byteLength || buffer.byteLength > 8 * 1024 * 1024) return null;

    return { buffer, contentType, placeId: place.id || null };
  } catch (err) {
    console.warn('[googlePlaces] falhou:', err.message);
    return null;
  }
}
