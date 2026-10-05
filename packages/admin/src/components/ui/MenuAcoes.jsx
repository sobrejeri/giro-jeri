import { useState } from 'react'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'

// Menu "⋯" de ações para linhas de lista — tira os ícones repetidos de cada
// item. Fecha ao clicar fora (backdrop transparente) ou ao escolher uma opção.
//
// onEdit / onDelete são os atalhos comuns (Editar / Excluir). `extras` é uma
// lista de ações adicionais entre eles: { label, onClick, danger?, icon? }.
// Tudo opcional — sem nada, o menu nem aparece.
export default function MenuAcoes({ onEdit, onDelete, extras = [], editLabel = 'Editar', deleteLabel = 'Excluir' }) {
  const [aberto, setAberto] = useState(false)
  const itens = [
    ...(onEdit ? [{ label: editLabel, onClick: onEdit, icon: <Pencil size={13} /> }] : []),
    ...extras,
    ...(onDelete ? [{ label: deleteLabel, onClick: onDelete, icon: <Trash2 size={13} />, danger: true }] : []),
  ]
  if (!itens.length) return null
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-label="Ações"
        className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg">
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-9 z-20 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden py-1">
            {itens.map((it, i) => (
              <button key={i} onClick={() => { setAberto(false); it.onClick?.() }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm ${it.danger ? 'text-red-400 hover:bg-red-900/20' : 'text-gray-200 hover:bg-gray-700'}`}>
                {it.icon}{it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
