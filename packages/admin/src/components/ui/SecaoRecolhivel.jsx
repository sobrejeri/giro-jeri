import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Card from './Card'

// Cartão que recolhe e expande, com um resumo embaixo do título — recolhidas,
// as seções de uma tela longa cabem numa olhada só. Começa recolhida e o
// aparelho lembra como o admin deixou cada uma (é só conveniência: sem
// armazenamento, apenas começa recolhida).
//
// O conteúdo continua montado quando a seção está recolhida (só fica
// escondido): o que foi digitado e ainda não salvo não se perde ao fechar.
//
// `grupo` separa as escolhas lembradas de cada tela (ex.: 'envios',
// 'pagamentos'); `selos` são etiquetas curtas ao lado do título.
export default function SecaoRecolhivel({ grupo, id, icone: Icone, corIcone = 'text-orange-400', titulo, selos, resumo, children }) {
  const chave = `admin_${grupo}_secao_${id}`
  const corpo = `secao-${grupo}-${id}`
  const [aberta, setAberta] = useState(() => {
    try { return localStorage.getItem(chave) === '1' } catch { return false }
  })
  function alternar() {
    const nova = !aberta
    setAberta(nova)
    try { localStorage.setItem(chave, nova ? '1' : '0') } catch { /* sem armazenamento: só não lembra */ }
  }
  return (
    <Card>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberta}
        aria-controls={corpo}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 min-h-11 text-left rounded-xl hover:bg-gray-700/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      >
        <Icone size={16} className={`${corIcone} shrink-0`} />
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-gray-100">{titulo}</span>
            {selos}
          </span>
          {resumo && <span className="block text-xs text-gray-500 line-clamp-2">{resumo}</span>}
        </span>
        <span className="hidden sm:inline text-xs text-gray-500 shrink-0">{aberta ? 'Recolher' : 'Expandir'}</span>
        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />
      </button>
      <div id={corpo} hidden={!aberta} className="px-4 sm:px-5 pt-4 pb-5 space-y-3 border-t border-gray-700/60">
        {children}
      </div>
    </Card>
  )
}

// Etiqueta curta ao lado do título da seção (ex.: "PIX", "Cartão", "não salvo").
const CORES_SELO = {
  cinza:  'bg-gray-700 text-gray-300',
  ambar:  'bg-amber-500/15 text-amber-300',
  verde:  'bg-emerald-500/15 text-emerald-300',
  azul:   'bg-sky-500/15 text-sky-300',
}
export function Selo({ cor = 'cinza', children }) {
  return (
    <span className={`text-[10px] font-semibold leading-none px-1.5 py-1 rounded ${CORES_SELO[cor] || CORES_SELO.cinza}`}>
      {children}
    </span>
  )
}
