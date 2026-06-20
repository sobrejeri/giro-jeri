import { test, expect } from '@playwright/test'

const TEST_EMAIL    = process.env.E2E_EMAIL    || 'sobrejeri@gmail.com'
const TEST_PASSWORD = process.env.E2E_PASSWORD || '1234'

// toHaveURL com regex verifica a URL completa (incluindo http://localhost:5173)
// Usar waitForURL com função de path é mais robusto
async function waitForHome(page, timeout = 10000) {
  await page.waitForURL(
    url => ['/', '/home', ''].includes(new URL(url).pathname.replace(/\/$/, '') || '/'),
    { timeout }
  )
}

test.describe('Autenticação', () => {
  test('página de login é acessível sem autenticação', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('login com credenciais válidas redireciona para home', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(TEST_EMAIL)
    await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await waitForHome(page)
    expect(['/', '/home']).toContain(new URL(page.url()).pathname)
  })

  test('login com senha errada permanece em /login', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(TEST_EMAIL)
    await page.locator('input[type="password"]').fill('senhaerrada999')
    await page.locator('button[type="submit"]').click()

    // Aguarda qualquer redirecionamento possível e verifica que ficou em /login
    await page.waitForTimeout(3000)
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  test('rota protegida redireciona para login quando não autenticado', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/minhas-reservas')
    await page.waitForURL('**/login', { timeout: 5000 })
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  test('após login, acessar /minhas-reservas funciona', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(TEST_EMAIL)
    await page.locator('input[type="password"]').fill(TEST_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await waitForHome(page)

    await page.goto('/minhas-reservas')
    await page.waitForTimeout(1000)
    expect(new URL(page.url()).pathname).not.toBe('/login')
  })
})
