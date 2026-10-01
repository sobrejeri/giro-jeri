import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Calendar, Clock, Car, Umbrella, Sun, MapPin, Info, ShoppingCart } from 'lucide-react'
import { api } from '../lib/api'
import { useCart } from '../contexts/CartContext'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
// Período no fuso de Jeri (UTC−3, sem horário de verão).
const iso = (date, time) => (date && time ? `${date}T${time}:00-03:00` : null)

export default function EstacionamentoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { upsertItem } = useCart()

  const { data: lot, isLoading } = useQuery({
    queryKey: ['parking-lot', id],
    queryFn:  () => api.parkingLot(id),
  })

  const [entradaD, setEntradaD] = useState('')
  const [entradaH, setEntradaH] = useState('10:00')
  const [saidaD,   setSaidaD]   = useState('')
  const [saidaH,   setSaidaH]   = useState('10:00')
  const [veiculo,  setVeiculo]  = useState('')
  const [placa,    setPlaca]    = useState('')
  const [erro,     setErro]     = useState('')

  const tarifas = lot?.tariffs || []
  const vehicleType = veiculo || tarifas[0]?.vehicle_type || 'carro'
  const startAt = iso(entradaD, entradaH)
  const endAt   = iso(saidaD, saidaH)
  const periodoOk = startAt && endAt && Date.parse(endAt) > Date.parse(startAt)

  // Cotação no servidor (só quando o período é válido).
  const { data: cot } = useQuery({
    queryKey: ['parking-quote', id, vehicleType, startAt, endAt],
    queryFn:  () => api.parkingQuote({ lot_id: id, vehicle_type: vehicleType, start_at: startAt, end_at: endAt }),
    enabled:  !!(periodoOk && id),
    retry: false,
  })

  const precoBase = useMemo(() => {
    const t = tarifas.find((x) => x.vehicle_type === vehicleType) || tarifas[0]
    return t?.price_per_unit
  }, [tarifas, vehicleType])

  const coberto = lot?.opening_hours?.coberto

  function adicionar() {
    setErro('')
    if (!periodoOk) { setErro('Escolha entrada e saída (a saída deve ser depois da entrada).'); return }
    if (!cot) { setErro('Aguarde a cotação ou revise o período.'); return }
    if (cot?.disponibilidade && cot.disponibilidade.tem_vaga === false) {
      setErro('Sem vaga para este período. Tente outras datas.'); return
    }
    const foto = Array.isArray(lot.photos) ? lot.photos[0] : null
    upsertItem({
      id: `park-${id}-${startAt}-${endAt}-${vehicleType}`,
      kind: 'parking',
      name: lot.name,
      lot_id: id,
      lot_name: lot.name,
      cover_image_url: foto,
      region_name: lot.region_name || 'Jericoacoara',
      vehicle_type: vehicleType,
      plate: placa.trim() || null,
      start_at: startAt,
      end_at: endAt,
      diarias: cot.diarias,
      total: cot.total,
    })
    navigate('/carrinho')
  }

  if (isLoading) return <p className="p-6 text-center text-gray-400 text-sm">Carregando…</p>
  if (!lot) return <p className="p-6 text-center text-gray-400 text-sm">Estacionamento não encontrado.</p>

  const foto = Array.isArray(lot.photos) ? lot.photos[0] : null

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center active:scale-95">
          <ChevronLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-[16px] font-bold text-gray-900 truncate">{lot.name}</h1>
      </div>

      {foto && <div className="h-44 overflow-hidden"><img src={foto} alt="" className="w-full h-full object-cover" /></div>}

      <div className="px-4 py-4 space-y-4">
        <div>
          <h2 className="text-[20px] font-extrabold text-gray-900">{lot.name}</h2>
          <p className="text-[13px] text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={13} className="text-brand" /> {lot.region_name || 'Jericoacoara'}</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 mt-2">
            {coberto ? <Umbrella size={11} /> : <Sun size={11} />} {coberto ? 'Coberto' : 'Descoberto'}
          </span>
          {lot.description && <p className="text-[13px] text-gray-600 mt-3 leading-relaxed">{lot.description}</p>}
        </div>

        {/* Período */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-[13px] font-bold text-gray-900">Planeje sua estadia</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-gray-500">Entrada
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Calendar size={14} className="text-brand shrink-0" />
                <input type="date" value={entradaD} onChange={(e) => setEntradaD(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none" />
              </div>
            </label>
            <label className="text-[11px] font-semibold text-gray-500">Horário
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Clock size={14} className="text-brand shrink-0" />
                <input type="time" value={entradaH} onChange={(e) => setEntradaH(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none" />
              </div>
            </label>
            <label className="text-[11px] font-semibold text-gray-500">Saída
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Calendar size={14} className="text-brand shrink-0" />
                <input type="date" value={saidaD} onChange={(e) => setSaidaD(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none" />
              </div>
            </label>
            <label className="text-[11px] font-semibold text-gray-500">Horário
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Clock size={14} className="text-brand shrink-0" />
                <input type="time" value={saidaH} onChange={(e) => setSaidaH(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none" />
              </div>
            </label>
          </div>
        </div>

        {/* Veículo */}
        {tarifas.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <p className="text-[13px] font-bold text-gray-900">Tipo de veículo</p>
            <div className="flex flex-wrap gap-2">
              {tarifas.map((t) => (
                <button key={t.vehicle_type} onClick={() => setVeiculo(t.vehicle_type)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[13px] font-semibold capitalize ${
                    vehicleType === t.vehicle_type ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-600'
                  }`}>
                  <Car size={14} /> {t.vehicle_type} · {fmt(t.price_per_unit)}
                </button>
              ))}
            </div>
            <label className="block text-[11px] font-semibold text-gray-500">Placa (opcional)
              <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="Informar depois"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 h-10 text-[13px] outline-none focus:border-brand" />
            </label>
            <p className="text-[11px] text-gray-400 flex items-center gap-1"><Info size={11} /> Cada diária corresponde a 24 horas.</p>
          </div>
        )}

        {/* Resumo da cotação */}
        {periodoOk && cot && (
          <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-bold text-gray-900">{cot.diarias} diária(s) × {fmt(cot.unit_price ?? precoBase)}</p>
              {cot.disponibilidade?.tem_vaga === false
                ? <p className="text-[11px] text-red-500 font-semibold mt-0.5">Sem vaga para este período</p>
                : <p className="text-[11px] text-gray-500 mt-0.5">Você só paga após o estacionamento aceitar.</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Total</p>
              <p className="text-[18px] font-extrabold text-brand">{fmt(cot.total)}</p>
            </div>
          </div>
        )}

        {erro && <p className="text-[12px] text-red-500">{erro}</p>}
      </div>

      {/* Ação fixa */}
      <div className="fixed inset-x-0 bottom-[68px] px-4 pointer-events-none">
        <div className="max-w-[430px] mx-auto pointer-events-auto">
          <button onClick={adicionar}
            className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform shadow-lg shadow-brand/30">
            <ShoppingCart size={18} /> Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  )
}
