// O visual novo da Lojinha é o PADRÃO para todos (aprovado pelo dono em
// 12/11/2026). A comparação segue opt-in (?turivaPreview=1): só nela dá para
// escolher "Original" — é o caminho de volta imediato se um dia precisar.
// Para voltar o público inteiro ao visual antigo, basta trocar esta constante.
export const TOURS_VISUAL_DEFAULT = 'novo'

const ENABLED_KEY = 'turiva.loja-preview.enabled'
const VARIANT_KEY = 'turiva.loja-preview.variant'

function localValue(key) {
  try { return window.localStorage.getItem(key) } catch { return null }
}

const isVariant = (v) => v === 'original' || v === 'novo'

export function readToursVisualPreview(search = '') {
  const params = new URLSearchParams(search)
  const enabled = params.get('turivaPreview') === '1' || localValue(ENABLED_KEY) === '1'
  const requested = params.get('variant')
  const stored = localValue(VARIANT_KEY)
  // Fora da comparação ninguém escolhe o visual: todos veem o padrão.
  const variant = !enabled ? TOURS_VISUAL_DEFAULT
    : isVariant(requested) ? requested
    : isVariant(stored) ? stored
    : TOURS_VISUAL_DEFAULT

  return { enabled, variant, isNew: variant === 'novo' }
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
