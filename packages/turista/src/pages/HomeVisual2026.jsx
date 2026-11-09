import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight, CalendarCheck, Car, ChevronRight, Clock, Compass, Flame,
  Heart, MapPin, ParkingSquare, Plus, Search, Send, ShoppingCart,
  Sparkles, Star, Store, User,
} from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useFavorites } from '../contexts/FavoritesContext'
import { useCart } from '../contexts/CartContext'
import NotificationBell from '../components/NotificationBell'

const fallbackGradient = 'linear-gradient(125deg,#67c5df 0%,#157eb5 48%,#ffad6d 100%)'

function TourTile({ tour, isFavorite, onFavorite }) {
  const navigate = useNavigate()
  const price = Number(tour.shared_price_per_person)
  const hasPrice = Number.isFinite(price) && price > 0
  const hours = Number(tour.duration_hours) || (
    Number(tour.duration_minutes) > 0 ? Number(tour.duration_minutes) / 60 : 0
  )
  const rating = Number(tour.rating_average)

  function details() {
    navigate('/passeios/' + encodeURIComponent(tour.id))
  }

  return (
    <article className="w-[min(46vw,212px)] min-w-[153px] shrink-0 snap-start overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-[0_7px_18px_rgba(30,40,65,0.10)]">
      <div className="relative h-[145px] w-full bg-[#d7e9e9]">
        <button type="button" onClick={details} className="absolute inset-0 h-full w-full" aria-label={`Ver detalhes de ${tour.name}`}>
          {tour.cover_image_url
            ? <img src={tour.cover_image_url} alt={tour.name} className="h-full w-full object-cover" loading="lazy" />
            : <span className="flex h-full items-center justify-center bg-gradient-to-br from-orange-300 via-cyan-300 to-blue-500"><Compass size={36} className="text-white/80" /></span>
          }
        </button>
        {tour.highlight_badge && (
          <span className="pointer-events-none absolute left-2 top-2 max-w-[calc(100%-54px)] truncate rounded-full bg-[#ff6a00] px-2.5 py-1 text-[10px] font-extrabold text-white shadow">
            {tour.highlight_badge}
          </span>
        )}
        <button
          type="button"
          onClick={() => onFavorite(tour.id)}
          aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          aria-pressed={isFavorite}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow"
        >
          <Heart size={17} className={isFavorite ? 'fill-red-500 text-red-500' : 'text-slate-500'} />
        </button>
        <button
          type="button"
          onClick={details}
          aria-label={`Explorar ${tour.name}`}
          className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-800 shadow-md active:scale-95"
        >
          <Plus size={21} />
        </button>
      </div>
      <button type="button" onClick={details} className="block w-full px-3 pb-1 pt-3 text-left">
        <h3 className="min-h-[37px] text-[14px] font-extrabold leading-[1.25] text-[#152038] line-clamp-2">{tour.name}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
          {hours > 0 && <span className="inline-flex items-center gap-1"><Clock size={12} className="text-[#ff6a00]" />{Number.isInteger(hours) ? hours : hours.toFixed(1)}h</span>}
          {rating > 0 && <span className="inline-flex items-center gap-1"><Star size={12} className="fill-amber-400 text-amber-400" />{rating.toFixed(1)}</span>}
        </div>
        <p className="mt-2 min-h-[31px] text-[11px] leading-[1.4] text-gray-500 line-clamp-2">
          {tour.short_description || 'Conheça lugares incríveis e descubra a região.'}
        </p>
      </button>
      <div className="mx-3 mb-3 mt-2 flex items-end justify-between gap-1 border-t border-gray-100 pt-2.5">
        <div className="min-w-0">
          {hasPrice ? (
            <>
              <p className="text-[10px] text-gray-400">Por pessoa</p>
              <p className="whitespace-nowrap text-[15px] font-extrabold text-[#f65e08]">
                {price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </>
          ) : (
            <p className="text-[12px] font-bold text-[#f65e08]">Consultar valor</p>
          )}
        </div>
        <button onClick={details} type="button" aria-label={`Ver ${tour.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#ff6a00] text-white">
          <ArrowRight size={16} />
        </button>
      </div>
    </article>
  )
}

function NewHomeBottomNav() {
  const navigate = useNavigate()
  const smallLinks = [
    { label: 'Lojinha', icon: Store, path: '/' },
    // Sem rota pública de afiliados nesta versão do app: não criar um link quebrado.
    { label: 'Afiliado', icon: Send, path: null },
    { label: 'Reservas', icon: CalendarCheck, path: '/minhas-reservas' },
    { label: 'Perfil', icon: User, path: '/perfil' },
  ]

  function button({ label, icon: Icon, path }, index) {
    const disabled = path === null
    return (
      <button
        key={label}
        type="button"
        onClick={() => path && navigate(path)}
        disabled={disabled}
        title={disabled ? 'Área de afiliados ainda não disponível neste app' : label}
        className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] ${index === 0 ? 'font-bold text-[#ff6a00]' : 'text-slate-400'} ${disabled ? 'opacity-60' : ''}`}
      >
        <Icon size={21} strokeWidth={index === 0 ? 2.5 : 1.8} />
        <span>{label}</span>
        {index === 0 && <span className="h-[3px] w-7 rounded-full bg-[#ff6a00]" />}
      </button>
    )
  }

  return (
    <nav className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[430px] -translate-x-1/2 items-end rounded-t-[24px] border-t border-orange-100 bg-white px-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-9px_24px_rgba(34,36,56,0.09)]" aria-label="Navegação principal">
      {button(smallLinks[0], 0)}
      {button(smallLinks[1], 1)}
      <button type="button" onClick={() => navigate('/eventos')} className="-mt-4 flex min-w-[82px] flex-col items-center text-[10px] font-semibold text-[#263047]" aria-label="Descubra a Vila">
        <span className="flex h-[65px] w-[65px] items-center justify-center rounded-full border-[5px] border-white bg-gradient-to-br from-[#ff9a20] to-[#ff6000] text-white shadow-lg shadow-orange-200/70">
          <Sparkles size={25} fill="white" strokeWidth={1.8} />
        </span>
        <span>Descubra</span>
      </button>
      {button(smallLinks[2], 3)}
      {button(smallLinks[3], 4)}
    </nav>
  )
}

