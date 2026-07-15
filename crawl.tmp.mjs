import { chromium } from '@playwright/test'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

async function crawl(name, base, storagePrefix, userType, pages) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = {}
  let current = '(init)'
  page.on('pageerror', (e) => { (errors[current] ||= []).push(String(e).slice(0, 180)) })
  await page.route('**/api/admin/users**', (r) => r.fulfill({ contentType: 'application/json', body: '{"users":[],"total":0}' }))
  await page.route('**/api/bookings**', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.route('**/api/operator/**', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.route('**/api/affiliate/me', (r) => r.fulfill({ contentType: 'application/json', body: '{"code":null,"percent":5,"commissions":[],"totals":{"pending":0,"paid":0}}' }))
  await page.route('**/api/**', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }))
  await page.addInitScript(([pfx, ut]) => {
    localStorage.setItem(`${pfx}_token`, 'tok')
    localStorage.setItem(`${pfx}_user`, JSON.stringify({ id: 'u1', full_name: 'Teste', email: 'x@y.z', user_type: ut, phone: '+5588999998888' }))
  }, [storagePrefix, userType])

  console.log(`\n═══ ${name} ═══`)
  for (const p of pages) {
    current = p
    await page.goto(`${base}${p}`, { timeout: 20000 }).catch((e) => { (errors[p] ||= []).push('NAV: ' + String(e).slice(0, 100)) })
    await page.waitForTimeout(1200)
    const text = (await page.locator('body').innerText().catch(() => '')).trim()
    const blank = text.length < 30
    console.log(`${errors[p]?.length ? '❌' : blank ? '⚠️ vazia' : '✓'}  ${p || '/'}${blank && !errors[p] ? ` [${JSON.stringify(text.slice(0, 40))}]` : ''}`)
    if (errors[p]) errors[p].forEach((e) => console.log('     →', e))
  }
  await page.close()
}

await crawl('TURISTA', 'http://localhost:5173', 'giro', 'tourist',
  ['/', '/eventos', '/passeios', '/transfers', '/carrinho', '/minhas-reservas', '/perfil',
   '/afiliado', '/login', '/cadastro', '/termos', '/privacidade', '/checkout/resumo'])

await crawl('COOPERATIVA', 'http://localhost:5175', 'giro_coop', 'operator',
  ['/dashboard', '/reservas', '/despacho', '/veiculos', '/financeiro', '/passeios', '/rotas', '/perfil', '/login'])

await browser.close()
