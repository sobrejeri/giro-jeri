import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPin, ChevronRight, ParkingSquare, Umbrella, Sun, Search, Compass, Car, Clock } from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import EstacionamentoDesktop from './EstacionamentoDesktop'

// Primeiro nome da cidade/região (sem sufixos) para o banner.
function nomeCidade(region) {
  const n = (region?.name || '').trim()
  return n || 'Jeri'
}

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

  const cidade = nomeCidade(region)
  // Fundo do banner: carrossel com as fotos dos estacionamentos da região,
  // alternando automaticamente a cada 20s com transição suave (crossfade).
  const fotos = useMemo(
    () => (data?.data || []).flatMap((l) => (Array.isArray(l.photos) ? l.photos : [])).filter(Boolean),
    [data],
  )
  const [slide, setSlide] = useState(0)
  // Começa em uma foto aleatória e avança 1 a cada 20s enquanto houver >1 foto.
  useEffect(() => {
    if (fotos.length === 0) return
    setSlide(Math.floor(Math.random() * fotos.length))
    if (fotos.length < 2) return
    const t = setInterval(() => setSlide((i) => (i + 1) % fotos.length), 20000)
    return () => clearInterval(t)
  }, [fotos.length])

  return (
    <>
    <div className="px-4 pb-10 pt-3 space-y-4 lg:hidden">
      {/* Alternador Passeios | Translados | Vagas (mesma lojinha) */}
      <div className="flex bg-gray-100 rounded-2xl p-1">
        <button onClick={() => navigate('/passeios')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-bold text-gray-500 active:scale-95 transition-transform">
          <Compass size={15} /> Passeios
        </button>
        <button onClick={() => navigate('/transfers')}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-bold text-gray-500 active:scale-95 transition-transform">
          <Car size={15} /> Translados
        </button>
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[13px] font-bold bg-white text-brand shadow-sm" aria-current="page">
          <ParkingSquare size={15} /> Vagas
        </button>
      </div>

      {/* Banner — carrossel das fotos (crossfade a cada 20s) + degradê; cidade conforme a região */}
      <div className="relative rounded-2xl overflow-hidden text-white p-5 shadow-sm min-h-[128px] flex flex-col justify-center">
        {fotos.map((f, i) => (
          <img
            key={f + i}
            src={f}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === slide ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        <div className={`absolute inset-0 ${fotos.length ? 'bg-gradient-to-br from-black/70 via-black/45 to-brand/60' : 'bg-gradient-to-br from-brand to-orange-400'}`} />
        <div className="relative">
          <h1 className="text-[22px] font-extrabold leading-tight drop-shadow-sm">Seu carro seguro.<br />Você em {cidade}.</h1>
          <p className="text-[13px] text-white/90 mt-1 drop-shadow-sm">Encontre onde estacionar e aproveite a viagem.</p>
        </div>
        {/* Indicadores de slide */}
        {fotos.length > 1 && (
          <div className="absolute bottom-2.5 right-3 flex gap-1.5">
            {fotos.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === slide ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
            ))}
          </div>
        )}
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
            const oh = lot.opening_hours || {}
            const horario = oh.is_24h === false && oh.open && oh.close ? `${oh.open}–${oh.close}` : '24 horas'
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
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      <Clock size={11} /> {horario}
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

    {/* Desktop/PC */}
    <div className="hidden lg:block">
      <EstacionamentoDesktop />
    </div>
    </>
  )
}
