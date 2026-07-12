import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingCart, Trash2, Calendar, Clock, Users, Car, MapPin, Pencil,
  CheckCircle2, AlertTriangle, Loader2, Send, X, Plus, Minus, ChevronRight, Sparkles,
} from 'lucide-react'
import PageHeader from '../components/layout/PageHeader'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { itemMissing, requestPayloadFor } from '../lib/cartCheckout'
import { getPartner as getPartnerAttribution } from '../lib/partner'
import { getAffiliate as getAffiliateAttribution } from '../lib/affiliate'
import { PlaceInput } from './Transfers'
import { format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import DateSheet from '../components/DateSheet'
import { highSeasonMonthSet } from '../lib/season'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`
const todayIso = () => format(new Date(), 'yyyy-MM-dd')

// Relógio de referência das regras de antecedência: America/Fortaleza (UTC-3),
// o mesmo fuso que o servidor usa para validar cutoff e antecedência mínima.
function fortalezaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t) => parts.find((x) => x.type === t)?.value
  return {
    todayIso: `${get('year')}-${get('month')}-${get('day')}`,
    minutes:  Number(get('hour')) * 60 + Number(get('minute')),
  }
}
const toMin = (hhmm) => hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null
const fromMin = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const nextDayIso = (iso) => format(new Date(new Date(`${iso}T12:00:00`).getTime() + 86400000), 'yyyy-MM-dd')

// Antecedência mínima para o MESMO dia: transfers 4h (transfer_min_advance_hours),
// passeios 30min. Passeio também respeita o cutoff (padrão meio-dia).
const LEAD_MINUTES = { transfer: 240, tour: 30 }

function dayLabel(iso) {
  if (!iso) return '—'
  try { return format(new Date(`${iso}T12:00:00`), "d 'de' MMM", { locale: ptBR }) }
  catch { return iso }
}

/* ── Edição de um item (bottom sheet) ───────────────────────────
   Obrigatórios: data, horário, pessoas, veículo(s) e (passeio) local de
   saída. Aumentou pessoas → precisa de capacidade: o Salvar só ativa quando
   tudo está preenchido E os veículos comportam o grupo. */
function EditSheet({ item, onSave, onClose }) {
  const isTransfer = item.kind === 'transfer'
  const [dateIso, setDateIso]   = useState(item.dateIso || '')
  const [time, setTime]         = useState(item.time || '')
  const [people, setPeople]     = useState(item.people || 1)
  const [originText, setOrigin] = useState(item.origin_text || '')
  const [vehicles, setVehicles] = useState(() => (item.vehicles || []).map((v) => ({ ...v })))
  const [showExtras, setShowExtras] = useState(false)

  // Capacidades/preços reais vêm da API — rascunhos antigos podem não ter a
  // capacidade gravada, e sem ela a regra "pessoas × lugares" não fecha.
  // Também alimenta o "Adicionar outro veículo".
  const { data: tourVehiclesData, isFetched: tvFetched } = useQuery({
    queryKey: ['cart-edit-tour-vehicles', item.id],
    queryFn:  () => api.getTourVehicles(item.id),
    enabled:  !isTransfer,
    staleTime: 5 * 60 * 1000,
  })
  const needAll = isTransfer || (tvFetched && (tourVehiclesData || []).length === 0)
  const { data: allVehiclesData } = useQuery({
    queryKey: ['cart-edit-all-vehicles'],
    queryFn:  () => api.getVehicles({ is_active: 'true' }),
    enabled:  needAll,
    staleTime: 5 * 60 * 1000,
  })

  const unitPrice = isTransfer ? (Number(item.vehicles?.[0]?.price) || 0) : null
  const available = useMemo(() => {
    const all = Array.isArray(allVehiclesData) ? allVehiclesData : (allVehiclesData?.vehicles || [])
    if (isTransfer) {
      return all
        .filter((v) => v.is_transfer_allowed !== false && v.is_active !== false)
        .map((v) => ({ id: v.id, name: v.name, price: unitPrice, cap: v.seat_capacity || null }))
    }
    const list = (tourVehiclesData || []).length ? tourVehiclesData : all
    return list
      .filter((v) => v.is_tour_allowed !== false && v.is_private_allowed !== false && v.is_active !== false)
      .map((v) => ({ id: v.id, name: v.name, price: Number(v.base_price) || 0, cap: v.seat_capacity || null }))
  }, [isTransfer, tourVehiclesData, allVehiclesData, unitPrice])

  // Preenche capacidade/preço que faltarem nos veículos já escolhidos
  useEffect(() => {
    if (!available.length) return
    setVehicles((prev) => prev.map((v) => {
      const src = available.find((a) => a.id === v.id)
      if (!src) return v
      return {
        ...v,
        cap:   Number(v.cap)   > 0 ? v.cap   : src.cap,
        price: Number(v.price) > 0 ? v.price : src.price,
      }
    }))
  }, [available])

  const extras = available.filter((a) => !vehicles.some((v) => v.id === a.id))

  const total = vehicles.reduce((s, v) => s + (Number(v.price) || 0) * (v.qty || 0), 0)
  const qtyTotal = vehicles.reduce((s, v) => s + (v.qty || 0), 0)
  const capsKnown = vehicles.length > 0 && vehicles.every((v) => Number(v.cap) > 0)
  const capacity  = capsKnown ? vehicles.reduce((s, v) => s + (Number(v.cap) || 0) * (v.qty || 0), 0) : null
  const capacityOk = !capsKnown || capacity >= people

  // Sugestão quando falta lugar: o menor veículo que cobre o déficit
  // (senão o maior disponível) — existente ou do catálogo.
  const suggestion = useMemo(() => {
    if (capacityOk || !capsKnown) return null
    const deficit = people - capacity
    const pool = [...vehicles, ...extras].filter((v) => Number(v.cap) > 0)
    if (!pool.length) return null
    const fits = pool.filter((v) => v.cap >= deficit).sort((a, b) => a.cap - b.cap)
    return fits[0] || pool.sort((a, b) => b.cap - a.cap)[0]
  }, [capacityOk, capsKnown, people, capacity, vehicles, extras])

  function addVehicle(a) {
    setVehicles((prev) => {
      const i = prev.findIndex((v) => v.id === a.id)
      if (i >= 0) return prev.map((v, j) => j === i ? { ...v, qty: (v.qty || 0) + 1 } : v)
      return [...prev, { id: a.id, name: a.name, qty: 1, price: a.price, cap: a.cap }]
    })
  }

  // Alta temporada (cor no calendário) — mesmas regras das telas de seleção.
  const { data: seasonsData } = useQuery({
    queryKey: ['seasons', item.region_id],
    queryFn:  () => api.getSeasons(item.region_id ? { region_id: item.region_id } : {}),
    staleTime: 10 * 60 * 1000,
    retry: 3,               // API pode estar “acordando” (Render) — não desistir na 1ª
    refetchOnWindowFocus: true,
  })
  const highSeasonMonths = highSeasonMonthSet(seasonsData || [])
  const [showDate, setShowDate] = useState(false)

  // Regras de antecedência (mesmo relógio do servidor — America/Fortaleza):
  // • Transfer: 4h de antecedência. • Passeio: cutoff do serviço (padrão
  //   meio-dia) + 30min de folga. Se o mínimo passa da meia-noite, rola p/ amanhã.
  const { todayIso: fToday, minutes: nowMin } = fortalezaNow()
  const cutoffMin  = toMin(item.booking_cutoff_time || null) ?? (isTransfer ? null : 720)
  // Antecedência por serviço (admin define no catálogo). Se ausente, usa o padrão.
  const perServiceLead = item.min_advance_hours != null ? Number(item.min_advance_hours) * 60 : null
  const lead       = perServiceLead ?? LEAD_MINUTES[isTransfer ? 'transfer' : 'tour']
  const earliestTodayMin = nowMin + lead
  const afterCutoff = cutoffMin != null && nowMin >= cutoffMin
  const rollsToTomorrow = afterCutoff || earliestTodayMin >= 1440
  const minDateIso = rollsToTomorrow ? nextDayIso(fToday) : fToday
  const minDate    = startOfDay(new Date(`${minDateIso}T12:00:00`))

  const dateOk = !!dateIso && dateIso >= minDateIso
  const sameDay = dateIso === fToday
  const timeOk  = !!time && (!sameDay || toMin(time) >= earliestTodayMin)

  let timeHint = null
  if (dateIso && !dateOk && afterCutoff) {
    timeHint = `Este serviço aceita solicitações para o mesmo dia só até ${item.booking_cutoff_time.slice(0, 5)} — escolha a partir de ${dayLabel(minDateIso)}.`
  } else if (time && sameDay && !timeOk && earliestTodayMin < 1440) {
    timeHint = `Para hoje, escolha a partir de ${fromMin(earliestTodayMin)} (antecedência mínima de ${perServiceLead != null ? `${item.min_advance_hours}h` : isTransfer ? '4h' : '30min'}).`
  } else if (time && sameDay && !timeOk) {
    timeHint = `Não há mais horários para hoje — escolha a partir de ${dayLabel(nextDayIso(fToday))}.`
  }

  const missing = []
  if (!dateOk) missing.push('data válida')
  if (!time) missing.push('horário')
  else if (!timeOk) missing.push('horário com antecedência')
  if (!(people >= 1)) missing.push('pessoas')
  if (qtyTotal < 1) missing.push('veículo')
  if (!isTransfer && !originText.trim()) missing.push('local de saída')
  const canSave = missing.length === 0 && capacityOk

  function bump(idx, delta) {
    setVehicles((prev) => prev.map((v, i) => i === idx ? { ...v, qty: Math.max(0, (v.qty || 0) + delta) } : v))
  }

  function save() {
    if (!canSave) return
    onSave({
      ...item,
      dateIso, time, people,
      ...(isTransfer ? {} : { origin_text: originText.trim() }),
      vehicles,
      total,
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-w-[430px] mx-auto max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="font-bold text-gray-900 text-[15px] leading-tight flex-1 pr-2">{item.name}</p>
          <button onClick={onClose} aria-label="Fechar edição" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
            <X size={15} className="text-gray-600" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-4">
          {isTransfer && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 text-[12.5px] text-gray-700">
              <MapPin size={13} className="text-brand shrink-0" />
              <span className="font-semibold">{item.origin}</span>
              <ChevronRight size={12} className="text-gray-400" />
              <span className="font-semibold">{item.dest}</span>
            </div>
          )}

          {!isTransfer && (
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Local de saída *</label>
              <div className="mt-1">
                <PlaceInput
                  value={originText}
                  onChange={setOrigin}
                  onPick={(p) => { if (p) setOrigin(p.label || p.address || '') }}
                  placeholder="Busque a pousada ou ponto de encontro"
                  dotClass="bg-brand"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Data *</label>
              <button type="button" onClick={() => setShowDate(true)}
                className="mt-1 w-full text-left bg-gray-50 rounded-xl px-3 py-3 text-[14px] text-gray-800 outline-none focus:ring-2 focus:ring-brand/30">
                {dateIso ? dayLabel(dateIso) : 'Escolher data'}
              </button>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Horário *</label>
              <input
                type="time" value={time} min={sameDay ? fromMin(earliestTodayMin) : undefined}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full bg-gray-50 rounded-xl px-3 py-3 text-[14px] text-gray-800 outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>

          {showDate && (
            <DateSheet
              value={dateIso ? new Date(`${dateIso}T12:00:00`) : minDate}
              onChange={(d) => setDateIso(format(d, 'yyyy-MM-dd'))}
              onClose={() => setShowDate(false)}
              minDate={minDate}
              highSeasonMonths={highSeasonMonths}
            />
          )}

          {timeHint && (
            <p className="text-[11.5px] font-semibold text-amber-600 flex items-start gap-1.5 -mt-1">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {timeHint}
            </p>
          )}

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Pessoas *</label>
            <div className="mt-1 flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3 w-fit">
              <button onClick={() => setPeople((p) => Math.max(1, p - 1))} aria-label="Menos pessoas"
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center active:scale-95">
                <Minus size={13} className="text-gray-600" />
              </button>
              <span className="text-[16px] font-bold text-gray-900 w-6 text-center tabular-nums">{people}</span>
              <button onClick={() => setPeople((p) => p + 1)} aria-label="Mais pessoas"
                className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95">
                <Plus size={13} className="text-white" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Veículos *</label>
            <div className="mt-1 space-y-2">
              {vehicles.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                  <Car size={15} className="text-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{v.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {fmt(v.price)}/veículo{Number(v.cap) > 0 ? ` · até ${v.cap} pessoas` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => bump(i, -1)} aria-label={`Menos ${v.name}`}
                      className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center active:scale-95">
                      <Minus size={11} className="text-gray-600" />
                    </button>
                    <span className="text-[14px] font-bold text-gray-900 w-4 text-center tabular-nums">{v.qty || 0}</span>
                    <button onClick={() => bump(i, +1)} aria-label={`Mais ${v.name}`}
                      className="w-7 h-7 rounded-full bg-brand flex items-center justify-center active:scale-95">
                      <Plus size={11} className="text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {!capacityOk && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-2">
                <p className="text-[11.5px] font-semibold text-amber-700 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  Capacidade insuficiente: {capacity} lugar{capacity === 1 ? '' : 'es'} para {people} pessoas — adicione veículos.
                </p>
                {suggestion && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-amber-800">
                      Sugestão: <span className="font-bold">+1x {suggestion.name}</span>
                      {Number(suggestion.cap) > 0 ? ` (até ${suggestion.cap} pessoas)` : ''}
                    </p>
                    <button onClick={() => addVehicle(suggestion)}
                      className="shrink-0 bg-brand text-white text-[11.5px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform">
                      Adicionar
                    </button>
                  </div>
                )}
              </div>
            )}

            {extras.length > 0 && (
              <div className="mt-2">
                <button onClick={() => setShowExtras((s) => !s)}
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-brand active:scale-95 transition-transform">
                  <Plus size={13} /> {showExtras ? 'Ocultar outros veículos' : 'Adicionar outro veículo'}
                </button>
                {showExtras && (
                  <div className="mt-2 space-y-2">
                    {extras.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                        <Car size={15} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{a.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {fmt(a.price)}/veículo{Number(a.cap) > 0 ? ` · até ${a.cap} pessoas` : ''}
                          </p>
                        </div>
                        <button onClick={() => addVehicle(a)} aria-label={`Adicionar ${a.name}`}
                          className="w-7 h-7 rounded-full bg-brand flex items-center justify-center shrink-0 active:scale-95">
                          <Plus size={11} className="text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 pb-[max(16px,env(safe-area-inset-bottom))] space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 uppercase font-bold tracking-wide">Total do item</p>
            <p className="text-[18px] font-extrabold text-brand">{fmt(total)}</p>
          </div>
          <button
            onClick={save}
            disabled={!canSave}
            className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            Salvar
          </button>
          {!canSave && (
            <p className="text-[10.5px] text-gray-400 text-center">
              {!capacityOk ? 'Ajuste os veículos para comportar o grupo.' : `Preencha: ${missing.join(', ')}.`}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Página do carrinho (estilo Mercado Livre) ─────────────────
   Prévia de todos os serviços (foto, valores, veículos) + Editar por item.
   "Solicitar tudo" só habilita quando TODOS os itens estão com os dados
   completos; envia cada item como uma solicitação própria, com progresso. */
export default function CartPage() {
  const { items, total, upsertItem, removeItem } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(null)     // item em edição
  const [results, setResults] = useState({})       // id → {status, code?, msg?}
  const [batch, setBatch] = useState(null)         // snapshot durante envio
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [done, setDone] = useState(false)

  // Sugestões (cross-sell): incentiva o cliente a adicionar passeios. Mostra
  // passeios que ainda não estão no carrinho — aparece quando já há um item
  // (transfer ou passeio) para estimular a montar mais da viagem.
  const { data: toursData } = useQuery({
    queryKey:  ['cart-suggested-tours'],
    queryFn:   () => api.getTours({ limit: 10 }),
    staleTime: 5 * 60_000,
  })
  const cartIds = new Set(items.map((i) => i.id))
  const suggestedTours = (Array.isArray(toursData) ? toursData : toursData?.data || toursData?.tours || [])
    .filter((t) => t && !cartIds.has(t.id))
    .slice(0, 8)

  const list = batch || items
  const allComplete = items.length > 0 && items.every((i) => itemMissing(i).length === 0)
  const okCount  = Object.values(results).filter((r) => r.status === 'ok').length
  const errCount = Object.values(results).filter((r) => r.status === 'error').length

  async function submitAll() {
    if (submitting || !allComplete) return
    if (!user) { navigate('/login', { state: { from: '/carrinho' } }); return }
    const snapshot = [...items]
    setBatch(snapshot)
    setSubmitting(true)
    setSubmitError(null)
    const res = {}
    snapshot.forEach((it) => { res[it.id] = { status: 'sending' } })
    setResults({ ...res })
    try {
      // Carrinho universal: 1 chamada → N reservas no MESMO grupo (atômico).
      // Com link de cooperativa ativo, o grupo inteiro nasce atribuído a ela.
      const partner = getPartnerAttribution()
      const affiliate = getAffiliateAttribution()
      const created = await api.cartRequest(
        snapshot.map(requestPayloadFor),
        {
          ...(partner?.slug ? { partner_slug: partner.slug } : {}),
          ...(affiliate?.code ? { affiliate_code: affiliate.code } : {}),
        },
      )
      // Casa cada reserva ao item por service_id (permite repetição do mesmo
      // serviço no carrinho consumindo em ordem).
      const byService = new Map()
      for (const b of created?.bookings || []) {
        if (!byService.has(b.service_id)) byService.set(b.service_id, [])
        byService.get(b.service_id).push(b)
      }
      for (const it of snapshot) {
        const b = byService.get(it.id)?.shift()
        res[it.id] = { status: 'ok', code: b?.booking_code }
        removeItem(it.id)
      }
      setResults({ ...res })
      setDone(true)
    } catch (err) {
      // Atômico: nada foi criado. Mantém os itens no carrinho para reenvio.
      setBatch(null)
      setSubmitError(err?.message || 'Não foi possível enviar o carrinho. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-40">
      <PageHeader title={`Carrinho${items.length ? ` (${items.length})` : ''}`} />

      {list.length === 0 && !done ? (
        <div className="px-6 pt-20 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ShoppingCart size={26} className="text-gray-300" />
          </div>
          <p className="text-[15px] font-bold text-gray-700">Seu carrinho está vazio</p>
          <p className="text-[12.5px] text-gray-400 mt-1">Monte um passeio ou translado e ele fica salvo aqui.</p>
          <button
            onClick={() => navigate('/passeios')}
            className="mt-5 bg-brand text-white font-bold text-[13px] px-6 py-3 rounded-2xl active:scale-95 transition-transform"
          >
            Ver passeios
          </button>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-3">
          {list.map((item) => {
            const miss = itemMissing(item)
            const st = results[item.id]
            const complete = miss.length === 0
            return (
              <div key={item.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${st?.status === 'ok' ? 'border-emerald-200' : st?.status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
                <div className="flex gap-3 p-3">
                  {/* Foto */}
                  <div className="w-[86px] h-[86px] rounded-xl overflow-hidden shrink-0 bg-gray-100">
                    {item.cover_image_url ? (
                      <img src={item.cover_image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${item.kind === 'transfer' ? 'bg-gradient-to-br from-[#155e75] to-[#22b8cf]' : 'bg-gradient-to-br from-orange-400 to-amber-300'}`}>
                        <Car size={26} className="text-white/70" />
                      </div>
                    )}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-bold text-gray-900 leading-tight">{item.name}</p>
                      {!batch && (
                        <button onClick={() => removeItem(item.id)} aria-label="Remover do carrinho"
                          className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 active:scale-95">
                          <Trash2 size={13} className="text-gray-400" />
                        </button>
                      )}
                      {st?.status === 'sending' && <Loader2 size={16} className="text-brand animate-spin shrink-0" />}
                      {st?.status === 'ok' && <CheckCircle2 size={17} className="text-emerald-500 shrink-0" />}
                      {st?.status === 'error' && <AlertTriangle size={16} className="text-red-500 shrink-0" />}
                    </div>

                    <div className="flex items-center gap-2.5 mt-1 text-[11px] text-gray-500 flex-wrap">
                      <span className="inline-flex items-center gap-1"><Calendar size={10} className="text-brand" />{dayLabel(item.dateIso)}</span>
                      <span className="inline-flex items-center gap-1"><Clock size={10} className="text-brand" />{item.time || '—'}</span>
                      <span className="inline-flex items-center gap-1"><Users size={10} className="text-brand" />{item.people}</span>
                    </div>
                    {item.vehicles?.length > 0 && (
                      <p className="text-[11.5px] text-gray-600 mt-1 truncate">
                        {item.vehicles.filter((v) => v.qty > 0).map((v) => `${v.qty}x ${v.name}`).join(' + ')}
                      </p>
                    )}
                    <p className="text-[16px] font-extrabold text-gray-900 mt-1">{fmt(item.total)}</p>
                  </div>
                </div>

                {/* Rodapé do card: status + editar */}
                <div className="flex items-center justify-between px-3 pb-3">
                  {st?.status === 'ok' ? (
                    <span className="text-[11px] font-bold text-emerald-600">Solicitação {st.code} enviada ✓</span>
                  ) : st?.status === 'error' ? (
                    <span className="text-[11px] font-bold text-red-500 flex-1 pr-2">{st.msg}</span>
                  ) : complete ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 size={12} /> Dados completos
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                      <AlertTriangle size={12} /> Falta: {miss.join(', ')}
                    </span>
                  )}
                  {!batch && (
                    <button
                      onClick={() => setEditing(item)}
                      className="inline-flex items-center gap-1.5 border border-brand/30 text-brand text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-transform"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Sugestões: complete a viagem com passeios ── */}
      {items.length > 0 && !done && suggestedTours.length > 0 && (
        <div className="mt-6">
          <div className="px-4 flex items-center gap-2">
            <Sparkles size={15} className="text-brand" />
            <p className="text-[14px] font-extrabold text-gray-900">Complete sua viagem</p>
          </div>
          <p className="px-4 text-[12px] text-gray-400 mt-0.5 mb-3">Que tal adicionar um passeio guiado?</p>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
            {suggestedTours.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate('/passeios', { state: { selectedId: t.id } })}
                className="shrink-0 w-[150px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-left active:scale-[0.97] transition-transform"
              >
                <div className="h-[90px] bg-gray-100">
                  {t.cover_image_url
                    ? <img src={t.cover_image_url} alt={t.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-amber-300" />}
                </div>
                <div className="p-2.5">
                  <p className="text-[12px] font-bold text-gray-900 leading-tight line-clamp-2 min-h-[30px]">{t.name}</p>
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-brand">
                    <Plus size={12} /> Adicionar
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé fixo */}
      {(items.length > 0 || done) && (
        <div className="fixed bottom-[64px] left-0 right-0 bg-white border-t border-gray-100 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] max-w-[430px] mx-auto space-y-2.5 z-30">
          {done ? (
            <>
              <p className="text-[13px] text-gray-600 text-center">
                {okCount > 0 && <span className="font-bold text-emerald-600">{okCount} solicitaç{okCount > 1 ? 'ões' : 'ão'} enviada{okCount > 1 ? 's' : ''} ✓</span>}
                {okCount > 0 && errCount > 0 && ' · '}
                {errCount > 0 && <span className="font-bold text-red-500">{errCount} com erro (segue no carrinho)</span>}
              </p>
              <button
                onClick={() => navigate('/minhas-reservas')}
                className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
              >
                Acompanhar em Minhas Reservas
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-gray-500 font-semibold">Total</p>
                <p className="text-[19px] font-extrabold text-gray-900">{fmt(total)}</p>
              </div>
              <button
                onClick={submitAll}
                disabled={!allComplete || submitting}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Enviando…</>
                  : <><Send size={15} /> Solicitar tudo ({items.length})</>}
              </button>
              {submitError && (
                <p className="text-[11px] text-red-600 font-semibold text-center">{submitError}</p>
              )}
              {!allComplete && items.length > 0 && (
                <p className="text-[10.5px] text-amber-600 font-semibold text-center">
                  Complete os dados de todos os itens (botão Editar) para solicitar.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {editing && (
        <EditSheet
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => { upsertItem(updated); setEditing(null) }}
        />
      )}
    </div>
  )
}
