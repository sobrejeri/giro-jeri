import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { reverseGeocode } from '../lib/geoServices'

const RegionContext = createContext(null)
const STORAGE_KEY        = 'giro_region'
const STORAGE_KEY_COORDS = 'giro_user_coords'
const STORAGE_KEY_PLACE  = 'giro_user_place'
const STORAGE_KEY_MANUAL = 'giro_region_manual'
const DEFAULT_RADIUS_KM  = 100

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
  // Região escolhida manualmente tem prioridade sobre o GPS: enquanto ativa, o
  // filtro usa só region_id (ignora lat/lon) e o GPS em segundo plano não a
  // sobrescreve. Sem isso, ao escolher uma cidade distante da posição atual a
  // lista vinha vazia (o backend filtra por proximidade quando recebe lat/lon).
  const [manualRegion, setManualRegion] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY_MANUAL) === '1' } catch { return false }
  })
  const manualRef = useRef(manualRegion)
  useEffect(() => { manualRef.current = manualRegion }, [manualRegion])

  useEffect(() => {
    api.getRegions().then((data) => {
      if (Array.isArray(data)) setRegions(data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!region && regions.length > 0) setShowPicker(true)
  }, [region, regions])

  // Define a região. opts.manual=true (padrão) marca escolha explícita do
  // usuário; o GPS chama com manual:false para não “travar” o seguimento.
  const selectRegion = useCallback((r, opts = {}) => {
    const manual = opts.manual !== false
    setRegionState(r)
    setManualRegion(manual)
    manualRef.current = manual
    setOutsideError(false)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r))
      localStorage.setItem(STORAGE_KEY_MANUAL, manual ? '1' : '0')
    } catch {}
    setShowPicker(false)
  }, [])

  const applyCoords = useCallback(async (lat, lon, opts = {}) => {
    const auto = opts.auto === true
    const next = { lat, lon }
    setUserCoords(next)
    try { localStorage.setItem(STORAGE_KEY_COORDS, JSON.stringify(next)) } catch {}
    const found = findRegionForCoords(lat, lon, regions)
    // O GPS em segundo plano (auto) NÃO sobrescreve uma região escolhida à mão.
    // Detecção explícita (botão “usar minha localização”) sempre vale.
    if (found && !(auto && manualRef.current)) selectRegion(found, { manual: false })
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

    async function onSuccess({ coords }) {
      setDetecting(false)
      // Detecção explícita pelo usuário → assume o controle do GPS (não é auto).
      const found = await applyCoords(coords.latitude, coords.longitude)
      if (!found) setOutsideError(true)
    }

    function onError(err) {
      if (err.code === 1) {
        // Permissão negada — para imediatamente
        setDetecting(false)
        setOutsideError(true)
        return
      }
      // Timeout/indisponível — tenta sem alta precisão
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        () => { setDetecting(false); setOutsideError(true) },
        { timeout: 20000 }
      )
    }

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      timeout:            15000,
      enableHighAccuracy: true,
      maximumAge:         30000,
    })
  }, [applyCoords])

  // Acompanha mudanças de localização em segundo plano, para manter
  // o header e o filtro sempre alinhados à posição real do turista.
  // Ignora micro-variações do GPS (jitter, ~<165m) — sem isso o setUserCoords
  // dispararia a cada leitura e recarregava as listas (tours) em loop.
  useEffect(() => {
    if (!navigator.geolocation || regions.length === 0) return
    let last = null
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const lat = coords.latitude, lon = coords.longitude
        if (last && Math.abs(last.lat - lat) < 0.0015 && Math.abs(last.lon - lon) < 0.0015) return
        last = { lat, lon }
        applyCoords(lat, lon, { auto: true })
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [applyCoords, regions.length])

  const openPicker = useCallback(() => { setOutsideError(false); setShowPicker(true) }, [])

  // Monta os parâmetros de filtro geográfico para chamadas à API.
  // Região escolhida à mão → filtra só por region_id (ignora o GPS). Caso
  // contrário, com GPS real prioriza lat/lon (raio por serviço).
  const getServiceQuery = useCallback(() => {
    const params = {}
    if (!manualRegion && userCoords?.lat != null && userCoords?.lon != null) {
      params.lat = userCoords.lat
      params.lon = userCoords.lon
    }
    if (region?.id) params.region_id = region.id
    return params
  }, [userCoords, region, manualRegion])

  return (
    <RegionContext.Provider value={{
      region, regions, selectRegion,
      detectGPS, detecting, userCoords, userPlace,
      showPicker, setShowPicker, openPicker,
      outsideError, setOutsideError, manualRegion,
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
