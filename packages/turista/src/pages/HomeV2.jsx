import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfDay, addDays, isToday, isTomorrow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Star, Heart, ChevronDown, ChevronRight, ArrowRight, MapPin,
  Car, Bus, Flame, Sun, Sunrise, Sunset, Waves, Percent, Ticket,
  UtensilsCrossed, PartyPopper, Lightbulb, Clock, Plane,
} from 'lucide-react'
import { api } from '../lib/api'
import { useRegion } from '../contexts/RegionContext'
import { useAuth } from '../contexts/AuthContext'
import { useFavorites } from '../contexts/FavoritesContext'
import NotificationBell from '../components/NotificationBell'
import HomeDesktop from './HomeDesktop'

// ── Home — versão em avaliação ───────────────────────────────────────────────
// Layout proposto pelo dono, mantido LADO A LADO com a home atual (ver
// HomeSwitcher). Usa as MESMAS consultas da home atual — com dado falso a
// comparação não valeria. Desktop segue no HomeDesktop; a proposta é mobile.
//
// Ordem da tela, conforme a revisão: topo compacto → Passeios/Transfers →
// atalhos → o que fazer hoje → ofertas → mais procurados → próxima reserva →
// descubra. Ofertas subiram para antes dos destaques (antes sumiam atrás da
// navegação).

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

// Preço na home: é a principal dúvida antes do clique. Compartilhado é por
// pessoa; privativo usa o menor preço de veículo (from_price, vindo da API).
function precoDe(tour) {
  if (tour.shared_price_per_person) {
    return { valor: fmtPreco(tour.shared_price_per_person), selo: 'por pessoa' }
  }
  if (tour.from_price) return { valor: fmtPreco(tour.from_price), selo: 'privativo' }
  return { valor: null, selo: null }
}

const fmtDuracao = (h) => {
  const n = Number(h)
  if (!n) return null
  if (n < 1) return `${Math.round(n * 60)}min`
  return Number.isInteger(n) ? `${n}h` : `${Math.floor(n)}h${String(Math.round((n % 1) * 60)).padStart(2, '0')}`
}

function CardDestaque({ tour, fav, onFav, onOpen }) {
  const { valor, selo } = precoDe(tour)
  const nota = Number(tour.rating_average) || null
  const dur  = fmtDuracao(tour.duration_hours)
  const tag  = Array.isArray(tour.tags) ? tour.tags[0] : null

  return (
    <button
      onClick={onOpen}
      // 82% da largura: mostra 1 card inteiro + ~20% do próximo, deixando claro
      // que rola para o lado (antes apareciam pedaços dos dois lados).
      className="snap-start shrink-0 w-[82%] text-left bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.99] transition-transform"
    >
      <div className={`relative h-[150px] bg-gradient-to-br ${gradOf(tour.id)}`}>
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

      <div className="p-3.5">
        <p className="text-[16px] font-extrabold text-gray-900 leading-snug line-clamp-1">{tour.name}</p>

        {/* Linha de confiança: nota + duração + etiqueta */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {nota && (
            <span className="flex items-center gap-1 text-[12px] font-bold text-gray-800">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              {nota.toFixed(1).replace('.', ',')}
            </span>
          )}
          {nota && dur && <span className="text-gray-300 text-[11px]">•</span>}
          {dur && (
            <span className="flex items-center gap-1 text-[12px] text-gray-500">
              <Clock size={11} /> {dur}
            </span>
          )}
          {tag && (
            <span className="text-[10px] font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-full">{tag}</span>
          )}
        </div>

        <div className="flex items-end justify-between mt-2.5">
          <div>
            {valor && <p className="text-[10px] text-gray-400 leading-none">A partir de</p>}
            <p className="text-[19px] font-extrabold text-gray-900 leading-tight mt-0.5">
              {valor || 'Sob consulta'}
            </p>
          </div>
          {selo && (
            <span className="text-[11px] font-semibold text-gray-500 mb-0.5">{selo}</span>
          )}
        </div>
      </div>
    </button>
  )
}

// Chip horizontal: ocupa uma linha só e rola. Cartões quadrados empilhados
// gastavam altura demais para o que entregam.
function Chip({ icon: Icon, label, onClick, cor = 'text-brand' }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 flex items-center gap-1.5 bg-white border border-gray-200/80 rounded-full pl-2.5 pr-3.5 py-2 active:bg-gray-50 transition-colors"
    >
      <Icon size={14} className={cor} />
      <span className="text-[12.5px] font-semibold text-gray-700 leading-none whitespace-nowrap">{label}</span>
    </button>
  )
}

