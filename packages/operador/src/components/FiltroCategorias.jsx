// Filtro de categoria reusável (chips) para as telas de catálogo do operador
// (Rotas, Passeios, Veículos). Cada tela extrai a categoria do seu jeito e
// passa a lista pronta aqui — este componente só desenha e emite a escolha.
//
// `valor === null` significa "Todas". Some sozinho quando há 0 ou 1 categoria:
// um filtro com uma opção só é ruído.
export default function FiltroCategorias({ categorias, valor, onChange }) {
  if (!categorias || categorias.length <= 1) return null

  const Chip = ({ ativo, children, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
        ativo
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )

  const total = categorias.reduce((s, c) => s + (c.count || 0), 0)

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
      <Chip ativo={valor === null} onClick={() => onChange(null)}>
        Todas{total ? ` (${total})` : ''}
      </Chip>
      {categorias.map((c) => (
        <Chip key={c.value} ativo={valor === c.value} onClick={() => onChange(c.value)}>
          {c.label}{c.count ? ` (${c.count})` : ''}
        </Chip>
      ))}
    </div>
  )
}

// Monta a lista de categorias {value, label, count} a partir dos itens, na
// ordem em que aparecem. `chave(item)` devolve [value, label] da categoria do
// item (label cai no value quando não houver um mais amigável).
export function categoriasDe(itens, chave) {
  const mapa = new Map()
  for (const it of itens || []) {
    const [value, label] = chave(it)
    const v = value || '—'
    if (!mapa.has(v)) mapa.set(v, { value: v, label: label || v, count: 0 })
    mapa.get(v).count += 1
  }
  return [...mapa.values()]
}
