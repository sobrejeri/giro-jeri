import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// ID do build atual (injetado pelo Vite no build de produção).
// eslint-disable-next-line no-undef
const CURRENT_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

const POLL_MS   = 45_000
const RELOAD_KEY = 'giro_coop_reloaded_build'

/**
 * Detecta versão nova do painel e RECARREGA sozinho.
 *
 * Por que automático (o app do turista só sugere): aqui o pacote antigo não
 * causa só uma tela desatualizada — ele chama endpoints que já não existem.
 * Foi exatamente o que aconteceu com o envio da OS: o navegador seguia
 * chamando /os-pdf (removido) e a operação falhava sem motivo aparente, com
 * a cooperativa achando que o sistema estava quebrado.
 *
 * O GitHub Pages serve o index.html com cache, então o navegador pode ficar
 * dias no pacote antigo. Aqui comparamos o buildId a cada 45s (e ao voltar
 * para a aba) e recarregamos com cache furado.
 *
 * Trava anti-loop: guarda o build que causou a recarga. Se depois de
 * recarregar o servidor ainda anunciar o mesmo build novo (CDN inconsistente),
 * não recarrega de novo — mostra o aviso manual.
 */
export default function UpdateGate() {
  const [preso, setPreso] = useState(false)

  useEffect(() => {
    if (import.meta.env.DEV) return
    let cancelado = false

    async function checar() {
      try {
        const url = `${import.meta.env.BASE_URL || '/'}version.json?t=${Date.now()}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (cancelado || !buildId) return
        const novo = String(buildId)
        if (novo === String(CURRENT_BUILD)) return

        if (sessionStorage.getItem(RELOAD_KEY) === novo) {
          setPreso(true)          // já tentamos: não entra em loop
          return
        }
        sessionStorage.setItem(RELOAD_KEY, novo)
        window.location.reload()
      } catch { /* offline: tenta no próximo ciclo */ }
    }

    checar()
    const id = setInterval(checar, POLL_MS)
    const onFocus = () => checar()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelado = true
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (!preso) return null

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 bg-gray-900 text-white rounded-2xl shadow-xl p-4 flex items-center gap-3">
      <RefreshCw size={18} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Versão nova disponível</p>
        <p className="text-xs text-gray-300">Recarregue para evitar erros nas operações.</p>
      </div>
      <button
        onClick={() => window.location.reload(true)}
        className="shrink-0 bg-white text-gray-900 text-xs font-bold rounded-lg px-3 py-2"
      >
        Atualizar
      </button>
    </div>
  )
}
