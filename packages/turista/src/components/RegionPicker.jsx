import { MapPin, Navigation, X, Check } from 'lucide-react'
import { useRegion } from '../contexts/RegionContext'

export default function RegionPicker() {
  const { regions, region, selectRegion, detectGPS, detecting, showPicker, setShowPicker } = useRegion()

  if (!showPicker) return null

  const canClose = !!region

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={canClose ? () => setShowPicker(false) : undefined}
      />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-50">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3">
          <div>
            <p className="text-[16px] font-bold text-gray-900">Onde você está?</p>
            <p className="text-[12px] text-gray-400 mt-0.5">Selecione a região para ver os serviços disponíveis</p>
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

        <div className="px-5 pb-3">
          <button
            onClick={detectGPS}
            disabled={detecting}
            className="w-full flex items-center gap-3 bg-brand/10 text-brand rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-xl bg-brand/15 flex items-center justify-center shrink-0">
              {detecting
                ? <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                : <Navigation size={17} />}
            </div>
            <div className="text-left">
              <p className="text-[13px] font-bold">{detecting ? 'Detectando...' : 'Detectar minha localização'}</p>
              <p className="text-[11px] opacity-70">Usar GPS do dispositivo</p>
            </div>
          </button>
        </div>

        <div className="px-5 mb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[11px] text-gray-400">ou escolha a cidade</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
        </div>

        <div className="px-5 pb-8 space-y-2 max-h-[40vh] overflow-y-auto">
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
                <span className="text-[14px] font-semibold flex-1 text-left">{r.name}</span>
                {active && <Check size={16} className="text-white" />}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
