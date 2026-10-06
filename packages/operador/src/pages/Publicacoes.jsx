import { useState } from 'react'
import { ImagePlus, Film } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PublicarFeed from '../components/PublicarFeed'
import StoriesOperador from '../components/StoriesOperador'

// Página do operador para gerenciar suas publicações na Descubra, em duas
// sub-abas: Publicações (feed de fotos/vídeos) e Stories & Destaques.
const TABS = [
  { id: 'feed',    label: 'Publicações',        Icon: ImagePlus },
  { id: 'stories', label: 'Stories & Destaques', Icon: Film },
]

export default function Publicacoes() {
  const { user } = useAuth()
  const [tab, setTab] = useState('feed')
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <ImagePlus size={18} className="text-brand" />
        <div>
          <h1 className="text-lg font-bold text-gray-900">Minhas publicações</h1>
          <p className="text-sm text-gray-500">Fotos, vídeos e destaques dos seus serviços, exibidos na Descubra e no seu perfil público.</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-brand text-brand' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'feed' ? <PublicarFeed meId={user?.id} /> : <StoriesOperador />}
    </div>
  )
}
