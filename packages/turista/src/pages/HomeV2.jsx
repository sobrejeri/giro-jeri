import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfDay, isToday, isTomorrow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
// Layout definido pelo dono por mockup, reproduzido tela a tela. Mantida LADO A
// LADO com a home atual (ver HomeSwitcher) até a escolha sair. Usa as MESMAS
// consultas da home atual — com dado falso a comparação não valeria. Desktop
// segue no HomeDesktop; a proposta é mobile.
//
// Ordem da tela, como no mockup: topo → região → chamada → Passeios/Transfers →
// 4 atalhos → mais procurados → ofertas → próxima reserva → descubra.

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

// ── Ilustrações ─────────────────────────────────────────────────────────────
// Desenhadas em SVG, não são imagens: o mockup tem coqueiro/duna nos cartões e
// um sol riscado ao lado do título. Como arquivo seriam mais 4 downloads na
// abertura da home — em vetor pesam bytes e acompanham a cor do cartão.

function Dunas({ className = '', ...rest }) {
  return (
    <svg viewBox="0 0 200 90" className={className} fill="currentColor" aria-hidden="true" {...rest}>
      <path d="M0 90 C30 62 62 58 92 74 C120 88 150 66 200 58 L200 90 Z" opacity=".5" />
      <path d="M0 90 C40 78 70 84 108 88 L200 90 Z" opacity=".3" />
      <path d="M150 90 C150 70 152 56 156 44 L161 45 C157 58 156 72 157 90 Z" />
      <path d="M159 43 C149 33 137 31 129 35 C139 31 151 35 159 41 Z" />
      <path d="M159 43 C169 33 181 33 188 38 C179 33 167 35 159 41 Z" />
      <path d="M159 42 C155 31 147 23 139 21 C149 25 156 33 159 41 Z" />
      <path d="M159 42 C164 31 173 25 181 23 C171 27 163 34 160 41 Z" />
    </svg>
  )
}

function SolRiscado({ className = '' }) {
  return (
    <svg viewBox="0 0 92 58" className={className} fill="none" stroke="currentColor"
         strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M25 47a21 21 0 0 1 42 0" />
      <path d="M9 47h74" />
      <path d="M46 15V6M27 21l-6-7M65 21l6-7M13 32l-8-4M79 32l8-4" />
    </svg>
  )
}

function BuggyDoodle({ className = '' }) {
  return (
    <svg viewBox="0 0 120 74" className={className} aria-hidden="true">
      <ellipse cx="60" cy="66" rx="54" ry="6" className="fill-orange-100" />
      <path d="M20 54h82l-7-17H79L69 24H45L35 37H23z" className="fill-orange-400" />
      <path d="M46 28h22l6 9H40z" className="fill-orange-200" />
      <circle cx="38" cy="55" r="11" className="fill-gray-800" />
      <circle cx="38" cy="55" r="4" className="fill-orange-200" />
      <circle cx="88" cy="55" r="11" className="fill-gray-800" />
      <circle cx="88" cy="55" r="4" className="fill-orange-200" />
    </svg>
  )
}

// ── Peças da tela ───────────────────────────────────────────────────────────

