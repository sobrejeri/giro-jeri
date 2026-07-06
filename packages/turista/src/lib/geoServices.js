import { loadGoogleMaps } from '../components/GoogleMap'

const JERI = { lat: -2.7976, lng: -40.5147 }
const HAS_KEY  = !!import.meta.env.VITE_GOOGLE_MAPS_KEY
const API_BASE = import.meta.env.VITE_API_URL || ''

// ---------------------------------------------------------------------------
// Internal helpers — Google (throws on failure) + Nominatim/Overpass fallbacks
// ---------------------------------------------------------------------------

async function googleSuggestions(input, center) {
  // Places API (New): AutocompleteSuggestion substitui o AutocompleteService
  // legado, que o Google bloqueou para chaves criadas após mar/2025.
  await loadGoogleMaps()
  const { AutocompleteSuggestion } = await window.google.maps.importLibrary('places')
  const lat = center.lat ?? JERI.lat
  const lng = center.lng ?? center.lon ?? JERI.lng
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input,
    language:            'pt-BR',
    region:              'br',
    includedRegionCodes: ['br'],
    locationBias:        { center: { lat, lng }, radius: 50000 },
  })
  return (suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      place_id:       p.placeId,
      display_name:   p.text?.text ?? '',
      main_text:      p.mainText?.text ?? (p.text?.text ?? '').split(',')[0],
      secondary_text: p.secondaryText?.text ?? '',
      lat:            null,
      lon:            null,
      _source:        'google',
    }))
}

