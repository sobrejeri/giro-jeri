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

// Taxonomia de categorias do diretório. Cada uma mapeia para tipos do Places
// (New e legado) e, quando não há tipo próprio (ex.: escola de kite), para uma
// palavra-chave. A ORDEM importa: as específicas vêm antes da genérica "compras"
// (store) para o mesmo lugar ser etiquetado na categoria mais precisa (dedupe
// por place_id mantém a primeira ocorrência). Etiquetamos pela busca feita —
// não pelo tipo devolvido — então a categoria fica correta.
const CATEGORIAS = {
  gastronomia: { new: ['restaurant', 'cafe', 'bakery'],                         legacy: ['restaurant'] },
  bar:         { new: ['bar', 'pub'],                                           legacy: ['bar'] },
  hospedagem:  { new: ['lodging', 'hotel', 'guest_house', 'resort_hotel', 'motel'], legacy: ['lodging'] },
  mercado:     { new: ['supermarket', 'grocery_store', 'convenience_store'],    legacy: ['supermarket', 'convenience_store'] },
  farmacia:    { new: ['pharmacy', 'drugstore'],                                legacy: ['pharmacy'] },
  beleza:      { new: ['hair_salon', 'barber_shop', 'beauty_salon'],            legacy: ['hair_care', 'beauty_salon'] },
  moda:        { new: ['clothing_store', 'shoe_store'],                         legacy: ['clothing_store', 'shoe_store'] },
  kite:        { newKeyword: 'kitesurf', legacyKeyword: 'kitesurf' },
  compras:     { new: ['store', 'gift_shop'],                                   legacy: ['store'] },
};
const ORDEM_CATS = Object.keys(CATEGORIAS);
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

// Busca por texto (New) — para categorias sem tipo próprio (ex.: escola de kite).
async function buscarTextoNew({ center, radius, textQuery, key }) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type':   'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': [
        'places.id', 'places.displayName', 'places.primaryType', 'places.rating',
        'places.userRatingCount', 'places.formattedAddress', 'places.location',
        'places.googleMapsUri', 'places.photos', 'places.priceLevel',
        'places.internationalPhoneNumber', 'places.websiteUri',
      ].join(','),
    },
    body: JSON.stringify({
      textQuery, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 20,
      locationBias: { circle: { center, radius: Math.min(Number(radius) || 15000, 50000) } },
    }),
  });
  const json = await res.json();
  if (!res.ok) { console.warn('[googlePlaces] searchText status=%d %s', res.status, json.error?.message || ''); return []; }
  return json.places || [];
}

// ── Fallback LEGADO (Places API antiga) ────────────────────────────────────
// A chave do projeto pode ter só a API legada habilitada (é o que faz o
// Autocomplete funcionar via fallback). O Nearby (New) então volta vazio. Aqui
// usamos o Nearby Search legado, que a mesma chave aceita, para o diretório não
// ficar vazio sem precisar habilitar nada novo no Google Cloud.
const FAIXA_LEGADO = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

async function buscarLegadoNearby({ center, radius, type, keyword, key }) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${center.latitude},${center.longitude}`);
  url.searchParams.set('radius', String(Math.min(Number(radius) || 15000, 50000)));
  if (type)    url.searchParams.set('type', type);
  if (keyword) url.searchParams.set('keyword', keyword);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('key', key);
  const res = await fetch(url);
  const json = await res.json();
  if (json.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    console.warn('[googlePlaces] nearby legado status=%s %s', json.status, json.error_message || '');
  }
  return json.results || [];
}

async function descobrirLegado({ center, radius, cats, photoBase }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const tarefas = [];
  for (const c of cats) {
    const cfg = CATEGORIAS[c]; if (!cfg) continue;
    if (cfg.legacyKeyword) {
      tarefas.push(buscarLegadoNearby({ center, radius, keyword: cfg.legacyKeyword, key })
        .then((rs) => rs.map((r) => ({ r, cat: c }))).catch(() => []));
    }
    for (const type of (cfg.legacy || [])) {
      tarefas.push(buscarLegadoNearby({ center, radius, type, key })
        .then((rs) => rs.map((r) => ({ r, cat: c }))).catch(() => []));
    }
  }
  const lotes = await Promise.all(tarefas);
  const seen = new Set();
  const results = [];
  for (const { r, cat } of lotes.flat()) {
    if (!r.name || seen.has(r.place_id)) continue;
    seen.add(r.place_id);
    const ref = r.photos?.[0]?.photo_reference || null;
    const loc = r.geometry?.location;
    results.push({
      id:           `g:${r.place_id}`,
      source:       'google',
      name:         r.name,
      category:     cat,
      description:  r.vicinity || null,
      address:      r.vicinity || null,
      image_url:    ref && photoBase ? `${photoBase}?ref=${encodeURIComponent(ref)}` : null,
      rating:       r.rating || null,
      avg_rating:   r.rating || null,
      review_count: r.user_ratings_total || 0,
      whatsapp:     null,
      website:      null,
      instagram:    null,
      maps_url:     loc ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}&query_place_id=${r.place_id}` : null,
      price_range:  FAIXA_LEGADO[r.price_level] || null,
      is_featured:  false,
    });
  }
  results.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.review_count || 0) - (a.review_count || 0));
  return results;
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

  const cats = category && CATEGORIAS[category] ? [category] : ORDEM_CATS;
  const cacheKey = `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)},${radius},${category || 'all'}`;
  const hit = nearbyCache.get(cacheKey);
  if (hit && Date.now() - hit.at < NEARBY_TTL) return { enabled: true, results: hit.data };

  try {
    const lotes = await Promise.all(
      cats.map((c) => {
        const cfg = CATEGORIAS[c];
        const req = cfg.newKeyword
          ? buscarTextoNew({ center, radius, textQuery: cfg.newKeyword, key })
          : buscarPorTipos({ center, radius, tipos: cfg.new, key });
        return req.then((places) => places.map((p) => ({ p, catQuery: c }))).catch(() => []);
      }),
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
        category:     catQuery,
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

    // Nada na API New (provável: só a API legada está habilitada) → tenta o
    // Nearby legado com a mesma chave.
    if (!results.length) {
      const leg = await descobrirLegado({ center, radius, cats, photoBase });
      nearbyCache.set(cacheKey, { at: Date.now(), data: leg });
      return { enabled: leg.length > 0, results: leg };
    }

    nearbyCache.set(cacheKey, { at: Date.now(), data: results });
    return { enabled: true, results };
  } catch (err) {
    console.warn('[googlePlaces] descobrir falhou:', err.message);
    try {
      const center2 = Number.isFinite(lat) && Number.isFinite(lng)
        ? { latitude: Number(lat), longitude: Number(lng) } : CENTRO_JERI;
      const leg = await descobrirLegado({ center: center2, radius, cats, photoBase });
      return { enabled: leg.length > 0, results: leg };
    } catch { return { enabled: false, results: [] }; }
  }
}

