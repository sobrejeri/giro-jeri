import { Heart, Clock, Users, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/* ── Degradê de reserva para passeio sem foto ────────────────────────────── */
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

/* ── Dificuldade ──────────────────────────────────────────────────────────
   `difficulty_level` é texto livre no banco e foi preenchido à mão ao longo do
   tempo — há registro em inglês, em português, com e sem acento. Por isso o
   casamento é por prefixo normalizado, e o que não casar é exibido como veio
   (em cinza) em vez de sumir: dado do admin não deve desaparecer da tela. */
const semAcento = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function dificuldade(nivel, t) {
  const n = semAcento(nivel)
  if (!n) return null
  if (n.startsWith('easy') || n.startsWith('facil') || n.startsWith('leve')) {
    return { label: t('toursPg.difficulty.easy'), cor: 'bg-emerald-500', texto: 'text-gray-600' }
  }
  if (n.startsWith('mod') || n.startsWith('medi') || n.startsWith('inter')) {
    return { label: t('toursPg.difficulty.moderate'), cor: 'bg-amber-500', texto: 'text-gray-600' }
  }
  if (n.startsWith('hard') || n.startsWith('dif') || n.startsWith('pesad') || n.startsWith('avanc')) {
    return { label: t('toursPg.difficulty.hard'), cor: 'bg-rose-500', texto: 'text-gray-600' }
  }
  return { label: nivel, cor: 'bg-gray-400', texto: 'text-gray-500' }
}

const fmtPreco = (v) => `R$ ${Number(v).toLocaleString('pt-BR')}`

const fmtDuracao = (h) => {
  const n = Number(h)
  if (!n) return null
  if (n < 1) return `${Math.round(n * 60)}min`
  return Number.isInteger(n) ? `${n}h` : `${Math.floor(n)}h${String(Math.round((n % 1) * 60)).padStart(2, '0')}`
}

/* ── Preço ────────────────────────────────────────────────────────────────
   NUNCA inventa valor. No compartilhado usa o preço por pessoa do passeio; no
   privativo, o `from_price` que a API calcula como o MENOR preço de veículo
   ligado ao passeio. Sem nenhum dos dois, diz "sob consulta" — em vez de
   mostrar zero, que o cliente leria como grátis. */
function precoDe(tour, mode, t) {
  if (mode === 'shared' && tour.shared_price_per_person) {
    return { valor: fmtPreco(tour.shared_price_per_person), rotulo: t('toursPg.card.perPerson') }
  }
  if (tour.from_price) {
    return { valor: fmtPreco(tour.from_price), rotulo: t('toursPg.card.startingAt') }
  }
  if (tour.shared_price_per_person) {
    return { valor: fmtPreco(tour.shared_price_per_person), rotulo: t('toursPg.card.perPerson') }
  }
  return { valor: null, rotulo: null }
}

/* ── Etiqueta sobre a foto ────────────────────────────────────────────────
   Prioriza o `highlight_badge` definido no admin; sem ele, deduz do que o
   passeio já é (exclusivo / destaque) e, por último, usa a primeira tag. */
function etiquetaDe(tour, t) {
  if (tour.highlight_badge) return tour.highlight_badge
  if (tour.is_exclusive) return t('toursPg.card.badgeExclusive')
  if (tour.is_featured)  return t('toursPg.card.badgeBestSeller')
  const tag = Array.isArray(tour.tags) ? tour.tags[0] : null
  return tag || null
}

export default function TourCard({ tour, mode = 'private', selected, onSelect, isFav, onFav }) {
  const { t } = useTranslation()
  const { valor, rotulo } = precoDe(tour, mode, t)
  const dur  = fmtDuracao(tour.duration_hours)
  const dif  = dificuldade(tour.difficulty_level, t)
  const selo = etiquetaDe(tour, t)
  const cap  = Number(tour.max_people) || null

  return (
    // O cartão INTEIRO responde ao toque, mas não é um `role="button"`: como
    // o nome acessível vem de todo o texto de dentro, o leitor de tela
    // anunciava "Aventura Favoritar Extremo Leste 8h Moderado…" de uma vez —
    // e ainda havia um botão (favoritar) aninhado dentro de outro, o que é
    // inválido. Quem carrega o papel de botão é o NOME do passeio, abaixo.
    <div
      onClick={onSelect}
      // ~2,3 cartões na largura de um celular comum: o próximo aparece pela
      // metade e deixa claro que rola para o lado. O mínimo em px impede que em
      // telas de 360px o cartão fique menor do que o texto comporta.
      className={`snap-start shrink-0 w-[44%] min-w-[166px] max-w-[230px] cursor-pointer rounded-[22px] overflow-hidden bg-white transition-all duration-200 active:scale-[0.98] ${
        selected
          ? 'ring-2 ring-brand shadow-[0_6px_24px_rgba(255,101,0,0.18)]'
          : 'shadow-[0_4px_20px_rgba(0,0,0,0.06)]'
      }`}
    >
      {/* ── Foto ─────────────────────────────────────────── */}
      <div className={`relative aspect-[4/3] bg-gradient-to-br ${gradOf(tour.id)}`}>
        {tour.cover_image_url && (
          <img
            src={tour.cover_image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {selo && (
          <span className="absolute top-2.5 left-2.5 max-w-[75%] truncate bg-brand text-white text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">
            {selo}
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onFav?.() }}
          aria-label={t('toursPg.card.favorite')}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
        >
          <Heart
            size={15}
            className={`transition-colors duration-200 ${isFav ? 'fill-brand text-brand' : 'text-gray-500'}`}
          />
        </button>

        {selected && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 bg-brand text-white text-[10px] font-bold px-2 py-1 rounded-full">
            <Check size={11} strokeWidth={3} /> {t('toursPg.card.selected')}
          </span>
        )}
      </div>

      {/* ── Conteúdo ─────────────────────────────────────── */}
      <div className="p-3">
        {/* stopPropagation: sem isso o clique subiria para o cartão e
            dispararia onSelect duas vezes — selecionando e desmarcando na
            mesma batida. */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect?.() }}
          className="block w-full text-left"
        >
          <span className="block text-[14px] font-extrabold text-gray-900 leading-snug line-clamp-2 min-h-[2.4em]">
            {tour.name}
          </span>
        </button>

        {(dur || dif) && (
          <div className="flex items-center gap-2.5 mt-1.5">
            {dur && (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-gray-600">
                <Clock size={11} className="text-brand" /> {dur}
              </span>
            )}
            {/* min-w-0/truncate: quando `difficulty_level` traz um valor que
                não reconhecemos, ele é exibido cru — e pode ser uma frase
                ("Moderado a difícil") que empurraria a duração para fora. */}
            {dif && (
              <span className={`inline-flex items-center gap-1 min-w-0 text-[11.5px] ${dif.texto}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dif.cor}`} />
                <span className="truncate">{dif.label}</span>
              </span>
            )}
          </div>
        )}

        {tour.short_description && (
          <p className="text-[11.5px] text-gray-500 leading-snug mt-1.5 line-clamp-2">
            {tour.short_description}
          </p>
        )}

        <div className="mt-3 pt-2.5 border-t border-gray-100">
          {rotulo && <p className="text-[10px] text-gray-400 leading-none">{rotulo}</p>}
          {/* O preço nunca quebra: "R$ 1.200" partido em duas linhas ("R$" em
              cima, número embaixo) é o tipo de coisa que faz o cliente
              desconfiar do valor. Quem cede espaço é a capacidade, ao lado. */}
          {/* flex-wrap: com preço largo ("Sob consulta", "R$ 1.200") a
              capacidade não cabia ao lado e virava "12 pes…". Descer de linha
              não esconde nada; reticências em número, sim. */}
          <div className="flex flex-wrap items-end justify-between gap-x-1 gap-y-1 mt-1">
            <p className="shrink-0 whitespace-nowrap text-[16px] font-extrabold text-brand leading-none">
              {valor || t('toursPg.card.onRequest')}
            </p>
            {cap && (
              <span className="min-w-0 inline-flex items-center gap-0.5 text-[9.5px] text-gray-500 leading-none">
                <Users size={9} className="text-gray-400 shrink-0" />
                {/* "12 pessoas" e não "Até 12 pessoas": medido, a forma
                    longa pede 76px e o espaço ao lado do preço dá 64px mesmo
                    num aparelho de 430px — aparecia cortada em TODAS as
                    larguras. O ícone de pessoas já diz que é capacidade. */}
                <span className="truncate">{t('toursPg.card.capacity', { count: cap })}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
