import { test, expect } from '@playwright/test'
import { selectJericoacoara } from './helpers/region.js'

test.describe('Home — Catálogo', () => {
  test('exibe cards de Passeios e Transfers após seleção de região', async ({ page }) => {
    await page.goto('/')
    await selectJericoacoara(page)

    // Usa os subtítulos únicos dos cards principais para evitar conflito com nav/header hidden
    await expect(page.locator('button:has-text("Buggy")')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('button:has-text("Aeroporto · Hotel")')).toBeVisible({ timeout: 8000 })
  })

  test('navega para lista de passeios ao clicar no card de Passeios', async ({ page }) => {
    await page.goto('/')
    await selectJericoacoara(page)

    await page.locator('button:has-text("Buggy")').click()
    await expect(page).toHaveURL(/\/passeios/, { timeout: 8000 })
  })

  test('navega para lista de transfers ao clicar no card de Transfers', async ({ page }) => {
    await page.goto('/')
    await selectJericoacoara(page)

    await page.locator('button:has-text("Aeroporto · Hotel")').click()
    await expect(page).toHaveURL(/\/transfers/, { timeout: 8000 })
  })

  test('RegionPicker: seleção de Jijoca fecha o modal', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Onde você está?')).toBeVisible({ timeout: 5000 })
    await page.locator('text=Jijoca de Jericoacoara').click()
    await expect(page.locator('text=Onde você está?')).toBeHidden({ timeout: 5000 })
  })

  test('RegionPicker: seleção de Jericoacoara fecha o modal', async ({ page }) => {
    await page.goto('/')
    await selectJericoacoara(page)
    await expect(page.locator('text=Onde você está?')).toBeHidden({ timeout: 5000 })
  })

  test('exibe passeios em destaque após seleção de região', async ({ page }) => {
    await page.goto('/')
    await selectJericoacoara(page)
    await expect(page.locator('text=Passeios em destaque')).toBeVisible({ timeout: 8000 })
  })
})
