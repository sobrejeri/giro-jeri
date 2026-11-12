import { useTranslation } from 'react-i18next'
import { setLang, LANGS } from '../i18n/index.js'

// Idioma à mão no cabeçalho laranja da Lojinha (Passeios, Translados, Vagas),
// logo abaixo da lupa, do sino e do carrinho: bandeira + sigla. É a mesma troca
// do cartão "Idioma" do Perfil (setLang), que guarda a escolha neste aparelho.
export default function HeaderLanguagePicker() {
  const { t, i18n } = useTranslation()
  const atual = (i18n.resolvedLanguage || i18n.language || 'pt').slice(0, 2)
  return (
    <div role="group" aria-label={t('profile.language')} className="t2026-langs">
      {LANGS.map((lang) => {
        const sigla = lang.code.toUpperCase()
        const ativo = atual === lang.code
        return (
          <button
            key={lang.code}
            type="button"
            lang={lang.code}
            aria-label={`${lang.label} (${sigla})`}
            aria-pressed={ativo}
            onClick={() => { if (!ativo) setLang(lang.code) }}
          >
            <span aria-hidden="true">{lang.flag}</span>
            {sigla}
          </button>
        )
      })}
    </div>
  )
}
