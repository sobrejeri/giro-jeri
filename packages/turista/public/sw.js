/* Giro Jeri — Service Worker (PWA + Web Push) */
const SHELL_CACHE = 'giro-jeri-shell-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Network-first para navegação (HTML): online sempre pega a versão nova;
// offline cai para o último shell em cache. Demais requisições passam direto.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.mode !== 'navigate') return
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(SHELL_CACHE).then((c) => c.put('shell', copy)).catch(() => {})
        return res
      })
      .catch(() => caches.open(SHELL_CACHE).then((c) => c.match('shell'))),
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  const title = data.title || 'Giro Jeri'
  const path  = data.bookingId ? ('minhas-reservas/' + data.bookingId) : 'minhas-reservas'
  const options = {
    body:    data.body || '',
    tag:     data.templateKey || 'giro-jeri',
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
