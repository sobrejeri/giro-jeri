import { expect } from '@playwright/test'

/**
 * Faz login via UI e armazena credenciais no localStorage.
 * Chame no início de testes que exigem autenticação.
 */
export async function loginAs(page, { email, password }) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('form button[type="submit"], form button:has-text("Entrar")').click()
  // Aguarda redirecionamento para home
  await expect(page).toHaveURL(/^\/(home)?$/, { timeout: 10000 })
}

/**
 * Injeta token JWT diretamente no localStorage (mais rápido que login via UI).
 * Ideal para testes que não testam o fluxo de autenticação em si.
 */
export async function injectAuth(page, { token, refreshToken, user }) {
  await page.goto('/')
  await page.evaluate(({ token, refreshToken, user }) => {
    localStorage.setItem('giro_token', token)
    localStorage.setItem('giro_refresh', refreshToken)
    localStorage.setItem('giro_user', JSON.stringify(user))
  }, { token, refreshToken, user })
}

export async function logout(page) {
  await page.evaluate(() => {
    localStorage.removeItem('giro_token')
    localStorage.removeItem('giro_refresh')
    localStorage.removeItem('giro_user')
  })
}