function CardDestaque({ tour, fav, onFav, onOpen }) {
  const { valor, selo } = precoDe(tour)
  const nota  = Number(tour.rating_average) || null
  const avals = Number(tour.rating_count) || null
  const dur   = fmtDuracao(tour.duration_hours)
  const tag   = Array.isArray(tour.tags) ? tour.tags[0] : null

  return (
    <button
      onClick={onOpen}
      // Largura parcial: o mockup mostra dois cartões inteiros e um pedaço do
      // terceiro, deixando claro que rola para o lado. O mínimo em px evita que
      // em telas estreitas o cartão fique menor do que o texto comporta.
      className="snap-start shrink-0 w-[46%] min-w-[162px] text-left bg-white rounded-2xl overflow-hidden shadow-sm active:scale-[0.99] transition-transform"
    >
      <div className={`relative h-[104px] bg-gradient-to-br ${gradOf(tour.id)}`}>
        {tour.cover_image_url && (
          <img src={tour.cover_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
        {tour.is_featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-brand text-white text-[9px] font-bold px-2 py-1 rounded-full">
            <Flame size={10} /> MAIS VENDIDO
          </span>
        )}
        <span
          onClick={(e) => { e.stopPropagation(); onFav?.() }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center"
        >
          <Heart size={13} className={fav ? 'fill-brand text-brand' : 'text-gray-400'} />
        </span>
      </div>

      <div className="p-2.5">
        {/* Linha de confiança: nota + nº de avaliações à esquerda, duração à direita */}
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1 min-w-0">
            {nota ? (
              <>
                <Star size={11} className="fill-amber-400 text-amber-400 shrink-0" />
                <span className="text-[11.5px] font-bold text-gray-900">{nota.toFixed(1).replace('.', ',')}</span>
                {avals ? <span className="text-[10.5px] text-gray-400">({avals})</span> : null}
              </>
            ) : (
              <span className="text-[10.5px] text-gray-400">Novo</span>
            )}
          </span>
          {dur && (
            <span className="flex items-center gap-0.5 text-[10.5px] text-gray-500 shrink-0">
              <Clock size={10} /> {dur}
            </span>
          )}
        </div>

        <div className="flex items-start gap-1 mt-1.5">
          <p className="text-[12.5px] font-extrabold text-gray-900 leading-tight truncate flex-1 min-w-0">
            {tour.name}
          </p>
          {/* Etiqueta miúda de propósito: no celular o cartão tem ~185pt e, com
              ela maior, sobrava tão pouco que o nome virava "Extrem…". Nome
              inteiro vale mais do que etiqueta grande. Sem max-w: a largura
              percentual reservava espaço mesmo quando a etiqueta era curta. */}
          {tag && (
            <span className="shrink-0 text-[8px] font-bold uppercase text-brand border border-brand/40 px-1 py-[3px] rounded-full leading-none">
              {tag}
            </span>
          )}
        </div>

        {tour.short_description && (
          <p className="text-[11px] text-gray-500 leading-snug mt-1 line-clamp-2">{tour.short_description}</p>
        )}

        <p className="text-[9.5px] text-gray-400 leading-none mt-2">{valor ? 'A partir de' : ' '}</p>
        <div className="flex items-center justify-between gap-1 mt-1">
          <p className="text-[16px] font-extrabold text-gray-900 leading-none">{valor || 'Sob consulta'}</p>
          {selo && (
            <span className="shrink-0 text-[9px] font-bold text-brand bg-brand/10 px-1.5 py-1 rounded-full leading-none">
              {selo}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// Atalho quadrado do mockup: quatro numa linha, ícone em cima e legenda embaixo.
function Atalho({ icon: Icon, label, cor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm h-[68px] flex flex-col items-center justify-center gap-1.5 px-0.5 active:scale-95 transition-transform"
    >
      <Icon size={21} className={cor} strokeWidth={2} />
      {/* Sem truncate: em tela estreita "Mais vendidos" virava "Mais vendid…". */}
      <span className="text-[9.5px] font-semibold text-gray-700 leading-tight text-center">
        {label}
      </span>
    </button>
  )
}

// Quadro do "Descubra": foto de fundo com véu escuro, ícone em bolha branca no
// alto e legenda embaixo. A foto é opcional — enquanto não houver arquivo, o
// degradê fica no lugar dela (o <img> se esconde sozinho se não carregar).
function TileDescubra({ icon: Icon, label, foto, tom, cor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative h-[74px] rounded-2xl overflow-hidden active:scale-95 transition-transform"
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${tom}`} />
      {foto && (
        <img
          src={foto}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/5" />
      <span className="absolute top-1.5 left-1.5 w-[26px] h-[26px] rounded-full bg-white/95 flex items-center justify-center">
        <Icon size={13} className={cor} strokeWidth={2.2} />
      </span>
      <span className="absolute bottom-1.5 left-1.5 right-1 text-white text-[9.5px] font-bold leading-tight text-left">
        {label}
      </span>
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
  const primeiroNome = nomeRegiao.split(' ')[0]
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

  const base = import.meta.env.BASE_URL

  return (
    <>
      <div className="hidden lg:block"><HomeDesktop /></div>

      <div className="lg:hidden min-h-screen bg-[#F7F8FA] pb-28">
        {/* ── Topo ───────────────────────────────────────────── */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <img src={base + 'logo-icon.jpeg'} alt="" className="w-11 h-11 rounded-2xl shrink-0" />
              <div className="min-w-0">
                {/* Espaçamento menor entre letras: com tracking largo o "I" some
                    no meio e a marca parecia ler "TURVA". */}
                <p className="font-giro font-bold text-[20px] text-gray-900 leading-none tracking-[0.02em]">TURIVA</p>
                <p className="text-[12px] text-gray-500 leading-none mt-1">Passeios &amp; Transfers</p>
              </div>
            </div>
            <NotificationBell />
          </div>

          {/* Região como pastilha: no mockup ela é um botão com corpo próprio,
              não um texto solto — é o filtro que manda em tudo abaixo. */}
          <button
            onClick={openPicker}
            className="mt-3.5 inline-flex items-center gap-2 bg-white rounded-full pl-3 pr-3.5 py-2.5 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors max-w-full"
          >
            <MapPin size={15} className="text-brand shrink-0" />
            <span className="text-[13.5px] text-gray-500 shrink-0">Saindo de:</span>
            <span className="text-[13.5px] font-bold text-gray-900 truncate">{nomeRegiao}</span>
            <ChevronDown size={15} className="text-gray-400 shrink-0" />
          </button>
        </div>

        <div className="px-4 pt-5 space-y-5">
          {/* ── Chamada ──────────────────────────────────────── */}
          {/* O recuo à direita é só no título — o sol fica na altura dele. Na
              linha de apoio o recuo faria a frase quebrar em duas. */}
          <div className="relative">
            <h1 className="text-[20px] font-extrabold text-gray-900 leading-tight pr-[68px]">
              Vamos explorar {primeiroNome}? 🌴
            </h1>
            <p className="text-[13px] text-gray-500 mt-1 leading-snug">
              Encontre passeios e transfers com operadores locais.
            </p>
            <SolRiscado className="absolute -top-1 right-0 w-[58px] text-brand/70" />
          </div>

          {/* ── 1ª prioridade: Passeios / Transfers ─────────── */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/passeios')}
              className="relative h-[132px] rounded-3xl overflow-hidden bg-gradient-to-br from-brand to-orange-400 p-3.5 text-left active:scale-[0.98] transition-transform"
            >
              {/* A silhueta fica presa à metade de baixo: subindo mais, o branco
                  passa por trás do título e o texto perde contraste. */}
              <Dunas className="absolute bottom-0 right-0 w-[85%] h-[55%] text-white/20" preserveAspectRatio="none" />
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                  <Car size={21} className="text-white" />
                </div>
                <p className="text-white text-[18px] font-extrabold mt-3 leading-none">Passeios</p>
                <p className="text-white/85 text-[11px] mt-1.5 leading-snug pr-8">Buggy, lagoas, pôr do sol</p>
              </div>
              <span className="absolute bottom-3.5 right-3.5 w-7 h-7 rounded-full bg-white flex items-center justify-center">
                <ChevronRight size={15} className="text-brand" strokeWidth={2.5} />
              </span>
            </button>

            <button
              onClick={() => navigate('/transfers')}
              className="relative h-[132px] rounded-3xl overflow-hidden bg-gradient-to-br from-sky-800 to-blue-500 p-3.5 text-left active:scale-[0.98] transition-transform"
            >
              <Dunas className="absolute bottom-0 right-0 w-[85%] h-[55%] text-white/15" preserveAspectRatio="none" />
              <div className="relative">
                <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                  <Bus size={21} className="text-white" />
                </div>
                <p className="text-white text-[18px] font-extrabold mt-3 leading-none">Transfers</p>
                <p className="text-white/85 text-[11px] mt-1.5 leading-snug pr-8">Aeroporto, hotéis e rotas</p>
              </div>
              <span className="absolute bottom-3.5 right-3.5 w-7 h-7 rounded-full bg-white flex items-center justify-center">
                <ChevronRight size={15} className="text-sky-700" strokeWidth={2.5} />
              </span>
            </button>
          </div>

          {/* ── Atalhos ──────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-2.5">
            <Atalho icon={Flame}  cor="text-brand"        label="Mais vendidos"
                    onClick={() => navigate('/passeios', { state: { featured: true } })} />
            <Atalho icon={Sun}    cor="text-orange-400"   label="Para hoje"
                    onClick={() => navigate('/passeios', { state: { dateIso: hoje } })} />
            <Atalho icon={Sunset} cor="text-orange-500"   label="Pôr do sol"
                    onClick={() => navigate('/passeios', { state: { tag: 'pôr do sol' } })} />
            <Atalho icon={Waves}  cor="text-sky-500"      label="Lagoas"
                    onClick={() => navigate('/passeios', { state: { tag: 'lagoa' } })} />
          </div>

          {/* ── 2ª prioridade: Mais procurados ──────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-[18px] font-extrabold text-gray-900">Mais procurados</h2>
              <button onClick={() => navigate('/passeios')} className="flex items-center gap-1 text-[13px] font-bold text-brand">
                Ver todos <ArrowRight size={14} />
              </button>
            </div>

            {isLoading ? (
              <div className="flex gap-3 overflow-hidden">
                <div className="shrink-0 w-[46%] min-w-[162px] h-[250px] bg-white rounded-2xl shadow-sm animate-pulse" />
                <div className="shrink-0 w-[46%] min-w-[162px] h-[250px] bg-white rounded-2xl shadow-sm animate-pulse" />
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

          {/* ── Ofertas ──────────────────────────────────────── */}
          {temOferta && (
            <button
              onClick={() => navigate('/passeios')}
              className="w-full relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand to-orange-400 p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
            >
              <Dunas className="absolute bottom-0 right-0 w-[45%] text-white/15" />
              <div className="relative w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Percent size={19} className="text-white" />
              </div>
              <div className="relative flex-1 min-w-0">
                <p className="text-white font-extrabold text-[14.5px] leading-snug">
                  {settings.home_banner_title || 'Ofertas para você'}
                </p>
                {settings.home_banner_subtitle && (
                  <p className="text-white/85 text-[11.5px] leading-snug mt-0.5 line-clamp-2">
                    {settings.home_banner_subtitle}
                  </p>
                )}
              </div>
              <span className="relative shrink-0 bg-white text-brand text-[12px] font-bold px-3.5 py-2 rounded-full">
                Ver ofertas
              </span>
            </button>
          )}

          {/* ── Contextual: próxima reserva ─────────────────── */}
          <button
            onClick={() => navigate(user ? (proxima ? '/minhas-reservas' : '/passeios') : '/login')}
            className="w-full relative overflow-hidden bg-white rounded-2xl p-3.5 shadow-sm flex items-start gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${proxima ? 'bg-emerald-100' : 'bg-violet-100'}`}>
              <CalendarCheck size={19} className={proxima ? 'text-emerald-600' : 'text-violet-600'} />
            </div>
            <div className="flex-1 min-w-0 pr-16">
              <p className="text-[14px] font-bold text-gray-900 leading-snug">
                {proxima ? 'Sua próxima reserva' : 'Sua próxima reserva'}
              </p>
              <p className="text-[12.5px] text-gray-500 mt-0.5 truncate">
                {!user ? 'Entre para ver suas reservas'
                  : proxima ? resumoReserva
                  : 'Você ainda não tem reservas.'}
              </p>
              <span className="inline-flex items-center gap-1 text-[13px] font-bold text-brand mt-1.5">
                {!user ? 'Entrar' : proxima ? 'Ver detalhes' : 'Encontre seu primeiro passeio'}
                <ArrowRight size={14} />
              </span>
            </div>
            <BuggyDoodle className="absolute bottom-1 right-2 w-[74px] opacity-90" />
          </button>

          {/* ── Conteúdo secundário: Descubra ───────────────── */}
          <div>
            <h2 className="text-[18px] font-extrabold text-gray-900 mb-2.5">Descubra {primeiroNome}</h2>
            <div className="grid grid-cols-4 gap-2.5">
              <TileDescubra icon={UtensilsCrossed} label="Restaurantes" cor="text-rose-500"
                            tom="from-rose-400 to-orange-300"    foto={base + 'descubra/restaurantes.jpg'}
                            onClick={() => navigate('/eventos')} />
              <TileDescubra icon={PartyPopper} label="Eventos" cor="text-violet-500"
                            tom="from-violet-500 to-fuchsia-400" foto={base + 'descubra/eventos.jpg'}
                            onClick={() => navigate('/eventos')} />
              <TileDescubra icon={MapPin} label="Lugares" cor="text-emerald-500"
                            tom="from-emerald-500 to-teal-300"   foto={base + 'descubra/lugares.jpg'}
                            onClick={() => navigate('/eventos')} />
              <TileDescubra icon={Lightbulb} label="Dicas" cor="text-amber-500"
                            tom="from-amber-400 to-yellow-300"   foto={base + 'descubra/dicas.jpg'}
                            onClick={() => navigate('/eventos')} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
