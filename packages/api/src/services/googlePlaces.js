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

// Tipos do Places API (New) por categoria nossa.
const TIPOS = {
  hospedagem:  ['lodging', 'hotel', 'bed_and_breakfast', 'guest_house', 'resort_hotel', 'motel'],
  gastronomia: ['restaurant', 'cafe', 'bar', 'bakery', 'coffee_shop', 'fast_food_restaurant', 'ice_cream_shop'],
  compras:     ['store', 'clothing_store', 'gift_shop', 'shopping_mall', 'market', 'jewelry_store', 'book_store'],
};
// Do primaryType do Google de volta para a nossa categoria (para etiquetar).
function nossaCategoria(primaryType = '') {
  for (const [cat, tipos] of Object.entries(TIPOS)) if (tipos.includes(primaryType)) return cat;
  if (/hotel|lodging|guest|resort|motel|inn|hostel/i.test(primaryType)) return 'hospedagem';
  if (/restaurant|cafe|bar|food|bakery|coffee|meal/i.test(primaryType))  return 'gastronomia';
  if (/store|shop|market|mall/i.test(primaryType))                       return 'compras';
  return 'gastronomia';
}
const FAIXA_PRECO = { PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };

// Cache em memória do NEARBY. ToS do Google: conteúdo do Places não é
// persistido no banco; cache curto em memória (< 30 dias) é permitido e corta
// custo/latência. TTL de 6h.
const nearbyCache = new Map();
const NEARBY_TTL = 6 * 60 * 60 * 1000;

async function buscarPorTipos({ center, radius, tipos, key }) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   key,
      'X-Goog-FieldMask': [
        'places.id', 'places.displayName', 'places.primaryType', 'places.rating',
        'places.userRatingCount', 'places.formattedAddress', 'places.location',
        'places.googleMapsUri', 'places.photos', 'places.priceLevel',
        'places.internationalPhoneNumber', 'places.websiteUri', 'places.regularOpeningHours',
      ].join(','),
    },
    body: JSON.stringify({
      includedTypes:   tipos,
      maxResultCount:  20,
      rankPreference:  'POPULARITY',
      languageCode:    'pt-BR',
      regionCode:      'BR',
      locationRestriction: { circle: { center, radius: Math.min(Number(radius) || 15000, 50000) } },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.warn('[googlePlaces] searchNearby status=%d %s', res.status, json.error?.message || '');
    return [];
  }
  return json.places || [];
}

// Descoberta AO VIVO de estabelecimentos por região (Google Places New).
// Mesma forma de saída do adaptador Geoapify, com nota + foto reais. As fotos
// vêm como URL do nosso proxy (/photo) — resolvido só quando exibido, para
// não pagar foto que ninguém vê e não expor a chave.
export async function descobrirLugaresProximos({ lat, lng, radius = 15000, category, photoBase }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { enabled: false, results: [] };
  const center = Number.isFinite(lat) && Number.isFinite(lng)
    ? { latitude: Number(lat), longitude: Number(lng) } : CENTRO_JERI;

  const cats = category && TIPOS[category] ? [category] : Object.keys(TIPOS);
  const cacheKey = `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)},${radius},${category || 'all'}`;
  const hit = nearbyCache.get(cacheKey);
  if (hit && Date.now() - hit.at < NEARBY_TTL) return { enabled: true, results: hit.data };

  try {
    const lotes = await Promise.all(
      cats.map((c) => buscarPorTipos({ center, radius, tipos: TIPOS[c], key })
        .then((places) => places.map((p) => ({ p, catQuery: c })))),
    );
    const seen = new Set();
    const results = [];
    for (const { p, catQuery } of lotes.flat()) {
      const name = p.displayName?.text;
      if (!name || seen.has(p.id)) continue;
      seen.add(p.id);
      const photoName = p.photos?.[0]?.name || null;
      results.push({
        id:           `g:${p.id}`,
        source:       'google',
        name,
        category:     nossaCategoria(p.primaryType) || catQuery,
        description:  p.formattedAddress || null,
        address:      p.formattedAddress || null,
        image_url:    photoName && photoBase ? `${photoBase}?name=${encodeURIComponent(photoName)}` : null,
        rating:       p.rating || null,
        avg_rating:   p.rating || null,   // PlaceCard usa avg_rating para as estrelas
        review_count: p.userRatingCount || 0,
        whatsapp:     p.internationalPhoneNumber ? p.internationalPhoneNumber.replace(/\D/g, '') : null,
        website:      p.websiteUri || null,
        instagram:    null,
        maps_url:     p.googleMapsUri || (p.location
          ? `https://www.google.com/maps/search/?api=1&query=${p.location.latitude},${p.location.longitude}`
          : null),
        price_range:  FAIXA_PRECO[p.priceLevel] || null,
        is_featured:  false,
      });
    }
    // Reputação primeiro: maior nota, depois mais avaliações.
    results.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.review_count || 0) - (a.review_count || 0));
    nearbyCache.set(cacheKey, { at: Date.now(), data: results });
    return { enabled: true, results };
  } catch (err) {
    console.warn('[googlePlaces] descobrir falhou:', err.message);
    return { enabled: false, results: [] };
  }
}

// Resolve a URL final de uma foto do Places (usada pelo proxy /photo).
const photoCache = new Map();
const PHOTO_TTL = 24 * 60 * 60 * 1000;
export async function resolverFotoUrl(photoName, maxWidthPx = 800) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !photoName) return null;
  const ck = `${photoName}@${maxWidthPx}`;
  const hit = photoCache.get(ck);
  if (hit && Date.now() - hit.at < PHOTO_TTL) return hit.url;
  try {
    const url = `https://places.googleapis.com/v1/${photoName}/media`
      + `?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || !json?.photoUri) return null;
    photoCache.set(ck, { at: Date.now(), url: json.photoUri });
    return json.photoUri;
  } catch { return null; }
}

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
