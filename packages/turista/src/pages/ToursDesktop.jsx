import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useFavorites } from '../contexts/FavoritesContext'
import {
  Star, Clock, Users, Heart, Calendar, Minus, Plus, Zap,
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
  const price   = Number(tour.shared_price_per_person || 0)
  const shared  = tour.is_shared_enabled && price > 0
  const private_ = tour.is_private_enabled

  const meta = [
    tour.duration_hours ? `${tour.duration_hours} horas` : null,
    private_ && shared ? 'Privativo ou compartilhado'
      : private_ ? 'Grupos particulares'
      : shared ? 'Compartilhado' : null,
    tour.max_people ? `Até ${tour.max_people} pessoas` : null,
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
            badge === 'Mais recomendado' ? 'bg-white text-gray-900' : 'bg-gray-900/85 text-white'
          }`}>
            {badge}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(tour.id) }}
          aria-label="Favoritar"
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
              <p className="text-[11px] text-gray-400">Novidade</p>
            )}
          </div>
          <div className="text-right shrink-0">
            {shared ? (
              <>
                <p className="text-[10px] text-gray-400 leading-none">A partir de</p>
                <p className="text-gray-900 font-extrabold text-[17px] leading-tight">{fmtPrice(price)}</p>
                <p className="text-[10px] text-gray-400 leading-none">por pessoa</p>
              </>
            ) : private_ ? (
              <>
                <p className="text-[10px] text-gray-400 leading-none">Privativo</p>
                <p className="text-brand font-bold text-[13px] leading-tight mt-0.5">Ver opções →</p>
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
  const navigate = useNavigate()
  const { region, getServiceQuery } = useRegion()
  const [category, setCategory] = useState('')
  const [people, setPeople]     = useState(2)
  const [date, setDate]         = useState('')
  const { favs, toggleFav } = useFavorites()

  const geo = getServiceQuery()
  const { data, isLoading } = useQuery({
    queryKey: ['tours', 'desktop', region?.id, geo?.lat, geo?.lon],
    queryFn:  () => api.getTours({ ...geo }),
  })
  const tours = data?.tours || data || []

  const cats = useMemo(() => {
    const m = new Map()
    tours.forEach((t) => { if (t.categories) m.set(t.categories.id, t.categories.name) })
    return [...m.entries()]
  }, [tours])

  const list = category ? tours.filter((t) => t.categories?.id === category) : tours

  function openDetails(tour) {
    navigate(`/passeios/${tour.id}`, { state: { people, date } })
  }

  // Selo estilo GYG: o 1º da lista é "Mais recomendado"; demais usam a 1ª tag.
  function badgeFor(tour, idx) {
    if (idx === 0 && !category) return 'Mais recomendado'
    if (Array.isArray(tour.tags) && tour.tags.length) return tour.tags[0]
    return null
  }

  return (
    <div className="max-w-[1520px] mx-auto px-10 xl:px-16 py-8">
      {/* ── Título ───────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-[28px] font-extrabold text-gray-900 leading-tight">
            Passeios em {region?.name || 'Jericoacoara'}
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Experiências com atendimento local e reserva na plataforma.
          </p>
        </div>

        {/* Data + pessoas (compactos, à direita) */}
        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 cursor-pointer hover:border-gray-300 transition-colors">
            <Calendar size={14} className="text-brand shrink-0" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="text-[13px] font-semibold text-gray-700 bg-transparent outline-none w-[118px]"
            />
          </label>
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
          Todos
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
          <span className="font-bold text-gray-900">{list.length}</span> resultado{list.length !== 1 ? 's' : ''} · {region?.name || 'Jericoacoara'}
        </p>
      )}

      {/* ── Grade de cards ───────────────────────────────── */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-gray-400 py-16 text-center border border-dashed border-gray-200 rounded-2xl mt-2">
          Nenhum passeio encontrado nesta região.
        </p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {list.map((t, i) => (
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
    </div>
  )
}
