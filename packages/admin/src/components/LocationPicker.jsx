import { useState, useEffect, useRef } from 'react'
import { Search, X, Loader, MapPin, CircleDot } from 'lucide-react'

async function nominatimSearch(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&countrycodes=br&accept-language=pt-BR`
  const res = await fetch(url, { headers: { 'User-Agent': 'GiroJeri-Admin/1.0' } })
  if (!res.ok) return []
  return res.json()
}

function MapPreview({ lat, lon, radius }) {
  if (!lat || !lon) return null
  const delta = Math.min(radius / 111, 3)
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`
  return (
    <div className="rounded-xl overflow-hidden border border-gray-700 h-[160px] relative">
      <iframe
        title="mapa"
        src={src}
        className="w-full h-full"
        style={{ filter: 'invert(0.85) hue-rotate(180deg) brightness(0.9)' }}
        loading="lazy"
      />
      <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-lg">
        © OpenStreetMap
      </div>
    </div>
  )
}

function LocationSearch({ onSelect }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)
  const debounceRef = useRef(null)
  const wrapRef     = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function handleChange(val) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (val.trim().length < 3) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await nominatimSearch(val)
        setResults(data)
        setOpen(data.length > 0)
      } catch { setResults([]) }
      setLoading(false)
    }, 500)
  }

  function pick(r) {
    onSelect(r)
    setQuery(r.display_name.split(',')[0])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-xs font-medium text-gray-400 mb-1.5">Buscar localização no mapa</label>
      <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 focus-within:border-brand/60">
        {loading
          ? <Loader size={15} className="text-gray-500 animate-spin shrink-0" />
          : <Search size={15} className="text-gray-500 shrink-0" />}
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Ex: Jericoacoara, Ceará"
          className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false) }}>
            <X size={13} className="text-gray-500 hover:text-gray-300" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-[220px] overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => pick(r)}
              className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left hover:bg-gray-800 border-b border-gray-800 last:border-0 transition-colors"
            >
              <MapPin size={13} className="text-brand shrink-0 mt-0.5" />
              <span className="text-[12px] text-gray-300 leading-snug line-clamp-2">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Editor de localização opcional. Quando latitude/longitude/raio são null,
 * o componente exibe um aviso de "herdando da região" e oferece um botão
 * para sobrescrever. Quando há valores, mostra mapa, coords e slider de raio.
 *
 * Props:
 *   value:    { latitude, longitude, service_radius_km } — null/undefined = herda
 *   onChange: (next) => void — recebe o objeto completo (com nulls quando limpa)
 *   defaultRadius: número usado ao iniciar uma sobrescrita (default 50)
 */
export default function LocationPicker({ value, onChange, defaultRadius = 50 }) {
  const lat = value?.latitude  != null ? Number(value.latitude)  : null
  const lon = value?.longitude != null ? Number(value.longitude) : null
  const radius = value?.service_radius_km != null ? Number(value.service_radius_km) : null
  const hasOverride = lat != null && lon != null

  function handleLocationPick(result) {
    onChange({
      latitude:          parseFloat(result.lat),
      longitude:         parseFloat(result.lon),
      service_radius_km: radius ?? defaultRadius,
    })
  }

  function clear() {
    onChange({ latitude: null, longitude: null, service_radius_km: null })
  }

  function startOverride() {
    onChange({ latitude: 0, longitude: 0, service_radius_km: defaultRadius })
  }

  if (!hasOverride) {
    return (
      <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl px-4 py-3 flex items-center gap-3">
        <MapPin size={16} className="text-gray-600 shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-300">Herdando localização e raio da região</p>
          <p className="text-[11px] text-gray-600 mt-0.5">Defina apenas se este item atende uma área diferente.</p>
        </div>
        <button
          type="button"
          onClick={startOverride}
          className="text-xs text-brand hover:text-brand/80 font-medium whitespace-nowrap"
        >
          Sobrescrever
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <LocationSearch onSelect={handleLocationPick} />

      {lat !== 0 && lon !== 0 && (
        <MapPreview lat={lat} lon={lon} radius={radius || defaultRadius} />
      )}

      <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-4 py-3">
        <CircleDot size={14} className="text-brand shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Coordenadas</p>
          <p className="text-sm font-mono text-gray-200">
            {lat !== 0 || lon !== 0 ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : 'Use a busca acima'}
          </p>
        </div>
        <button type="button" onClick={clear} className="p-1 text-gray-600 hover:text-gray-400" title="Voltar a herdar da região">
          <X size={13} />
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-gray-400">Raio operacional</label>
          <span className="text-sm font-bold text-brand">{radius ?? defaultRadius} km</span>
        </div>
        <input
          type="range"
          min={5} max={200} step={5}
          value={radius ?? defaultRadius}
          onChange={(e) => onChange({ ...value, service_radius_km: Number(e.target.value) })}
          className="w-full accent-brand"
        />
        <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
          <span>5 km</span><span>100 km</span><span>200 km</span>
        </div>
      </div>
    </div>
  )
}
