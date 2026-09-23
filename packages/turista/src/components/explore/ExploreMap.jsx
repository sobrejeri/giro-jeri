import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../GoogleMap'

const JERI = { lat: -2.7976, lng: -40.5147 }
// Cor do pin por tipo (identidade Turiva: laranja pros lugares).
const COLORS = { place: '#FF6A00', tour: '#0EA5E9', transfer: '#7C3AED' }

// Esconde os POIs/ícones padrão do Google (hotel, restaurante, câmera…) e o
// transporte público, para o mapa ficar limpo e só os NOSSOS pins aparecerem.
// Mantém as áreas (parques/água) e os nomes de cidades para orientação.
const MAP_STYLE = [
  { featureType: 'poi',      elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',  elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road',     elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
]

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

// Thumbnail do pin de conteúdo = o item MAIS RECENTE do grupo (story/destaque).
function pinThumb(g) {
  const sorted = [...(g.itens || [])].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  const it = sorted[0]
  if (!it) return null
  if (it.kind === 'highlight') return it.thumb || null
  return it.media_type === 'image' ? it.media_url : (it.author_avatar || null)
}

// Pin de conteúdo como marcador HTML (OverlayView) — não precisa de Map ID:
// foto do story mais recente dentro de um aro laranja, com o nº de itens.
function criarPinConteudo(maps, map, g, onClick) {
  const thumb = pinThumb(g)
  const n = (g.itens || []).length
  class Pin extends maps.OverlayView {
    onAdd() {
      const div = document.createElement('div')
      div.style.cssText = 'position:absolute;transform:translate(-50%,-50%);cursor:pointer;will-change:left,top;z-index:500'
      div.innerHTML =
        '<div style="position:relative;width:46px;height:46px;border-radius:50%;padding:3px;background:linear-gradient(135deg,#FF6A00,#FFB020);box-shadow:0 2px 7px rgba(0,0,0,.3)">'
        + '<div style="width:100%;height:100%;border-radius:50%;border:2px solid #fff;overflow:hidden;background:#e5e7eb;display:flex;align-items:center;justify-content:center">'
        + (thumb
            ? '<img src="' + thumb + '" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'"/>'
            : '<span style="color:#FF6A00;font:700 16px system-ui">★</span>')
        + '</div>'
        + (n > 1 ? '<span style="position:absolute;top:-3px;right:-3px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#FF6A00;color:#fff;font:700 10px/18px system-ui;text-align:center;border:2px solid #fff">' + n + '</span>' : '')
        + '</div>'
      div.addEventListener('click', (e) => { e.stopPropagation(); onClick(g) })
      this._div = div
      this.getPanes().overlayMouseTarget.appendChild(div)
    }
    draw() {
      const proj = this.getProjection()
      if (!proj || !this._div) return
      const p = proj.fromLatLngToDivPixel(new maps.LatLng(g.lat, g.lng))
      if (p) { this._div.style.left = p.x + 'px'; this._div.style.top = p.y + 'px' }
    }
    onRemove() { if (this._div) { this._div.remove(); this._div = null } }
  }
  const pinOverlay = new Pin()
  pinOverlay.setMap(map)
  return pinOverlay
}

// Mapa do Explorar: cria o Google Map, desenha os pins e avisa o pai quando a
// área visível muda (idle). Distingue movimento DO USUÁRIO (drag/zoom) de
// recentragem programática, para o pai mostrar "Buscar nesta área" só quando
// fizer sentido.
export default function ExploreMap({
  items = [], content = [], center = JERI, zoom = 12, selectedId,
  onSelect, onSelectContent, onIdle, onReady,
}) {
  const containerRef = useRef(null)
  const inst = useRef(null)
  const markersRef = useRef([])
  const contentRef = useRef([])
  const byUserRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  // refs para os callbacks — evita recriar o mapa quando o pai re-renderiza
  const cb = useRef({})
  cb.current = { onSelect, onSelectContent, onIdle, onReady }

  useEffect(() => {
    let alive = true
    loadGoogleMaps()
      .then((maps) => {
        if (!alive || !containerRef.current) return
        const map = new maps.Map(containerRef.current, {
          center, zoom,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
          clickableIcons: false, gestureHandling: 'greedy', maxZoom: 18,
          styles: MAP_STYLE,
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

  // Pins de conteúdo (stories + destaques agrupados por localização): aro
  // laranja de "conteúdo aqui", com o nº de itens quando há mais de um.
  useEffect(() => {
    if (!ready) return
    const { maps, map } = inst.current
    contentRef.current.forEach((o) => o.setMap(null))
    contentRef.current = (content || []).map((g) =>
      criarPinConteudo(maps, map, g, (grp) => cb.current.onSelectContent?.(grp)))
  }, [ready, content])

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
