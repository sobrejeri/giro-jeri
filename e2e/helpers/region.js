/**
 * Fecha o RegionPicker selecionando Jericoacoara.
 * Chame logo após navegar para uma página que abre o picker automaticamente.
 */
export async function selectJericoacoara(page) {
  const picker = page.locator('text=Onde você está?').first()
  const isVisible = await picker.isVisible().catch(() => false)
  if (!isVisible) return

  await page.locator('text=Jericoacoara').first().click()
  // Aguarda o picker fechar
  await page.waitForSelector('text=Onde você está?', { state: 'hidden', timeout: 5000 }).catch(() => {})
}
