// Rolagem até uma âncora da página — os links de seção do topo ("Sobre nós").
//
// Duas armadilhas que um `<a href="#sobre">` sozinho não resolve numa SPA:
//
// 1. O React Router NÃO rola para o `#hash`. Ele troca a URL e para por aí.
//    Dentro da própria tela o navegador ainda rola sozinho; ao TROCAR de tela,
//    não — a URL vira `/transfers#sobre` e nada acontece.
//
// 2. O alvo pode nem existir ainda. Vindo de outra tela, a home só monta no
//    quadro seguinte à navegação. Por isso procuramos o elemento por alguns
//    quadros antes de desistir, em vez de um `setTimeout` fixo — que erra nos
//    dois sentidos: cedo demais em máquina rápida, tarde demais em lenta.
//
// O desconto do cabeçalho fixo NÃO é feito aqui: fica em `scroll-mt-*` na
// própria seção, que é onde se sabe qual cabeçalho cobre o quê.

export function rolarAteAncora(id, limiteMs = 2000) {
  if (!id) return
  const inicio = performance.now()

  const tentar = () => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (performance.now() - inicio < limiteMs) requestAnimationFrame(tentar)
  }

  requestAnimationFrame(tentar)
}
