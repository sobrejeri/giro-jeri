import { Info } from 'lucide-react'

// Botão ⓘ que mostra/esconde uma explicação da tela. Os textos longos de
// "como funciona" ficavam sempre abertos e empurravam o conteúdo para baixo;
// agora ficam recolhidos e abrem quando o admin precisa.
export default function BotaoInfo({ aberto, onClick, controla, rotulo = 'Como funciona' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={aberto}
      aria-controls={controla}
      aria-label={rotulo}
      title={rotulo}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full border shrink-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
        aberto ? 'border-brand/50 bg-brand/15 text-brand' : 'border-gray-700 text-gray-400 hover:text-gray-100 hover:border-gray-500'
      }`}
    >
      <Info size={17} />
    </button>
  )
}
