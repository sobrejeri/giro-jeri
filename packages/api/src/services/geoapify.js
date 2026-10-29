// ── services/geoapify.js ───────────────────────────────
// Adaptador do Geoapify Places API (dados do OpenStreetMap).
// A chave fica só no servidor (env GEOAPIFY_API_KEY) — nunca exposta ao app.
// Dados do OSM são livremente cacheáveis; usamos cache em memória pra
// reduzir chamadas e manter dentro da cota gratuita (3.000/dia no grátis).
//
// É a fonte ÚNICA do diretório "Descubra a Vila" — de propósito. O Google
// Places cobra por acesso (principalmente FOTOS) e o ToS proíbe cachear os
// dados dele, o que gerava custo recorrente. O Geoapify é gratuito e os dados
// do OSM podem ser guardados à vontade.

const BASE = 'https://api.geoapify.com/v2/places';

// Mapeia as 9 categorias do app → categorias do Geoapify/OSM.
// Só usamos IDs de categoria que existem no Geoapify — um ID inválido derruba
// a requisição inteira (400). Por isso o SAFE_CATS abaixo, como rede.
const CATEGORY_MAP = {
  gastronomia: ['catering.restaurant', 'catering.cafe', 'catering.fast_food', 'catering.ice_cream'],
  bar:         ['catering.bar', 'catering.pub'],
  hospedagem:  ['accommodation.hotel', 'accommodation.guest_house', 'accommodation.hostel', 'accommodation.motel', 'accommodation.apartment', 'accommodation.chalet'],
  mercado:     ['commercial.supermarket', 'commercial.convenience', 'commercial.marketplace'],
  farmacia:    ['healthcare.pharmacy'],
  beleza:      ['service.beauty', 'commercial.health_and_beauty'],
  moda:        ['commercial.clothing'],
  // OSM não tem categoria limpa de kitesurf; puxamos esporte/clube e filtramos
  // pelo NOME em ourCategory (Jeri é destino de kite, a cobertura costuma vir
  // marcada como sport/activity).
  kite:        ['sport', 'activity.sport_club'],
  compras:     ['commercial.gift_and_souvenir', 'commercial.outdoor_and_sport', 'commercial.art', 'commercial.books'],
};

// Categorias pedidas SÓ sob demanda (?category=...), nunca na consulta "todas":
// se um ID daqui não existir no Geoapify, a recusa (400) derruba só esta
// consulta — o diretório "Descubra a Vila" não é afetado. Praça, no OSM do
// Brasil, costuma vir marcada como parque. Usada nas sugestões de "lugares
// próximos" do ponto de partida (passeio/translado personalizados).
const EXTRA_CATEGORY_MAP = {
  praca: ['leisure.park'],
};

// Subconjunto comprovadamente válido — usado como fallback se a lista completa
// for recusada por algum ID de categoria que o Geoapify não reconheça.
const SAFE_CATS = [
  ...CATEGORY_MAP.gastronomia, ...CATEGORY_MAP.bar, ...CATEGORY_MAP.hospedagem,
  ...CATEGORY_MAP.compras,
];

const KITE_RE = /kite|kitesurf|wind|downwind|\bsup\b|stand\s?up|vela|aventura|adventure|buggy|lagoa|duna/i;

// Classifica um resultado do Geoapify numa das nossas 9 categorias.
// Ordem importa: específicas (bar, farmácia, beleza, mercado, moda) antes das
// genéricas (gastronomia/compras). Esporte/lazer só entra se o nome indicar kite.
function ourCategory(cats = [], name = '') {
  const has = (p) => cats.some((c) => c === p || c.startsWith(`${p}.`));
  if (has('accommodation')) return 'hospedagem';
  if (has('catering.bar') || has('catering.pub')) return 'bar';
  if (has('catering')) return 'gastronomia';
  if (has('healthcare.pharmacy')) return 'farmacia';
  if (has('service.beauty') || has('commercial.health_and_beauty')) return 'beleza';
  if (has('commercial.supermarket') || has('commercial.convenience') || has('commercial.marketplace')) return 'mercado';
  if (has('commercial.clothing')) return 'moda';
  if (has('sport') || has('activity') || has('leisure')) {
    return KITE_RE.test(name) ? 'kite' : null;   // esporte sem cara de kite: descarta
  }
  if (has('commercial')) return 'compras';
  return null;
}

// Cache simples em memória: key → { at, data }
const cache = new Map();
const TTL = 60 * 60 * 1000; // 1 hora

export function isEnabled() {
  return !!process.env.GEOAPIFY_API_KEY;
}

async function pedir(cats, { rLat, rLon, radius, key }) {
  const url = `${BASE}?categories=${encodeURIComponent(cats.join(','))}`
    + `&filter=circle:${rLon},${rLat},${radius}`
    + `&bias=proximity:${rLon},${rLat}`
    + `&limit=100&lang=pt&apiKey=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Geoapify ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return Array.isArray(json.features) ? json.features : [];
}

export async function fetchNearby({ lat, lon, radius = 8000, category }) {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return { enabled: false, results: [] };

  const extra = category ? EXTRA_CATEGORY_MAP[category] : null;
  const cats = category && CATEGORY_MAP[category]
    ? CATEGORY_MAP[category]
    : extra || Object.values(CATEGORY_MAP).flat();

  // Arredonda coordenadas (~110m) para estabilizar o cache
  const rLat = Number(lat).toFixed(3);
  const rLon = Number(lon).toFixed(3);
  const cacheKey = `${rLat},${rLon},${radius},${category || 'all'}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL) return { enabled: true, results: hit.data };

  let feats;
  try {
    feats = await pedir(cats, { rLat, rLon, radius, key });
  } catch (err) {
    // Um ID de categoria inválido derruba a requisição (400). Em vez de deixar
    // o diretório vazio, tenta de novo só com as categorias comprovadas.
    if (err.status === 400 && !category) {
      console.warn('[geoapify] lista completa recusada, usando SAFE_CATS:', err.message);
      feats = await pedir(SAFE_CATS, { rLat, rLon, radius, key });
    } else if (extra) {
      // Categoria extra recusada/indisponível: guarda o "vazio" no cache para
      // não repetir a chamada (e gastar a cota grátis) a cada pedido.
      console.warn(`[geoapify] categoria extra "${category}" indisponível:`, err.message);
      cache.set(cacheKey, { at: Date.now(), data: [] });
      return { enabled: true, results: [] };
    } else {
      throw err;
    }
  }

  const seen = new Set();
  const results = [];
  for (const f of feats) {
    const p   = f.properties || {};
    const name = p.name || p.address_line1;
    if (!name) continue;
    // Categoria extra: tudo o que veio dela é dela (não passa pelo ourCategory,
    // que descartaria lazer sem cara de kite).
    const cat = extra ? category : ourCategory(p.categories, name);
    if (!cat) continue;
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
      // Coordenadas do lugar: viram o pin de embarque quando o turista escolhe
      // um "lugar próximo" como ponto de partida.
      lat:         p.lat ?? null,
      lon:         p.lon ?? null,
    });
  }

  // Mais pertos primeiro (quando o Geoapify devolve a distância).
  results.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));

  cache.set(cacheKey, { at: Date.now(), data: results });
  return { enabled: true, results };
}