async function nominatimSearch(input, center) {
  const lng = center?.lng ?? center?.lon ?? JERI.lng
  const lat = center?.lat ?? JERI.lat
  const viewbox = `${lng - 1.5},${lat + 1.5},${lng + 1.5},${lat - 1.5}`
  const params = new URLSearchParams({
    q:                 input,
    format:            'json',
    limit:             '6',
    countrycodes:      'br',
    viewbox,
    bounded:           '0',
    'accept-language': 'pt-BR',
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    { headers: { 'User-Agent': 'Turiva/1.0' } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.map((item) => ({
    place_id:       item.place_id,
    display_name:   item.display_name,
    main_text:      item.display_name.split(',')[0],
    secondary_text: item.display_name.split(',').slice(1).join(',').trim(),
    lat:            item.lat,
    lon:            item.lon,
    _source:        'nominatim',
  }))
}

// ---------------------------------------------------------------------------
// getPlaceSuggestions
// ---------------------------------------------------------------------------

// Último recurso: proxy no servidor (Google→Nominatim do lado do servidor).
// Salva o dia quando a chave do Google está restrita no cliente E o Nominatim
// recusa a origem por CORS/rate-limit (visto em produção).
async function serverSuggestions(input) {
  const res = await fetch(`${API_BASE}/api/transfers/places/autocomplete?q=${encodeURIComponent(input)}`)
  if (!res.ok) return []
  const data = await res.json()
  return (data?.predictions || []).map((p) => ({
    place_id:       p.id,
    display_name:   p.full || p.label,
    main_text:      p.label,
    secondary_text: p.sublabel || '',
    lat:            p.lat ?? null,
    lon:            p.lon ?? null,
    _source:        p.source === 'google' ? 'google' : 'nominatim',
  }))
}

/**
 * Sugestões de autocomplete para endereços.
 * Google Maps → Nominatim direto → proxy do servidor.
 */
export async function getPlaceSuggestions(input, center = JERI) {
  if (HAS_KEY) {
    try {
      const results = await googleSuggestions(input, center)
      if (results.length > 0) return results
    } catch {
      // fall through to server proxy
    }
  }
  // Proxy do servidor primeiro: usa a chave do servidor no Places (New),
  // então devolve resultado Google mesmo quando a chave do cliente falha.
  try {
    const results = await serverSuggestions(input)
    if (results.length > 0) return results
  } catch {
    // fall through to Nominatim
  }
  try {
    return await nominatimSearch(input, center)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// getPlaceDetails
// ---------------------------------------------------------------------------

/**
 * Detalhes (lat/lon/name) de um place_id Google.
 * SDK no navegador → proxy do servidor (quando a chave do cliente está
 * restrita mas o servidor tem chave própria).
 */
export async function getPlaceDetails(placeId) {
  if (HAS_KEY) {
    try {
      // Places API (New): classe Place substitui o PlacesService legado
      await loadGoogleMaps()
      const { Place } = await window.google.maps.importLibrary('places')
      const place = new Place({ id: placeId, requestedLanguage: 'pt-BR' })
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] })
      if (place.location) {
        return {
          name:    place.displayName ?? '',
          address: place.formattedAddress ?? '',
          lat:     String(place.location.lat()),
          lon:     String(place.location.lng()),
        }
      }
      throw new Error('sem_localizacao')
    } catch {
      // fall through to server proxy
    }
  }
  try {
    const res = await fetch(`${API_BASE}/api/transfers/places/details?place_id=${encodeURIComponent(placeId)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.details) return null
    return {
      name:    '',
      address: data.details.address || '',
      lat:     String(data.details.lat),
      lon:     String(data.details.lon),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// getNearbyLodging
// ---------------------------------------------------------------------------

/**
 * Lugares de hospedagem próximos.
 * Tenta Google Places; se falhar, usa Overpass.
 */
export async function getNearbyLodging(lat, lon, radiusKm = 10) {
  if (HAS_KEY) {
    try {
      // Places API (New): Place.searchNearby substitui o nearbySearch legado
      await loadGoogleMaps()
      const { Place } = await window.google.maps.importLibrary('places')
      const { places } = await Place.searchNearby({
        fields:               ['id', 'displayName', 'location', 'formattedAddress'],
        locationRestriction:  { center: { lat, lng: lon }, radius: Math.min(radiusKm * 1000, 50000) },
        includedPrimaryTypes: ['lodging'],
        maxResultCount:       20,
        language:             'pt-BR',
        region:               'br',
      })
      if (places?.length) {
        return places.map((p) => ({
          place_id:     p.id,
          display_name: p.displayName + (p.formattedAddress ? ', ' + p.formattedAddress : ''),
          lat:          String(p.location.lat()),
          lon:          String(p.location.lng()),
          _nearby:      true,
          _source:      'google',
        }))
      }
    } catch {
      // fall through to Overpass
    }
  }

  // Fallback: Overpass
  try {
    const radiusM = Math.round(radiusKm * 1000)
    const q = `[out:json][timeout:15];(node["tourism"~"hotel|hostel|guest_house|motel|pousada"](around:${radiusM},${lat},${lon});way["tourism"~"hotel|hostel|guest_house|motel|pousada"](around:${radiusM},${lat},${lon}););out center;`
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body:   q,
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.elements ?? [])
      .filter((e) => e.tags?.name)
      .map((e) => ({
        place_id:     e.id,
        display_name: e.tags.name,
        lat:          String(e.lat ?? e.center?.lat),
        lon:          String(e.lon ?? e.center?.lon),
        _nearby:      true,
        _source:      'osm',
      }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// reverseGeocode
// ---------------------------------------------------------------------------

/**
 * Geocodificação reversa — retorna "Cidade, UF" ou null.
 * Tenta Google Geocoder; se falhar, usa Nominatim.
 */
export async function reverseGeocode(lat, lon) {
  if (HAS_KEY) {
    try {
      const maps    = await loadGoogleMaps()
      const geocoder = new maps.Geocoder()
      const label = await new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat, lng: lon } }, (results, status) => {
          if (status !== maps.GeocoderStatus.OK || !results?.length) {
            reject(new Error(status))
            return
          }
          let locality = null
          let state    = null
          for (const result of results) {
            for (const comp of result.address_components) {
              if (
                !locality &&
                comp.types.some((t) =>
                  ['locality', 'sublocality_level_1', 'administrative_area_level_2'].includes(t)
                )
              ) {
                locality = comp.long_name
              }
              if (!state && comp.types.includes('administrative_area_level_1')) {
                state = comp.short_name
              }
            }
            if (locality && state) break
          }
          const l = [locality, state].filter(Boolean).join(', ') || null
          if (l) resolve(l)
          else reject(new Error('no_locality'))
        })
      })
      return label
    } catch {
      // fall through to Nominatim
    }
  }

  // Fallback: Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&accept-language=pt-BR`
    const res = await fetch(url, { headers: { 'User-Agent': 'Turiva/1.0' } })
    if (!res.ok) return null
    const data = await res.json()
    const a    = data.address ?? {}
    const locality = a.village || a.town || a.suburb || a.neighbourhood || a.city || a.municipality
    const state    = a.state_code || a.state
    return [locality, state].filter(Boolean).join(', ') || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// reverseGeocodeMunicipality
// ---------------------------------------------------------------------------

/**
 * Geocodificação reversa focada no MUNICÍPIO (cidade) — para casar com as
 * regiões cadastradas pelo nome do município, sem depender de raio.
 * Retorna { city, label } ou null. `city` é o município
 * (administrative_area_level_2 no Google / municipality no Nominatim);
 * `label` é "Município, UF" para exibição.
 */
export async function reverseGeocodeMunicipality(lat, lon) {
  if (HAS_KEY) {
    try {
      const maps     = await loadGoogleMaps()
      const geocoder = new maps.Geocoder()
      return await new Promise((resolve, reject) => {
        geocoder.geocode({ location: { lat, lng: lon } }, (results, status) => {
          if (status !== maps.GeocoderStatus.OK || !results?.length) {
            reject(new Error(status)); return
          }
          let city = null, state = null
          for (const result of results) {
            for (const comp of result.address_components) {
              if (!city && comp.types.includes('administrative_area_level_2')) city = comp.long_name
              if (!state && comp.types.includes('administrative_area_level_1')) state = comp.short_name
            }
            if (city && state) break
          }
          // Sem município no resultado → cai para a localidade
          if (!city) {
            for (const result of results) {
              for (const comp of result.address_components) {
                if (comp.types.includes('locality')) { city = comp.long_name; break }
              }
              if (city) break
            }
          }
          if (city) resolve({ city, label: [city, state].filter(Boolean).join(', ') })
          else reject(new Error('no_city'))
        })
      })
    } catch {
      // fall through to Nominatim
    }
  }

  try {
    // zoom=10 → nível de município no Nominatim
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&accept-language=pt-BR`
    const res = await fetch(url, { headers: { 'User-Agent': 'Turiva/1.0' } })
    if (!res.ok) return null
    const data = await res.json()
    const a    = data.address ?? {}
    const city = a.municipality || a.city || a.town || a.village || null
    if (!city) return null
    const state = a.state_code || a.state || null
    return { city, label: [city, state].filter(Boolean).join(', ') }
  } catch {
    return null
  }
}
