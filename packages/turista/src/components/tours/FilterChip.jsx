// Pastilha de filtro da lista de passeios.
//
// Selecionada = contorno e texto laranja sobre branco (não fundo laranja
// cheio): o fundo cheio já é do seletor Privativo/Compartilhado logo acima, e
// repetir confunde qual dos dois manda na lista.
export default function FilterChip({ icon: Icon, label, ativo, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 active:scale-95 ${
        ativo
          ? 'bg-white text-brand border border-brand shadow-[0_2px_10px_rgba(255,101,0,0.12)]'
          : 'bg-white text-gray-700 border border-transparent shadow-[0_2px_10px_rgba(0,0,0,0.05)]'
      }`}
    >
      {Icon && <Icon size={14} className={ativo ? 'text-brand' : 'text-gray-400'} strokeWidth={2.2} />}
      {label}
    </button>
  )
}
