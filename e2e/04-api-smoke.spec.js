import { test, expect } from '@playwright/test'

// Smoke tests diretos na API (sem browser)
// Requer que a API esteja rodando em localhost:3001
const API = process.env.E2E_API_URL || 'http://localhost:3001'

test.describe('API — Smoke tests', () => {
  test('GET /health responde 200', async ({ request }) => {
    const res = await request.get(`${API}/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'ok' })
  })

  test('GET /api/tours retorna lista de passeios', async ({ request }) => {
    const res = await request.get(`${API}/api/tours`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data ?? body)).toBe(true)
  })

  test('POST /api/payments/intent sem auth retorna 401', async ({ request }) => {
    const res = await request.post(`${API}/api/payments/intent`, {
      data: { service_type: 'tour', service_id: 'abc', total_price: 100 },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /api/auth/login com credenciais inválidas retorna 401', async ({ request }) => {
    const res = await request.post(`${API}/api/auth/login`, {
      data: { email: 'naoexiste@x.com', password: 'senha_errada' },
    })
    expect([401, 400]).toContain(res.status())
  })

  test('POST /api/payments/intent payload inválido retorna 400 com mensagem', async ({ request }) => {
    // Autentica primeiro
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: {
        email:    process.env.E2E_EMAIL    || 'teste@girojeri.com.br',
        password: process.env.E2E_PASSWORD || 'Teste@123',
      },
    })
    if (loginRes.status() !== 200) {
      test.skip(true, 'Usuário de teste não disponível')
      return
    }
    const { token } = await loginRes.json()

    // Envia payload com total_price ausente — deve retornar 400
    const res = await request.post(`${API}/api/payments/intent`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        service_type:     'tour',
        service_id:       '00000000-0000-0000-0000-000000000001',
        service_date_iso: '2026-06-17',
        // total_price omitido intencionalmente
      },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  test('POST /api/payments/intent veículos com unit_price não causa erro Zod', async ({ request }) => {
    const loginRes = await request.post(`${API}/api/auth/login`, {
      data: {
        email:    process.env.E2E_EMAIL    || 'teste@girojeri.com.br',
        password: process.env.E2E_PASSWORD || 'Teste@123',
      },
    })
    if (loginRes.status() !== 200) {
      test.skip(true, 'Usuário de teste não disponível')
      return
    }
    const { token } = await loginRes.json()

    // Payload com vehicles contendo unit_price — não deve retornar "Expected number, received nan"
    const res = await request.post(`${API}/api/payments/intent`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        service_type:     'tour',
        service_id:       '00000000-0000-0000-0000-000000000001',
        service_date_iso: '2026-06-17',
        total_price:      420,
        vehicles: [
          { vehicle_id: '00000000-0000-0000-0000-000000000002', qty: 1, unit_price: 420 },
        ],
      },
    })

    // Não deve ser erro de validação Zod (400 com "Expected number")
    if (res.status() === 400) {
      const body = await res.json()
      expect(body.error).not.toMatch(/Expected number|received nan/i)
    }
  })
})
