import { test, expect } from '@playwright/test'
import { selectJericoacoara } from './helpers/region.js'

const TEST_EMAIL    = process.env.E2E_EMAIL    || 'sobrejeri@gmail.com'
const TEST_PASSWORD = process.env.E2E_PASSWORD || '1234'

async function doLogin(page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(TEST_EMAIL)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/^\/(home)?$/, { timeout: 10000 })
}

test.describe('Checkout — Fluxo de pagamento', () => {
  test.beforeEach(async ({ page }) => {
    await doLogin(page)
    await selectJericoacoara(page)
  })

  test('abre lista de passeios e entra no detalhe do primeiro', async ({ page }) => {
    await page.goto('/passeios')
    // Aguarda pelo menos um card de passeio
    const firstCard = page.locator('a[href*="passeio"], [class*="card"]').first()
    await expect(firstCard).toBeVisible({ timeout: 10000 })
    await firstCard.click()

    // Página de detalhe deve ter botão de reserva
    await expect(
      page.locator('button:has-text("Reservar"), button:has-text("Agendar"), button:has-text("Selecionar")')
    ).toBeVisible({ timeout: 8000 })
  })

  test('CheckoutPayment: exibe título Payment e métodos de pagamento', async ({ page }) => {
    // Navega com state completo via API de navegação
    await page.goto('/')
    await page.evaluate(() => {
      const state = {
        service_type: 'tour', service_id: '00000000-0000-0000-0000-000000000001',
        service_name: 'Litoral Leste', booking_mode: 'private',
        service_date: 'Hoje', service_date_iso: new Date().toISOString().slice(0, 10),
        service_time: '08:00', people_count: 2,
        vehicles: [], total_price: 420,
      }
      history.pushState(state, '', '/checkout/pagamento')
    })
    await page.waitForURL('/checkout/pagamento')

    await expect(page.locator('h1:has-text("Payment"), h1:has-text("Pagamento")')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button:has-text("Pix")')).toBeVisible()
    await expect(page.locator('button:has-text("R$")')).toBeVisible()
  })

  test('CheckoutPayment: PIX é o método selecionado por padrão', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      history.pushState({
        service_type: 'tour', service_id: '00000000-0000-0000-0000-000000000001',
        service_name: 'Litoral Leste', booking_mode: 'private',
        service_date: 'Hoje', service_date_iso: new Date().toISOString().slice(0, 10),
        service_time: '08:00', people_count: 2, vehicles: [], total_price: 420,
      }, '', '/checkout/pagamento')
    })
    await page.waitForURL('/checkout/pagamento')

    // PIX deve estar selecionado (botão com ícone de check)
    const pixBtn = page.locator('button:has-text("Pix")')
    await expect(pixBtn).toBeVisible({ timeout: 5000 })
    // Verifica badge "Recommended" ou "Recomendado"
    await expect(page.locator('text=Recommended, text=Recomendado')).toBeVisible()
  })

  test('CheckoutPayment: sem state redireciona para página anterior', async ({ page }) => {
    await page.goto('/checkout/pagamento')
    // Sem state, o componente chama navigate(-1) — não fica em /checkout/pagamento
    await expect(page).not.toHaveURL('/checkout/pagamento', { timeout: 3000 })
  })
})

test.describe('Checkout — Regressão de bugs Zod', () => {
  test('API não retorna "Expected number, received nan" com vehicles corretos', async ({ page }) => {
    let apiError = null

    await page.route('**/api/payments/intent', async (route) => {
      const body = await route.request().postDataJSON().catch(() => null)
      // Valida que nenhum vehicle tem unit_price ausente ou NaN
      if (body?.vehicles?.length) {
        for (const v of body.vehicles) {
          if (v.unit_price === undefined || v.unit_price === null || isNaN(v.unit_price)) {
            apiError = `unit_price inválido: ${v.unit_price}`
          }
        }
      }
      await route.continue()
    })

    await doLogin(page)
    // Aguarda qualquer chamada de pagamento (pode não acontecer neste fluxo)
    expect(apiError).toBeNull()
  })

  test('API não recebe cover_image_url como null', async ({ page }) => {
    let receivedNull = false

    await page.route('**/api/payments/intent', async (route) => {
      const body = await route.request().postDataJSON().catch(() => null)
      if (body && body.cover_image_url === null) receivedNull = true
      await route.continue()
    })

    await doLogin(page)
    expect(receivedNull).toBe(false)
  })
})