// Diagnóstico: faz uma chamada New e uma legada e devolve os status/erros
// (sem a chave). Usado por /nearby?debug=1 para revelar por que veio vazio.
export async function diagnosticarPlaces({ lat, lng } = {}) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const out = { keyPresent: !!key, keyTail: key ? `…${key.slice(-4)}` : null };
  const center = Number.isFinite(lat) && Number.isFinite(lng)
    ? { latitude: Number(lat), longitude: Number(lng) } : CENTRO_JERI;
  if (!key) return out;
  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id' },
      body: JSON.stringify({ includedTypes: ['restaurant'], maxResultCount: 5,
        locationRestriction: { circle: { center, radius: 15000 } } }),
    });
    const j = await r.json();
    out.new = { httpStatus: r.status, error: j.error?.status || j.error?.message || null, count: (j.places || []).length };
  } catch (e) { out.new = { error: e.message }; }
  try {
    const u = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    u.searchParams.set('location', `${center.latitude},${center.longitude}`);
    u.searchParams.set('radius', '15000'); u.searchParams.set('type', 'restaurant'); u.searchParams.set('key', key);
    const r = await fetch(u);
    const j = await r.json();
    out.legacy = { httpStatus: r.status, status: j.status, error: j.error_message || null, count: (j.results || []).length };
  } catch (e) { out.legacy = { error: e.message }; }
  return out;
}

// Baixa os BYTES da foto (New por `name`, legada por `ref`) para o proxy
// transmitir direto ao cliente. Mais robusto que seguir redirect, e a chave
// nunca sai do servidor. Devolve { buffer, contentType } ou null.
export async function fotoBytes({ name, ref, maxWidth = 800 }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || (!name && !ref)) return null;
  const url = ref
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`
    : `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidth}&key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url);   // segue o redirect até a imagem final
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !/^image\//.test(ct)) {
      console.warn('[googlePlaces] fotoBytes status=%d ct=%s', res.status, ct);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.byteLength) return null;
    return { buffer, contentType: ct };
  } catch (e) { console.warn('[googlePlaces] fotoBytes falhou:', e.message); return null; }
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

// Foto pela API LEGADA: o endpoint /place/photo responde 302 para a imagem
// final (googleusercontent, sem a chave). Seguimos o redirect no servidor e
// devolvemos só a URL final — a chave nunca sai daqui.
export async function resolverFotoLegadaUrl(ref, maxWidth = 800) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !ref) return null;
  const ck = `leg:${ref}@${maxWidth}`;
  const hit = photoCache.get(ck);
  if (hit && Date.now() - hit.at < PHOTO_TTL) return hit.url;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}`
      + `&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`;
    // Segue o redirect (o fetch do Node com redirect:'manual' devolve resposta
    // opaca, sem o Location). res.url passa a ser a URL final da imagem
    // (googleusercontent, SEM a chave). Cancelamos o corpo para não baixar tudo.
    const res = await fetch(url, { redirect: 'follow' });
    const finalUrl = res.url;
    try { await res.body?.cancel?.(); } catch { /* ignore */ }
    if (!res.ok || !finalUrl || finalUrl.includes('maps.googleapis.com')) return null;
    photoCache.set(ck, { at: Date.now(), url: finalUrl });
    return finalUrl;
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
