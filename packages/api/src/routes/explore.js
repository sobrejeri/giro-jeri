import { Router } from 'express';
import { supabase } from '../supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ── GET /api/explore/map ───────────────────────────────────────────────────
// Descoberta geográfica do "Explorar Turiva". SÓ ADMIN por enquanto (o cliente
// não vê nada até liberarmos). Devolve, dentro do bounding-box atualmente
// visível no mapa, um payload LEVE de pins: lugares (establishments) e serviços
// (tours/transfers) que têm coordenadas. Sem PostGIS — filtro por faixa de
// lat/lng (índices btree em (latitude, longitude), migration 104).
router.get('/map', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const swLat = Number(req.query.sw_lat), swLng = Number(req.query.sw_lng);
    const neLat = Number(req.query.ne_lat), neLng = Number(req.query.ne_lng);
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const types = String(req.query.types || 'places,tours,transfers,stories,highlights')
      .split(',').map((s) => s.trim()).filter(Boolean);

    if ([swLat, swLng, neLat, neLng].some((n) => Number.isNaN(n))) {
      return res.status(400).json({ error: 'Informe sw_lat, sw_lng, ne_lat, ne_lng.' });
    }
    const latLo = Math.min(swLat, neLat), latHi = Math.max(swLat, neLat);
    const lngLo = Math.min(swLng, neLng), lngHi = Math.max(swLng, neLng);

    // Aplica o bounding-box a um builder já com select()/eq() prontos.
    const noBox = (q) => q
      .not('latitude', 'is', null).not('longitude', 'is', null)
      .gte('latitude', latLo).lte('latitude', latHi)
      .gte('longitude', lngLo).lte('longitude', lngHi)
      .limit(limit);

    // Regiões visíveis (centro dentro do bbox). Passeio/transfer SEM coordenada
    // própria herda o centro da região (migration 008: "quando NULL, herdam da
    // região") — assim eles aparecem no mapa mesmo sem lat/lng por serviço.
    const { data: regs } = await supabase
      .from('regions')
      .select('id, center_latitude, center_longitude')
      .eq('is_active', true)
      .not('center_latitude', 'is', null).not('center_longitude', 'is', null)
      .gte('center_latitude', latLo).lte('center_latitude', latHi)
      .gte('center_longitude', lngLo).lte('center_longitude', lngHi);
    const regById = new Map((regs || []).map((r) => [r.id, r]));
    const regIds  = [...regById.keys()];
    const coordDe = (row) => {
      if (row.latitude != null && row.longitude != null) return { lat: Number(row.latitude), lng: Number(row.longitude) };
      let r = regById.get(row.region_id);
      if (!r && Array.isArray(row.region_ids)) { const hit = row.region_ids.find((id) => regById.has(id)); if (hit) r = regById.get(hit); }
      return r ? { lat: Number(r.center_latitude), lng: Number(r.center_longitude) } : null;
    };

    const out = { places: [], tours: [], transfers: [], stories: [], highlights: [] };

    if (types.includes('places')) {
      const { data, error } = await noBox(
        supabase.from('establishments')
          .select('id, name, category, image_url, latitude, longitude')
          .eq('is_active', true),
      );
      if (error) throw error;
      out.places = (data || []).map((e) => ({
        id: e.id, kind: 'place', name: e.name, category: e.category || null,
        thumb: e.image_url || null, lat: Number(e.latitude), lng: Number(e.longitude),
      }));
    }

    // Passeios/transfers das regiões visíveis (posicionados na coord própria ou,
    // faltando, no centro da região).
    if (types.includes('tours') && regIds.length) {
      const { data, error } = await supabase
        .from('tours')
        .select('id, name, slug, cover_image_url, latitude, longitude, region_id, region_ids')
        .eq('is_active', true)
        .or(`region_id.in.(${regIds.join(',')}),region_ids.ov.{${regIds.join(',')}}`)
        .limit(limit);
      if (error) throw error;
      out.tours = (data || []).map((t) => {
        const c = coordDe(t); if (!c) return null;
        return { id: t.id, kind: 'tour', name: t.name, slug: t.slug || null, thumb: t.cover_image_url || null, ...c };
      }).filter(Boolean);
    }

    if (types.includes('transfers') && regIds.length) {
      const { data, error } = await supabase
        .from('transfers')
        .select('id, name, latitude, longitude, region_id, region_ids')
        .eq('is_active', true)
        .or(`region_id.in.(${regIds.join(',')}),region_ids.ov.{${regIds.join(',')}}`)
        .limit(limit);
      if (error) throw error;
      out.transfers = (data || []).map((t) => {
        const c = coordDe(t); if (!c) return null;
        return { id: t.id, kind: 'transfer', name: t.name, ...c };
      }).filter(Boolean);
    }

    // Stories (avatar_stories, ativos) e destaques (story_highlights) com
    // coordenadas → o front agrupa por localização no mesmo pin. Tolerante: se a
    // coluna geo ainda não existe (migration 105), o erro vira lista vazia.
    if (types.includes('stories')) {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('avatar_stories')
        .select('id, caption, media_url, media_type, created_at, latitude, longitude, created_by_user_id, author:created_by_user_id ( full_name, profile_photo_url, user_type )')
        .gt('expires_at', nowIso)
        .not('latitude', 'is', null).not('longitude', 'is', null)
        .gte('latitude', latLo).lte('latitude', latHi)
        .gte('longitude', lngLo).lte('longitude', lngHi)
        .limit(limit);
      if (!error) out.stories = (data || []).map((s) => ({
        id: s.id, kind: 'story', lat: Number(s.latitude), lng: Number(s.longitude),
        caption: s.caption || null, media_url: s.media_url, media_type: s.media_type,
        created_at: s.created_at, author_id: s.created_by_user_id || null,
        author_name: s.author?.user_type === 'admin' ? 'Turiva' : (s.author?.full_name || 'Operador'),
        author_avatar: s.author?.profile_photo_url || null,
      }));
    }

    if (types.includes('highlights')) {
      const { data, error } = await supabase
        .from('story_highlights')
        .select('id, title, cover_image_url, created_at, latitude, longitude')
        .eq('is_active', true)
        .not('latitude', 'is', null).not('longitude', 'is', null)
        .gte('latitude', latLo).lte('latitude', latHi)
        .gte('longitude', lngLo).lte('longitude', lngHi)
        .limit(limit);
      if (!error) out.highlights = (data || []).map((h) => ({
        id: h.id, kind: 'highlight', lat: Number(h.latitude), lng: Number(h.longitude),
        title: h.title, thumb: h.cover_image_url || null, created_at: h.created_at,
      }));
    }

    res.json(out);
  } catch (err) { next(err); }
});

export default router;
