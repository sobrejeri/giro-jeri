import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../lib/api'

// Seletor de municípios (regions) reutilizável — mesma mecânica do seletor do
// catálogo, mas autossuficiente (busca as regiões sozinho). Usado no cadastro
// de operador para definir de quais municípios ele recebe solicitações.
export default function MunicipiosSelector({
  value,
  onChange,
  label = 'Municípios que este operador atende',
  help = 'Só recebe solicitações destes municípios. Vazio = não recebe nenhuma.',
}) {
  const { data: regions = [] } = useQuery({
    queryKey: ['regions'],
    queryFn:  () => api.getRegions(),
    staleTime: 5 * 60 * 1000,
  })
  const selected  = value || []
  const available = regions.filter((r) => !selected.includes(r.id))

  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-2">
        {label}
        {help && <span className="ml-1 font-normal text-gray-600">({help})</span>}
      </p>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((id) => {
            const r = regions.find((x) => x.id === id)
            return (
              <span key={id} className="inline-flex items-center gap-1 bg-brand/20 text-brand text-xs font-medium px-2.5 py-1 rounded-full">
                {r?.name || 'Município'}
                <button type="button" onClick={() => onChange(selected.filter((x) => x !== id))} className="ml-0.5 text-brand/60 hover:text-brand">
                  <X size={11} />
                </button>
              </span>
            )
          })}
        </div>
      )}
      {available.length > 0 ? (
        <select
          className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-brand"
          value=""
          onChange={(e) => { if (e.target.value) onChange([...selected, e.target.value]) }}
        >
          <option value="">+ Adicionar município…</option>
          {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      ) : selected.length > 0 ? (
        <p className="text-xs text-gray-600">Todos os municípios adicionados</p>
      ) : (
        <p className="text-xs text-gray-600">Nenhum município cadastrado</p>
      )}
    </div>
  )
}
