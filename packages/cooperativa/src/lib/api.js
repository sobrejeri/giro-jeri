const BASE = import.meta.env.VITE_API_URL || ''

// Prefixo próprio: turista/cooperativa/admin compartilham o mesmo domínio
// (sobrejeri.github.io/<subpath>) e localStorage é por origem, não por path —
// sem prefixo, logar num app sobrescrevia a sessão dos outros.
const STORAGE = {
  token:   'giro_coop_token',
  refresh: 'giro_coop_refresh',
  user:    'giro_coop_user',
}

function getToken()   { return localStorage.getItem(STORAGE.token)   }
function getRefresh() { return localStorage.getItem(STORAGE.refresh) }

// Renova o token via API. A cooperativa autentica pela API (não pelo client
// do Supabase no browser), então NÃO existe sessão de client para
// refreshSession() usar — tentar isso fazia todo refresh falhar e derrubava o
// login. O refresh token guardado é a fonte de verdade, igual ao app turista.
async function tryRefresh() {
  const refreshToken = getRefresh()
  if (!refreshToken) return false
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => null)
    if (!data?.token) return false

    localStorage.setItem(STORAGE.token, data.token)
    if (data.refresh_token) localStorage.setItem(STORAGE.refresh, data.refresh_token)
    return true
  } catch {
    return false
  }
}

function clearSession() {
  Object.values(STORAGE).forEach((k) => localStorage.removeItem(k))
  window.location.href = (import.meta.env.BASE_URL || '/') + 'login'
}

// Faz uma requisição autenticada com re-tentativa automática após refresh.
async function request(path, options = {}, isRetry = false) {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  // Endpoints de autenticação: um 401 significa "credenciais inválidas" —
  // não tentar refresh nem deslogar. Deixa o erro do servidor (ex.: "CNPJ não
  // encontrado") chegar a quem chamou, em vez de redirecionar pro login.
  const isAuthEndpoint = path.startsWith('/api/auth/login') || path.startsWith('/api/auth/refresh')

  if (res.status === 401 && !isAuthEndpoint) {
    if (!isRetry) {
      const refreshed = await tryRefresh()
      if (refreshed) return request(path, options, true)
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
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  me:    () => request('/api/auth/me'),

  // Painel operacional (Kanban)
  getOperational:       (params = {}) => request(`/api/admin/operational?${new URLSearchParams(params)}`),
  updateBookingStatus:  (id, body)    => request(`/api/bookings/${id}/status`, { method: 'PATCH', body }),
  assignBooking:        (id, body)    => request(`/api/admin/operational/${id}/assign`, { method: 'POST', body }),

  // Cotações
  getPendingQuotes: ()         => request('/api/transfers/quotes/pending'),
  getQuotesHistory: ()         => request('/api/transfers/quotes/history'),
  setQuotePrice:   (id, body) => request(`/api/transfers/quotes/${id}/quote`, { method: 'PATCH', body }),

  // Veículos
  getVehicles:   (params = {}) => request(`/api/vehicles?${new URLSearchParams(params)}`),
  createVehicle: (body)        => request('/api/vehicles', { method: 'POST', body }),
  updateVehicle: (id, body)    => request(`/api/vehicles/${id}`, { method: 'PUT', body }),
  deleteVehicle: (id)          => request(`/api/vehicles/${id}`, { method: 'DELETE' }),

  // Financeiro
  // Endpoints operator-scoped (filtram pelas reservas da própria cooperativa).
  // NÃO usar /api/admin/financial* aqui — aquilo é só admin (403 para coop).
  getFinancial:      (params = {}) => request(`/api/operator/financial?${new URLSearchParams(params)}`),
  getFinancialDaily: (params = {}) => request(`/api/operator/financial-daily?${new URLSearchParams(params)}`),

  // Regiões
  getRegions: () => request('/api/regions'),

  // Catálogo — Passeios
  getCategories:     ()         => request('/api/catalog/categories'),
  getCatalogTours:   ()         => request('/api/catalog/tours'),
  createCatalogTour: (body)     => request('/api/catalog/tours', { method: 'POST', body }),
  updateCatalogTour: (id, body) => request(`/api/catalog/tours/${id}`, { method: 'PUT', body }),
  toggleCatalogTour: (id, flag) => request(`/api/catalog/tours/${id}`, { method: 'PUT', body: { is_active: flag } }),

  // Catálogo — Transfers (serviços-pai das rotas)
  getCatalogTransfers: () => request('/api/catalog/transfers'),

  // Catálogo — Rotas de Transfer (somente leitura para cooperativa)
  getCatalogRoutes: () => request('/api/catalog/transfer-routes'),

  // Perfil do operador + conta de recebimento
  getProfile:    ()           => request('/api/operator/profile'),
  updateProfile: (body)       => request('/api/operator/profile', { method: 'PATCH', body }),
  uploadPhoto:   (photo_data) => request('/api/auth/me/photo', { method: 'POST', body: { photo_data } }),

  // Preferências da cooperativa (opt-in por serviço)
  getPreferences: () => request('/api/operator/preferences'),
  setPreference:  (type, entityId, isActive) =>
    request(`/api/operator/preferences/${type}/${entityId}`, {
      method: 'PUT',
      body:   { is_active: isActive },
    }),

  // Corridas (modelo Uber — primeiro a aceitar)
  getOperatorBookings: ()   => request('/api/operator/bookings'),
  acceptBooking:       (id) => request(`/api/operator/bookings/${id}/accept`,   { method: 'POST', body: {} }),
  startBooking:        (id) => request(`/api/operator/bookings/${id}/start`,    { method: 'POST', body: {} }),
  confirmBooking:      (id) => request(`/api/operator/bookings/${id}/confirm`,  { method: 'POST', body: {} }),
  completeBooking:     (id) => request(`/api/operator/bookings/${id}/complete`, { method: 'POST', body: {} }),

  // Mercado Pago (split de pagamentos / marketplace)
  getMpStatus:     () => request('/api/mp/status'),
  getMpConnectUrl: () => request('/api/mp/connect-url'),
  disconnectMp:    () => request('/api/mp/disconnect', { method: 'POST', body: {} }),

  // Notificações
  getNotifications:      ()    => request('/api/notifications'),
  markNotificationsRead: ()    => request('/api/notifications/read-all', { method: 'POST' }),
  pushSubscribe:         (sub) => request('/api/notifications/push-subscribe', { method: 'POST', body: sub }),
  getVapidKey:           ()    => request('/api/notifications/vapid-public-key'),
}
