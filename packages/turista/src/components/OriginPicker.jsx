import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X, Loader, MapPin, Navigation } from 'lucide-react'
import {
  getPlaceSuggestions,
  getPlaceDetails,
  getNearbyLodging,
  reverseGeocode,
} from '../lib/geoServices'

const RADIUS_KM  = 10
const JERI_CENTER = { lat: -2.7976, lng: -40.5147 }

function shortName(r) {
  return r.main_text || r.display_name.split(',')[0]
}

export default function OriginPicker({ open, onClose, onSelect, region, userCoords }) {
  const { t } = useTranslation()
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState([])
  const [nearby, setNearby]             = useState([])
  const [loadingNearby, setLoadingNearby] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [gpsLoading, setGpsLoading]     = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]) }
  }, [open])

  // Centra no GPS do usuário quando disponível; fallback é o centro da região.
  const center = userCoords?.lat != null && userCoords?.lon != null
    ? { lat: userCoords.lat, lon: userCoords.lon }
    : region?.center_latitude != null && region?.center_longitude != null
      ? { lat: Number(region.center_latitude), lon: Number(region.center_longitude) }
      : null

  useEffect(() => {
    if (!open || !center) return
    setLoadingNearby(true)
    getNearbyLodging(center.lat, center.lon, RADIUS_KM)
      .then(setNearby)
      .catch(() => setNearby([]))
      .finally(() => setLoadingNearby(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, center?.lat, center?.lon])

  function handleChange(val) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (val.trim().length < 3) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const geoCenter = center
          ? { lat: center.lat, lng: center.lon }
          : JERI_CENTER
        setResults(await getPlaceSuggestions(val, geoCenter))
      } catch { setResults([]) }
      setLoading(false)
    }, 400)
  }

  async function pick(r) {
    let lat, lon
    if (r._source === 'google' && !r.lat) {
      const detail = await getPlaceDetails(r.place_id).catch(() => null)
      if (!detail) return
      lat = parseFloat(detail.lat)
      lon = parseFloat(detail.lon)
    } else {
      lat = parseFloat(r.lat)
      lon = parseFloat(r.lon)
    }
    onSelect({
      name:      r._nearby ? r.display_name : shortName(r),
      latitude:  lat,
      longitude: lon,
    })
    onClose()
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      alert(t('pickersCmp.geoNotAvailable'))
      return
    }
    setGpsLoading(true)

    function onSuccess({ coords }) {
      reverseGeocode(coords.latitude, coords.longitude)
        .catch(() => null)
        .then((label) => {
          onSelect({
            name:      label || t('pickersCmp.myLocation'),
            latitude:  coords.latitude,
            longitude: coords.longitude,
          })
          setGpsLoading(false)
          onClose()
        })
    }

    function onError(err) {
      setGpsLoading(false)
      if (err.code === 1) {
        alert(t('pickersCmp.permissionDenied'))
      } else {
        // Timeout ou posição indisponível — tenta sem alta precisão
        navigator.geolocation.getCurrentPosition(onSuccess, () => {
          alert(t('pickersCmp.locationError'))
        }, { timeout: 20000 })
      }
    }

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      timeout: 15000,
      enableHighAccuracy: true,
      maximumAge: 30000,
    })
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
          <h2 className="text-base font-bold text-gray-900">{t('pickersCmp.title')}</h2>
          <button onClick={onClose} className="text-gray-500" aria-label={t('pickersCmp.close')}>
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
            <span className="text-sm font-semibold">{t('pickersCmp.useCurrentLocation')}</span>
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
              placeholder={t('pickersCmp.originSearchPlaceholder')}
              className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]) }} aria-label={t('pickersCmp.clear')}>
                <X size={14} className="text-gray-500" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 mt-1">
          {showNearby && (
            <p className="px-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              {userCoords
                ? t('pickersCmp.nearbyTitleUser', { radius: RADIUS_KM })
                : t('pickersCmp.nearbyTitleRegion', { region: region?.name ?? t('pickersCmp.defaultRegion'), radius: RADIUS_KM })}
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
            <p className="text-center text-sm text-gray-500 py-8">{t('pickersCmp.noLodging')}</p>
          )}

          {!showNearby && !loading && results.length === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">{t('pickersCmp.noResults')}</p>
          )}

          {showNearby && nearby.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-3">
              {t('pickersCmp.orTypeToSearch')}
            </p>
          )}

          {!showNearby && query.trim().length < 3 && (
            <p className="text-center text-xs text-gray-400 py-6">{t('pickersCmp.minChars')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
