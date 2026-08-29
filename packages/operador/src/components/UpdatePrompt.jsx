import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw, X } from 'lucide-react'

// eslint-disable-next-line no-undef
const CURRENT_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
const POLL_MS = 60_000
const DISMISS_KEY = 'giro_update_dismissed'

// Mesmo componente do admin e do turista — comportamento único nos três apps:
// detecta versão nova, tenta atualizar sozinho UMA vez (com cache-buster ?v=,
// porque o GitHub Pages entrega o index.html com cache e um reload comum traz o
// mesmo pacote velho) e, só se ainda assim continuar desatualizado, mostra o
// aviso — que dá para adiar.
//
// Diferença daqui: NÃO aparece na página pública da OS (/os/:token). Quem abre
// aquilo é o passageiro ou o motorista, e um aviso de atualização do painel não
// significa nada para eles.
export default function UpdatePrompt() {
  const { pathname } = useLocation()
  const paginaPublica = pathname.startsWith('/os/')
  const [latest, setLatest] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV || paginaPublica) return
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
  }, [paginaPublica])

  const hasUpdate = latest && CURRENT_BUILD !== 'dev' && latest !== CURRENT_BUILD

  // NÃO recarrega sozinho: a plataforma AVISA e quem decide é a pessoa. Recarga
  // silenciosa some com a versão nova sem ninguém perceber que houve mudança —
  // e, se acontecer no meio de um formulário, apaga o que estava preenchido.
  // O aviso aparece UMA vez por versão (o X guarda o buildId adiado).
  const reallyDismissed = dismissed || (latest && sessionStorage.getItem(DISMISS_KEY) === latest)
  if (paginaPublica || !hasUpdate || reallyDismissed) return null

  function reload() {
    // Some na hora: a navegação abaixo já recarrega, mas se a versão nova
    // ainda não estiver disponível (CDN), o aviso não deve voltar e ficar
    // pedindo clique no X. Marcado como visto PARA ESTA versão — quando
    // sair a próxima, avisa de novo.
    sessionStorage.setItem(DISMISS_KEY, String(latest))
    setDismissed(true)
    const u = new URL(window.location.href)
    u.searchParams.set('v', String(latest))
    window.location.replace(u.toString())
  }
  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, latest)
    setDismissed(true)
  }

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[100] w-[min(380px,calc(100%-24px))] bg-gray-800 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 border border-gray-700">
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
