// Marketing: Pixel (Meta/Google) + feed de catálogo para anúncios dinâmicos.
//
// Trava o essencial para o "quem viu o passeio X" casar com "anúncio do passeio
// X": os IDs públicos saem no /settings/public, o feed existe e expõe as colunas
// que a Meta/Google exigem (com preço E imagem), e o app do turista carrega os
// pixels e dispara os eventos de conversão. Asserção de fonte (sem API real).

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const settings  = read('../src/routes/settings.js')
const feed      = read('../src/routes/marketing.js')
const index     = read('../src/index.js')
const mkt       = read('../../turista/src/lib/marketing.js')
const appJsx    = read('../../turista/src/App.jsx')
const sucesso   = read('../../turista/src/pages/checkout/CheckoutSucesso.jsx')
const tourDet   = read('../../turista/src/pages/TourDetail.jsx')

test('os IDs de marketing saem no /settings/public (são públicos)', () => {
  for (const k of ['marketing_meta_pixel_id', 'marketing_ga4_id', 'marketing_google_ads_id', 'marketing_google_ads_purchase_label']) {
    assert.match(settings, new RegExp(`'${k}'`), `${k} precisa estar no PUBLIC_KEYS`)
  }
})

test('o feed de catálogo existe (CSV + JSON) e está montado', () => {
  assert.match(feed, /router\.get\('\/catalog\.csv'/)
  assert.match(feed, /router\.get\('\/catalog\.json'/)
  assert.match(index, /app\.use\('\/api\/marketing', marketingRoutes\)/, 'rota montada no index.js')
})

test('o feed só inclui passeio ATIVO, com preço E imagem', () => {
  assert.match(feed, /\.eq\('is_active', true\)/, 'só passeios ativos')
  assert.match(feed, /if \(!preco \|\| !img\) continue/, 'sem preço ou imagem → fora do feed (a Meta/Google rejeitam)')
})

test('o feed inclui passeios E transfers (rotas de translado ativas)', () => {
  assert.match(feed, /from\('tours'\)/, 'passeios no feed')
  assert.match(feed, /from\('transfer_routes'\)/, 'rotas de translado no feed')
  assert.match(feed, /\$\{TURISTA_APP\}\/transfers/, 'o item de transfer leva à aba de translados')
  assert.match(feed, /Promise\.allSettled\(\[itensDeTours\(\), itensDeTransfers\(\)\]\)/,
    'uma parte falhar não derruba a outra (feed é consumido por crawler externo)')
})

test('o feed expõe as colunas do catálogo e o link aponta pro site', () => {
  for (const col of ["'id'", "'title'", "'price'", "'link'", "'image_link'"]) {
    assert.match(feed, new RegExp(col), `coluna ${col} ausente no feed`)
  }
  assert.match(feed, /TURISTA_APP_URL/, 'o link base vem da env do site do turista')
  assert.match(feed, /\$\{preco\.toFixed\(2\)\} BRL/, 'preço no formato que a Meta/Google esperam')
})

test('o app do turista carrega os pixels e tem os eventos de conversão', () => {
  assert.match(mkt, /export function initMarketing/)
  assert.match(mkt, /export function trackPageView/)
  assert.match(mkt, /export function trackViewContent/)
  assert.match(mkt, /export function trackPurchase/)
  assert.match(mkt, /fbq\('init'/, 'inicializa o Pixel da Meta')
  assert.match(mkt, /gtag\('config'/, 'configura o Google (GA4/Ads)')
})

test('os eventos estão ligados nas telas certas', () => {
  assert.match(appJsx, /<MarketingTracker/, 'PageView por rota no App')
  assert.match(appJsx, /initMarketing\(settings\)/, 'init a partir das settings públicas')
  assert.match(tourDet, /trackViewContent\(/, 'ViewContent no detalhe do passeio')
  assert.match(sucesso, /trackPurchase\(/, 'Purchase na tela de sucesso')
})
