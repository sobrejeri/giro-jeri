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
  ChevronLeft, Calendar, Clock, Users, Plus, Minus, X,
  Zap, Info, CheckCircle2, Car, Loader2, Send, Check,
} from 'lucide-react'
import { PlaceInput } from './Transfers'
import DateSheet from '../components/DateSheet'
import { api } from '../lib/api'
import { somenteTransporte } from '../lib/transporte'
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
  const [veiculoSel, setVeiculoSel] = useState(null)   // veículo do catálogo
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
  // vai para todas as cooperativas de qualquer forma). Só ativos, liberados
  // para passeio e que transportam gente (guia e serviços ficam de fora —
  // mesmo critério do resto do app); um card por nome.
  const { data: veiculosData, isLoading: veiculosLoading } = useQuery({
    queryKey:  ['vehicles', 'tour-custom'],
    queryFn:   () => api.getVehicles({ is_active: 'true' }),
    staleTime: 5 * 60_000,
  })
  const veiculos = useMemo(() => {
    const lista = somenteTransporte(Array.isArray(veiculosData) ? veiculosData : (veiculosData?.data || []))
      .filter((v) => v.is_tour_allowed !== false && v.is_active !== false)
    // Um card por nome — o catálogo pode repetir o mesmo veículo.
    const vistos = new Set()
    return lista.filter((v) => {
      const k = String(v.name || '').trim().toLowerCase()
      if (!k || vistos.has(k)) return false
      vistos.add(k)
      return true
    })
  }, [veiculosData])

  // O catálogo mudou e o veículo escolhido saiu da lista → limpa a escolha.
  useEffect(() => {
    if (veiculoSel && !veiculos.some((v) => v.id === veiculoSel.id)) setVeiculoSel(null)
  }, [veiculos]) // eslint-disable-line react-hooks/exhaustive-deps

  const capacidadeSel = Number(veiculoSel?.seat_capacity) || 0
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
    setVeiculoSel(null); setVehicleText(''); setPeople(2); setNotes('')
    setSuccess(false); setError('')
  }

  async function handleSubmit() {
    if (!token) { navigate('/login', { state: { from: '/passeio-personalizado' } }); return }
    if (!canSubmit) return
    setLoading(true); setError('')
    try {
      await api.requestTourQuote({
        region_id:         region.id,
        origin_place_name: origin.trim(),
        origin_latitude:   originMeta?.lat ?? undefined,
        origin_longitude:  originMeta?.lon ?? undefined,
        stops: stops
          .filter((s) => s.name.trim())
          .map((s) => ({ name: s.name.trim(), lat: s.meta?.lat ?? null, lng: s.meta?.lon ?? null })),
        vehicle_type:  veiculoSel?.name || vehicleText.trim() || undefined,
        service_date:  format(date, 'yyyy-MM-dd'),
        service_time:  time,
        people_count:  people,
        special_notes: notes.trim() || undefined,
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

            {/* Veículo — catálogo da plataforma */}
            <section className="bg-white rounded-2xl border border-gray-100">
              <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Veículo desejado</p>
                <span className="text-[10px] text-gray-400">opcional</span>
              </div>
              <div className="px-4 pb-4 space-y-2.5">
                {veiculosLoading ? (
                  <div className="flex items-center gap-2 text-[12px] text-gray-400 py-2">
                    <Loader2 size={13} className="animate-spin" /> Carregando veículos…
                  </div>
                ) : veiculos.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {veiculos.map((v) => {
                      const ativo = veiculoSel?.id === v.id
                      const cap = Number(v.seat_capacity) || 0
                      return (
                        <button key={v.id} type="button" onClick={() => setVeiculoSel(ativo ? null : v)}
                          aria-pressed={ativo}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all active:scale-[0.98] ${
                            ativo ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'
                          }`}>
                          {v.image_url
                            ? <img src={v.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100" />
                            : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0"><Car size={16} className="text-gray-400" /></div>}
                          <div className="min-w-0 flex-1">
                            <p className={`text-[12px] font-bold leading-tight truncate ${ativo ? 'text-brand' : 'text-gray-900'}`}>{v.name}</p>
                            {cap > 0 && <p className="text-[10px] text-gray-400 leading-tight mt-0.5">até {cap} {cap === 1 ? 'pessoa' : 'pessoas'}</p>}
                          </div>
                          {ativo && <Check size={14} className="text-brand shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  // Região sem veículo de passeio cadastrado: o cliente descreve.
                  <input value={vehicleText} onChange={(e) => setVehicleText(e.target.value)}
                    placeholder="Descreva o veículo (ex.: buggy, 4x4)"
                    className="w-full text-[13px] text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand/30 placeholder-gray-400" />
                )}

                {capacidadeSel > 0 && people > capacidadeSel && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
                    Para {people} pessoas serão necessários {Math.ceil(people / capacidadeSel)} veículos — a cooperativa considera isso no valor.
                  </p>
                )}
              </div>
            </section>

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
