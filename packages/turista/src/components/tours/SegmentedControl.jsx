// Seletor Privativo / Compartilhado.
//
// A pastilha laranja é UM elemento que desliza, não duas cores trocando: com
// duas, a mudança pisca. O deslocamento é calculado pelo índice, então o
// componente aceita 2+ opções sem mudar nada aqui.
export default function SegmentedControl({ value, options, onChange, className = '' }) {
  const idx = Math.max(0, options.findIndex((o) => o.id === value))

  return (
    <div
      role="tablist"
      className={`relative flex bg-white rounded-full p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute top-1.5 bottom-1.5 rounded-full bg-brand shadow-[0_2px_8px_rgba(255,101,0,0.35)] transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 12px) / ${options.length})`,
          transform: `translateX(calc(${idx} * 100%))`,
          left: 6,
        }}
      />
      {options.map(({ id, label, icon: Icon }) => {
        const ativo = id === value
        return (
          <button
            key={id}
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(id)}
            className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-[13.5px] font-bold transition-colors duration-200 active:scale-[0.98] ${
              ativo ? 'text-white' : 'text-gray-500'
            }`}
          >
            {Icon && <Icon size={15} strokeWidth={2.2} />}
            {label}
          </button>
        )
      })}
    </div>
  )
}
