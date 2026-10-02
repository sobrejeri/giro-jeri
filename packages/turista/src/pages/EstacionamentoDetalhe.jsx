import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Calendar, Clock, Car, Umbrella, Sun, MapPin, Info, ShoppingCart } from 'lucide-react'
import { api } from '../lib/api'
import { useCart } from '../contexts/CartContext'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
// Período no fuso de Jeri (UTC−3, sem horário de verão).
const iso = (date, time) => (date && time ? `${date}T${time}:00-03:00` : null)
// Hoje (YYYY-MM-DD) no fuso de Jeri — para bloquear datas passadas no seletor.
function hojeJeri() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' })
  return p.format(new Date())
}

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
  const hoje = hojeJeri() // data mínima (bloqueia passado no seletor)
  // Se a saída ficar antes da entrada (ou no passado), zera para forçar nova escolha.
  useEffect(() => {
    if (saidaD && ((entradaD && saidaD < entradaD) || saidaD < hoje)) setSaidaD('')
  }, [entradaD, saidaD, hoje])

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

  // Carrossel da hero: alterna entre as fotos deste estacionamento a cada 20s.
  const fotos = useMemo(() => (Array.isArray(lot?.photos) ? lot.photos.filter(Boolean) : []), [lot])
  const [slide, setSlide] = useState(0)
  useEffect(() => {
    setSlide(0)
    if (fotos.length < 2) return
    const t = setInterval(() => setSlide((i) => (i + 1) % fotos.length), 20000)
    return () => clearInterval(t)
  }, [fotos.length])

  // Horários permitidos conforme o funcionamento. 24h → meia em meia hora o dia
  // todo; senão, só dentro de [abre, fecha]. Impede o cliente de escolher um
  // horário que o estacionamento não atende.
  const horarios = useMemo(() => {
    const oh = lot?.opening_hours || {}
    const todas = []
    for (let m = 0; m < 24 * 60; m += 30) todas.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    if (oh.is_24h === false && oh.open && oh.close) {
      const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
      const ini = toMin(oh.open), fim = toMin(oh.close)
      return todas.filter((h) => { const x = toMin(h); return x >= ini && x <= fim })
    }
    return todas
  }, [lot])
  const h24 = (lot?.opening_hours?.is_24h ?? true) !== false
  // Mantém os horários escolhidos dentro da janela quando o lote carrega/muda.
  useEffect(() => {
    if (!horarios.length) return
    if (!horarios.includes(entradaH)) setEntradaH(horarios[0])
    if (!horarios.includes(saidaH)) setSaidaH(horarios[0])
  }, [horarios]) // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="pb-44">
      {/* Hero full-bleed (carrossel) com o botão de voltar sobreposto — sem espaço em branco */}
      <div className="relative h-56 overflow-hidden bg-gray-200">
        {fotos.map((f, i) => (
          <img
            key={f + i}
            src={f}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === slide ? 'opacity-100' : 'opacity-0'}`}
          />
        ))}
        {/* Degradê no topo para dar contraste ao botão */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent pointer-events-none" />
        <button onClick={() => navigate(-1)}
          className="absolute top-3 left-4 w-9 h-9 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm active:scale-95">
          <ChevronLeft size={20} className="text-gray-800" />
        </button>
        {fotos.length > 1 && (
          <div className="absolute bottom-2.5 right-3 flex gap-1.5">
            {fotos.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all duration-500 ${i === slide ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        <div>
          <h2 className="text-[20px] font-extrabold text-gray-900">{lot.name}</h2>
          <p className="text-[13px] text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={13} className="text-brand" /> {lot.region_name || 'Jericoacoara'}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {coberto ? <Umbrella size={11} /> : <Sun size={11} />} {coberto ? 'Coberto' : 'Descoberto'}
            </span>
            {(() => {
              const oh = lot.opening_hours || {}
              const texto = oh.is_24h === false && oh.open && oh.close ? `${oh.open}–${oh.close}` : '24 horas'
              return (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                  <Clock size={11} /> {texto}
                </span>
              )
            })()}
          </div>
          {lot.description && <p className="text-[13px] text-gray-600 mt-3 leading-relaxed">{lot.description}</p>}
          {lot.address && <p className="text-[12px] text-gray-500 mt-2 flex items-start gap-1.5"><MapPin size={13} className="text-brand shrink-0 mt-0.5" /> {lot.address}</p>}
          {(() => {
            const temGeo = lot.lat != null && lot.lng != null
            const q = temGeo ? `${lot.lat},${lot.lng}` : encodeURIComponent(lot.address || lot.name || 'Jericoacoara')
            const gmaps = `https://www.google.com/maps/search/?api=1&query=${q}`
            const waze = temGeo ? `https://waze.com/ul?ll=${lot.lat},${lot.lng}&navigate=yes` : `https://waze.com/ul?q=${q}&navigate=yes`
            if (!temGeo && !lot.address) return null
            return (
              <div className="flex gap-2 mt-3">
                <a href={gmaps} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-xl py-2 text-[12px] font-semibold text-gray-700 active:scale-[0.98]">
                  <MapPin size={14} className="text-brand" /> Google Maps
                </a>
                <a href={waze} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 border border-gray-200 rounded-xl py-2 text-[12px] font-semibold text-gray-700 active:scale-[0.98]">
                  <Car size={14} className="text-brand" /> Waze
                </a>
              </div>
            )
          })()}
        </div>

        {/* Período */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
          <p className="text-[13px] font-bold text-gray-900">Planeje sua estadia</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-gray-500">Entrada
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Calendar size={14} className="text-brand shrink-0" />
                <input type="date" min={hoje} value={entradaD} onChange={(e) => setEntradaD(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none" />
              </div>
            </label>
            <label className="text-[11px] font-semibold text-gray-500">Horário
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Clock size={14} className="text-brand shrink-0" />
                <select value={entradaH} onChange={(e) => setEntradaH(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none">
                  {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </label>
            <label className="text-[11px] font-semibold text-gray-500">Saída
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Calendar size={14} className="text-brand shrink-0" />
                <input type="date" min={entradaD || hoje} value={saidaD} onChange={(e) => setSaidaD(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none" />
              </div>
            </label>
            <label className="text-[11px] font-semibold text-gray-500">Horário
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2 h-10 mt-1">
                <Clock size={14} className="text-brand shrink-0" />
                <select value={saidaH} onChange={(e) => setSaidaH(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none">
                  {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </label>
          </div>
          {!h24 && lot?.opening_hours?.open && (
            <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
              <Clock size={12} /> Atende das {lot.opening_hours.open} às {lot.opening_hours.close} — só esses horários ficam disponíveis.
            </p>
          )}
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

        {/* Disponibilidade do período escolhido */}
        {periodoOk && cot && (
          cot.disponibilidade?.tem_vaga === false ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-[13px] text-red-700 font-semibold flex items-center gap-2">
              <Sun size={15} className="shrink-0" /> Esgotado para esse período — escolha outras datas.
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-[12px] text-emerald-700 font-semibold flex items-center gap-2">
              <ParkingSquare size={14} className="shrink-0" />
              {Number(cot.disponibilidade?.disponivel) > 0
                ? `${cot.disponibilidade.disponivel} vaga(s) disponível(is) nesse período`
                : 'Vaga disponível nesse período'}
            </div>
          )
        )}

        {/* Resumo da cotação */}
        {periodoOk && cot && (
          <div className="bg-brand/5 border border-brand/20 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-bold text-gray-900">{cot.diarias} diária(s) × {fmt(cot.unit_price ?? precoBase)}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">Você só paga após o estacionamento aceitar.</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-gray-400">Total</p>
              <p className="text-[18px] font-extrabold text-brand">{fmt(cot.total)}</p>
            </div>
          </div>
        )}

        {erro && <p className="text-[12px] text-red-500">{erro}</p>}
      </div>

      {/* Ação fixa — só libera com período válido, veículo e cotação pronta */}
      {(() => {
        const pronto = periodoOk && !!cot && !!vehicleType &&
          !(cot?.disponibilidade && cot.disponibilidade.tem_vaga === false)
        const faltam = []
        if (!entradaD || !saidaD) faltam.push('período')
        else if (!periodoOk) faltam.push('saída depois da entrada')
        if (!vehicleType) faltam.push('veículo')
        return (
          <div className="fixed inset-x-0 bottom-[68px] px-4 pointer-events-none">
            <div className="max-w-[430px] mx-auto pointer-events-auto">
              {!pronto && faltam.length > 0 && (
                <p className="text-[11px] text-amber-600 font-semibold text-center mb-1.5 bg-white/90 rounded-lg py-1">
                  Falta: {faltam.join(' · ')}
                </p>
              )}
              <button onClick={adicionar} disabled={!pronto}
                className="w-full flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-4 text-[15px] active:scale-[0.98] transition-transform shadow-lg shadow-brand/30 disabled:opacity-50 disabled:active:scale-100">
                <ShoppingCart size={18} /> {pronto ? `Adicionar ao carrinho · ${fmt(cot.total)}` : 'Adicionar ao carrinho'}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
