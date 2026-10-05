// ── marketing.js ───────────────────────────────────────
// Pixels/tags de marketing (Meta Pixel + Google GA4/Ads). Os IDs vêm das
// settings públicas (admin → Marketing), então trocar um ID NÃO exige redeploy.
//
// Tudo é best-effort e silencioso: sem ID, nada carrega; qualquer erro é
// engolido para nunca derrubar o app. Os eventos casam com o feed de catálogo
// (content_ids = id do passeio), que é o que liga "quem viu X" ao "anúncio de X".

let GA4_ID = null
let ADS_ID = null
let ADS_LABEL = null
let inited = false

function loadMetaPixel(id) {
  if (window.fbq) return
  /* Pixel base code da Meta (oficial), com a fila até o fbevents.js carregar. */
  ;(function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []
    t = b.createElement(e); t.async = !0; t.src = v
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  window.fbq('init', id)
  window.fbq('track', 'PageView')
}

function loadGtag(ids) {
  if (!window.gtag) {
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0])}`
    document.head.appendChild(s)
    window.dataLayer = window.dataLayer || []
    window.gtag = function () { window.dataLayer.push(arguments) }
    window.gtag('js', new Date())
  }
  for (const id of ids) window.gtag('config', id)
}

// Injeta os scripts uma única vez, a partir do mapa de settings públicas.
export function initMarketing(settings) {
  try {
    if (inited || !settings) return
    const meta = String(settings.marketing_meta_pixel_id || '').trim() || null
    GA4_ID    = String(settings.marketing_ga4_id || '').trim() || null
    ADS_ID    = String(settings.marketing_google_ads_id || '').trim() || null
    ADS_LABEL = String(settings.marketing_google_ads_purchase_label || '').trim() || null
    if (!meta && !GA4_ID && !ADS_ID) return   // nada configurado → não carrega nada
    inited = true
    if (meta) loadMetaPixel(meta)
    const gids = [GA4_ID, ADS_ID].filter(Boolean)
    if (gids.length) loadGtag(gids)
  } catch { /* silencioso */ }
}

// Visita de página (SPA): o carregamento inicial já dispara 1 PageView dentro
// do loadMetaPixel/gtag; esta função é para as trocas de rota seguintes.
export function trackPageView() {
  try {
    if (window.fbq) window.fbq('track', 'PageView')
    if (window.gtag && GA4_ID) window.gtag('event', 'page_view')
  } catch { /* silencioso */ }
}

export function trackViewContent({ id, name, value, currency = 'BRL' } = {}) {
  try {
    const v = Number(value) || undefined
    if (window.fbq) window.fbq('track', 'ViewContent', {
      content_ids: id ? [id] : undefined, content_name: name, content_type: 'product', value: v, currency,
    })
    if (window.gtag && GA4_ID) window.gtag('event', 'view_item', {
      currency, value: v, items: id ? [{ item_id: id, item_name: name }] : undefined,
    })
  } catch { /* silencioso */ }
}

export function trackInitiateCheckout({ value, currency = 'BRL', ids } = {}) {
  try {
    const v = Number(value) || undefined
    if (window.fbq) window.fbq('track', 'InitiateCheckout', { value: v, currency, content_ids: ids })
    if (window.gtag && GA4_ID) window.gtag('event', 'begin_checkout', { currency, value: v })
  } catch { /* silencioso */ }
}

export function trackPurchase({ value, currency = 'BRL', ids, transactionId } = {}) {
  try {
    const v = Number(value) || undefined
    if (window.fbq) window.fbq('track', 'Purchase', { value: v, currency, content_ids: ids, content_type: 'product' })
    if (window.gtag && GA4_ID) window.gtag('event', 'purchase', { transaction_id: transactionId, value: v, currency })
    if (window.gtag && ADS_ID && ADS_LABEL) {
      const sendTo = ADS_LABEL.includes('/') ? ADS_LABEL : `${ADS_ID}/${ADS_LABEL}`
      window.gtag('event', 'conversion', { send_to: sendTo, value: v, currency, transaction_id: transactionId })
    }
  } catch { /* silencioso */ }
}
