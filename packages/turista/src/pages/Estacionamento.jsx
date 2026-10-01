import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPin, ChevronRight, ParkingSquare, Umbrella, Sun, Search } from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'

// ── Estacionamento — catálogo ────────────────────────────────────────────────
// Terceira vertical. Lista os estacionamentos da região; o período/veículo é
// escolhido no detalhe. "Seu carro seguro. Você em Jeri."
export default function Estacionamento() {
  const navigate = useNavigate()
  const { region } = useRegion()
  const [busca, setBusca] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['parking-lots', region?.id || 'all'],
    queryFn:  () => api.parkingLots(region?.id),
  })
  const lots = (data?.data || []).filter((l) =>
    !busca.trim() || (l.name || '').toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <div className="px-4 pb-10 pt-3 space-y-4">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-brand to-orange-400 text-white p-5 shadow-sm">
        <h1 className="text-[22px] font-extrabold leading-tight">Seu carro seguro.<br />Você em Jeri.</h1>
        <p className="text-[13px] text-white/90 mt-1">Encontre onde estacionar e aproveite a viagem.</p>
      </div>

      {/* Busca */}
      <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 h-11 bg-white focus-within:border-brand">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar estacionamento…"
          className="flex-1 text-sm text-gray-700 bg-transparent outline-none placeholder-gray-400"
        />
      </div>

      <div className="flex items-center gap-2">
        <ParkingSquare size={18} className="text-brand" />
        <h2 className="text-[17px] font-extrabold text-gray-900">Estacionamentos para sua viagem</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 py-10 text-center">Carregando…</p>
      ) : lots.length === 0 ? (
        <div className="py-14 text-center text-gray-400">
          <ParkingSquare size={36} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm">Nenhum estacionamento disponível nesta região ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lots.map((lot) => {
            const foto = Array.isArray(lot.photos) ? lot.photos[0] : null
            const coberto = lot.opening_hours?.coberto // flag opcional de cadastro
            return (
              <button
                key={lot.id}
                onClick={() => navigate(`/estacionamento/${lot.id}`)}
                className="w-full text-left bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-transform"
              >
                {foto && <div className="h-36 overflow-hidden"><img src={foto} alt="" className="w-full h-full object-cover" /></div>}
                <div className="p-4">
                  <p className="text-[15px] font-bold text-gray-900">{lot.name}</p>
                  <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin size={12} className="text-brand" /> {lot.region_name || 'Jericoacoara'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {coberto ? <Umbrella size={11} /> : <Sun size={11} />} {coberto ? 'Coberto' : 'Descoberto'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-[12px] text-gray-500 flex items-center gap-1"><ParkingSquare size={13} /> Consultar diária</span>
                    <span className="text-[13px] font-bold text-brand flex items-center gap-1">Ver opções <ChevronRight size={15} /></span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
