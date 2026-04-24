import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Navigation, X, Check, Search, AlertCircle, Loader } from 'lucide-react'
import { useRegion, findRegionForCoords } from '../contexts/RegionContext'

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&countrycodes=br&accept-language=pt-BR`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'GiroJeri/1.0' },
  })
  if (!res.ok) return []
  return res.json()
}

export default function RegionPicker() {
  const { regions, region, selectRegion, detectGPS, detecting, showPicker, setShowPicker, outsideError, setOutsideError } = useRegion()

  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [noMatch, setNoMatch]     = useState(false)
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)

  const canClose = !!region

  useEffect(() => {
    if (showPicker) {
      setQuery('')
      setResults([])
      setNoMatch(false)
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [showPicker])

  const handleSearch = useCallback((value) => {
    setQuery(value)
    setNoMatch(false)
    clearTimeout(debounceRef.current)
    if (value.trim().length < 3) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await geocode(value)
        setResults(data)
      } catch { setResults([]) }
      setSearching(false)
    }, 500)
  }, [])

  function handleResult(r) {
    const lat = parseFloat(r.lat)
    const lon = parseFloat(r.lon)
    const found = findRegionForCoords(lat, lon, regions)
    if (found) {
      selectRegion(found)
      setResults([])
      setQuery('')
    } else {
      setNoMatch(true)
      setResults([])
    }
  }

  if (!showPicker) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={canClose ? () => setShowPicker(false) : undefined}
      />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-[16px] font-bold text-gray-900">Onde você está?</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Busque sua cidade ou use o GPS</p>
          </div>
          {canClose && (
            <button
              onClick={() => setShowPicker(false)}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
            >
              <X size={16} className="text-gray-500" />
            </button>
          )}
        </div>

        {/* Search box */}
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-100 focus-within:border-brand/40 focus-within:bg-white transition-colors">
            {searching
              ? <Loader size={16} className="text-gray-400 animate-spin shrink-0" />
              : <Search size={16} className="text-gray-400 shrink-0" />}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Ex: Jericoacoara, Fortaleza..."
              className="flex-1 bg-transparent text-[14px] text-gray-900 placeholder-gray-400 outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]); setNoMatch(false) }}>
                <X size={14} className="text-gray-400" />
              </button>
            )}
          </div>

          {/* Geocode results */}
          {results.length > 0 && (
            <div className="mt-2 bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.place_id}
                  onClick={() => handleResult(r)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors"
                >
                  <MapPin size={14} className="text-brand shrink-0 mt-0.5" />
                  <span className="text-[13px] text-gray-800 leading-snug line-clamp-2">
                    {r.display_name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* No match warning */}
          {(noMatch || outsideError) && (
            <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <AlertCircle size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-700">
                Localização fora das áreas cobertas. Selecione uma região abaixo.
              </p>
            </div>
          )}
        </div>

        {/* GPS button */}
        <div className="px-5 pb-3">
          <button
            onClick={() => { setNoMatch(false); detectGPS() }}
            disabled={detecting}
            className="w-full flex items-center gap-3 bg-brand/10 text-brand rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
              {detecting
                ? <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                : <Navigation size={17} />}
            </div>
            <div className="text-left">
              <p className="text-[13px] font-bold">{detecting ? 'Detectando...' : 'Usar minha localização (GPS)'}</p>
              <p className="text-[11px] opacity-70">Detectar automaticamente dentro de 100 km</p>
            </div>
          </button>
        </div>

        {/* Divider */}
        <div className="px-5 mb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400">ou escolha a região</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
        </div>

        {/* Region list */}
        <div className="px-5 pb-8 space-y-2 max-h-[30vh] overflow-y-auto">
          {regions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Carregando regiões...</p>
          )}
          {regions.map((r) => {
            const active = region?.id === r.id
            return (
              <button
                key={r.id}
                onClick={() => selectRegion(r)}
                className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 active:scale-[0.98] transition-all ${
                  active ? 'bg-brand text-white' : 'bg-gray-50 text-gray-900'
                }`}
              >
                <MapPin size={16} className={active ? 'text-white' : 'text-brand'} />
                <div className="flex-1 text-left">
                  <p className="text-[14px] font-semibold">{r.name}</p>
                  {(r.radius_km || r.service_radius_km) && (
                    <p className={`text-[11px] ${active ? 'text-white/70' : 'text-gray-400'}`}>
                      Cobertura: {r.radius_km ?? r.service_radius_km} km de raio
                    </p>
                  )}
                </div>
                {active && <Check size={16} className="text-white" />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
