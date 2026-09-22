// Estado "já visto" dos stories efêmeros (por dispositivo).
const SEEN_KEY = 'giro_seen_stories'

export function getSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')) } catch { return new Set() }
}

export function markSeen(id) {
  try {
    const s = getSeen(); s.add(id)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]))
  } catch { /* ignora */ }
}
