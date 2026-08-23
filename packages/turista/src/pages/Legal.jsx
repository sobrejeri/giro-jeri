import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
      <div className="text-[13px] text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

function Termos() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <Section title={t('legalPg.terms.section1.title')}>
        <p>{t('legalPg.terms.section1.body')}</p>
      </Section>

      <Section title={t('legalPg.terms.section2.title')}>
        <p>{t('legalPg.terms.section2.body')}</p>
      </Section>

      <Section title={t('legalPg.terms.section3.title')}>
        <p>{t('legalPg.terms.section3.body')}</p>
      </Section>

      <Section title={t('legalPg.terms.section4.title')}>
        <p>{t('legalPg.terms.section4.body')}</p>
      </Section>

      <Section title={t('legalPg.terms.section5.title')}>
        <p>{t('legalPg.terms.section5.body')}</p>
      </Section>

      <Section title={t('legalPg.terms.section6.title')}>
        <p>{t('legalPg.terms.section6.body')}</p>
      </Section>

      <Section title={t('legalPg.terms.section7.title')}>
        <p>{t('legalPg.terms.section7.body')}</p>
      </Section>
    </div>
  )
}

function Privacidade() {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <Section title={t('legalPg.privacy.section1.title')}>
        <p>{t('legalPg.privacy.section1.body1')}</p>
        <p>{t('legalPg.privacy.section1.body2')}</p>
      </Section>

      <Section title={t('legalPg.privacy.section2.title')}>
        <p>{t('legalPg.privacy.section2.body')}</p>
      </Section>

      <Section title={t('legalPg.privacy.section3.title')}>
        <p>{t('legalPg.privacy.section3.body')}</p>
      </Section>

      <Section title={t('legalPg.privacy.section4.title')}>
        <p>
          {t('legalPg.privacy.section4.body')} <strong>sobrejeri@gmail.com</strong>.
        </p>
      </Section>

      <Section title={t('legalPg.privacy.section5.title')}>
        <p>{t('legalPg.privacy.section5.body')}</p>
      </Section>

      <Section title={t('legalPg.privacy.section6.title')}>
        <p>{t('legalPg.privacy.section6.body')}</p>
      </Section>
    </div>
  )
}

export default function Legal() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const isPrivacidade = pathname.includes('privacidade')

  return (
    <div className="min-h-full pb-24 lg:pb-10">
      <header className="bg-white px-4 pt-6 pb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto">
          <Link to="/perfil" className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 mb-3">
            <ArrowLeft size={15} /> {t('legalPg.back')}
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              {isPrivacidade ? <ShieldCheck size={18} className="text-brand" /> : <FileText size={18} className="text-brand" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {isPrivacidade ? t('legalPg.privacyTitle') : t('legalPg.termsTitle')}
              </h1>
              <p className="text-[12px] text-gray-400">{t('legalPg.updatedAt', { date: t('legalPg.updatedDate') })}</p>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <Link
              to="/termos"
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${!isPrivacidade ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t('legalPg.termsTitle')}
            </Link>
            <Link
              to="/privacidade"
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${isPrivacidade ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t('legalPg.privacyTab')}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {isPrivacidade ? <Privacidade /> : <Termos />}
        </div>
      </main>
    </div>
  )
}
