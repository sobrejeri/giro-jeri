import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import App from './App'
import UpdatePrompt from './components/UpdatePrompt'
import { AuthProvider } from './contexts/AuthContext'
import { queryClient } from './lib/queryClient'
import './index.css'

// Registra o service worker (PWA) com auto-atualização: ao publicar um deploy,
// o SW novo assume o controle (skipWaiting+claim) e dispara `controllerchange`,
// e aqui recarregamos UMA vez para pegar o bundle novo sozinho — evitando o app
// preso numa versão sem estilo. A 1ª instalação não recarrega.
if ('serviceWorker' in navigator) {
  let recarregando = false
  let tinhaControle = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle) { tinhaControle = true; return }
    if (recarregando) return
    recarregando = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
      .then((reg) => {
        reg.update?.()
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update?.()
        })
      })
      .catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AuthProvider>
          <App />
          <UpdatePrompt />
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
)
