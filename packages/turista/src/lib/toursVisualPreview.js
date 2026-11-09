// A comparação é opt-in: o público não vê o redesign até ele ser aprovado.
const ENABLED_KEY = 'turiva.loja-preview.enabled'
const VARIANT_KEY = 'turiva.loja-preview.variant'

function localValue(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}

export function readToursVisualPreview(search = '') {
  const params = new URLSearchParams(search)
  const enabled = params.get('turivaPreview') === '1' || localValue(ENABLED_KEY) === '1'
  const requested = params.get('variant')
  const variant = requested === 'original' || requested === 'novo'
    ? requested
    : localValue(VARIANT_KEY) === 'original' ? 'original' : 'novo'

  return { enabled, variant, isNew: enabled && variant === 'novo' }
}

export function saveToursVisualPreview(variant) {
  if (variant !== 'original' && variant !== 'novo') return
  try {
    window.localStorage.setItem(ENABLED_KEY, '1')
    window.localStorage.setItem(VARIANT_KEY, variant)
  } catch { /* Armazenamento opcional: a URL ainda permite comparar. */ }
}

export function clearToursVisualPreview() {
  try {
    window.localStorage.removeItem(ENABLED_KEY)
    window.localStorage.removeItem(VARIANT_KEY)
  } catch { /* A URL sem parâmetros volta à versão pública. */ }
}
