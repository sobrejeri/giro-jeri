import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

// eslint-disable-next-line no-undef
const CURRENT_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
const POLL_MS = 60_000
const DISMISS_KEY = 'giro_update_dismissed'

export default function UpdatePrompt() {
  const [latest, setLatest] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let cancelled = false
    async function check() {
      try {
        const url = `${import.meta.env.BASE_URL || '/'}version.json?t=${Date.now()}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data?.buildId) setLatest(String(data.buildId))
      } catch { /* offline */ }
    }
    check()
    const id = setInterval(check, POLL_MS)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [])

  const hasUpdate = latest && CURRENT_BUILD !== 'dev' && latest !== CURRENT_BUILD

  // Auto-atualiza: ao detectar versão nova, recarrega sozinho (uma vez).
  // Guarda anti-loop: se já tentou pra esse buildId e ainda vê update (o
  // bundle não trocou no CDN), para de recarregar e cai pro banner manual.
  useEffect(() => {
    if (!hasUpdate) return
    const key = `giro_autoupdate_${latest}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    const u = new URL(window.location.href)
    u.searchParams.set('v', String(latest))
    window.location.replace(u.toString())
  }, [hasUpdate, latest])

  const autoTried       = latest && sessionStorage.getItem(`giro_autoupdate_${latest}`)
  const reallyDismissed = dismissed || (latest && sessionStorage.getItem(DISMISS_KEY) === latest)
  // Banner só aparece como fallback: quando o auto-reload já tentou e mesmo
  // assim ainda há versão nova (raro). No caminho normal, recarrega sozinho.
  if (!hasUpdate || reallyDismissed || !autoTried) return null

  function reload() {
    const u = new URL(window.location.href)
    u.searchParams.set('v', String(latest))
    window.location.replace(u.toString())
  }
  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, latest)
    setDismissed(true)
  }

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[100] w-[min(380px,calc(100%-24px))] bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-brand/20 flex items-center justify-center shrink-0">
        <RefreshCw size={16} className="text-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold leading-tight">Nova versão disponível</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Atualize para ver as últimas melhorias.</p>
      </div>
      <button onClick={reload} className="bg-brand hover:bg-brand/90 text-white text-[12px] font-bold px-3 py-1.5 rounded-xl shrink-0">
        Atualizar
      </button>
      <button onClick={dismiss} aria-label="Adiar" className="text-gray-500 hover:text-gray-300 shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}
