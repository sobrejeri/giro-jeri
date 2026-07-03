import { loadGoogleMaps } from '../components/GoogleMap'

const JERI = { lat: -2.7976, lng: -40.5147 }
const HAS_KEY  = !!import.meta.env.VITE_GOOGLE_MAPS_KEY
const API_BASE = import.meta.env.VITE_API_URL || ''

// ---------------------------------------------------------------------------
// Internal helpers — Google (throws on failure) + Nominatim/Overpass fallbacks
// ---------------------------------------------------------------------------

async function googleSuggestions(input, center) {
  const maps = await loadGoogleMaps()
  const svc  = new maps.places.AutocompleteService()
  const lat  = center.lat
  const lng  = center.lng ?? center.lon ?? JERI.lng
  return new Promise((resolve, reject) => {
    svc.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: 'br' },
        location: new maps.LatLng(lat, lng),
        radius:   150000,
      },
      (predictions, status) => {
        if (status === maps.places.PlacesServiceStatus.OK && predictions?.length) {
          resolve(
            predictions.map((p) => ({
              place_id:       p.place_id,
              display_name:   p.description,
              main_text:      p.structured_formatting?.main_text ?? p.description.split(',')[0],
              secondary_text: p.structured_formatting?.secondary_text ?? '',
              lat:            null,
              lon:            null,
              _source:        'google',
            }))
          )
        } else {
          reject(new Error(status))
        }
      }
    )
  })
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
    { headers: { 'User-Agent': 'GiroJeri/1.0' } }
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
      // fall through to Nominatim
    }
  }
  try {
    const results = await nominatimSearch(input, center)
    if (results.length > 0) return results
  } catch {
    // fall through to server proxy
  }
  try {
    return await serverSuggestions(input)
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
      const maps = await loadGoogleMaps()
      const div  = document.createElement('div')
      const svc  = new maps.places.PlacesService(div)
      return await new Promise((resolve, reject) => {
        svc.getDetails(
          { placeId, fields: ['geometry', 'name', 'formatted_address'] },
          (place, status) => {
            if (status === maps.places.PlacesServiceStatus.OK && place?.geometry) {
              resolve({
                name:    place.name ?? '',
                address: place.formatted_address ?? '',
                lat:     String(place.geometry.location.lat()),
                lon:     String(place.geometry.location.lng()),
              })
            } else {
              reject(new Error(status))
            }
          }
        )
      })
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
      const maps   = await loadGoogleMaps()
      const div    = document.createElement('div')
      const svc    = new maps.places.PlacesService(div)
      const radius = radiusKm * 1000
      const results = await new Promise((resolve, reject) => {
        svc.nearbySearch(
          { location: new maps.LatLng(lat, lon), radius, type: 'lodging' },
          (places, status) => {
            if (
              status === maps.places.PlacesServiceStatus.OK && places?.length
            ) {
              resolve(
                places.map((place) => ({
                  place_id:     place.place_id,
                  display_name: place.name + (place.vicinity ? ', ' + place.vicinity : ''),
                  lat:          String(place.geometry.location.lat()),
                  lon:          String(place.geometry.location.lng()),
                  _nearby:      true,
                  _source:      'google',
                }))
              )
            } else if (status === maps.places.PlacesServiceStatus.ZERO_RESULTS) {
              resolve([])
            } else {
              reject(new Error(status))
            }
          }
        )
      })
      if (results.length > 0) return results
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
    const res = await fetch(url, { headers: { 'User-Agent': 'GiroJeri/1.0' } })
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
    const res = await fetch(url, { headers: { 'User-Agent': 'GiroJeri/1.0' } })
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
