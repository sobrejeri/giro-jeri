import { Router } from 'express';
import { supabase } from '../supabase.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// ── GET /api/explore/map ───────────────────────────────────────────────────
// Descoberta geográfica do "Explorar Turiva". SÓ ADMIN por enquanto (o cliente
// não vê nada até liberarmos). Devolve, dentro do bounding-box atualmente
// visível no mapa, um payload LEVE de pins: lugares (establishments) e serviços
// (tours/transfers) que têm coordenadas. Sem PostGIS — filtro por faixa de
// lat/lng (índices btree em (latitude, longitude), migration 104).
router.get('/map', requireAdmin, async (req, res, next) => {
  try {
    const swLat = Number(req.query.sw_lat), swLng = Number(req.query.sw_lng);
    const neLat = Number(req.query.ne_lat), neLng = Number(req.query.ne_lng);
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const types = String(req.query.types || 'places,tours,transfers')
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

    const out = { places: [], tours: [], transfers: [] };

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

    if (types.includes('tours')) {
      const { data, error } = await noBox(
        supabase.from('tours')
          .select('id, name, slug, cover_image_url, latitude, longitude')
          .eq('is_active', true),
      );
      if (error) throw error;
      out.tours = (data || []).map((t) => ({
        id: t.id, kind: 'tour', name: t.name, slug: t.slug || null,
        thumb: t.cover_image_url || null, lat: Number(t.latitude), lng: Number(t.longitude),
      }));
    }

    if (types.includes('transfers')) {
      const { data, error } = await noBox(
        supabase.from('transfers')
          .select('id, name, latitude, longitude')
          .eq('is_active', true),
      );
      if (error) throw error;
      out.transfers = (data || []).map((t) => ({
        id: t.id, kind: 'transfer', name: t.name,
        lat: Number(t.latitude), lng: Number(t.longitude),
      }));
    }

    res.json(out);
  } catch (err) { next(err); }
});

export default router;
