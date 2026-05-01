import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const RegionContext = createContext(null)
const STORAGE_KEY        = 'giro_region'
const STORAGE_KEY_COORDS = 'giro_user_coords'
const STORAGE_KEY_PLACE  = 'giro_user_place'
const DEFAULT_RADIUS_KM  = 100

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&accept-language=pt-BR`
    const res = await fetch(url, { headers: { 'User-Agent': 'GiroJeri/1.0' } })
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address ?? {}
    const locality = a.village || a.town || a.suburb || a.neighbourhood || a.city || a.municipality
    const state    = a.state_code || a.state
    return [locality, state].filter(Boolean).join(', ') || null
  } catch { return null }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function findRegionForCoords(lat, lon, regions) {
  let best = null
  let bestDist = Infinity
  for (const r of regions) {
    if (r.center_latitude == null || r.center_longitude == null) continue
    const d = haversineKm(lat, lon, r.center_latitude, r.center_longitude)
    const radius = r.radius_km ?? r.service_radius_km ?? DEFAULT_RADIUS_KM
    if (d <= radius && d < bestDist) {
      bestDist = d
      best = r
    }
  }
  return best
}

export function RegionProvider({ children }) {
  const [region, setRegionState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [regions, setRegions] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [outsideError, setOutsideError] = useState(false)
  const [userCoords, setUserCoords] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COORDS)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [userPlace, setUserPlace] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_PLACE) || null } catch { return null }
  })

  useEffect(() => {
    api.getRegions().then((data) => {
      if (Array.isArray(data)) setRegions(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!region && regions.length > 0) setShowPicker(true)
  }, [region, regions])

  const selectRegion = useCallback((r) => {
    setRegionState(r)
    setOutsideError(false)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)) } catch {}
    setShowPicker(false)
  }, [])

  const applyCoords = useCallback(async (lat, lon) => {
    const next = { lat, lon }
    setUserCoords(next)
    try { localStorage.setItem(STORAGE_KEY_COORDS, JSON.stringify(next)) } catch {}
    const found = findRegionForCoords(lat, lon, regions)
    if (found) selectRegion(found)
    const place = await reverseGeocode(lat, lon)
    if (place) {
      setUserPlace(place)
      try { localStorage.setItem(STORAGE_KEY_PLACE, place) } catch {}
    }
    return found
  }, [regions, selectRegion])

  const detectGPS = useCallback(() => {
    if (!navigator.geolocation) return
    setDetecting(true)
    setOutsideError(false)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setDetecting(false)
        const found = await applyCoords(coords.latitude, coords.longitude)
        if (!found) setOutsideError(true)
      },
      () => { setDetecting(false) },
      { timeout: 8000 }
    )
  }, [applyCoords])

  // Acompanha mudanças de localização em segundo plano, para manter
  // o header e o filtro sempre alinhados à posição real do turista.
  useEffect(() => {
    if (!navigator.geolocation || regions.length === 0) return
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => { applyCoords(coords.latitude, coords.longitude) },
      () => {},
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [applyCoords, regions.length])

  const openPicker = useCallback(() => { setOutsideError(false); setShowPicker(true) }, [])

  // Monta os parâmetros de filtro geográfico para chamadas à API.
  // Quando há GPS real do usuário, prioriza lat/lon (raio cai pra cada
  // serviço); caso contrário, cai no filtro categórico por região.
  const getServiceQuery = useCallback(() => {
    if (userCoords?.lat != null && userCoords?.lon != null) {
      return { lat: userCoords.lat, lon: userCoords.lon }
    }
    if (region?.id) return { region_id: region.id }
    return {}
  }, [userCoords, region])

  return (
    <RegionContext.Provider value={{
      region, regions, selectRegion,
      detectGPS, detecting, userCoords, userPlace,
      showPicker, setShowPicker, openPicker,
      outsideError, setOutsideError,
      findRegionForCoords, getServiceQuery,
    }}>
      {children}
    </RegionContext.Provider>
  )
}

export function useRegion() {
  const ctx = useContext(RegionContext)
  if (!ctx) throw new Error('useRegion must be used inside RegionProvider')
  return ctx
}
