const BASE = import.meta.env.VITE_API_URL || ''

const STORAGE = {
  token:   'giro_admin_token',
  refresh: 'giro_admin_refresh',
  user:    'giro_admin_user',
}

function getToken()   { return localStorage.getItem(STORAGE.token)   }
function getRefresh() { return localStorage.getItem(STORAGE.refresh) }

// Renova via API com o refresh_token guardado (mesmo mecanismo do coop/turista).
// Antes o admin dependia de supabase.auth.refreshSession() — a sessão interna
// do client dessincronizava com o token do localStorage e derrubava o login
// em loop. Usar o refresh_token guardado como fonte única resolve isso.
// Retorna 'ok' | 'invalid' | 'network' ('network' NÃO desloga).
async function tryRefresh() {
  const refreshToken = getRefresh()
  if (!refreshToken) return 'invalid'
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    })
    if (res.status === 401) return 'invalid'   // refresh token revogado
    if (!res.ok)            return 'network'    // 5xx / instabilidade
    const data = await res.json().catch(() => null)
    if (!data?.token)       return 'network'

    localStorage.setItem(STORAGE.token, data.token)
    if (data.refresh_token) localStorage.setItem(STORAGE.refresh, data.refresh_token)
    return 'ok'
  } catch {
    return 'network'   // exceção (rede/timeout) — não desloga
  }
}

