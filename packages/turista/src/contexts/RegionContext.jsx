import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

const RegionContext = createContext(null)

const STORAGE_KEY = 'giro_region'

function nearestRegion(regions, lat, lon) {
  let best = null
  let bestDist = Infinity
  for (const r of regions) {
    if (r.center_latitude == null || r.center_longitude == null) continue
    const d = Math.hypot(r.center_latitude - lat, r.center_longitude - lon)
    if (d < bestDist) { bestDist = d; best = r }
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)) } catch {}
    setShowPicker(false)
  }, [])

  const detectGPS = useCallback(() => {
    if (!navigator.geolocation) return
    setDetecting(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDetecting(false)
        if (!regions.length) return
        const nearest = nearestRegion(regions, coords.latitude, coords.longitude)
        if (nearest) selectRegion(nearest)
      },
      () => { setDetecting(false) },
      { timeout: 8000 }
    )
  }, [regions, selectRegion])

  const openPicker = useCallback(() => setShowPicker(true), [])

  return (
    <RegionContext.Provider value={{ region, regions, selectRegion, detectGPS, detecting, showPicker, openPicker, setShowPicker }}>
      {children}
    </RegionContext.Provider>
  )
}

export function useRegion() {
  const ctx = useContext(RegionContext)
  if (!ctx) throw new Error('useRegion must be used inside RegionProvider')
  return ctx
}
