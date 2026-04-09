const BASE = import.meta.env.VITE_API_URL || ''

function getToken() {
  return localStorage.getItem('giro_token')
}

async function request(path, options = {}) {
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
    localStorage.removeItem('giro_token')
    localStorage.removeItem('giro_user')
    window.location.href = '/login'
    return null
  }

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
}
