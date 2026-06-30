import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useFavorites } from '../contexts/FavoritesContext'
import {
  Star, Clock, Users, Heart, ChevronDown, Calendar, Minus, Plus,
  Zap,
} from 'lucide-react'

const fmtPrice = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

function TourRow({ tour, isFav, onToggleFav, onDetails }) {
  const badge = Array.isArray(tour.tags) && tour.tags.length ? tour.tags[0] : null
  const price = Number(tour.shared_price_per_person || 0)

  return (
    <div className="flex gap-5 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 hover:shadow-md transition-shadow">
      <div className="relative w-56 h-40 rounded-xl overflow-hidden shrink-0">
        {tour.cover_image_url
          ? <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-amber-300 flex items-center justify-center"><Zap size={28} className="text-white/30" /></div>}
        {badge && (
          <span className="absolute top-2 left-2 bg-brand text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{badge}</span>
        )}
        <button
          onClick={() => onToggleFav(tour.id)}
          className="absolute top-2 right-2 w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center transition-colors"
        >
          <Heart size={13} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
        </button>
      </div>

      <div className="flex-1 min-w-0 py-1 flex flex-col">
        <h3 className="font-bold text-gray-900 text-lg leading-tight">{tour.name}</h3>
        {tour.short_description && (
          <p className="text-[13px] text-gray-500 mt-1.5 line-clamp-2">{tour.short_description}</p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-gray-500 mt-auto pt-2">
          {tour.duration_hours && <span className="flex items-center gap-1"><Clock size={13} />{tour.duration_hours} horas</span>}
          {tour.max_people && <span className="flex items-center gap-1"><Users size={13} />Até {tour.max_people} pessoas</span>}
          {tour.rating_average > 0 && (
            <span className="flex items-center gap-1">
              <Star size={13} className="text-amber-400 fill-amber-400" />{tour.rating_average}
              {tour.rating_count ? <span className="text-gray-400">({tour.rating_count})</span> : null}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end justify-between py-1 pr-1 shrink-0">
        <div className="text-right">
          {tour.is_shared_enabled && price > 0 ? (
            <>
              <p className="text-[11px] text-gray-400">A partir de</p>
              <p className="text-brand font-extrabold text-xl">{fmtPrice(price)}</p>
              <p className="text-[10px] text-gray-400">/pessoa</p>
            </>
          ) : tour.is_private_enabled ? (
            <span className="text-[11px] text-brand font-semibold bg-brand/10 px-2.5 py-1 rounded-full">
              Privativo
            </span>
          ) : (
            <p className="text-brand font-extrabold text-xl">{price > 0 ? fmtPrice(price) : '—'}</p>
          )}
        </div>
        <button
          onClick={() => onDetails(tour)}
          className="bg-brand hover:bg-brand-600 text-white font-bold text-[13px] px-5 py-2.5 rounded-xl transition-colors"
        >
          Ver detalhes
        </button>
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-extrabold text-gray-900">Passeios</h1>
      <p className="text-gray-500 mt-1">Encontre experiências incríveis em {region?.name || 'Jericoacoara'}</p>

      {/* ── Filtros ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mt-6 mb-7">
        {/* Data */}
        <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 cursor-pointer hover:border-gray-300">
          <Calendar size={16} className="text-brand shrink-0" />
          <div className="text-left">
            <p className="text-[10px] text-gray-400 leading-none">Data</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="text-[13px] font-semibold text-gray-700 bg-transparent outline-none mt-0.5 w-[120px]"
            />
          </div>
        </label>

        {/* Pessoas */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <Users size={16} className="text-brand shrink-0" />
          <div className="text-left">
            <p className="text-[10px] text-gray-400 leading-none">Pessoas</p>
            <div className="flex items-center gap-2 mt-0.5">
              <button onClick={() => setPeople((p) => Math.max(1, p - 1))} className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50"><Minus size={11} /></button>
              <span className="text-[13px] font-semibold text-gray-700 w-4 text-center tabular-nums">{people}</span>
              <button onClick={() => setPeople((p) => p + 1)} className="w-5 h-5 rounded-full bg-brand flex items-center justify-center"><Plus size={11} className="text-white" /></button>
            </div>
          </div>
        </div>

        {/* Tipo de passeio */}
        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-xl pl-4 pr-10 py-3.5 text-[13px] font-semibold text-gray-700 hover:border-gray-300 focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="">Todos os tipos</option>
            {cats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Lista ────────────────────────────────────────── */}
      <h2 className="text-lg font-bold text-gray-900 mb-4">Mais populares</h2>
      {isLoading ? (
        <div className="h-64 flex items-center justify-center"><div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
      ) : list.length === 0 ? (
        <p className="text-gray-400 py-12 text-center">Nenhum passeio encontrado nesta região.</p>
      ) : (
        <div className="space-y-4">
          {list.map((t) => (
            <TourRow key={t.id} tour={t} isFav={favs.has(t.id)} onToggleFav={toggleFav} onDetails={openDetails} />
          ))}
        </div>
      )}
    </div>
  )
}
