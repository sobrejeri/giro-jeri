import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, RotateCcw, X } from 'lucide-react'
import Tours from './Tours'
import {
  clearToursVisualPreview,
  readToursVisualPreview,
  saveToursVisualPreview,
} from '../lib/toursVisualPreview'

// Prévia reversível. Salvar no aparelho NÃO altera o layout dos demais clientes.
export default function ToursVisualSwitcher() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const { enabled, variant, isNew } = readToursVisualPreview(search)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(search)
    if (params.get('turivaPreview') === '1') saveToursVisualPreview(variant)
  }, [search, variant])

  function choose(next) {
    setConfirmed(false)
    saveToursVisualPreview(next)
    navigate('/passeios?turivaPreview=1&variant=' + next, { replace: true })
  }

  function exit() {
    clearToursVisualPreview()
    navigate('/passeios', { replace: true })
  }

  return (
    <>
      {enabled && (
        <div className="relative z-[55] border-b border-orange-200 bg-[#fff8ed] px-3 py-2 lg:px-6" role="region" aria-label="Comparação de versões da Lojinha Turiva">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-orange-700">Prévia da Lojinha</span>
            <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-orange-100" role="group" aria-label="Escolher o visual">
              <button type="button" onClick={() => choose('original')} aria-pressed={variant === 'original'}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${variant === 'original' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                <RotateCcw size={12} className="mr-1 inline" /> Original
              </button>
              <button type="button" onClick={() => choose('novo')} aria-pressed={variant === 'novo'}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${variant === 'novo' ? 'bg-brand text-white' : 'text-slate-600'}`}>
                Novo visual
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => { saveToursVisualPreview(variant); setConfirmed(true) }}
                title="Salva a escolha somente neste aparelho; a publicação definitiva depende da aprovação"
                className="inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-2 text-[11px] font-bold text-orange-800">
                <Check size={12} /> {confirmed ? 'Salva' : 'Minha preferência'}
              </button>
              <button type="button" onClick={exit} aria-label="Encerrar teste e voltar à versão atual"
                className="rounded-lg p-2 text-gray-600 hover:bg-white"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}
      <Tours visual2026={isNew} />
    </>
  )
}
