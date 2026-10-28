import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import ErroNaTela from './components/ErroNaTela'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
import UpdatePrompt from './components/UpdatePrompt'
import { AuthProvider } from './contexts/AuthContext'
import { RegionProvider } from './contexts/RegionContext'
import { FavoritesProvider } from './contexts/FavoritesContext'
import { CartProvider } from './contexts/CartContext'
import { queryClient } from './lib/queryClient'
import './i18n/index.js'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Barreira por FORA de tudo: erro em qualquer provider ou tela vira uma
        tela com explicação e botão, nunca mais tela branca. */}
    <ErroNaTela>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <RegionProvider>
          <AuthProvider>
            <FavoritesProvider>
              <CartProvider>
                <App />
                <UpdatePrompt />
              </CartProvider>
            </FavoritesProvider>
          </AuthProvider>
        </RegionProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
    </ErroNaTela>
  </React.StrictMode>
)

// Esconde a splash quando o app pintou o primeiro quadro (respeitando o
// tempo mínimo definido no index.html). Dois rAFs = app já visível por baixo.
requestAnimationFrame(() =>
  requestAnimationFrame(() => window.__hideSplash && window.__hideSplash())
)

// PWA: registra o service worker (instalável + offline básico + push)
//
// Auto-atualização: o SW novo já faz skipWaiting()+clients.claim(), então ao
// publicar um deploy ele assume o controle e dispara `controllerchange`. Aqui
// recarregamos a página UMA vez nesse momento — assim o app pega o bundle novo
// sozinho, sem depender de o usuário fechar e reabrir. Guardamos contra o
// disparo da PRIMEIRA instalação (quando ainda não havia controller) para não
// recarregar à toa no primeiro acesso.
if ('serviceWorker' in navigator) {
  let recarregando = false
  let tinhaControle = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle) { tinhaControle = true; return } // 1ª instalação: não recarrega
    if (recarregando) return
    recarregando = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
      .then((reg) => {
        reg.update?.()
        // Ao voltar para o app, checa se há versão nova.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update?.()
        })
      })
      .catch(() => {})
  })
}

// PWA: captura o evento de instalação (Android) cedo, para o botão usar depois
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.deferredInstallPrompt = e
})
