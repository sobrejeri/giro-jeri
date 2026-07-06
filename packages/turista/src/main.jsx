import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
import UpdatePrompt from './components/UpdatePrompt'
import { AuthProvider } from './contexts/AuthContext'
import { RegionProvider } from './contexts/RegionContext'
import { FavoritesProvider } from './contexts/FavoritesContext'
import { queryClient } from './lib/queryClient'
import './i18n/index.js'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <RegionProvider>
          <AuthProvider>
            <FavoritesProvider>
              <App />
              <UpdatePrompt />
            </FavoritesProvider>
          </AuthProvider>
        </RegionProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
)

// Esconde a splash quando o app pintou o primeiro quadro (respeitando o
// tempo mínimo definido no index.html). Dois rAFs = app já visível por baixo.
requestAnimationFrame(() =>
  requestAnimationFrame(() => window.__hideSplash && window.__hideSplash())
)

// PWA: registra o service worker (instalável + offline básico + push)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}

// PWA: captura o evento de instalação (Android) cedo, para o botão usar depois
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.deferredInstallPrompt = e
})
