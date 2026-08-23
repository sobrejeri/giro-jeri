import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ShoppingCart, Trash2, Calendar, Clock, Users, Car, MapPin, Pencil,
  CheckCircle2, AlertTriangle, Loader2, Send, X, Plus, Minus, ChevronRight, ChevronDown, Sparkles,
} from 'lucide-react'
import PageHeader from '../components/layout/PageHeader'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { lerOferta } from '../lib/oferta'
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
  const { t } = useTranslation()
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
    timeHint = t('cartPg.editSheet.timeHintCutoff', { cutoff: item.booking_cutoff_time.slice(0, 5), date: dayLabel(minDateIso) })
  } else if (time && sameDay && !timeOk && earliestTodayMin < 1440) {
    timeHint = t('cartPg.editSheet.timeHintLead', { time: fromMin(earliestTodayMin), lead: perServiceLead != null ? `${item.min_advance_hours}h` : isTransfer ? '4h' : '30min' })
  } else if (time && sameDay && !timeOk) {
    timeHint = t('cartPg.editSheet.timeHintNoMore', { date: dayLabel(nextDayIso(fToday)) })
  }

  const missing = []
  if (!dateOk) missing.push(t('cartPg.editSheet.missingDate'))
  if (!time) missing.push(t('cartPg.editSheet.missingTime'))
  else if (!timeOk) missing.push(t('cartPg.editSheet.missingTimeLead'))
  if (!(people >= 1)) missing.push(t('cartPg.editSheet.missingPeople'))
  if (qtyTotal < 1) missing.push(t('cartPg.editSheet.missingVehicle'))
  if (!isTransfer && !originText.trim()) missing.push(t('cartPg.editSheet.missingOrigin'))
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
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-w-[430px] mx-auto max-h-[88vh] flex flex-col lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:max-w-xl lg:shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="font-bold text-gray-900 text-[15px] leading-tight flex-1 pr-2">{item.name}</p>
          <button onClick={onClose} aria-label={t('cartPg.editSheet.closeAria')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
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
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{t('cartPg.editSheet.originLabel')}</label>
              <div className="mt-1">
                <PlaceInput
                  value={originText}
                  onChange={setOrigin}
                  onPick={(p) => { if (p) setOrigin(p.label || p.address || '') }}
                  placeholder={t('cartPg.editSheet.originPlaceholder')}
                  dotClass="bg-brand"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{t('cartPg.editSheet.dateLabel')}</label>
              <button type="button" onClick={() => setShowDate(true)}
                className="mt-1 w-full text-left bg-gray-50 rounded-xl px-3 py-3 text-[14px] text-gray-800 outline-none focus:ring-2 focus:ring-brand/30">
                {dateIso ? dayLabel(dateIso) : t('cartPg.editSheet.chooseDate')}
              </button>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{t('cartPg.editSheet.timeLabel')}</label>
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
              seasons={seasonsData || []}
              highSeasonMonths={highSeasonMonths}
            />
          )}

          {timeHint && (
            <p className="text-[11.5px] font-semibold text-amber-600 flex items-start gap-1.5 -mt-1">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {timeHint}
            </p>
          )}

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{t('cartPg.editSheet.peopleLabel')}</label>
            <div className="mt-1 flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-3 w-fit">
              <button onClick={() => setPeople((p) => Math.max(1, p - 1))} aria-label={t('cartPg.editSheet.lessPeopleAria')}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center active:scale-95">
                <Minus size={13} className="text-gray-600" />
              </button>
              <span className="text-[16px] font-bold text-gray-900 w-6 text-center tabular-nums">{people}</span>
              <button onClick={() => setPeople((p) => p + 1)} aria-label={t('cartPg.editSheet.morePeopleAria')}
                className="w-8 h-8 rounded-full bg-brand flex items-center justify-center active:scale-95">
                <Plus size={13} className="text-white" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{t('cartPg.editSheet.vehiclesLabel')}</label>
            <div className="mt-1 space-y-2">
              {vehicles.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                  <Car size={15} className="text-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">{v.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {fmt(v.price)}{t('cartPg.editSheet.perVehicle')}{Number(v.cap) > 0 ? ` · ${t('cartPg.editSheet.upToPeople', { cap: v.cap })}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => bump(i, -1)} aria-label={t('cartPg.editSheet.lessVehicleAria', { name: v.name })}
                      className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center active:scale-95">
                      <Minus size={11} className="text-gray-600" />
                    </button>
                    <span className="text-[14px] font-bold text-gray-900 w-4 text-center tabular-nums">{v.qty || 0}</span>
                    <button onClick={() => bump(i, +1)} aria-label={t('cartPg.editSheet.moreVehicleAria', { name: v.name })}
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
                  {t('cartPg.editSheet.insufficientCapacity', { count: capacity, people })}
                </p>
                {suggestion && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] text-amber-800">
                      {t('cartPg.editSheet.suggestionLabel')} <span className="font-bold">+1x {suggestion.name}</span>
                      {Number(suggestion.cap) > 0 ? ` ${t('cartPg.editSheet.suggestionCapacity', { cap: suggestion.cap })}` : ''}
                    </p>
                    <button onClick={() => addVehicle(suggestion)}
                      className="shrink-0 bg-brand text-white text-[11.5px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform">
                      {t('cartPg.add')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {extras.length > 0 && (
              <div className="mt-2">
                <button onClick={() => setShowExtras((s) => !s)}
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-brand active:scale-95 transition-transform">
                  <Plus size={13} /> {showExtras ? t('cartPg.editSheet.hideOtherVehicles') : t('cartPg.editSheet.addOtherVehicle')}
                </button>
                {showExtras && (
                  <div className="mt-2 space-y-2">
                    {extras.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                        <Car size={15} className="text-gray-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-800 truncate">{a.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {fmt(a.price)}{t('cartPg.editSheet.perVehicle')}{Number(a.cap) > 0 ? ` · ${t('cartPg.editSheet.upToPeople', { cap: a.cap })}` : ''}
                          </p>
                        </div>
                        <button onClick={() => addVehicle(a)} aria-label={t('cartPg.editSheet.addVehicleAria', { name: a.name })}
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
            <p className="text-[11px] text-gray-400 uppercase font-bold tracking-wide">{t('cartPg.editSheet.itemTotal')}</p>
            <p className="text-[18px] font-extrabold text-brand">{fmt(total)}</p>
          </div>
          <button
            onClick={save}
            disabled={!canSave}
            className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            {t('cartPg.editSheet.save')}
          </button>
          {!canSave && (
            <p className="text-[10.5px] text-gray-400 text-center">
              {!capacityOk ? t('cartPg.editSheet.adjustVehicles') : t('cartPg.editSheet.fillMissing', { missing: missing.join(', ') })}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Descrição do serviço (expande ao clicar no card) ──────────
   Passeio: busca o detalhe completo (full_description, duração, incluídos).
   Transfer: mostra a rota e a descrição curta guardada no rascunho. */
function CartItemDetails({ item }) {
  const { t } = useTranslation()
  const isTransfer = item.kind === 'transfer'
  const { data: tour, isLoading } = useQuery({
    queryKey: ['cart-item-detail', item.id],
    queryFn:  () => api.getTour(item.id),
    enabled:  !isTransfer,
    staleTime: 5 * 60 * 1000,
  })

  const desc     = isTransfer
    ? (item.short_description || null)
    : (tour?.full_description || tour?.short_description || item.short_description || null)
  const includes = !isTransfer ? tour?.includes_text : null
  const excludes = !isTransfer ? tour?.excludes_text : null
  const route    = isTransfer && (item.origin || item.dest)
    ? `${item.origin || ''}${item.dest ? ` → ${item.dest}` : ''}` : null

  return (
    <div className="px-3 pb-3 border-t border-gray-50">
      <div className="pt-3 space-y-2.5 text-[12.5px] text-gray-600 leading-relaxed">
        {route && (
          <p className="inline-flex items-center gap-1.5 font-semibold text-gray-700">
            <MapPin size={12} className="text-brand shrink-0" /> {route}
          </p>
        )}
        {!isTransfer && tour?.duration_hours && (
          <p className="inline-flex items-center gap-1.5">
            <Clock size={12} className="text-brand shrink-0" /> {t('tourDetailPg.durationHours', { hours: tour.duration_hours })}
          </p>
        )}
        {isLoading && !isTransfer ? (
          <p className="text-gray-400 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> {t('cartPg.details.loading')}</p>
        ) : desc ? (
          <p>{desc}</p>
        ) : (
          <p className="text-gray-400 italic">{t('cartPg.details.none')}</p>
        )}
        {includes && (
          <div>
            <p className="font-bold text-gray-800 mb-1">{t('tourDetailPg.included')}</p>
            <ul className="space-y-1">
              {includes.split(',').map((x, i) => (
                <li key={i} className="flex items-start gap-1.5"><CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />{x.trim()}</li>
              ))}
            </ul>
          </div>
        )}
        {excludes && (
          <div>
            <p className="font-bold text-gray-800 mb-1">{t('tourDetailPg.notIncluded')}</p>
            <ul className="space-y-1">
              {excludes.split(',').map((x, i) => (
                <li key={i} className="flex items-start gap-1.5"><X size={12} className="text-gray-300 mt-0.5 shrink-0" />{x.trim()}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Página do carrinho (estilo Mercado Livre) ─────────────────
   Prévia de todos os serviços (foto, valores, veículos) + Editar por item.
   "Solicitar tudo" só habilita quando TODOS os itens estão com os dados
   completos; envia cada item como uma solicitação própria, com progresso. */
export default function CartPage() {
  const { t } = useTranslation()
  const { items, total, upsertItem, removeItem } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(null)     // item em edição
  const [expandedId, setExpandedId] = useState(null) // item com descrição aberta
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

  /* ── Cupom de desconto no carrinho ──────────────────────
     Valida contra os tipos presentes (passeio/transfer); no envio o código
     vai só nos itens elegíveis — o servidor reaplica com autoridade
     (percentual em cada item elegível; valor fixo desconta uma vez). */
  const [couponInput,   setCouponInput]   = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null) // {code, discount, applicable}
  const [couponErr,     setCouponErr]     = useState('')
  const [couponBusy,    setCouponBusy]    = useState(false)

  // Cupom que chegou por WhatsApp: já vem preenchido, senão o cliente teria de
  // decorar o código da mensagem e digitar na mão — é aí que a oferta se perde.
  useEffect(() => {
    const guardado = lerOferta()
    if (guardado) setCouponInput(guardado)
  }, [])


  const couponEligible = (it) =>
    !appliedCoupon?.applicable ||
    (appliedCoupon.applicable === 'transfer' ? it.kind === 'transfer' : it.kind !== 'transfer')

  async function applyCartCoupon() {
    const code = couponInput.trim()
    if (!code || couponBusy) return
    if (!user) { navigate('/login', { state: { from: '/carrinho' } }); return }
    setCouponBusy(true); setCouponErr('')
    const subFor = (kind) => items.filter((i) => (kind === 'transfer') === (i.kind === 'transfer'))
      .reduce((s, i) => s + (Number(i.total) || 0), 0)
    // Tenta primeiro o tipo com maior subtotal; se o cupom for restrito ao
    // outro tipo, tenta de novo com ele.
    const kinds = [['tour', subFor('tour')], ['transfer', subFor('transfer')]]
      .filter(([, sub]) => sub > 0).sort((a, b) => b[1] - a[1])
    let lastErr = t('cartPg.invalidCoupon')
    for (const [kind, sub] of kinds) {
      try {
        const r = await api.validateCoupon({
          coupon_code: code, service_type: kind,
          region_id: items.find((i) => (kind === 'transfer') === (i.kind === 'transfer'))?.region_id || undefined,
          subtotal: sub,
        })
        setAppliedCoupon({
          code: code.toUpperCase(),
          discount: Number(r?.discount) || 0,
          applicable: r?.coupon?.applicable_service_type || null,
        })
        setCouponBusy(false)
        return
      } catch (err) { lastErr = err?.message || lastErr }
    }
    setAppliedCoupon(null)
    setCouponErr(lastErr)
    setCouponBusy(false)
  }

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
        snapshot.map((it) => ({
          ...requestPayloadFor(it),
          ...(appliedCoupon && couponEligible(it) ? { coupon_code: appliedCoupon.code } : {}),
        })),
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
      setSubmitError(err?.message || t('cartPg.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen pb-40">
      <PageHeader title={items.length ? t('cartPg.titleCount', { count: items.length }) : t('cartPg.title')} />

      {list.length === 0 && !done ? (
        <div className="px-6 pt-20 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ShoppingCart size={26} className="text-gray-300" />
          </div>
          <p className="text-[15px] font-bold text-gray-700">{t('cartPg.empty.title')}</p>
          <p className="text-[12.5px] text-gray-400 mt-1">{t('cartPg.empty.subtitle')}</p>
          <button
            onClick={() => navigate('/passeios')}
            className="mt-5 bg-brand text-white font-bold text-[13px] px-6 py-3 rounded-2xl active:scale-95 transition-transform"
          >
            {t('cartPg.empty.cta')}
          </button>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-3 lg:max-w-2xl lg:mx-auto">
          {list.map((item) => {
            const miss = itemMissing(item)
            const st = results[item.id]
            const complete = miss.length === 0
            return (
              <div key={item.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${st?.status === 'ok' ? 'border-emerald-200' : st?.status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
                {/* Toca no card → mostra/esconde a descrição do serviço */}
                <div
                  onClick={() => setExpandedId((cur) => cur === item.id ? null : item.id)}
                  className="flex gap-3 p-3 cursor-pointer active:bg-gray-50/60 transition-colors"
                >
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
                        <button onClick={(e) => { e.stopPropagation(); removeItem(item.id) }} aria-label={t('cartPg.card.removeAria')}
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
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-[16px] font-extrabold text-gray-900">{fmt(item.total)}</p>
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand shrink-0">
                        {expandedId === item.id ? t('cartPg.details.hide') : t('cartPg.details.show')}
                        <ChevronDown size={13} className={`transition-transform ${expandedId === item.id ? 'rotate-180' : ''}`} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Descrição (expande/recolhe ao clicar no card) */}
                {expandedId === item.id && <CartItemDetails item={item} />}

                {/* Rodapé do card: status + editar */}
                <div className="flex items-center justify-between px-3 pb-3">
                  {st?.status === 'ok' ? (
                    <span className="text-[11px] font-bold text-emerald-600">{t('cartPg.card.requestSent', { code: st.code })}</span>
                  ) : st?.status === 'error' ? (
                    <span className="text-[11px] font-bold text-red-500 flex-1 pr-2">{st.msg}</span>
                  ) : complete ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 size={12} /> {t('cartPg.card.complete')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                      <AlertTriangle size={12} /> {t('cartPg.card.missing', { missing: miss.join(', ') })}
                    </span>
                  )}
                  {!batch && (
                    <button
                      onClick={() => setEditing(item)}
                      className="inline-flex items-center gap-1.5 border border-brand/30 text-brand text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 transition-transform"
                    >
                      <Pencil size={12} /> {t('cartPg.card.edit')}
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
        <div className="mt-6 lg:max-w-2xl lg:mx-auto">
          <div className="px-4 flex items-center gap-2">
            <Sparkles size={15} className="text-brand" />
            <p className="text-[14px] font-extrabold text-gray-900">{t('cartPg.suggestions.title')}</p>
          </div>
          <p className="px-4 text-[12px] text-gray-400 mt-0.5 mb-3">{t('cartPg.suggestions.subtitle')}</p>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
            {suggestedTours.map((tour) => (
              <button
                key={tour.id}
                onClick={() => navigate('/passeios', { state: { selectedId: tour.id } })}
                className="shrink-0 w-[150px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-left active:scale-[0.97] transition-transform"
              >
                <div className="h-[90px] bg-gray-100">
                  {tour.cover_image_url
                    ? <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-amber-300" />}
                </div>
                <div className="p-2.5">
                  <p className="text-[12px] font-bold text-gray-900 leading-tight line-clamp-2 min-h-[30px]">{tour.name}</p>
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-bold text-brand">
                    <Plus size={12} /> {t('cartPg.add')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé fixo */}
      {(items.length > 0 || done) && (
        <div className="fixed bottom-[64px] left-0 right-0 bg-white border-t border-gray-100 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] max-w-[430px] mx-auto space-y-2.5 z-30 lg:bottom-0 lg:max-w-2xl lg:rounded-t-2xl lg:border lg:shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {done ? (
            <>
              <p className="text-[13px] text-gray-600 text-center">
                {okCount > 0 && <span className="font-bold text-emerald-600">{t('cartPg.footer.requestsSent', { count: okCount })}</span>}
                {okCount > 0 && errCount > 0 && ' · '}
                {errCount > 0 && <span className="font-bold text-red-500">{t('cartPg.footer.errorsRemain', { count: errCount })}</span>}
              </p>
              <button
                onClick={() => navigate('/minhas-reservas')}
                className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform"
              >
                {t('cartPg.footer.trackOrders')}
              </button>
            </>
          ) : (
            <>
              {appliedCoupon ? (
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-emerald-600 font-bold">
                    {t('cartPg.footer.couponApplied', { code: appliedCoupon.code })}
                    {appliedCoupon.applicable && (
                      <span className="text-gray-400 font-semibold"> · {t('cartPg.footer.couponScope', { scope: appliedCoupon.applicable === 'transfer' ? t('cartPg.footer.scopeTransfers') : t('cartPg.footer.scopeTours') })}</span>
                    )}
                    <button
                      onClick={() => { setAppliedCoupon(null); setCouponInput('') }}
                      className="ml-2 text-[11px] text-gray-400 underline"
                    >
                      {t('cartPg.footer.remove')}
                    </button>
                  </p>
                  <p className="text-[13px] font-bold text-emerald-600">− {fmt(appliedCoupon.discount)}</p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponErr('') }}
                      placeholder={t('cartPg.footer.couponPlaceholder')}
                      className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-[12.5px] text-gray-800 uppercase tracking-wide outline-none focus:ring-2 focus:ring-brand/30 placeholder:normal-case placeholder:tracking-normal"
                    />
                    <button
                      onClick={applyCartCoupon}
                      disabled={!couponInput.trim() || couponBusy || items.length === 0}
                      className="shrink-0 border border-brand/40 text-brand text-[12px] font-bold px-3.5 py-2 rounded-xl active:scale-95 disabled:opacity-40"
                    >
                      {couponBusy ? '…' : t('cartPg.footer.apply')}
                    </button>
                  </div>
                  {couponErr && <p className="text-[11px] text-red-500 mt-1">{couponErr}</p>}
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-gray-500 font-semibold">{t('cartPg.footer.total')}</p>
                <div className="text-right">
                  {appliedCoupon && appliedCoupon.discount > 0 ? (
                    <>
                      <p className="text-[11px] text-gray-400 line-through">{fmt(total)}</p>
                      <p className="text-[19px] font-extrabold text-gray-900">{fmt(Math.max(0, total - appliedCoupon.discount))}</p>
                    </>
                  ) : (
                    <p className="text-[19px] font-extrabold text-gray-900">{fmt(total)}</p>
                  )}
                </div>
              </div>
              <button
                onClick={submitAll}
                disabled={!allComplete || submitting}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
              >
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> {t('cartPg.footer.sending')}</>
                  : <><Send size={15} /> {t('cartPg.footer.submitAll', { count: items.length })}</>}
              </button>
              {submitError && (
                <p className="text-[11px] text-red-600 font-semibold text-center">{submitError}</p>
              )}
              {!allComplete && items.length > 0 && (
                <p className="text-[10.5px] text-amber-600 font-semibold text-center">
                  {t('cartPg.footer.completeAllHint')}
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
