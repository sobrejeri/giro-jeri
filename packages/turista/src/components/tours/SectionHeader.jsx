import { ArrowRight } from 'lucide-react'

// Cabeçalho de seção: ícone + título, subtítulo abaixo e um "Ver todos"
// opcional à direita. O botão só aparece quando há para onde ir — seção sem
// destino com botão morto é pior do que seção sem botão.
export default function SectionHeader({ icon: Icon, cor = 'text-brand', title, subtitle, onVerTodos, verTodosLabel }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        {/* items-start: com o título em duas linhas, centralizado o ícone
            descia para o meio e parecia solto do texto. */}
        <div className="flex items-start gap-1.5">
          {Icon && <Icon size={17} className={`${cor} shrink-0 mt-[3px]`} strokeWidth={2.4} />}
          <h2 className="text-[17.5px] font-extrabold text-gray-900 leading-tight">{title}</h2>
        </div>
        {subtitle && <p className="text-[12px] text-gray-500 mt-1 leading-snug">{subtitle}</p>}
      </div>
      {onVerTodos && (
        <button
          onClick={onVerTodos}
          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-brand/40 bg-white text-brand text-[12px] font-bold px-3 py-1.5 mt-0.5 active:scale-95 transition-transform"
        >
          {verTodosLabel} <ArrowRight size={13} />
        </button>
      )}
    </div>
  )
}
