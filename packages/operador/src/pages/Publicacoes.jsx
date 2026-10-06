import { ImagePlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import PublicarFeed from '../components/PublicarFeed'

// Página dedicada do operador para gerenciar suas publicações na Descubra
// (fotos/vídeos dos serviços). Reaproveita o PublicarFeed, que já publica,
// lista "Minhas publicações" e exclui.
export default function Publicacoes() {
  const { user } = useAuth()
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <ImagePlus size={18} className="text-brand" />
        <div>
          <h1 className="text-lg font-bold text-gray-900">Minhas publicações</h1>
          <p className="text-sm text-gray-500">Fotos e vídeos dos seus serviços, exibidos na Descubra e no seu perfil público.</p>
        </div>
      </div>
      <PublicarFeed meId={user?.id} />
    </div>
  )
}
