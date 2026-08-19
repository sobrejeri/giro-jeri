import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfDay } from 'date-fns'
import {
  Star, Heart, ChevronDown, ChevronRight, ArrowRight, MapPin,
  Car, Bus, Flame, Sun, Sunset, Waves, Percent, CalendarCheck,
  UtensilsCrossed, PartyPopper, Lightbulb, Clock,
} from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useAuth } from '../contexts/AuthContext'
import { useFavorites } from '../contexts/FavoritesContext'
import NotificationBell from '../components/NotificationBell'
import HomeDesktop from './HomeDesktop'

// ── Home — versão em avaliação ───────────────────────────────────────────────
// Layout novo proposto pelo dono, mantido LADO A LADO com a home atual para
// comparação (ver components/HomeVersionSwitch.jsx). Usa exatamente as MESMAS
// consultas da home atual — nada de dado falso, senão a comparação não vale.
// Só o desktop continua reaproveitando HomeDesktop; a proposta é de tela mobile.

const GRADS = [
  'from-orange-400 to-amber-300',
  'from-sky-400 to-blue-300',
  'from-teal-400 to-emerald-300',
  'from-violet-400 to-purple-300',
]
const gradOf = (id = '') => {
  let n = 0
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i)
  return GRADS[n % GRADS.length]
}

const fmtPreco = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR')}`

// Preço "a partir de": compartilhado é por pessoa; privativo vem do veículo.
function precoDe(tour) {
  if (tour.shared_price_per_person) {
    return { valor: fmtPreco(tour.shared_price_per_person), selo: 'por pessoa' }
  }
  if (tour.from_price) return { valor: fmtPreco(tour.from_price), selo: 'privativo' }
  return { valor: null, selo: tour.is_private_enabled === false ? 'por pessoa' : 'privativo' }
}