/**
 * Nova home mobile (prévia). Compartilha catálogo, favoritos, região,
 * notificações e carrinho reais com a versão antiga. Não cria preços
 * fictícios nem inicia checkout sem que o visitante escolha o serviço.
 */
export default function HomeVisual2026() {
  const navigate = useNavigate()
  const { region, openPicker, userCoords, getServiceQuery } = useRegion()
  const { favs, toggleFav } = useFavorites()
  const { count } = useCart()
  const locationName = region?.name || 'Jericoacoara'
  const geo = getServiceQuery()
  const lat = userCoords?.lat != null ? Math.round(userCoords.lat * 100) / 100 : null
  const lon = userCoords?.lon != null ? Math.round(userCoords.lon * 100) / 100 : null

  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'home', region?.id, lat, lon],
    queryFn: () => api.getTours({ limit: 12, ...geo }),
  })
  const { data: settings } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.getPublicSettings(),
    staleTime: 5 * 60 * 1000,
  })

  const tours = Array.isArray(toursData) ? toursData : (toursData?.tours || [])
  const featured = tours.filter(t => t.is_featured)
  const visibleTours = (featured.length ? featured : tours).slice(0, 10)
  const banners = useMemo(() => {
    const slides = []
    if (settings?.home_banner_image_url) {
      slides.push({
        image: settings.home_banner_image_url,
        label: 'MAIS PROCURADO',
        headline: settings.home_banner_title || 'As melhores experiências',
        action: '/passeios',
      })
    }
    visibleTours.filter(t => t.cover_image_url).slice(0, 3).forEach(t => {
      slides.push({
        image: t.cover_image_url,
        label: 'DESCUBRA A REGIÃO',
        headline: t.name,
        action: '/passeios/' + encodeURIComponent(t.id),
      })
    })
    if (!slides.length) slides.push({
      image: null, label: 'DESCUBRA A REGIÃO', headline: 'As melhores experiências', action: '/passeios',
    })
    return slides
  }, [settings?.home_banner_image_url, settings?.home_banner_title, visibleTours])

  const [activeSlide, setActiveSlide] = useState(0)
  useEffect(() => {
    setActiveSlide(0)
  }, [region?.id])
  useEffect(() => {
    if (banners.length < 2) return
    const timer = setInterval(() => setActiveSlide(prev => (prev + 1) % banners.length), 5600)
    return () => clearInterval(timer)
  }, [banners.length])
  const hero = banners[Math.min(activeSlide, banners.length - 1)]

  return (
    <div className="min-h-dvh bg-[#fdfbf9] pb-28 text-[#14213b]">
      <header className="relative overflow-hidden bg-gradient-to-br from-[#ed4300] via-[#ff6b00] to-[#ff9b13] px-4 pb-11 pt-5 text-white">
        <div className="pointer-events-none absolute -bottom-12 -left-14 h-36 w-[120%] rotate-[-7deg] rounded-[100%] bg-white/10" />
        <div className="pointer-events-none absolute -right-14 top-8 h-44 w-44 rounded-full border-[27px] border-white/5" />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-[17px] bg-white shadow-sm">
              <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="Turiva" className="h-[43px] w-[43px] rounded-xl object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-extrabold leading-none tracking-tight">TURIVA</h1>
              <p className="mt-1 whitespace-nowrap text-[11px] font-medium text-white/95">Passeios &amp; Transfers</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => navigate('/passeios')} aria-label="Buscar passeios" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#202a40] shadow">
              <Search size={19} />
            </button>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#202a40] shadow"><NotificationBell /></span>
            <button type="button" onClick={() => navigate('/carrinho')} aria-label="Abrir carrinho" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#202a40] shadow">
              <ShoppingCart size={18} />
              {count > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{count > 9 ? '9+' : count}</span>}
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 -mt-6 px-4">
        <button type="button" onClick={openPicker} className="flex w-full items-center gap-3 rounded-[18px] border border-gray-100 bg-white px-4 py-3.5 text-left shadow-[0_6px_18px_rgba(30,36,48,0.12)]">
          <MapPin size={20} className="shrink-0 text-[#ff6a00]" />
          <span className="flex-1 truncate text-[13px] text-slate-500">Saindo de: <strong className="ml-1 text-[15px] text-[#152038]">{locationName}</strong></span>
          <ChevronRight size={18} className="text-slate-500" />
        </button>
      </div>

      <div className="space-y-5 px-4 pt-5">
        <div className="grid grid-cols-3 gap-1 rounded-[20px] border border-gray-100 bg-[#f1f3f5] p-1.5 shadow-sm" role="group" aria-label="Tipos de serviço">
          <button type="button" onClick={() => navigate('/passeios')} className="flex items-center justify-center gap-1.5 rounded-[15px] bg-white py-3 text-[12px] font-extrabold text-[#ff6a00] shadow-sm">
            <Compass size={16} /> Passeios
          </button>
          <button type="button" onClick={() => navigate('/transfers')} className="flex items-center justify-center gap-1.5 py-3 text-[12px] font-bold text-slate-600">
            <Car size={16} /> Traslados
          </button>
          <button type="button" disabled title="Em breve" className="flex items-center justify-center gap-1.5 py-3 text-[12px] font-bold text-slate-400" aria-label="Vagas, em breve">
            <ParkingSquare size={16} /> Vagas
          </button>
        </div>

        <button type="button" onClick={() => navigate('/passeios')} className="flex w-full items-center gap-3 rounded-[20px] border border-[#ffd4af] bg-gradient-to-r from-[#fff5e9] to-[#ffebda] p-3.5 text-left shadow-sm active:scale-[0.99]">
          <span className="flex h-[51px] w-[51px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ffe7c9] to-[#ffcf9d] text-[#ff6a00]"><Sparkles size={25} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-extrabold text-[#152038]">Montar meu passeio</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">Escolha o roteiro e personalize sua experiência.</span>
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ff6a00] text-white"><ChevronRight size={19} /></span>
        </button>

        <div>
          <div className="relative h-[175px] overflow-hidden rounded-[23px] bg-[#70c2d9]" style={{ background: fallbackGradient }}>
            {hero.image && <img src={hero.image} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/5" />
            <div className="relative flex h-full max-w-[72%] flex-col items-start justify-center px-4">
              <span className="mb-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-extrabold tracking-wide text-[#27364b] shadow-sm">
                <Star size={11} className="fill-amber-400 text-amber-400" /> {hero.label}
              </span>
              <p className="line-clamp-2 text-[23px] font-extrabold leading-[1.05] tracking-tight text-[#111b35]">{hero.headline}</p>
              <button type="button" onClick={() => navigate(hero.action)} className="mt-1.5 inline-flex max-w-full items-center gap-1 text-left text-[20px] font-extrabold leading-tight text-[#f65e08]">
                <span className="truncate">em {locationName}</span><ArrowRight size={17} className="shrink-0" />
              </button>
            </div>
          </div>
          {banners.length > 1 && (
            <div className="mt-2.5 flex justify-center gap-1.5" role="group" aria-label="Banners">
              {banners.map((_, idx) => (
                <button key={idx} type="button" onClick={() => setActiveSlide(idx)} aria-label={`Ver banner ${idx + 1}`} aria-current={activeSlide === idx ? 'true' : undefined}
                  className={`h-[6px] rounded-full transition-all ${activeSlide === idx ? 'w-5 bg-[#ff6a00]' : 'w-[7px] bg-slate-300'}`} />
              ))}
            </div>
          )}
        </div>

        <section aria-labelledby="favorite-tours-title">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 id="favorite-tours-title" className="flex items-center gap-2 text-[20px] font-extrabold leading-tight text-[#152038]">
                <Flame size={23} className="text-[#ff6a00]" /> Os favoritos de Jeri
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">Passeios mais escolhidos pelos viajantes</p>
            </div>
            <button type="button" onClick={() => navigate('/passeios')} className="mt-1 flex shrink-0 items-center gap-0.5 rounded-full border border-[#ffb77f] px-2.5 py-1.5 text-[10px] font-bold text-[#f65e08]">
              Ver todos <ChevronRight size={13} />
            </button>
          </div>
          {isLoading ? (
            <div className="flex h-[160px] items-center justify-center rounded-2xl bg-white text-sm text-gray-500" role="status">Carregando passeios...</div>
          ) : visibleTours.length > 0 ? (
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 scrollbar-hide">
              {visibleTours.map(tour => (
                <TourTile key={tour.id} tour={tour} isFavorite={favs.has(tour.id)} onFavorite={toggleFav} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500">Nenhum passeio disponível para esta região no momento.</p>
          )}
        </section>

        <button type="button" onClick={() => navigate('/eventos')} className="flex w-full items-center justify-between rounded-2xl border border-orange-100 bg-white px-4 py-3 text-left shadow-sm">
          <span><span className="block text-[13px] font-bold">Descubra a Vila</span><span className="block text-[11px] text-slate-500">Novidades, lugares e experiências da região</span></span>
          <ArrowRight size={17} className="text-[#ff6a00]" />
        </button>
      </div>
      <NewHomeBottomNav />
    </div>
  )
}
