import { useState } from 'react'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'

// Menu "⋯" de ações (editar/excluir) para linhas de lista — tira os ícones
// repetidos de cada item. Fecha ao clicar fora (backdrop transparente) ou ao
// escolher uma opção. Sem onDelete, mostra só "Editar".
export default function MenuAcoes({ onEdit, onDelete, editLabel = 'Editar', deleteLabel = 'Excluir' }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-label="Ações"
        className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg">
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-9 z-20 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden py-1">
            <button onClick={() => { setAberto(false); onEdit?.() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
              <Pencil size={13} /> {editLabel}
            </button>
            {onDelete && (
              <button onClick={() => { setAberto(false); onDelete() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20">
                <Trash2 size={13} /> {deleteLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
