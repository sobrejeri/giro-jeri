import { useState } from 'react'
import { Newspaper, PlayCircle } from 'lucide-react'
import Feed from './Feed'
import Stories from './Stories'

// Conteúdo do app do turista reunido numa aba só, com sub-abas: Destaques/Stories
// e Eventos/Promoções. Cada sub-aba renderiza a tela existente em modo `embedded`
// (sem o título próprio, já que a sub-aba serve de título) — os botões de ação
// de cada uma continuam no topo.
const TABS = [
  { id: 'stories', label: 'Stories & Destaques', Icon: PlayCircle },
  { id: 'feed',    label: 'Eventos & Promoções', Icon: Newspaper },
]

export default function Conteudo() {
  const [tab, setTab] = useState('stories')
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Conteúdo</h1>
        <p className="text-sm text-gray-500">Destaques, stories, eventos e promoções exibidos no app do turista.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'stories' ? <Stories embedded /> : <Feed embedded />}
    </div>
  )
}
