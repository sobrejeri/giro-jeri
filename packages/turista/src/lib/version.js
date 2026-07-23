// Versão do app para o usuário conferir se está com a última.
// __BUILD_ID__ é injetado pelo Vite no build (timestamp em ms) — o mesmo que o
// UpdatePrompt usa para detectar nova versão. Aqui mostramos a data/hora do
// build de forma legível.
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null

export const APP_VERSION = '2.0'

export function versionLabel() {
  let quando = ''
  if (BUILD) {
    try {
      quando = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(Number(BUILD)))
    } catch { /* ignora */ }
  }
  return quando ? `Turiva v${APP_VERSION} · ${quando}` : `Turiva v${APP_VERSION}`
}
