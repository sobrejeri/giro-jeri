// ── PasseioPersonalizado.jsx — o cliente MONTA o próprio passeio (cotação) ────
//
// Mesmo fluxo do translado personalizado, mas para passeios: o cliente define o
// roteiro (embarque + paradas) + veículo + data/hora/pessoas SEM preço e envia.
// A cooperativa precifica (app do operador), o cliente aceita e paga em
// "Minhas reservas", e a cotação vira uma reserva normal (service_type='tour').
import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfDay, isToday, isSameDay, addDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft, ChevronDown, ChevronUp, Calendar, Clock, Users, Plus, Minus, X,
  Zap, Info, CheckCircle2, Car, Loader2, Send, Check, UserRound,
} from 'lucide-react'
import { PlaceInput } from './Transfers'
import DateSheet from '../components/DateSheet'
import { api } from '../lib/api'
import { somenteTransporte, somenteServicos } from '../lib/transporte'
import { pontosDaRegiao } from '../lib/pontosTuristicos'
import { useLocaisProximos } from '../lib/locaisProximos'
import { useAuth } from '../contexts/AuthContext'
import { useRegion } from '../contexts/RegionContext'

// Próximo horário "redondo" (de 30 em 30 min) a partir de agora — usado quando
// a data é hoje e o horário escolhido já passou.
function proximoHorario() {
  const d = new Date()
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0)
  return format(d, 'HH:mm')
}

// Foto do veículo do catálogo (ou o ícone, se não tiver foto).
function FotoVeiculo({ v, className = 'w-10 h-10 rounded-lg', icone = 16, Icone = Car }) {
  return v.image_url
    ? <img src={v.image_url} alt="" className={`${className} object-cover shrink-0 bg-gray-100`} />
    : <span className={`${className} bg-gray-100 flex items-center justify-center shrink-0`}><Icone size={icone} className="text-gray-400" /></span>
}

