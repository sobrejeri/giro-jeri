// ── services/geoapify.js ───────────────────────────────
// Adaptador do Geoapify Places API (dados do OpenStreetMap).
// A chave fica só no servidor (env GEOAPIFY_API_KEY) — nunca exposta ao app.
// Dados do OSM são livremente cacheáveis; usamos cache em memória pra
// reduzir chamadas e manter dentro da cota gratuita.

const BASE = 'https://api.geoapify.com/v2/places';

// Mapeia nossas 3 categorias → categorias do Geoapify/OSM
const CATEGORY_MAP = {
  hospedagem:  ['accommodation.hotel', 'accommodation.guest_house', 'accommodation.hostel', 'accommodation.motel', 'accommodation.apartment', 'accommodation.chalet'],
  gastronomia: ['catering.restaurant', 'catering.cafe', 'catering.bar', 'catering.pub', 'catering.fast_food', 'catering.ice_cream'],
  compras:     ['commercial.gift_and_souvenir', 'commercial.clothing', 'commercial.marketplace', 'commercial.outdoor_and_sport', 'commercial.art', 'commercial.books', 'commercial.health_and_beauty'],
};

function ourCategory(cats = []) {
  if (cats.some((c) => c.startsWith('accommodation'))) return 'hospedagem';
  if (cats.some((c) => c.startsWith('catering')))      return 'gastronomia';
  if (cats.some((c) => c.startsWith('commercial')))    return 'compras';
  return null;
}

// Cache simples em memória: key → { at, data }
const cache = new Map();
const TTL = 60 * 60 * 1000; // 1 hora

export function isEnabled() {
  return !!process.env.GEOAPIFY_API_KEY;
}

export async function fetchNearby({ lat, lon, radius = 8000, category }) {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return { enabled: false, results: [] };

  const cats = category && CATEGORY_MAP[category]
    ? CATEGORY_MAP[category]
    : Object.values(CATEGORY_MAP).flat();

  // Arredonda coordenadas (~110m) para estabilizar o cache
  const rLat = Number(lat).toFixed(3);
  const rLon = Number(lon).toFixed(3);
  const cacheKey = `${rLat},${rLon},${radius},${category || 'all'}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return { enabled: true, results: hit.data };

  const url = `${BASE}?categories=${encodeURIComponent(cats.join(','))}`
    + `&filter=circle:${rLon},${rLat},${radius}`
    + `&bias=proximity:${rLon},${rLat}`
    + `&limit=40&lang=pt&apiKey=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Geoapify ${res.status}: ${text.slice(0, 200)}`);
  }
  const json  = await res.json();
  const feats = Array.isArray(json.features) ? json.features : [];

  const seen = new Set();
  const results = [];
  for (const f of feats) {
    const p   = f.properties || {};
    const cat = ourCategory(p.categories);
    if (!cat) continue;
    const name = p.name || p.address_line1;
    if (!name) continue;
    const dedupeKey = name.toLowerCase().trim();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const raw = p.datasource?.raw || {};
    const phone     = p.contact?.phone || raw['contact:phone'] || raw.phone || raw['contact:mobile'] || null;
    const website   = p.website || raw.website || raw['contact:website'] || null;
    const instagram = raw['contact:instagram'] || null;

    results.push({
      id:          `geo:${p.place_id || `${p.lat},${p.lon}`}`,
      source:      'geoapify',
      name,
      category:    cat,
      description: p.address_line2 || p.formatted || null,
      address:     p.formatted || null,
      image_url:   null,            // OSM não fornece fotos
      whatsapp:    phone,
      instagram,
      website,
      maps_url:    (p.lat != null && p.lon != null)
        ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`
        : null,
      price_range: null,
      is_featured: false,
      distance:    p.distance ?? null,
    });
  }

  cache.set(cacheKey, { at: Date.now(), data: results });
  return { enabled: true, results };
}
