/* Turiva — Service Worker (PWA offline + Web Push) */

// Suba a versão para invalidar os caches antigos num deploy.
const VERSION      = 'v2'
const SHELL_CACHE  = `turiva-shell-${VERSION}`
const ASSET_CACHE  = `turiva-assets-${VERSION}`
const KEEP         = [SHELL_CACHE, ASSET_CACHE]

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Remove caches de versões anteriores para não acumular lixo no aparelho.
    const names = await caches.keys()
    await Promise.all(names.map((n) => (KEEP.includes(n) ? null : caches.delete(n))))
    await self.clients.claim()
  })())
})

// Só cuidamos de GET da própria origem. Chamadas à API (outro domínio) e
// qualquer POST/PATCH passam direto — dado de reserva/pagamento nunca é
// servido de cache.
function isCacheableAsset(url, req) {
  if (url.origin !== self.location.origin) return false
  if (url.pathname.endsWith('/sw.js')) return false
  if (['script', 'style', 'image', 'font'].includes(req.destination)) return true
  // Assets com hash do Vite (index-AbC123.js) e o manifesto do PWA.
  return /\/assets\/|\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico|webmanifest)$/i.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // ── HTML (navegação): rede primeiro, cache como rede de segurança ──
  // Online sempre pega a versão nova; offline abre a última que funcionou.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        const copy = res.clone()
        caches.open(SHELL_CACHE).then((c) => c.put('shell', copy)).catch(() => {})
        return res
      } catch (_) {
        const cached = await caches.open(SHELL_CACHE).then((c) => c.match('shell'))
        return cached || Response.error()
      }
    })())
    return
  }

  // ── Assets (JS/CSS/imagens/fontes): cache primeiro ──
  // É o que faltava: sem isso o app não abre offline (o React nem carrega) e
  // a logo da splash vira ícone de imagem quebrada.
  if (isCacheableAsset(url, req)) {
    event.respondWith((async () => {
      const cache  = await caches.open(ASSET_CACHE)
      const cached = await cache.match(req)
      if (cached) {
        // Devolve na hora e atualiza em segundo plano (stale-while-revalidate).
        fetch(req).then((res) => {
          if (res && res.ok) cache.put(req, res.clone())
        }).catch(() => {})
        return cached
      }
      try {
        const res = await fetch(req)
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {})
        return res
      } catch (_) {
        // Sem rede e sem cache: falha silenciosa (o app trata a ausência).
        return Response.error()
      }
    })())
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  const title = data.title || 'Turiva'
  const path  = data.bookingId ? ('minhas-reservas/' + data.bookingId) : 'minhas-reservas'
  const options = {
    body:    data.body || '',
    tag:     data.templateKey || 'turiva',
    data:    { url: self.registration.scope + path },
    vibrate: [80, 40, 80],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          if ('navigate' in c) { try { c.navigate(url) } catch (_) {} }
          if ('focus' in c) return c.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
