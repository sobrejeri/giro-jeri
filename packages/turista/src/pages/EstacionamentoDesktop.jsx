import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MapPin, ParkingSquare, Umbrella, Sun, Search, X, Clock, Car, ChevronRight,
  ShieldCheck, Info, Compass, Calendar,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, startOfDay } from 'date-fns'
import { ptBR, enUS, es as esLocale } from 'date-fns/locale'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useCart } from '../contexts/CartContext'
import DateSheet from '../components/DateSheet'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const iso = (date, time) => (date && time ? `${date}T${time}:00-03:00` : null)
function hojeJeri() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' })
  return p.format(new Date())
}

/* ── Card de estacionamento (coluna esquerda) ─────────────────── */
function LotCard({ lot, active, onSelect }) {
  const { t } = useTranslation()
  const foto = Array.isArray(lot.photos) ? lot.photos[0] : null
  const oh = lot.opening_hours || {}
  const coberto = oh.coberto
  const horario = oh.is_24h === false && oh.open && oh.close ? `${oh.open}–${oh.close}` : t('estacionamentoPg.hours24')
  return (
    <div
      onClick={() => onSelect(lot)}
      className={`group cursor-pointer bg-white rounded-2xl border shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col ${
        active ? 'border-brand ring-2 ring-brand/30 shadow-md' : 'border-gray-100'
      }`}
    >
      <div className="relative h-40 overflow-hidden bg-gray-100">
        {foto ? (
          <img src={foto} alt={lot.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><ParkingSquare size={28} className="text-gray-300" /></div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-[15px] leading-snug line-clamp-2">{lot.name}</h3>
        <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-1"><MapPin size={12} className="text-brand" /> {lot.region_name || 'Jericoacoara'}</p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {coberto ? <Umbrella size={11} /> : <Sun size={11} />} {coberto ? t('estacionamentoPg.covered') : t('estacionamentoPg.uncovered')}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            <Clock size={11} /> {horario}
          </span>
        </div>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="text-[12px] text-gray-500 flex items-center gap-1"><ParkingSquare size={13} /> {t('estacionamentoPg.desktop.consultDaily')}</span>
          <span className={`text-[13px] font-bold flex items-center gap-1 ${active ? 'text-brand' : 'text-gray-500 group-hover:text-brand'}`}>
            {active ? t('estacionamentoPg.desktop.selected') : t('estacionamentoPg.desktop.select')} <ChevronRight size={15} />
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Configurador do estacionamento escolhido (coluna direita) ── */
function Configurador({ lotId, onClose }) {
  const navigate = useNavigate()
  const { upsertItem } = useCart()
  const { t, i18n } = useTranslation()
  const dfLocale = { pt: ptBR, en: enUS, es: esLocale }[String(i18n.language || 'pt').slice(0, 2)] || ptBR

  const { data: lot } = useQuery({ queryKey: ['parking-lot', lotId], queryFn: () => api.parkingLot(lotId), enabled: !!lotId })

  const [entradaD, setEntradaD] = useState('')
  const [entradaH, setEntradaH] = useState('10:00')
  const [saidaD, setSaidaD] = useState('')
  const [sheet, setSheet] = useState(null) // 'entrada' | 'saida' — calendário aberto
  const [saidaH, setSaidaH] = useState('10:00')
  const [qtys, setQtys] = useState({})
  const [plates, setPlates] = useState({})
  const [erro, setErro] = useState('')
  const hoje = hojeJeri()

  // Reseta a seleção ao trocar de estacionamento.
  useEffect(() => { setQtys({}); setPlates({}); setErro('') }, [lotId])
  useEffect(() => {
    if (saidaD && ((entradaD && saidaD < entradaD) || saidaD < hoje)) setSaidaD('')
  }, [entradaD, saidaD, hoje])

  const tarifas = lot?.tariffs || []
  const startAt = iso(entradaD, entradaH)
  const endAt = iso(saidaD, saidaH)
  const periodoOk = startAt && endAt && Date.parse(endAt) > Date.parse(startAt)

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
  useEffect(() => {
    if (!horarios.length) return
    if (!horarios.includes(entradaH)) setEntradaH(horarios[0])
    if (!horarios.includes(saidaH)) setSaidaH(horarios[0])
  }, [horarios]) // eslint-disable-line react-hooks/exhaustive-deps

  const tiposKey = tarifas.map((t) => t.vehicle_type).join(',')
  const { data: quotes } = useQuery({
    queryKey: ['parking-quotes', lotId, startAt, endAt, tiposKey],
    enabled: !!(periodoOk && lotId && tarifas.length),
    retry: false,
    queryFn: async () => {
      const entradas = await Promise.all(tarifas.map(async (t) => {
        const q = await api.parkingQuote({ lot_id: lotId, vehicle_type: t.vehicle_type, start_at: startAt, end_at: endAt })
        return [t.vehicle_type, q]
      }))
      return Object.fromEntries(entradas)
    },
  })

  function mudarQtd(type, n) {
    const q = Math.max(0, Math.min(Number(n) || 0, 20))
    setQtys((prev) => ({ ...prev, [type]: q }))
    setPlates((prev) => {
      const arr = (prev[type] || []).slice(0, q)
      while (arr.length < q) arr.push('')
      return { ...prev, [type]: arr }
    })
  }
  function mudarPlaca(type, i, val) {
    setPlates((prev) => {
      const arr = (prev[type] || []).slice()
      arr[i] = val.toUpperCase()
      return { ...prev, [type]: arr }
    })
  }

  const selecionados = tarifas.filter((t) => (qtys[t.vehicle_type] || 0) > 0)
  const totalVagas = tarifas.reduce((s, t) => s + (qtys[t.vehicle_type] || 0), 0)
  const anyQuote = quotes ? Object.values(quotes)[0] : null
  const diarias = anyQuote?.diarias
  const disponivel = anyQuote?.disponibilidade?.disponivel
  const totalGeral = useMemo(() => {
    if (!quotes) return 0
    return selecionados.reduce((s, t) => s + (Number(quotes[t.vehicle_type]?.total) || 0) * (qtys[t.vehicle_type] || 0), 0)
  }, [quotes, selecionados, qtys])
  const PLACA_MIN = 6
  const placasOk = selecionados.length > 0 && selecionados.every((t) => {
    const arr = plates[t.vehicle_type] || []
    return arr.length === (qtys[t.vehicle_type] || 0) && arr.every((p) => (p || '').trim().length >= PLACA_MIN)
  })
  const vagasOk = disponivel == null ? true : totalVagas <= disponivel
  const pronto = periodoOk && !!quotes && totalVagas >= 1 && placasOk && vagasOk

  function adicionar() {
    setErro('')
    if (!periodoOk) { setErro(t('estacionamentoPg.errPeriod')); return }
    if (!quotes) { setErro(t('estacionamentoPg.errQuote')); return }
    if (totalVagas < 1) { setErro(t('estacionamentoPg.errVehicle')); return }
    if (!placasOk) { setErro(t('estacionamentoPg.errPlates')); return }
    if (!vagasOk) { setErro(t('estacionamentoPg.errNoSpots', { count: disponivel })); return }

    const vehiclesList = []
    for (const t of selecionados) {
      const arr = plates[t.vehicle_type] || []
      for (let i = 0; i < (qtys[t.vehicle_type] || 0); i++) {
        vehiclesList.push({ vehicle_type: t.vehicle_type, plate: arr[i].trim().toUpperCase() })
      }
    }
    const resumo = selecionados.map((t) => `${qtys[t.vehicle_type]} ${t.vehicle_type}${qtys[t.vehicle_type] > 1 ? 's' : ''}`).join(' · ')
    const foto = Array.isArray(lot.photos) ? lot.photos[0] : null
    upsertItem({
      id: `park-${lotId}-${startAt}-${endAt}`,
      kind: 'parking',
      name: lot.name,
      lot_id: lotId,
      lot_name: lot.name,
      cover_image_url: foto,
      region_name: lot.region_name || 'Jericoacoara',
      vehicle_type: vehiclesList[0]?.vehicle_type,
      plate: vehiclesList[0]?.plate || null,
      parking_vehicles: vehiclesList,
      vehicles_summary: resumo,
      start_at: startAt,
      end_at: endAt,
      diarias,
      total: totalGeral,
    })
    navigate('/carrinho')
  }

  if (!lot) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="h-48 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const campoSel = 'flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 h-10 mt-1 focus-within:border-brand'
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[17px] font-extrabold text-gray-900 leading-snug">{lot.name}</p>
          <p className="text-[12px] text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={12} className="text-brand" /> {lot.region_name || 'Jericoacoara'}</p>
        </div>
        <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label={t('estacionamentoPg.desktop.close')}><X size={18} /></button>
      </div>

      {/* Período */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <label className="text-[11px] font-semibold text-gray-500">{t('estacionamentoPg.entry')}
          <button type="button" onClick={() => setSheet('entrada')} className={`${campoSel} w-full text-left`}>
            <Calendar size={14} className="text-brand shrink-0" />
            <span className={`flex-1 min-w-0 text-[13px] truncate ${entradaD ? 'text-gray-900' : 'text-gray-400'}`}>
              {entradaD ? format(new Date(entradaD + 'T00:00:00'), 'PP', { locale: dfLocale }) : t('estacionamentoPg.choose')}
            </span>
          </button>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">{t('estacionamentoPg.time')}
          <div className={campoSel}>
            <Clock size={14} className="text-brand shrink-0" />
            <select value={entradaH} onChange={(e) => setEntradaH(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none">
              {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">{t('estacionamentoPg.exit')}
          <button type="button" onClick={() => setSheet('saida')} className={`${campoSel} w-full text-left`}>
            <Calendar size={14} className="text-brand shrink-0" />
            <span className={`flex-1 min-w-0 text-[13px] truncate ${saidaD ? 'text-gray-900' : 'text-gray-400'}`}>
              {saidaD ? format(new Date(saidaD + 'T00:00:00'), 'PP', { locale: dfLocale }) : t('estacionamentoPg.choose')}
            </span>
          </button>
        </label>
        <label className="text-[11px] font-semibold text-gray-500">{t('estacionamentoPg.time')}
          <div className={campoSel}>
            <Clock size={14} className="text-brand shrink-0" />
            <select value={saidaH} onChange={(e) => setSaidaH(e.target.value)} className="flex-1 min-w-0 text-[13px] bg-transparent outline-none">
              {horarios.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </label>
      </div>
      {!h24 && lot?.opening_hours?.open && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1.5 mt-2">
          <Clock size={12} /> {t('estacionamentoPg.hoursNoteShort', { open: lot.opening_hours.open, close: lot.opening_hours.close })}
        </p>
      )}

      {/* Veículos */}
      {tarifas.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-gray-900">{t('estacionamentoPg.vehicles')}</p>
            {totalVagas > 0 && <span className="text-[11px] font-semibold text-brand">{t('estacionamentoPg.spots', { count: totalVagas })}</span>}
          </div>
          {tarifas.map((tar) => {
            const q = qtys[tar.vehicle_type] || 0
            return (
              <div key={tar.vehicle_type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800 capitalize">
                    <Car size={15} className="text-brand" /> {tar.vehicle_type}
                    <span className="text-[12px] font-normal text-gray-500">· {t('estacionamentoPg.perDay', { price: fmt(tar.price_per_unit) })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => mudarQtd(tar.vehicle_type, q - 1)} disabled={q <= 0}
                      className="w-8 h-8 rounded-full border border-gray-200 text-gray-700 font-bold text-lg leading-none flex items-center justify-center disabled:opacity-40 hover:bg-gray-50">−</button>
                    <span className="w-5 text-center text-[14px] font-bold text-gray-900">{q}</span>
                    <button type="button" onClick={() => mudarQtd(tar.vehicle_type, q + 1)}
                      className="w-8 h-8 rounded-full border border-brand text-brand font-bold text-lg leading-none flex items-center justify-center hover:bg-brand/5">+</button>
                  </div>
                </div>
                {q > 0 && (
                  <div className="space-y-2 pl-1">
                    {Array.from({ length: q }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-400 w-16 shrink-0 capitalize">{tar.vehicle_type} {i + 1}</span>
                        <input
                          value={(plates[tar.vehicle_type] || [])[i] || ''}
                          onChange={(e) => mudarPlaca(tar.vehicle_type, i, e.target.value)}
                          placeholder={t('estacionamentoPg.platePlaceholder')} maxLength={12}
                          className="flex-1 border border-gray-200 rounded-lg px-3 h-10 text-[13px] uppercase tracking-wide outline-none focus:border-brand"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <p className="text-[11px] text-gray-400 flex items-center gap-1"><Info size={11} /> {t('estacionamentoPg.dailyNoteShort')}</p>
        </div>
      )}

      {/* Disponibilidade */}
      {periodoOk && quotes && (
        disponivel != null && disponivel <= 0 ? (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-[13px] text-red-700 font-semibold flex items-center gap-2"><Sun size={15} className="shrink-0" /> {t('estacionamentoPg.soldOutShort')}</div>
        ) : disponivel != null && totalVagas > disponivel ? (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[13px] text-amber-700 font-semibold flex items-center gap-2"><Info size={15} className="shrink-0" /> {t('estacionamentoPg.onlyNSpots', { count: disponivel })}</div>
        ) : (
          <div className="mt-3 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[12px] text-emerald-700 font-semibold flex items-center gap-2"><ParkingSquare size={14} className="shrink-0" /> {Number(disponivel) > 0 ? t('estacionamentoPg.nSpotsAvailable', { count: disponivel }) : t('estacionamentoPg.spotsAvailable')}</div>
        )
      )}

      {/* Total */}
      {periodoOk && quotes && totalVagas > 0 && (
        <div className="border-t border-gray-100 mt-4 pt-3 flex items-end justify-between">
          <div>
            <p className="text-[13px] font-bold text-gray-900">{t('estacionamentoPg.summary', { vehicles: totalVagas, days: diarias })}</p>
            <p className="text-[11px] text-gray-500">{t('estacionamentoPg.payAfterAcceptShort')}</p>
          </div>
          <p className="text-[24px] font-extrabold text-brand">{fmt(totalGeral)}</p>
        </div>
      )}

      {erro && <p className="text-[12px] text-red-500 mt-2">{erro}</p>}

      <button onClick={adicionar} disabled={!pronto}
        className={`mt-4 w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all ${
          pronto ? 'bg-brand text-white hover:bg-brand-600 active:scale-[0.98] shadow-md shadow-brand/20' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}>
        {pronto ? <>{t('estacionamentoPg.addToCartPrice', { price: fmt(totalGeral) })}</> : t('estacionamentoPg.addToCart')}
      </button>
      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[12px] text-gray-400">
        <ShieldCheck size={14} className="text-emerald-500 shrink-0" /> {t('estacionamentoPg.payAfterAccept')}
      </p>

      {sheet && (
        <DateSheet
          value={sheet === 'entrada'
            ? (entradaD ? new Date(entradaD + 'T00:00:00') : null)
            : (saidaD ? new Date(saidaD + 'T00:00:00') : null)}
          minDate={sheet === 'saida' && entradaD ? new Date(entradaD + 'T00:00:00') : startOfDay(new Date())}
          seasons={lot?.season_rules}
          onChange={(day) => {
            const s = format(day, 'yyyy-MM-dd')
            if (sheet === 'entrada') { setEntradaD(s); setSaidaD((sd) => (sd && sd < s ? '' : sd)) }
            else setSaidaD(s)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

/* ── Página desktop ────────────────────────────────────────────── */
export default function EstacionamentoDesktop() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { region } = useRegion()
  const [busca, setBusca] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['parking-lots', region?.id || 'all'],
    queryFn: () => api.parkingLots(region?.id),
  })
  const lots = (data?.data || []).filter((l) =>
    !busca.trim() || (l.name || '').toLowerCase().includes(busca.trim().toLowerCase()))

  function selectLot(lot) {
    setSelectedId(lot.id)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="max-w-[1520px] mx-auto px-10 xl:px-16 py-8">
      <nav className="flex items-center gap-1.5 text-[13px] text-gray-400 mb-1.5">
        <button onClick={() => navigate('/passeios')} className="hover:text-gray-600">{t('estacionamentoPg.desktop.breadcrumbTours')}</button>
        <ChevronRight size={13} className="text-gray-300" />
        <span className="text-gray-500 font-medium">{t('estacionamentoPg.desktop.spotsCrumb')}</span>
      </nav>
      <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight">{t('estacionamentoPg.desktop.title', { region: region?.name || 'Jericoacoara' })}</h1>
      <p className="text-[13px] text-gray-500 mt-1">{t('estacionamentoPg.desktop.subtitle')}</p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px] gap-6 mt-6 items-start">
        {/* ESQUERDA: catálogo */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{t('estacionamentoPg.desktop.chooseLot')}</h2>
              <p className="text-[13px] text-gray-500 mt-0.5">{t('estacionamentoPg.desktop.chooseLotHint')}</p>
            </div>
          </div>

          <div className="relative mt-4">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t('estacionamentoPg.desktop.searchPlaceholder')}
              className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[14px] text-gray-800 placeholder-gray-400 outline-none focus:border-brand focus:bg-white transition-colors"
            />
            {busca && (
              <button onClick={() => setBusca('')} aria-label={t('estacionamentoPg.desktop.clearSearch')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={14} className="text-gray-400" /></button>
            )}
          </div>

          {!isLoading && (
            <p className="text-[13px] text-gray-500 mt-4 mb-3">
              <span className="font-bold text-gray-900">{lots.length}</span> {lots.length === 1 ? t('estacionamentoPg.desktop.countOne') : t('estacionamentoPg.desktop.countOther')} · {region?.name || 'Jericoacoara'}
            </p>
          )}

          {isLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : lots.length === 0 ? (
            <p className="text-gray-400 py-16 text-center border border-dashed border-gray-200 rounded-2xl mt-2">
              {t('estacionamentoPg.desktop.empty')}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {lots.map((lot) => (
                <LotCard key={lot.id} lot={lot} active={selectedId === lot.id} onSelect={selectLot} />
              ))}
            </div>
          )}
        </section>

        {/* DIREITA: configurador (sticky) */}
        <aside className="lg:sticky lg:top-20">
          {selectedId ? (
            <Configurador lotId={selectedId} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[18px] font-bold text-gray-900">{t('estacionamentoPg.desktop.yourBooking')}</p>
              <p className="text-[13px] text-gray-500 mb-4">{t('estacionamentoPg.desktop.pickToStart')}</p>
              <div className="py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-3">
                  <ParkingSquare size={26} className="text-brand" />
                </div>
                <p className="text-[13px] text-gray-500 max-w-[240px] mx-auto leading-relaxed">
                  {t('estacionamentoPg.desktop.emptyHint')}
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
