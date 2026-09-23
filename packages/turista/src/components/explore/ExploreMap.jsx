import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../GoogleMap'

const JERI = { lat: -2.7976, lng: -40.5147 }
// Cor do pin por tipo (identidade Turiva: laranja pros lugares).
const COLORS = { place: '#FF6A00', tour: '#0EA5E9', transfer: '#7C3AED' }

function pin(maps, kind, selected) {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: selected ? 13 : 8.5,
    fillColor: COLORS[kind] || '#4F9CF9',
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: selected ? 3 : 2,
  }
}

// Mapa do Explorar: cria o Google Map, desenha os pins e avisa o pai quando a
// área visível muda (idle). Distingue movimento DO USUÁRIO (drag/zoom) de
// recentragem programática, para o pai mostrar "Buscar nesta área" só quando
// fizer sentido.
export default function ExploreMap({
  items = [], center = JERI, zoom = 12, selectedId,
  onSelect, onIdle, onReady,
}) {
  const containerRef = useRef(null)
  const inst = useRef(null)
  const markersRef = useRef([])
  const byUserRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  // refs para os callbacks — evita recriar o mapa quando o pai re-renderiza
  const cb = useRef({})
  cb.current = { onSelect, onIdle, onReady }

  useEffect(() => {
    let alive = true
    loadGoogleMaps()
      .then((maps) => {
        if (!alive || !containerRef.current) return
        const map = new maps.Map(containerRef.current, {
          center, zoom,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
          clickableIcons: false, gestureHandling: 'greedy', maxZoom: 18,
        })
        inst.current = { maps, map }
        // gesto do usuário → marca para o próximo idle
        map.addListener('dragend',      () => { byUserRef.current = true })
        map.addListener('zoom_changed', () => { byUserRef.current = true })
        map.addListener('idle', () => {
          const b = map.getBounds(); if (!b) return
          const sw = b.getSouthWest(), ne = b.getNorthEast()
          const bbox = { sw_lat: sw.lat(), sw_lng: sw.lng(), ne_lat: ne.lat(), ne_lng: ne.lng() }
          const byUser = byUserRef.current
          byUserRef.current = false
          cb.current.onIdle?.(bbox, byUser)
        })
        setReady(true)
        cb.current.onReady?.(map, maps)
      })
      .catch((e) => { if (alive) setError(String(e?.message || e)) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (re)desenha os pins
  useEffect(() => {
    if (!ready) return
    const { maps, map } = inst.current
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = (items || []).map((it) => {
      const m = new maps.Marker({
        position: { lat: it.lat, lng: it.lng }, map, title: it.name,
        icon: pin(maps, it.kind, it.id === selectedId),
        zIndex: it.id === selectedId ? 999 : 1,
      })
      m.addListener('click', () => cb.current.onSelect?.(it))
      return m
    })
  }, [ready, items, selectedId])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100">
        <p className="text-[12px] text-gray-400 px-6 text-center">
          {import.meta.env.VITE_GOOGLE_MAPS_KEY
            ? 'Não foi possível carregar o mapa.'
            : 'Configure VITE_GOOGLE_MAPS_KEY para ativar o mapa.'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// Expõe helpers de recentragem para o pai (via ref no onReady).
export function panMapTo(map, lat, lng, zoom) {
  if (!map) return
  map.panTo({ lat, lng })
  if (zoom) map.setZoom(zoom)
}
