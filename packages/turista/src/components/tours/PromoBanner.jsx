import { Star, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react'

// Banner de abertura da lista de passeios.
//
// A foto NÃO é fixa no código: vem da imagem do banner configurada no admin e,
// se não houver, da capa de um passeio real da região. Sem nenhuma das duas o
// banner some inteiro (o pai decide) — melhor do que uma caixa laranja vazia
// fingindo ser uma fotografia.
export default function PromoBanner({ foto, badge, titulo, destaque, descricao, beneficios = [], cta, onCta }) {
  return (
    <button
      onClick={onCta}
      className="relative w-full text-left rounded-[24px] overflow-hidden active:scale-[0.99] transition-transform duration-200 shadow-[0_4px_20px_rgba(0,0,0,0.08)]"
    >
      <div className="relative min-h-[210px] bg-gradient-to-br from-sky-500 to-teal-400">
        {foto && (
          <img src={foto} alt="" loading="lazy" decoding="async"
               className="absolute inset-0 w-full h-full object-cover" />
        )}
        {/* Véu da esquerda para a direita: o texto vive à esquerda e a foto
            continua visível à direita. As paradas são explícitas porque o
            degradê padrão do Tailwind clareia no meio do caminho e lavava a
            foto inteira — aqui ele segura até ~45% (onde o texto acaba) e
            depois abre rápido. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0.88)_45%,rgba(255,255,255,0.25)_78%,rgba(255,255,255,0)_100%)]" />

        <div className="relative p-4 pr-6">
          {badge && (
            <span className="inline-flex items-center gap-1 bg-white/90 text-gray-800 text-[9.5px] font-extrabold uppercase tracking-wide px-2.5 py-1.5 rounded-full shadow-sm">
              <Star size={10} className="fill-amber-400 text-amber-400" /> {badge}
            </span>
          )}

          <h2 className="text-[21px] font-extrabold text-gray-900 leading-tight mt-2.5 max-w-[74%]">
            {titulo}
            {destaque && (
              <>
                <br />
                <span className="font-giro text-brand text-[24px] leading-tight">{destaque}</span>
              </>
            )}
          </h2>

          {descricao && (
            <p className="text-[12.5px] text-gray-600 leading-snug mt-2 max-w-[68%]">{descricao}</p>
          )}

          {beneficios.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 max-w-[72%]">
              {beneficios.map((b, i) => (
                <span key={b} className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-gray-700 leading-tight">
                  {i === 0
                    ? <ShieldCheck size={13} className="text-gray-500 shrink-0" />
                    : <CheckCircle2 size={13} className="text-gray-500 shrink-0" />}
                  {b}
                </span>
              ))}
            </div>
          )}

          {cta && (
            <span className="inline-flex items-center gap-1.5 bg-gray-900 text-white text-[12.5px] font-bold px-4 py-2.5 rounded-full mt-3.5">
              {cta} <ArrowRight size={13} />
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
