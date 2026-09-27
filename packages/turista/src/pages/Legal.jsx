import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, FileText, ShieldCheck, XCircle } from 'lucide-react'
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

// Política de cancelamento — taxa cresce conforme a proximidade do serviço.
// Sem i18n de propósito: texto legal fixo em pt-BR.
function LinhaTaxa({ quando, taxa, cor = 'text-gray-800' }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-[13px] text-gray-600">{quando}</span>
      <span className={`text-[13px] font-bold ${cor}`}>{taxa}</span>
    </div>
  )
}

function Cancelamento() {
  return (
    <div className="space-y-6">
      <Section title="Como funciona">
        <p>
          Você pode cancelar uma reserva a qualquer momento. A taxa de cancelamento
          depende de <strong>quanto falta para o serviço</strong>: quanto mais perto,
          maior a taxa — porque o operador já se organizou para te atender. O restante
          do valor é estornado.
        </p>
      </Section>

      <Section title="Translados (transfer)">
        <div className="bg-gray-50 rounded-xl px-3 py-1">
          <LinhaTaxa quando="7 dias ou mais de antecedência" taxa="Sem taxa" cor="text-emerald-600" />
          <LinhaTaxa quando="De 48h a 7 dias" taxa="2%" />
          <LinhaTaxa quando="De 24h a 48h" taxa="5%" />
          <LinhaTaxa quando="De 12h a 24h" taxa="7%" />
          <LinhaTaxa quando="Menos de 12h" taxa="10%" cor="text-red-500" />
        </div>
      </Section>

      <Section title="Passeios">
        <div className="bg-gray-50 rounded-xl px-3 py-1">
          <LinhaTaxa quando="Mais de 1 hora de antecedência" taxa="Sem taxa" cor="text-emerald-600" />
          <LinhaTaxa quando="De 30 min a 1 hora" taxa="2%" />
          <LinhaTaxa quando="De 5 a 30 min" taxa="5%" />
          <LinhaTaxa quando="Menos de 5 min" taxa="7%" cor="text-red-500" />
        </div>
      </Section>

      <Section title="Observações">
        <p>
          A taxa incide sobre o valor total da reserva e é descontada do estorno.
          Reservas ainda <strong>aguardando aceite</strong> (não pagas) podem ser
          canceladas sem qualquer custo. Em caso de cancelamento pelo operador ou por
          força maior, o valor é estornado integralmente.
        </p>
      </Section>
    </div>
  )
}

export default function Legal() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const isPrivacidade  = pathname.includes('privacidade')
  const isCancelamento = pathname.includes('cancelamento')

  return (
    <div className="min-h-full pb-4 lg:pb-10">
      <header className="bg-white px-4 pt-6 pb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto">
          <Link to="/perfil" className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 mb-3">
            <ArrowLeft size={15} /> {t('legalPg.back')}
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              {isCancelamento ? <XCircle size={18} className="text-brand" />
                : isPrivacidade ? <ShieldCheck size={18} className="text-brand" />
                : <FileText size={18} className="text-brand" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {isCancelamento ? 'Política de Cancelamento'
                  : isPrivacidade ? t('legalPg.privacyTitle') : t('legalPg.termsTitle')}
              </h1>
              <p className="text-[12px] text-gray-400">{t('legalPg.updatedAt', { date: t('legalPg.updatedDate') })}</p>
            </div>
          </div>

          <div className="flex gap-2 mt-3 flex-wrap">
            <Link
              to="/termos"
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${!isPrivacidade && !isCancelamento ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t('legalPg.termsTitle')}
            </Link>
            <Link
              to="/privacidade"
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${isPrivacidade ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {t('legalPg.privacyTab')}
            </Link>
            <Link
              to="/cancelamento"
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${isCancelamento ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Cancelamento
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {isCancelamento ? <Cancelamento /> : isPrivacidade ? <Privacidade /> : <Termos />}
        </div>
      </main>
    </div>
  )
}
