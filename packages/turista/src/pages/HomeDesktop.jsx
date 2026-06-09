import { useNavigate, Link } from 'react-router-dom'
import { useRegion } from '../contexts/RegionContext'
import {
  Star, Clock, Heart, ArrowRight, Compass, Car, Calendar, Users,
  ShieldCheck, BadgeCheck, MapPin, Zap,
} from 'lucide-react'

const fmtPrice = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

const TRUST = [
  { icon: ShieldCheck, title: 'Cancelamento grátis',   desc: 'Até 24h antes' },
  { icon: BadgeCheck,  title: 'Melhor preço garantido', desc: 'Reserve com segurança' },
  { icon: Star,        title: 'Avaliações reais',        desc: 'De quem já foi' },
  { icon: MapPin,      title: 'Atendimento local',       desc: 'Especialistas em Jeri' },
]

const STEPS = [
  { n: 1, title: 'Escolha sua experiência', desc: 'Selecione o passeio ou transfer ideal' },
  { n: 2, title: 'Configure os detalhes',   desc: 'Informe a data, horário e passageiros' },
  { n: 3, title: 'Reserve e confirme',       desc: 'Pagamento seguro e confirmação imediata' },
  { n: 4, title: 'Aproveite Jericoacoara',   desc: 'Viva momentos inesquecíveis!' },
]

function TourCard({ tour, isFav, onToggleFav }) {
  const navigate = useNavigate()
  const badge    = Array.isArray(tour.tags) && tour.tags.length ? tour.tags[0] : null
  const price    = Number(tour.shared_price_per_person || 0)

  return (
    <div
      onClick={() => navigate('/passeios', { state: { selectedId: tour.id } })}
      className="group cursor-pointer bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
    >
      <div className="relative h-44 overflow-hidden">
        {tour.cover_image_url
          ? <img src={tour.cover_image_url} alt={tour.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          : <div className="w-full h-full bg-gradient-to-br from-orange-400 to-amber-300 flex items-center justify-center"><Zap size={32} className="text-white/30" /></div>}
        {badge && (
          <span className="absolute top-3 left-3 bg-brand text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">{badge}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(tour.id) }}
          className="absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center transition-colors"
        >
          <Heart size={15} className={isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
        </button>
      </div>
      <div className="p-4">
        <p className="font-bold text-gray-900 text-[15px] leading-tight line-clamp-1">{tour.name}</p>
        <div className="flex items-center gap-3 text-[12px] text-gray-500 mt-1.5">
          {tour.rating_average > 0 && (
            <span className="flex items-center gap-1">
              <Star size={12} className="text-amber-400 fill-amber-400" />{tour.rating_average}
              {tour.rating_count ? <span className="text-gray-400">({tour.rating_count})</span> : null}
            </span>
          )}
          {tour.duration_hours && (
            <span className="flex items-center gap-1"><Clock size={12} />{tour.duration_hours}h</span>
          )}
        </div>
        {price > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <span className="text-[11px] text-gray-400">A partir de </span>
            <span className="text-brand font-extrabold text-[17px]">{fmtPrice(price)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function HomeDesktop({
  tours = [], featured = [], isLoading, favs, toggleFav,
  bannerImg = null, bannerTitle = null, bannerSubtitle = null,
}) {
  const navigate = useNavigate()
  const { region, openPicker } = useRegion()
  const list    = (featured.length ? featured : tours).slice(0, 8)
  // Prioridade: banner configurado pelo admin → imagem de um passeio → gradiente
  const heroImg = bannerImg || list.find((t) => t.cover_image_url)?.cover_image_url || null

  const SEARCH = [
    { icon: Compass,  title: 'Passeios',  desc: 'Encontre experiências', onClick: () => navigate('/passeios') },
    { icon: Car,      title: 'Transfers', desc: 'Traslados e rotas',     onClick: () => navigate('/transfers') },
    { icon: Calendar, title: 'Data',      desc: 'Selecione a data',      onClick: () => navigate('/passeios') },
    { icon: MapPin,   title: region?.name || 'Região', desc: 'Trocar região', onClick: openPicker },
  ]

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative rounded-3xl overflow-hidden min-h-[360px] flex">
        {heroImg
          ? <img src={heroImg} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-br from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/35 to-transparent" />
        <div className="relative z-10 p-12 flex flex-col justify-center max-w-xl">
          <h1 className="text-white font-display font-extrabold text-[44px] leading-[1.05]">
            {bannerTitle || <>Descubra<br />Jericoacoara</>}
          </h1>
          <p className="text-white/85 mt-4 text-[17px] leading-relaxed">
            {bannerSubtitle || 'Passeios, transfers e experiências únicas você encontra aqui.'}
          </p>
          <button
            onClick={() => navigate('/passeios')}
            className="mt-7 inline-flex items-center gap-2 bg-brand hover:bg-brand-600 text-white font-bold text-[15px] px-6 py-3.5 rounded-xl w-fit transition-colors shadow-lg shadow-brand/30"
          >
            Explorar agora <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ── Barra de busca (sobreposta) ──────────────────── */}
      <div className="relative z-20 -mt-10 mx-6 bg-white rounded-2xl shadow-xl border border-gray-100 grid grid-cols-4 divide-x divide-gray-100">
        {SEARCH.map(({ icon: Icon, title, desc, onClick }) => (
          <button
            key={title}
            onClick={onClick}
            className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left first:rounded-l-2xl last:rounded-r-2xl min-w-0"
          >
            <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
              <Icon size={17} className="text-brand" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-gray-900 truncate">{title}</p>
              <p className="text-[11px] text-gray-400 truncate">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ── Experiências em destaque ─────────────────────── */}
      <section className="mt-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-extrabold text-gray-900">Experiências em destaque</h2>
          <Link to="/passeios" className="flex items-center gap-1 text-[14px] font-semibold text-brand hover:gap-1.5 transition-all">
            Ver todos <ArrowRight size={16} />
          </Link>
        </div>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <p className="text-gray-400">Nenhum passeio disponível nesta região.</p>
        ) : (
          <div className="grid grid-cols-4 gap-5">
            {list.map((t) => (
              <TourCard key={t.id} tour={t} isFav={favs.has(t.id)} onToggleFav={toggleFav} />
            ))}
          </div>
        )}
      </section>

      {/* ── Selo de confiança ────────────────────────────── */}
      <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        {TRUST.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3 px-4 py-3">
            <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
              <Icon size={19} className="text-brand" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-gray-900 leading-tight">{title}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Como funciona ────────────────────────────────── */}
      <section className="mt-14 mb-4">
        <h2 className="text-2xl font-extrabold text-gray-900 text-center mb-8">Como funciona?</h2>
        <div className="grid grid-cols-4 gap-6">
          {STEPS.map(({ n, title, desc }) => (
            <div key={n} className="text-center px-2">
              <div className="w-14 h-14 rounded-2xl bg-brand text-white font-extrabold text-xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand/25">
                {n}
              </div>
              <p className="font-bold text-gray-900 text-[15px]">{title}</p>
              <p className="text-[12px] text-gray-500 mt-1.5 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
