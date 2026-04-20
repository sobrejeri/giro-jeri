import { supabase } from './supabase'

const BASE = import.meta.env.VITE_API_URL || ''

const STORAGE = {
  token:   'giro_token',
  refresh: 'giro_refresh',
  user:    'giro_user',
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

  // Painel operacional (Kanban)
  getOperational:       (params = {}) => request(`/api/admin/operational?${new URLSearchParams(params)}`),
  updateBookingStatus:  (id, body)    => request(`/api/bookings/${id}/status`, { method: 'PATCH', body }),
  assignBooking:        (id, body)    => request(`/api/admin/operational/${id}/assign`, { method: 'POST', body }),

  // Cotações
  getPendingQuotes: ()         => request('/api/transfers/quotes/pending'),
  getAllQuotes:     ()         => request('/api/transfers/quotes'),
  setQuotePrice:   (id, body) => request(`/api/transfers/quotes/${id}/quote`, { method: 'PATCH', body }),

  // Veículos
  getVehicles:   (params = {}) => request(`/api/vehicles?${new URLSearchParams(params)}`),
  createVehicle: (body)        => request('/api/vehicles', { method: 'POST', body }),
  updateVehicle: (id, body)    => request(`/api/vehicles/${id}`, { method: 'PUT', body }),
  deleteVehicle: (id)          => request(`/api/vehicles/${id}`, { method: 'DELETE' }),

  // Financeiro
  getFinancial:      (params = {}) => request(`/api/admin/financial?${new URLSearchParams(params)}`),
  getFinancialDaily: (params = {}) => request(`/api/admin/financial-daily?${new URLSearchParams(params)}`),

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

  // Catálogo — Rotas de Transfer
  getCatalogRoutes:   ()         => request('/api/catalog/transfer-routes'),
  createCatalogRoute: (body)     => request('/api/catalog/transfer-routes', { method: 'POST', body }),
  updateCatalogRoute: (id, body) => request(`/api/catalog/transfer-routes/${id}`, { method: 'PUT', body }),
  toggleCatalogRoute: (id, flag) => request(`/api/catalog/transfer-routes/${id}`, { method: 'PUT', body: { is_active: flag } }),
}
