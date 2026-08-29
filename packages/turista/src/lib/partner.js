// Atribuição de venda direta por link de operador (/c/<slug>).
// Guardada em localStorage para sobreviver à navegação; expira em 7 dias.
const KEY = 'turiva_partner_v1'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

export function setPartner({ slug, name, photo }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ slug, name, photo: photo || null, ts: Date.now() }))
  } catch { /* storage cheio/indisponível — segue sem atribuição */ }
}

export function getPartner() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p?.slug || Date.now() - (p.ts || 0) > TTL_MS) { clearPartner(); return null }
    return p
  } catch { return null }
}

export function clearPartner() {
  try { localStorage.removeItem(KEY) } catch { /* no-op */ }
}
