import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

// ID do build atual (injetado pelo Vite no build de produção).
// eslint-disable-next-line no-undef
const CURRENT_BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

const POLL_MS = 45_000

/**
 * Detecta versão nova do painel e recarrega FURANDO O CACHE.
 *
 * Por que existe: o pacote antigo não deixa só a tela desatualizada — ele chama
 * endpoints que já não existem, e a operação falha sem motivo aparente (foi o
 * que aconteceu com o envio da OS, que insistia em chamar /os-pdf removido).
 *
 * Três cuidados aprendidos na marra:
 *
 * 1. `location.reload()` NÃO resolve. O GitHub Pages entrega o index.html com
 *    cache, então recarregar traz o MESMO pacote velho — e o aviso ficava preso
 *    para sempre. Aqui navegamos para `?v=<buildId>`: URL diferente obriga o
 *    navegador a buscar um documento novo.
 *
 * 2. Recarregar sozinho com alguém digitando perde o que foi preenchido (o
 *    formulário de despacho, por exemplo). Então a recarga automática só
 *    acontece com a aba EM SEGUNDO PLANO; com a aba em uso, mostramos o aviso e
 *    quem decide é a pessoa.
 *
 * 3. Não aparece na página pública da OS (/os/:token) — quem abre ali é o
 *    passageiro ou o motorista, e "recarregue para evitar erros nas operações"
 *    não faz sentido nenhum para eles.
 */
export default function UpdateGate() {
  const { pathname } = useLocation()
  const [novaVersao, setNovaVersao] = useState(null)

  const paginaPublica = pathname.startsWith('/os/')

  useEffect(() => {
    if (import.meta.env.DEV || paginaPublica) return
    let cancelado = false

    // Recarrega com URL diferente — é o que realmente escapa do cache do
    // index.html no GitHub Pages.
    function recarregarFurandoCache(buildId) {
      const url = new URL(window.location.href)
      url.searchParams.set('v', buildId)
      window.location.replace(url.toString())
    }

    async function checar() {
      try {
        const url = `${import.meta.env.BASE_URL || '/'}version.json?t=${Date.now()}`
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) return
        const { buildId } = await res.json()
        if (cancelado || !buildId) return
        const novo = String(buildId)
        if (novo === String(CURRENT_BUILD)) { setNovaVersao(null); return }

        // Aba em segundo plano: ninguém está digitando, pode recarregar.
        if (document.visibilityState === 'hidden') {
          recarregarFurandoCache(novo)
          return
        }
        setNovaVersao(novo)
      } catch { /* offline: tenta no próximo ciclo */ }
    }

    checar()
    const id = setInterval(checar, POLL_MS)
    const onVisibilidade = () => checar()
    window.addEventListener('visibilitychange', onVisibilidade)
    window.addEventListener('focus', onVisibilidade)
    return () => {
      cancelado = true
      clearInterval(id)
      window.removeEventListener('visibilitychange', onVisibilidade)
      window.removeEventListener('focus', onVisibilidade)
    }
  }, [paginaPublica])

  if (!novaVersao || paginaPublica) return null

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 bg-gray-900 text-white rounded-2xl shadow-xl p-4 flex items-center gap-3">
      <RefreshCw size={18} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Versão nova disponível</p>
        <p className="text-xs text-gray-300">Atualize para evitar erros nas operações.</p>
      </div>
      <button
        onClick={() => {
          const url = new URL(window.location.href)
          url.searchParams.set('v', novaVersao)
          window.location.replace(url.toString())
        }}
        className="shrink-0 bg-white text-gray-900 text-xs font-bold rounded-lg px-3 py-2"
      >
        Atualizar
      </button>
    </div>
  )
}
