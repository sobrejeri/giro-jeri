import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader, MapPin, Navigation } from 'lucide-react'

const DEFAULT_RADIUS_KM = 20

async function overpassNearby(lat, lon, radiusKm) {
  const radiusM = Math.round(radiusKm * 1000)
  const q = `[out:json][timeout:15];(node["tourism"~"hotel|hostel|guest_house|motel|pousada"](around:${radiusM},${lat},${lon});way["tourism"~"hotel|hostel|guest_house|motel|pousada"](around:${radiusM},${lat},${lon}););out center;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: q,
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data.elements ?? [])
    .filter((e) => e.tags?.name)
    .map((e) => ({
      place_id: e.id,
      display_name: e.tags.name,
      lat: String(e.lat ?? e.center?.lat),
      lon: String(e.lon ?? e.center?.lon),
      _nearby: true,
    }))
}

async function nominatimSearch(q, viewbox) {
  const params = new URLSearchParams({
    q,
    format: 'json',
    limit: '8',
    countrycodes: 'br',
    'accept-language': 'pt-BR',
  })
  if (viewbox) params.set('viewbox', viewbox)
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'GiroJeri/1.0' },
  })
  if (!res.ok) return []
  return res.json()
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&accept-language=pt-BR`
  const res = await fetch(url, { headers: { 'User-Agent': 'GiroJeri/1.0' } })
  if (!res.ok) return null
  return res.json()
}

function shortName(displayName) {
  return displayName.split(',').slice(0, 2).join(', ').trim()
}

export default function OriginPicker({ open, onClose, onSelect, region, userCoords }) {
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState([])
  const [nearby, setNearby]         = useState([])
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]) }
  }, [open])

  // Centra no GPS do usuário quando disponível; fallback é o centro da região.
  // Raio = raio configurado da região (admin), com default conservador de 20 km.
  const center = userCoords?.lat != null && userCoords?.lon != null
    ? { lat: userCoords.lat, lon: userCoords.lon }
    : region?.center_latitude != null && region?.center_longitude != null
      ? { lat: Number(region.center_latitude), lon: Number(region.center_longitude) }
      : null
  const radiusKm = region?.radius_km ?? region?.service_radius_km ?? DEFAULT_RADIUS_KM

  useEffect(() => {
    if (!open || !center) return
    setLoadingNearby(true)
    overpassNearby(center.lat, center.lon, radiusKm)
      .then(setNearby)
      .catch(() => setNearby([]))
      .finally(() => setLoadingNearby(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, center?.lat, center?.lon, radiusKm])

  // Viewbox ~150 km around region to bias Nominatim results
  const viewbox = region?.center_latitude != null && region?.center_longitude != null
    ? `${Number(region.center_longitude) - 1.5},${Number(region.center_latitude) + 1.5},${Number(region.center_longitude) + 1.5},${Number(region.center_latitude) - 1.5}`
    : null

  function handleChange(val) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (val.trim().length < 3) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try { setResults(await nominatimSearch(val, viewbox)) }
      catch { setResults([]) }
      setLoading(false)
    }, 400)
  }

  function pick(r) {
    onSelect({
      name:      r._nearby ? r.display_name : shortName(r.display_name),
      latitude:  parseFloat(r.lat),
      longitude: parseFloat(r.lon),
    })
    onClose()
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      alert('Geolocalização não disponível neste dispositivo.')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const data = await reverseGeocode(coords.latitude, coords.longitude).catch(() => null)
        onSelect({
          name:      data?.display_name ? shortName(data.display_name) : 'Minha localização',
          latitude:  coords.latitude,
          longitude: coords.longitude,
        })
        setGpsLoading(false)
        onClose()
      },
      () => { setGpsLoading(false); alert('Não foi possível obter sua localização.') },
      { timeout: 8000, enableHighAccuracy: true },
    )
  }

  if (!open) return null

  const showNearby  = query.trim().length < 3
  const displayList = showNearby ? nearby : results

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Local de saída</h2>
          <button onClick={onClose} className="text-gray-500" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <button
            onClick={useCurrentLocation}
            disabled={gpsLoading}
            className="w-full flex items-center gap-3 bg-brand/10 text-brand rounded-xl px-4 py-3 active:scale-[0.98] transition-transform mb-3 disabled:opacity-60"
          >
            {gpsLoading
              ? <Loader size={16} className="animate-spin" />
              : <Navigation size={16} />}
            <span className="text-sm font-semibold">Usar minha localização atual</span>
          </button>

          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
            {loading
              ? <Loader size={15} className="text-gray-500 animate-spin" />
              : <Search size={15} className="text-gray-500" />}
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Pousada, hotel ou endereço…"
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]) }} aria-label="Limpar">
                <X size={14} className="text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 mt-1">
          {showNearby && (
            <p className="px-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              Pousadas e hotéis {userCoords ? 'próximos a você' : `em ${region?.name ?? 'sua região'}`} · {radiusKm} km
            </p>
          )}

          {showNearby && loadingNearby && (
            <div className="flex justify-center py-8">
              <Loader size={20} className="text-brand animate-spin" />
            </div>
          )}

          {displayList.map((r) => (
            <button
              key={r.place_id}
              onClick={() => pick(r)}
              className="w-full flex items-start gap-3 px-3 py-3 hover:bg-gray-50 rounded-xl text-left"
            >
              <MapPin size={14} className="text-brand mt-0.5 shrink-0" />
              <span className="text-[13px] text-gray-700 leading-snug">{r.display_name}</span>
            </button>
          ))}

          {showNearby && !loadingNearby && nearby.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">Nenhuma acomodação encontrada.</p>
          )}

          {!showNearby && !loading && results.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">Nenhum resultado.</p>
          )}

          {showNearby && nearby.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-3">
              Ou digite para buscar qualquer endereço acima.
            </p>
          )}

          {!showNearby && query.trim().length < 3 && (
            <p className="text-center text-xs text-gray-400 py-6">Digite ao menos 3 letras.</p>
          )}
        </div>
      </div>
    </div>
  )
}
