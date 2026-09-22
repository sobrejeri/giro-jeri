// Prioridade da lojinha do operador (janela de 45s no aceite).
// Diferente do "partner" (venda direta sem fila): aqui a reserva segue o
// fluxo normal, mas fica exclusiva do operador por ~45s. Guardado por pouco
// tempo (a intenção é a compra atual).
const KEY = 'turiva_preferred_op_v1'
const TTL_MS = 6 * 60 * 60 * 1000

export function setPreferredOp({ id, name, photo }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, name, photo: photo || null, ts: Date.now() }))
  } catch { /* storage indisponível */ }
}

export function getPreferredOp() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p?.id || Date.now() - (p.ts || 0) > TTL_MS) { clearPreferredOp(); return null }
    return p
  } catch { return null }
}

export function clearPreferredOp() {
  try { localStorage.removeItem(KEY) } catch { /* no-op */ }
}