// Conteúdo secundário: cor suave própria para não competir com os cartões de
// Passeios/Transfers, mas sem virar mais uma caixa branca no meio de tantas.
function TileDescubra({ icon: Icon, label, onClick, tom }) {
  return (
    <button
      onClick={onClick}
      className={`${tom} rounded-2xl py-3 px-2 flex flex-col items-center gap-1.5 active:scale-95 transition-transform`}
    >
      <Icon size={17} strokeWidth={2} />
      <span className="text-[10.5px] font-semibold leading-none text-center">{label}</span>
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
  // A mais próxima no tempo — é a que interessa mostrar.
  const proxima = reservas
    .filter((b) => (b.service_date || '') >= hoje && b.status_commercial !== 'cancelled')
    .sort((a, b) => (a.service_date || '').localeCompare(b.service_date || ''))[0] || null

  const [lento, setLento] = useState(false)
  useEffect(() => {
    if (!isLoading) { setLento(false); return }
    const t = setTimeout(() => setLento(true), 5000)
    return () => clearTimeout(t)
  }, [isLoading])

  const nomeRegiao = region?.name || 'Jericoacoara'
  const temOferta  = !!(settings?.home_banner_title || settings?.home_banner_subtitle)

  // "Amanhã • Litoral Leste • 09:00" — informação útil no lugar de texto morto.
  const resumoReserva = (() => {
    if (!proxima) return null
    let quando = ''
    try {
      const d = parseISO(`${proxima.service_date}T12:00:00`)
      quando = isToday(d) ? 'Hoje' : isTomorrow(d) ? 'Amanhã'
             : format(d, "d 'de' MMM", { locale: ptBR })
    } catch { quando = proxima.service_date || '' }
    const nome = proxima.service_name
      || [proxima.origin_text, proxima.destination_text].filter(Boolean).join(' → ')
      || (proxima.service_type === 'transfer' ? 'Translado' : 'Passeio')
    const hora = proxima.service_time ? proxima.service_time.slice(0, 5) : null
    return [quando, nome, hora].filter(Boolean).join(' • ')
  })()

  // Data em ISO para os atalhos de "hoje / amanhã".
  const isoHoje    = format(new Date(), 'yyyy-MM-dd')
  const isoAmanha  = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  return (
    <>
      <div className="hidden lg:block"><HomeDesktop /></div>

      <div className="lg:hidden min-h-screen bg-gray-50 pb-28">
        {/* ── Topo compacto ───────────────────────────────────
            Logo + sino + região em ~35% menos altura que antes: os passeios
            precisam aparecer cedo na tela. */}
        <div className="bg-white px-4 pt-3.5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={import.meta.env.BASE_URL + 'logo-icon.jpeg'} alt="" className="w-9 h-9 rounded-xl shrink-0" />
              {/* Espaçamento menor entre letras: com tracking largo o "I" some
                  no meio e a marca parecia ler "TURVA". */}
              <p className="font-giro font-bold text-[18px] text-gray-900 leading-none tracking-[0.02em]">TURIVA</p>
            </div>
            <NotificationBell />
          </div>

          <button
            onClick={openPicker}
            className="mt-2.5 flex items-center gap-1.5 active:opacity-70"
          >
            <MapPin size={14} className="text-brand shrink-0" />
            <span className="text-[13px] text-gray-500">Saindo de:</span>
            <span className="text-[13px] font-bold text-gray-900 truncate max-w-[45vw]">{nomeRegiao}</span>
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          </button>
        </div>

        <div className="px-4 pt-4 space-y-5">
          {/* Chamada enxuta — uma linha só. A frase "passeios e transfers com
              operadores locais" saiu: os dois cartões logo abaixo já dizem
              isso, e em tela de celular cada linha aqui empurra o conteúdo. */}
          <h1 className="text-[21px] font-extrabold text-gray-900 leading-tight">
            Vamos explorar {nomeRegiao.split(' ')[0]}? 🌴
          </h1>

          {/* ── 1ª prioridade: Passeios / Transfers ─────────── */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/passeios')}
              className="relative h-[118px] rounded-2xl overflow-hidden bg-gradient-to-br from-brand to-orange-400 p-3.5 text-left active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Car size={19} className="text-white" />
              </div>
              <p className="text-white text-[16px] font-extrabold mt-2.5 leading-none">Passeios</p>
              <p className="text-white/85 text-[10.5px] mt-1 leading-snug">Buggy, lagoas, pôr do sol</p>
              <span className="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                <ChevronRight size={13} className="text-brand" />
              </span>
            </button>

            <button
              onClick={() => navigate('/transfers')}
              className="relative h-[118px] rounded-2xl overflow-hidden bg-gradient-to-br from-sky-700 to-blue-500 p-3.5 text-left active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Bus size={19} className="text-white" />
              </div>
              <p className="text-white text-[16px] font-extrabold mt-2.5 leading-none">Transfers</p>
              <p className="text-white/85 text-[10.5px] mt-1 leading-snug">Aeroporto, hotéis e rotas</p>
              <span className="absolute bottom-3 right-3 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                <ChevronRight size={13} className="text-sky-700" />
              </span>
            </button>
          </div>

          {/* ── Filtros rápidos ──────────────────────────────
              Uma fileira só. Antes eram DUAS ("Mais vendidos/Para hoje/Pôr do
              sol/Lagoas" + "Passeio hoje/amanhã/Transfer aeroporto") — com
              "Para hoje" e "Passeio hoje" fazendo a MESMA coisa. Sete botões
              empilhados comiam justamente a altura que economizamos no topo.
              "Mais vendidos" também saiu: ia para /passeios sem filtro nenhum,
              igual ao cartão Passeios e ao "Ver todos" — e o carrossel logo
              abaixo já É a lista dos mais procurados. */}
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5" style={{ scrollbarWidth: 'none' }}>
            <Chip icon={Sun}    cor="text-amber-500"  label="Hoje"
                  onClick={() => navigate('/passeios', { state: { dateIso: isoHoje } })} />
            <Chip icon={Sunrise} cor="text-rose-500"  label="Amanhã"
                  onClick={() => navigate('/passeios', { state: { dateIso: isoAmanha } })} />
            <Chip icon={Sunset} cor="text-orange-500" label="Pôr do sol"
                  onClick={() => navigate('/passeios', { state: { tag: 'pôr do sol' } })} />
            <Chip icon={Waves}  cor="text-sky-500"    label="Lagoas"
                  onClick={() => navigate('/passeios', { state: { tag: 'lagoa' } })} />
            <Chip icon={Plane}  cor="text-indigo-500" label="Aeroporto"
                  onClick={() => navigate('/transfers')} />
          </div>

          {/* ── Ofertas: subiram para antes dos destaques ───── */}
          {temOferta && (
            <button
              onClick={() => navigate('/passeios')}
              className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand to-orange-400 p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Percent size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-extrabold text-[14px] leading-snug">
                  {settings.home_banner_title || 'Ofertas para você'}
                </p>
                {settings.home_banner_subtitle && (
                  <p className="text-white/85 text-[11.5px] leading-snug mt-0.5 line-clamp-1">
                    {settings.home_banner_subtitle}
                  </p>
                )}
              </div>
              <span className="shrink-0 bg-white text-brand text-[11.5px] font-bold px-3 py-1.5 rounded-lg">Ver</span>
            </button>
          )}

          {/* ── 2ª prioridade: Mais procurados ──────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-[17px] font-extrabold text-gray-900">Mais procurados</h2>
              <button onClick={() => navigate('/passeios')} className="flex items-center gap-1 text-[12.5px] font-bold text-brand">
                Ver todos <ArrowRight size={13} />
              </button>
            </div>

            {isLoading ? (
              <div className="flex gap-3 overflow-hidden">
                <div className="shrink-0 w-[82%] h-[290px] bg-white rounded-2xl shadow-sm animate-pulse" />
              </div>
            ) : destaques.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
                <p className="text-[13px] text-gray-400">
                  {lento ? 'Carregando os passeios…' : 'Nenhum passeio disponível nesta região.'}
                </p>
              </div>
            ) : (
              <div
                className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 snap-x snap-mandatory"
                style={{ scrollbarWidth: 'none' }}
              >
                {destaques.map((tour) => (
                  <CardDestaque
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

          {/* ── Contextual: próxima reserva ─────────────────── */}
          <button
            onClick={() => navigate(user ? (proxima ? '/minhas-reservas' : '/passeios') : '/login')}
            className="w-full bg-white rounded-2xl p-3.5 shadow-sm flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${proxima ? 'bg-emerald-100' : 'bg-violet-100'}`}>
              <Ticket size={18} className={proxima ? 'text-emerald-600' : 'text-violet-600'} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-gray-900 leading-snug">
                {proxima ? 'Sua próxima reserva' : 'Minhas reservas'}
              </p>
              <p className="text-[12px] text-gray-500 mt-0.5 truncate">
                {!user ? 'Entre para ver suas reservas'
                  : proxima ? resumoReserva
                  : 'Você ainda não reservou'}
              </p>
            </div>
            <span className="shrink-0 flex items-center gap-1 text-[12.5px] font-bold text-brand">
              {!user ? 'Entrar' : proxima ? 'Ver' : 'Ver passeios'}
              <ArrowRight size={13} />
            </span>
          </button>

          {/* ── Conteúdo secundário: Descubra ───────────────── */}
          <div>
            <h2 className="text-[15px] font-bold text-gray-800 mb-2.5">Descubra {nomeRegiao.split(' ')[0]}</h2>
            <div className="grid grid-cols-4 gap-2">
              <TileDescubra icon={UtensilsCrossed} label="Restaurantes" tom="bg-rose-50 text-rose-600"       onClick={() => navigate('/eventos')} />
              <TileDescubra icon={PartyPopper}     label="Eventos"      tom="bg-violet-50 text-violet-600"   onClick={() => navigate('/eventos')} />
              <TileDescubra icon={MapPin}          label="Lugares"      tom="bg-emerald-50 text-emerald-600" onClick={() => navigate('/eventos')} />
              <TileDescubra icon={Lightbulb}       label="Dicas"        tom="bg-amber-50 text-amber-600"     onClick={() => navigate('/eventos')} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