function CardServico({ tour, fav, onFav, onOpen }) {
  const { valor, selo } = precoDe(tour)
  const nota = Number(tour.rating_average) || null
  const avaliacoes = Number(tour.rating_count) || 0
  const horas = tour.duration_hours ? `${Number(tour.duration_hours)}h` : null

  return (
    <button
      onClick={onOpen}
      className="shrink-0 w-[248px] text-left bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.99] transition-transform"
    >
      <div className={`relative h-[132px] bg-gradient-to-br ${gradOf(tour.id)}`}>
        {tour.cover_image_url && (
          <img src={tour.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
        {tour.is_featured && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 bg-brand text-white text-[10px] font-bold px-2 py-1 rounded-full">
            <Flame size={11} /> MAIS VENDIDO
          </span>
        )}
        <span
          onClick={(e) => { e.stopPropagation(); onFav?.() }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center"
        >
          <Heart size={15} className={fav ? 'fill-brand text-brand' : 'text-gray-400'} />
        </span>
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          {nota ? (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-gray-700">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              {nota.toFixed(1)}
              {avaliacoes > 0 && <span className="text-gray-400 font-normal">({avaliacoes})</span>}
            </span>
          ) : <span />}
          {horas && (
            <span className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock size={11} /> {horas}
            </span>
          )}
        </div>

        <p className="text-[15px] font-bold text-gray-900 leading-snug line-clamp-1">{tour.name}</p>
        {tour.short_description && (
          <p className="text-[12px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{tour.short_description}</p>
        )}

        <div className="flex items-end justify-between mt-2.5">
          <div>
            {valor && <p className="text-[10px] text-gray-400 leading-none">A partir de</p>}
            <p className="text-[17px] font-extrabold text-gray-900 leading-tight mt-0.5">
              {valor || 'Sob consulta'}
            </p>
          </div>
          <span className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-1 rounded-full">{selo}</span>
        </div>
      </div>
    </button>
  )
}

function Atalho({ icon: Icon, label, onClick, cor = 'text-brand' }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[78px] bg-white rounded-2xl py-3.5 px-2 shadow-sm flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
    >
      <Icon size={22} className={cor} />
      <span className="text-[11px] font-semibold text-gray-700 leading-none">{label}</span>
    </button>
  )
}

function TileDescubra({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative h-[92px] rounded-2xl overflow-hidden bg-gradient-to-br from-gray-700 to-gray-900 active:scale-[0.98] transition-transform"
    >
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center">
        <Icon size={15} className="text-brand" />
      </div>
      <span className="absolute bottom-2.5 left-2.5 text-white text-[13px] font-bold">{label}</span>
    </button>
  )
}

export default function HomeV2() {
  const navigate = useNavigate()
  const { region, openPicker, userCoords, getServiceQuery } = useRegion()
  const { user } = useAuth()
  const { favs, toggleFav } = useFavorites()

  const geo = getServiceQuery()
  const coarseLat = userCoords?.lat != null ? Math.round(userCoords.lat * 100) / 100 : null
  const coarseLon = userCoords?.lon != null ? Math.round(userCoords.lon * 100) / 100 : null

  // MESMAS consultas da home atual — a comparação precisa ser justa.
  const { data: toursData, isLoading } = useQuery({
    queryKey: ['tours', 'home', region?.id, coarseLat, coarseLon],
    queryFn:  () => api.getTours({ limit: 12, ...geo }),
  })
  const tours = toursData?.tours || toursData || []
  const destaques = (tours.filter((t) => t.is_featured).length > 0
    ? tours.filter((t) => t.is_featured) : tours).slice(0, 10)

  const { data: settings } = useQuery({
    queryKey: ['public-settings'],
    queryFn:  () => api.getPublicSettings(),
    staleTime: 5 * 60 * 1000,
  })

  const { data: myBookingsRaw } = useQuery({
    queryKey: ['home-bookings'],
    queryFn:  () => api.getMyBookings(),
    enabled:  !!user,
    staleTime: 60_000,
  })
  const hoje = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const reservas = Array.isArray(myBookingsRaw) ? myBookingsRaw : (myBookingsRaw?.data || [])
  const proximas = reservas.filter(
    (b) => (b.service_date || '') >= hoje && b.status_commercial !== 'cancelled',
  )

  // Cold start do Render: avisa que o servidor está acordando.
  const [lento, setLento] = useState(false)
  useEffect(() => {
    if (!isLoading) { setLento(false); return }
    const t = setTimeout(() => setLento(true), 5000)
    return () => clearTimeout(t)
  }, [isLoading])

  const nomeRegiao = region?.name || 'Jericoacoara'

  return (
    <>
      {/* Desktop continua na tela atual — a proposta é de mobile */}
      <div className="hidden lg:block"><HomeDesktop /></div>

      <div className="lg:hidden min-h-screen bg-gray-50 pb-28">
        {/* ── Cabeçalho ───────────────────────────────────────── */}
        <div className="bg-white px-4 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-11 h-11 rounded-2xl shrink-0" />
              <div>
                <p className="font-giro font-bold text-[19px] text-gray-900 leading-tight tracking-[0.08em]">TURIVA</p>
                <p className="text-[12px] text-gray-400 leading-none mt-0.5">Passeios &amp; Transfers</p>
              </div>
            </div>
            <NotificationBell />
          </div>

          {/* Região */}
          <button
            onClick={openPicker}
            className="mt-4 w-full flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 h-12 shadow-sm active:bg-gray-50"
          >
            <MapPin size={16} className="text-brand shrink-0" />
            <span className="text-[14px] text-gray-500">Saindo de:</span>
            <span className="text-[14px] font-bold text-gray-900 truncate">{nomeRegiao}</span>
            <ChevronDown size={16} className="text-gray-400 ml-auto shrink-0" />
          </button>
        </div>

        <div className="px-4 pt-5 space-y-6">
          {/* ── Chamada ─────────────────────────────────────── */}
          <div>
            <h1 className="text-[24px] font-extrabold text-gray-900 leading-tight">
              Vamos explorar {nomeRegiao}? 🌴
            </h1>
            <p className="text-[14px] text-gray-500 mt-1 leading-snug">
              Encontre passeios e transfers com operadores locais.
            </p>
          </div>

          {/* ── Dois caminhos principais ────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/passeios')}
              className="relative h-[132px] rounded-2xl overflow-hidden bg-gradient-to-br from-brand to-orange-400 p-4 text-left active:scale-[0.98] transition-transform"
            >
              <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                <Car size={20} className="text-white" />
              </div>
              <p className="text-white text-[17px] font-extrabold mt-3 leading-none">Passeios</p>
              <p className="text-white/85 text-[11px] mt-1 leading-snug">Buggy, lagoas, pôr do sol</p>
              <span className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-white flex items-center justify-center">
                <ChevronRight size={15} className="text-brand" />
              </span>
            </button>

            <button
              onClick={() => navigate('/transfers')}
              className="relative h-[132px] rounded-2xl overflow-hidden bg-gradient-to-br from-sky-700 to-blue-500 p-4 text-left active:scale-[0.98] transition-transform"
            >
              <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                <Bus size={20} className="text-white" />
              </div>
              <p className="text-white text-[17px] font-extrabold mt-3 leading-none">Transfers</p>
              <p className="text-white/85 text-[11px] mt-1 leading-snug">Aeroporto, hotéis e rotas</p>
              <span className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-white flex items-center justify-center">
                <ChevronRight size={15} className="text-sky-700" />
              </span>
            </button>
          </div>

          {/* ── Atalhos ─────────────────────────────────────── */}
          <div className="flex gap-2.5">
            <Atalho icon={Flame}  label="Mais vendidos" onClick={() => navigate('/passeios')} />
            <Atalho icon={Sun}    label="Para hoje"     onClick={() => navigate('/passeios')} cor="text-amber-500" />
            <Atalho icon={Sunset} label="Pôr do sol"    onClick={() => navigate('/passeios')} cor="text-orange-500" />
            <Atalho icon={Waves}  label="Lagoas"        onClick={() => navigate('/passeios')} cor="text-sky-500" />
          </div>

          {/* ── Mais procurados ─────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[17px] font-extrabold text-gray-900">Mais procurados</h2>
              <button onClick={() => navigate('/passeios')} className="flex items-center gap-1 text-[13px] font-bold text-brand">
                Ver todos <ArrowRight size={14} />
              </button>
            </div>

            {isLoading ? (
              <div className="flex gap-3 overflow-hidden">
                {[0, 1].map((i) => (
                  <div key={i} className="shrink-0 w-[248px] h-[264px] bg-white rounded-2xl shadow-sm animate-pulse" />
                ))}
              </div>
            ) : destaques.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <p className="text-[13px] text-gray-400">
                  {lento ? 'Carregando os passeios…' : 'Nenhum passeio disponível nesta região.'}
                </p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                {destaques.map((tour) => (
                  <CardServico
                    key={tour.id}
                    tour={tour}
                    fav={favs?.includes?.(tour.id)}
                    onFav={() => toggleFav?.(tour.id)}
                    onOpen={() => navigate('/passeios', { state: { selectedId: tour.id } })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Faixa promocional (do admin) ────────────────── */}
          {(settings?.home_banner_title || settings?.home_banner_subtitle) && (
            <button
              onClick={() => navigate('/passeios')}
              className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand to-orange-400 p-4 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Percent size={20} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-extrabold text-[15px] leading-snug">
                  {settings.home_banner_title || 'Ofertas da semana'}
                </p>
                {settings.home_banner_subtitle && (
                  <p className="text-white/85 text-[12px] leading-snug mt-0.5">{settings.home_banner_subtitle}</p>
                )}
              </div>
              <span className="shrink-0 bg-white text-brand text-[12px] font-bold px-3 py-2 rounded-xl">Ver</span>
            </button>
          )}

          {/* ── Próxima reserva ─────────────────────────────── */}
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <CalendarCheck size={20} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-gray-900 leading-snug">Sua próxima reserva</p>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {!user ? 'Entre para ver suas reservas.'
                  : proximas.length > 0
                    ? `${proximas.length} reserva(s) a caminho.`
                    : 'Você ainda não tem reservas.'}
              </p>
              <button
                onClick={() => navigate(user ? '/minhas-reservas' : '/login')}
                className="flex items-center gap-1 text-[13px] font-bold text-brand mt-1.5"
              >
                {!user ? 'Entrar' : proximas.length > 0 ? 'Ver reservas' : 'Encontre seu primeiro passeio'}
                <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* ── Descubra ────────────────────────────────────── */}
          <div>
            <h2 className="text-[17px] font-extrabold text-gray-900 mb-3">Descubra {nomeRegiao}</h2>
            <div className="grid grid-cols-4 gap-2.5">
              <TileDescubra icon={UtensilsCrossed} label="Restaurantes" onClick={() => navigate('/eventos')} />
              <TileDescubra icon={PartyPopper}     label="Eventos"      onClick={() => navigate('/eventos')} />
              <TileDescubra icon={MapPin}          label="Lugares"      onClick={() => navigate('/eventos')} />
              <TileDescubra icon={Lightbulb}       label="Dicas"        onClick={() => navigate('/eventos')} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
