import { supabase } from './supabase'

const BASE = import.meta.env.VITE_API_URL || ''

const STORAGE = {
  token:   'giro_admin_token',
  refresh: 'giro_admin_refresh',
  user:    'giro_admin_user',
}

function getToken()   { return localStorage.getItem(STORAGE.token)   }
function getRefresh() { return localStorage.getItem(STORAGE.refresh) }

async function tryRefresh() {
  const refreshToken = getRefresh()
  if (!refreshToken) return false

  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session) return false

    localStorage.setItem(STORAGE.token,   data.session.access_token)
    localStorage.setItem(STORAGE.refresh, data.session.refresh_token)
    return true
  } catch {
    return false
  }
}

function clearSession() {
  Object.values(STORAGE).forEach((k) => localStorage.removeItem(k))
  window.location.href = '/login'
}

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

  if (res.status === 401) {
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

  // Dashboard KPIs
  getStats:          () => request('/api/admin/stats'),
  getFinancialDaily: (params = {}) => request(`/api/admin/financial-daily?${new URLSearchParams(params)}`),

  // Usuários
  getUsers:   (params = {}) => request(`/api/admin/users?${new URLSearchParams(params)}`),
  updateUser: (id, body)    => request(`/api/admin/users/${id}`, { method: 'PATCH', body }),

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
    // rows: [{ vehicle_id, base_price, high_season_price?, existing_id? }]
    const results = []
    for (const row of rows) {
      if (row.existing_id) {
        const r = await request(`/api/admin/pricing-rules/${row.existing_id}`, {
          method: 'PUT',
          body: { base_price: row.base_price, high_season_price: row.high_season_price },
        })
        results.push(r)
      } else {
        const r = await request('/api/admin/pricing-rules', {
          method: 'POST',
          body: {
            vehicle_id:        row.vehicle_id,
            service_id:        tourId,
            region_id:         regionId,
            base_price:        row.base_price,
            high_season_price: row.high_season_price,
          },
        })
        results.push(r)
      }
    }
    return results
  },

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

  // Auditoria
  getAuditLogs: (params = {}) => request(`/api/admin/audit-logs?${new URLSearchParams(params)}`),

  // Configurações
  getSettings:   ()          => request('/api/admin/settings'),
  updateSetting: (key, body) => request(`/api/admin/settings/${key}`, { method: 'PUT', body }),
}
