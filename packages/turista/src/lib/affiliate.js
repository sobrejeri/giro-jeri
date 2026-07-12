// Atribuição do programa de afiliados (/a/<CÓDIGO> ou código digitado).
// Guardada em localStorage para sobreviver à navegação; expira em 30 dias
// (janela combinada: quem indicou ganha sobre reservas pagas nesse período).
const KEY = 'turiva_affiliate_v1'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

export function setAffiliate({ code, name }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, name: name || null, ts: Date.now() }))
  } catch { /* storage cheio/indisponível — segue sem atribuição */ }
}

export function getAffiliate() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const a = JSON.parse(raw)
    if (!a?.code || Date.now() - (a.ts || 0) > TTL_MS) { clearAffiliate(); return null }
    return a
  } catch { return null }
}

export function clearAffiliate() {
  try { localStorage.removeItem(KEY) } catch { /* no-op */ }
}