function clearSession() {
  Object.values(STORAGE).forEach((k) => localStorage.removeItem(k))
  // Preserva o destino em ?next= para voltar após o login (sessão expirada).
  const base = import.meta.env.BASE_URL || '/'
  const full = window.location.pathname + window.location.search
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
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  me:           ()           => request('/api/auth/me'),
  updateMe:     (body)       => request('/api/auth/me', { method: 'PATCH', body }),
  uploadPhoto:  (photo_data) => request('/api/auth/me/photo', { method: 'POST', body: { photo_data } }),

  // Dashboard KPIs
  getStats:          () => request('/api/admin/stats'),
  getFinancialDaily: (params = {}) => request(`/api/admin/financial-daily?${new URLSearchParams(params)}`),
  getOperational:    (params = {}) => request(`/api/admin/operational?${new URLSearchParams(params)}`),
  getOperatorPerformance: (params = {}) => request(`/api/admin/operator-performance?${new URLSearchParams(params)}`),

  // Usuários
  getUsers:          (params = {}) => request(`/api/admin/users?${new URLSearchParams(params)}`),
  createUser:        (body)        => request('/api/admin/users', { method: 'POST', body }),
  updateUser:        (id, body)    => request(`/api/admin/users/${id}`, { method: 'PATCH', body }),
  resetUserPassword: (id, new_password) => request(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: { new_password } }),
  registerRecipient: (id)          => request(`/api/admin/users/${id}/register-recipient`, { method: 'POST', body: {} }),
  getAuthOrphans:    ()            => request('/api/admin/auth-orphans'),
  importAuthUser:    (body)        => request('/api/admin/import-auth-user', { method: 'POST', body }),

  // Frota liberada por cooperativa (roteamento por veículo operado)
  getOperatorVehicles: (operatorId)                    => request(`/api/admin/operators/${operatorId}/vehicles`),
  setOperatorVehicle:  (operatorId, vehicleId, body)   => request(`/api/admin/operators/${operatorId}/vehicles/${vehicleId}`, { method: 'PUT', body }),

  // Financeiro
  getFinancial: (params = {}) => request(`/api/admin/financial?${new URLSearchParams(params)}`),

  // Catálogo — Tours
  getTours:   (params = {}) => request(`/api/catalog/tours?${new URLSearchParams(params)}`),
  getTour:    (id)          => request(`/api/catalog/tours/${id}`),
  createTour: (body)        => request('/api/catalog/tours', { method: 'POST', body }),
  updateTour: (id, body)    => request(`/api/catalog/tours/${id}`, { method: 'PUT', body }),
  deleteTour: (id)          => request(`/api/catalog/tours/${id}`, { method: 'DELETE' }),

  // Catálogo — Transfers
  getTransfers:   ()         => request('/api/transfers'),
  createTransfer: (body)     => request('/api/catalog/transfers', { method: 'POST', body }),
  updateTransfer: (id, body) => request(`/api/catalog/transfers/${id}`, { method: 'PUT', body }),
  deleteTransfer: (id)       => request(`/api/catalog/transfers/${id}`, { method: 'DELETE' }),

  // Catálogo — Rotas de Transfer
  getTransferRoutes:   (params = {}) => request(`/api/catalog/transfer-routes?${new URLSearchParams(params)}`),
  createTransferRoute: (body)        => request('/api/catalog/transfer-routes', { method: 'POST', body }),
  updateTransferRoute: (id, body)    => request(`/api/catalog/transfer-routes/${id}`, { method: 'PUT', body }),
  deleteTransferRoute: (id)          => request(`/api/catalog/transfer-routes/${id}`, { method: 'DELETE' }),

  // Veículos
  getVehicles:   (params = {}) => request(`/api/vehicles?${new URLSearchParams(params)}`),
  createVehicle: (body)        => request('/api/vehicles', { method: 'POST', body }),
  updateVehicle: (id, body)    => request(`/api/vehicles/${id}`, { method: 'PUT', body }),
  deleteVehicle: (id)          => request(`/api/vehicles/${id}`, { method: 'DELETE' }),

  // Motor de preços (campos: service_id, base_price, high_season_price)
  getPricingRules:   (params = {}) => request(`/api/admin/pricing-rules?${new URLSearchParams(params)}`),
  createPricingRule: (body)        => request('/api/admin/pricing-rules', { method: 'POST', body }),
  updatePricingRule: (id, body)    => request(`/api/admin/pricing-rules/${id}`, { method: 'PUT', body }),
  deletePricingRule: (id)          => request(`/api/admin/pricing-rules/${id}`, { method: 'DELETE' }),
  // Salva em lote todos os preços de um passeio (upsert por vehicle+service)
  saveTourPricing: async (tourId, regionId, rows) => {
    // rows: [{ vehicle_id, base_price, existing_id? }]
    // high_season_price é sempre calculado automaticamente pela % da temporada
    const results = []
    for (const row of rows) {
      if (row.existing_id) {
        const r = await request(`/api/admin/pricing-rules/${row.existing_id}`, {
          method: 'PUT',
          body: { base_price: row.base_price, high_season_price: null },
        })
        results.push(r)
      } else {
        const r = await request('/api/admin/pricing-rules', {
          method: 'POST',
          body: {
            vehicle_id: row.vehicle_id,
            service_id: tourId,
            region_id:  regionId,
            base_price: row.base_price,
          },
        })
        results.push(r)
      }
    }
    return results
  },

  // Reservas
  getAdminBookings:     (params = {}) => request(`/api/admin/bookings?${new URLSearchParams(params)}`),
  createManualBooking:  (body) => request('/api/admin/bookings/manual', { method: 'POST', body }),
  confirmPaymentManual: (body) => request('/api/payments/manual-confirm', { method: 'POST', body }),

  // Regiões
  getRegions:   ()         => request('/api/regions'),
  createRegion: (body)     => request('/api/regions', { method: 'POST', body }),
  updateRegion: (id, body) => request(`/api/regions/${id}`, { method: 'PUT', body }),

  // Cupons
  getCoupons:   (params = {}) => request(`/api/admin/coupons?${new URLSearchParams(params)}`),
  createCoupon: (body)        => request('/api/admin/coupons', { method: 'POST', body }),
  updateCoupon: (id, body)    => request(`/api/admin/coupons/${id}`, { method: 'PUT', body }),
  deleteCoupon: (id)          => request(`/api/admin/coupons/${id}`, { method: 'DELETE' }),

  // Alta Temporada
  getSeasons:   ()         => request('/api/admin/seasons'),
  createSeason: (body)     => request('/api/admin/seasons', { method: 'POST', body }),
  updateSeason: (id, body) => request(`/api/admin/seasons/${id}`, { method: 'PUT', body }),
  deleteSeason: (id)       => request(`/api/admin/seasons/${id}`, { method: 'DELETE' }),

  // Feriados / datas especiais
  getHolidays:   ()         => request('/api/admin/holidays'),
  createHoliday: (body)     => request('/api/admin/holidays', { method: 'POST', body }),
  updateHoliday: (id, body) => request(`/api/admin/holidays/${id}`, { method: 'PUT', body }),
  deleteHoliday: (id)       => request(`/api/admin/holidays/${id}`, { method: 'DELETE' }),

  // Auditoria
  getAuditLogs: (params = {}) => request(`/api/admin/audit-logs?${new URLSearchParams(params)}`),

  // Configurações
  getSettings:   ()          => request('/api/admin/settings'),
  updateSetting: (key, body) => request(`/api/admin/settings/${key}`, { method: 'PUT', body }),

  // Upload de imagens do site (banner da home etc.) → devolve { url }
  uploadSiteImage: (photo_data, name) => request('/api/admin/site-image', { method: 'POST', body: { photo_data, name } }),

  // URL assinada para upload direto de vídeo/imagem ao Supabase Storage → devolve { signed_url, public_url }
  getStorageSignedUrl: (body) => request('/api/admin/storage-sign', { method: 'POST', body }),

  // Feed de eventos / promoções da vila
  getFeedPosts:   ()         => request('/api/feed/admin'),
  createFeedPost: (body)     => request('/api/feed', { method: 'POST', body }),
  updateFeedPost: (id, body) => request(`/api/feed/${id}`, { method: 'PUT', body }),
  deleteFeedPost: (id)       => request(`/api/feed/${id}`, { method: 'DELETE' }),

  // Estabelecimentos (Descubra a Vila)
  getEstablishments:   ()         => request('/api/establishments/admin'),
  createEstablishment: (body)     => request('/api/establishments', { method: 'POST', body }),
  updateEstablishment: (id, body) => request(`/api/establishments/${id}`, { method: 'PUT', body }),
  deleteEstablishment: (id)       => request(`/api/establishments/${id}`, { method: 'DELETE' }),

  // Notificações
  getNotifications:      ()    => request('/api/notifications'),
  markNotificationsRead: ()    => request('/api/notifications/read-all', { method: 'POST' }),
  deleteNotification:    (id) => request(`/api/notifications/${id}`, { method: 'DELETE' }),
  pushSubscribe:         (sub) => request('/api/notifications/push-subscribe', { method: 'POST', body: sub }),
  getVapidKey:           ()    => request('/api/notifications/vapid-public-key'),

  // Destaques (Instagram Highlights) — admin
  getStories:      ()          => request('/api/stories/admin'),
  createHighlight: (body)      => request('/api/stories/highlights',                   { method: 'POST',   body }),
  updateHighlight: (id, body)  => request('/api/stories/highlights/' + id,             { method: 'PUT',    body }),
  deleteHighlight: (id)        => request('/api/stories/highlights/' + id,             { method: 'DELETE' }),
  addStoryItem:    (hid, body) => request('/api/stories/highlights/' + hid + '/items', { method: 'POST',   body }),
  updateStoryItem: (id, body)  => request('/api/stories/items/' + id,                  { method: 'PUT',    body }),
  deleteStoryItem: (id)        => request('/api/stories/items/' + id,                  { method: 'DELETE' }),
}
