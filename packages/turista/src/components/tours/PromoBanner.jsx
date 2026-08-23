import { Star, ArrowRight } from 'lucide-react'

// Faixa de abertura da lista de passeios.
//
// É ILUSTRATIVA: não filtra nada nem leva a lugar novo — só dá cara de destino
// à tela e devolve a lista completa ao ser tocada. Por isso é baixa. Antes
// ocupava ~210px com descrição, dois selos de confiança e um botão preto
// grande; numa tela cujo conteúdo real são os passeios, isso empurrava o
// primeiro cartão para fora da dobra em troca de nada. Os selos de confiança
// continuam existindo, na faixa do rodapé, onde não custam altura útil.
//
// A FOTO não é fixa no código: vem da imagem configurada no admin e, na falta
// dela, da capa de um passeio real da região. Sem nenhuma das duas o pai não
// renderiza a faixa — melhor do que uma caixa colorida fingindo ser fotografia.
export default function PromoBanner({ foto, badge, titulo, destaque, onCta }) {
  return (
    <button
      onClick={onCta}
      className="relative w-full text-left rounded-[22px] overflow-hidden active:scale-[0.99] transition-transform duration-200 shadow-[0_4px_20px_rgba(0,0,0,0.07)]"
    >
      <div className="relative h-[116px] bg-gradient-to-br from-sky-500 to-teal-400">
        {foto && (
          <img src={foto} alt="" loading="lazy" decoding="async"
               className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Véu da esquerda para a direita com paradas explícitas: segura até
            ~48% (onde o texto acaba) e depois abre rápido, para a foto
            aparecer de verdade. O degradê padrão do Tailwind clareia no meio
            do caminho e lavava a imagem inteira. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.9)_48%,rgba(255,255,255,0.25)_80%,rgba(255,255,255,0)_100%)]" />

        <div className="relative h-full px-3.5 py-3 flex flex-col justify-center">
          {badge && (
            <span className="self-start inline-flex items-center gap-1 bg-white/90 text-gray-700 text-[8.5px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full shadow-sm">
              <Star size={9} className="fill-amber-400 text-amber-400" /> {badge}
            </span>
          )}

          <p className="text-[15px] font-extrabold text-gray-900 leading-tight mt-1.5 max-w-[60%]">
            {titulo}
          </p>

          {destaque && (
            <span className="inline-flex items-center gap-1 font-giro text-brand text-[17px] leading-tight mt-0.5">
              {destaque} <ArrowRight size={13} className="mt-[3px]" />
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