// Um card por nome — o catálogo pode repetir o mesmo cadastro.
function umPorNome(lista) {
  const vistos = new Set()
  return lista.filter((v) => {
    const k = String(v.name || '').trim().toLowerCase()
    if (!k || vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}

// Linha de um veículo com quantidade — mesmo padrão dos translados: "+" quando
// está fora; "− N +" quando escolhido (dá para pedir 2 buggies, por exemplo).
function VeiculoLinha({ v, qty, onMais, onMenos }) {
  const cap = Number(v.seat_capacity) || 0
  return (
    <div className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all ${qty > 0 ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'}`}>
      <FotoVeiculo v={v} />
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] font-bold leading-tight truncate ${qty > 0 ? 'text-brand' : 'text-gray-900'}`}>{v.name}</p>
        {cap > 0 && <p className="text-[11px] text-gray-400 leading-tight mt-0.5">até {cap} {cap === 1 ? 'pessoa' : 'pessoas'}</p>}
      </div>
      {qty === 0 ? (
        <button type="button" onClick={onMais} aria-label={`Adicionar ${v.name}`}
          className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform shrink-0">
          <Plus size={14} className="text-white" />
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onMenos} aria-label={`Tirar um ${v.name}`}
            className="w-7 h-7 rounded-full border border-gray-200 bg-white flex items-center justify-center active:scale-95 transition-transform">
            <Minus size={11} className="text-gray-600" />
          </button>
          <span className="text-[14px] font-bold text-gray-900 w-4 text-center tabular-nums">{qty}</span>
          <button type="button" onClick={onMais} aria-label={`Adicionar mais um ${v.name}`}
            className="w-7 h-7 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform">
            <Plus size={11} className="text-white" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function PasseioPersonalizado() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { region } = useRegion()
  // Atalhos ao tocar na busca: partida → lugares perto da localização escolhida
  // (pousadas, mercados, praças…); paradas → os pontos turísticos.
  const pontos   = pontosDaRegiao(region)
  const proximos = useLocaisProximos()

  // Cada parada tem um id ESTÁVEL: a chave do React acompanha a parada (e o
  // estado interno do PlaceInput, como a lista aberta) mesmo ao remover outra.
  const nextId = useRef(1)
  function novaParada() { return { id: nextId.current++, name: '', meta: null } }

  const [origin, setOrigin] = useState('')
  const [originMeta, setOriginMeta] = useState(null)
  const [stops, setStops] = useState(() => [novaParada()])
  const [qtdVeiculos, setQtdVeiculos] = useState({})   // id do veículo → quantidade
  const [verVeiculos, setVerVeiculos] = useState(false) // lista de veículos aberta ("Ver tudo")
  const [servicosOn, setServicosOn] = useState({})     // id do serviço (guia) → incluído
  const [vehicleText, setVehicleText] = useState('')   // só se a região não tiver catálogo
  const [date, setDate] = useState(startOfDay(new Date()))
  const [time, setTime] = useState('08:00')
  const [people, setPeople] = useState(2)
  const [notes, setNotes] = useState('')
  const [showDate, setShowDate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const timeRef = useRef(null)

  const minDate = startOfDay(new Date())
  const minTime = isSameDay(date, minDate) ? format(new Date(), 'HH:mm') : '00:00'
  const dateLabel = isToday(date) ? 'Hoje'
    : isSameDay(date, addDays(minDate, 1)) ? 'Amanhã'
    : format(date, 'd MMM', { locale: ptBR })

  // Data = hoje e o horário já passou (ex.: abriu a tela às 10h com 08:00
  // pré-selecionado) → avança para o próximo horário válido, senão a API
  // recusa com "o horário já passou".
  useEffect(() => {
    if (isSameDay(date, startOfDay(new Date())) && time && time < format(new Date(), 'HH:mm')) {
      setTime(proximoHorario())
    }
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps

  // Veículos CADASTRADOS na plataforma — o catálogo inteiro, não só o da
  // região: as regiões são municípios (Jijoca, Cruz…) e cada veículo fica
  // cadastrado num só, então quem estava em Cruz via a lista vazia (e o pedido
  // vai para todas as cooperativas de qualquer forma). Só ativos e liberados
  // para passeio; quem transporta gente vai para "Veículos" e o serviço
  // adicional (guia), para a seção dele — mesmo critério do resto do app.
  const { data: veiculosData, isLoading: veiculosLoading } = useQuery({
    queryKey:  ['vehicles', 'tour-custom'],
    queryFn:   () => api.getVehicles({ is_active: 'true' }),
    staleTime: 5 * 60_000,
  })
  const catalogo = useMemo(
    () => (Array.isArray(veiculosData) ? veiculosData : (veiculosData?.data || []))
      .filter((v) => v.is_tour_allowed !== false && v.is_active !== false),
    [veiculosData],
  )
  const veiculos = useMemo(() => umPorNome(somenteTransporte(catalogo)), [catalogo])
  // Serviço adicional (o guia): não leva gente, então fica fora da conta de
  // lugares e entra à parte — acompanha qualquer passeio.
  const servicos = useMemo(() => umPorNome(somenteServicos(catalogo)), [catalogo])

  // O catálogo mudou e algum veículo/serviço escolhido saiu da lista → tira da escolha.
  useEffect(() => {
    const manter = (lista) => (m) => {
      const ids = new Set(lista.map((v) => v.id))
      const limpo = Object.fromEntries(Object.entries(m).filter(([id]) => ids.has(id)))
      return Object.keys(limpo).length === Object.keys(m).length ? m : limpo
    }
    setQtdVeiculos(manter(veiculos))
    setServicosOn(manter(servicos))
  }, [veiculos, servicos])
  const servicosEscolhidos = servicos.filter((s) => servicosOn[s.id])
  const alternarServico = (id) => setServicosOn((m) => {
    const { [id]: ligado, ...resto } = m
    return ligado ? resto : { ...resto, [id]: true }
  })

  // Escolha atual (na ordem do catálogo) e quantos lugares ela soma.
  const escolhidos     = veiculos.filter((v) => (qtdVeiculos[v.id] || 0) > 0).map((v) => ({ ...v, qty: qtdVeiculos[v.id] }))
  const totalVeiculos  = escolhidos.reduce((s, v) => s + v.qty, 0)
  const lugares        = escolhidos.reduce((s, v) => s + v.qty * (Number(v.seat_capacity) || 0), 0)
  const faltamLugares  = Math.max(0, people - lugares)
  const mudarQtd = (id, delta) => setQtdVeiculos((m) => {
    const n = Math.max(0, Math.min(20, (m[id] || 0) + delta))
    const { [id]: _antigo, ...resto } = m
    return n > 0 ? { ...resto, [id]: n } : resto
  })
  const canSubmit = origin.trim().length >= 2 && !!time && !!region?.id

  // O PlaceInput chama onChange(texto) e, em seguida, onPick(null) a CADA tecla
  // (o texto mudou → o lugar escolhido antes deixa de valer). Por isso nome e
  // lugar têm setters separados e funcionais: um nunca sobrescreve o outro com
  // um valor antigo.
  const setStopName = (id, name) => setStops((arr) => arr.map((s) => (s.id === id ? { ...s, name } : s)))
  const setStopMeta = (id, meta) => setStops((arr) => arr.map((s) => (s.id === id ? { ...s, meta } : s)))
  const addStop     = () => setStops((arr) => [...arr, novaParada()])
  const removeStop  = (id) => setStops((arr) => (arr.length > 1 ? arr.filter((s) => s.id !== id) : [novaParada()]))

  function resetForm() {
    setOrigin(''); setOriginMeta(null); setStops([novaParada()])
    setQtdVeiculos({}); setVerVeiculos(false); setServicosOn({}); setVehicleText(''); setPeople(2); setNotes('')
    setSuccess(false); setError('')
  }

  async function handleSubmit() {
    if (!token) { navigate('/login', { state: { from: '/passeio-personalizado' } }); return }
    if (!canSubmit) return
    setLoading(true); setError('')
    // Veículos para a cooperativa: "2× Buggy + 1× Quadriciclo". O campo aceita
    // até 80 caracteres; se a lista não couber, vai um resumo curto nele e a
    // lista completa segue nas observações (nada se perde).
    const listaVeiculos = escolhidos.map((v) => `${v.qty}× ${v.name}`).join(' + ')
    const cabe = listaVeiculos.length <= 80
    const vehicleType = escolhidos.length
      ? (cabe ? listaVeiculos : `${totalVeiculos} veículos (ver observações)`)
      : (vehicleText.trim() || undefined)
    // Serviços (o guia) vão nas observações: o pedido não tem campo próprio, e
    // é ali que a cooperativa lê o que precisa entrar no valor.
    const observacoes = [
      escolhidos.length && !cabe ? `Veículos: ${listaVeiculos}` : null,
      servicosEscolhidos.length ? `Serviços: ${servicosEscolhidos.map((s) => s.name).join(' + ')}` : null,
      notes.trim() || null,
    ].filter(Boolean).join(' · ') || undefined
    try {
      await api.requestTourQuote({
        region_id:         region.id,
        origin_place_name: origin.trim(),
        origin_latitude:   originMeta?.lat ?? undefined,
        origin_longitude:  originMeta?.lon ?? undefined,
        stops: stops
          .filter((s) => s.name.trim())
          .map((s) => ({ name: s.name.trim(), lat: s.meta?.lat ?? null, lng: s.meta?.lon ?? null })),
        vehicle_type:  vehicleType,
        service_date:  format(date, 'yyyy-MM-dd'),
        service_time:  time,
        people_count:  people,
        special_notes: observacoes,
      })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o pedido. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full pb-28 bg-gray-50">
      {/* Header */}
      <header className="bg-white px-4 pt-5 pb-3 sticky top-0 lg:top-[57px] z-40 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="relative flex items-center justify-center min-h-[32px] lg:max-w-3xl lg:mx-auto">
          <button onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Voltar">
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[20px] text-gray-900 tracking-wide">Montar meu passeio</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-3 lg:max-w-3xl lg:mx-auto">
        {success ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle2 size={32} className="text-emerald-500" />
            </div>
            <p className="text-[18px] font-extrabold text-gray-900 mb-2">Pedido enviado!</p>
            <p className="text-[13px] text-gray-500 max-w-[260px] mb-6">
              A cooperativa vai montar o valor do seu passeio e te avisar. Acompanhe em “Minhas reservas”.
            </p>
            <button onClick={() => navigate('/minhas-reservas')}
              className="bg-brand text-white font-bold rounded-2xl px-6 py-3 text-[14px] active:scale-95 transition-transform">
              Ver minhas cotações
            </button>
            <button onClick={resetForm} className="mt-3 text-[13px] text-gray-400 underline">
              Montar outro passeio
            </button>
          </div>
        ) : (
          <>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
              <Zap size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-700 leading-relaxed">
                Monte o roteiro do seu jeito. A cooperativa envia o valor e você decide se aceita — sem compromisso.
              </p>
            </div>

            {/* Roteiro: embarque + paradas */}
            <section className="bg-white rounded-2xl border border-gray-100 relative overflow-visible">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Roteiro</p>
              <div className="px-4 pb-4 space-y-3">
                <div>
                  <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Ponto de partida</label>
                  <div className="mt-1">
                    <PlaceInput value={origin} onChange={setOrigin} onPick={setOriginMeta}
                      placeholder="Onde o passeio começa?" dotClass="bg-brand"
                      sugestoes={{ tipo: 'proximos', ...proximos }} />
                  </div>
                </div>

                {stops.map((s, i) => (
                  <div key={s.id}>
                    {/* div, NÃO <label>: um label sem `for` rotula o primeiro
                        controle dentro dele — tocar em "Parada N" acionava o
                        botão remover e apagava a parada. */}
                    <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide flex items-center justify-between">
                      <span>Parada {i + 1}</span>
                      {(stops.length > 1 || s.name) && (
                        <button type="button" onClick={() => removeStop(s.id)}
                          aria-label={`Remover parada ${i + 1}`}
                          className="text-red-400 flex items-center gap-0.5 normal-case tracking-normal font-medium">
                          <X size={11} /> remover
                        </button>
                      )}
                    </div>
                    <div className="mt-1">
                      <PlaceInput value={s.name}
                        onChange={(v) => setStopName(s.id, v)}
                        onPick={(meta) => setStopMeta(s.id, meta)}
                        placeholder="Para onde quer ir?"
                        dotClass="border-2 border-gray-400 bg-transparent"
                        sugestoes={{ tipo: 'pontos', itens: pontos }} />
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addStop}
                  className="w-full flex items-center justify-center gap-1.5 text-[13px] font-semibold text-brand border border-dashed border-brand/40 rounded-xl py-2.5 active:scale-95 transition-transform">
                  <Plus size={14} /> Adicionar parada
                </button>
              </div>
            </section>

            {/* Veículos — catálogo da plataforma, com quantidade */}
            <section className="bg-white rounded-2xl border border-gray-100">
              <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Veículos desejados</p>
                {escolhidos.length > 0
                  ? <button type="button" onClick={() => setQtdVeiculos({})} className="text-[11px] font-semibold text-red-400">limpar</button>
                  : <span className="text-[10px] text-gray-400">opcional</span>}
              </div>
              <div className="px-4 pb-4 space-y-2.5">
                {veiculosLoading ? (
                  <div className="flex items-center gap-2 text-[12px] text-gray-400 py-2">
                    <Loader2 size={13} className="animate-spin" /> Carregando veículos…
                  </div>
                ) : veiculos.length > 0 ? (
                  verVeiculos ? (
                    // Aberto: um veículo por linha, com quantidade. Não fecha a
                    // cada toque (dá para montar "2 buggies + 1 quadriciclo");
                    // fecha em "Concluir".
                    <>
                      <div className="space-y-2">
                        {veiculos.map((v) => (
                          <VeiculoLinha key={v.id} v={v} qty={qtdVeiculos[v.id] || 0}
                            onMais={() => mudarQtd(v.id, 1)} onMenos={() => mudarQtd(v.id, -1)} />
                        ))}
                      </div>
                      <button type="button" onClick={() => setVerVeiculos(false)} aria-expanded
                        className={`w-full flex items-center justify-center gap-1 rounded-xl py-2.5 text-[13px] font-bold transition-transform active:scale-[0.98] ${
                          escolhidos.length ? 'bg-brand text-white' : 'text-gray-500'
                        }`}>
                        {escolhidos.length
                          ? <><Check size={15} /> Concluir · {totalVeiculos} {totalVeiculos === 1 ? 'veículo' : 'veículos'}</>
                          : <>Ver menos <ChevronUp size={14} /></>}
                      </button>
                    </>
                  ) : (
                    // Recolhido (padrão): o resumo da escolha, se houver, e o "Ver tudo".
                    <>
                      {escolhidos.length > 0 && (
                        <button type="button" onClick={() => setVerVeiculos(true)}
                          className="w-full text-left rounded-xl border border-brand bg-brand/5 p-2 space-y-1.5 active:scale-[0.99] transition-transform">
                          {escolhidos.map((v) => (
                            <span key={v.id} className="flex items-center gap-2.5">
                              <FotoVeiculo v={v} className="w-8 h-8 rounded-lg" icone={14} />
                              <span className="flex-1 min-w-0 text-[13px] font-bold text-brand truncate">{v.qty}× {v.name}</span>
                            </span>
                          ))}
                        </button>
                      )}
                      <button type="button" onClick={() => setVerVeiculos(true)} aria-expanded={false}
                        className="w-full flex items-center gap-2.5 border border-gray-200 rounded-xl px-3 py-2 active:scale-[0.98] transition-transform">
                        <span className="flex -space-x-2 shrink-0" aria-hidden>
                          {veiculos.slice(0, 4).map((v) => (
                            <FotoVeiculo key={v.id} v={v} className="w-7 h-7 rounded-full ring-2 ring-white" icone={12} />
                          ))}
                        </span>
                        <span className="flex-1 min-w-0 text-left">
                          <span className="block text-[13px] font-semibold text-gray-800 leading-tight truncate">
                            {escolhidos.length ? 'Alterar veículos' : 'Escolher veículos'}
                          </span>
                          <span className="block text-[11px] font-bold text-brand leading-tight mt-0.5">
                            Ver tudo ({veiculos.length})
                          </span>
                        </span>
                        <ChevronDown size={16} className="text-brand shrink-0" />
                      </button>
                    </>
                  )
                ) : (
                  // Catálogo sem veículo de passeio cadastrado: o cliente descreve.
                  <input value={vehicleText} onChange={(e) => setVehicleText(e.target.value)} maxLength={80}
                    placeholder="Descreva o veículo (ex.: buggy, 4x4)"
                    className="w-full text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400" />
                )}

                {/* Lugares da escolha × pessoas do grupo */}
                {escolhidos.length > 0 && lugares > 0 && (faltamLugares === 0 ? (
                  <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
                    <Check size={12} className="shrink-0" /> {lugares} lugares para {people} {people === 1 ? 'pessoa' : 'pessoas'}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                    {faltamLugares === 1 ? 'Falta 1 lugar' : `Faltam ${faltamLugares} lugares`} para {people} pessoas — adicione mais um veículo, ou a cooperativa ajusta no valor.
                  </p>
                ))}
              </div>
            </section>

            {/* Serviços adicionais (o guia): não é veículo — não conta lugar e
                vale para qualquer roteiro. Liga/desliga; a linha toda é o botão. */}
            {servicos.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100">
                <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Serviços adicionais</p>
                  <span className="text-[10px] text-gray-400">opcional</span>
                </div>
                <div className="px-4 pb-4 space-y-2">
                  {servicos.map((s) => {
                    const on = !!servicosOn[s.id]
                    return (
                      <button key={s.id} type="button" onClick={() => alternarServico(s.id)} aria-pressed={on}
                        className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all active:scale-[0.99] ${
                          on ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'
                        }`}>
                        <FotoVeiculo v={s} Icone={UserRound} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13px] font-bold leading-tight truncate ${on ? 'text-brand' : 'text-gray-900'}`}>{s.name}</span>
                          <span className="block text-[11px] text-gray-400 leading-snug mt-0.5 line-clamp-2">
                            {s.description?.trim() || 'Acompanha o grupo durante o passeio'}
                          </span>
                        </span>
                        <span className={`shrink-0 inline-flex items-center gap-1 text-[11.5px] font-bold px-3 py-1.5 rounded-lg ${
                          on ? 'bg-brand text-white' : 'border border-brand text-brand'
                        }`}>
                          {on ? <Check size={12} /> : <Plus size={12} />}
                          {on ? 'Incluído' : 'Adicionar'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Data & Horário */}
            <section className="bg-white rounded-2xl border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Data e horário</p>
              <div className="flex gap-2 px-4 pb-4">
                <button type="button" onClick={() => setShowDate(true)}
                  className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform">
                  <Calendar size={13} className="text-brand" />
                  <div className="text-left">
                    <p className="text-[9px] text-gray-400 leading-none">Data</p>
                    <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{dateLabel}</p>
                  </div>
                </button>
                <button type="button" onClick={() => timeRef.current?.showPicker?.() || timeRef.current?.focus()}
                  className="flex-1 flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 active:scale-95 transition-transform relative">
                  <Clock size={13} className="text-brand" />
                  <div className="text-left flex-1">
                    <p className="text-[9px] text-gray-400 leading-none">Horário</p>
                    <p className="text-[12px] font-semibold text-gray-800 mt-0.5">{time || 'Selecionar'}</p>
                  </div>
                  <input ref={timeRef} type="time" value={time} min={minTime}
                    onChange={(e) => setTime(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full cursor-pointer" />
                </button>
              </div>
            </section>

            {/* Pessoas */}
            <section className="bg-white rounded-2xl border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Pessoas</p>
              <div className="flex items-center justify-between px-4 pb-4">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-brand" />
                  <p className="text-[13px] font-bold text-gray-900">{people} {people === 1 ? 'pessoa' : 'pessoas'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPeople((p) => Math.max(1, p - 1))}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
                    <Minus size={12} className="text-gray-600" />
                  </button>
                  <span className="text-[15px] font-bold text-gray-900 w-5 text-center tabular-nums">{people}</span>
                  <button type="button" onClick={() => setPeople((p) => Math.min(50, p + 1))}
                    className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95 transition-transform">
                    <Plus size={12} className="text-white" />
                  </button>
                </div>
              </div>
            </section>

            {/* Observações */}
            <section className="bg-white rounded-2xl border border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-2">Observações</p>
              <div className="px-4 pb-4">
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Conte detalhes do passeio: pontos de interesse, paradas para fotos, almoço…"
                  className="w-full text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400" />
              </div>
            </section>

            {error && (
              <p className="text-[12px] text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
            )}

            <div className="flex items-start gap-2 px-1">
              <Info size={13} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-gray-400 leading-relaxed">
                O preço é definido pela cooperativa. Você recebe o valor em “Minhas reservas” e só paga se aceitar.
              </p>
            </div>

            {/* Ação no FIM do formulário (não fixa): uma barra presa embaixo
                ficava atrás do menu inferior e disputava espaço com os botões
                flutuantes ("Código", carrinho). O pb-28 da página garante que
                ela role acima deles. */}
            <div className="pt-1 space-y-1.5">
              <button type="button" onClick={handleSubmit} disabled={loading || !canSubmit}
                className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-[15px] transition-all ${
                  canSubmit ? 'bg-brand text-white active:scale-[0.98] shadow-md shadow-brand/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
                {loading ? 'Enviando…' : 'Pedir cotação do passeio'}
              </button>
              {!canSubmit && !loading && (
                <p className="text-[11px] text-gray-400 text-center">
                  {!region?.id ? 'Selecione uma região no topo do app.' : 'Informe o ponto de partida para pedir a cotação.'}
                </p>
              )}
            </div>
          </>
        )}

        {showDate && (
          <DateSheet value={date} onChange={setDate} onClose={() => setShowDate(false)}
            minDate={minDate} seasons={[]} highSeasonMonths={new Set()} />
        )}
      </div>
    </div>
  )
}
