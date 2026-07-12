const BASE = import.meta.env.VITE_API_URL || ''

const STORAGE = {
  token:   'giro_token',
  refresh: 'giro_refresh',
  user:    'giro_user',
}

function getToken()   { return localStorage.getItem(STORAGE.token) }
function getRefresh() { return localStorage.getItem(STORAGE.refresh) }

// Retorna 'ok' | 'invalid' | 'network'. 'network' (servidor lento/cold start
// do Render, rede instável) NÃO desloga — evita o loop de login.
async function tryRefresh() {
  const refreshToken = getRefresh()
  if (!refreshToken) return 'invalid'
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    })
    if (res.status === 401) return 'invalid'
    if (!res.ok)            return 'network'
    const data = await res.json().catch(() => null)
    if (!data?.token)       return 'network'
    localStorage.setItem(STORAGE.token,   data.token)
    localStorage.setItem(STORAGE.refresh, data.refresh_token)
    if (data.user) localStorage.setItem(STORAGE.user, JSON.stringify(data.user))
    return 'ok'
  } catch {
    return 'network'
  }
}

function clearSession() {
  Object.values(STORAGE).forEach((k) => localStorage.removeItem(k))
  // Preserva o destino atual em ?next= para voltar após o login (sessão que
  // caiu no meio do uso). window.location não carrega state do React Router,
  // então usamos query param — o Login lê como fallback.
  const base = import.meta.env.BASE_URL || '/'
  const full = window.location.pathname + window.location.search
  // Remove o basename pra o next ser relativo (o navigate do Router espera
  // caminho sem o base; senão duplicaria /giro-jeri/giro-jeri/...).
  const rel  = full.startsWith(base) ? '/' + full.slice(base.length) : full
  const isLoginPage = window.location.pathname.endsWith('/login')
  const next = isLoginPage ? '' : `?next=${encodeURIComponent(rel)}`
  window.location.href = `${base}login${next}`
}

// Renova ANTES de expirar (janela de 60s) — evita o 401 "esperado" na
// primeira chamada após tempo parado e a corrida de refreshes paralelos.
function tokenExpiringSoon() {
  const t = getToken()
  if (!t) return false
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp ? payload.exp * 1000 - Date.now() < 60_000 : false
  } catch { return false }
}

