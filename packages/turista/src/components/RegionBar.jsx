import { MapPin, ChevronRight } from 'lucide-react'
import { useRegion } from '../contexts/RegionContext'

// Barra fina no topo (estilo do informativo de instalar o PWA) com a região
// atual. Tocar abre o seletor de região (mesmo modal de sempre).
export default function RegionBar() {
  const { region, setShowPicker } = useRegion()
  const nome = region?.name || 'Jericoacoara'
  return (
    <button
      onClick={() => setShowPicker(true)}
      className="w-full bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-2 active:bg-gray-50 transition-colors"
      aria-label="Trocar localização"
    >
      <MapPin size={15} className="text-brand shrink-0" />
      <span className="text-[12px] text-gray-500 shrink-0">Saindo de:</span>
      <span className="text-[12px] font-bold text-gray-900 truncate">{nome}</span>
      <ChevronRight size={14} className="text-gray-400 shrink-0 ml-auto" />
    </button>
  )
}
