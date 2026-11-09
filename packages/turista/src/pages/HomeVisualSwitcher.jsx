import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, RotateCcw, X } from 'lucide-react'
import Home from './Home'
import HomeVisual2026 from './HomeVisual2026'
import {
  closeHomeVisualPreview,
  readHomeVisualPreview,
  saveHomeVisualPreview,
} from '../lib/homeVisualPreview'

/**
 * A versão original nunca é alterada. A comparação só aparece para quem
 * recebe o link com ?turivaPreview=1 ou a ativou no próprio dispositivo.
 * Escolher no dispositivo NÃO muda a home dos demais visitantes.
 */
export default function HomeVisualSwitcher() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const { enabled, variant, isNew } = readHomeVisualPreview(search)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(search)
    if (params.get('turivaPreview') === '1') saveHomeVisualPreview(variant)
  }, [search, variant])

  function choose(next) {
    setSaved(false)
    saveHomeVisualPreview(next)
    navigate('/?turivaPreview=1&variant=' + next, { replace: true })
  }

  function exitPreview() {
    closeHomeVisualPreview()
    navigate('/', { replace: true })
  }

  return (
    <>
      {enabled && (
        <div className="relative z-[60] border-b border-orange-200 bg-[#fff7ee] px-3 py-2 lg:px-6" role="region" aria-label="Comparar versões da tela inicial">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-700">
              Prévia do redesign
            </span>
            <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-orange-100" role="group" aria-label="Escolher versão">
              <button
                type="button"
                onClick={() => choose('original')}
                aria-pressed={variant === 'original'}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${variant === 'original' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <RotateCcw size={12} className="mr-1 inline" /> Original
              </button>
              <button
                type="button"
                onClick={() => choose('novo')}
                aria-pressed={variant === 'novo'}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${variant === 'novo' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                Novo visual
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { saveHomeVisualPreview(variant); setSaved(true) }}
                className="inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2.5 py-2 text-[11px] font-bold text-orange-800"
                title="Salva apenas neste dispositivo; a escolha global será feita após a revisão"
              >
                <Check size={12} /> {saved ? 'Preferência salva' : 'Manter neste aparelho'}
              </button>
              <button type="button" onClick={exitPreview} aria-label="Sair da comparação e voltar à home atual" className="rounded-lg p-2 text-gray-600 hover:bg-white">
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
      {isNew ? (
        <>
          <div className="lg:hidden"><HomeVisual2026 /></div>
          <div className="hidden lg:block"><Home /></div>
        </>
      ) : <Home />}
    </>
  )
}
