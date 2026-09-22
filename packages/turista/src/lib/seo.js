// ── seo.js ──────────────────────────────────────────────
// Atualiza título, meta description, Open Graph e dados estruturados (JSON-LD)
// por página, para indexação no Google e prévia de link mais rica. Restaura os
// valores originais ao sair da página.
//
// Observação honesta: como o app é SPA, redes que NÃO executam JS (WhatsApp,
// Facebook) leem só a meta ESTÁTICA do index.html; estas tags dinâmicas valem
// para o Google (que renderiza JS) e para o título da aba. Prévia social 100%
// exige SSR/prerender (ex.: páginas estáticas em turivabrasil.com).

const TITLE_BASE = 'Turiva'

function setMeta(attr, key, content) {
  if (content == null) return null
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  const criado = !el
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  const anterior = el.getAttribute('content')
  el.setAttribute('content', content)
  return { el, criado, anterior }
}

export function setSEO({ title, description, image, url, jsonLd } = {}) {
  const restauros = []
  const tituloAnterior = document.title
  if (title) document.title = `${title} · ${TITLE_BASE}`

  restauros.push(setMeta('name', 'description', description))
  restauros.push(setMeta('property', 'og:title', title ? `${title} · ${TITLE_BASE}` : null))
  restauros.push(setMeta('property', 'og:description', description))
  restauros.push(setMeta('property', 'og:image', image))
  restauros.push(setMeta('property', 'og:url', url))
  restauros.push(setMeta('name', 'twitter:image', image))

  let scriptLd = null
  if (jsonLd) {
    scriptLd = document.createElement('script')
    scriptLd.type = 'application/ld+json'
    scriptLd.text = JSON.stringify(jsonLd)
    document.head.appendChild(scriptLd)
  }

  // Cleanup: desfaz o que criou e restaura o que alterou.
  return () => {
    document.title = tituloAnterior
    for (const r of restauros) {
      if (!r) continue
      if (r.criado) r.el.remove()
      else if (r.anterior != null) r.el.setAttribute('content', r.anterior)
    }
    if (scriptLd) scriptLd.remove()
  }
}
