import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useFavorites } from '../contexts/FavoritesContext'
import DesktopDatePicker from '../components/DesktopDatePicker'
import {
  Star, Clock, Users, Heart, Minus, Plus, Zap, Search, X,
} from 'lucide-react'

const fmtPrice = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

const FALLBACK_GRADIENTS = [
  'from-orange-400 via-orange-300 to-amber-200',
  'from-teal-500 via-cyan-400 to-blue-300',
  'from-amber-500 via-orange-400 to-pink-300',
  'from-emerald-500 via-teal-400 to-cyan-300',
]

/* ── Card vertical estilo GetYourGuide ─────────────────────── */
function TourCard({ tour, badge, gradient, isFav, onToggleFav, onDetails }) {
  const { t } = useTranslation()
  const price   = Number(tour.shared_price_per_person || 0)
  const shared  = tour.is_shared_enabled && price > 0
  const private_ = tour.is_private_enabled

  const meta = [
    tour.duration_hours ? t('toursPg.card.durationHours', { count: tour.duration_hours }) : null,
    private_ && shared ? t('toursPg.card.tourTypeBoth')
      : private_ ? t('toursPg.card.tourTypePrivateGroups')
      : shared ? t('toursPg.mode.shared') : null,
    tour.max_people ? t('toursPg.vehicle.upToPeople', { count: tour.max_people }) : null,
  ].filter(Boolean).join(' · ')

  return (
    <div
      onClick={() => onDetails(tour)}
      className="group cursor-pointer bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col"
    >
      <div className="relative h-48 overflow-hidden">
        {tour.cover_image_url ? (
          <img
            src={tour.cover_image_url}
            alt={tour.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <Zap size={28} className="text-white/30" />
          </div>
        )}
        {badge && (
          <span className={`absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm ${
            badge === t('toursPg.card.recommendedBadge') ? 'bg-white text-gray-900' : 'bg-gray-900/85 text-white'
          }`}>
            {badge}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(tour.id) }}
          aria-label={t('toursPg.card.favoriteAria')}
          className="absolute top-2.5 right-2.5 w-8 h-8 bg-white/95 hover:bg-white rounded-full shadow-sm flex items-center justify-center transition-colors"
        >
          <Heart size={15} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-500'} />
        </button>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-gray-900 text-[15px] leading-snug line-clamp-2">{tour.name}</h3>
        {meta && <p className="text-[12px] text-gray-500 mt-1.5 leading-relaxed line-clamp-2">{meta}</p>}

        <div className="mt-auto pt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {tour.rating_average > 0 ? (
              <p className="flex items-center gap-1 text-[13px] font-semibold text-gray-800">
                {Number(tour.rating_average).toFixed(1)}
                <Star size={13} className="text-amber-400 fill-amber-400" />
                {tour.rating_count ? <span className="text-gray-400 font-normal">({tour.rating_count})</span> : null}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400">{t('toursPg.card.newBadge')}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            {shared ? (
              <>
                <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.card.fromLabel')}</p>
                <p className="text-gray-900 font-extrabold text-[17px] leading-tight">{fmtPrice(price)}</p>
                <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.card.perPersonSuffix')}</p>
              </>
            ) : private_ ? (
              <>
                <p className="text-[10px] text-gray-400 leading-none">{t('toursPg.mode.private')}</p>
                <p className="text-brand font-bold text-[13px] leading-tight mt-0.5">{t('toursPg.card.viewOptions')}</p>
              </>
            ) : (
              <p className="text-gray-900 font-extrabold text-[17px]">{price > 0 ? fmtPrice(price) : '—'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ToursDesktop() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { state: navState } = useLocation()
  const { region, getServiceQuery } = useRegion()
  const [category, setCategory] = useState('')
  const [people, setPeople]     = useState(() => Number(navState?.people) >= 1 ? Number(navState.people) : 2)
  const [date, setDate]         = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(navState?.date || '') ? navState.date : '')
  // Busca por nome — paridade com a lupa do mobile
  const [searchTerm, setSearchTerm] = useState('')
  const { favs, toggleFav } = useFavorites()

  // Passeio já escolhido na home (dropdown da busca ou card) → abre o detalhe.
  // Só no viewport desktop: este componente fica montado (oculto) no mobile,
  // onde o Tours trata o selectedId selecionando o passeio na própria lista.
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    if (isDesktop && navState?.selectedId && !navState?.restoreFromCart) {
      navigate(`/passeios/${navState.selectedId}`, { replace: true, state: { people, date } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState?.selectedId])

  const geo = getServiceQuery()
  const { data, isLoading } = useQuery({
    queryKey: ['tours', 'desktop', region?.id, geo?.lat, geo?.lon],
    queryFn:  () => api.getTours({ ...geo }),
  })
  // Sempre lista — ver a mesma defesa em Home.jsx.
  const tours = Array.isArray(data?.tours) ? data.tours
              : Array.isArray(data)        ? data
              : []

  // Alta temporada: datas exatas em laranja no calendário do filtro.
  const { data: seasonsData } = useQuery({
    queryKey: ['seasons', region?.id],
    queryFn:  () => api.getSeasons(region?.id ? { region_id: region.id } : {}),
    staleTime: 10 * 60 * 1000,
    retry: 3,
  })
  const seasons = Array.isArray(seasonsData) ? seasonsData : []

  const cats = useMemo(() => {
    const m = new Map()
    tours.forEach((t) => { if (t.categories) m.set(t.categories.id, t.categories.name) })
    return [...m.entries()]
  }, [tours])

  const byCategory = category ? tours.filter((t) => t.categories?.id === category) : tours
  const list = searchTerm.trim()
    ? byCategory.filter((t) => t.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : byCategory

  // Categoria marcada como "carrossel próprio" (categories.is_exclusive) ganha
  // seção separada, com o nome dela de título — mesma lógica do mobile e dos
  // translados. Independente de `tours.is_exclusive`, que define o fluxo de venda.
  const secoesDeCategoria = useMemo(() => {
    const porId = new Map()
    for (const x of list) {
      if (!x.categories?.is_exclusive) continue
      const id = x.categories.id || x.category_id || x.categories.name
      if (!id) continue
      if (!porId.has(id)) {
        porId.set(id, { id, nome: x.categories.name || '', ordem: Number(x.categories.sort_order) || 0, passeios: [] })
      }
      porId.get(id).passeios.push(x)
    }
    return [...porId.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
  }, [list])
  const idsEmCategoria = useMemo(
    () => new Set(secoesDeCategoria.flatMap((c) => c.passeios.map((p) => p.id))),
    [secoesDeCategoria],
  )

  // Tradicionais (carrinho/combo) × exclusivos (venda direta) — mesma divisão
  // do mobile. Os dois abrem a página de detalhe no desktop. Quem já tem seção
  // de categoria sai daqui para não aparecer duas vezes.
  const tradList      = list.filter((t) => !t.is_exclusive && !idsEmCategoria.has(t.id))
  const exclusiveList = list.filter((t) =>  t.is_exclusive && !idsEmCategoria.has(t.id))

  // R6: horário limite de solicitação (padrão 12:00, America/Fortaleza) —
  // passou do cutoff, a data mínima do filtro passa a ser amanhã. O backend
  // valida no mesmo fuso; sem isso um turista em outro fuso vê "hoje" e leva
  // 400 no checkout (mesma regra do mobile).
  const cutoffMinIso = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
    const d = new Date()
    if (h * 60 + m >= 12 * 60) d.setDate(d.getDate() + 1)
    return d.toLocaleDateString('en-CA')
  }, [])
  useEffect(() => {
    if (date && date < cutoffMinIso) setDate(cutoffMinIso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoffMinIso])

  function openDetails(tour) {
    navigate(`/passeios/${tour.id}`, { state: { people, date } })
  }

  // Selo estilo GYG: o 1º da lista é "Mais recomendado"; demais usam a 1ª tag.
  function badgeFor(tour, idx) {
    if (idx === 0 && !category) return t('toursPg.card.recommendedBadge')
    if (Array.isArray(tour.tags) && tour.tags.length) return tour.tags[0]
    return null
  }

  return (
    <div className="max-w-[1520px] mx-auto px-10 xl:px-16 py-8">
      {/* ── Título ───────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight">
            {t('toursPg.page.title', { region: region?.name || 'Jericoacoara' })}
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            {t('toursPg.page.subtitle')}
          </p>
        </div>

        {/* Busca + data + pessoas (compactos, à direita) */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 focus-within:border-brand transition-colors">
            <Search size={14} className="text-brand shrink-0" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('toursPg.searchPlaceholder')}
              className="text-[13px] font-semibold text-gray-700 bg-transparent outline-none w-[150px] placeholder-gray-400"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} aria-label={t('toursPg.page.clearSearchAria')}>
                <X size={13} className="text-gray-400" />
              </button>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-full px-4 py-2 hover:border-gray-300 transition-colors">
            <DesktopDatePicker
              valueIso={date || cutoffMinIso}
              onChange={setDate}
              minIso={cutoffMinIso}
              seasons={seasons}
              className="w-[150px]"
            />
          </div>
          <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-full px-4 py-2">
            <Users size={14} className="text-brand shrink-0" />
            <button onClick={() => setPeople((p) => Math.max(1, p - 1))} className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50">
              <Minus size={11} />
            </button>
            <span className="text-[13px] font-semibold text-gray-700 w-4 text-center tabular-nums">{people}</span>
            <button onClick={() => setPeople((p) => p + 1)} className="w-5 h-5 rounded-full bg-brand flex items-center justify-center">
              <Plus size={11} className="text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Chips de categoria (estilo GYG) ──────────────── */}
      <div className="flex items-center gap-2 mt-6 overflow-x-auto scrollbar-hide pb-1">
        <button
          onClick={() => setCategory('')}
          className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold border transition-colors ${
            !category ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
          }`}
        >
          {t('toursPg.page.allCategories')}
        </button>
        {cats.map(([id, name]) => (
          <button
            key={id}
            onClick={() => setCategory(category === id ? '' : id)}
            className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-semibold border transition-colors ${
              category === id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* ── Contagem ─────────────────────────────────────── */}
      {!isLoading && (
        <p className="text-[13px] text-gray-500 mt-4 mb-4">
          <span className="font-bold text-gray-900">{list.length}</span> {list.length === 1 ? t('toursPg.page.result') : t('toursPg.page.results')} · {region?.name || 'Jericoacoara'}
        </p>
      )}

      {/* ── Grade de cards ───────────────────────────────── */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-gray-400 py-16 text-center border border-dashed border-gray-200 rounded-2xl mt-2">
          {searchTerm.trim()
            ? t('toursPg.page.noResultsSearch', { term: searchTerm.trim() })
            : t('toursPg.page.noResultsRegion')}
        </p>
      ) : (
        <>
          {tradList.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {tradList.map((t, i) => (
                <TourCard
                  key={t.id}
                  tour={t}
                  badge={badgeFor(t, i)}
                  gradient={FALLBACK_GRADIENTS[i % FALLBACK_GRADIENTS.length]}
                  isFav={favs.has(t.id)}
                  onToggleFav={toggleFav}
                  onDetails={openDetails}
                />
              ))}
            </div>
          )}

          {/* Uma seção por categoria marcada, com o nome da categoria. */}
          {secoesDeCategoria.map((cat) => (
            <div key={cat.id}>
              <div className="mt-10 mb-4">
                <h2 className="text-[20px] font-extrabold text-gray-900">{cat.nome}</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">{t('toursPg.categorySection.subtitle')}</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {cat.passeios.map((tour, i) => (
                  <TourCard
                    key={tour.id}
                    tour={tour}
                    gradient={FALLBACK_GRADIENTS[(i + 1) % FALLBACK_GRADIENTS.length]}
                    isFav={favs.has(tour.id)}
                    onToggleFav={toggleFav}
                    onDetails={openDetails}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Exclusivos: venda direta, carrossel próprio no mobile — aqui em
              seção separada com selo (mesma divisão do catálogo). */}
          {exclusiveList.length > 0 && (
            <>
              <div className="mt-10 mb-4">
                <h2 className="text-[20px] font-extrabold text-gray-900">{t('toursPg.page.exclusiveSectionTitle')}</h2>
                <p className="text-[13px] text-gray-500 mt-0.5">{t('toursPg.page.exclusiveSectionSubtitle')}</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {exclusiveList.map((tour, i) => (
                  <TourCard
                    key={tour.id}
                    tour={tour}
                    badge={t('toursPg.page.exclusiveBadge')}
                    gradient={FALLBACK_GRADIENTS[(i + 2) % FALLBACK_GRADIENTS.length]}
                    isFav={favs.has(tour.id)}
                    onToggleFav={toggleFav}
                    onDetails={openDetails}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
