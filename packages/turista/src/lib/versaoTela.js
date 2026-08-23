import { useSyncExternalStore } from 'react'

// ── Telas em avaliação ───────────────────────────────────────────────────────
// Quando um redesenho entra, a versão antiga fica lado a lado até o dono
// decidir. Esta fábrica é o motor dessa troca — a home e a tela de passeios
// usam a mesma, cada uma com sua chave.
//
// Mora FORA do React porque mais de um componente precisa reagir à troca (a
// home muda junto com o MENU INFERIOR, que ganha 5 itens em vez de 6). Com
// estado local, alternar deixaria o menu dessincronizado.
//
// localStorage pode lançar (navegação privada, cookies bloqueados, WebView com
// site data desligado). Como agora duas telas dependem disto, uma exceção aqui
// derrubaria a navegação inteira — daí os try/catch.
export function criarVersaoTela({ chave, param, padrao = 'atual' }) {
  const ouvintes = new Set()

  function ler() {
    try {
      const daUrl = new URLSearchParams(window.location.search).get(param)
      if (daUrl === 'nova' || daUrl === 'atual') return daUrl
      const guardado = localStorage.getItem(chave)
      if (guardado === 'nova' || guardado === 'atual') return guardado
    } catch { /* sem acesso ao armazenamento: fica no padrão */ }
    return padrao
  }

  function gravar(v) {
    const valor = v === 'nova' ? 'nova' : 'atual'
    try { localStorage.setItem(chave, valor) } catch { /* segue só nesta sessão */ }
    ouvintes.forEach((fn) => fn())
  }

  function subscrever(fn) {
    ouvintes.add(fn)
    window.addEventListener('popstate', fn)   // ?param= na URL
    return () => { ouvintes.delete(fn); window.removeEventListener('popstate', fn) }
  }

  return {
    get: ler,
    set: gravar,
    usar: () => useSyncExternalStore(subscrever, ler, () => padrao),
  }
}
