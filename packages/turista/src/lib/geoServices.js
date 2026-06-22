import { loadGoogleMaps } from '../components/GoogleMap'

const JERI = { lat: -2.7976, lng: -40.5147 }
const HAS_KEY = !!import.meta.env.VITE_GOOGLE_MAPS_KEY

// ---------------------------------------------------------------------------
// getPlaceSuggestions
// ---------------------------------------------------------------------------

/**
 * Sugestões de autocomplete para endereços.
 * @param {string} input
 * @param {{ lat: number, lng?: number, lon?: number }} [center]
 * @returns {Promise<Array>}
 */
export async function getPlaceSuggestions(input, center = JERI) {
  if (HAS_KEY) {
    try {
      const maps = await loadGoogleMaps()
      const svc = new maps.places.AutocompleteService()
      const centerLat = center.lat
      const centerLng = center.lng ?? center.lon ?? JERI.lng
      return await new Promise((resolve) => {
        svc.getPlacePredictions(
          {
            input,
            componentRestrictions: { country: 'br' },
            location: new maps.LatLng(centerLat, centerLng),
            radius: 150000,
          },
          (predictions, status) => {
            if (status !== maps.places.PlacesServiceStatus.OK || !predictions) {
              resolve([])
              return
            }
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
          }
        )
      })
    } catch {
      // fall through to Nominatim
    }
  }

  // Fallback: Nominatim
  try {
    const viewbox = center
      ? `${(center.lng ?? center.lon ?? JERI.lng) - 1.5},${center.lat + 1.5},${(center.lng ?? center.lon ?? JERI.lng) + 1.5},${center.lat - 1.5}`
      : undefined
    const params = new URLSearchParams({
      q:               input,
      format:          'json',
      limit:           '6',
      countrycodes:    'br',
      'accept-language': 'pt-BR',
    })
    if (viewbox) params.set('viewbox', viewbox)
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
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// getPlaceDetails
// ---------------------------------------------------------------------------

/**
 * Detalhes (lat/lon/name) de um place_id Google.
 * @param {string} placeId
 * @returns {Promise<{ name: string, address: string, lat: string, lon: string }|null>}
 */
export async function getPlaceDetails(placeId) {
  if (!HAS_KEY) return null
  try {
    const maps = await loadGoogleMaps()
    const div  = document.createElement('div')
    const svc  = new maps.places.PlacesService(div)
    return await new Promise((resolve) => {
      svc.getDetails(
        { placeId, fields: ['geometry', 'name', 'formatted_address'] },
        (place, status) => {
          if (status !== maps.places.PlacesServiceStatus.OK || !place) {
            resolve(null)
            return
          }
          resolve({
            name:    place.name ?? '',
            address: place.formatted_address ?? '',
            lat:     String(place.geometry.location.lat()),
            lon:     String(place.geometry.location.lng()),
          })
        }
      )
    })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// getNearbyLodging
// ---------------------------------------------------------------------------

/**
 * Lugares de hospedagem próximos.
 * @param {number} lat
 * @param {number} lon
 * @param {number} [radiusKm]
 * @returns {Promise<Array>}
 */
export async function getNearbyLodging(lat, lon, radiusKm = 10) {
  if (HAS_KEY) {
    try {
      const maps   = await loadGoogleMaps()
      const div    = document.createElement('div')
      const svc    = new maps.places.PlacesService(div)
      const radius = radiusKm * 1000
      return await new Promise((resolve) => {
        svc.nearbySearch(
          {
            location: new maps.LatLng(lat, lon),
            radius,
            type:     'lodging',
          },
          (results, status) => {
            if (
              (status !== maps.places.PlacesServiceStatus.OK &&
                status !== maps.places.PlacesServiceStatus.ZERO_RESULTS) ||
              !results
            ) {
              resolve([])
              return
            }
            resolve(
              results.map((place) => ({
                place_id:     place.place_id,
                display_name: place.name + (place.vicinity ? ', ' + place.vicinity : ''),
                lat:          String(place.geometry.location.lat()),
                lon:          String(place.geometry.location.lng()),
                _nearby:      true,
                _source:      'google',
              }))
            )
          }
        )
      })
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
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string|null>}
 */
export async function reverseGeocode(lat, lon) {
  if (HAS_KEY) {
    try {
      const maps = await loadGoogleMaps()
      const geocoder = new maps.Geocoder()
      return await new Promise((resolve) => {
        geocoder.geocode({ location: { lat, lng: lon } }, (results, status) => {
          if (status !== maps.GeocoderStatus.OK || !results?.length) {
            resolve(null)
            return
          }
          // Procura o componente de cidade no primeiro resultado
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
              if (
                !state &&
                comp.types.includes('administrative_area_level_1')
              ) {
                state = comp.short_name
              }
            }
            if (locality && state) break
          }
          const label = [locality, state].filter(Boolean).join(', ') || null
          resolve(label)
        })
      })
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
