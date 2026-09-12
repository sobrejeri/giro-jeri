import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pt from './locales/pt.json'
import en from './locales/en.json'
import es from './locales/es.json'

const STORAGE_KEY = 'giro_lang'

function detectLang() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && ['pt', 'en', 'es'].includes(stored)) return stored
  const browser = navigator.language?.slice(0, 2).toLowerCase()
  if (browser === 'es') return 'es'
  if (browser === 'en') return 'en'
  return 'pt'
}

// Rede de proteção: `fallbackLng` só cobre a chave que existe no pt. Quando ela
// falta nos TRÊS idiomas, o i18next devolve a própria chave e o caminho cru
// ("toursPg.card.fromLabel") vai parar na tela do cliente — foi o que aconteceu
// nos cartões de passeio do PC. Aqui o último trecho da chave vira um rótulo
// legível, então o pior caso passa a ser um texto sem tradução em vez de código.
function textoPadrao(chave) {
  const ultimo = String(chave || '').split('.').pop() || ''
  const legivel = ultimo
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')   // camelCase → palavras
    .replace(/[_-]+/g, ' ')
    .trim()
  if (!legivel) return ''
  // Siglas ficam como estão (CEP, PIX, CPF); o resto vira minúscula, só a
  // primeira palavra com inicial maiúscula.
  return legivel
    .split(' ')
    .map((palavra, i) => {
      if (palavra.length > 1 && palavra === palavra.toUpperCase()) return palavra
      const p = palavra.toLowerCase()
      return i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p
    })
    .join(' ')
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
      es: { translation: es },
    },
    lng:            detectLang(),
    fallbackLng:    'pt',
    interpolation:  { escapeValue: false },
    parseMissingKeyHandler: (chave) => {
      if (import.meta.env.DEV) console.warn('[i18n] chave sem tradução:', chave)
      return textoPadrao(chave)
    },
  })

export function setLang(lang) {
  i18n.changeLanguage(lang)
  localStorage.setItem(STORAGE_KEY, lang)
}

export const LANGS = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English',   flag: '🇺🇸' },
  { code: 'es', label: 'Español',   flag: '🇪🇸' },
]

export default i18n
