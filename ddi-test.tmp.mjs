import { chromium } from '@playwright/test'
const SHOT = (n) => `/tmp/claude-0/-home-user-giro-jeri/53751933-0995-52ad-a3e6-6833fa6891e8/scratchpad/${n}`
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.route('**/api/**', (r) => r.fulfill({ contentType: 'application/json', body: '{}' }))

// 1) Cadastro (Auth)
await page.goto('http://localhost:5173/cadastro', { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(1500)
const ddiBtn = page.getByRole('button', { name: 'Escolher código do país' })
console.log('— Cadastro —')
console.log('Botão DDI visível:', await ddiBtn.isVisible().catch(() => false))
console.log('Default:', (await ddiBtn.textContent().catch(() => '')).trim())
await ddiBtn.click()
await page.waitForTimeout(400)
console.log('Dropdown + busca:', await page.getByPlaceholder('Buscar país ou código…').isVisible().catch(() => false))
await page.screenshot({ path: SHOT('ddi-open.png') })
await page.getByPlaceholder('Buscar país ou código…').fill('portu')
await page.waitForTimeout(300)
await page.getByText('Portugal').click()
await page.waitForTimeout(300)
console.log('Trocou p/ +351:', (await ddiBtn.textContent().catch(() => '')).includes('+351'))

// busca por código
await ddiBtn.click()
await page.getByPlaceholder('Buscar país ou código…').fill('49')
await page.waitForTimeout(300)
console.log('Busca "49" → Alemanha:', await page.getByText('Alemanha').isVisible().catch(() => false))
await page.keyboard.press('Escape')
await page.mouse.click(10, 10)

// 2) Perfil logado — parse de valor existente +351...
await page.evaluate(() => {
  localStorage.setItem('giro_token', 'tok')
  localStorage.setItem('giro_user', JSON.stringify({ id: 'u1', full_name: 'Denilson', email: 'x@y.z', phone: '+351 912345678', user_type: 'tourist' }))
})
await page.goto('http://localhost:5173/perfil', { timeout: 30000 }).catch(() => {})
await page.waitForTimeout(1500)
// abre edição
await page.getByText(/Editar/i).first().click().catch(async () => {
  await page.locator('button:has(svg.lucide-pencil)').first().click().catch(() => {})
})
await page.waitForTimeout(800)
const ddiBtn2 = page.getByRole('button', { name: 'Escolher código do país' }).first()
console.log('— Perfil (valor salvo +351) —')
console.log('Botão DDI no perfil:', await ddiBtn2.isVisible().catch(() => false))
console.log('Parse mostra +351:', (await ddiBtn2.textContent().catch(() => '')).includes('+351'))
await page.screenshot({ path: SHOT('ddi-perfil.png') })
await browser.close()
