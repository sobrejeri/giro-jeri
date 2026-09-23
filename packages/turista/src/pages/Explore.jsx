import { useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { ChevronLeft, Search, Navigation, Loader2, Store, Compass, Car, MapPin, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useRegion } from '../contexts/RegionContext'
import ExploreMap from '../components/explore/ExploreMap'

const FILTROS = [
  { id: 'all',      label: 'Todos' },
  { id: 'place',    label: 'Lugares' },
  { id: 'tour',     label: 'Passeios' },
  { id: 'transfer', label: 'Transfers' },
]
const ICONE = { place: MapPin, tour: Compass, transfer: Car }
const ROTULO = { place: 'Lugar', tour: 'Passeio', transfer: 'Transfer' }

// ── EXPLORAR TURIVA (mapa) — SÓ ADMIN por enquanto ──────────────────────────
// Descoberta geográfica: pins de lugares/serviços sobre o mapa + bottom sheet
// com a lista da área visível. O cliente não vê esta tela (gate de admin +
// entrada no menu só para admin).
export default function Explore() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { region } = useRegion()

  const mapRef   = useRef(null)
  const bboxRef  = useRef(null)
  const reqRef   = useRef(0)
  const firstRef = useRef(true)

  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(false)
  const [buscarArea, setBuscarArea] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [filtro, setFiltro]   = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false) // false=recolhido, true=expandido
  const dragRef = useRef({ y: 0 })

  // Gate: só admin. Qualquer outro (inclusive deslogado) volta pra home — o
  // cliente não acessa esta tela.
  if (!user || user.user_type !== 'admin') return <Navigate to="/" replace />

  async function fetchArea(bbox) {
    if (!bbox) return
    const id = ++reqRef.current
    setLoading(true); setError(false)
    try {
      const data = await api.exploreMap(bbox)
      if (id !== reqRef.current) return // ignora resposta antiga (usuário já moveu de novo)
      setItems([...(data.places || []), ...(data.tours || []), ...(data.transfers || [])])
    } catch {
      if (id === reqRef.current) setError(true)
    } finally {
      if (id === reqRef.current) setLoading(false)
    }
  }

  // idle do mapa: 1ª vez busca sozinho; movimento do usuário só oferece o botão.
  const onIdle = (bbox, byUser) => {
    bboxRef.current = bbox
    if (firstRef.current) { firstRef.current = false; fetchArea(bbox) }
    else if (byUser) setBuscarArea(true)
  }

  const buscarAqui = () => { setBuscarArea(false); fetchArea(bboxRef.current) }

  const selecionar = (it) => {
    setSelectedId(it.id)
    if (mapRef.current) mapRef.current.panTo({ lat: it.lat, lng: it.lng })
    setSheetOpen(true)
  }

  const minhaLocalizacao = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (mapRef.current) { mapRef.current.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }); mapRef.current.setZoom(14) } },
      () => {}, { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const abrirItem = (it) => {
    if (it.kind === 'tour') navigate('/passeios', { state: { selectedId: it.id } })
    else if (it.kind === 'transfer') navigate('/transfers')
  }

  const visiveis = filtro === 'all' ? items : items.filter((i) => i.kind === filtro)

  // Arrasto simples do bottom sheet (recolhido ⇄ expandido).
  const onHandleStart = (e) => { dragRef.current.y = e.touches[0].clientY }
  const onHandleEnd = (e) => {
    const dy = (e.changedTouches?.[0]?.clientY ?? dragRef.current.y) - dragRef.current.y
    if (dy < -25) setSheetOpen(true)
    else if (dy > 25) setSheetOpen(false)
    else setSheetOpen((v) => !v)
  }

  return (
    <div className="fixed inset-0 bg-[#eae4db] overflow-hidden">
      {/* Mapa ocupa tudo; controles e sheet flutuam por cima. */}
      <div className="absolute inset-0">
        <ExploreMap
          items={visiveis}
          center={region?.center_latitude ? { lat: Number(region.center_latitude), lng: Number(region.center_longitude) } : undefined}
          selectedId={selectedId}
          onSelect={selecionar}
          onIdle={onIdle}
          onReady={(map) => { mapRef.current = map }}
        />
      </div>

      {/* ── Controles do topo ── */}
      <div className="absolute top-0 left-0 right-0 px-4 flex items-center gap-2" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(-1)} aria-label="Voltar"
          className="w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <ChevronLeft size={22} className="text-gray-700" />
        </button>
        <div className="flex-1 h-11 rounded-full bg-white shadow-md flex items-center gap-2 px-4">
          {loading ? <Loader2 size={16} className="text-brand animate-spin" /> : <Search size={16} className="text-gray-400" />}
          <span className="text-[14px] font-semibold text-gray-800 truncate">
            {loading ? 'Carregando…' : (region?.name || 'Explorar Turiva')}
          </span>
        </div>
        <button onClick={minhaLocalizacao} aria-label="Minha localização"
          className="w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <Navigation size={19} className="text-brand" />
        </button>
      </div>

      {/* ── Buscar nesta área ── */}
      {buscarArea && !loading && (
        <button onClick={buscarAqui}
          className="absolute left-1/2 -translate-x-1/2 top-[76px] z-10 inline-flex items-center gap-2 bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-full shadow-lg active:scale-95 transition-transform"
          style={{ top: 'calc(76px + env(safe-area-inset-top))' }}>
          <RefreshCw size={14} /> Buscar nesta área
        </button>
      )}

      {/* ── Bottom sheet ── */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[520px] bg-white rounded-t-3xl shadow-[0_-6px_24px_rgba(0,0,0,0.12)] flex flex-col transition-[height] duration-300 ease-out"
        style={{ height: sheetOpen ? 'min(82dvh, 640px)' : '38dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="shrink-0 pt-2.5 pb-1 cursor-grab select-none"
          onTouchStart={onHandleStart} onTouchEnd={onHandleEnd} onClick={() => setSheetOpen((v) => !v)}>
          <div className="w-10 h-1.5 rounded-full bg-gray-200 mx-auto" />
        </div>

        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={17} className="text-brand shrink-0" />
            <p className="text-[17px] font-extrabold text-gray-900 truncate">{region?.name || 'Área do mapa'}</p>
            <span className="ml-auto text-[12px] text-gray-400">{visiveis.length} no mapa</span>
          </div>
          <div className="flex gap-2 mt-2.5 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
            {FILTROS.map((f) => (
              <button key={f.id} onClick={() => setFiltro(f.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-bold border transition-colors ${
                  filtro === f.id ? 'bg-brand text-white border-brand' : 'bg-white text-gray-500 border-gray-200'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && items.length === 0 ? (
            <div className="space-y-2.5 pt-1">
              {[0, 1, 2].map((i) => <div key={i} className="h-[76px] rounded-2xl bg-gray-100 animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <p className="text-[13.5px] text-gray-500">Não foi possível carregar esta região.</p>
              <button onClick={() => fetchArea(bboxRef.current)} className="mt-3 inline-flex items-center gap-1.5 bg-brand text-white text-[13px] font-bold px-4 py-2 rounded-xl">
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          ) : visiveis.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[13.5px] text-gray-500">Não encontramos nada nesta área.</p>
              <p className="text-[12px] text-gray-400 mt-1">Afaste o mapa ou toque em "Buscar nesta área".</p>
            </div>
          ) : (
            <ul className="space-y-2.5 pt-1">
              {visiveis.map((it) => {
                const Icon = ICONE[it.kind] || Store
                return (
                  <li key={`${it.kind}-${it.id}`}>
                    <button onClick={() => selecionar(it)}
                      className={`w-full flex items-center gap-3 rounded-2xl p-2.5 text-left active:scale-[0.99] transition-transform border ${
                        selectedId === it.id ? 'border-brand bg-orange-50' : 'border-gray-100 bg-white'
                      }`}>
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                        {it.thumb
                          ? <img src={it.thumb} alt="" loading="lazy" className="w-full h-full object-cover" />
                          : <Icon size={20} className="text-gray-300" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-gray-900 leading-tight line-clamp-2">{it.name}</p>
                        <p className="text-[11.5px] text-gray-400 mt-0.5">{ROTULO[it.kind] || ''}{it.category ? ` · ${it.category}` : ''}</p>
                      </div>
                      {(it.kind === 'tour' || it.kind === 'transfer') && (
                        <span onClick={(e) => { e.stopPropagation(); abrirItem(it) }}
                          className="shrink-0 text-[12px] font-bold text-brand px-3 py-1.5 rounded-lg bg-brand/10 active:scale-95 transition-transform">
                          Ver
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
