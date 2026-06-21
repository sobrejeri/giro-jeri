import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'

const JERI = { lat: -2.7976, lng: -40.5147 }
const KEY  = import.meta.env.VITE_GOOGLE_MAPS_KEY

let _promise = null
export function loadGoogleMaps() {
  if (!KEY) return Promise.reject(new Error('VITE_GOOGLE_MAPS_KEY não definida'))
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (_promise) return _promise
  _promise = new Promise((resolve, reject) => {
    window.__giro_gmcb = () => { delete window.__giro_gmcb; resolve(window.google.maps) }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&libraries=places&callback=__giro_gmcb&loading=async`
    s.onerror = (e) => { _promise = null; reject(e) }
    document.head.appendChild(s)
  })
  return _promise
}

const CAT_COLORS = {
  hospedagem:  '#1A4D5F',
  gastronomia: '#FF6A00',
  compras:     '#7C3AED',
}

function markerIcon(maps, category) {
  const color = CAT_COLORS[category] || '#4F9CF9'
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 2,
  }
}

/**
 * Componente de mapa Google Maps reutilizável.
 *
 * Props:
 *   markers  – [{ lat, lng, title, subtitle, category }]
 *   userPos  – { lat, lng } posição do turista
 *   center   – { lat, lng } centro inicial
 *   zoom     – zoom inicial (padrão 14)
 *   className– classes Tailwind para o container
 */
export default function GoogleMap({ markers = [], userPos = null, center = JERI, zoom = 14, className = '' }) {
  const containerRef  = useRef(null)
  const instanceRef   = useRef(null)
  const markersRef    = useRef([])
  const userMarkerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  // Carrega a API e cria o mapa
  useEffect(() => {
    let alive = true
    loadGoogleMaps()
      .then((maps) => {
        if (!alive || !containerRef.current) return
        const map = new maps.Map(containerRef.current, {
          center,
          zoom,
          mapTypeControl:    false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling:   'cooperative',
        })
        instanceRef.current = { maps, map }
        setReady(true)
      })
      .catch((e) => { if (alive) setError(String(e.message || e)) })
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Atualiza markers dos estabelecimentos
  useEffect(() => {
    if (!ready) return
    const { maps, map } = instanceRef.current
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = markers.map((p) => {
      const marker = new maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: p.title,
        icon:  markerIcon(maps, p.category),
      })
      const info = new maps.InfoWindow({
        content: `
          <div style="font-family:system-ui,sans-serif;max-width:180px;padding:2px 0">
            <p style="font-weight:700;font-size:13px;margin:0 0 2px">${p.title}</p>
            ${p.subtitle ? `<p style="font-size:11px;color:#666;margin:0">${p.subtitle}</p>` : ''}
          </div>`,
      })
      marker.addListener('click', () => info.open(map, marker))
      return marker
    })
  }, [ready, markers])

  // Marker de posição do usuário
  useEffect(() => {
    if (!ready) return
    const { maps, map } = instanceRef.current
    if (userMarkerRef.current) userMarkerRef.current.setMap(null)
    if (userPos?.lat != null) {
      userMarkerRef.current = new maps.Marker({
        position: { lat: userPos.lat, lng: userPos.lng },
        map,
        title: 'Você está aqui',
        icon: {
          path:        maps.SymbolPath.CIRCLE,
          scale:       9,
          fillColor:   '#4F9CF9',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2.5,
        },
        zIndex: 999,
      })
    }
  }, [ready, userPos])

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-gray-100 rounded-2xl ${className}`}>
        <MapPin size={28} className="text-gray-300" />
        <p className="text-[12px] text-gray-400 text-center px-4">
          {KEY ? 'Erro ao carregar o mapa' : 'Configure VITE_GOOGLE_MAPS_KEY para ativar o mapa'}
        </p>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-2xl">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
