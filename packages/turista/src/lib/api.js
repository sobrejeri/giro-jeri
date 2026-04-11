const BASE = import.meta.env.VITE_API_URL || ''

const STORAGE = {
  token:   'giro_token',
  refresh: 'giro_refresh',
  user:    'giro_user',
}

function getToken()   { return localStorage.getItem(STORAGE.token) }
function getRefresh() { return localStorage.getItem(STORAGE.refresh) }

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
    const data = await res.json()
    localStorage.setItem(STORAGE.token,   data.token)
    localStorage.setItem(STORAGE.refresh, data.refresh_token)
    if (data.user) localStorage.setItem(STORAGE.user, JSON.stringify(data.user))
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
  login:    (body) => request('/api/auth/login',    { method: 'POST', body }),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  me:       ()     => request('/api/auth/me'),
  logout:   ()     => request('/api/auth/logout', { method: 'POST' }),

  // Regiões
  getRegions: () => request('/api/regions'),

  // Passeios
  getTours:        (params = {}) => request(`/api/tours?${new URLSearchParams(params)}`),
  getTour:         (id)          => request(`/api/tours/${id}`),
  getTourVehicles: (id)          => request(`/api/tours/${id}/vehicles`),
  calculateTour:   (id, body)    => request(`/api/tours/${id}/calculate`, { method: 'POST', body }),

  // Transfers
  getTransfers:       (params = {}) => request(`/api/transfers?${new URLSearchParams(params)}`),
  getTransferRoutes:  (params = {}) => request(`/api/transfers/routes?${new URLSearchParams(params)}`),
  calculateTransfer:  (body)        => request('/api/transfers/calculate', { method: 'POST', body }),
  requestQuote:       (body)        => request('/api/transfers/quotes',    { method: 'POST', body }),
  getMyQuotes:        ()            => request('/api/transfers/quotes'),
  acceptQuote:        (id)          => request(`/api/transfers/quotes/${id}/accept`, { method: 'POST' }),
  rejectQuote:        (id, body)    => request(`/api/transfers/quotes/${id}/reject`, { method: 'POST', body }),

  // Reservas
  createBooking: (body) => request('/api/bookings',     { method: 'POST', body }),
  getMyBookings: ()     => request('/api/bookings'),
  getBooking:    (id)   => request(`/api/bookings/${id}`),
  cancelBooking: (id, body) => request(`/api/bookings/${id}/cancel`, { method: 'POST', body }),
}
