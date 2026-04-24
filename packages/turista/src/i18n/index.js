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
  })

export function setLang(lang) {
  i18n.changeLanguage(lang)
  localStorage.setItem(STORAGE_KEY, lang)
}

export const LANGS = [
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'en', label: 'English',   flag: '🇺🇸' },
  { code: 'es', label: 'Español',   flag: '🇦🇷' },
]

export default i18n
