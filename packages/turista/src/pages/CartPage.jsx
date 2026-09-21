import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ShoppingCart, Trash2, Calendar, Clock, Users, Car, MapPin, Pencil,
  CheckCircle2, AlertTriangle, Loader2, Send, X, Plus, Minus, ChevronRight, ChevronLeft, ChevronDown, Sparkles,
} from 'lucide-react'
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
import RoteiroTrilha, { extrairParadas } from '../components/RoteiroTrilha'
import { highSeasonMonthSet, acrescimoDoDia, rotuloDoDia } from '../lib/season'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`
const todayIso = () => format(new Date(), 'yyyy-MM-dd')
const base = import.meta.env.BASE_URL

/* ── Cabeçalho da marca no carrinho ─────────────────────────────
   Logo + assinatura da Turiva, com um degradê suave de areia/pôr do sol —
   dá o tom "viagem" logo na abertura. Quando a reserva veio pelo link de um
   operador, mostra "Reservando com <nome>", que é a promessa da venda direta. */
function CartHeader({ count, partnerName }) {
  const navigate = useNavigate()
  return (
    <header className="relative overflow-hidden bg-gradient-to-b from-[#FFF3E6] to-white">
      {/* Sol/brilho decorativo, discreto, à direita */}
      <div className="pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br from-[#FFB067]/40 to-transparent blur-2xl" />
      <div className="relative px-4 pt-3 pb-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate(-1)}
              aria-label="Voltar"
              className="w-8 h-8 rounded-full bg-white/80 shadow-sm flex items-center justify-center active:scale-95 transition-transform shrink-0"
            >
              <ChevronLeft size={18} className="text-gray-700" />
            </button>
            <img src={base + 'logo-icon.jpeg'} alt="" className="w-8 h-8 rounded-lg shrink-0" />
            <div className="min-w-0 leading-none">
              <p className="font-giro font-bold text-[15px] text-gray-900 tracking-[0.02em]">TURIVA</p>
              <p className="text-[10px] text-brand font-semibold mt-0.5">Viagens que ficam</p>
            </div>
          </div>
          {count > 0 && (
            <span className="shrink-0 inline-flex items-center gap-1.5 bg-white shadow-sm rounded-full pl-2.5 pr-3 py-1">
              <ShoppingCart size={13} className="text-brand" />
              <span className="text-[13px] font-extrabold text-gray-900">{count}</span>
              <span className="text-[11px] text-gray-500">{count === 1 ? 'serviço' : 'serviços'}</span>
            </span>
          )}
        </div>

        {/* Título compacto na mesma linha da assinatura — o "Meu carrinho"
            grande com respiro comia meia dobra numa tela já comprida. */}
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <h1 className="font-giro font-bold text-[19px] text-gray-900 leading-tight">Meu carrinho</h1>
          <p className="text-[12px] text-gray-500">
            {count > 0 ? '· Tudo pronto para viver Jeri?' : '· Monte a sua viagem'}
          </p>
        </div>

        {partnerName && (
          <div className="mt-1.5 inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[11.5px] font-semibold">Reservando com <b>{partnerName}</b></span>
          </div>
        )}
      </div>
    </header>
  )
}

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

// Campos que faltam (itemMissing) → chips de ação. Agrupa variações de veículo
// e não repete o mesmo campo. Cada chip abre o editor para preencher e fechar.
function missingChips(miss = []) {
  const out = []
  const add = (key, Icon, label) => { if (!out.some((c) => c.key === key)) out.push({ key, Icon, label }) }
  for (const m of miss) {
    if (m === 'data') add('data', Calendar, 'Escolher data')
    else if (m === 'horário') add('hora', Clock, 'Escolher horário')
    else if (m === 'pessoas') add('pessoas', Users, 'Nº de pessoas')
    else if (m.startsWith('veículo')) add('veiculo', Car, 'Selecionar veículo')
    else if (m === 'local de saída' || m === 'origem') add('origem', MapPin, 'Local de saída')
    else if (m === 'destino') add('destino', MapPin, 'Destino')
    else add(m, AlertTriangle, m)
  }
  return out
}

// Seletor de Privativo × Compartilhado direto no card (passeios): é a escolha
// que muda o PREÇO, então fica à mão, sem abrir o editor. Só troca o modo do
// item (e zera veículos no compartilhado); o valor final é calculado ao
// completar os detalhes. Modo indisponível aparece desabilitado, com o motivo.
function ModoCard({ item, onChange }) {
  if (item.kind === 'transfer') return null
  const allowsPrivate = item.allows_private !== false
  const allowsShared  = !!item.allows_shared
  if (!allowsPrivate && !allowsShared) return null
  const mode = item.mode === 'shared' ? 'shared' : 'private'
  const pp = Number(item.shared_price_per_person) || 0
  const opts = [
    { id: 'private', label: 'Privativo',     Icon: Car,   ok: allowsPrivate, hint: 'Veículo só para o seu grupo' },
    { id: 'shared',  label: 'Compartilhado', Icon: Users, ok: allowsShared,  hint: pp ? `${fmt(pp)} por pessoa` : 'Preço por pessoa' },
  ]
  return (
    <div className="px-3 pt-2">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Tipo de passeio</p>
      <div className="grid grid-cols-2 gap-2">
        {opts.map(({ id, label, Icon, ok, hint }) => (
          <button
            key={id}
            onClick={() => ok && onChange(id)}
            disabled={!ok}
            className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
              !ok ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                : mode === id ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'
            }`}
          >
            <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold ${
              !ok ? 'text-gray-400' : mode === id ? 'text-brand' : 'text-gray-700'
            }`}>
              <Icon size={13} /> {label}
            </span>
            <span className="block text-[10px] text-gray-400 leading-snug mt-0.5">
              {ok ? hint : 'Não disponível neste passeio'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Edição de um item (bottom sheet) ───────────────────────────
   Obrigatórios: data, horário, pessoas, veículo(s) e (passeio) local de
   saída. Aumentou pessoas → precisa de capacidade: o Salvar só ativa quando
   tudo está preenchido E os veículos comportam o grupo. */
function EditSheet({ item, onSave, onClose, inline = false, focus = null }) {
  const { t } = useTranslation()
  const isTransfer = item.kind === 'transfer'
  const [dateIso, setDateIso]   = useState(item.dateIso || '')
  const [time, setTime]         = useState(item.time || '')
  const [people, setPeople]     = useState(item.people || 1)
  const [originText, setOrigin] = useState(item.origin_text || '')
  const [vehicles, setVehicles] = useState(() => (item.vehicles || []).map((v) => ({ ...v })))
  // Privativo x compartilhado mudou de lugar: era um seletor no topo da tela
  // de Passeios, hoje é decisão por item, aqui, junto do que ela muda.
  const [mode, setMode] = useState(item.mode === 'shared' ? 'shared' : 'private')
  const compartilhado = !isTransfer && mode === 'shared'
  // Com os veículos saindo da vitrine, o carrinho virou o único lugar de
  // escolha: rascunho sem veículo já abre com a lista aberta, senão o turista
  // via só um link discreto e não sabia onde escolher.
  const [showExtras, setShowExtras] = useState(
    () => (item.vehicles || []).filter((v) => v.qty > 0).length === 0,
  )

  // Capacidades/preços reais vêm da API — rascunhos antigos podem não ter a
  // capacidade gravada, e sem ela a regra "pessoas × lugares" não fecha.
  // Também alimenta o "Adicionar outro veículo".
  const { data: tourVehiclesData, isFetched: tvFetched } = useQuery({
    queryKey: ['cart-edit-tour-vehicles', item.id],
    queryFn:  () => api.getTourVehicles(item.id),
    enabled:  !isTransfer,
    staleTime: 5 * 60 * 1000,
  })
  // Quais modos o passeio aceita e quanto custa por pessoa: a fonte é o
  // catálogo, não o rascunho. Rascunho salvo antes destes campos existirem não
  // os traz, e sem isto o seletor de modo nunca apareceria para quem já tinha
  // itens no carrinho. Mesma chave do CartItemDetails — a consulta é uma só.
  const { data: tourInfo } = useQuery({
    queryKey: ['cart-item-detail', item.id],
    queryFn:  () => api.getTour(item.id),
    enabled:  !isTransfer,
    staleTime: 5 * 60 * 1000,
  })
  const allowsPrivate = tourInfo ? tourInfo.is_private_enabled !== false : item.allows_private !== false
  const allowsShared  = tourInfo ? !!tourInfo.is_shared_enabled        : !!item.allows_shared
  // O bloco aparece em TODO passeio, mesmo quando só um modo é vendido: a
  // opção indisponível fica desabilitada com o motivo. Escondendo o bloco
  // inteiro, quem procurava a escolha não sabia se o passeio não aceita ou se
  // o app estava com defeito.
  const mostraModo = !isTransfer && (allowsPrivate || allowsShared)

  // Frota da ROTA (matriz veículo × rota), não a frota inteira.
  //
  // O carrinho listava todo veículo com `is_transfer_allowed`, para qualquer
  // rota: no trecho aéreo apareciam Hilux e Jardineira ao lado do helicóptero.
  // Além de confundir, a solicitação seguia para o operador errado — o
  // filtro de frota olha os veículos da reserva. A vitrine de Translados já
  // consultava esta rota (`/routes/:id/vehicles`); o carrinho ficou para trás,
  // e agora ele é o único lugar onde se escolhe veículo.
  const { data: routeVehiclesData, isFetched: rvFetched } = useQuery({
    queryKey: ['cart-edit-route-vehicles', item.id],
    queryFn:  () => api.getRouteVehicles(item.id),
    enabled:  isTransfer,
    staleTime: 5 * 60 * 1000,
  })

  // A lista geral só socorre o PASSEIO sem matriz própria. Para transfer não há
  // recuo: a própria API já devolve a frota comum quando a rota não tem regra
  // (tirando os veículos restritos, como o helicóptero). Cair na lista geral
  // aqui traria o problema de volta.
  const needAll = !isTransfer && tvFetched && (tourVehiclesData || []).length === 0
  const { data: allVehiclesData } = useQuery({
    queryKey: ['cart-edit-all-vehicles'],
    queryFn:  () => api.getVehicles({ is_active: 'true' }),
    enabled:  needAll,
    staleTime: 5 * 60 * 1000,
  })

  // Rascunho vindo da vitrine ainda não tem veículo; o preço da rota vem em
  // `unit_price`. Sem essa reserva, todo veículo adicionado sairia por R$ 0.
  const unitPrice = isTransfer
    ? (Number(item.vehicles?.[0]?.price) || Number(item.unit_price) || 0)
    : null
  const available = useMemo(() => {
    const all = Array.isArray(allVehiclesData) ? allVehiclesData : (allVehiclesData?.vehicles || [])
    if (isTransfer) {
      const daRota = Array.isArray(routeVehiclesData) ? routeVehiclesData : (routeVehiclesData?.vehicles || [])
      // Preço continua sendo o da ROTA, não o do veículo: no transfer cada
      // veículo escolhido custa o valor do trecho. Só a LISTA mudou.
      return daRota
        .filter((v) => v.is_transfer_allowed !== false && v.is_active !== false)
        .map((v) => ({ id: v.id, name: v.name, price: unitPrice, cap: v.seat_capacity || null, image_url: v.image_url || null }))
    }
    const list = (tourVehiclesData || []).length ? tourVehiclesData : all
    return list
      .filter((v) => v.is_tour_allowed !== false && v.is_private_allowed !== false && v.is_active !== false)
      .map((v) => ({ id: v.id, name: v.name, price: Number(v.base_price) || 0, cap: v.seat_capacity || null, image_url: v.image_url || null }))
  }, [isTransfer, tourVehiclesData, routeVehiclesData, allVehiclesData, unitPrice])

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
        image_url: v.image_url || src.image_url || null,
      }
    }))
  }, [available])

  // Passeio de modo único (o voo panorâmico só existe compartilhado): alinha o
  // rascunho ao que ele realmente aceita, senão sairia com modo e valor errados.
  useEffect(() => {
    if (isTransfer || !tourInfo) return
    if (mode === 'private' && !allowsPrivate && allowsShared) setMode('shared')
    else if (mode === 'shared' && !allowsShared && allowsPrivate) setMode('private')
  }, [isTransfer, tourInfo, allowsPrivate, allowsShared, mode])

  const extras = available.filter((a) => !vehicles.some((v) => v.id === a.id))

  // Compartilhado cobra por pessoa; privativo soma os veículos escolhidos.
  const precoPorPessoa = Number(tourInfo?.shared_price_per_person ?? item.shared_price_per_person) || 0
  const totalVeiculos = vehicles.reduce((s, v) => s + (Number(v.price) || 0) * (v.qty || 0), 0)
  const subtotal = compartilhado ? precoPorPessoa * people : totalVeiculos
  const qtyTotal = vehicles.reduce((s, v) => s + (v.qty || 0), 0)
  const capsKnown = vehicles.length > 0 && vehicles.every((v) => Number(v.cap) > 0)
  const capacity  = capsKnown ? vehicles.reduce((s, v) => s + (Number(v.cap) || 0) * (v.qty || 0), 0) : null
  const capacityOk = compartilhado || !capsKnown || capacity >= people

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
      return [...prev, { id: a.id, name: a.name, qty: 1, price: a.price, cap: a.cap, image_url: a.image_url || null }]
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

  // Acréscimo de data (alta temporada OU feriado) com a MESMA conta do
  // servidor. Sem isto o carrinho somava só os veículos: o cliente via R$ 500
  // num feriado de +20% e o servidor cobrava R$ 600 no checkout — a diferença
  // só aparecia depois de ele decidir comprar.
  const acrescimoData = acrescimoDoDia(dateIso, seasonsData || [], subtotal)
  const rotuloData    = acrescimoData > 0 ? rotuloDoDia(dateIso, seasonsData || []) : null
  const total         = Math.round((subtotal + acrescimoData) * 100) / 100

  // Chip "Escolher data" já abre o calendário: quando o editor entra focado
  // na data, o DateSheet nasce aberto — um toque a menos.
  const [showDate, setShowDate] = useState(() => focus === 'date')

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

  // Janela de operação do serviço (migration 069): ex.: buggy só sai das 06:00
  // às 12:00. Nula = qualquer horário. Combina com a antecedência: no MESMO
  // dia o horário mínimo é o mais restritivo entre os dois.
  const winStart = toMin(item.service_window_start || null)
  const winEnd   = toMin(item.service_window_end   || null)
  const sameDay  = dateIso === fToday
  // Se hoje a janela já passou, não há horário possível — empurra para amanhã.
  const semHorarioHoje = winEnd != null && sameDay && earliestTodayMin > winEnd

  // ── Horários OFERECIDOS (lista, não roda livre) ─────────────────────────
  // O seletor nativo de horário (iOS) ignora min/max e deixava rolar até 23:58
  // — dava para agendar passeio de madrugada, e só o "Salvar" barrava depois.
  // Uma LISTA de horários válidos resolve na origem: o que não pode nem aparece.
  //
  // Faixa: a janela do serviço (admin) quando existe; senão um padrão. Passeio
  // sem janela usa horário DIURNO (05:00–18:00) — não se faz passeio à noite.
  // Translado sem janela fica livre: transfer de aeroporto de madrugada é real.
  const SLOT_STEP = 30
  const faixaIni = winStart ?? (isTransfer ? 0 : 5 * 60)
  const faixaFim = winEnd   ?? (isTransfer ? 23 * 60 + 30 : 18 * 60)
  // No mesmo dia, respeita também a antecedência mínima.
  const primeiroSlot = Math.max(faixaIni, sameDay ? earliestTodayMin : 0)
  const horariosDisponiveis = (() => {
    const out = []
    const ini = Math.ceil(primeiroSlot / SLOT_STEP) * SLOT_STEP
    for (let m = ini; m <= faixaFim; m += SLOT_STEP) out.push(fromMin(m))
    return out
  })()
  // Preserva um horário já salvo fora da grade (ex.: escolhido antes desta
  // regra), para não sumir da tela sem o cliente perceber.
  const opcoesHorario = time && !horariosDisponiveis.includes(time)
    ? [time, ...horariosDisponiveis]
    : horariosDisponiveis

  const dateOk = !!dateIso && dateIso >= minDateIso && !semHorarioHoje
  const dentroDaJanela = !time || (
    (winStart == null || toMin(time) >= winStart) &&
    (winEnd   == null || toMin(time) <= winEnd)
  )
  const timeOk = !!time && (!sameDay || toMin(time) >= earliestTodayMin) && dentroDaJanela

  const janelaLabel = (winStart != null && winEnd != null)
    ? `${fromMin(winStart)} às ${fromMin(winEnd)}`
    : winStart != null ? `a partir das ${fromMin(winStart)}`
    : winEnd   != null ? `até as ${fromMin(winEnd)}` : null

  let timeHint = null
  if (semHorarioHoje) {
    timeHint = `Este serviço opera ${janelaLabel} — não há mais horário para hoje. Escolha a partir de ${dayLabel(nextDayIso(fToday))}.`
  } else if (dateIso && !dateOk && afterCutoff) {
    timeHint = t('cartPg.editSheet.timeHintCutoff', { cutoff: item.booking_cutoff_time.slice(0, 5), date: dayLabel(minDateIso) })
  } else if (time && !dentroDaJanela) {
    timeHint = `Este serviço opera ${janelaLabel}. Escolha um horário dentro desse período.`
  } else if (time && sameDay && !timeOk && earliestTodayMin < 1440) {
    timeHint = t('cartPg.editSheet.timeHintLead', { time: fromMin(earliestTodayMin), lead: perServiceLead != null ? `${item.min_advance_hours}h` : isTransfer ? '4h' : '30min' })
  } else if (time && sameDay && !timeOk) {
    timeHint = t('cartPg.editSheet.timeHintNoMore', { date: dayLabel(nextDayIso(fToday)) })
  } else if (janelaLabel && !time) {
    // Ainda sem horário escolhido: mostra a janela como orientação, não erro.
    timeHint = `Horário de operação: ${janelaLabel}.`
  }

  const missing = []
  if (!dateOk) missing.push(t('cartPg.editSheet.missingDate'))
  if (!time) missing.push(t('cartPg.editSheet.missingTime'))
  else if (!timeOk) missing.push(t('cartPg.editSheet.missingTimeLead'))
  if (!(people >= 1)) missing.push(t('cartPg.editSheet.missingPeople'))
  if (!compartilhado && qtyTotal < 1) missing.push(t('cartPg.editSheet.missingVehicle'))
  if (!isTransfer && !originText.trim()) missing.push(t('cartPg.editSheet.missingOrigin'))
  const canSave = missing.length === 0 && capacityOk
  // Editor focado num só campo (chip do card): salva parcial. O botão fica
  // sempre ativo — o que o cliente escolheu ali é gravado, e o restante segue
  // pendente no card. Sem foco (editor completo) mantém a trava de tudo cheio.
  const podeSalvar = focus ? true : canSave

  function bump(idx, delta) {
    setVehicles((prev) => prev.map((v, i) => i === idx ? { ...v, qty: Math.max(0, (v.qty || 0) + delta) } : v))
  }

  function save() {
    if (!podeSalvar) return
    onSave({
      ...item,
      dateIso, time, people,
      ...(isTransfer ? {} : { origin_text: originText.trim(), mode }),
      // No compartilhado o veículo não faz parte do pedido — guardar os que
      // sobraram de uma passagem pelo privativo mandaria veículo no payload.
      vehicles: compartilhado ? [] : vehicles,
      total,
    })
  }

  // Portal para o <body>: dentro da árvore da página, um ancestral com
  // transform vira o bloco de contenção do position:fixed e a folha ia parar
  // abaixo da dobra — o fundo escurecia e nada aparecia. No celular ela ocupa
  // a viewport inteira (dvh acompanha a barra do navegador); em telas grandes
  // continua o cartão centralizado.
  // Check verde ao lado do rótulo quando o campo está preenchido/válido — é o
  // "fica verdinho" pedido, para o cliente ver de relance o que já resolveu.
  const Ok = ({ on }) => on
    ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
    : null
  const LBL = 'text-[11px] font-bold text-gray-500 uppercase tracking-wide inline-flex items-center gap-1'

  // ── Foco num único campo (chip do card) ────────────────────────────────
  // O chip abre DIRETO o seu seletor — nada de tela cheia com um campo só.
  // Data → calendário; horário → lista de horários; local → buscador;
  // veículo → contador de pessoas + veículos. Salva e fecha na escolha.
  if (focus) {
    // Total parcial recalculado com o acréscimo da data efetiva.
    const totalCom = (dISO) => {
      const acr = acrescimoDoDia(dISO ?? dateIso, seasonsData || [], subtotal)
      return Math.round((subtotal + acr) * 100) / 100
    }
    const commit = (patch = {}) => onSave({
      ...item,
      dateIso, time, people,
      ...(isTransfer ? {} : { origin_text: originText.trim(), mode }),
      vehicles: compartilhado ? [] : vehicles,
      total: totalCom(patch.dateIso),
      ...patch,
    })

    // Data: o próprio calendário, sem invólucro extra. Escolheu → salva → fecha.
    if (focus === 'date') {
      return (
        <DateSheet
          value={dateIso ? new Date(`${dateIso}T12:00:00`) : minDate}
          onChange={(d) => commit({ dateIso: format(d, 'yyyy-MM-dd') })}
          onClose={onClose}
          minDate={minDate}
          seasons={seasonsData || []}
          highSeasonMonths={highSeasonMonths}
        />
      )
    }

    const podeVeiculo = people >= 1 && (compartilhado || (qtyTotal >= 1 && capacityOk))
    const titulo = focus === 'time' ? 'Escolher horário'
      : focus === 'local' ? t('cartPg.editSheet.originLabel')
      : 'Pessoas e veículos'

    return createPortal(
      <>
        <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
        <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white rounded-t-3xl z-[80] flex flex-col ${focus === 'local' ? 'h-[88dvh]' : 'max-h-[85dvh]'}`}>
          <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
          <div className="flex items-center justify-between px-5 py-2 shrink-0">
            <p className="text-[16px] font-bold text-gray-900">{titulo}</p>
            <button onClick={onClose} aria-label={t('cartPg.editSheet.closeAria')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
              <X size={14} className="text-gray-500" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] space-y-3">
            {/* ── Horário: grade de horários válidos; toca e fecha ── */}
            {focus === 'time' && (
              <>
                {timeHint && (
                  <p className="text-[11.5px] font-semibold text-amber-600 flex items-start gap-1.5">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {timeHint}
                  </p>
                )}
                {opcoesHorario.length === 0 ? (
                  <p className="text-[13px] text-gray-500 py-4 text-center">Sem horário disponível para a data escolhida.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {opcoesHorario.map((h) => (
                      <button
                        key={h}
                        onClick={() => commit({ time: h })}
                        className={`rounded-xl border px-2 py-3 text-[14px] font-bold active:scale-95 transition-transform ${
                          time === h ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 text-gray-800'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── Local de saída: buscador; confirma e fecha ── */}
            {focus === 'local' && (
              <>
                <PlaceInput
                  value={originText}
                  onChange={setOrigin}
                  onPick={(p) => { if (p) setOrigin(p.label || p.address || '') }}
                  placeholder={t('cartPg.editSheet.originPlaceholder')}
                  dotClass="bg-brand"
                />
                <button
                  onClick={() => commit({ origin_text: originText.trim() })}
                  disabled={!originText.trim()}
                  className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {t('cartPg.editSheet.save')}
                </button>
              </>
            )}

            {/* ── Veículo: nº de pessoas + seleção de veículos ── */}
            {focus === 'vehicle' && (
              <>
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

                {compartilhado ? (
                  <div className="bg-gray-50 rounded-2xl px-4 py-3">
                    <p className="text-[12.5px] text-gray-600 leading-snug">
                      No compartilhado você paga por pessoa e viaja com outros hóspedes —
                      o veículo é definido pelo operador que atender.
                    </p>
                    {precoPorPessoa > 0 && (
                      <p className="text-[12.5px] text-gray-700 font-semibold mt-1.5">
                        {fmt(precoPorPessoa)} × {people} {people === 1 ? 'pessoa' : 'pessoas'} = {fmt(subtotal)}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className={LBL}>{t('cartPg.editSheet.vehiclesLabel')} <Ok on={qtyTotal >= 1 && capacityOk} /></label>
                    <div className="mt-1 space-y-2">
                      {vehicles.map((v, i) => (
                        <div key={v.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                          {v.image_url
                            ? <img src={v.image_url} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-white" />
                            : <Car size={15} className="text-brand shrink-0" />}
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
                    {available.length === 0 && vehicles.length === 0 && (
                      <p className="mt-2 text-[12px] text-gray-500 leading-snug">
                        {(isTransfer ? !rvFetched : !tvFetched)
                          ? t('cartPg.editSheet.vehiclesLoading')
                          : t('cartPg.editSheet.vehiclesNone')}
                      </p>
                    )}
                    {extras.length > 0 && (
                      <div className="mt-2">
                        <button onClick={() => setShowExtras((s) => !s)}
                          className="inline-flex items-center gap-1 text-[12px] font-bold text-brand active:scale-95 transition-transform">
                          <Plus size={13} /> {showExtras
                            ? t('cartPg.editSheet.hideOtherVehicles')
                            : (vehicles.length === 0 ? 'Escolher veículo' : t('cartPg.editSheet.addOtherVehicle'))}
                        </button>
                        {showExtras && (
                          <div className="mt-2 space-y-2">
                            {extras.map((a) => (
                              <div key={a.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                                {a.image_url
                                  ? <img src={a.image_url} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-white" />
                                  : <Car size={15} className="text-gray-400 shrink-0" />}
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
                )}

                <button
                  onClick={() => commit()}
                  disabled={!podeVeiculo}
                  className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50"
                >
                  {t('cartPg.editSheet.save')}
                </button>
              </>
            )}
          </div>
        </div>
      </>,
      document.body,
    )
  }

  // Um só corpo de editor, usado inline (dentro do card do carrinho) e em folha
  // (fallback). MESMA lógica de preço/capacidade/modo — só muda o invólucro.
  const conteudo = (
    <>
      {!inline && (
        <div
          className="flex items-center justify-between px-5 pb-3 border-b border-gray-100 shrink-0 lg:pt-4"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <p className="font-bold text-gray-900 text-[15px] leading-tight flex-1 pr-2">{item.name}</p>
          <button onClick={onClose} aria-label={t('cartPg.editSheet.closeAria')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-95">
            <X size={15} className="text-gray-600" />
          </button>
        </div>
      )}

        <div className={inline ? 'px-3 pt-3 pb-1 space-y-4' : 'overflow-y-auto px-5 py-4 space-y-4 flex-1'}>
          {!focus && mostraModo && (
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Tipo de passeio</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {[
                  { id: 'private', label: t('toursPg.mode.private'), Icon: Car,
                    ok: allowsPrivate, hint: 'Veículo só para o seu grupo' },
                  { id: 'shared',  label: t('toursPg.mode.shared'),  Icon: Users,
                    ok: allowsShared,
                    hint: precoPorPessoa ? `${fmt(precoPorPessoa)} por pessoa` : 'Preço por pessoa' },
                ].map(({ id, label, Icon, ok, hint }) => (
                  <button
                    key={id}
                    onClick={() => ok && setMode(id)}
                    disabled={!ok}
                    className={`rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      !ok ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                        : mode === id ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <span className={`inline-flex items-center gap-1.5 text-[13px] font-bold ${
                      !ok ? 'text-gray-400' : mode === id ? 'text-brand' : 'text-gray-700'
                    }`}>
                      <Icon size={14} /> {label}
                    </span>
                    <span className="block text-[10.5px] text-gray-400 leading-snug mt-0.5">
                      {ok ? hint : 'Não disponível neste passeio'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!focus && isTransfer && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5 text-[12.5px] text-gray-700">
              <MapPin size={13} className="text-brand shrink-0" />
              <span className="font-semibold">{item.origin}</span>
              <ChevronRight size={12} className="text-gray-400" />
              <span className="font-semibold">{item.dest}</span>
            </div>
          )}

          {(!focus || focus === 'local') && !isTransfer && (
            <div>
              <label className={LBL}>{t('cartPg.editSheet.originLabel')} <Ok on={!!originText.trim()} /></label>
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

          {(!focus || focus === 'date' || focus === 'time') && (
          <div className={focus === 'date' || focus === 'time' ? '' : 'grid grid-cols-2 gap-3'}>
            {(!focus || focus === 'date') && (
            <div>
              <label className={LBL}>{t('cartPg.editSheet.dateLabel')} <Ok on={dateOk} /></label>
              <button type="button" onClick={() => setShowDate(true)}
                className="mt-1 w-full text-left bg-gray-50 rounded-xl px-3 py-3 text-[14px] text-gray-800 outline-none focus:ring-2 focus:ring-brand/30">
                {dateIso ? dayLabel(dateIso) : t('cartPg.editSheet.chooseDate')}
              </button>
            </div>
            )}
            {(!focus || focus === 'time') && (
            <div>
              <label className={LBL}>{t('cartPg.editSheet.timeLabel')} <Ok on={timeOk} /></label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={horariosDisponiveis.length === 0}
                className="mt-1 w-full bg-gray-50 rounded-xl px-3 py-3 text-[14px] text-gray-800 outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60"
              >
                <option value="">{horariosDisponiveis.length === 0 ? 'Sem horário hoje' : t('cartPg.editSheet.chooseTime', 'Escolher horário')}</option>
                {opcoesHorario.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
            )}
          </div>
          )}

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

          {(!focus || focus === 'date' || focus === 'time') && timeHint && (
            <p className="text-[11.5px] font-semibold text-amber-600 flex items-start gap-1.5 -mt-1">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {timeHint}
            </p>
          )}

          {(!focus || focus === 'vehicle') && (
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
          )}

          {(!focus || focus === 'vehicle') && (compartilhado ? (
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-[12.5px] text-gray-600 leading-snug">
                No compartilhado você paga por pessoa e viaja com outros hóspedes —
                o veículo é definido pelo operador que atender.
              </p>
              {precoPorPessoa > 0 && (
                <p className="text-[12.5px] text-gray-700 font-semibold mt-1.5">
                  {fmt(precoPorPessoa)} × {people} {people === 1 ? 'pessoa' : 'pessoas'} = {fmt(subtotal)}
                </p>
              )}
            </div>
          ) : (
          <div>
            <label className={LBL}>{t('cartPg.editSheet.vehiclesLabel')} <Ok on={qtyTotal >= 1 && capacityOk} /></label>
            <div className="mt-1 space-y-2">
              {vehicles.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                  {v.image_url
                    ? <img src={v.image_url} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-white" />
                    : <Car size={15} className="text-brand shrink-0" />}
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

            {/* A frota agora vem da rota/passeio, então "lista vazia" virou um
                desfecho possível — e sem aviso o cliente ficaria olhando um
                campo obrigatório sem nenhuma opção e sem saber por quê. */}
            {available.length === 0 && vehicles.length === 0 && (
              <p className="mt-2 text-[12px] text-gray-500 leading-snug">
                {(isTransfer ? !rvFetched : !tvFetched)
                  ? t('cartPg.editSheet.vehiclesLoading')
                  : t('cartPg.editSheet.vehiclesNone')}
              </p>
            )}

            {extras.length > 0 && (
              <div className="mt-2">
                <button onClick={() => setShowExtras((s) => !s)}
                  className="inline-flex items-center gap-1 text-[12px] font-bold text-brand active:scale-95 transition-transform">
                  <Plus size={13} /> {showExtras
                    ? t('cartPg.editSheet.hideOtherVehicles')
                    : (vehicles.length === 0 ? 'Escolher veículo' : t('cartPg.editSheet.addOtherVehicle'))}
                </button>
                {showExtras && (
                  <div className="mt-2 space-y-2">
                    {extras.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
                        {a.image_url
                          ? <img src={a.image_url} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0 bg-white" />
                          : <Car size={15} className="text-gray-400 shrink-0" />}
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
          ))}
        </div>

        <div className={inline ? 'px-3 py-3 mt-2 border-t border-gray-100 space-y-2' : 'px-5 py-4 border-t border-gray-100 pb-[max(16px,env(safe-area-inset-bottom))] space-y-2 shrink-0'}>
          {/* O acréscimo aparece como linha, não embutido no total: preço que
              sobe sem explicação é o que faz o cliente desistir na hora de
              pagar. */}
          {acrescimoData > 0 && (
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-amber-600 font-semibold">{rotuloData}</span>
              <span className="text-gray-500">
                {fmt(subtotal)} + {fmt(acrescimoData)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-gray-400 uppercase font-bold tracking-wide">{t('cartPg.editSheet.itemTotal')}</p>
            <p className="text-[18px] font-extrabold text-brand">{fmt(total)}</p>
          </div>
          <button
            onClick={save}
            disabled={!podeSalvar}
            className="w-full bg-brand text-white font-bold rounded-2xl py-3.5 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
          >
            {t('cartPg.editSheet.save')}
          </button>
          {!focus && !canSave && (
            <p className="text-[10.5px] text-gray-400 text-center">
              {!capacityOk ? t('cartPg.editSheet.adjustVehicles') : t('cartPg.editSheet.fillMissing', { missing: missing.join(', ') })}
            </p>
          )}
        </div>
    </>
  )

  // Inline: sem portal, sem overlay — o editor vive dentro do card.
  if (inline) return <div className="border-t border-gray-100">{conteudo}</div>

  // Portal para o <body>: dentro da árvore da página, um ancestral com
  // transform vira o bloco de contenção do position:fixed e a folha ia parar
  // abaixo da dobra. No celular ocupa a viewport; em telas grandes é um cartão.
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
      <div className="fixed inset-0 h-[100dvh] z-[80] flex flex-col bg-white lg:inset-auto lg:h-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:max-w-xl lg:w-full lg:max-h-[88dvh] lg:shadow-2xl">
        {conteudo}
      </div>
    </>,
    document.body,
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
  const paradas  = isTransfer ? [] : extrairParadas(desc || '')
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
          // Roteiro em prosa vira uma trilha ilustrada com pinos; sem paradas
          // reconhecíveis (ex.: transfer), mostra o texto normal.
          paradas.length >= 2 ? (
            <>
              <RoteiroTrilha stops={paradas} />
              <p className="text-gray-500">{desc}</p>
            </>
          ) : (
            <p>{desc}</p>
          )
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

  const [editing, setEditing] = useState(null)       // item em edição (folha)
  const [editFocus, setEditFocus] = useState(null)   // chip → só aquele campo
  // Cada chip abre o editor mirando só a sua função: data→calendário,
  // horário→relógio, local→buscador, veículo→pessoas+veículos.
  const CHIP_FOCUS = { data: 'date', hora: 'time', pessoas: 'vehicle', veiculo: 'vehicle', origem: 'local', destino: 'local' }
  const abrirEditor = (item, foco = null) => { setEditFocus(foco); setEditing(item) }
  const [expandedId, setExpandedId] = useState(null) // item com descrição aberta
  const [results, setResults] = useState({})       // id → {status, code?, msg?}
  const [batch, setBatch] = useState(null)         // snapshot durante envio
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [done, setDone] = useState(false)

  // Altura REAL do rodapé fixo, para o conteúdo terminar acima dele.
  // Era `pb-40` (160px) no chute, mas o rodapé passa disso: fica 64px acima da
  // barra de menu e ainda cresce com o cupom aplicado, o aviso de pendência e a
  // mensagem de erro. O resultado era o último bloco da página aparecendo
  // cortado por baixo do "Total". Medido, não estimado.
  const footerRef = useRef(null)
  const [footerH, setFooterH] = useState(0)
  useEffect(() => {
    const el = footerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // `innerHeight - top` é o quanto o rodapé come da tela por baixo — vale
    // tanto no celular (bottom-16, acima do menu) quanto no desktop (bottom-0).
    const medir = () => setFooterH(Math.max(0, window.innerHeight - el.getBoundingClientRect().top))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
    // Só quando o rodapé entra ou sai da tela: mudanças de ALTURA (cupom
    // aplicado, aviso de pendência, erro) já chegam pelo ResizeObserver.
  }, [items.length > 0, done])

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
  // O campo de cupom fica escondido atrás de um "Tem cupom?" — a maioria não
  // usa, e o input ocupava uma linha inteira do resumo numa tela já comprida.
  const [showCoupon,    setShowCoupon]    = useState(false)

  // Cupom que chegou por WhatsApp: já vem preenchido, senão o cliente teria de
  // decorar o código da mensagem e digitar na mão — é aí que a oferta se perde.
  // Nesse caso o campo já abre, senão o código preenchido ficaria escondido.
  useEffect(() => {
    const guardado = lerOferta()
    if (guardado) { setCouponInput(guardado); setShowCoupon(true) }
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

  // Operador da venda direta (link /c/<slug>), para o "Reservando com <nome>".
  const partnerName = getPartnerAttribution()?.name || null
  // Definido × pendente — alimenta o resumo ("X com valor definido / Y a calcular").
  const definedCount = items.filter((i) => itemMissing(i).length === 0).length
  const pendingCount = items.length - definedCount

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
      // Com link de operador ativo, o grupo inteiro nasce atribuído a ela.
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
    <div className="min-h-screen" style={{ paddingBottom: footerH ? footerH + 16 : 160 }}>
      <CartHeader count={items.length} partnerName={partnerName} />

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

                {/* Rodapé do card: status + editar. Item incompleto ganha os
                    campos que faltam como CHIPS (Escolher data, horário…) — cada
                    um abre o editor. Deixa claro o que falta, em vez de um
                    "Faltam: data, horário" corrido. */}
                {st?.status === 'ok' ? (
                  <div className="px-3 pb-3">
                    <span className="text-[11px] font-bold text-emerald-600">{t('cartPg.card.requestSent', { code: st.code })}</span>
                  </div>
                ) : st?.status === 'error' ? (
                  <div className="px-3 pb-3">
                    <span className="text-[11px] font-bold text-red-500">{st.msg}</span>
                  </div>
                ) : complete ? (
                  <div className="flex items-center justify-between px-3 pb-3">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                      <CheckCircle2 size={12} /> {t('cartPg.card.complete')}
                    </span>
                    {!batch && (
                      <button
                        onClick={() => abrirEditor(item, null)}
                        className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3.5 py-2 rounded-xl border border-brand/30 text-brand active:scale-95 transition-transform"
                      >
                        <Pencil size={12} /> {t('cartPg.card.edit')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="pb-3">
                    <div className="px-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600">
                        <AlertTriangle size={12} /> Faltam detalhes
                      </span>
                    </div>

                    {/* Privativo × Compartilhado: escolha que muda o preço,
                        direto no card (passeios). */}
                    {!batch && (
                      <ModoCard
                        item={item}
                        onChange={(mode) => upsertItem({
                          ...item, mode,
                          ...(mode === 'shared' ? { vehicles: [] } : {}),
                        })}
                      />
                    )}

                    {/* Chips compactos: cada um abre o editor para preencher e
                        fechar. Some o de veículo no compartilhado (não se
                        escolhe veículo — o preço é por pessoa). */}
                    {!batch && (
                      <div className="px-3 pt-2">
                        <div className="grid grid-cols-2 gap-2">
                          {(() => {
                            let chips = missingChips(miss)
                              .filter((c) => !(item.mode === 'shared' && c.key === 'veiculo'))
                            // Compartilhado: sem veículo, o que define o preço é o
                            // Nº de pessoas (R$ x por pessoa). Entra no lugar do
                            // chip de veículo, mesmo já havendo um número.
                            if (item.mode === 'shared' && !chips.some((c) => c.key === 'pessoas')) {
                              chips = [...chips, { key: 'pessoas', Icon: Users, label: 'Nº de pessoas' }]
                            }
                            return chips.map((c) => (
                            <button
                              key={c.key}
                              onClick={() => abrirEditor(item, CHIP_FOCUS[c.key] || null)}
                              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 border border-gray-200 rounded-xl px-3 py-2.5 active:scale-95 transition-transform"
                            >
                              <c.Icon size={14} className="text-brand shrink-0" />
                              <span className="truncate">{c.label}</span>
                              <ChevronRight size={13} className="text-gray-300 ml-auto shrink-0" />
                            </button>
                            ))
                          })()}
                        </div>
                        <button
                          onClick={() => abrirEditor(item, null)}
                          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-bold px-3.5 py-3 rounded-2xl bg-brand text-white shadow-sm shadow-brand/20 active:scale-[0.98] transition-transform"
                        >
                          <Pencil size={13} /> Completar detalhes
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Sugestões: complete a viagem com passeios ──
          Fica no FIM da tela, depois do pedido e separada dele por uma linha e
          um respiro grande. Colada nos itens, ela entrava no meio da leitura
          "confiro o que pedi → finalizo", e uma vitrine de outros passeios bem
          na hora de solicitar tira o cliente do fluxo em vez de ajudar.
          É um convite para DEPOIS de fechar, não parte do pedido. */}
      {items.length > 0 && !done && suggestedTours.length > 0 && (
        <div className="mt-10 pt-6 border-t border-gray-200/70 lg:max-w-2xl lg:mx-auto">
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

      {/* Resumo FLUTUANTE — cartão solto sobre a página, não uma faixa colada
          na borda de baixo. Continua sempre visível (o Total não pode sumir na
          rolagem), mas com cantos arredondados, margem nas laterais e sombra,
          para se ler como algo POR CIMA do conteúdo — e não como o fim da tela.
          Mesmo desenho do resumo flutuante da tela de Passeios.
          `pointer-events-none` no invólucro: a folga em volta do cartão não
          pode roubar o toque do que está atrás dela.

          PORTAL para o document.body, e não é detalhe: o wrapper do
          PullToRefresh usa `transform`, e um ancestral com transform vira o
          bloco de contenção do `position: fixed` — o "fixo" passa a se prender
          à PÁGINA, não à tela. Media era isso: com a lista mais longa o cartão
          ia parar embaixo do menu, com o botão cortado. A tela de Passeios já
          tinha resolvido assim; o carrinho ficou para trás. */}
      {(items.length > 0 || done) && createPortal(
        <div
          ref={footerRef}
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-3 pb-[max(10px,env(safe-area-inset-bottom))] z-30 pointer-events-none lg:max-w-2xl lg:px-0 lg:pb-5"
        >
        <div className="pointer-events-auto bg-white rounded-3xl border border-gray-100 shadow-[0_10px_34px_rgba(0,0,0,0.16)] px-3.5 py-3 space-y-2">
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
              ) : showCoupon ? (
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      value={couponInput}
                      autoFocus
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
              ) : (
                <button
                  onClick={() => setShowCoupon(true)}
                  className="text-[12px] font-semibold text-brand active:scale-95 transition-transform"
                >
                  Tem cupom?
                </button>
              )}
              {/* Resumo definido × pendente numa linha só: quando há item sem
                  valor, o total é PARCIAL — deixar explícito evita a surpresa
                  de ver o preço subir depois de completar o serviço. */}
              {pendingCount > 0 && (
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-gray-500">{definedCount} com valor · <span className="text-amber-600 font-semibold">{pendingCount} a calcular</span></span>
                  <span className="text-[10px] text-gray-400">Valores ilustrativos</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-gray-500 font-semibold">
                  {pendingCount > 0 ? 'Subtotal parcial' : t('cartPg.footer.total')}
                </p>
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
                className="w-full inline-flex items-center justify-center gap-2 bg-brand text-white font-bold rounded-2xl py-3 text-[14px] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
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
        </div>,
        document.body,
      )}

      {editing && (
        <EditSheet
          item={editing}
          focus={editFocus}
          onClose={() => { setEditing(null); setEditFocus(null) }}
          onSave={(updated) => { upsertItem(updated); setEditing(null); setEditFocus(null) }}
        />
      )}
    </div>
  )
}
