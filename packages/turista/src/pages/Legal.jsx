import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react'

const ATUALIZACAO = '10 de junho de 2026'

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
      <div className="text-[13px] text-gray-600 leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

function Termos() {
  return (
    <div className="space-y-6">
      <Section title="1. Sobre o Giro Jeri">
        <p>
          O Giro Jeri é uma plataforma de intermediação que conecta turistas a operadores
          locais de passeios e transfers em Jericoacoara e região (Preá, Jijoca, Lagoa do
          Paraíso e arredores). Os serviços são executados por operadores e cooperativas
          parceiras devidamente cadastradas.
        </p>
      </Section>

      <Section title="2. Cadastro e conta">
        <p>
          Para reservar, é necessário criar uma conta com dados verdadeiros e atualizados.
          Você é responsável por manter a confidencialidade da sua senha e por toda
          atividade realizada na sua conta.
        </p>
      </Section>

      <Section title="3. Reservas e pagamentos">
        <p>
          Os preços exibidos incluem o serviço descrito na página da reserva. O pagamento é
          processado por gateways de pagamento parceiros (ex.: PIX). A reserva só é
          confirmada após a aprovação do pagamento, quando você recebe um código de
          confirmação.
        </p>
      </Section>

      <Section title="4. Cancelamento e reembolso">
        <p>
          Passeios: cancelamento gratuito até 24 horas antes do horário marcado.
          Transfers: cancelamento gratuito até 72 horas antes. Após esses prazos, o valor
          poderá ser retido total ou parcialmente. Cancelamentos por condições climáticas ou
          de segurança, decididos pelo operador, dão direito a remarcação ou reembolso
          integral.
        </p>
      </Section>

      <Section title="5. Conduta na comunidade">
        <p>
          Nos comentários e avaliações da aba "Descubra a Vila", não são permitidos:
          conteúdo ofensivo, discriminatório ou difamatório; spam ou propaganda não
          autorizada; informações falsas sobre estabelecimentos. O Giro Jeri pode remover
          conteúdo e suspender contas que violem estas regras.
        </p>
      </Section>

      <Section title="6. Responsabilidades">
        <p>
          O Giro Jeri intermedeia a contratação, mas a execução dos passeios e transfers é
          de responsabilidade dos operadores parceiros, que mantêm os licenciamentos e
          seguros exigidos pela legislação. Recomendações de estabelecimentos na aba
          "Descubra a Vila" são informativas e não constituem garantia de qualidade.
        </p>
      </Section>

      <Section title="7. Alterações">
        <p>
          Estes termos podem ser atualizados a qualquer momento. Mudanças relevantes serão
          comunicadas no aplicativo. O uso contínuo da plataforma após a publicação implica
          concordância com a versão vigente.
        </p>
      </Section>
    </div>
  )
}

function Privacidade() {
  return (
    <div className="space-y-6">
      <Section title="1. Dados que coletamos">
        <p>
          Coletamos os dados que você informa no cadastro e no uso da plataforma: nome,
          e-mail, telefone/WhatsApp, documento (quando necessário para a reserva), fotos de
          perfil e capa, idioma de preferência, e os dados das suas reservas (datas, locais
          de embarque, quantidade de pessoas).
        </p>
        <p>
          Com a sua autorização no navegador, usamos sua localização aproximada apenas para
          mostrar estabelecimentos e serviços próximos. Ela não é armazenada em nossos
          servidores.
        </p>
      </Section>

      <Section title="2. Para que usamos">
        <p>
          Usamos seus dados para: processar reservas e pagamentos; enviar confirmações e
          avisos sobre suas reservas (e-mail/WhatsApp); operar recursos sociais (curtidas,
          comentários e avaliações exibem seu nome e foto de perfil); melhorar a plataforma;
          e cumprir obrigações legais.
        </p>
      </Section>

      <Section title="3. Com quem compartilhamos">
        <p>
          Compartilhamos o necessário com: o operador/cooperativa que executará seu passeio
          ou transfer (nome, contato, ponto de embarque); o gateway de pagamento (dados da
          transação); e provedores de infraestrutura (hospedagem e banco de dados). Não
          vendemos seus dados a terceiros.
        </p>
      </Section>

      <Section title="4. Seus direitos (LGPD)">
        <p>
          Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode solicitar a
          qualquer momento: acesso aos seus dados, correção, exclusão da conta, portabilidade
          e informações sobre compartilhamento. Para exercer seus direitos, fale com a gente
          pelo e-mail <strong>sobrejeri@gmail.com</strong>.
        </p>
      </Section>

      <Section title="5. Armazenamento e segurança">
        <p>
          Seus dados são armazenados em servidores seguros com acesso restrito e criptografia
          em trânsito. Guardamos os dados enquanto sua conta estiver ativa ou pelo prazo
          exigido por lei (ex.: registros fiscais de reservas).
        </p>
      </Section>

      <Section title="6. Cookies e armazenamento local">
        <p>
          Usamos o armazenamento local do navegador para manter você conectado e lembrar
          preferências como idioma. Não usamos cookies de rastreamento de terceiros para
          publicidade.
        </p>
      </Section>
    </div>
  )
}

export default function Legal() {
  const { pathname } = useLocation()
  const isPrivacidade = pathname.includes('privacidade')

  return (
    <div className="min-h-full bg-[#F8F8F8] lg:bg-transparent pb-24 lg:pb-10">
      <header className="bg-white px-4 pt-6 pb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto">
          <Link to="/perfil" className="inline-flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 mb-3">
            <ArrowLeft size={15} /> Voltar
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
              {isPrivacidade ? <ShieldCheck size={18} className="text-brand" /> : <FileText size={18} className="text-brand" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-tight">
                {isPrivacidade ? 'Política de Privacidade' : 'Termos de Uso'}
              </h1>
              <p className="text-[12px] text-gray-400">Atualizado em {ATUALIZACAO}</p>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <Link
              to="/termos"
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${!isPrivacidade ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Termos de Uso
            </Link>
            <Link
              to="/privacidade"
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold ${isPrivacidade ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              Privacidade
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