let refreshInFlight = null
function refreshOnce() {
  if (!refreshInFlight) {
    refreshInFlight = tryRefresh().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

async function request(path, options = {}, isRetry = false) {
  if (!isRetry && tokenExpiringSoon()) await refreshOnce()
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (res.status === 401) {
    if (!isRetry) {
      const r = await refreshOnce()
      if (r === 'ok') return request(path, options, true)
      // Servidor lento/instável: não desloga — evita o loop de login.
      if (r === 'network') throw new Error('Conexão instável. Tente novamente em instantes.')
    }
    clearSession()
    return null
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
  return data
}

export const api = {
  // Auth
  login:          (body) => request('/api/auth/login',           { method: 'POST', body }),
  register:       (body) => request('/api/auth/register',        { method: 'POST', body }),
  forgotPassword: (body) => request('/api/auth/forgot-password', { method: 'POST', body }),
  me:            ()     => request('/api/auth/me'),
  updateProfile: (body) => request('/api/auth/me',           { method: 'PATCH', body }),
  uploadPhoto:   (photoData) => request('/api/auth/me/photo', { method: 'POST',  body: { photo_data: photoData } }),
  uploadCover:   (photoData) => request('/api/auth/me/cover', { method: 'POST',  body: { photo_data: photoData } }),
  logout:        ()     => request('/api/auth/logout', { method: 'POST' }),

  // Configurações públicas (banner da home etc.)
  getPublicSettings: () => request('/api/settings/public'),

  // Cooperativas parceiras (vitrine na home) — público
  getPartners: () => request('/api/operator/partners'),

  // Feed de eventos / promoções da vila
  getFeed: () => request('/api/feed'),

  // Diretório de estabelecimentos (Descubra a Vila)
  getEstablishments: (params = {}) => request(`/api/establishments?${new URLSearchParams(params)}`),
  getNearbyPlaces:   (params = {}) => request(`/api/establishments/nearby?${new URLSearchParams(params)}`),
  getReviews:        (estId)       => request(`/api/establishments/${estId}/reviews`),
  addReview:         (estId, body) => request(`/api/establishments/${estId}/reviews`, { method: 'POST', body }),
  deleteReview:      (id)          => request(`/api/establishments/reviews/${id}`, { method: 'DELETE' }),

  // Engajamento no feed (likes + comentários)
  getMyLikes:     ()           => request('/api/feed/my-likes'),
  likePost:       (id)         => request(`/api/feed/${id}/like`, { method: 'POST' }),
  getComments:    (postId)     => request(`/api/feed/${postId}/comments`),
  addComment:     (postId, body) => request(`/api/feed/${postId}/comments`, { method: 'POST', body: { body } }),
  deleteComment:  (id)         => request(`/api/feed/comments/${id}`, { method: 'DELETE' }),
  // Publicação no feed (admin): criar / editar / excluir posts (evento/promo)
  createPost:     (body)       => request('/api/feed',        { method: 'POST',   body }),
  updatePost:     (id, body)   => request(`/api/feed/${id}`,  { method: 'PUT',    body }),
  deletePost:     (id)         => request(`/api/feed/${id}`,  { method: 'DELETE' }),

  // Regiões
  getRegions: () => request('/api/regions'),

  // Veículos
  getVehicles: (params = {}) => request(`/api/vehicles?${new URLSearchParams(params)}`),

  // Passeios
  getTours:        (params = {}) => request(`/api/tours?${new URLSearchParams(params)}`),
  getTour:         (id)          => request(`/api/tours/${id}`),
  getTourVehicles: (id)          => request(`/api/tours/${id}/vehicles`),
  calculateTour:   (id, body)    => request(`/api/tours/${id}/calculate`, { method: 'POST', body }),

  // Transfers
  getTransfers:       (params = {}) => request(`/api/transfers?${new URLSearchParams(params)}`),
  getTransferRoutes:  (params = {}) => request(`/api/transfers/routes?${new URLSearchParams(params)}`),
  calculateTransfer:  (body)        => request('/api/transfers/calculate', { method: 'POST', body }),
  transferSurcharge:  (body)        => request('/api/transfers/surcharge', { method: 'POST', body }),
  // Alta temporada (público): regras ativas p/ sinalizar datas no calendário
  getSeasons:         (params = {}) => request(`/api/seasons?${new URLSearchParams(params)}`),
  requestQuote:       (body)        => request('/api/transfers/quotes',    { method: 'POST', body }),
  getMyQuotes:        ()            => request('/api/transfers/quotes'),
  acceptQuote:        (id)          => request(`/api/transfers/quotes/${id}/accept`, { method: 'POST' }),
  rejectQuote:        (id, body)    => request(`/api/transfers/quotes/${id}/reject`, { method: 'POST', body }),
  cancelQuote:        (id)          => request(`/api/transfers/quotes/${id}/cancel`, { method: 'POST' }),
  placesAutocomplete: (q)           => request(`/api/transfers/places/autocomplete?q=${encodeURIComponent(q)}`),
  placeDetails:       (placeId)     => request(`/api/transfers/places/details?place_id=${encodeURIComponent(placeId)}`),

  // Pagamentos
  requestBooking:         (body) => request('/api/payments/request',     { method: 'POST', body }),
  cartRequest:            (items, extra = {}) => request('/api/payments/cart-request', { method: 'POST', body: { items, ...extra } }),
  getPartner:             (slug) => request(`/api/partner/${encodeURIComponent(slug)}`),
  resolveAffiliate:       (code) => request(`/api/affiliate/resolve/${encodeURIComponent(code)}`),
  affiliateActivate:      ()     => request('/api/affiliate/activate', { method: 'POST' }),
  affiliateMe:            ()     => request('/api/affiliate/me'),
  validateCoupon:         (body) => request('/api/payments/validate-coupon', { method: 'POST', body }),
  affiliateSavePix:       (body) => request('/api/affiliate/pix', { method: 'PUT', body }),
  createPaymentIntent:    (body) => request('/api/payments/intent',       { method: 'POST', body }),
  getCheckoutKey:         (id)   => request(`/api/payments/booking/${id}/checkout-key`),
  // Checkout parcial (R3): cancela as pernas ainda pendentes e libera o
  // pagamento só do(s) veículo(s) já aceito(s). Retorna { dynamic_total, ... }.
  checkoutAccepted:       (id)   => request(`/api/payments/booking/${id}/checkout-accepted`, { method: 'POST', body: {} }),
  getPaymentStatus:       (id)   => request(`/api/payments/${id}/status`),
  simulatePaymentApprove: (id)   => request(`/api/payments/${id}/simulate`, { method: 'POST', body: {} }),

  // Reservas
  createBooking: (body) => request('/api/bookings',     { method: 'POST', body }),
  getMyBookings: ()     => request('/api/bookings'),
  getBooking:    (id)   => request(`/api/bookings/${id}`),
  cancelBooking: (id, body) => request(`/api/bookings/${id}/cancel`, { method: 'POST', body }),

  // Notificações
  getNotifications:      ()   => request('/api/notifications'),
  markNotificationsRead: ()   => request('/api/notifications/read-all', { method: 'POST' }),
  deleteNotification:    (id) => request(`/api/notifications/${id}`, { method: 'DELETE' }),
  pushSubscribe:         (sub) => request('/api/notifications/push-subscribe', { method: 'POST', body: sub }),
  getVapidKey:           ()   => request('/api/notifications/vapid-public-key'),

  // Stories (Instagram-style)
  getStories: () => request('/api/stories'),

  // Publicação de stories/destaques — exige token de admin (requireAdmin na API).
  // Disponível no app do turista apenas quando o usuário logado é admin.
  createHighlight:    (body)      => request('/api/stories/highlights', { method: 'POST', body }),
  addStoryItem:       (hid, body) => request('/api/stories/highlights/' + hid + '/items', { method: 'POST', body }),
  deleteStoryItem:    (id)        => request('/api/stories/items/' + id, { method: 'DELETE' }),
  uploadSiteImage:    (photo_data, name) => request('/api/admin/site-image', { method: 'POST', body: { photo_data, name } }),
  getStorageSignedUrl: (body)     => request('/api/admin/storage-sign', { method: 'POST', body }),
}
