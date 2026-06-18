import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

// ID do build atual (injetado pelo Vite no build de produção)
// eslint-disable-next-line no-undef
const CURRENT_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

const POLL_MS    = 60_000  // checa a cada 60s
const DISMISS_KEY = 'giro_update_dismissed'

/**
 * Detecta nova versão do app em produção e mostra um aviso amigável
 * "Nova versão disponível — Atualizar".
 *
 * Por que: o site é hospedado no GitHub Pages e os navegadores agarram o
 * JS antigo com cache HTTP, fazendo o usuário ver uma versão obsoleta.
 * Aqui buscamos /version.json a cada minuto e, se o buildId mudou em
 * relação ao que está rodando, oferecemos recarregar.
 */
export default function UpdatePrompt() {
  const [latest, setLatest]       = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return // só em produção
    let cancelled = false

    async function check() {
      try {
        const url = `${import.meta.env.BASE_URL || '/'}version.json?t=${Date.now()}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.buildId) setLatest(String(data.buildId))
      } catch { /* offline: tenta de novo no próximo ciclo */ }
    }

    check()
    const id = setInterval(check, POLL_MS)
    // Quando o usuário volta pra aba, checa também
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const hasUpdate = latest && CURRENT_BUILD !== 'dev' && latest !== CURRENT_BUILD
  const reallyDismissed = dismissed || (latest && sessionStorage.getItem(DISMISS_KEY) === latest)

  if (!hasUpdate || reallyDismissed) return null

  function reload() {
    // Cache-buster + reload duro
    const u = new URL(window.location.href)
    u.searchParams.set('v', String(latest))
    window.location.replace(u.toString())
  }

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, latest)
    setDismissed(true)
  }

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-20 lg:bottom-6 z-[100] w-[min(380px,calc(100%-24px))] bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2">
      <div className="w-9 h-9 rounded-xl bg-brand/20 flex items-center justify-center shrink-0">
        <RefreshCw size={16} className="text-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight">Nova versão disponível</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Atualize para ver as últimas melhorias.</p>
      </div>
      <button
        onClick={reload}
        className="bg-brand hover:bg-brand-600 text-white text-[12px] font-bold px-3 py-1.5 rounded-xl shrink-0"
      >
        Atualizar
      </button>
      <button
        onClick={dismiss}
        aria-label="Adiar"
        className="text-gray-500 hover:text-gray-300 shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
}
