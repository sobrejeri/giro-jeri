// A comparação é opt-in: a home pública continua intacta até a aprovação.
const ENABLED_KEY = 'turiva.home-visual-preview.enabled'
const VARIANT_KEY = 'turiva.home-visual-preview.variant'

function readStorage(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function readHomeVisualPreview(search = '') {
  const params = new URLSearchParams(search)
  const previewLink = params.get('turivaPreview') === '1'
  const enabled = previewLink || readStorage(ENABLED_KEY) === '1'
  const requested = params.get('variant')
  const variant = requested === 'original' || requested === 'novo'
    ? requested
    : readStorage(VARIANT_KEY) === 'original' ? 'original' : 'novo'

  return { enabled, variant, isNew: enabled && variant === 'novo' }
}

export function saveHomeVisualPreview(variant) {
  if (variant !== 'original' && variant !== 'novo') return
  try {
    window.localStorage.setItem(ENABLED_KEY, '1')
    window.localStorage.setItem(VARIANT_KEY, variant)
  } catch {
    // A comparação continua navegável mesmo sem armazenamento disponível.
  }
}

export function closeHomeVisualPreview() {
  try {
    window.localStorage.removeItem(ENABLED_KEY)
    window.localStorage.removeItem(VARIANT_KEY)
  } catch {
    // Navegar para a home limpa a seleção da URL.
  }
}
